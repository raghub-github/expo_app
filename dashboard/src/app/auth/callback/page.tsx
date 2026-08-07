"use client";

import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";
import { Suspense, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { postSetCookieWithTokens } from "@/lib/auth/sync-server-session";
import { markDashboardFreshLogin } from "@/lib/dashboard-auth-client-state";

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || hash.charAt(0) !== "#") return params;
  const query = hash.slice(1);
  for (const part of query.split("&")) {
    const [key, value] = part.split("=").map((s) => decodeURIComponent(s || ""));
    if (key && value) params[key] = value;
  }
  return params;
}

async function setCookieAndRedirect(
  accessToken: string,
  refreshToken: string,
  _next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return postSetCookieWithTokens(accessToken, refreshToken);
}

function LogoSigningSpinner() {
  return (
    <>
      <div className="relative inline-flex h-[59px] w-[166px] items-center justify-center sm:h-[73px] sm:w-[206px]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 206 73"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="authCallbackSpinnerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="45%" stopColor="#ca8a04" />
              <stop offset="100%" stopColor="#0891b2" />
            </linearGradient>
          </defs>
          <rect
            x="1.25"
            y="1.25"
            width="203.5"
            height="70.5"
            rx="12"
            ry="12"
            stroke="rgba(203, 213, 225, 0.55)"
            strokeWidth="2.5"
          />
          <rect
            x="1.25"
            y="1.25"
            width="203.5"
            height="70.5"
            rx="12"
            ry="12"
            stroke="url(#authCallbackSpinnerGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="120 430"
            className="auth-callback-spinner-stroke motion-reduce:animate-none"
          />
        </svg>
        <div className="relative flex h-[53px] w-[160px] items-center justify-center rounded-[8px] bg-white sm:h-[67px] sm:w-[200px] sm:rounded-[10px]">
          <Logo
            variant="full"
            size="md"
            className="block h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:object-contain"
          />
        </div>
      </div>
      <style>{`
        @keyframes authCallbackSpinnerStroke {
          to {
            stroke-dashoffset: -550;
          }
        }
        .auth-callback-spinner-stroke {
          animation: authCallbackSpinnerStroke 2.8s linear infinite;
        }
      `}</style>
    </>
  );
}

function AuthCallbackLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 px-4">
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <LogoSigningSpinner />
        </div>
        <p className="text-sm font-medium text-gray-600 sm:text-base">
          Almost there... Welcome to GatiMitra 🌐
        </p>
      </div>
    </div>
  );
}
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const handleCallback = async () => {
      const next = sessionStorage.getItem("auth_redirect") || "/dashboard";

      const syncCookiesFromSession = async (
        session: { access_token: string; refresh_token: string } | null | undefined
      ) => {
        if (!session?.access_token || !session.refresh_token) {
          return { ok: false as const, error: "authentication_failed" };
        }
        return setCookieAndRedirect(session.access_token, session.refresh_token, next);
      };

      const finishLogin = (redirectTo: string) => {
        sessionStorage.removeItem("auth_redirect");
        markDashboardFreshLogin();
        window.location.replace(redirectTo);
      };

      // 1) Query error (e.g. OAuth error_description)
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");
      if (error) {
        router.push(`/login?error=${encodeURIComponent(errorDescription || error)}`);
        return;
      }

      // 2) Hash-based OAuth (e.g. #access_token=...&refresh_token=...)
      if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = parseHashParams(window.location.hash);
        const accessToken = hashParams.access_token;
        const refreshToken = hashParams.refresh_token;
        if (accessToken && refreshToken) {
          const { data, error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setError) {
            router.push(`/login?error=${encodeURIComponent(setError.message)}`);
            return;
          }
          const result = await syncCookiesFromSession(data.session);
          if (!result.ok) {
            await supabase.auth.signOut();
            router.push(`/login?error=${encodeURIComponent(result.error)}`);
            return;
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          finishLogin(next);
          return;
        }
      }

      // 3) PKCE code exchange (?code=...)
      const code = searchParams.get("code");
      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          router.push(`/login?error=${encodeURIComponent(exchangeError.message)}`);
          return;
        }
        const session = data.session;
        if (!session?.access_token || !session.refresh_token) {
          router.push("/login?error=authentication_failed");
          return;
        }
        const result = await syncCookiesFromSession(session);
        if (!result.ok) {
          await supabase.auth.signOut();
          router.push(`/login?error=${encodeURIComponent(result.error)}`);
          return;
        }
        finishLogin(next);
        return;
      }

      // 4) Existing session (e.g. return visit)
      let session: { access_token: string; refresh_token: string } | null = null;
      let sessionError: { message?: string } | null = null;
      try {
        const result = await supabase.auth.getSession();
        session = result.data?.session ?? null;
        sessionError = result.error ?? null;
      } catch (err) {
        if (isInvalidRefreshToken(err)) {
          await signOutIfSessionDead(supabase, err);
          router.push("/login?reason=session_invalid");
          return;
        }
        sessionError = err as { message?: string };
      }
      if (sessionError) {
        if (isInvalidRefreshToken(sessionError)) {
          await signOutIfSessionDead(supabase, sessionError);
          router.push("/login?reason=session_invalid");
          return;
        }
        router.push(`/login?error=${encodeURIComponent(sessionError.message ?? "Session error")}`);
        return;
      }
      if (session) {
        const result = await syncCookiesFromSession(session);
        if (!result.ok) {
          await supabase.auth.signOut();
          router.push(`/login?error=${encodeURIComponent(result.error)}`);
          return;
        }
        finishLogin(next);
        return;
      }

      router.push("/login?error=authentication_failed");
    };

    handleCallback();
  }, [router, searchParams]);

  return <AuthCallbackLoading />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackLoading />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
