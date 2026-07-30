import { NextResponse } from "next/server";
import { compareReports } from "@/lib/compare";
import { getRecentFullReports } from "@/lib/reports";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const [current, previous] = getRecentFullReports(sessionId, 2);

  if (!current || !previous) {
    return NextResponse.json({ comparison: null });
  }

  return NextResponse.json({ comparison: compareReports(previous, current) });
}
