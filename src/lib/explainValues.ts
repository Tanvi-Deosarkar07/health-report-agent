import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { ClassifiedTest, ClassifiedTestWithReportRange, ExplainedTest, Tier } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

const TENTATIVE_TIERS: Tier[] = ["NORMAL", "BORDERLINE", "CRITICAL"];

// Eligible only when classifier.py has zero data for this test (not merely a missing
// age/sex row) AND the report itself printed a reference range to fall back on.
function isEligibleForTentative(c: ClassifiedTest, reportReferenceRange: string | null): boolean {
  return c.tier === "UNKNOWN" && c.reason === "test not in reference table" && reportReferenceRange !== null;
}

// "tentativeTier" exists ONLY so eligible (unrecognized-test) items can get a real status
// instead of a bare "needs review" -- Gemini judges it from the report's own printed range,
// not our verified table. For every other item the prompt instructs this to stay null, and
// mergeExplanation() below ignores it outright unless the item was independently flagged
// eligible server-side first. A classifier-backed tier can never be touched by this field.
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
          tentativeTier: {
            type: SchemaType.STRING,
            nullable: true,
            format: "enum",
            enum: [...TENTATIVE_TIERS],
            description:
              "ONLY for items explicitly marked [TENTATIVE CLASSIFICATION NEEDED] below -- your best-effort NORMAL/BORDERLINE/CRITICAL judgment using the report's own printed range. Null for every other item.",
          },
          explanation: {
            type: SchemaType.STRING,
            description:
              "Plain-language explanation of what this test measures and why this result matters. Descriptive only, never diagnostic.",
          },
          remedySuggestions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "General, safe lifestyle suggestions (diet, exercise, sleep, hydration). Empty array unless the effective tier is BORDERLINE.",
          },
          medicationInfo: {
            type: SchemaType.STRING,
            nullable: true,
            description:
              "General, non-prescriptive note on when medication is typically relevant. Never a drug name or dose. Null unless the effective tier is BORDERLINE.",
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

function describeTestForPrompt(item: ClassifiedTestWithReportRange, index: number): string {
  const { classified: t, reportReferenceRange } = item;

  if (isEligibleForTentative(t, reportReferenceRange)) {
    return `${index + 1}. ${t.test_name} = ${t.value}${t.unit ? ` ${t.unit}` : ""}
   [TENTATIVE CLASSIFICATION NEEDED] This test is not in our verified reference table.
   The report itself printed this reference range: "${reportReferenceRange}"
   Judge NORMAL / BORDERLINE / CRITICAL yourself from the value vs. that printed range, using
   the same severity meaning used elsewhere: BORDERLINE = outside normal but not immediately
   dangerous; CRITICAL = outside a safe range, prompt medical attention warranted.
   Set tentativeTier to your judgment. Your explanation and physicianGuidance MUST make clear
   this classification is tentative -- based on the report's own printed range, not our
   verified reference data.`;
  }

  const range = t.range_used;
  const rangeStr = range
    ? `normal ${range.normal_min ?? "–"} to ${range.normal_max ?? "–"}, borderline up to ${range.borderline_high ?? range.borderline_low ?? "–"}`
    : "no matching reference range in our table";

  return `${index + 1}. ${t.test_name} = ${t.value}${t.unit ? ` ${t.unit}` : ""}
   FIXED TIER (already decided, do not reassess): ${t.tier}
   needs_review: ${t.needs_review}
   reference: ${rangeStr}
   classifier reason: ${t.reason}
   tentativeTier: must be null for this item.`;
}

const EXPLANATION_PROMPT_HEADER = `You are a cautious health-literacy assistant. A separate deterministic system has ALREADY classified most lab values below into a fixed tier (NORMAL, BORDERLINE, CRITICAL, or UNKNOWN). That tier is FINAL -- you are not being asked to classify or re-classify anything for those items, and you must never imply a different tier than the one given. A small number of items may instead be marked [TENTATIVE CLASSIFICATION NEEDED]; for those specific items only, you provide a tentativeTier as instructed on that item.

For EACH test below, in the same order, return: test_name (copied exactly), tentativeTier, explanation, remedySuggestions, medicationInfo, physicianGuidance.

How to handle each EFFECTIVE tier (the fixed tier, or your tentativeTier judgment where asked):
- NORMAL: brief explanation of what the test measures; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance should simply note routine care is sufficient.
- BORDERLINE: explanation of what the result means; 1-4 general, safe lifestyle remedySuggestions (diet, exercise, sleep, hydration); medicationInfo only if medication is commonly relevant for this type of result in general terms (otherwise null); physicianGuidance like "mention at your next routine visit."
- CRITICAL: explanation of what the result means and why this level is significant; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST clearly and plainly tell the person to seek prompt or immediate medical care -- do not soften this.
- UNKNOWN (needs_review is true, and NOT marked [TENTATIVE CLASSIFICATION NEEDED]): do NOT attempt to explain severity. explanation should briefly describe what the test generally measures (general knowledge) while being explicit that this specific result could not be confidently classified against the reference data; remedySuggestions MUST be empty array; medicationInfo MUST be null; physicianGuidance MUST say to verify this specific value with a healthcare professional or lab, since it could not be confidently classified.

STRICT SAFETY RULES -- apply to every entry, no exceptions:
1. NEVER use diagnostic language or state/imply the person has a specific condition or disease. Use descriptive framing only.
2. NEVER name a specific medication or give any dosing/frequency information.
3. Keep every explanation and guidance string free of alarming or definitive medical claims -- this tool is informational only, not a diagnosis or a substitute for professional care.
4. Reply in plain text only inside each string -- no markdown (no asterisks, no headers, no list syntax).

Tests:
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
  tentativeTier?: unknown;
  explanation?: unknown;
  remedySuggestions?: unknown;
  medicationInfo?: unknown;
  physicianGuidance?: unknown;
}

function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TENTATIVE_TIERS as string[]).includes(value);
}

function mergeExplanation(item: ClassifiedTestWithReportRange, raw: RawExplanationItem | undefined): ExplainedTest {
  const { classified, reportReferenceRange } = item;
  const eligible = isEligibleForTentative(classified, reportReferenceRange);

  // Only ever trust a tentativeTier for an item WE already flagged eligible server-side --
  // never for a classifier-backed item, even if the model included one anyway.
  const useTentative = eligible && isTier(raw?.tentativeTier);

  const effectiveTier: Tier = useTentative ? (raw!.tentativeTier as Tier) : classified.tier;
  const isUnrestricted = effectiveTier === "BORDERLINE";

  return {
    ...classified,
    tier: effectiveTier,
    needs_review: useTentative ? false : classified.needs_review,
    isTentative: useTentative,
    reportReferenceRange: useTentative ? reportReferenceRange : null,
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

export async function explainValues(items: ClassifiedTestWithReportRange[]): Promise<ExplainedTest[]> {
  if (items.length === 0) return [];

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EXPLANATION_SCHEMA,
    },
  });

  const prompt = EXPLANATION_PROMPT_HEADER + items.map(describeTestForPrompt).join("\n\n");

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

  return items.map((item, i) => mergeExplanation(item, byName.get(item.classified.test_name) ?? rawList[i]));
}
