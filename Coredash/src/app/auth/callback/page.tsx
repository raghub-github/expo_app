"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { logAuthEvent } from "@/lib/auth/log";

function CallbackInner() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const hasOAuthParams =
        url.searchParams.has("code") || url.hash.includes("access_token") || url.hash.includes("refresh_token");
      if (!hasOAuthParams) {
        if (!cancelled) router.replace("/login");
        return;
      }

      const supabase = getBrowserSupabase();
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          await wipeCoredashBrowserAuth();
          if (!cancelled) router.replace("/login?denied=1");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.access_token || !session.refresh_token || !session.user?.id) {
        await wipeCoredashBrowserAuth();
        if (!cancelled) router.replace("/login");
        return;
      }

      const res = await fetch("/api/auth/set-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });
      const json = (await res.json()) as { success?: boolean; userId?: string; email?: string };
      if (
        !res.ok ||
        !json.success ||
        json.userId !== session.user.id ||
        (json.email || "").trim().toLowerCase() !== (session.user.email || "").trim().toLowerCase()
      ) {
        await wipeCoredashBrowserAuth(session.user.id);
        if (!cancelled) router.replace(`/login?denied=1`);
        return;
      }
      logAuthEvent("LOGIN", {
        userId: json.userId,
        email: json.email,
        reason: "oauth_callback",
      });
      if (!cancelled) router.replace("/overview");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6FF] text-sm text-[#6B6894]">
      Completing sign-in…
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4F6FF]" />}>
      <CallbackInner />
    </Suspense>
  );
}
