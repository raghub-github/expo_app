"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { logAuthEvent } from "@/lib/auth/log";
import { httpFailureMessage, isServerUnavailable, readJsonSafe } from "@/lib/http/readJson";

/**
 * Google OAuth return path — same auth restriction as email OTP:
 * 1) exchange code / read session
 * 2) /api/auth/can-login (active super admin only)
 * 3) /api/auth/set-cookie (re-checks system_users + SUPER_ADMIN)
 *
 * On a genuine refusal: wipe local + cookie auth and send to /login?denied=1.
 *
 * On the server being unreachable: say so and offer a retry, and do NOT wipe
 * the session. This page previously had no error path at all — every failure,
 * including an unhandled throw from parsing nginx's HTML 504 as JSON, left it
 * showing "Completing sign-in…" forever with nothing to act on.
 */
function CallbackInner() {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const deny = async (userId: string | undefined, reason: string) => {
      logAuthEvent("LOGIN_REJECT", { userId, reason });
      await wipeCoredashBrowserAuth(userId);
      if (!cancelled) router.replace("/login?denied=1");
    };

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
          // The browser client runs with detectSessionInUrl:true, so it may have
          // ALREADY consumed this one-time PKCE code during initialization. In that
          // case this manual exchange fails ("code verifier"/"flow state"/"already
          // used") even though a valid session now exists. Don't fail hard here —
          // fall through and trust getSession() below. Only a genuinely missing
          // session (checked next) is treated as a failure.
          logAuthEvent("AUTH_CHANGE", { reason: `oauth_exchange_fallthrough:${error.message}` });
        }
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const email = session?.user?.email?.trim().toLowerCase() ?? "";
      if (!session?.access_token || !session.refresh_token || !session.user?.id || !email) {
        await wipeCoredashBrowserAuth();
        if (!cancelled) router.replace("/login?denied=1");
        return;
      }

      // Same gate as email OTP sendOtp() — reject before cookie is written.
      const gate = await fetch("/api/auth/can-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email }),
      });
      const gateJson = await readJsonSafe<{ success?: boolean; error?: string }>(gate);

      // An unreachable server is not a refusal. Wiping the session here would
      // throw away a perfectly good sign-in because the backend was briefly down.
      if (isServerUnavailable(gate) || (!gate.ok && gateJson === null)) {
        if (!cancelled) setFailure(httpFailureMessage(gate, gateJson));
        return;
      }
      if (!gate.ok || !gateJson?.success) {
        await deny(session.user.id, "oauth_can_login_denied");
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
      const json = await readJsonSafe<{ success?: boolean; userId?: string; email?: string }>(res);

      if (isServerUnavailable(res) || (!res.ok && json === null)) {
        if (!cancelled) setFailure(httpFailureMessage(res, json));
        return;
      }
      if (
        !res.ok ||
        !json?.success ||
        json.userId !== session.user.id ||
        (json.email || "").trim().toLowerCase() !== email
      ) {
        await wipeCoredashBrowserAuth(session.user.id);
        if (!cancelled) router.replace("/login?denied=1");
        return;
      }
      logAuthEvent("LOGIN", {
        userId: json.userId,
        email: json.email,
        reason: "oauth_callback",
      });
      if (!cancelled) router.replace("/overview");
    })().catch((error) => {
      // Nothing above may leave the page on the spinner. Before this catch, a
      // single unhandled rejection stranded the user with no message at all.
      console.error("[coredash:auth] callback failed", error);
      if (!cancelled) setFailure("Sign-in could not be completed. Please try again.");
    });

    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  if (failure) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F4F6FF] px-6 text-center">
        <p className="max-w-sm text-sm text-[#44405F]">{failure}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-md bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="rounded-md border border-[#CDCBE0] px-4 py-2 text-sm font-medium text-[#44405F]"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

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
