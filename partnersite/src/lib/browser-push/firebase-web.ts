/**
 * Web push helper for partnersite. Uses Firebase JS SDK v10 modular API.
 *
 * Initialization order (required to avoid Firebase deleteTokenInternal crashes):
 *   1. Register /firebase-messaging-sw.js and wait until active + pushManager exists
 *   2. initializeApp + getMessaging
 *   3. Bind swRegistration via getToken (populates messaging.swRegistration internally)
 *   4. POST token to backend
 */
"use client";

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging, type MessagePayload } from "firebase/messaging";

const FCM_SW_SCRIPT = "/firebase-messaging-sw.js";

let cachedApp: FirebaseApp | null = null;
let cachedMessaging: Messaging | null = null;
let cachedRegistration: ServiceWorkerRegistration | null = null;
let infrastructurePromise: Promise<PushInfrastructure | null> | null = null;
let registerTokenInFlight: Promise<string | null> | null = null;
let permissionSyncInFlight: Promise<void> | null = null;

export type BrowserPushRegisterError =
  | "permission_denied"
  | "firebase_not_configured"
  | "vapid_missing"
  | "service_worker_failed"
  | "token_fetch_failed"
  | "backend_failed"
  | "unsupported";

let lastRegisterError: BrowserPushRegisterError | null = null;
let lastRegisterErrorDetail: string | null = null;

export type PushDiagnosticSnapshot = {
  permission: NotificationPermission | null;
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  notificationSupported: boolean;
  registrationExists: boolean;
  registrationScope: string | null;
  registrationActiveState: string | null;
  registrationHasPushManager: boolean;
  messagingInitialized: boolean;
  vapidConfigured: boolean;
  firebaseConfigured: boolean;
  lastError: BrowserPushRegisterError | null;
  lastErrorDetail: string | null;
};

export function getLastBrowserPushRegisterError(): BrowserPushRegisterError | null {
  return lastRegisterError;
}

export function getLastBrowserPushRegisterErrorDetail(): string | null {
  return lastRegisterErrorDetail;
}

export function getBrowserPushDiagnosticSnapshot(): PushDiagnosticSnapshot {
  const reg = cachedRegistration;
  return {
    permission: typeof window !== "undefined" && "Notification" in window ? Notification.permission : null,
    serviceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    pushManagerSupported: typeof window !== "undefined" && "PushManager" in window,
    notificationSupported: typeof window !== "undefined" && "Notification" in window,
    registrationExists: !!reg,
    registrationScope: reg?.scope ?? null,
    registrationActiveState: reg?.active?.state ?? null,
    registrationHasPushManager: !!reg?.pushManager,
    messagingInitialized: !!cachedMessaging,
    vapidConfigured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
    firebaseConfigured: ensureConfigured(),
    lastError: lastRegisterError,
    lastErrorDetail: lastRegisterErrorDetail,
  };
}

function setRegisterError(error: BrowserPushRegisterError, detail?: string): void {
  lastRegisterError = error;
  lastRegisterErrorDetail = detail?.trim() || null;
  logPushDiagnostic("registration_error", { error, detail: lastRegisterErrorDetail });
}

function clearRegisterError(): void {
  lastRegisterError = null;
  lastRegisterErrorDetail = null;
}

function logPushDiagnostic(stage: string, extra?: Record<string, unknown>): void {
  console.warn("[browser-push]", stage, { ...getBrowserPushDiagnosticSnapshot(), ...extra });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function config() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function ensureConfigured(): boolean {
  const c = config();
  return Boolean(c.apiKey && c.projectId && c.messagingSenderId && c.appId);
}

function pushUnsupported(): boolean {
  return (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  );
}

/** Re-read permission; Permissions API reflects site-setting changes before Notification.permission updates. */
export async function getEffectiveNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";

  try {
    if ("permissions" in navigator) {
      const status = await navigator.permissions.query({ name: "notifications" as PermissionName });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
    }
  } catch {
    /* ignore */
  }

  return Notification.permission;
}

/** @deprecated No-op — errors must not be suppressed. Kept for call-site compatibility. */
export function installFirebasePushErrorGuard(): void {
  /* intentionally empty */
}

type PushInfrastructure = {
  app: FirebaseApp;
  messaging: Messaging;
  registration: ServiceWorkerRegistration;
};

function bindMessagingServiceWorkerRegistration(messaging: Messaging, registration: ServiceWorkerRegistration): void {
  // Firebase sw-listeners call deleteTokenInternal using messaging.swRegistration.
  // getToken() sets this internally, but binding early prevents controllerchange races.
  const target = messaging as Messaging & { swRegistration?: ServiceWorkerRegistration };
  if (!target.swRegistration) {
    target.swRegistration = registration;
  }
}

async function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 15_000,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active?.state === "activated") return registration;

  return new Promise((resolve) => {
    const deadline = window.setTimeout(() => resolve(null), timeoutMs);
    const finish = (reg: ServiceWorkerRegistration | null) => {
      window.clearTimeout(deadline);
      resolve(reg?.active ? reg : null);
    };

    const onStateChange = () => {
      if (registration.active) finish(registration);
    };

    if (registration.active) {
      finish(registration);
      return;
    }

    const worker = registration.installing ?? registration.waiting;
    worker?.addEventListener("statechange", onStateChange);
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", onStateChange);
    });
  });
}

function validateServiceWorkerRegistration(
  registration: ServiceWorkerRegistration | null | undefined,
): ServiceWorkerRegistration | null {
  if (!registration) return null;
  if (!registration.pushManager) {
    logPushDiagnostic("registration_missing_push_manager", {
      scope: registration.scope,
      activeState: registration.active?.state ?? null,
    });
    return null;
  }
  if (!registration.active) {
    logPushDiagnostic("registration_not_active", {
      scope: registration.scope,
      installing: registration.installing?.state ?? null,
      waiting: registration.waiting?.state ?? null,
    });
    return null;
  }
  return registration;
}

async function findExistingFirebaseMessagingRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    let legacyScoped: ServiceWorkerRegistration | null = null;

    for (const reg of registrations) {
      const scriptUrl = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? "";
      if (!scriptUrl.includes("firebase-messaging-sw.js")) continue;

      const validated = validateServiceWorkerRegistration(reg);
      if (!validated) continue;

      let scopePath = "/";
      try {
        scopePath = new URL(validated.scope).pathname;
      } catch {
        /* ignore */
      }

      // Prefer default-scope registration (matches dashboard + Firebase expectations).
      if (scopePath === "/" || scopePath === "") {
        return validated;
      }

      legacyScoped ??= validated;
    }

    return legacyScoped;
  } catch (e) {
    logPushDiagnostic("get_registrations_failed", { error: (e as Error).message });
  }
  return null;
}

/** Register the FCM service worker at default scope (same pattern as dashboard). */
export async function ensureFirebaseServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  const existing = cachedRegistration ?? (await findExistingFirebaseMessagingRegistration());
  if (existing?.pushManager && existing.active) {
    cachedRegistration = existing;
    return existing;
  }

  try {
    const registration = await navigator.serviceWorker.register(FCM_SW_SCRIPT);
    const active = await waitForActiveServiceWorker(registration);
    const validated = validateServiceWorkerRegistration(active);
    cachedRegistration = validated;
    return validated;
  } catch (e) {
    setRegisterError("service_worker_failed", (e as Error).message);
    return null;
  }
}

async function ensurePushInfrastructure(): Promise<PushInfrastructure | null> {
  if (infrastructurePromise) return infrastructurePromise;

  infrastructurePromise = (async () => {
    if (pushUnsupported()) {
      setRegisterError("unsupported");
      infrastructurePromise = null;
      return null;
    }
    if (!ensureConfigured()) {
      setRegisterError("firebase_not_configured");
      infrastructurePromise = null;
      return null;
    }

    const registration = await ensureFirebaseServiceWorker();
    if (!registration) {
      setRegisterError("service_worker_failed");
      infrastructurePromise = null;
      return null;
    }

    try {
      cachedApp ??= initializeApp(config() as never);
      const messaging = cachedMessaging ?? getMessaging(cachedApp);
      bindMessagingServiceWorkerRegistration(messaging, registration);
      cachedMessaging = messaging;

      return { app: cachedApp, messaging, registration };
    } catch (e) {
      infrastructurePromise = null;
      setRegisterError("service_worker_failed", (e as Error).message);
      return null;
    }
  })();

  return infrastructurePromise;
}

async function fetchFcmToken(
  messaging: Messaging,
  registration: ServiceWorkerRegistration,
): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    setRegisterError("vapid_missing");
    return null;
  }

  bindMessagingServiceWorkerRegistration(messaging, registration);

  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) {
      setRegisterError("token_fetch_failed", "getToken returned empty");
      return null;
    }
    return token;
  } catch (e) {
    setRegisterError("token_fetch_failed", (e as Error).message);
    return null;
  }
}

async function postTokenToBackend(token: string): Promise<boolean> {
  let storeId: string | undefined;
  try {
    const { readPartnerSelectedStoreId } = await import("@/lib/partner-selected-store");
    storeId = readPartnerSelectedStoreId() || undefined;
  } catch {
    storeId =
      localStorage.getItem("selectedStoreId")?.trim() ||
      localStorage.getItem("selectedRestaurantId")?.trim() ||
      undefined;
  }

  const res = await fetch("/api/notifications/browser-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      token,
      platform: "web",
      store_id: storeId || undefined,
      source: "partnersite",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    setRegisterError("backend_failed", text.slice(0, 200));
    return false;
  }

  const body = (await res.json().catch(() => ({}))) as { skipped?: boolean; ok?: boolean };
  if (body.skipped === true) {
    // Backend offline — treat as deferred success so we do not hammer retries.
    return true;
  }

  return true;
}

export async function requestBrowserPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/**
 * When the browser blocks notifications, deactivate backend registration so FCM
 * stops targeting this device. The backend cannot read Notification.permission directly.
 */
export async function syncBrowserPushPermissionWithBackend(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (permissionSyncInFlight) return permissionSyncInFlight;

  permissionSyncInFlight = (async () => {
    const permission = await getEffectiveNotificationPermission();
    const {
      readLastSyncedPushPermission,
      writeLastSyncedPushPermission,
      readPushFcmToken,
      markPushLocallyDisabled,
      clearPushFcmToken,
    } = await import("@/lib/browser-push/partner-push-state");

    const previouslySynced = readLastSyncedPushPermission();
    if (permission === previouslySynced) {
      return;
    }

    if (permission === "denied") {
      const token = readPushFcmToken();
      try {
        const res = await fetch("/api/notifications/browser-tokens/sync-permission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            permission: "denied",
            token: token || undefined,
          }),
        });
        if (!res.ok) {
          logPushDiagnostic("permission_denied_sync_failed", { status: res.status });
        }
      } catch (e) {
        logPushDiagnostic("permission_denied_sync_failed", { error: (e as Error).message });
      }

      markPushLocallyDisabled();
      clearPushFcmToken();
      writeLastSyncedPushPermission("denied");

      try {
        const { invalidatePartnerPushBackendCache } = await import("@/lib/browser-push/partner-push-status");
        invalidatePartnerPushBackendCache();
      } catch {
        /* ignore */
      }
      return;
    }

    if (permission === "granted" && previouslySynced === "denied") {
      writeLastSyncedPushPermission("granted");
      return;
    }

    writeLastSyncedPushPermission(permission);
  })().finally(() => {
    permissionSyncInFlight = null;
  });

  return permissionSyncInFlight;
}

async function registerBrowserPushTokenOnce(_userId: string): Promise<string | null> {
  clearRegisterError();

  if (pushUnsupported()) {
    setRegisterError("unsupported");
    return null;
  }

  const permission = await getEffectiveNotificationPermission();
  if (permission !== "granted") {
    setRegisterError("permission_denied");
    return null;
  }

  const infra = await ensurePushInfrastructure();
  if (!infra) {
    if (!lastRegisterError) setRegisterError("service_worker_failed");
    return null;
  }

  const token = await fetchFcmToken(infra.messaging, infra.registration);
  if (!token) return null;

  const posted = await postTokenToBackend(token);
  if (!posted) return null;

  clearRegisterError();
  console.info("[browser-push] partnersite FCM token registered", {
    scope: infra.registration.scope,
    activeState: infra.registration.active?.state ?? null,
  });

  try {
    const { savePushFcmToken, writeLastSyncedPushPermission } = await import("@/lib/browser-push/partner-push-state");
    savePushFcmToken(token);
    writeLastSyncedPushPermission("granted");
  } catch {
    /* ignore */
  }

  try {
    const { invalidatePartnerPushBackendCache } = await import("@/lib/browser-push/partner-push-status");
    invalidatePartnerPushBackendCache();
  } catch {
    /* ignore */
  }

  return token;
}

/**
 * Fetch the FCM token for this browser, then POST it to the backend.
 * Single in-flight operation per browser session tab.
 */
export async function registerBrowserPushToken(
  userId: string,
  options?: { retries?: number },
): Promise<string | null> {
  if (registerTokenInFlight) return registerTokenInFlight;

  const retries = Math.max(1, options?.retries ?? 3);
  registerTokenInFlight = (async () => {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        if (attempt > 0) {
          await sleep(400 * attempt);
        }
        const token = await registerBrowserPushTokenOnce(userId);
        if (token) return token;
      } catch (e) {
        setRegisterError("token_fetch_failed", (e as Error).message);
        logPushDiagnostic("register_attempt_failed", { attempt, error: (e as Error).message });
      }
    }
    return null;
  })().finally(() => {
    registerTokenInFlight = null;
  });

  return registerTokenInFlight;
}

/** Drop this browser's FCM token from the backend before logout. Does not call Firebase deleteToken(). */
export async function unregisterBrowserPushToken(): Promise<void> {
  if (typeof window === "undefined") return;

  const { readPushFcmToken, clearPushFcmToken, markPushLocallyDisabled } = await import(
    "@/lib/browser-push/partner-push-state"
  );
  const token = readPushFcmToken();
  if (!token) return;

  await fetch("/api/notifications/browser-tokens", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);

  markPushLocallyDisabled();
  clearPushFcmToken();
}

export function onBrowserPushForeground(cb: (payload: MessagePayload) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let unsub: (() => void) | undefined;
  let cancelled = false;

  void (async () => {
    const permission = await getEffectiveNotificationPermission();
    if (cancelled || permission !== "granted") return;

    const infra = await ensurePushInfrastructure();
    if (cancelled || !infra) return;

    unsub = onMessage(infra.messaging, (payload) => {
      void getEffectiveNotificationPermission().then((perm) => {
        if (perm !== "granted") return;
        cb(payload);
      });
    });
  })();

  return () => {
    cancelled = true;
    unsub?.();
  };
}
