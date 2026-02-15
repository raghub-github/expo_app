/**
 * Session Management (same as main dashboard)
 * Session valid for 24h from last activity; max 7 days from first login.
 */

export const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

const SESSION_START_COOKIE = "session_start_time";
const LAST_ACTIVITY_COOKIE = "last_activity_time";
const SESSION_ID_COOKIE = "session_id";

export interface SessionMetadata {
  sessionStartTime: number;
  lastActivityTime: number;
  sessionId: string;
}

export interface SessionValidity {
  isValid: boolean;
  reason?: "expired_inactivity" | "expired_max_duration" | "no_session";
  timeRemaining?: number;
  daysRemaining?: number;
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function getSessionMetadata(cookies: { get: (name: string) => { value: string } | undefined }): SessionMetadata | null {
  try {
    const sessionStart = cookies.get(SESSION_START_COOKIE)?.value;
    const lastActivity = cookies.get(LAST_ACTIVITY_COOKIE)?.value;
    const sessionId = cookies.get(SESSION_ID_COOKIE)?.value;
    if (!sessionStart || !lastActivity || !sessionId) return null;
    return {
      sessionStartTime: parseInt(sessionStart, 10),
      lastActivityTime: parseInt(lastActivity, 10),
      sessionId,
    };
  } catch {
    return null;
  }
}

export function checkSessionValidity(
  metadata: SessionMetadata | null,
  currentTime: number = Date.now()
): SessionValidity {
  if (!metadata) return { isValid: false, reason: "no_session" };
  const { sessionStartTime, lastActivityTime } = metadata;
  const timeSinceLastActivity = currentTime - lastActivityTime;
  if (timeSinceLastActivity > INACTIVITY_TIMEOUT)
    return { isValid: false, reason: "expired_inactivity" };
  const totalSessionDuration = currentTime - sessionStartTime;
  if (totalSessionDuration > MAX_SESSION_DURATION)
    return { isValid: false, reason: "expired_max_duration" };
  const timeRemaining = SESSION_DURATION - (currentTime - lastActivityTime);
  const daysRemaining = Math.ceil((MAX_SESSION_DURATION - totalSessionDuration) / (24 * 60 * 60 * 1000));
  return {
    isValid: true,
    timeRemaining: Math.max(0, timeRemaining),
    daysRemaining: Math.max(0, daysRemaining),
  };
}

export function initializeSession(cookies: {
  set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => void;
}): SessionMetadata {
  const now = Date.now();
  const sessionId = generateSessionId();
  const cookieOptions = {
    maxAge: MAX_SESSION_DURATION / 1000,
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env?.NODE_ENV === "production",
  };
  cookies.set(SESSION_START_COOKIE, now.toString(), cookieOptions);
  cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), cookieOptions);
  cookies.set(SESSION_ID_COOKIE, sessionId, cookieOptions);
  return { sessionStartTime: now, lastActivityTime: now, sessionId };
}

export function updateActivity(
  cookies: {
    get: (name: string) => { value: string } | undefined;
    set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => void;
  },
  currentTime: number = Date.now()
): boolean {
  const metadata = getSessionMetadata(cookies);
  if (!metadata) return false;
  const cookieOptions = {
    maxAge: MAX_SESSION_DURATION / 1000,
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env?.NODE_ENV === "production",
  };
  cookies.set(LAST_ACTIVITY_COOKIE, currentTime.toString(), cookieOptions);
  return true;
}

export function expireSession(cookies: {
  set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => void;
}): void {
  const expireOptions = {
    maxAge: 0,
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env?.NODE_ENV === "production",
  };
  cookies.set(SESSION_START_COOKIE, "", expireOptions);
  cookies.set(LAST_ACTIVITY_COOKIE, "", expireOptions);
  cookies.set(SESSION_ID_COOKIE, "", expireOptions);
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
