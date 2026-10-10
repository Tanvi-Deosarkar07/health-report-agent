import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage, ExplainedTest } from "./types";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenerativeAI(apiKey);
}

interface ReportContext {
  results: ExplainedTest[];
  age: number;
  sex: "M" | "F";
  labName: string | null;
  reportDate: string | null;
}

function describeResultForPrompt(r: ExplainedTest): string {
  const tentativeNote = r.isTentative
    ? " (TENTATIVE -- classified from the report's own printed range, not our verified data)"
    : "";
  return `- ${r.test_name}: ${r.value}${r.unit ? ` ${r.unit}` : ""} -- tier: ${r.tier}${tentativeNote}. ${r.explanation}`;
}

function buildSystemInstruction(ctx: ReportContext): string {
  const resultsSummary = ctx.results.map(describeResultForPrompt).join("\n");

  return `You are a cautious health-literacy assistant answering follow-up questions about ONE specific lab report you have already summarized for this user (age ${ctx.age}, sex ${ctx.sex}). You are NOT a doctor and must never behave like one.

REPORT CONTEXT (the only data you may reason about):
Lab: ${ctx.labName ?? "unknown"}
Date: ${ctx.reportDate ?? "unknown"}

Test results, each already assigned a tier by a separate deterministic system (except items marked TENTATIVE, which were judged from the report's own printed range):
${resultsSummary}

STRICT SAFETY RULES -- apply to every reply, no exceptions:
1. Only discuss the specific results listed above. If asked about a test, symptom, or topic not covered by this report, say plainly that you don't have that information in this report and suggest asking a physician.
2. NEVER use diagnostic language or state/imply the person has a specific condition or disease. Use descriptive framing only.
3. NEVER name a specific medication or give any dosing/frequency information.
4. If the question touches on any CRITICAL result, clearly reiterate that prompt or immediate medical care is warranted -- do not soften this.
5. If the question touches on a TENTATIVE result, make clear that classification is tentative (based on the report's own printed range, not verified reference data) rather than stating it with full confidence.
6. Keep replies conversational and concise (a few sentences, occasionally a short list) -- this is a chat, not a report.
7. Do not invent new test values, ranges, or facts not present in the report context above.
8. This is informational only, not medical advice or a diagnosis -- reflect that framing naturally when relevant, without repeating a disclaimer in every single message.
9. Reply in plain text only -- no markdown (no asterisks, no headers, no list syntax).`;
}

export async function chatAboutReport(
  ctx: ReportContext,
  history: ChatMessage[],
  message: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemInstruction(ctx),
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
