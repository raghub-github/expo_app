"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getBrowserSupabase } from "@/lib/supabase/client";
import Image from "next/image";
import { Activity, Loader2, Mail, ShieldCheck, Store, Users } from "lucide-react";
import { LoginHeroCharts } from "@/components/login/LoginHeroCharts";
import { GMV_FULL } from "@/lib/format";
import { NOT_AUTHORIZED } from "@/lib/auth/access";
import { toastNotAuthorized } from "@/lib/auth/notify";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { logAuthEvent } from "@/lib/auth/log";

const FEATURES = [
  { title: "GMV and orders", detail: GMV_FULL },
  { title: "Rider fleet", detail: "Online, KYC, earnings" },
  { title: "Store network", detail: "Live merchants by city" },
  { title: "Collections", detail: "UPI, cash, GatiCash" },
];

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/overview";
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [gateReady, setGateReady] = useState(false);

  function enterApp() {
    router.replace(redirectTo);
    router.refresh();
  }

  async function establishSession(
    accessToken: string,
    refreshToken: string,
    expectedUserId: string,
    expectedEmail: string
  ) {
    const res = await fetch("/api/auth/set-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      userId?: string;
      email?: string;
    };
    const expected = expectedEmail.trim().toLowerCase();
    if (
      !res.ok ||
      !json.success ||
      json.userId !== expectedUserId ||
      (json.email || "").trim().toLowerCase() !== expected
    ) {
      await wipeCoredashBrowserAuth(expectedUserId);
      throw new Error(json.error || NOT_AUTHORIZED);
    }
    logAuthEvent("LOGIN", {
      userId: json.userId,
      email: json.email,
      reason: "session_established",
    });
  }

  function failAuth(err?: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (!message || message === NOT_AUTHORIZED) toastNotAuthorized();
    else toast.error(message);
  }

  useEffect(() => {
    let cancelled = false;
    setGateReady(false);

    if (searchParams.get("denied") === "1") {
      toastNotAuthorized();
      router.replace("/login");
    }

    void wipeCoredashBrowserAuth().then(() => {
      if (!cancelled) setGateReady(true);
    });

    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      setGateReady(false);
      void wipeCoredashBrowserAuth().then(() => {
        if (!cancelled) setGateReady(true);
      });
    }
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [searchParams, router]);

  async function sendOtp() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const gate = await fetch("/api/auth/can-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = (await gate.json()) as { success?: boolean; error?: string };
      if (!gate.ok || !json.success) {
        toastNotAuthorized();
        return;
      }
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setSent(true);
      toast.success("OTP sent to your email");
    } catch (err) {
      failAuth(err);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    try {
      const expectedEmail = email.trim().toLowerCase();
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: expectedEmail,
        token: otp.trim(),
        type: "email",
      });
      if (error) throw error;
      const session = data.session;
      const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? "";
      if (
        !session?.access_token ||
        !session.refresh_token ||
        !session.user?.id ||
        sessionEmail !== expectedEmail
      ) {
        await wipeCoredashBrowserAuth();
        throw new Error(NOT_AUTHORIZED);
      }
      await establishSession(
        session.access_token,
        session.refresh_token,
        session.user.id,
        expectedEmail
      );
      enterApp();
    } catch (err) {
      await wipeCoredashBrowserAuth();
      failAuth(err);
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setGoogleLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setGoogleLoading(false);
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.08fr_0.92fr]">
      <section
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex"
        style={{ background: "linear-gradient(165deg, #4B49AC 0%, #3A3894 45%, #2C2A78 100%)" }}
      >
        <LoginHeroCharts />
        <div className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            Business analytics · live ops
          </p>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-tight tracking-tight">
            See the whole company from one control surface.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            Performance, payments, fleet, merchants, and support — live from the same
            Postgres database as the operations dashboard.
          </p>

          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { icon: Activity, label: "Live pulse", value: "Orders · GST · payouts" },
              { icon: Users, label: "Fleet", value: "Riders online & KYC" },
              { icon: Store, label: "Network", value: "Stores accepting now" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md">
                <item.icon className="h-4 w-4 text-[#98BDFF]" strokeWidth={1.7} />
                <p className="mt-2 text-[12px] font-semibold">{item.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/65">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex max-w-lg items-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-3 py-2.5 text-[12px] text-white/75 backdrop-blur-md">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#98BDFF]" strokeWidth={1.7} />
            Role-gated · super admin only. Same account as Control Dashboard.
          </div>
        </div>

        <div className="relative z-10 mt-8 grid max-w-lg grid-cols-2 gap-3">
          {FEATURES.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-md">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-white/60">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#F4F6FF] px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-[#E4E7F7] bg-white p-8 shadow-[0_20px_50px_rgba(75,73,172,0.08)]">
          <div className="mb-5">
            <Image
              src="/logo.png"
              alt="GatiMitra"
              width={220}
              height={72}
              className="h-12 w-auto"
              unoptimized
              priority
            />
          </div>
          <h2 className="text-2xl font-semibold text-[#1E1C4A]">Sign in</h2>
          <p className="mt-1 text-[13px] text-[#6B6894]">Super admin access only. Same GatiMitra account.</p>

          <button
            type="button"
            onClick={() => void google()}
            disabled={googleLoading || !gateReady}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#E4E7F7] bg-white px-4 py-2.5 text-sm font-medium text-[#1E1C4A] hover:bg-[#F4F6FF] disabled:opacity-60"
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[#6B6894]">
            <span className="h-px flex-1 bg-[#E4E7F7]" />
            or email OTP
            <span className="h-px flex-1 bg-[#E4E7F7]" />
          </div>

          <label className="text-[12px] font-medium text-[#6B6894]">Work email</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#E4E7F7] px-3">
            <Mail className="h-4 w-4 text-[#7DA0FA]" />
            <input
              className="h-11 w-full bg-transparent text-sm outline-none"
              placeholder="you@gatimitra.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {sent && (
            <>
              <label className="mt-4 block text-[12px] font-medium text-[#6B6894]">OTP</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-[#E4E7F7] px-3 text-sm outline-none"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="8-digit code"
              />
            </>
          )}

          <button
            type="button"
            disabled={loading || !gateReady}
            onClick={() => void (sent ? verify() : sendOtp())}
            className="mt-5 flex w-full items-center justify-center rounded-xl bg-[#4B49AC] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3A3894] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? "Verify and enter" : "Send OTP"}
          </button>
        </div>
      </section>
    </div>
  );
}
