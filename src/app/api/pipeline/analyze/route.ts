import { NextRequest, NextResponse } from "next/server";
import { classifyValues } from "@/lib/classifyValues";
import { explainValues } from "@/lib/explainValues";
import type { ClassifiedTestWithReportRange, RawExtractedTest } from "@/lib/types";

export const runtime = "nodejs";

interface AnalyzeBody {
  tests?: unknown;
  age?: unknown;
  sex?: unknown;
}

function isValidTests(value: unknown): value is RawExtractedTest[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (t) =>
        t !== null &&
        typeof t === "object" &&
        typeof (t as Record<string, unknown>).test_name === "string" &&
        typeof (t as Record<string, unknown>).value === "string"
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

  const { tests, age, sex } = (body ?? {}) as AnalyzeBody;

  if (!isValidTests(tests)) {
    return NextResponse.json(
      { error: "'tests' must be a non-empty array of { test_name, value, unit }." },
      { status: 400 }
    );
  }
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 150) {
    return NextResponse.json({ error: "'age' must be a number between 0 and 150." }, { status: 400 });
  }
  if (sex !== "M" && sex !== "F") {
    return NextResponse.json({ error: "'sex' must be 'M' or 'F'." }, { status: 400 });
  }

  try {
    const classified = await classifyValues(
      tests.map((t) => ({ test_name: t.test_name, value: t.value })),
      age,
      sex
    );
    const withReportRange: ClassifiedTestWithReportRange[] = classified.map((c, i) => ({
      classified: c,
      reportReferenceRange: tests[i]?.referenceRange ?? null,
    }));
    const explained = await explainValues(withReportRange);
    return NextResponse.json({ results: explained });
  } catch (error) {
    console.error("Analysis failed:", error);
    const message = error instanceof Error ? error.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
