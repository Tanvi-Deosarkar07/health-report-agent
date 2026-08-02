import { randomUUID } from "crypto";
import db from "./db";
import type { InterpretedTestValue, StoredReport, StoredReportSummary } from "./types";

interface ReportRow {
  id: string;
  session_id: string;
  uploaded_at: string;
  lab_name: string | null;
  report_date: string | null;
  overall_summary: string;
  has_urgent_findings: number;
  values_json: string;
}

interface CreateReportInput {
  sessionId: string;
  labName: string | null;
  reportDate: string | null;
  overallSummary: string;
  hasUrgentFindings: boolean;
  values: InterpretedTestValue[];
}

function rowToStoredReport(row: ReportRow): StoredReport {
  return {
    id: row.id,
    uploadedAt: row.uploaded_at,
    labName: row.lab_name,
    reportDate: row.report_date,
    overallSummary: row.overall_summary,
    hasUrgentFindings: row.has_urgent_findings === 1,
    values: JSON.parse(row.values_json) as InterpretedTestValue[],
  };
}

export function createReport(input: CreateReportInput): StoredReport {
  const id = randomUUID();
  const uploadedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO reports (id, session_id, uploaded_at, lab_name, report_date, overall_summary, has_urgent_findings, values_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.sessionId,
    uploadedAt,
    input.labName,
    input.reportDate,
    input.overallSummary,
    input.hasUrgentFindings ? 1 : 0,
    JSON.stringify(input.values)
  );

  return {
    id,
    uploadedAt,
    labName: input.labName,
    reportDate: input.reportDate,
    overallSummary: input.overallSummary,
    hasUrgentFindings: input.hasUrgentFindings,
    values: input.values,
  };
}

export function listReportsForSession(sessionId: string): StoredReportSummary[] {
  const rows = db
    .prepare(
      `SELECT id, uploaded_at, lab_name, report_date, has_urgent_findings
       FROM reports WHERE session_id = ? ORDER BY uploaded_at DESC`
    )
    .all(sessionId) as Array<
    Pick<ReportRow, "id" | "uploaded_at" | "lab_name" | "report_date" | "has_urgent_findings">
  >;

  return rows.map((r) => ({
    id: r.id,
    uploadedAt: r.uploaded_at,
    labName: r.lab_name,
    reportDate: r.report_date,
    hasUrgentFindings: r.has_urgent_findings === 1,
  }));
}

export function getMostRecentReportForSession(sessionId: string): StoredReport | null {
  const row = db
    .prepare(`SELECT * FROM reports WHERE session_id = ? ORDER BY uploaded_at DESC LIMIT 1`)
    .get(sessionId) as ReportRow | undefined;

  return row ? rowToStoredReport(row) : null;
}

export function getRecentFullReports(sessionId: string, limit: number): StoredReport[] {
  const rows = db
    .prepare(`SELECT * FROM reports WHERE session_id = ? ORDER BY uploaded_at DESC LIMIT ?`)
    .all(sessionId, limit) as ReportRow[];

  return rows.map(rowToStoredReport);
}

export function getReportForSessionById(sessionId: string, id: string): StoredReport | null {
  const row = db
    .prepare(`SELECT * FROM reports WHERE session_id = ? AND id = ?`)
    .get(sessionId, id) as ReportRow | undefined;

  return row ? rowToStoredReport(row) : null;
}

export function getReportImmediatelyBefore(sessionId: string, uploadedAt: string): StoredReport | null {
  const row = db
    .prepare(
      `SELECT * FROM reports WHERE session_id = ? AND uploaded_at < ? ORDER BY uploaded_at DESC LIMIT 1`
    )
    .get(sessionId, uploadedAt) as ReportRow | undefined;

  return row ? rowToStoredReport(row) : null;
}
