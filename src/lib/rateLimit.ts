import db from "./db";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkAndRecordAction(sessionId: string, action: string, maxPerWindow: number): RateLimitResult {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limit_events WHERE session_id = ? AND action = ? AND created_at > ?`
    )
    .get(sessionId, action, windowStart) as { count: number };

  if (count >= maxPerWindow) {
    return { allowed: false, remaining: 0 };
  }

  db.prepare(`INSERT INTO rate_limit_events (session_id, action, created_at) VALUES (?, ?, ?)`).run(
    sessionId,
    action,
    new Date().toISOString()
  );

  return { allowed: true, remaining: maxPerWindow - count - 1 };
}
