"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { COREDASH_COOKIE_OPTIONS } from "@/lib/auth/access";
import { logAuthEvent } from "@/lib/auth/log";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let lastLoggedUserId: string | null = null;

export function getBrowserSupabase() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  browserClient = createBrowserClient(url, key, {
    isSingleton: false,
    cookieOptions: COREDASH_COOKIE_OPTIONS,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  browserClient.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    const nextId = session?.user?.id ?? null;
    const nextEmail = session?.user?.email ?? null;
    logAuthEvent("AUTH_CHANGE", {
      from: lastLoggedUserId,
      to: nextId,
      email: nextEmail,
      reason: event,
    });
    lastLoggedUserId = nextId;
  });
  return browserClient;
}

export function resetBrowserSupabase() {
  browserClient = null;
  lastLoggedUserId = null;
}
