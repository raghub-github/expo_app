"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  installFirebasePushErrorGuard,
  onBrowserPushForeground,
  registerBrowserPushToken,
} from "@/lib/browser-push/firebase-web";
import {
  isPushPermanentlyDismissed,
  isPushRegistered,
  isPushSessionDismissed,
  markPushRegistered,
} from "@/lib/browser-push/partner-push-state";
import { PARTNER_SELECTED_STORE_CHANGED } from "@/lib/partner-selected-store";
import { PartnerBrowserPushPermissionModal } from "@/components/PartnerBrowserPushPermissionModal";
import { useMerchantSession } from "@/context/MerchantSessionContext";

/** Only prompt on authenticated partner console routes — never on /auth/*. */
function isPartnerDashboardPath(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p.startsWith("/auth")) return false;
  return p === "/partners" || p.startsWith("/partners/") || p === "/mx" || p.startsWith("/mx/");
}

type ModalMode = "permission" | "registration";

/**
 * When a merchant is on /mx or /partners (after login):
 *  1. If permission already granted → register FCM web token (with retries)
 *  2. If permission blocked / not asked → show permission modal
 *  3. If permission granted but token not registered → show registration completion modal
 *  4. Foreground toasts for campaigns while the tab is open
 */
export function PartnerBrowserPushBootstrap() {
  const pathname = usePathname() ?? "";
  const session = useMerchantSession();
  const registerAttemptRef = useRef(false);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);

  const onDashboard = isPartnerDashboardPath(pathname);
  const ready = !!session && !session.isLoading;
  const authenticated = !!session?.isAuthenticated;

  const tryRegister = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;

    const token = await registerBrowserPushToken("merchant", { retries: 4 });
    if (!token) return false;

    markPushRegistered();
    setModalMode(null);
    return true;
  }, []);

  const evaluateModalState = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (isPushSessionDismissed()) return;

    if (Notification.permission === "granted") {
      const ok = await tryRegister();
      if (ok) return;
      if (isPushSessionDismissed()) return;

      setModalMode("registration");
      return;
    }

    if (isPushPermanentlyDismissed()) return;
    setModalMode("permission");
  }, [tryRegister]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (!onDashboard || !ready || !authenticated) {
      setModalMode(null);
      return;
    }

    installFirebasePushErrorGuard();

    if (!registerAttemptRef.current) {
      registerAttemptRef.current = true;
      window.setTimeout(() => {
        void evaluateModalState();
      }, Notification.permission === "granted" ? 400 : 1200);
    }

    const onStoreChange = () => {
      if (Notification.permission !== "granted") return;
      void tryRegister();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);

    const onFocus = () => {
      if (Notification.permission !== "granted") return;
      if (isPushRegistered()) return;
      if (isPushSessionDismissed()) return;
      void evaluateModalState();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    let unsub: () => void = () => {};
    if (Notification.permission === "granted") {
      unsub = onBrowserPushForeground((payload) => {
      const title =
        payload.notification?.title ||
        (typeof payload.data?.title === "string" ? payload.data.title : null) ||
        "Gatimitra";
      const body =
        payload.notification?.body ||
        (typeof payload.data?.body === "string" ? payload.data.body : null) ||
        "";
      const deepRaw =
        (typeof payload.data?.deep_link === "string" && payload.data.deep_link) ||
        (typeof payload.data?.deepLink === "string" && payload.data.deepLink) ||
        "/mx/food-orders";
      let href = deepRaw;
      try {
        if (/^https?:\/\//i.test(deepRaw)) {
          const u = new URL(deepRaw);
          href = u.origin === window.location.origin ? `${u.pathname}${u.search}` : deepRaw;
        }
      } catch {
        href = "/mx/food-orders";
      }
      toast(title, {
        description: body || undefined,
        duration: 8000,
        action: {
          label: "Open",
          onClick: () => {
            window.location.assign(href);
          },
        },
      });
      });
    }

    return () => {
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      unsub();
    };
  }, [onDashboard, ready, authenticated, evaluateModalState, tryRegister]);

  if (!onDashboard || !ready || !authenticated || !modalMode) {
    return null;
  }

  return (
    <PartnerBrowserPushPermissionModal
      mode={modalMode}
      onClose={() => setModalMode(null)}
      onRegistered={() => {
        markPushRegistered();
        setModalMode(null);
      }}
    />
  );
}
