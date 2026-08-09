"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  getEffectiveNotificationPermission,
  onBrowserPushForeground,
  registerBrowserPushToken,
  syncBrowserPushPermissionWithBackend,
} from "@/lib/browser-push/firebase-web";
import {
  clearPushRegistrationPending,
  isPushSessionDismissed,
  markPushRegistered,
  markPushRegistrationPending,
  markPushSessionDismissed,
  notePushPermissionObserved,
} from "@/lib/browser-push/partner-push-state";
import {
  getPartnerPushStatus,
  invalidatePartnerPushBackendCache,
  type PartnerPushStatus,
} from "@/lib/browser-push/partner-push-status";
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
 *  1. Sync browser permission with backend (deactivate tokens when blocked)
 *  2. If permission already granted → register FCM web token (with retries)
 *  3. If permission blocked / not asked → show permission modal
 *  4. If permission granted but token not registered → show registration completion modal
 *  5. Foreground toasts for campaigns while the tab is open and permission is granted
 */
export function PartnerBrowserPushBootstrap() {
  const pathname = usePathname() ?? "";
  const session = useMerchantSession();
  const registerAttemptRef = useRef(false);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [pushStatus, setPushStatus] = useState<PartnerPushStatus | null>(null);

  const onDashboard = isPartnerDashboardPath(pathname);
  const ready = !!session && !session.isLoading;
  const authenticated = !!session?.isAuthenticated;
  const merchantUserId = session?.user?.id ?? null;

  const tryRegister = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;

    await syncBrowserPushPermissionWithBackend();
    const permission = await getEffectiveNotificationPermission();
    if (permission !== "granted") return false;

    markPushRegistrationPending();
    const token = await registerBrowserPushToken("merchant", { retries: 4 });
    if (!token) {
      clearPushRegistrationPending();
      invalidatePartnerPushBackendCache();
      const snap = await getPartnerPushStatus();
      setPushStatus(snap.status);
      return false;
    }

    invalidatePartnerPushBackendCache();
    markPushRegistered(token);
    setModalMode(null);
    const snap = await getPartnerPushStatus();
    setPushStatus(snap.status);
    return true;
  }, []);

  const evaluateModalState = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (isPushSessionDismissed(merchantUserId)) {
      setModalMode(null);
      return;
    }

    await syncBrowserPushPermissionWithBackend();

    const permission = await getEffectiveNotificationPermission();
    if (notePushPermissionObserved(permission)) {
      markPushSessionDismissed(merchantUserId);
      setPushStatus("denied");
      setModalMode(null);
      return;
    }

    if (permission === "denied") {
      setPushStatus("denied");
      setModalMode("permission");
      return;
    }

    const snap = await getPartnerPushStatus();
    setPushStatus(snap.status);

    if (snap.status === "enabled") {
      setModalMode(null);
      return;
    }

    if (snap.status === "default") {
      setModalMode("permission");
      return;
    }

    if (
      snap.status === "granted" ||
      snap.status === "registration_failed" ||
      snap.status === "registering"
    ) {
      const ok = await tryRegister();
      if (ok) return;
      if (isPushSessionDismissed(merchantUserId)) return;
      setModalMode("registration");
      return;
    }

    setModalMode("permission");
  }, [merchantUserId, tryRegister]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (!onDashboard || !ready || !authenticated) {
      setModalMode(null);
      return;
    }

    if (!registerAttemptRef.current) {
      registerAttemptRef.current = true;
      window.setTimeout(() => {
        void evaluateModalState();
      }, Notification.permission === "granted" ? 400 : 1200);
    }

    const onStoreChange = () => {
      void (async () => {
        await syncBrowserPushPermissionWithBackend();
        const permission = await getEffectiveNotificationPermission();
        if (permission !== "granted") return;
        invalidatePartnerPushBackendCache();
        await tryRegister();
      })();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);

    const onFocus = () => {
      if (isPushSessionDismissed(merchantUserId)) return;
      invalidatePartnerPushBackendCache();
      void evaluateModalState();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    let permissionStatus: PermissionStatus | null = null;
    const onPermissionChange = () => {
      void (async () => {
        await syncBrowserPushPermissionWithBackend();
        const permission = await getEffectiveNotificationPermission();
        if (notePushPermissionObserved(permission)) {
          markPushSessionDismissed(merchantUserId);
          setPushStatus("denied");
          setModalMode(null);
          return;
        }
        if (isPushSessionDismissed(merchantUserId)) {
          setModalMode(null);
          return;
        }
        void evaluateModalState();
      })();
    };
    void (async () => {
      try {
        if ("permissions" in navigator) {
          permissionStatus = await navigator.permissions.query({
            name: "notifications" as PermissionName,
          });
          permissionStatus.addEventListener("change", onPermissionChange);
        }
      } catch {
        /* ignore */
      }
    })();

    const unsub = onBrowserPushForeground((payload) => {
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

    return () => {
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      permissionStatus?.removeEventListener("change", onPermissionChange);
      unsub();
    };
  }, [onDashboard, ready, authenticated, merchantUserId, evaluateModalState, tryRegister]);

  if (!onDashboard || !ready || !authenticated || !modalMode) {
    return null;
  }

  return (
    <PartnerBrowserPushPermissionModal
      mode={modalMode}
      pushStatus={pushStatus}
      merchantUserId={merchantUserId}
      onClose={() => setModalMode(null)}
      onRegistered={() => {
        invalidatePartnerPushBackendCache();
        setPushStatus("enabled");
        setModalMode(null);
      }}
    />
  );
}
