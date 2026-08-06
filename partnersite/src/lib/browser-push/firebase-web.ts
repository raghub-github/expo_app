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

function getMessagingSafe(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  if (!ensureConfigured()) {
    console.warn("[browser-push] Firebase env vars not set; skipping messaging init.");
    return null;
  }
  if (cachedMessaging) return cachedMessaging;
  try {
    cachedApp ??= initializeApp(config() as never);
    cachedMessaging = getMessaging(cachedApp);
    return cachedMessaging;
  } catch (e) {
    console.warn("[browser-push] messaging init failed:", (e as Error).message);
    return null;
  }
}

export async function requestBrowserPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/**
 * Fetch the FCM token for this browser, then POST it to the backend so
 * NotificationService.sendToUser can reach this session.
 *
 * Backend endpoint: POST /api/notifications/browser-tokens
 * (partnersite proxy → /v1/notifications/browser-tokens)
 */
export async function registerBrowserPushToken(_userId: string): Promise<string | null> {
  const messaging = getMessagingSafe();
  if (!messaging) return null;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[browser-push] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing; run the Firebase Console → Cloud Messaging step (see docs/NOTIFICATION_ARCHITECTURE.md §8).");
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return null;
    let storeId: string | undefined;
    if (typeof window !== "undefined") {
      try {
        const { readPartnerSelectedStoreId } = await import("@/lib/partner-selected-store");
        storeId = readPartnerSelectedStoreId() || undefined;
      } catch {
        storeId =
          localStorage.getItem("selectedStoreId")?.trim() ||
          localStorage.getItem("selectedRestaurantId")?.trim() ||
          undefined;
      }
    }
    // Send to backend (proxy will forward with the shared secret)
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
      console.warn(
        "[browser-push] register failed",
        res.status,
        text.slice(0, 200),
      );
      return null;
    }
    console.info("[browser-push] partnersite FCM token registered");
    return token;
  } catch (e) {
    console.warn("[browser-push] getToken failed:", (e as Error).message);
    return null;
  }
}

export function onBrowserPushForeground(cb: (payload: MessagePayload) => void): () => void {
  const messaging = getMessagingSafe();
  if (!messaging) return () => undefined;
  return onMessage(messaging, cb);
}
