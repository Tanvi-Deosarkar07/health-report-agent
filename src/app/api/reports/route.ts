import { NextRequest, NextResponse } from "next/server";
import { compareReports } from "@/lib/compare";
import { createReport, getMostRecentReportForSession, listReportsForSession } from "@/lib/reports";
import { getOrCreateSessionId } from "@/lib/session";
import type { ExtractionResult, InterpretationResult } from "@/lib/types";

export const runtime = "nodejs";

interface CreateReportBody {
  extraction?: ExtractionResult;
  interpretation?: InterpretationResult;
}

function isValidBody(
  body: unknown
): body is { extraction: ExtractionResult; interpretation: InterpretationResult } {
  const b = body as CreateReportBody | null;
  return (
    !!b &&
    !!b.extraction &&
    !!b.interpretation &&
    typeof b.interpretation.overallSummary === "string" &&
    Array.isArray(b.interpretation.values)
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body with 'extraction' and 'interpretation'." },
      { status: 400 }
    );
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Body must include 'extraction' and 'interpretation' objects." },
      { status: 400 }
    );
  }

  const sessionId = await getOrCreateSessionId();
  const previous = getMostRecentReportForSession(sessionId);

  const report = createReport({
    sessionId,
    labName: body.extraction.labName,
    reportDate: body.extraction.reportDate,
    overallSummary: body.interpretation.overallSummary,
    hasUrgentFindings: body.interpretation.hasUrgentFindings,
    values: body.interpretation.values,
  });

  const comparison = previous ? compareReports(previous, report) : null;

  return NextResponse.json({ report, comparison });
}

export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const reports = listReportsForSession(sessionId);
  return NextResponse.json({ reports });
}
