const DISMISS_KEY = "partner_browser_push_modal_dismissed_permanently";
const SOFT_DISMISS_KEY = "partner_browser_push_modal_dismissed_at";
const REGISTERED_KEY = "partner_browser_push_token_ok";
const PENDING_KEY = "partner_browser_push_registration_pending";
const SOFT_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Cleared on full page reload / new tab — survives in-app client navigation. */
let pushModalSessionDismissed = false;

export function isPushSessionDismissed(): boolean {
  return pushModalSessionDismissed;
}

export function markPushSessionDismissed() {
  pushModalSessionDismissed = true;
}

export function clearPushSessionDismissed() {
  pushModalSessionDismissed = false;
}

export function isPushPermanentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function isPushSoftDismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(SOFT_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SOFT_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markPushSoftDismissed() {
  markPushSessionDismissed();
}

export function markPushPermanentlyDismissed() {
  markPushSessionDismissed();
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPushDismissFlags() {
  try {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(SOFT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
  clearPushSessionDismissed();
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
