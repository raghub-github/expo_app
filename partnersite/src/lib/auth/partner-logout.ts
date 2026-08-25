import { clearPartnerStoreSelection, clearPartnerLastParentId } from "@/lib/partner-selected-store";
import { clearPushSessionDismissed } from "@/lib/browser-push/partner-push-state";

/** localStorage key — other tabs listen via `storage` and redirect to login. */
export const PARTNER_CROSS_TAB_LOGOUT_KEY = "partner_auth_logged_out_at";

/**
 * Local logout for this browser/device only.
 * Does not call supabase.auth.signOut() globally — server clears cookies + device row.
 */
export async function partnerLogoutLocal(options?: {
  redirectToLogin?: boolean;
  clearStoreSelection?: boolean;
}): Promise<void> {
  const redirectToLogin = options?.redirectToLogin !== false;
  const clearStore = options?.clearStoreSelection !== false;

  if (clearStore) {
    try {
      clearPartnerStoreSelection();
      clearPartnerLastParentId();
    } catch {
      /* ignore */
    }
  }

  try {
    clearPushSessionDismissed();
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(PARTNER_CROSS_TAB_LOGOUT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }

  try {
    const { unregisterBrowserPushToken } = await import("@/lib/browser-push/firebase-web");
    await unregisterBrowserPushToken();
  } catch {
    /* ignore — firebase may be unavailable */
  }

  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }

  if (redirectToLogin && typeof window !== "undefined") {
    window.location.href = "/auth";
  }
}
