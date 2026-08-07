import { clearPartnerStoreSelection } from "@/lib/partner-selected-store";

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
    } catch {
      /* ignore */
    }
  }

  try {
    localStorage.setItem(PARTNER_CROSS_TAB_LOGOUT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }

  try {
    // Best-effort: drop this browser's FCM web token from backend before cookies clear.
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    const { getApps } = await import("firebase/app");
    if (getApps().length > 0 && (await isSupported())) {
      const messaging = getMessaging();
      const token = await getToken(messaging).catch(() => null);
      if (token) {
        await fetch("/api/notifications/browser-tokens", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => undefined);
      }
    }
  } catch {
    /* ignore — firebase may be unavailable */
  }

  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }

  if (redirectToLogin && typeof window !== "undefined") {
    window.location.href = "/auth/login";
  }
}
