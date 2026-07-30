import Link from "next/link";
import type { ComparisonResult } from "@/lib/compare";
import type { ExtractionResult, InterpretationResult } from "@/lib/types";
import { ComparisonTable } from "./ComparisonTable";
import { RiskBadge, RISK_TIER_ORDER } from "./RiskBadge";

interface ResultsViewProps {
  extraction: ExtractionResult;
  interpretation: InterpretationResult;
  comparison: ComparisonResult | null;
  onReset: () => void;
}

export function ResultsView({ extraction, interpretation, comparison, onReset }: ResultsViewProps) {
  const sortedValues = [...interpretation.values].sort(
    (a, b) => RISK_TIER_ORDER.indexOf(a.riskTier) - RISK_TIER_ORDER.indexOf(b.riskTier)
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your Results</h1>
          {(extraction.labName || extraction.reportDate) && (
            <p className="mt-1 text-sm text-foreground/60">
              {[extraction.labName, extraction.reportDate].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/history"
            className="rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            View history
          </Link>
          <button
            onClick={onReset}
            className="rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            Analyze another report
          </button>
        </div>
      </div>

      {interpretation.hasUrgentFindings && (
        <div className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          One or more results are flagged Urgent. Please seek prompt medical care — see the details
          below.
        </div>
      )}

      {interpretation.overallSummary && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm leading-relaxed">
          {interpretation.overallSummary}
        </div>
      )}

      {comparison && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Compared to your previous report</h2>
          <ComparisonTable comparison={comparison} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sortedValues.map((v, i) => (
          <div
            key={`${v.testName}-${i}`}
            className="rounded-lg border border-foreground/10 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{v.testName}</h2>
              <RiskBadge tier={v.riskTier} />
            </div>

            <p className="mt-1 text-sm text-foreground/70">
              Result: <span className="font-medium text-foreground">{v.value}</span>
              {v.unit ? ` ${v.unit}` : ""}
              {v.referenceRange ? ` (reference: ${v.referenceRange})` : ""}
            </p>

            <p className="mt-3 text-sm leading-relaxed">{v.explanation}</p>

            {v.remedySuggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">Lifestyle suggestions</p>
                <ul className="mt-1 list-inside list-disc text-sm text-foreground/80">
                  {v.remedySuggestions.map((s, si) => (
                    <li key={si}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {v.medicationInfo && (
              <p className="mt-3 text-sm text-foreground/80">
                <span className="font-medium">About medication: </span>
                {v.medicationInfo}
              </p>
            )}

            <p className="mt-3 text-sm font-medium text-foreground/90">{v.physicianGuidance}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
