import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { ExtractedTestValue, InterpretationResult, InterpretedTestValue, RiskTier } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

const RISK_TIERS: RiskTier[] = ["normal", "borderline", "needs_attention", "urgent"];

const INTERPRETATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    overallSummary: {
      type: SchemaType.STRING,
      description:
        "2-4 sentence plain-language, non-diagnostic summary of the report as a whole. Mention clearly if any urgent findings are present.",
    },
    values: {
      type: SchemaType.ARRAY,
      description:
        "Exactly one entry per input test, in the same order as given, using the exact same testName string as provided.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          testName: { type: SchemaType.STRING },
          riskTier: {
            type: SchemaType.STRING,
            format: "enum",
            enum: RISK_TIERS,
            description: "One of: normal, borderline, needs_attention, urgent.",
          },
          explanation: {
            type: SchemaType.STRING,
            description:
              "Plain-language explanation of what this test measures and why this specific result matters. Descriptive only, never diagnostic.",
          },
          remedySuggestions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "General, safe lifestyle suggestions (diet, exercise, sleep, hydration) relevant to this result. Must be an empty array for 'normal' and 'urgent' tiers.",
          },
          medicationInfo: {
            type: SchemaType.STRING,
            nullable: true,
            description:
              "General, non-prescriptive note on when medication is typically relevant for this kind of result. Never a drug name or dose. Null when not applicable.",
          },
          physicianGuidance: {
            type: SchemaType.STRING,
            description: "Clear, plain statement of if/when to see a physician about this result.",
          },
        },
        required: ["testName", "riskTier", "explanation", "remedySuggestions", "physicianGuidance"],
      },
    },
  },
  required: ["overallSummary", "values"],
};

const INTERPRETATION_PROMPT = `You are a cautious health-literacy assistant helping a layperson understand their own lab report. You are NOT a doctor and must never behave like one.

You will be given a JSON list of test results (testName, value, unit, referenceRange) already extracted from a real lab report.

For EACH test, in the same order, return one entry with: testName (copied exactly), riskTier, explanation, remedySuggestions, medicationInfo, physicianGuidance.

How to classify riskTier:
- "normal": value falls within (or very close to) the stated reference range.
- "borderline": value is mildly outside the reference range, in a range commonly influenced by lifestyle factors.
- "needs_attention": value is moderately outside the reference range, or in a range clinicians would typically want followed up on.
- "urgent": value is severely abnormal, at a level generally considered to need prompt or immediate medical attention.
- If the reference range is missing, or the result is qualitative/ambiguous, default to "needs_attention" rather than "normal" — do not guess optimistically.

STRICT SAFETY RULES — apply to every single entry, no exceptions:
1. NEVER use diagnostic language or state/imply the person has a specific condition or disease (no "you have X"). Use descriptive framing only, e.g. "this level is sometimes associated with...".
2. NEVER name a specific medication or give any dosing/frequency information.
3. remedySuggestions must only cover general, safe lifestyle areas: diet, exercise, sleep, hydration. Do not prescribe or get clinically specific.
4. For "urgent" tier: remedySuggestions MUST be an empty array, medicationInfo MUST be null, and physicianGuidance MUST clearly and plainly tell the person to seek prompt or immediate medical care (e.g. urgent care, ER, or calling their doctor right away) — do not soften this.
5. For "normal" tier: remedySuggestions MUST be an empty array and medicationInfo MUST be null; physicianGuidance should simply note routine care is sufficient.
6. For "borderline" and "needs_attention": provide 1-4 remedySuggestions, and medicationInfo only if medication is commonly relevant for this type of result in general terms (otherwise null), plus a clear physicianGuidance statement (e.g. "mention this at your next routine visit" vs "schedule a visit soon").
7. Keep every explanation and guidance string free of alarming or definitive medical claims — this tool is informational only, not a diagnosis or a substitute for professional care.

Also produce an overallSummary describing the report as a whole in the same cautious, non-diagnostic style, explicitly noting if anything urgent was found.`;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

interface RawInterpretedValue {
  testName?: unknown;
  riskTier?: unknown;
  explanation?: unknown;
  remedySuggestions?: unknown;
  medicationInfo?: unknown;
  physicianGuidance?: unknown;
}

function isRiskTier(value: unknown): value is RiskTier {
  return typeof value === "string" && (RISK_TIERS as string[]).includes(value);
}

function normalize(raw: unknown, originalTests: ExtractedTestValue[]): InterpretationResult {
  const parsed = raw as { overallSummary?: unknown; values?: unknown } | null | undefined;
  const rawValues: RawInterpretedValue[] = Array.isArray(parsed?.values) ? (parsed!.values as RawInterpretedValue[]) : [];
  const byName = new Map(originalTests.map((t) => [t.testName, t]));

  const values: InterpretedTestValue[] = rawValues.map((item, i) => {
    const original =
      (typeof item.testName === "string" ? byName.get(item.testName) : undefined) ?? originalTests[i];

    const riskTier: RiskTier = isRiskTier(item.riskTier) ? item.riskTier : "needs_attention";
    const isUnrestricted = riskTier === "borderline" || riskTier === "needs_attention";

    return {
      testName: original?.testName ?? (typeof item.testName === "string" ? item.testName : "Unknown test"),
      value: original?.value ?? "",
      unit: original?.unit ?? null,
      referenceRange: original?.referenceRange ?? null,
      riskTier,
      explanation: typeof item.explanation === "string" ? item.explanation.trim() : "",
      remedySuggestions:
        isUnrestricted && Array.isArray(item.remedySuggestions)
          ? item.remedySuggestions.filter((s): s is string => typeof s === "string").map((s) => s.trim())
          : [],
      medicationInfo:
        isUnrestricted && typeof item.medicationInfo === "string" && item.medicationInfo.trim().length > 0
          ? item.medicationInfo.trim()
          : null,
      physicianGuidance:
        typeof item.physicianGuidance === "string" && item.physicianGuidance.trim().length > 0
          ? item.physicianGuidance.trim()
          : "Consult a physician to discuss this result.",
    };
  });

  return {
    overallSummary: typeof parsed?.overallSummary === "string" ? parsed.overallSummary.trim() : "",
    values,
    hasUrgentFindings: values.some((v) => v.riskTier === "urgent"),
  };
}

export async function interpretReportData(tests: ExtractedTestValue[]): Promise<InterpretationResult> {
  if (tests.length === 0) {
    return { overallSummary: "No test values were found to interpret.", values: [], hasUrgentFindings: false };
  }

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: INTERPRETATION_SCHEMA,
    },
  });

  const inputPayload = JSON.stringify(
    tests.map((t) => ({ testName: t.testName, value: t.value, unit: t.unit, referenceRange: t.referenceRange }))
  );

  const result = await model.generateContent([
    { text: INTERPRETATION_PROMPT },
    { text: `Test results (JSON array, ${tests.length} entries):\n${inputPayload}` },
  ]);

  const text = result.response.text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }

  return normalize(parsedJson, tests);
}
