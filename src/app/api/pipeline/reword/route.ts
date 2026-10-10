import { NextRequest, NextResponse } from "next/server";
import { rewordValues, type ReadingLevel } from "@/lib/rewordValues";
import type { ExplainedTest, Tier } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TIERS: Tier[] = ["NORMAL", "BORDERLINE", "CRITICAL", "UNKNOWN"];
const VALID_LEVELS: ReadingLevel[] = ["standard", "simple"];

interface RewordBody {
  results?: unknown;
  readingLevel?: unknown;
  language?: unknown;
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

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { results, readingLevel, language } = (body ?? {}) as RewordBody;

  if (!isValidResults(results)) {
    return NextResponse.json({ error: "'results' must be a non-empty array of analyzed test results." }, { status: 400 });
  }
  if (typeof readingLevel !== "string" || !(VALID_LEVELS as string[]).includes(readingLevel)) {
    return NextResponse.json({ error: "'readingLevel' must be 'standard' or 'simple'." }, { status: 400 });
  }
  if (typeof language !== "string" || language.trim().length === 0) {
    return NextResponse.json({ error: "'language' must be a non-empty string." }, { status: 400 });
  }

  try {
    const reworded = await rewordValues(results, { readingLevel: readingLevel as ReadingLevel, language });
    return NextResponse.json({ results: reworded });
  } catch (error) {
    console.error("Reword failed:", error);
    const message = error instanceof Error ? error.message : "Reword failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
