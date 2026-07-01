/**
 * Web push helper for dashboard. Identical shape to partnersite's helper —
 * see partnersite/src/lib/browser-push/firebase-web.ts for detailed docs.
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

export async function registerBrowserPushToken(_userId: string): Promise<string | null> {
  const messaging = getMessagingSafe();
  if (!messaging) return null;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[browser-push] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing.");
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return null;
    await fetch("/api/super-admin/notifications/browser-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, platform: "web" }),
    }).catch(() => undefined);
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
