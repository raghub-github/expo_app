/**
 * Session Management Utilities
 * 
 * Handles session lifecycle:
 * - 24 hour session duration
 * - Activity-based renewal (renews on activity within 24h)
 * - 7 day maximum session duration
 * - Immediate expiration on logout
 */

// Constants
export const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const MAX_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
export const INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cookie names
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

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get session metadata from cookies
 */
export function getSessionMetadata(cookies: { get: (name: string) => { value: string } | undefined }): SessionMetadata | null {
  try {
    const sessionStart = cookies.get(SESSION_START_COOKIE)?.value;
    const lastActivity = cookies.get(LAST_ACTIVITY_COOKIE)?.value;
    const sessionId = cookies.get(SESSION_ID_COOKIE)?.value;

    if (!sessionStart || !lastActivity || !sessionId) {
      return null;
    }

    return {
      sessionStartTime: parseInt(sessionStart, 10),
      lastActivityTime: parseInt(lastActivity, 10),
      sessionId,
    };
  } catch (error) {
    console.error("[session-manager] Error reading session metadata:", error);
    return null;
  }
}

/**
 * Check if session is valid
 */
export function checkSessionValidity(
  metadata: SessionMetadata | null,
  currentTime: number = Date.now()
): SessionValidity {
  if (!metadata) {
    return {
      isValid: false,
      reason: "no_session",
    };
  }

  const { sessionStartTime, lastActivityTime } = metadata;

  // Check 1: Has user been inactive for more than 24 hours?
  const timeSinceLastActivity = currentTime - lastActivityTime;
  if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
    return {
      isValid: false,
      reason: "expired_inactivity",
    };
  }

  // Check 2: Has total session duration exceeded 7 days?
  const totalSessionDuration = currentTime - sessionStartTime;
  if (totalSessionDuration > MAX_SESSION_DURATION) {
    return {
      isValid: false,
      reason: "expired_max_duration",
    };
  }

  // Session is valid
  const timeRemaining = SESSION_DURATION - (currentTime - lastActivityTime);
  const daysRemaining = Math.ceil((MAX_SESSION_DURATION - totalSessionDuration) / (24 * 60 * 60 * 1000));

  return {
    isValid: true,
    timeRemaining: Math.max(0, timeRemaining),
    daysRemaining: Math.max(0, daysRemaining),
  };
}

/**
 * Initialize session (call on login)
 */
export function initializeSession(cookies: {
  set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string }) => void;
}): SessionMetadata {
  const now = Date.now();
  const sessionId = generateSessionId();

  const metadata: SessionMetadata = {
    sessionStartTime: now,
    lastActivityTime: now,
    sessionId,
  };

  // Set cookies with 7 day expiration (max session duration)
  const cookieOptions = {
    maxAge: MAX_SESSION_DURATION / 1000, // Convert to seconds
    path: "/",
    httpOnly: false, // Need to read from client-side too
    sameSite: "lax" as const,
  };

  cookies.set(SESSION_START_COOKIE, now.toString(), cookieOptions);
  cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), cookieOptions);
  cookies.set(SESSION_ID_COOKIE, sessionId, cookieOptions);

  return metadata;
}

/**
 * Update last activity time (call on each request)
 */
export function updateActivity(
  cookies: {
    get: (name: string) => { value: string } | undefined;
    set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string }) => void;
  },
  currentTime: number = Date.now()
): boolean {
  try {
    const metadata = getSessionMetadata(cookies);
    if (!metadata) {
      return false;
    }

    // Update last activity time
    const cookieOptions = {
      maxAge: MAX_SESSION_DURATION / 1000,
      path: "/",
      httpOnly: false,
      sameSite: "lax" as const,
    };

    cookies.set(LAST_ACTIVITY_COOKIE, currentTime.toString(), cookieOptions);

    return true;
  } catch (error) {
    console.error("[session-manager] Error updating activity:", error);
    return false;
  }
}

/**
 * Expire session (call on logout or expiration)
 */
export function expireSession(cookies: {
  set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string }) => void;
}): void {
  const expireOptions = {
    maxAge: 0,
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
  };

  cookies.set(SESSION_START_COOKIE, "", expireOptions);
  cookies.set(LAST_ACTIVITY_COOKIE, "", expireOptions);
  cookies.set(SESSION_ID_COOKIE, "", expireOptions);
}

/**
 * Get formatted time remaining
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
