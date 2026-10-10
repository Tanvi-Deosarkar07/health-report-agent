import type { Tier } from "@/lib/types";

const TIER_META: Record<Tier, { label: string; className: string }> = {
  NORMAL: {
    label: "Normal",
    className:
      "bg-green-100 text-green-800 ring-green-300 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30",
  },
  BORDERLINE: {
    label: "Borderline",
    className:
      "bg-yellow-100 text-yellow-800 ring-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/30",
  },
  CRITICAL: {
    label: "Critical",
    className:
      "bg-red-100 text-red-800 ring-red-300 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/40",
  },
  UNKNOWN: {
    label: "Needs Review",
    className:
      "bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-zinc-500/15 dark:text-zinc-300 dark:ring-zinc-500/30",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const meta = TIER_META[tier];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export const TIER_ORDER: Tier[] = ["CRITICAL", "UNKNOWN", "BORDERLINE", "NORMAL"];
