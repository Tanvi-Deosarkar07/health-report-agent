import { NextRequest, NextResponse } from "next/server";
import { chatAboutReport } from "@/lib/chatAboutReport";
import type { ChatMessage, ExplainedTest, Tier } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TIERS: Tier[] = ["NORMAL", "BORDERLINE", "CRITICAL", "UNKNOWN"];

interface ChatBody {
  results?: unknown;
  age?: unknown;
  sex?: unknown;
  labName?: unknown;
  reportDate?: unknown;
  history?: unknown;
  message?: unknown;
}

function isValidResults(value: unknown): value is ExplainedTest[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((r) => {
      const t = r as Record<string, unknown>;
      return (
        t !== null &&
        typeof t === "object" &&
        typeof t.test_name === "string" &&
        typeof t.tier === "string" &&
        (VALID_TIERS as string[]).includes(t.tier) &&
        typeof t.explanation === "string"
      );
    })
  );
}

function isValidHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m !== null &&
        typeof m === "object" &&
        ((m as Record<string, unknown>).role === "user" || (m as Record<string, unknown>).role === "assistant") &&
        typeof (m as Record<string, unknown>).content === "string"
    )
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { results, age, sex, labName, reportDate, history, message } = (body ?? {}) as ChatBody;

  if (!isValidResults(results)) {
    return NextResponse.json({ error: "'results' must be a non-empty array of analyzed test results." }, { status: 400 });
  }
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 150) {
    return NextResponse.json({ error: "'age' must be a number between 0 and 150." }, { status: 400 });
  }
  if (sex !== "M" && sex !== "F") {
    return NextResponse.json({ error: "'sex' must be 'M' or 'F'." }, { status: 400 });
  }
  if (!isValidHistory(history)) {
    return NextResponse.json({ error: "'history' must be an array of { role, content }." }, { status: 400 });
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "'message' must be a non-empty string." }, { status: 400 });
  }

  try {
    const reply = await chatAboutReport(
      {
        results,
        age,
        sex,
        labName: typeof labName === "string" ? labName : null,
        reportDate: typeof reportDate === "string" ? reportDate : null,
      },
      history,
      message
    );
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat failed:", error);
    const errMessage = error instanceof Error ? error.message : "Chat failed.";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
