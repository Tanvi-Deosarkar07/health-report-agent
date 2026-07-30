import db from "./db";

const MAX_UPLOADS_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkAndRecordUpload(sessionId: string): RateLimitResult {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM upload_events WHERE session_id = ? AND created_at > ?`)
    .get(sessionId, windowStart) as { count: number };

  if (count >= MAX_UPLOADS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  db.prepare(`INSERT INTO upload_events (session_id, created_at) VALUES (?, ?)`).run(
    sessionId,
    new Date().toISOString()
  );

  return { allowed: true, remaining: MAX_UPLOADS_PER_WINDOW - count - 1 };
}
