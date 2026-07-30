"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ComparisonResult } from "@/lib/compare";
import type { ExtractionResult, InterpretationResult } from "@/lib/types";
import { ResultsView } from "./ResultsView";

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const SAMPLE_REPORTS = [
  { id: "normal", label: "Mostly Normal", url: "/samples/sample-normal.pdf", filename: "sample-normal.pdf" },
  { id: "mixed", label: "Mixed Results", url: "/samples/sample-mixed.pdf", filename: "sample-mixed.pdf" },
  { id: "urgent", label: "Urgent Flag Example", url: "/samples/sample-urgent.pdf", filename: "sample-urgent.pdf" },
] as const;

type Stage = "idle" | "extracting" | "interpreting" | "results" | "error";

export function UploadFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("Unsupported file type. Please upload a PDF, PNG, JPEG, or WEBP file.");
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError("File is too large (max 10MB).");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleAnalyze(fileOverride?: File) {
    const activeFile = fileOverride ?? file;
    if (!activeFile) {
      setError("Please choose a file first.");
      return;
    }

    setError(null);
    setStage("extracting");

    try {
      const formData = new FormData();
      formData.append("file", activeFile);

      const extractRes = await fetch("/api/extract", { method: "POST", body: formData });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        throw new Error(extractData.error || "Failed to read the report.");
      }
      const extractionResult = extractData as ExtractionResult;
      setExtraction(extractionResult);

      if (extractionResult.tests.length === 0) {
        throw new Error(
          "No test values could be found in this document. Please try a clearer scan or a different file."
        );
      }

      setStage("interpreting");
      const interpretRes = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests: extractionResult.tests }),
      });
      const interpretData = await interpretRes.json();
      if (!interpretRes.ok) {
        throw new Error(interpretData.error || "Failed to interpret the report.");
      }
      const interpretationResult = interpretData as InterpretationResult;
      setInterpretation(interpretationResult);

      setStage("results");

      // Persist this round for history/comparison. Runs after the results are already
      // shown, so a save failure doesn't block the user from seeing their report.
      try {
        const saveRes = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraction: extractionResult, interpretation: interpretationResult }),
        });
        const saveData = await saveRes.json();
        if (saveRes.ok) {
          setComparison(saveData.comparison as ComparisonResult | null);
        }
      } catch (err) {
        console.error("Failed to save report history:", err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }

  async function handleSampleClick(sample: (typeof SAMPLE_REPORTS)[number]) {
    setError(null);
    setLoadingSampleId(sample.id);
    try {
      const res = await fetch(sample.url);
      const blob = await res.blob();
      const sampleFile = new File([blob], sample.filename, { type: "application/pdf" });
      setFile(sampleFile);
      await handleAnalyze(sampleFile);
    } catch {
      setError("Failed to load the sample report.");
    } finally {
      setLoadingSampleId(null);
    }
  }

  function handleReset() {
    setStage("idle");
    setFile(null);
    setError(null);
    setExtraction(null);
    setInterpretation(null);
    setComparison(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (stage === "results" && extraction && interpretation) {
    return (
      <ResultsView
        extraction={extraction}
        interpretation={interpretation}
        comparison={comparison}
        onReset={handleReset}
      />
    );
  }

  const isBusy = stage === "extracting" || stage === "interpreting";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Understand your lab report</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Upload a health/lab report and get a plain-language breakdown of each result, with
            guidance on what to do next.
          </p>
        </div>
        <Link
          href="/history"
          className="shrink-0 rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5"
        >
          History
        </Link>
      </div>

      <label
        htmlFor="report-upload"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/20 px-6 py-12 text-center hover:border-foreground/40"
      >
        <input
          id="report-upload"
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-medium">
          {file ? file.name : "Click to choose a PDF or image of your report"}
        </span>
        <span className="text-xs text-foreground/50">PDF, PNG, JPEG, or WEBP · up to 10MB</span>
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground/60">No report handy? Try a sample instantly:</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_REPORTS.map((sample) => (
            <button
              key={sample.id}
              onClick={() => handleSampleClick(sample)}
              disabled={isBusy || loadingSampleId !== null}
              className="rounded-md border border-foreground/20 px-3 py-2 text-sm font-medium hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingSampleId === sample.id ? "Loading…" : sample.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={() => handleAnalyze()}
        disabled={!file || isBusy}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stage === "extracting"
          ? "Reading your report…"
          : stage === "interpreting"
            ? "Interpreting results…"
            : "Analyze report"}
      </button>
    </div>
  );
}
