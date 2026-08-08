/**
 * Web push helper for partnersite. Uses Firebase JS SDK v10 modular API.
 *
 * Public flow:
 *   1. requestBrowserPushPermission()    — prompts user, returns granted?
 *   2. registerBrowserPushToken(userId)  — gets FCM token, sends to backend
 *   3. onBrowserPushForeground(cb)       — foreground toast handler
 *
 * The service worker at /firebase-messaging-sw.js handles the OS-level
 * background render + click routing.
 */
"use client";

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging, type MessagePayload } from "firebase/messaging";

let cachedApp: FirebaseApp | null = null;
let cachedMessaging: Messaging | null = null;
let cachedRegistration: ServiceWorkerRegistration | null = null;
let messagingInitPromise: Promise<Messaging | null> | null = null;
let errorGuardInstalled = false;

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

/** Swallow Firebase HMR/controllerchange deleteToken races in dev. */
export function installFirebasePushErrorGuard(): void {
  if (typeof window === "undefined" || errorGuardInstalled) return;
  errorGuardInstalled = true;

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | undefined;
    const msg = String(reason?.message ?? reason ?? "");
    if (
      msg.includes("pushManager") ||
      (msg.includes("Cannot read properties of undefined") && msg.includes("push"))
    ) {
      event.preventDefault();
      console.debug("[browser-push] ignored Firebase SW token cleanup race");
    }
  });
}

async function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 12_000,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active) return registration;

  const ready = await Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    sleep(timeoutMs).then(() => null),
  ]);
  if (ready?.active) return ready;

  return new Promise((resolve) => {
    const deadline = window.setTimeout(() => resolve(null), timeoutMs);
    const finish = (reg: ServiceWorkerRegistration | null) => {
      window.clearTimeout(deadline);
      resolve(reg?.active ? reg : null);
    };

    const worker = registration.installing ?? registration.waiting;
    if (worker) {
      worker.addEventListener("statechange", () => {
        if (registration.active) finish(registration);
      });
    }

    registration.addEventListener("updatefound", () => {
      const next = registration.installing;
      next?.addEventListener("statechange", () => {
        if (registration.active) finish(registration);
      });
    });
  });
}

/** Wait until the registration exposes pushManager (required for FCM tokens). */
async function waitForPushManager(
  registration: ServiceWorkerRegistration,
  timeoutMs = 12_000,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.pushManager) return registration;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(200);
    if (registration.pushManager) return registration;
  }
  return registration.pushManager ? registration : null;
}

/** Register and activate the FCM service worker before messaging init. */
export async function ensureFirebaseServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (cachedRegistration?.pushManager) return cachedRegistration;

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
    });
    const active = await waitForActiveServiceWorker(registration);
    if (!active) return null;
    const ready = await waitForPushManager(active);
    cachedRegistration = ready;
    return ready;
  } catch (e) {
    console.warn("[browser-push] service worker registration failed:", (e as Error).message);
    return null;
  }
}

async function primeMessagingRegistration(messaging: Messaging, registration: ServiceWorkerRegistration): Promise<void> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || Notification.permission !== "granted") return;
  try {
    await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch {
    /* token may not exist yet — binding SW registration is enough */
  }
}

async function getMessagingSafeAsync(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;
  if (!ensureConfigured()) {
    console.warn("[browser-push] Firebase env vars not set; skipping messaging init.");
    return null;
  }
  if (cachedMessaging) return cachedMessaging;

  installFirebasePushErrorGuard();

  if (!messagingInitPromise) {
    messagingInitPromise = (async () => {
      const registration = await ensureFirebaseServiceWorker();
      if (!registration?.pushManager) {
        messagingInitPromise = null;
        return null;
      }
      try {
        cachedApp ??= initializeApp(config() as never);
        cachedMessaging = getMessaging(cachedApp);
        await primeMessagingRegistration(cachedMessaging, registration);
        return cachedMessaging;
      } catch (e) {
        messagingInitPromise = null;
        console.warn("[browser-push] messaging init failed:", (e as Error).message);
        return null;
      }
    })();
  }

  return messagingInitPromise;
}

export async function requestBrowserPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

async function registerBrowserPushTokenOnce(_userId: string): Promise<string | null> {
  if (Notification.permission !== "granted") return null;

  const messaging = await getMessagingSafeAsync();
  if (!messaging) return null;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn(
      "[browser-push] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing; run the Firebase Console → Cloud Messaging step (see docs/NOTIFICATION_ARCHITECTURE.md §8).",
    );
    return null;
  }

  const registration = (await ensureFirebaseServiceWorker()) ?? cachedRegistration;
  if (!registration?.pushManager) {
    console.warn("[browser-push] service worker did not become active in time");
    return null;
  }

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

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
    console.warn("[browser-push] register failed", res.status, text.slice(0, 200));
    return null;
  }

  console.info("[browser-push] partnersite FCM token registered");
  return token;
}

/**
 * Fetch the FCM token for this browser, then POST it to the backend so
 * NotificationService.sendToUser can reach this session.
 */
export async function registerBrowserPushToken(
  userId: string,
  options?: { retries?: number },
): Promise<string | null> {
  const retries = Math.max(1, options?.retries ?? 3);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      if (attempt > 0) {
        await sleep(600 * attempt);
      }
      const token = await registerBrowserPushTokenOnce(userId);
      if (token) return token;
    } catch (e) {
      console.warn("[browser-push] getToken failed:", (e as Error).message);
    }
  }

  return null;
}

/** Drop this browser's FCM token from the backend before logout. */
export async function unregisterBrowserPushToken(): Promise<void> {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const messaging = await getMessagingSafeAsync();
    const registration = cachedRegistration ?? (await ensureFirebaseServiceWorker());
    if (!messaging || !registration?.pushManager) return;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    }).catch(() => null);
    if (!token) return;

    await fetch("/api/notifications/browser-tokens", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  } catch {
    /* ignore — firebase may be unavailable */
  }
}

export function onBrowserPushForeground(cb: (payload: MessagePayload) => void): () => void {
  if (typeof window === "undefined" || Notification.permission !== "granted") {
    return () => undefined;
  }

  installFirebasePushErrorGuard();

  let unsub: (() => void) | undefined;
  void getMessagingSafeAsync().then((messaging) => {
    if (!messaging) return;
    unsub = onMessage(messaging, cb);
  });
  return () => {
    unsub?.();
  };
}
