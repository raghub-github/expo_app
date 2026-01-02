import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Env } from "../../config/env.js";

function getOrInitFirebaseAdmin(env: Env): App {
  if (getApps().length) return getApps()[0]!;

  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in backend/.env(.local).",
    );
  }

  // When stored in .env, newlines are typically escaped.
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export async function verifyFirebaseIdToken(env: Env, idToken: string) {
  const app = getOrInitFirebaseAdmin(env);
  const auth = getAuth(app);
  return await auth.verifyIdToken(idToken, true);
}


