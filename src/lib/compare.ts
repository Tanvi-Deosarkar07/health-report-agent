import type { RiskTier, StoredReport } from "./types";

const TIER_RANK: Record<RiskTier, number> = {
  normal: 0,
  borderline: 1,
  needs_attention: 2,
  urgent: 3,
};

export type Trend = "improving" | "worsening" | "stable";

export interface ComparisonDelta {
  testName: string;
  unit: string | null;
  previousValue: string;
  currentValue: string;
  previousRiskTier: RiskTier;
  currentRiskTier: RiskTier;
  percentChange: number | null;
  trend: Trend;
}

export interface ComparisonResult {
  previousReportId: string;
  previousUploadedAt: string;
  currentReportId: string;
  currentUploadedAt: string;
  deltas: ComparisonDelta[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function computePercentChange(previous: string, current: string): number | null {
  const prevNum = Number.parseFloat(previous);
  const currNum = Number.parseFloat(current);
  if (!Number.isFinite(prevNum) || !Number.isFinite(currNum) || prevNum === 0) return null;
  return ((currNum - prevNum) / Math.abs(prevNum)) * 100;
}

// Whether a value moved "better" or "worse" depends on which direction is healthy for that
// specific test (e.g. higher HDL is good, higher LDL is bad) — raw numeric direction can't tell
// you that. Risk tier already encodes that medical context, so trend is derived from tier
// movement rather than the sign of the numeric change.
function computeTrend(previousTier: RiskTier, currentTier: RiskTier): Trend {
  const prevRank = TIER_RANK[previousTier];
  const currRank = TIER_RANK[currentTier];
  if (currRank < prevRank) return "improving";
  if (currRank > prevRank) return "worsening";
  return "stable";
}

export function compareReports(previous: StoredReport, current: StoredReport): ComparisonResult {
  const previousByName = new Map(previous.values.map((v) => [normalizeName(v.testName), v]));

  const deltas: ComparisonDelta[] = [];
  for (const currentValue of current.values) {
    const previousValue = previousByName.get(normalizeName(currentValue.testName));
    if (!previousValue) continue;

    deltas.push({
      testName: currentValue.testName,
      unit: currentValue.unit,
      previousValue: previousValue.value,
      currentValue: currentValue.value,
      previousRiskTier: previousValue.riskTier,
      currentRiskTier: currentValue.riskTier,
      percentChange: computePercentChange(previousValue.value, currentValue.value),
      trend: computeTrend(previousValue.riskTier, currentValue.riskTier),
    });
  }

  return {
    previousReportId: previous.id,
    previousUploadedAt: previous.uploadedAt,
    currentReportId: current.id,
    currentUploadedAt: current.uploadedAt,
    deltas,
  };
}
