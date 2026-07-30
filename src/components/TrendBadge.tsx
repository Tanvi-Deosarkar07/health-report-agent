import type { Trend } from "@/lib/compare";

const TREND_META: Record<Trend, { label: string; className: string }> = {
  improving: {
    label: "Improving",
    className:
      "bg-green-100 text-green-800 ring-green-300 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30",
  },
  worsening: {
    label: "Worsening",
    className:
      "bg-red-100 text-red-800 ring-red-300 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/40",
  },
  stable: {
    label: "Stable",
    className:
      "bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-zinc-500/15 dark:text-zinc-300 dark:ring-zinc-500/30",
  },
};

export function TrendBadge({ trend }: { trend: Trend }) {
  const meta = TREND_META[trend];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
