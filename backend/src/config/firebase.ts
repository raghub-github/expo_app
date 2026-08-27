/**
 * Firebase Admin singleton — the ONE place the backend talks to Firebase.
 *
 * Consumers:
 *   • Firebase Auth ID-token verification (auth/firebaseAdmin.ts)
 *   • FCM v1 messaging (NotificationService, Phase 2)
 *
 * Credential resolution order (first match wins):
 *   1. GOOGLE_APPLICATION_CREDENTIALS  → file path to serviceAccountKey.json
 *   2. FCM_SERVICE_ACCOUNT_JSON        → full JSON string (single line, escaped quotes)
 *   3. FIREBASE_{PROJECT_ID,CLIENT_EMAIL,PRIVATE_KEY} trio (legacy inline)
 *   4. Application Default Credentials (Cloud Run / GCE ambient creds)
 *
 * The init is lazy + idempotent so importing this module on a code path that
 * never sends a notification has zero cost. The same App handle is returned
 * across all callers, so we never trip the firebase-admin "default app already
 * exists" error.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { Env } from "./env.js";

let cached: App | null = null;

function loadServiceAccountFromJsonString(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `FCM_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the entire downloaded service-account file as a single line. (${(e as Error).message})`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.project_id !== "string" ||
    typeof obj.client_email !== "string" ||
    typeof obj.private_key !== "string"
  ) {
    throw new Error(
      "FCM_SERVICE_ACCOUNT_JSON missing required fields (project_id, client_email, private_key). Did you paste only the private key by mistake?",
    );
  }
  return {
    projectId: obj.project_id,
    clientEmail: obj.client_email,
    privateKey: obj.private_key,
  };
}

function loadServiceAccountFromFile(path: string): ServiceAccount {
  const abs = resolvePath(process.cwd(), path);
  let buf: Buffer;
  try {
    buf = readFileSync(abs);
  } catch (e) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS points to "${path}" (resolved "${abs}") which cannot be read: ${(e as Error).message}`,
    );
  }
  return loadServiceAccountFromJsonString(buf.toString("utf-8"));
}

/**
 * True when explicit Firebase Admin credentials are present in env.
 * Used to avoid preferring native FCM over Expo when Admin cannot send.
 */
export function isFirebaseAdminConfigured(env?: Partial<Env> | null): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  const fcmJson =
    (typeof env?.FCM_SERVICE_ACCOUNT_JSON === "string" && env.FCM_SERVICE_ACCOUNT_JSON) ||
    process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (typeof fcmJson === "string" && fcmJson.trim().length >= 40) return true;
  const projectId =
    (typeof env?.FIREBASE_PROJECT_ID === "string" && env.FIREBASE_PROJECT_ID) ||
    process.env.FIREBASE_PROJECT_ID;
  const clientEmail =
    (typeof env?.FIREBASE_CLIENT_EMAIL === "string" && env.FIREBASE_CLIENT_EMAIL) ||
    process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey =
    (typeof env?.FIREBASE_PRIVATE_KEY === "string" && env.FIREBASE_PRIVATE_KEY) ||
    process.env.FIREBASE_PRIVATE_KEY;
  if (
    typeof projectId === "string" &&
    projectId.trim() &&
    typeof clientEmail === "string" &&
    clientEmail.trim() &&
    typeof privateKey === "string" &&
    privateKey.trim().length >= 30
  ) {
    return true;
  }
  return false;
}

/**
 * Initialise (or return) the Firebase Admin app singleton. Safe to call
 * many times across modules — only the first call actually does work.
 */
export function getFirebaseApp(env: Env): App {
  if (cached) return cached;
  const existing = getApps();
  if (existing.length > 0 && existing[0]) {
    cached = existing[0];
    return cached;
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const svc = loadServiceAccountFromFile(env.GOOGLE_APPLICATION_CREDENTIALS);
    cached = initializeApp({ credential: cert(svc) });
    return cached;
  }

  if (env.FCM_SERVICE_ACCOUNT_JSON) {
    const svc = loadServiceAccountFromJsonString(env.FCM_SERVICE_ACCOUNT_JSON);
    cached = initializeApp({ credential: cert(svc) });
    return cached;
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    cached = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    return cached;
  }

  try {
    cached = initializeApp({ credential: applicationDefault() });
    return cached;
  } catch {
    throw new Error(
      "Firebase Admin is not configured. Set ONE of: GOOGLE_APPLICATION_CREDENTIALS (file path), FCM_SERVICE_ACCOUNT_JSON (inline JSON), or the FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY trio in backend/.env.",
    );
  }
}

export function getFirebaseAuth(env: Env): Auth {
  return getAuth(getFirebaseApp(env));
}

export function getFirebaseMessaging(env: Env): Messaging {
  return getMessaging(getFirebaseApp(env));
}
