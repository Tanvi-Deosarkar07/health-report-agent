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
