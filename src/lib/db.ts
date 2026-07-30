import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "app.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    lab_name TEXT,
    report_date TEXT,
    overall_summary TEXT NOT NULL,
    has_urgent_findings INTEGER NOT NULL,
    values_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_session_uploaded_at ON reports(session_id, uploaded_at);

  CREATE TABLE IF NOT EXISTS upload_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_upload_events_session_created_at ON upload_events(session_id, created_at);
`);

export default db;
