"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ComparisonTable } from "@/components/ComparisonTable";
import type { ComparisonResult } from "@/lib/compare";
import type { StoredReportSummary } from "@/lib/types";

export default function HistoryPage() {
  const [reports, setReports] = useState<StoredReportSummary[] | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [reportsRes, compareRes] = await Promise.all([
          fetch("/api/reports"),
          fetch("/api/reports/compare"),
        ]);
        const reportsData = await reportsRes.json();
        const compareData = await compareRes.json();
        if (!reportsRes.ok || !compareRes.ok) {
          throw new Error("Failed to load report history.");
        }
        setReports(reportsData.reports as StoredReportSummary[]);
        setComparison(compareData.comparison as ComparisonResult | null);
      } catch {
        setError("Failed to load report history.");
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Report History</h1>
        <Link
          href="/"
          className="rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
        >
          Upload a report
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && reports === null && <p className="text-sm text-foreground/60">Loading…</p>}

      {reports !== null && reports.length === 0 && (
        <p className="text-sm text-foreground/60">
          No reports yet. <Link href="/" className="underline">Upload one</Link> to get started.
        </p>
      )}

      {reports !== null && reports.length === 1 && (
        <p className="text-sm text-foreground/60">
          You have one report on file. Upload a second report to see trends over time.
        </p>
      )}

      {comparison && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Latest trend</h2>
          <p className="text-sm text-foreground/60">
            Comparing your most recent report to the one before it.
          </p>
          <ComparisonTable comparison={comparison} />
        </div>
      )}

      {reports !== null && reports.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">All rounds</h2>
          <div className="flex flex-col divide-y divide-foreground/10 rounded-lg border border-foreground/10">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{r.labName || "Unknown lab"}</p>
                  <p className="text-foreground/60">{r.reportDate || new Date(r.uploadedAt).toLocaleDateString()}</p>
                </div>
                {r.hasUrgentFindings && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-300 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/40">
                    Urgent flagged
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
