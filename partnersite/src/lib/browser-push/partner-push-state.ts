const DISMISS_KEY = "partner_browser_push_modal_dismissed_permanently";
const SOFT_DISMISS_KEY = "partner_browser_push_modal_dismissed_at";
const REGISTERED_KEY = "partner_browser_push_token_ok";
const PENDING_KEY = "partner_browser_push_registration_pending";

/** Tab session — survives refresh & in-app navigation; cleared on logout / new login entry. */
const SESSION_DISMISS_USER_KEY = "partner_browser_push_modal_session_dismissed_user";

/** In-memory fast path (same document lifecycle). */
let pushModalSessionDismissed = false;

/**
 * True when the merchant dismissed the push modal for this login session.
 * Scoped to userId when provided so account switches are handled correctly.
 */
export function isPushSessionDismissed(userId?: string | null): boolean {
  if (pushModalSessionDismissed) return true;
  if (typeof window === "undefined") return false;
  try {
    const stored = sessionStorage.getItem(SESSION_DISMISS_USER_KEY);
    if (!stored) return false;
    if (userId) return stored === userId;
    return stored.length > 0;
  } catch {
    return false;
  }
}

/** Persist skip for the current authenticated session (Not Now / close). */
export function markPushSessionDismissed(userId?: string | null) {
  pushModalSessionDismissed = true;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_DISMISS_USER_KEY, userId?.trim() || "1");
  } catch {
    /* ignore */
  }
}

/** Call on logout and when starting a fresh login flow. */
export function clearPushSessionDismissed() {
  pushModalSessionDismissed = false;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_DISMISS_USER_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Legacy permanent flag — no longer used for modal skip. */
export function isPushPermanentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** @deprecated Legacy soft dismiss — use markPushSessionDismissed instead. */
export function isPushSoftDismissedRecently(): boolean {
  return isPushSessionDismissed();
}

/** Not Now / skip — session only, not localStorage. */
export function markPushSoftDismissed(userId?: string | null) {
  markPushSessionDismissed(userId);
}

/** @deprecated Use markPushSessionDismissed — no permanent skip. */
export function markPushPermanentlyDismissed(userId?: string | null) {
  markPushSessionDismissed(userId);
}

export function clearPushDismissFlags() {
  clearPushSessionDismissed();
  try {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(SOFT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

export function markPushRegistered() {
  try {
    localStorage.setItem(REGISTERED_KEY, "1");
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function markPushRegistrationPending() {
  try {
    localStorage.setItem(PENDING_KEY, "1");
    localStorage.removeItem(REGISTERED_KEY);
  } catch {
    /* ignore */
  }
}

export function isPushRegistered(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(REGISTERED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isPushRegistrationPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPushRegistrationState() {
  try {
    localStorage.removeItem(REGISTERED_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
