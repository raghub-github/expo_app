"use client";

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

async function checkBackendRegistration(): Promise<boolean> {
  if (cachedBackendRegistered != null) return cachedBackendRegistered;
  if (backendCheckPromise) return backendCheckPromise;

  backendCheckPromise = (async () => {
    try {
      let storeQuery = "";
      try {
        const { readPartnerSelectedStoreId } = await import("@/lib/partner-selected-store");
        const storeId = readPartnerSelectedStoreId();
        if (storeId) storeQuery = `?store_id=${encodeURIComponent(storeId)}`;
      } catch {
        /* ignore */
      }

      const res = await fetch(`/api/notifications/browser-tokens${storeQuery}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        cachedBackendRegistered = false;
        return false;
      }
      const data = (await res.json().catch(() => ({}))) as { registered?: boolean };
      cachedBackendRegistered = data.registered === true;
      return cachedBackendRegistered;
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

  const permission = Notification.permission;

  if (permission === "denied") {
    return {
      status: "denied",
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
