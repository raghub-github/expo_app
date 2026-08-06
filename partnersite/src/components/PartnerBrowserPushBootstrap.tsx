"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  onBrowserPushForeground,
  registerBrowserPushToken,
} from "@/lib/browser-push/firebase-web";
import { PARTNER_SELECTED_STORE_CHANGED } from "@/lib/partner-selected-store";
import { PartnerBrowserPushPermissionModal } from "@/components/PartnerBrowserPushPermissionModal";
import { useMerchantSession } from "@/context/MerchantSessionContext";

/** Only prompt on authenticated partner console routes — never on /auth/*. */
function isPartnerDashboardPath(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p.startsWith("/auth")) return false;
  return p === "/partners" || p.startsWith("/partners/") || p === "/mx" || p.startsWith("/mx/");
}

/**
 * When a merchant is on /mx or /partners (after login):
 *  1. If permission already granted → register FCM web token
 *  2. If blocked / not asked → show Allow modal (user-gesture prompt)
 *  3. Foreground toasts for campaigns while the tab is open
 *
 * Background delivery: /firebase-messaging-sw.js
 */
export function PartnerBrowserPushBootstrap() {
  const pathname = usePathname() ?? "";
  const session = useMerchantSession();
  const ran = useRef(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const onDashboard = isPartnerDashboardPath(pathname);
  const ready = !!session && !session.isLoading;
  const authenticated = !!session?.isAuthenticated;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (!onDashboard || !ready || !authenticated) {
      setShowPermissionModal(false);
      return;
    }

    const registerIfGranted = async () => {
      try {
        if (Notification.permission !== "granted") return;
        const token = await registerBrowserPushToken("merchant");
        if (!token) {
          console.warn(
            "[PartnerBrowserPushBootstrap] FCM token not registered — check Firebase VAPID + backend :3000",
          );
        }
      } catch (e) {
        console.warn("[PartnerBrowserPushBootstrap]", (e as Error)?.message ?? e);
      }
    };

    if (!ran.current) {
      ran.current = true;
      if (Notification.permission === "granted") {
        void registerIfGranted();
        window.setTimeout(() => void registerIfGranted(), 4000);
      } else {
        // Modal self-gates on permanent/soft dismiss + permission state.
        setShowPermissionModal(true);
      }
    } else if (Notification.permission !== "granted") {
      setShowPermissionModal(true);
    }

    const onStoreChange = () => {
      void registerIfGranted();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStoreChange);

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
      unsub();
    };
  }, [onDashboard, ready, authenticated]);

  if (!onDashboard || !ready || !authenticated || !showPermissionModal) {
    return null;
  }

  return (
    <PartnerBrowserPushPermissionModal
      onRegistered={() => {
        setShowPermissionModal(false);
      }}
    />
  );
}
