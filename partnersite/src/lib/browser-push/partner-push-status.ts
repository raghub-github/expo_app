"use client";

import { getEffectiveNotificationPermission, syncBrowserPushPermissionWithBackend } from "@/lib/browser-push/firebase-web";
import { isPushRegistered, isPushRegistrationPending } from "@/lib/browser-push/partner-push-state";
export type PartnerPushStatus =
  | "unsupported"
  | "default"
  | "denied"
  | "granted"
  | "registering"
  | "enabled"
  | "registration_failed";

export type PartnerPushStatusSnapshot = {
  status: PartnerPushStatus;
  permission: NotificationPermission | null;
  backendRegistered: boolean;
  hasValidToken: boolean;
};

let cachedBackendRegistered: boolean | null = null;
let backendCheckPromise: Promise<boolean> | null = null;

async function fetchBackendRegistered(storeQuery: string): Promise<boolean> {
  const res = await fetch(`/api/notifications/browser-tokens${storeQuery}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => ({}))) as { registered?: boolean };
  return data.registered === true;
}

async function checkBackendRegistration(): Promise<boolean> {
  if (cachedBackendRegistered != null) return cachedBackendRegistered;
  if (backendCheckPromise) return backendCheckPromise;

  backendCheckPromise = (async () => {
    try {
      let storeQuery = "";
      let storeId = "";
      try {
        const { readPartnerSelectedStoreId } = await import("@/lib/partner-selected-store");
        storeId = readPartnerSelectedStoreId();
        if (storeId) storeQuery = `?store_id=${encodeURIComponent(storeId)}`;
      } catch {
        /* ignore */
      }

      let registered = await fetchBackendRegistered(storeQuery);
      // Token may exist at user level before store association — avoid a false "not registered".
      if (!registered && storeId) {
        registered = await fetchBackendRegistered("");
      }

      cachedBackendRegistered = registered;
      return registered;
    } catch {
      cachedBackendRegistered = false;
      return false;
    } finally {
      backendCheckPromise = null;
    }
  })();

  return backendCheckPromise;
}

export function invalidatePartnerPushBackendCache(): void {
  cachedBackendRegistered = null;
}

/** Browser permission only — synchronous. */
export function getBrowserNotificationPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

/**
 * Single source of truth: browser permission + local registration state + backend check.
 */
export async function getPartnerPushStatus(options?: {
  skipBackend?: boolean;
}): Promise<PartnerPushStatusSnapshot> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      status: "unsupported",
      permission: null,
      backendRegistered: false,
      hasValidToken: false,
    };
  }

  const permission = await getEffectiveNotificationPermission();

    if (permission === "denied") {
      await syncBrowserPushPermissionWithBackend();
      return {
        status: "denied" as const,
        permission,
        backendRegistered: false,
        hasValidToken: false,
      };
    }

  if (permission === "default") {
    return {
      status: "default",
      permission,
      backendRegistered: false,
      hasValidToken: false,
    };
  }

  if (isPushRegistrationPending()) {
    return {
      status: "registering",
      permission,
      backendRegistered: false,
      hasValidToken: false,
    };
  }

  const backendRegistered =
    options?.skipBackend === true ? isPushRegistered() : await checkBackendRegistration();
  const locallyRegistered = isPushRegistered();

  if (backendRegistered && locallyRegistered) {
    return {
      status: "enabled",
      permission,
      backendRegistered: true,
      hasValidToken: true,
    };
  }

  if (locallyRegistered && !backendRegistered) {
    return {
      status: "registration_failed",
      permission,
      backendRegistered: false,
      hasValidToken: false,
    };
  }

  return {
    status: "granted",
    permission,
    backendRegistered,
    hasValidToken: false,
  };
}
