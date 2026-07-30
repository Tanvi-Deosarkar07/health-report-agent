import type { ComparisonResult } from "@/lib/compare";
import { TrendBadge } from "./TrendBadge";

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function ComparisonTable({ comparison }: { comparison: ComparisonResult }) {
  if (comparison.deltas.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No matching test names were found between this report and the previous one.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-foreground/10">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-foreground/[0.03] text-xs uppercase text-foreground/50">
          <tr>
            <th className="px-4 py-2 font-medium">Test</th>
            <th className="px-4 py-2 font-medium">Previous</th>
            <th className="px-4 py-2 font-medium">Current</th>
            <th className="px-4 py-2 font-medium">Change</th>
            <th className="px-4 py-2 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {comparison.deltas.map((d, i) => (
            <tr key={`${d.testName}-${i}`} className="border-t border-foreground/10">
              <td className="px-4 py-2 font-medium">{d.testName}</td>
              <td className="px-4 py-2 text-foreground/70">
                {d.previousValue}
                {d.unit ? ` ${d.unit}` : ""}
              </td>
              <td className="px-4 py-2 text-foreground/70">
                {d.currentValue}
                {d.unit ? ` ${d.unit}` : ""}
              </td>
              <td className="px-4 py-2 text-foreground/70">{formatPercent(d.percentChange)}</td>
              <td className="px-4 py-2">
                <TrendBadge trend={d.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
