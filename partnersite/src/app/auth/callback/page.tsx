"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/auth/device-id-client";
import { Store } from "lucide-react";
import { safeSameOriginPath } from "@/lib/auth/auth-redirect-url";

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/merchant-auth/set-cookie", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, device_id }),
      signal: controller.signal,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "set-cookie failed";
    return { ok: false, error: msg.includes("abort") ? "Sign-in timed out. Please try again." : msg };
  } finally {
    clearTimeout(timer);
  }
}

async function redeemAppHandoff(handoffToken: string): Promise<{
  ok: true;
  access_token: string;
  refresh_token: string;
  next: string;
} | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/merchant-auth/app-handoff", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffToken }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      next?: string;
      error?: string;
    };
    if (!res.ok || !data.access_token || !data.refresh_token) {
      return { ok: false, error: data.error || "Handoff expired. Please try again from the app." };
    }
    return {
      ok: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      next: safeSameOriginPath(data.next, window.location.origin),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Handoff failed";
    return { ok: false, error: msg.includes("abort") ? "Sign-in timed out. Please try again." : msg };
  } finally {
    clearTimeout(timer);
  }
}

function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
      <div className="text-center space-y-6">
        <div className="inline-flex p-4 rounded-full bg-blue-100">
          <Store className="w-10 h-10 text-blue-600" />
        </div>
        <div className="space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent mx-auto" />
          <p className="text-sm font-medium text-slate-700">{message || "Completing sign in..."}</p>
          <p className="text-xs text-slate-500">Please wait</p>
        </div>
      </div>
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [fatal, setFatal] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fail = (msg: string) => {
      setFatal(msg);
      router.replace(`/auth/login?error=${encodeURIComponent(msg)}`);
    };

    const run = async () => {
      const overall = window.setTimeout(() => {
        fail("Sign-in took too long. Please try again from the merchant app.");
      }, 25_000);

      try {
        const redirectParam =
          searchParams?.get("redirect")?.trim() || searchParams?.get("next")?.trim() || "";
        // safeSameOriginPath rejects protocol-relative targets like "//evil.com",
        // which startsWith("/") happily accepts and the browser treats as off-site.
        let next =
          safeSameOriginPath(redirectParam, window.location.origin, "") ||
          (typeof window !== "undefined" ? sessionStorage.getItem("auth_redirect") || "" : "") ||
          "/partners/all-stores";
        if (next === "/auth" || next === "/auth/") next = "/partners/all-stores";
        if (typeof window !== "undefined" && next.startsWith("http")) {
          try {
            const nextUrl = new URL(next);
            if (nextUrl.origin !== window.location.origin) {
              next = nextUrl.pathname + nextUrl.search;
            }
          } catch {
            next = "/partners/all-stores";
          }
        }

        const error = searchParams?.get("error");
        const errorDescription = searchParams?.get("error_description");
        if (error) {
          fail(errorDescription || error);
          return;
        }

        // Merchant-app SSO: short-lived handoff JWT in query (Android drops #hash tokens).
        const handoffToken =
          searchParams?.get("t")?.trim() || searchParams?.get("handoff")?.trim() || "";
        if (handoffToken.length >= 20) {
          const redeemed = await redeemAppHandoff(handoffToken);
          if (!redeemed.ok) {
            fail(redeemed.error);
            return;
          }
          next = safeSameOriginPath(redeemed.next, window.location.origin, next);
          const supabase = createClient();
          await supabase.auth.setSession({
            access_token: redeemed.access_token,
            refresh_token: redeemed.refresh_token,
          });
          const result = await setCookieAndRedirect(
            redeemed.access_token,
            redeemed.refresh_token,
            next
          );
          if (!result.ok) {
            await supabase.auth.signOut().catch(() => {});
            fail(result.error);
            return;
          }
          sessionStorage.removeItem("auth_redirect");
          window.location.replace(safeSameOriginPath(next, window.location.origin));
          return;
        }

        const supabase = createClient();

        if (typeof window !== "undefined" && window.location.hash) {
          const hash = parseHashParams(window.location.hash);
          const accessToken = hash.access_token;
          const refreshToken = hash.refresh_token;
          const hashNext = hash.redirect || hash.next;
          const safeHashNext = safeSameOriginPath(hashNext, window.location.origin, "");
          if (safeHashNext) next = safeHashNext;
          if (accessToken && refreshToken) {
            const { error: setError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (setError) {
              fail(setError.message);
              return;
            }
            const result = await setCookieAndRedirect(accessToken, refreshToken, next);
            if (!result.ok) {
              await supabase.auth.signOut().catch(() => {});
              fail(result.error);
              return;
            }
            sessionStorage.removeItem("auth_redirect");
            window.location.replace(safeSameOriginPath(next, window.location.origin));
            return;
          }
        }

        const code = searchParams?.get("code");
        if (code) {
          // Delegate code exchange to the server-side API route to avoid PKCE
          // verifier mismatch when the browser tab/storage changes between login
          // and callback (e.g. magic-link opened in a different browser).
          const apiUrl = `/api/auth/callback?code=${encodeURIComponent(code)}${next && next !== "/partners/all-stores" ? `&next=${encodeURIComponent(next)}` : ""}`;
          sessionStorage.removeItem("auth_redirect");
          window.location.replace(apiUrl);
          return;
        }

        const sessionPromise = supabase.auth.getSession();
        const timed = await Promise.race([
          sessionPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
        ]);
        if (!timed) {
          fail("Sign-in timed out. Please try again.");
          return;
        }
        const {
          data: { session },
          error: sessionError,
        } = timed;
        if (sessionError) {
          fail(sessionError.message);
          return;
        }
        if (session) {
          const result = await setCookieAndRedirect(
            session.access_token,
            session.refresh_token,
            next
          );
          if (!result.ok) {
            await supabase.auth.signOut().catch(() => {});
            fail(result.error);
            return;
          }
          sessionStorage.removeItem("auth_redirect");
          window.location.replace(safeSameOriginPath(next, window.location.origin));
          return;
        }

        fail("authentication_failed");
      } finally {
        window.clearTimeout(overall);
      }
    };

    void run();
  }, [router, searchParams]);

  if (fatal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 bg-[#F4F7F8]">
        <p className="text-sm text-slate-700 text-center max-w-md">{fatal}</p>
        <a href="/auth/login" className="text-sm font-semibold text-teal-700 underline">
          Go to login
        </a>
      </div>
    );
  }

  return <LoadingSpinner />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
