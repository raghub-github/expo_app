"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/auth/device-id-client";
import { safeSameOriginPath } from "@/lib/auth/auth-redirect-url";
import { clearPushSessionDismissed } from "@/lib/browser-push/partner-push-state";
import { PartnerAccountLoadingSpinner } from "@/components/PartnerAccountLoadingSpinner";

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || hash.charAt(0) !== "#") return params;
  for (const part of hash.slice(1).split("&")) {
    const [key, value] = part.split("=").map((s) => decodeURIComponent(s || ""));
    if (key && value) params[key] = value;
  }
  return params;
}

type BrowserSupabase = ReturnType<typeof createClient>;
type CodeExchangeResult = Awaited<ReturnType<BrowserSupabase["auth"]["exchangeCodeForSession"]>>;

/** Survives React Strict Mode remount so the same OAuth code is exchanged once. */
const codeExchanges = new Map<string, Promise<CodeExchangeResult>>();

function exchangeCodeOnce(supabase: BrowserSupabase, code: string): Promise<CodeExchangeResult> {
  const existing = codeExchanges.get(code);
  if (existing) return existing;
  const next = supabase.auth.exchangeCodeForSession(code);
  codeExchanges.set(code, next);
  return next;
}

function isPkceOrFlowStateError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("pkce") ||
    lower.includes("code verifier") ||
    lower.includes("flow state")
  );
}

function friendlyAuthError(message: string): string {
  if (isPkceOrFlowStateError(message)) {
    return "Google sign-in did not complete in this tab. Please try again.";
  }
  return message;
}

async function setCookieAndRedirect(
  accessToken: string,
  refreshToken: string,
  next: string,
  loginMethod?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const device_id = getOrCreateDeviceId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/merchant-auth/set-cookie", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        device_id,
        ...(loginMethod ? { login_method: loginMethod } : {}),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.ok) {
      clearPushSessionDismissed();
      return { ok: true };
    }
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
      <PartnerAccountLoadingSpinner label={message || "Loading your account..."} />
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fail = (msg: string) => {
      // Keep the spinner — painting the raw PKCE/SSR essay here is what merchants
      // see even when the first exchange already logged them in.
      router.replace(`/auth?error=${encodeURIComponent(friendlyAuthError(msg))}`);
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
            next,
            "app_handoff"
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
            const result = await setCookieAndRedirect(accessToken, refreshToken, next, "google");
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
          const { data, error: exchangeError } = await exchangeCodeOnce(supabase, code);
          if (exchangeError) {
            const existing = await supabase.auth.getSession();
            const recovered = existing.data.session;
            if (recovered?.access_token && recovered.refresh_token) {
              const result = await setCookieAndRedirect(
                recovered.access_token,
                recovered.refresh_token,
                next,
                "google",
              );
              if (result.ok) {
                sessionStorage.removeItem("auth_redirect");
                window.location.replace(safeSameOriginPath(next, window.location.origin));
                return;
              }
            }
            fail(exchangeError.message);
            return;
          }
          const session = data.session;
          if (!session?.access_token || !session.refresh_token) {
            fail("authentication_failed");
            return;
          }
          const result = await setCookieAndRedirect(
            session.access_token,
            session.refresh_token,
            next,
            "google"
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

  return <LoadingSpinner />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
