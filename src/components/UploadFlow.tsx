"use client";

import { useRef, useState } from "react";
import type { ExplainedTest, RawExtractionResult } from "@/lib/types";
import { ClassifiedResultsView } from "./ClassifiedResultsView";

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const SAMPLE_REPORTS = [
  { id: "normal", label: "Mostly Normal", url: "/samples/sample-normal.pdf", filename: "sample-normal.pdf" },
  { id: "mixed", label: "Mixed Results", url: "/samples/sample-mixed.pdf", filename: "sample-mixed.pdf" },
  { id: "urgent", label: "Critical Flag Example", url: "/samples/sample-urgent.pdf", filename: "sample-urgent.pdf" },
] as const;

type Stage = "idle" | "extracting" | "analyzing" | "results" | "error";

export function UploadFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<RawExtractionResult | null>(null);
  const [results, setResults] = useState<ExplainedTest[] | null>(null);
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
    const ageNum = Number(age);
    if (!age || !Number.isFinite(ageNum) || ageNum < 0 || ageNum > 150) {
      setError("Please enter a valid age.");
      return;
    }
    if (sex !== "M" && sex !== "F") {
      setError("Please select a sex.");
      return;
    }

    setError(null);
    setStage("extracting");

    try {
      const formData = new FormData();
      formData.append("file", activeFile);

      const extractRes = await fetch("/api/pipeline/extract", { method: "POST", body: formData });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        throw new Error(extractData.error || "Failed to read the report.");
      }
      const extractionResult = extractData as RawExtractionResult;
      setExtraction(extractionResult);

      if (extractionResult.tests.length === 0) {
        throw new Error(
          "No test values could be found in this document. Please try a clearer scan or a different file."
        );
      }

      setStage("analyzing");
      const analyzeRes = await fetch("/api/pipeline/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests: extractionResult.tests, age: ageNum, sex }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || "Failed to analyze the report.");
      }
      setResults(analyzeData.results as ExplainedTest[]);
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }

  async function handleSampleClick(sample: (typeof SAMPLE_REPORTS)[number]) {
    setError(null);
    const ageNum = Number(age);
    if (!age || !Number.isFinite(ageNum) || ageNum < 0 || ageNum > 150) {
      setError("Please enter a valid age before trying a sample.");
      return;
    }
    if (sex !== "M" && sex !== "F") {
      setError("Please select a sex before trying a sample.");
      return;
    }

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
    setResults(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (stage === "results" && results) {
    return (
      <ClassifiedResultsView
        results={results}
        labName={extraction?.labName ?? null}
        reportDate={extraction?.reportDate ?? null}
        onReset={handleReset}
      />
    );
  }

  const isBusy = stage === "extracting" || stage === "analyzing";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Understand your lab report</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Upload a health/lab report and get a plain-language breakdown of each result, with guidance on what to
          do next.
        </p>
      </div>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Age</span>
          <input
            type="number"
            min={0}
            max={150}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 47"
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2 outline-none focus:border-foreground/40"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Sex</span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as "M" | "F" | "")}
            className="rounded-md border border-foreground/20 bg-transparent px-3 py-2 outline-none focus:border-foreground/40"
          >
            <option value="">Select…</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </label>
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
          : stage === "analyzing"
            ? "Classifying and explaining…"
            : "Analyze report"}
      </button>
    </div>
  );
}
