"use client";

import { COREDASH_AUTH_COOKIE_NAME } from "@/lib/auth/access";
import { getBrowserSupabase, resetBrowserSupabase } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/auth/log";

function removeMatchingStorage(storage: Storage, prefix: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && (key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}-`))) {
      keys.push(key);
    }
  }
  for (const key of keys) storage.removeItem(key);
}

/** Local GoTrue + storage only. Does not call the server (safe before PKCE/OAuth). */
export async function clearCoredashBrowserAuthLocal(previousUserId?: string | null) {
  logAuthEvent("LOGOUT_CLIENT", { userId: previousUserId ?? null, reason: "local_wipe" });
  try {
    await getBrowserSupabase().auth.signOut({ scope: "local" });
  } catch {
    /* continue clearing storage */
  }
  try {
    removeMatchingStorage(window.localStorage, COREDASH_AUTH_COOKIE_NAME);
  } catch {
    /* ignore */
  }
  try {
    removeMatchingStorage(window.sessionStorage, COREDASH_AUTH_COOKIE_NAME);
  } catch {
    /* ignore */
  }
  resetBrowserSupabase();
}

/** Clear this app's auth only — never dashboard / other sb-* keys. */
export async function wipeCoredashBrowserAuth(previousUserId?: string | null) {
  await clearCoredashBrowserAuthLocal(previousUserId);
  await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" }).catch(
    () => undefined
  );
}
