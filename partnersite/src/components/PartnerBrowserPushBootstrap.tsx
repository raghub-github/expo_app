"use client";

import { useEffect, useRef } from "react";
import {
  registerBrowserPushToken,
  requestBrowserPushPermission,
} from "@/lib/browser-push/firebase-web";

/**
 * Best-effort: when a merchant is on /mx, ask for browser notification
 * permission once and register the FCM web token with the backend so
 * Super Admin merchant campaigns can reach partnersite sessions.
 */
export function PartnerBrowserPushBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    void (async () => {
      try {
        const perm = await requestBrowserPushPermission();
        if (perm !== "granted") return;
        // userId is resolved server-side from the session cookie
        await registerBrowserPushToken("merchant");
      } catch (e) {
        console.warn("[PartnerBrowserPushBootstrap]", (e as Error)?.message ?? e);
      }
    })();
  }, []);

  return null;
}
