import { randomUUID } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "session_id";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const sessionId = randomUUID();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
  return sessionId;
}
