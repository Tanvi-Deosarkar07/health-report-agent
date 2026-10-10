import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { ClassifiedTest, ExplainedTest } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

// Deliberately NO "tier" field in this schema. The tier was already decided by the
// deterministic classifier and is locked; Gemini's output is merged onto the existing
// ClassifiedTest below, so even if a model tried to express an opinion about the tier,
// there is nowhere in the response shape for it to go and nothing here ever reads one.
const EXPLANATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    results: {
      type: SchemaType.ARRAY,
      description:
        "Exactly one entry per input test, in the same order as given, using the exact same test_name string as provided.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          test_name: { type: SchemaType.STRING },
          explanation: {
            type: SchemaType.STRING,
            description:
              "Plain-language explanation of what this test measures and why this result matters. Descriptive only, never diagnostic.",
          },
          remedySuggestions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "General, safe lifestyle suggestions (diet, exercise, sleep, hydration). Empty array unless tier is BORDERLINE.",
          },
          medicationInfo: {
            type: SchemaType.STRING,
            nullable: true,
            description:
              "General, non-prescriptive note on when medication is typically relevant. Never a drug name or dose. Null unless tier is BORDERLINE.",
          },
          physicianGuidance: {
            type: SchemaType.STRING,
            description: "Clear, plain statement of if/when to see a physician about this result.",
          },
        },
        required: ["test_name", "explanation", "remedySuggestions", "physicianGuidance"],
      },
    },
  },
  required: ["results"],
};

function describeTestForPrompt(t: ClassifiedTest, index: number): string {
  const range = t.range_used;
  const rangeStr = range
    ? `normal ${range.normal_min ?? "–"} to ${range.normal_max ?? "–"}, borderline up to ${range.borderline_high ?? range.borderline_low ?? "–"}`
    : "no matching reference range in our table";

  return `${index + 1}. ${t.test_name} = ${t.value}${t.unit ? ` ${t.unit}` : ""}
   FIXED TIER (already decided, do not reassess): ${t.tier}
   needs_review: ${t.needs_review}
   reference: ${rangeStr}
   classifier reason: ${t.reason}`;
}

const EXPLANATION_PROMPT_HEADER = `You are a cautious health-literacy assistant. A separate deterministic system has ALREADY classified each lab value below into a fixed tier (NORMAL, BORDERLINE, CRITICAL, or UNKNOWN). That tier is FINAL -- you are not being asked to classify or re-classify anything, and you must never imply a different tier than the one given.

For EACH test below, in the same order, return: test_name (copied exactly), explanation, remedySuggestions, medicationInfo, physicianGuidance.

How to handle each tier:
- NORMAL: brief explanation of what the test measures; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance should simply note routine care is sufficient.
- BORDERLINE: explanation of what the result means; 1-4 general, safe lifestyle remedySuggestions (diet, exercise, sleep, hydration); medicationInfo only if medication is commonly relevant for this type of result in general terms (otherwise null); physicianGuidance like "mention at your next routine visit."
- CRITICAL: explanation of what the result means and why this level is significant; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST clearly and plainly tell the person to seek prompt or immediate medical care -- do not soften this.
- UNKNOWN (needs_review is true): do NOT attempt to explain severity. explanation should briefly describe what the test generally measures (general knowledge) while being explicit that this specific result could not be confidently classified against the reference data; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST say to verify this specific value with a healthcare professional or lab, since it could not be confidently classified.

STRICT SAFETY RULES -- apply to every entry, no exceptions:
1. NEVER use diagnostic language or state/imply the person has a specific condition or disease. Use descriptive framing only.
2. NEVER name a specific medication or give any dosing/frequency information.
3. Keep every explanation and guidance string free of alarming or definitive medical claims -- this tool is informational only, not a diagnosis or a substitute for professional care.
4. Reply in plain text only inside each string -- no markdown (no asterisks, no headers, no list syntax).

Tests (tier already fixed, explain only):
`;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

interface RawExplanationItem {
  test_name?: unknown;
  explanation?: unknown;
  remedySuggestions?: unknown;
  medicationInfo?: unknown;
  physicianGuidance?: unknown;
}

function mergeExplanation(classified: ClassifiedTest, raw: RawExplanationItem | undefined): ExplainedTest {
  const isUnrestricted = classified.tier === "BORDERLINE";

  return {
    ...classified,
    explanation: typeof raw?.explanation === "string" ? raw.explanation.trim() : "",
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
        : classified.needs_review
          ? "This result could not be confidently classified against our reference data -- please verify it with a healthcare professional."
          : "Consult a physician to discuss this result.",
  };
}

export async function explainValues(classified: ClassifiedTest[]): Promise<ExplainedTest[]> {
  if (classified.length === 0) return [];

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EXPLANATION_SCHEMA,
    },
  });

  const prompt = EXPLANATION_PROMPT_HEADER + classified.map(describeTestForPrompt).join("\n\n");

  const result = await model.generateContent([{ text: prompt }]);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }

  const rawResults = (parsed as { results?: unknown })?.results;
  const rawList: RawExplanationItem[] = Array.isArray(rawResults) ? (rawResults as RawExplanationItem[]) : [];
  const byName = new Map(rawList.map((r) => [typeof r.test_name === "string" ? r.test_name : "", r]));

  return classified.map((c, i) => mergeExplanation(c, byName.get(c.test_name) ?? rawList[i]));
}
