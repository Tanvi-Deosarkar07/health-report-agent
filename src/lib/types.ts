export interface ExtractedTestValue {
  testName: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
}

export interface ExtractionResult {
  labName: string | null;
  reportDate: string | null;
  tests: ExtractedTestValue[];
}

export type RiskTier = "normal" | "borderline" | "needs_attention" | "urgent";

export interface InterpretedTestValue extends ExtractedTestValue {
  riskTier: RiskTier;
  explanation: string;
  remedySuggestions: string[];
  medicationInfo: string | null;
  physicianGuidance: string;
}

export interface InterpretationResult {
  overallSummary: string;
  values: InterpretedTestValue[];
  hasUrgentFindings: boolean;
}

export interface StoredReportSummary {
  id: string;
  uploadedAt: string;
  labName: string | null;
  reportDate: string | null;
  hasUrgentFindings: boolean;
}

export interface StoredReport extends StoredReportSummary {
  overallSummary: string;
  values: InterpretedTestValue[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Deterministic-classifier pipeline (extraction -> classifier.py -> explanation) ---
// Kept separate from the types above: that pipeline (Gemini-decides-the-tier, SQLite
// history/comparison, chat) is disconnected from the active UI for now, not deleted.

export interface RawExtractedTest {
  test_name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
}

export interface PatientInfoFromDocument {
  age: number | null;
  sex: "M" | "F" | null;
}

export interface RawExtractionResult {
  labName: string | null;
  reportDate: string | null;
  tests: RawExtractedTest[];
  patientFromDocument: PatientInfoFromDocument | null;
}

export type Tier = "NORMAL" | "BORDERLINE" | "CRITICAL" | "UNKNOWN";

export interface RangeUsed {
  sex: string;
  age_min: number;
  age_max: number;
  normal_min: number | null;
  normal_max: number | null;
  borderline_low: number | null;
  borderline_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  source?: string;
}

export interface ClassifiedTest {
  test_name: string;
  value: number | string;
  unit?: string | null;
  tier: Tier;
  direction?: string;
  range_used: RangeUsed | null;
  reason: string;
  needs_review: boolean;
}

export interface ExplainedTest extends ClassifiedTest {
  explanation: string;
  remedySuggestions: string[];
  medicationInfo: string | null;
  physicianGuidance: string;
  // True when tier came from Gemini judging the report's own printed reference range
  // (because classifier.py didn't recognize the test at all), not the verified classifier table.
  isTentative: boolean;
  // The report's own printed range, only populated when isTentative is true (range_used stays
  // null in that case, since classifier.py found nothing for this test).
  reportReferenceRange: string | null;
}

// Input to explainValues: a classified test plus the report's own printed reference range
// (only ever consulted when the test wasn't recognized by classifier.py at all).
export interface ClassifiedTestWithReportRange {
  classified: ClassifiedTest;
  reportReferenceRange: string | null;
}
