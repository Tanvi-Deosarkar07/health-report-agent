import type { RiskTier } from "@/lib/types";

const TIER_META: Record<RiskTier, { label: string; className: string }> = {
  normal: {
    label: "Normal",
    className:
      "bg-green-100 text-green-800 ring-green-300 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30",
  },
  borderline: {
    label: "Borderline",
    className:
      "bg-yellow-100 text-yellow-800 ring-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/30",
  },
  needs_attention: {
    label: "Needs Attention",
    className:
      "bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
  },
  urgent: {
    label: "Urgent",
    className:
      "bg-red-100 text-red-800 ring-red-300 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/40",
  },
};

export function RiskBadge({ tier }: { tier: RiskTier }) {
  const meta = TIER_META[tier];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export const RISK_TIER_ORDER: RiskTier[] = ["urgent", "needs_attention", "borderline", "normal"];
