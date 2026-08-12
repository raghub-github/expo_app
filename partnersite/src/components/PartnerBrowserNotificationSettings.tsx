"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getEffectiveNotificationPermission,
  registerBrowserPushToken,
  requestBrowserPushPermission,
  syncBrowserPushPermissionWithBackend,
} from "@/lib/browser-push/firebase-web";
import { invalidatePartnerPushBackendCache } from "@/lib/browser-push/partner-push-status";
import { useMerchantSession } from "@/context/MerchantSessionContext";

type BrowserPushUiState = "unsupported" | "default" | "denied" | "granted" | "enabling";

/**
 * Explicit browser-notification enable control for store settings.
 * Does not auto-request permission — only runs when the merchant clicks Enable.
 */
export function PartnerBrowserNotificationSettings() {
  const session = useMerchantSession();
  const merchantUserId = session?.user?.id ?? "merchant";
  const [uiState, setUiState] = useState<BrowserPushUiState>("default");
  const [enabling, setEnabling] = useState(false);

  const refreshState = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setUiState("unsupported");
      return;
    }
    const permission = await getEffectiveNotificationPermission();
    if (permission === "granted") setUiState("granted");
    else if (permission === "denied") setUiState("denied");
    else setUiState("default");
  }, []);

  useEffect(() => {
    void refreshState();
    const onFocus = () => {
      void refreshState();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshState]);

  const handleEnable = async () => {
    if (enabling || uiState === "granted" || uiState === "unsupported") return;
    setEnabling(true);
    try {
      const next = await requestBrowserPushPermission();
      if (next !== "granted") {
        await refreshState();
        return;
      }
      await syncBrowserPushPermissionWithBackend();
      await registerBrowserPushToken(merchantUserId, { retries: 3 });
      invalidatePartnerPushBackendCache();
      await refreshState();
    } finally {
      setEnabling(false);
    }
  };

  if (uiState === "unsupported") {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg">
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">Browser notifications</p>
        <p className="text-sm text-gray-600">
          {uiState === "granted"
            ? "Enabled for this browser — order alerts will appear when the Partner Portal is open."
            : uiState === "denied"
              ? "Notifications are blocked in browser settings."
              : "Enable browser notifications for order alerts while using the Partner Portal."}
        </p>
      </div>
      {uiState === "default" ? (
        <button
          type="button"
          onClick={() => void handleEnable()}
          disabled={enabling}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {enabling ? "Enabling…" : "Enable"}
        </button>
      ) : uiState === "granted" ? (
        <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
          Enabled
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
          Blocked
        </span>
      )}
    </div>
  );
}
