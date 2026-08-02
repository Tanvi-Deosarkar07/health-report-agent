import { NextRequest, NextResponse } from "next/server";
import { chatAboutReport } from "@/lib/chat";
import { compareReports } from "@/lib/compare";
import { checkAndRecordAction } from "@/lib/rateLimit";
import { getReportForSessionById, getReportImmediatelyBefore } from "@/lib/reports";
import { getOrCreateSessionId } from "@/lib/session";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MAX_CHAT_MESSAGES_PER_HOUR = 20;

function isValidHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m !== null &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
  );
}

export async function POST(request: NextRequest) {
  const sessionId = await getOrCreateSessionId();
  const rateLimit = checkAndRecordAction(sessionId, "chat", MAX_CHAT_MESSAGES_PER_HOUR);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Chat message limit reached (20 per hour). Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { reportId, history, message } = (body ?? {}) as {
    reportId?: unknown;
    history?: unknown;
    message?: unknown;
  };

  if (
    typeof reportId !== "string" ||
    typeof message !== "string" ||
    message.trim().length === 0 ||
    !isValidHistory(history)
  ) {
    return NextResponse.json(
      { error: "Body must include 'reportId' (string), 'message' (non-empty string), and 'history' (array)." },
      { status: 400 }
    );
  }

  const report = getReportForSessionById(sessionId, reportId);
  if (!report) {
    return NextResponse.json({ error: "Report not found for this session." }, { status: 404 });
  }

  const previous = getReportImmediatelyBefore(sessionId, report.uploadedAt);
  const comparison = previous ? compareReports(previous, report) : null;

  try {
    const reply = await chatAboutReport(report, comparison, history, message);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat failed:", error);
    const errMessage = error instanceof Error ? error.message : "Chat failed.";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
