/**
 * Firebase Auth ID-token verification.
 *
 * Thin wrapper around the shared Firebase Admin singleton in
 * `src/config/firebase.ts`. Kept as its own module so callers in auth
 * routes don't reach into the singleton directly.
 */
import { getFirebaseAuth } from "../../config/firebase.js";
import type { Env } from "../../config/env.js";

export async function verifyFirebaseIdToken(env: Env, idToken: string) {
  return getFirebaseAuth(env).verifyIdToken(idToken, true);
}
