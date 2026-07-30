import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { ExtractionResult } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

const EXTRACTION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    labName: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Name of the lab or clinic that issued the report, if visible.",
    },
    reportDate: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Date the report/sample was collected or issued, if visible. Keep the format as printed.",
    },
    tests: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          testName: {
            type: SchemaType.STRING,
            description: "The name of the lab test exactly as printed (e.g. 'Hemoglobin', 'LDL Cholesterol').",
          },
          value: {
            type: SchemaType.STRING,
            description: "The measured value exactly as printed, as a string (may be numeric or qualitative).",
          },
          unit: {
            type: SchemaType.STRING,
            nullable: true,
            description: "The unit of measurement, if present (e.g. 'mg/dL', 'g/dL').",
          },
          referenceRange: {
            type: SchemaType.STRING,
            nullable: true,
            description: "The lab's stated normal/reference range, exactly as printed, if present.",
          },
        },
        required: ["testName", "value"],
      },
    },
  },
  required: ["tests"],
};

const EXTRACTION_PROMPT = `You are a precise data-extraction assistant for medical lab reports.

You will be given an image or PDF of a lab/health report. Extract every individual test result you can find into structured data.

Rules:
- Extract each distinct test as its own entry, even if there are many.
- Copy testName, value, unit, and referenceRange EXACTLY as printed. Do not translate, normalize, round, or reinterpret values.
- If a unit or reference range is not printed for a test, use null for that field instead of guessing.
- Do not invent, infer, or hallucinate any test that is not clearly present in the document.
- Do not compute, diagnose, or comment on whether values are normal or abnormal — only extract what is printed.
- Lab reports vary widely in layout (tables, grouped panels, multi-column). Read carefully across the whole document.
- If the document is not a lab/health report at all, return an empty tests array.
- Return labName and reportDate if visible on the document, otherwise null.`;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function normalize(raw: unknown): ExtractionResult {
  const parsed = raw as Partial<ExtractionResult> | null | undefined;
  const tests = Array.isArray(parsed?.tests) ? parsed!.tests : [];

  return {
    labName: parsed?.labName ?? null,
    reportDate: parsed?.reportDate ?? null,
    tests: tests
      .filter((t) => t && typeof t.testName === "string" && t.testName.trim().length > 0)
      .map((t) => ({
        testName: t.testName.trim(),
        value: String(t.value ?? "").trim(),
        unit: t.unit ? String(t.unit).trim() : null,
        referenceRange: t.referenceRange ? String(t.referenceRange).trim() : null,
      })),
  };
}

export async function extractReportData(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
    },
  });

  const result = await model.generateContent([
    { text: EXTRACTION_PROMPT },
    { inlineData: { data: fileBuffer.toString("base64"), mimeType } },
  ]);

  const text = result.response.text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }

  return normalize(parsedJson);
}
