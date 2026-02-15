"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Store, Phone, ArrowRight } from "lucide-react";
import { signInWithGoogle, requestPhoneOTP, verifyPhoneOTP } from "@/lib/auth/supabase-client";
import { ENABLE_PHONE_OTP_LOGIN } from "@/lib/auth/phone-otp-config";

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : "";
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const registered = searchParams.get("registered");
  const queryError = searchParams.get("error");

  const normalizeLoginError = (raw: string) => {
    const message = (raw || "").trim();
    if (!message) return "";
    if (message === "authentication_failed") {
      return "Authentication failed. Please try signing in again.";
    }
    if (message.toLowerCase().includes("no merchant account found")) {
      return "No merchant account found for this login. Please register first.";
    }
    return message;
  };

  useEffect(() => {
    if (registered === "1") setError("");
  }, [registered]);

  useEffect(() => {
    const normalized = normalizeLoginError(queryError || "");
    if (normalized) setError(normalized);
  }, [queryError]);

  const setSessionAndRedirect = async (access_token: string, refresh_token: string) => {
    const res = await fetch("/api/auth/set-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Session could not be set.");
    }
    window.location.href = "/auth/post-login";
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error || "Google sign-in failed.");
      setGoogleLoading(false);
    }
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = normalizePhone(phone);
    if (!p) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const result = await requestPhoneOTP(p);
      if (!result.success) {
        const msg = result.error || "Failed to send OTP.";
        if (msg.toLowerCase().includes("unsupported phone provider") || msg.toLowerCase().includes("phone provider")) {
          setError("SMS is not configured. Please sign in with Google or email & password, or contact support.");
        } else {
          setError(msg);
        }
        return;
      }
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = normalizePhone(phone);
    if (!p || otp.trim().length < 4) {
      setError("Enter the OTP you received.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOTP(p, otp.trim());
      if (!result.success) {
        setError(result.error || "Invalid or expired OTP.");
        return;
      }
      if (!result.data?.session?.access_token || !result.data?.session?.refresh_token) {
        setError("Session could not be created. Try again.");
        return;
      }
      await setSessionAndRedirect(
        result.data.session.access_token,
        result.data.session.refresh_token
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 mb-4">
            <img src="/logo.png" alt="GatiMitra" className="h-12 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Merchant Login</h1>
          <p className="text-slate-600 text-sm mt-1">
            {ENABLE_PHONE_OTP_LOGIN ? "Sign in with Google or mobile OTP" : "Sign in with Google"}
          </p>
        </div>

        {registered === "1" && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
            Registration successful. You can sign in with Google below.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-4">
            {/* 1) Google - same as main dashboard */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="group relative flex w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 sm:px-6 sm:py-4"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-blue-600">Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg className="h-6 w-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Continue with Google</span>
                  <ArrowRight className="ml-auto h-5 w-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Mobile OTP – shown only when ENABLE_PHONE_OTP_LOGIN is true (MSG91 configured) */}
            {ENABLE_PHONE_OTP_LOGIN && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-4 text-slate-500">Or continue with mobile</span>
                  </div>
                </div>
                {!otpSent ? (
                  <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Mobile number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="9876543210"
                          maxLength={10}
                          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">10-digit number. We’ll send an OTP via SMS (MSG91).</p>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || phone.replace(/\D/g, "").length !== 10}
                      className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send OTP"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                      OTP sent to <strong>+91 {phone.replace(/\D/g, "").slice(-10)}</strong>. Enter the code below.
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Enter OTP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="000000"
                        maxLength={8}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtp(""); setError(""); }}
                        className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium"
                      >
                        Change number
                      </button>
                      <button
                        type="submit"
                        disabled={loading || otp.length < 4}
                        className="flex-1 py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & sign in"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Not registered?{" "}
          <Link href="/auth/register" className="font-medium text-blue-600 hover:text-blue-700">
            Register first
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          <Link href="/auth" className="text-blue-600 hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
