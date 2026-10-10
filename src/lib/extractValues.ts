import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { RawExtractionResult } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

const EXTRACTION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    labName: { type: SchemaType.STRING, nullable: true },
    reportDate: { type: SchemaType.STRING, nullable: true },
    patientFromDocument: {
      type: SchemaType.OBJECT,
      nullable: true,
      description: "Patient age/sex if visible on the document. Informational only.",
      properties: {
        age: { type: SchemaType.NUMBER, nullable: true },
        sex: { type: SchemaType.STRING, nullable: true, format: "enum", enum: ["M", "F"] },
      },
    },
    tests: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          test_name: {
            type: SchemaType.STRING,
            description: "The test name exactly as printed (e.g. 'Hemoglobin', 'LDL Cholesterol').",
          },
          value: {
            type: SchemaType.STRING,
            description: "The measured value exactly as printed, as a string.",
          },
          unit: { type: SchemaType.STRING, nullable: true },
        },
        required: ["test_name", "value"],
      },
    },
  },
  required: ["tests"],
};

const EXTRACTION_PROMPT = `You are a precise data-extraction assistant for medical lab reports.

Your ONLY job is reading values off the document. Do not interpret, classify, or judge any result.

Rules:
- Extract each distinct test as its own entry: test_name, value, unit.
- Copy test_name and value EXACTLY as printed. Do not translate, normalize, round, or reinterpret.
- Do not invent, infer, or hallucinate any test not clearly present in the document.
- Do not include a reference range -- that is handled separately. Only test_name, value, unit.
- If visible, extract the patient's age (as a number) and sex (M or F) into patientFromDocument.
  This is informational only -- if not visible or unclear, use null.
- If the document is not a lab/health report at all, return an empty tests array.
- Return labName and reportDate if visible, otherwise null.`;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function normalize(raw: unknown): RawExtractionResult {
  const parsed = raw as Partial<RawExtractionResult> | null | undefined;
  const tests = Array.isArray(parsed?.tests) ? parsed!.tests : [];
  const patient = parsed?.patientFromDocument as { age?: unknown; sex?: unknown } | null | undefined;

  return {
    labName: parsed?.labName ?? null,
    reportDate: parsed?.reportDate ?? null,
    patientFromDocument: patient
      ? {
          age: typeof patient.age === "number" ? patient.age : null,
          sex: patient.sex === "M" || patient.sex === "F" ? patient.sex : null,
        }
      : null,
    tests: tests
      .filter((t) => t && typeof t.test_name === "string" && t.test_name.trim().length > 0)
      .map((t) => ({
        test_name: t.test_name.trim(),
        value: String(t.value ?? "").trim(),
        unit: t.unit ? String(t.unit).trim() : null,
      })),
  };
}

export async function extractValues(fileBuffer: Buffer, mimeType: string): Promise<RawExtractionResult> {
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
