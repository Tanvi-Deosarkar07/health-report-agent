import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ComparisonResult } from "./compare";
import type { ChatMessage, StoredReport } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function buildSystemInstruction(report: StoredReport, comparison: ComparisonResult | null): string {
  const valuesSummary = report.values
    .map(
      (v) =>
        `- ${v.testName}: ${v.value}${v.unit ? ` ${v.unit}` : ""} (reference: ${v.referenceRange ?? "not provided"}) — tier: ${v.riskTier}. ${v.explanation}`
    )
    .join("\n");

  const comparisonSummary = comparison
    ? comparison.deltas
        .map(
          (d) =>
            `- ${d.testName}: was ${d.previousValue}${d.unit ? ` ${d.unit}` : ""}, now ${d.currentValue}${d.unit ? ` ${d.unit}` : ""} (${d.trend})`
        )
        .join("\n")
    : "No previous report on file for this session to compare against.";

  return `You are a cautious health-literacy assistant answering follow-up questions about ONE specific lab report you have already summarized for this user. You are NOT a doctor and must never behave like one.

REPORT CONTEXT (the only data you may reason about):
Lab: ${report.labName ?? "unknown"}
Date: ${report.reportDate ?? "unknown"}
Overall summary already given to the user: ${report.overallSummary}

Test results:
${valuesSummary}

Comparison to the user's previous report:
${comparisonSummary}

STRICT SAFETY RULES — apply to every reply, no exceptions:
1. Only discuss the specific results listed above. If asked about a test, symptom, or topic not covered by this report, say plainly that you don't have that information in this report and suggest asking a physician.
2. NEVER use diagnostic language or state/imply the person has a specific condition or disease. Use descriptive framing only (e.g. "this pattern is sometimes associated with...").
3. NEVER name a specific medication or give any dosing/frequency information.
4. If the question touches on any "urgent" tier result, clearly reiterate that prompt or immediate medical care is warranted — do not soften this.
5. Keep replies conversational and concise (a few sentences, occasionally a short list) — this is a chat, not a report.
6. Do not invent new test values, ranges, or facts not present in the report context above.
7. This is informational only, not medical advice or a diagnosis — reflect that framing naturally when relevant, without repeating a disclaimer in every single message.
8. Reply in plain text only — no markdown (no asterisks, no headers, no bullet/numbered list syntax). Use plain sentences and, if needed, simple line breaks.`;
}

export async function chatAboutReport(
  report: StoredReport,
  comparison: ComparisonResult | null,
  history: ChatMessage[],
  message: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemInstruction(report, comparison),
  });

  const contents = [
    ...history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const result = await model.generateContent({ contents });
  return result.response.text().trim();
}
