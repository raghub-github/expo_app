"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/auth/device-id-client";
import { Store } from "lucide-react";

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || hash.charAt(0) !== "#") return params;
  for (const part of hash.slice(1).split("&")) {
    const [key, value] = part.split("=").map((s) => decodeURIComponent(s || ""));
    if (key && value) params[key] = value;
  }
  return params;
}

async function setCookieAndRedirect(
  accessToken: string,
  refreshToken: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const device_id = getOrCreateDeviceId();
  const res = await fetch("/api/merchant-auth/set-cookie", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, device_id }),
  });
  const text = await res.text();
  if (res.ok) return { ok: true };
  let err = "Authentication failed";
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) err = parsed.error;
      else if (text.length < 300) err = text.trim();
    } catch {
      if (text.length < 300) err = text.trim();
    }
  }
  return { ok: false, error: err };
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
      <div className="text-center space-y-6">
        <div className="inline-flex p-4 rounded-full bg-blue-100">
          <Store className="w-10 h-10 text-blue-600" />
        </div>
        <div className="space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent mx-auto" />
          <p className="text-sm font-medium text-slate-700">Completing sign in...</p>
          <p className="text-xs text-slate-500">Please wait</p>
        </div>
      </div>
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const run = async () => {
      let next = typeof window !== "undefined" ? sessionStorage.getItem("auth_redirect") || "/auth/post-login" : "/auth/post-login";
      if (next === "/auth" || next === "/auth/") next = "/auth/post-login";
      // Ensure we always redirect on the current origin (avoid redirecting to localhost from production)
      if (typeof window !== "undefined" && next.startsWith("http")) {
        try {
          const nextUrl = new URL(next);
          if (nextUrl.origin !== window.location.origin) {
            next = nextUrl.pathname + nextUrl.search;
          }
        } catch {
          next = "/auth/post-login";
        }
      }

      const error = searchParams?.get("error");
      const errorDescription = searchParams?.get("error_description");
      if (error) {
        router.replace(`/auth/login?error=${encodeURIComponent(errorDescription || error)}`);
        return;
      }

      if (typeof window !== "undefined" && window.location.hash) {
        const hash = parseHashParams(window.location.hash);
        const accessToken = hash.access_token;
        const refreshToken = hash.refresh_token;
        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setError) {
            router.replace(`/auth/login?error=${encodeURIComponent(setError.message)}`);
            return;
          }
          const result = await setCookieAndRedirect(accessToken, refreshToken, next);
          if (!result.ok) {
            await supabase.auth.signOut();
            router.replace(`/auth/login?error=${encodeURIComponent(result.error)}`);
            return;
          }
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("auth_redirect");
            await new Promise((r) => setTimeout(r, 150));
            window.location.href = next.startsWith("/") ? next : `/${next.replace(/^\//, "")}`;
          }
          return;
        }
      }

      const code = searchParams?.get("code");
      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          const errMsg = exchangeError.message || "Could not complete sign in.";
          router.replace(`/auth/login?error=${encodeURIComponent(errMsg)}`);
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
            router.replace(`/auth/login?error=${encodeURIComponent(result.error)}`);
            return;
          }
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("auth_redirect");
            await new Promise((r) => setTimeout(r, 150));
            window.location.href = next.startsWith("/") ? next : `/${next.replace(/^\//, "")}`;
          }
          return;
        }
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        router.replace(`/auth/login?error=${encodeURIComponent(sessionError.message)}`);
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
          router.replace(`/auth/login?error=${encodeURIComponent(result.error)}`);
          return;
        }
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("auth_redirect");
          await new Promise((r) => setTimeout(r, 150));
          window.location.href = next.startsWith("/") ? next : `/${next.replace(/^\//, "")}`;
        }
        return;
      }

      router.replace("/auth/login?error=authentication_failed");
    };

    run();
  }, [router, searchParams]);

  return <LoadingSpinner />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
