import { NextRequest, NextResponse } from "next/server";
import { interpretReportData } from "@/lib/interpret";
import type { ExtractedTestValue } from "@/lib/types";

export const runtime = "nodejs";

function isExtractedTestValueArray(value: unknown): value is ExtractedTestValue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (t) =>
        t !== null &&
        typeof t === "object" &&
        typeof (t as Record<string, unknown>).testName === "string" &&
        typeof (t as Record<string, unknown>).value === "string"
    )
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with a 'tests' array." }, { status: 400 });
  }

  const tests = (body as { tests?: unknown } | null)?.tests;
  if (!isExtractedTestValueArray(tests)) {
    return NextResponse.json(
      { error: "'tests' must be an array of { testName, value, unit, referenceRange }." },
      { status: 400 }
    );
  }

  try {
    const result = await interpretReportData(tests);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Interpretation failed:", error);
    const message = error instanceof Error ? error.message : "Interpretation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
