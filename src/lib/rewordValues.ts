import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { ExplainedTest } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

export type ReadingLevel = "standard" | "simple";

export interface RewordOptions {
  readingLevel: ReadingLevel;
  language: string; // e.g. "English", "Spanish", "Hindi"
}

// Tier is already final by the time reword runs (whether classifier-decided or tentative) --
// this schema has no tier field at all, same invariant as the main explanation stage.
const REWORD_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    results: {
      type: SchemaType.ARRAY,
      description: "Exactly one entry per input test, same order, same test_name (kept in English for matching).",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          test_name: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          remedySuggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          medicationInfo: { type: SchemaType.STRING, nullable: true },
          physicianGuidance: { type: SchemaType.STRING },
        },
        required: ["test_name", "explanation", "remedySuggestions", "physicianGuidance"],
      },
    },
  },
  required: ["results"],
};

function describeForPrompt(r: ExplainedTest, index: number): string {
  const tentativeNote = r.isTentative
    ? ` (TENTATIVE -- say so explicitly: classified from ${r.reportReferenceRange ? "the report's own printed range" : "general medical knowledge, since no reference range was available"}, not verified reference data)`
    : "";
  return `${index + 1}. ${r.test_name} = ${r.value}${r.unit ? ` ${r.unit}` : ""}
   TIER (fixed, do not reassess): ${r.tier}${tentativeNote}
   needs_review: ${r.needs_review}
   current explanation (re-express, don't just translate word-for-word -- rewrite naturally): ${r.explanation}`;
}

function buildPrompt(results: ExplainedTest[], options: RewordOptions): string {
  const levelInstruction =
    options.readingLevel === "simple"
      ? `Use very simple, plain language -- short sentences, everyday words, no medical jargon. Explain any necessary term in plain terms. Write as if explaining to someone with no medical background and limited health literacy.`
      : `Use clear, standard plain-language explanations (the normal style for this tool).`;

  const languageInstruction =
    options.language.toLowerCase() === "english"
      ? ""
      : `Write explanation, remedySuggestions, medicationInfo, and physicianGuidance ENTIRELY in ${options.language}. Keep test_name exactly as given, in its original form (do not translate test_name -- it's used for matching).`;

  return `You are re-expressing already-written lab result explanations for a different audience. The TIER for each test below is FIXED and final -- you are not classifying anything, only rewriting the explanatory text.

${levelInstruction}
${languageInstruction}

For EACH test below, in the same order, return: test_name (unchanged, in English), explanation, remedySuggestions, medicationInfo, physicianGuidance.

Per-tier content rules (unchanged from before, just re-expressed in the requested style/language):
- NORMAL: brief explanation of what the test measures; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance should simply note routine care is sufficient.
- BORDERLINE: explanation of what the result means; 1-4 general, safe lifestyle remedySuggestions; medicationInfo only if generally relevant (otherwise null); physicianGuidance like "mention at your next routine visit."
- CRITICAL: explanation of why this level is significant; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST clearly and plainly say to seek prompt or immediate medical care -- do not soften this, even in simple language.
- UNKNOWN (needs_review true, not tentative): explanation briefly describes what the test generally measures, while being clear this specific result couldn't be confidently classified; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST say to verify this value with a healthcare professional.
- TENTATIVE items: make the tentative, not-fully-verified nature of the classification clear in the explanation and/or physicianGuidance, regardless of reading level or language.

STRICT SAFETY RULES -- apply to every entry, no exceptions, regardless of reading level or language:
1. NEVER use diagnostic language or state/imply the person has a specific condition or disease.
2. NEVER name a specific medication or give any dosing/frequency information.
3. Keep every string free of alarming or definitive medical claims -- informational only.
4. Plain text only -- no markdown (no asterisks, no headers, no list syntax).

Tests:
${results.map(describeForPrompt).join("\n\n")}`;
}

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

interface RawRewordItem {
  test_name?: unknown;
  explanation?: unknown;
  remedySuggestions?: unknown;
  medicationInfo?: unknown;
  physicianGuidance?: unknown;
}

function mergeReword(original: ExplainedTest, raw: RawRewordItem | undefined): ExplainedTest {
  const isUnrestricted = original.tier === "BORDERLINE";

  return {
    ...original,
    explanation: typeof raw?.explanation === "string" ? raw.explanation.trim() : original.explanation,
    remedySuggestions:
      isUnrestricted && Array.isArray(raw?.remedySuggestions)
        ? raw!.remedySuggestions.filter((s): s is string => typeof s === "string").map((s) => s.trim())
        : [],
    medicationInfo:
      isUnrestricted && typeof raw?.medicationInfo === "string" && raw.medicationInfo.trim().length > 0
        ? raw.medicationInfo.trim()
        : null,
    physicianGuidance:
      typeof raw?.physicianGuidance === "string" && raw.physicianGuidance.trim().length > 0
        ? raw.physicianGuidance.trim()
        : original.physicianGuidance,
  };
}

export async function rewordValues(results: ExplainedTest[], options: RewordOptions): Promise<ExplainedTest[]> {
  if (results.length === 0) return [];

  // Nothing to do -- standard English is already what the original explanation is in.
  if (options.readingLevel === "standard" && options.language.toLowerCase() === "english") {
    return results;
  }

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: REWORD_SCHEMA,
    },
  });

  const result = await model.generateContent([{ text: buildPrompt(results, options) }]);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }

  const rawResults = (parsed as { results?: unknown })?.results;
  const rawList: RawRewordItem[] = Array.isArray(rawResults) ? (rawResults as RawRewordItem[]) : [];
  const byName = new Map(rawList.map((r) => [typeof r.test_name === "string" ? r.test_name : "", r]));

  return results.map((r, i) => mergeReword(r, byName.get(r.test_name) ?? rawList[i]));
}
