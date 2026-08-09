const DISMISS_KEY = "partner_browser_push_modal_dismissed_permanently";
const SOFT_DISMISS_KEY = "partner_browser_push_modal_dismissed_at";
const REGISTERED_KEY = "partner_browser_push_token_ok";
const PENDING_KEY = "partner_browser_push_registration_pending";
const LAST_FCM_TOKEN_KEY = "partner_browser_push_fcm_token";
const PERMISSION_SYNC_KEY = "partner_browser_push_last_permission_sync";

/** Tab session — survives refresh & in-app navigation; cleared on logout / new login entry. */
const SESSION_DISMISS_USER_KEY = "partner_browser_push_modal_session_dismissed_user";
const SESSION_LAST_PERMISSION_KEY = "partner_browser_push_session_last_permission";

/** In-memory fast path (same document lifecycle). */
let pushModalSessionDismissed = false;
let sessionLastPushPermission: NotificationPermission | null = null;

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

function readSessionLastPushPermissionFromStorage(): NotificationPermission | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_LAST_PERMISSION_KEY);
    if (v === "granted" || v === "denied" || v === "default") return v;
    return null;
  } catch {
    return null;
  }
}

function writeSessionLastPushPermission(permission: NotificationPermission) {
  sessionLastPushPermission = permission;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_LAST_PERMISSION_KEY, permission);
  } catch {
    /* ignore */
  }
}

/**
 * Track observed browser permission for this login session.
 * Returns true when permission transitions to denied mid-session (Allowed/Default → Blocked).
 */
export function notePushPermissionObserved(permission: NotificationPermission): boolean {
  const prev =
    sessionLastPushPermission ?? readSessionLastPushPermissionFromStorage();
  writeSessionLastPushPermission(permission);
  return Boolean(prev && prev !== "denied" && permission === "denied");
}

/** Call on logout and when starting a fresh login flow. */
export function clearPushSessionDismissed() {
  pushModalSessionDismissed = false;
  sessionLastPushPermission = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_DISMISS_USER_KEY);
    sessionStorage.removeItem(SESSION_LAST_PERMISSION_KEY);
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

export function savePushFcmToken(token: string) {
  try {
    localStorage.setItem(LAST_FCM_TOKEN_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function readPushFcmToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(LAST_FCM_TOKEN_KEY)?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function clearPushFcmToken() {
  try {
    localStorage.removeItem(LAST_FCM_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function readLastSyncedPushPermission(): NotificationPermission | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(PERMISSION_SYNC_KEY);
    if (v === "granted" || v === "denied" || v === "default") return v;
    return null;
  } catch {
    return null;
  }
}

export function writeLastSyncedPushPermission(permission: NotificationPermission) {
  try {
    localStorage.setItem(PERMISSION_SYNC_KEY, permission);
  } catch {
    /* ignore */
  }
}

export function markPushRegistered(token?: string) {
  try {
    localStorage.setItem(REGISTERED_KEY, "1");
    localStorage.removeItem(PENDING_KEY);
    if (token?.trim()) {
      localStorage.setItem(LAST_FCM_TOKEN_KEY, token.trim());
    }
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

export function clearPushRegistrationPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
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

/** Clear all local push registration markers (keeps last FCM token for backend deactivation). */
export function markPushLocallyDisabled() {
  clearPushRegistrationState();
  try {
    localStorage.removeItem(REGISTERED_KEY);
  } catch {
    /* ignore */
  }
}
