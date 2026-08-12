const REGISTERED_KEY = "partner_browser_push_token_ok";
const PENDING_KEY = "partner_browser_push_registration_pending";
const LAST_FCM_TOKEN_KEY = "partner_browser_push_fcm_token";
const PERMISSION_SYNC_KEY = "partner_browser_push_last_permission_sync";

/** Legacy modal dismiss keys — cleared on login/logout; never used for permission decisions. */
const LEGACY_DISMISS_KEYS = [
  "partner_browser_push_modal_dismissed_permanently",
  "partner_browser_push_modal_dismissed_at",
  "partner_browser_push_modal_session_dismissed_user",
  "partner_browser_push_session_last_permission",
] as const;

/** @deprecated Modal removed — always false. Browser Notification.permission is authoritative. */
export function isPushSessionDismissed(_userId?: string | null): boolean {
  return false;
}

/** @deprecated Modal removed — no-op. */
export function markPushSessionDismissed(_userId?: string | null) {
  /* intentionally empty */
}

/** @deprecated Modal removed — always false. */
export function notePushPermissionObserved(_permission: NotificationPermission): boolean {
  return false;
}

/** Clear legacy modal/session flags on logout and fresh login. */
export function clearPushSessionDismissed() {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_DISMISS_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Legacy permanent flag — always false. */
export function isPushPermanentlyDismissed(): boolean {
  return false;
}

/** @deprecated Use markPushSessionDismissed — no-op. */
export function isPushSoftDismissedRecently(): boolean {
  return false;
}

/** @deprecated Modal removed — no-op. */
export function markPushSoftDismissed(_userId?: string | null) {
  /* intentionally empty */
}

/** @deprecated Modal removed — no-op. */
export function markPushPermanentlyDismissed(_userId?: string | null) {
  /* intentionally empty */
}

export function clearPushDismissFlags() {
  clearPushSessionDismissed();
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

/** Clear local registration markers (keeps last FCM token for backend deactivation). */
export function markPushLocallyDisabled() {
  clearPushRegistrationState();
}
