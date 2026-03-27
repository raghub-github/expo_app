"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { postSetCookieWithTokens } from "@/lib/auth/sync-server-session";

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

function AuthCallbackLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 px-4">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <Logo variant="full" size="md" className="w-full max-w-[160px] sm:max-w-[200px]" />
        </div>
        <div className="space-y-4">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
          <p className="text-sm font-medium text-gray-700 sm:text-base">Completing authentication...</p>
          <p className="text-xs text-gray-500 sm:text-sm">Please wait while we sign you in</p>
        </div>
      </div>
    </div>
  );
}
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const next = sessionStorage.getItem("auth_redirect") || "/dashboard";

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
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setError) {
            router.push(`/login?error=${encodeURIComponent(setError.message)}`);
            return;
          }
          const result = await setCookieAndRedirect(accessToken, refreshToken, next);
          if (!result.ok) {
            await supabase.auth.signOut();
            router.push(`/login?error=${encodeURIComponent(result.error)}`);
            return;
          }
          sessionStorage.removeItem("auth_redirect");
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          window.location.href = next;
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
        if (data?.session) {
          const result = await setCookieAndRedirect(
            data.session.access_token,
            data.session.refresh_token,
            next
          );
          if (!result.ok) {
            await supabase.auth.signOut();
            router.push(`/login?error=${encodeURIComponent(result.error)}`);
            return;
          }
          sessionStorage.removeItem("auth_redirect");
          window.location.href = next;
          return;
        }
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
          await supabase.auth.signOut();
          router.push("/login?reason=session_invalid");
          return;
        }
        sessionError = err as { message?: string };
      }
      if (sessionError) {
        if (isInvalidRefreshToken(sessionError)) {
          await supabase.auth.signOut();
          router.push("/login?reason=session_invalid");
          return;
        }
        router.push(`/login?error=${encodeURIComponent(sessionError.message ?? "Session error")}`);
        return;
      }
      if (session) {
        const result = await setCookieAndRedirect(
          session.access_token,
          session.refresh_token,
          next
        );
        if (!result.ok) {
          await supabase.auth.signOut();
          router.push(`/login?error=${encodeURIComponent(result.error)}`);
          return;
        }
        sessionStorage.removeItem("auth_redirect");
        window.location.href = next;
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
