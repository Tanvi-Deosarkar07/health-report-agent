"use client";

import { useState } from "react";
import type { ReadingLevel } from "@/lib/rewordValues";
import type { ExplainedTest, RangeUsed } from "@/lib/types";
import { AskReportChat } from "./AskReportChat";
import { TierBadge, TIER_ORDER } from "./TierBadge";

interface ClassifiedResultsViewProps {
  results: ExplainedTest[];
  labName: string | null;
  reportDate: string | null;
  age: number;
  sex: "M" | "F";
  onReset: () => void;
}

const LANGUAGES = ["English", "Spanish", "Hindi", "French", "Chinese (Simplified)", "Arabic"];

function formatReferenceRange(r: RangeUsed | null): string {
  if (!r) return "not available for this test";
  if (r.normal_min !== null && r.normal_max !== null) return `${r.normal_min}–${r.normal_max}`;
  if (r.normal_max !== null) return `< ${r.normal_max}`;
  if (r.normal_min !== null) return `> ${r.normal_min}`;
  return "not available for this test";
}

export function ClassifiedResultsView({
  results,
  labName,
  reportDate,
  age,
  sex,
  onReset,
}: ClassifiedResultsViewProps) {
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("standard");
  const [language, setLanguage] = useState("English");
  const [displayResults, setDisplayResults] = useState<ExplainedTest[]>(results);
  const [isRewording, setIsRewording] = useState(false);
  const [rewordError, setRewordError] = useState<string | null>(null);

  async function applyReword(level: ReadingLevel, lang: string) {
    setReadingLevel(level);
    setLanguage(lang);
    setRewordError(null);

    if (level === "standard" && lang === "English") {
      setDisplayResults(results);
      return;
    }

    setIsRewording(true);
    try {
      const res = await fetch("/api/pipeline/reword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, readingLevel: level, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reword results.");
      }
      setDisplayResults(data.results as ExplainedTest[]);
    } catch (err) {
      setRewordError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsRewording(false);
    }
  }

  const sorted = [...displayResults].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const hasCritical = displayResults.some((r) => r.tier === "CRITICAL");
  const hasNeedsReview = displayResults.some((r) => r.needs_review);
  const hasTentative = displayResults.some((r) => r.isTentative);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your Results</h1>
          {(labName || reportDate) && (
            <p className="mt-1 text-sm text-foreground/60">{[labName, reportDate].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button
          onClick={onReset}
          className="shrink-0 rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
        >
          Analyze another report
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
        <span className="text-sm font-medium text-foreground/70">Reading level:</span>
        <div className="flex overflow-hidden rounded-md border border-foreground/20">
          <button
            onClick={() => applyReword("standard", language)}
            disabled={isRewording}
            className={`px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${
              readingLevel === "standard" ? "bg-foreground text-background" : "hover:bg-foreground/5"
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => applyReword("simple", language)}
            disabled={isRewording}
            className={`px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${
              readingLevel === "simple" ? "bg-foreground text-background" : "hover:bg-foreground/5"
            }`}
          >
            Simple
          </button>
        </div>

        <span className="ml-2 text-sm font-medium text-foreground/70">Language:</span>
        <select
          value={language}
          onChange={(e) => applyReword(readingLevel, e.target.value)}
          disabled={isRewording}
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:cursor-not-allowed"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {isRewording && <span className="text-sm text-foreground/50">Rewording…</span>}
      </div>

      {rewordError && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {rewordError}
        </p>
      )}

      {hasCritical && (
        <div className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          One or more results are flagged Critical. Please seek prompt medical care — see the details below.
        </div>
      )}

      {hasNeedsReview && (
        <div className="rounded-lg border border-zinc-400 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-500/40 dark:bg-zinc-500/10 dark:text-zinc-300">
          One or more results couldn&apos;t be read or classified confidently — please verify those values below.
        </div>
      )}

      {hasTentative && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          One or more results are marked Tentative — classified using the range printed on your
          report rather than our verified reference data, since we don&apos;t have rules for those
          specific tests yet.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sorted.map((r, i) => (
          <div key={`${r.test_name}-${i}`} className="rounded-lg border border-foreground/10 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{r.test_name}</h2>
              <div className="flex items-center gap-2">
                {r.isTentative && (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30">
                    Tentative
                  </span>
                )}
                <TierBadge tier={r.tier} />
              </div>
            </div>

            <p className="mt-1 text-sm text-foreground/70">
              Result: <span className="font-medium text-foreground">{r.value}</span>
              {r.unit ? ` ${r.unit}` : ""}
              {" (reference: "}
              {r.isTentative ? `${r.reportReferenceRange} — from your report, not our verified data` : formatReferenceRange(r.range_used)}
              {")"}
            </p>

            {r.needs_review && (
              <p className="mt-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-300">
                Couldn&apos;t read or classify this result confidently ({r.reason}) — please verify it directly
                against your original report or with a professional.
              </p>
            )}

            <p className="mt-3 text-sm leading-relaxed">{r.explanation}</p>

            {r.remedySuggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">Lifestyle suggestions</p>
                <ul className="mt-1 list-inside list-disc text-sm text-foreground/80">
                  {r.remedySuggestions.map((s, si) => (
                    <li key={si}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {r.medicationInfo && (
              <p className="mt-3 text-sm text-foreground/80">
                <span className="font-medium">About medication: </span>
                {r.medicationInfo}
              </p>
            )}

            <p className="mt-3 text-sm font-medium text-foreground/90">{r.physicianGuidance}</p>
          </div>
        ))}
      </div>

      <AskReportChat
        results={displayResults}
        age={age}
        sex={sex}
        labName={labName}
        reportDate={reportDate}
        readingLevel={readingLevel}
        language={language}
      />
    </div>
  );
}
