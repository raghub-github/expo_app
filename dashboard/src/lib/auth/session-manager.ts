/**
 * Unified Control Dashboard session metadata (cookie-based).
 *
 * One session for ALL protected routes (/dashboard/*, /order/*, tickets, etc.).
 *
 * Rules:
 * 1. Rolling window: session_expires_at = last_activity_at + 48 hours
 * 2. Idle timeout: invalidate if no meaningful activity for 24 hours
 * 3. Absolute max: login_time + 7 days (never extended by activity)
 * 4. effective_expiry = MIN(last_activity + 48h, login + 7d)
 * 5. Activity updates are throttled (I/O budget) and skip background polls
 *
 * Cookies are set only on login (POST /api/auth/set-cookie). Proxy/session-status
 * update last_activity_time. Logout/expire clear them. Expired sessions must NOT
 * be re-initialized — that caused "always logged in forever" and masked real expiry.
 */

export const ROLLING_SESSION_DURATION = 48 * 60 * 60 * 1000; // 48 hours
export const MAX_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
/** @deprecated use ROLLING_SESSION_DURATION — kept for display helpers */
export const SESSION_DURATION = ROLLING_SESSION_DURATION;

/** Min gap between last_activity cookie writes (I/O budget). */
export const ACTIVITY_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

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
  reason?: "expired_inactivity" | "expired_max_duration" | "expired_rolling" | "no_session";
  timeRemaining?: number;
  daysRemaining?: number;
  idleExpiresAt?: number;
  rollingExpiresAt?: number;
  absoluteExpiresAt?: number;
  effectiveExpiresAt?: number;
}

type CookieGetter = { get: (name: string) => { value: string } | undefined };
type CookieSetter = {
  set: (
    name: string,
    value: string,
    options: {
      maxAge: number;
      path: string;
      httpOnly?: boolean;
      sameSite?: string;
      secure?: boolean;
    }
  ) => void;
};

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function sessionCookieOptions() {
  return {
    maxAge: MAX_SESSION_DURATION / 1000,
    path: "/",
    // HttpOnly: server is source of truth; clients use /api/auth/session-status.
    httpOnly: true,
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env?.NODE_ENV === "production",
  };
}

export function getSessionMetadata(cookies: CookieGetter): SessionMetadata | null {
  try {
    const sessionStart = cookies.get(SESSION_START_COOKIE)?.value;
    const lastActivity = cookies.get(LAST_ACTIVITY_COOKIE)?.value;
    const sessionId = cookies.get(SESSION_ID_COOKIE)?.value;

    if (!sessionStart || !lastActivity || !sessionId) {
      return null;
    }

    const sessionStartTime = parseInt(sessionStart, 10);
    const lastActivityTime = parseInt(lastActivity, 10);
    if (!Number.isFinite(sessionStartTime) || !Number.isFinite(lastActivityTime)) {
      return null;
    }

    return {
      sessionStartTime,
      lastActivityTime,
      sessionId,
    };
  } catch (error) {
    console.error("[session-manager] Error reading session metadata:", error);
    return null;
  }
}

/**
 * Effective expiry = min(last_activity + 48h, login + 7d).
 * Also invalid if idle (last_activity + 24h) has passed.
 */
export function checkSessionValidity(
  metadata: SessionMetadata | null,
  currentTime: number = Date.now()
): SessionValidity {
  if (!metadata) {
    return { isValid: false, reason: "no_session" };
  }

  const { sessionStartTime, lastActivityTime } = metadata;
  const idleExpiresAt = lastActivityTime + INACTIVITY_TIMEOUT;
  const rollingExpiresAt = lastActivityTime + ROLLING_SESSION_DURATION;
  const absoluteExpiresAt = sessionStartTime + MAX_SESSION_DURATION;
  const effectiveExpiresAt = Math.min(rollingExpiresAt, absoluteExpiresAt);

  if (currentTime >= idleExpiresAt) {
    return {
      isValid: false,
      reason: "expired_inactivity",
      idleExpiresAt,
      rollingExpiresAt,
      absoluteExpiresAt,
      effectiveExpiresAt,
    };
  }

  if (currentTime >= absoluteExpiresAt) {
    return {
      isValid: false,
      reason: "expired_max_duration",
      idleExpiresAt,
      rollingExpiresAt,
      absoluteExpiresAt,
      effectiveExpiresAt,
    };
  }

  if (currentTime >= rollingExpiresAt) {
    return {
      isValid: false,
      reason: "expired_rolling",
      idleExpiresAt,
      rollingExpiresAt,
      absoluteExpiresAt,
      effectiveExpiresAt,
    };
  }

  const timeRemaining = Math.max(0, effectiveExpiresAt - currentTime);
  const daysRemaining = Math.ceil((absoluteExpiresAt - currentTime) / (24 * 60 * 60 * 1000));

  return {
    isValid: true,
    timeRemaining,
    daysRemaining: Math.max(0, daysRemaining),
    idleExpiresAt,
    rollingExpiresAt,
    absoluteExpiresAt,
    effectiveExpiresAt,
  };
}

export function initializeSession(cookies: CookieSetter): SessionMetadata {
  const now = Date.now();
  const sessionId = generateSessionId();
  const metadata: SessionMetadata = {
    sessionStartTime: now,
    lastActivityTime: now,
    sessionId,
  };

  const cookieOptions = sessionCookieOptions();
  cookies.set(SESSION_START_COOKIE, now.toString(), cookieOptions);
  cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), cookieOptions);
  cookies.set(SESSION_ID_COOKIE, sessionId, cookieOptions);

  return metadata;
}

/**
 * Update last_activity_at when meaningful user activity occurs.
 * Throttled to ACTIVITY_UPDATE_THROTTLE_MS to limit Set-Cookie I/O.
 * Returns true if the cookie was written.
 */
export function updateActivity(
  cookies: CookieGetter & CookieSetter,
  currentTime: number = Date.now(),
  options?: { force?: boolean }
): boolean {
  try {
    const metadata = getSessionMetadata(cookies);
    if (!metadata) {
      return false;
    }

    if (
      !options?.force &&
      currentTime - metadata.lastActivityTime < ACTIVITY_UPDATE_THROTTLE_MS
    ) {
      return false;
    }

    cookies.set(LAST_ACTIVITY_COOKIE, currentTime.toString(), sessionCookieOptions());
    return true;
  } catch (error) {
    console.error("[session-manager] Error updating activity:", error);
    return false;
  }
}

export function expireSession(cookies: CookieSetter): void {
  const base = {
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure: typeof process !== "undefined" && process.env?.NODE_ENV === "production",
  };

  // Clear both httpOnly variants so pre-migration (readable) cookies are removed too.
  for (const httpOnly of [true, false]) {
    const expireOptions = { ...base, httpOnly };
    cookies.set(SESSION_START_COOKIE, "", expireOptions);
    cookies.set(LAST_ACTIVITY_COOKIE, "", expireOptions);
    cookies.set(SESSION_ID_COOKIE, "", expireOptions);
  }
}

/**
 * Background polls / health probes must not extend the rolling or idle window.
 */
export function isBackgroundPollRequest(pathname: string, search: string = ""): boolean {
  const path = pathname.toLowerCase();
  const qs = search.toLowerCase();

  if (path.startsWith("/api/audit/")) return true;
  if (path.startsWith("/api/public/")) return true;
  if (path.startsWith("/api/health")) return true;
  if (path.startsWith("/api/auth/session-status")) return true;
  if (path.startsWith("/api/auth/permissions")) return true;
  if (path.startsWith("/api/auth/dashboard-access")) return true;
  if (path.startsWith("/api/auth/bootstrap")) return true;
  if (path.includes("/pending-new-orders-count")) return true;
  if (path.includes("/sync-acceptance-timeout")) return true;
  if (path.includes("/review-queue-summary")) return true;
  if (qs.includes("lightweight=1")) return true;
  return false;
}

/** Page navigations + mutating APIs + non-poll GETs count as meaningful activity. */
export function isMeaningfulActivityRequest(
  pathname: string,
  method: string,
  search: string = ""
): boolean {
  if (!pathname.startsWith("/api/")) return true;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") return true;
  return !isBackgroundPollRequest(pathname, search);
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
