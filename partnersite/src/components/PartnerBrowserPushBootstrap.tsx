"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  getEffectiveNotificationPermission,
  onBrowserPushForeground,
  registerBrowserPushToken,
  syncBrowserPushPermissionWithBackend,
} from "@/lib/browser-push/firebase-web";
import { invalidatePartnerPushBackendCache } from "@/lib/browser-push/partner-push-status";
import { PARTNER_SELECTED_STORE_CHANGED } from "@/lib/partner-selected-store";
import { useMerchantSession } from "@/context/MerchantSessionContext";
import { mapMerchantAppDeepLinkToPartnersite } from "@/lib/mapMerchantAppDeepLink";

/** Only run on authenticated partner console routes — never on /auth/*. */
function isPartnerDashboardPath(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p.startsWith("/auth")) return false;
  return p === "/partners" || p.startsWith("/partners/") || p === "/mx" || p.startsWith("/mx/");
}

/**
 * Automatic browser push bootstrap for /mx and /partners.
 * Uses Notification.permission (via getEffectiveNotificationPermission) as the single source of truth.
 * No permission modal, toast, or overlay — registration runs silently when permission is granted.
 */
export function PartnerBrowserPushBootstrap() {
  const pathname = usePathname() ?? "";
  const session = useMerchantSession();
  const lastPermissionRef = useRef<NotificationPermission | null>(null);
  const registerInFlightRef = useRef(false);

  const onDashboard = isPartnerDashboardPath(pathname);
  const ready = !!session && !session.isLoading;
  const authenticated = !!session?.isAuthenticated;
  const merchantUserId = session?.user?.id ?? "merchant";

  const tryRegisterIfGranted = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (registerInFlightRef.current) return;

    const permission = await getEffectiveNotificationPermission();
    if (permission !== "granted") return;

    registerInFlightRef.current = true;
    try {
      await syncBrowserPushPermissionWithBackend();
      await registerBrowserPushToken(merchantUserId, { retries: 3 });
      invalidatePartnerPushBackendCache();
    } catch {
      /* registration fails gracefully inside firebase-web */
    } finally {
      registerInFlightRef.current = false;
    }
  }, [merchantUserId]);

  const reconcilePermissionState = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    await syncBrowserPushPermissionWithBackend();
    const permission = await getEffectiveNotificationPermission();
    lastPermissionRef.current = permission;

    if (permission === "denied") {
      invalidatePartnerPushBackendCache();
      return;
    }

    if (permission === "granted") {
      await tryRegisterIfGranted();
    }
  }, [tryRegisterIfGranted]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!onDashboard || !ready || !authenticated) return;

    void (async () => {
      const permission = await getEffectiveNotificationPermission();
      lastPermissionRef.current = permission;
      if (permission === "granted") {
        await tryRegisterIfGranted();
      } else if (permission === "denied") {
        await syncBrowserPushPermissionWithBackend();
        invalidatePartnerPushBackendCache();
      }
    })();

    const onStoreChange = () => {
      void tryRegisterIfGranted();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);

    const onFocusOrVisible = () => {
      void reconcilePermissionState();
    };
    window.addEventListener("focus", onFocusOrVisible);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcilePermissionState();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let permissionStatus: PermissionStatus | null = null;
    const onPermissionsApiChange = () => {
      void reconcilePermissionState();
    };
    void (async () => {
      try {
        if ("permissions" in navigator) {
          permissionStatus = await navigator.permissions.query({
            name: "notifications" as PermissionName,
          });
          permissionStatus.addEventListener("change", onPermissionsApiChange);
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
        (typeof payload.data?.url === "string" && payload.data.url) ||
        "/partners/dashboard";
      let href = mapMerchantAppDeepLinkToPartnersite(deepRaw, {
        preferMx: pathname.startsWith("/mx"),
      });
      try {
        if (/^https?:\/\//i.test(deepRaw)) {
          const u = new URL(deepRaw);
          href =
            u.origin === window.location.origin
              ? mapMerchantAppDeepLinkToPartnersite(`${u.pathname}${u.search}`, {
                  preferMx: pathname.startsWith("/mx"),
                })
              : deepRaw;
        }
      } catch {
        href = mapMerchantAppDeepLinkToPartnersite("/partners/dashboard", {
          preferMx: pathname.startsWith("/mx"),
        });
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
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      permissionStatus?.removeEventListener("change", onPermissionsApiChange);
      unsub();
    };
  }, [onDashboard, ready, authenticated, tryRegisterIfGranted, reconcilePermissionState, pathname]);

  return null;
}
