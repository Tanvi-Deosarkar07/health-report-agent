/**
 * Deterministic lab-value classifier -- a faithful TypeScript mirror of classifier.py
 * (kept in the repo root as the canonical reference, with its own smoke test).
 *
 * Ported rather than subprocess-invoked so this runs in a standard Vercel Node.js
 * serverless function with no Python runtime available. Logic must stay in sync with
 * classifier.py by hand -- any change there (including the borderline-vs-critical bug
 * fix already applied) needs to be mirrored here too.
 *
 * NOTE ON DATA: reference_ranges.json is ILLUSTRATIVE PLACEHOLDER data for a portfolio
 * demo, not clinically verified. See reference_ranges.json's own _meta block.
 */

import referenceRangesData from "../../reference_ranges.json";
import type { RangeUsed, Tier } from "./types";

interface RawRange {
  sex: string;
  age_min: number;
  age_max: number;
  normal_min: number | null;
  normal_max: number | null;
  borderline_low: number | null;
  borderline_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  source?: string;
}

interface RawTest {
  test_name: string;
  aliases?: string[];
  unit?: string;
  direction: string;
  ranges: RawRange[];
}

interface ClassifyResult {
  test_name: string;
  value: number | string;
  unit?: string | null;
  tier: Tier;
  direction?: string;
  range_used: RangeUsed | null;
  reason: string;
  needs_review: boolean;
}

const data = referenceRangesData as { tests: RawTest[] };

const testsByKey = new Map<string, RawTest>();
const aliasMap = new Map<string, string>();

for (const t of data.tests) {
  const key = t.test_name.trim().toLowerCase();
  testsByKey.set(key, t);
  aliasMap.set(key, key);
  for (const alias of t.aliases ?? []) {
    aliasMap.set(alias.trim().toLowerCase(), key);
  }
}

function resolve(testName: string): string | undefined {
  return aliasMap.get(testName.trim().toLowerCase());
}

/** Picks the range row matching this patient's sex and age bracket. Prefers a
 * sex-specific row; falls back to "ANY". Returns null if nothing matches. */
function pickRange(test: RawTest, age: number | null, sex: "M" | "F" | null): RawRange | null {
  const sexNorm = (sex ?? "ANY").trim().toUpperCase();
  let best: { score: number; range: RawRange } | null = null;

  for (const r of test.ranges) {
    const rSex = r.sex.trim().toUpperCase();
    const sexOk = rSex === sexNorm || rSex === "ANY";
    const ageOk = age === null ? true : r.age_min <= age && age <= r.age_max;
    if (sexOk && ageOk) {
      const score = rSex === sexNorm && rSex !== "ANY" ? 1 : 0;
      if (!best || score > best.score) {
        best = { score, range: r };
      }
    }
  }

  return best ? best.range : null;
}

/** Core comparison logic. Order matters: check CRITICAL first, then BORDERLINE, then NORMAL.
 *
 * CRITICAL triggers once a value crosses the borderline cutoff (borderline_low/high) --
 * that is the actual BORDERLINE/CRITICAL boundary in this 3-tier model. critical_low/high
 * are also checked so a row that sets them tighter than the borderline cutoff still works. */
function applyRules(v: number, r: RawRange, direction: string): [Tier, string] {
  const cl = r.critical_low;
  const ch = r.critical_high;
  const bl = r.borderline_low;
  const bh = r.borderline_high;
  const nl = r.normal_min;
  const nh = r.normal_max;

  if (direction === "two_sided" || direction === "high_bad") {
    if (bh !== null && v > bh) return ["CRITICAL", `value > borderline_high (${bh})`];
    if (ch !== null && v >= ch) return ["CRITICAL", `value >= critical_high (${ch})`];
  }
  if (direction === "two_sided" || direction === "low_bad") {
    if (bl !== null && v < bl) return ["CRITICAL", `value < borderline_low (${bl})`];
    if (cl !== null && v <= cl) return ["CRITICAL", `value <= critical_low (${cl})`];
  }

  if ((direction === "two_sided" || direction === "high_bad") && nh !== null && v > nh) {
    return ["BORDERLINE", `value > normal_max (${nh})`];
  }
  if ((direction === "two_sided" || direction === "low_bad") && nl !== null && v < nl) {
    return ["BORDERLINE", `value < normal_min (${nl})`];
  }

  return ["NORMAL", "within normal range"];
}

export function classify(
  testName: string,
  value: string,
  age: number | null,
  sex: "M" | "F" | null
): ClassifyResult {
  const key = resolve(testName);
  if (!key) {
    return {
      test_name: testName,
      value,
      tier: "UNKNOWN",
      reason: "test not in reference table",
      needs_review: true,
      range_used: null,
    };
  }

  const test = testsByKey.get(key)!;
  const r = pickRange(test, age, sex);
  if (!r) {
    return {
      test_name: test.test_name,
      value,
      tier: "UNKNOWN",
      reason: "no matching age/sex range",
      needs_review: true,
      range_used: null,
    };
  }

  const v = Number(value);
  if (!Number.isFinite(v)) {
    return {
      test_name: test.test_name,
      value,
      tier: "UNKNOWN",
      reason: "value not numeric",
      needs_review: true,
      range_used: r,
    };
  }

  const [tier, reason] = applyRules(v, r, test.direction);

  return {
    test_name: test.test_name,
    value: v,
    unit: test.unit ?? null,
    tier,
    direction: test.direction,
    range_used: r,
    reason,
    needs_review: tier === "UNKNOWN",
  };
}
