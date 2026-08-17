"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast, Toaster } from "sonner";
import { requestEmailOTP, verifyOTP, signInWithGoogle } from "@/lib/auth/supabase";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { safeParseJson } from "@/lib/utils";
import { Mail, Lock, Loader2 } from "lucide-react";
import { LoginToggle, type DashboardLoginTab } from "@/components/auth/LoginToggle";
import { saveBootstrapToStorage } from "@/lib/dashboard-bootstrap-storage";
import { postSetCookieWithTokens } from "@/lib/auth/sync-server-session";
import { clearStaleClientAuthStorage, readClientSessionFromStorage } from "@/lib/auth/client-session-storage";
import { markDashboardFreshLogin } from "@/lib/dashboard-auth-client-state";

const OTP_LENGTH = 8;
const TOAST_MS = 2000;

function showLoginError(msg: string) {
  if (!msg) return;
  const isAuthHint =
    msg.toLowerCase().includes("not registered") ||
    msg.toLowerCase().includes("not yet added") ||
    msg.toLowerCase().includes("create your account") ||
    msg.toLowerCase().includes("not authorized");
  toast.error(
    isAuthHint
      ? `${msg} Ask an admin to add your email in Dashboard → Users (ACTIVE + role).`
      : msg,
    { duration: TOAST_MS }
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [loginTab, setLoginTab] = useState<DashboardLoginTab>("google");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const otpRequestInFlightRef = useRef(false);
  const otpVerifyInFlightRef = useRef(false);
  const googleInFlightRef = useRef(false);

  // Check for error in URL params (e.g., from OAuth callback or validation failures)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const reason = searchParams.get("reason");

    if (reason === "session_invalid" || reason === "session_required") {
      void (async () => {
        // Prefer cookie-first status BEFORE wiping local storage. Opening /order
        // after a refresh race used to clear local auth while httpOnly cookies
        // were still valid — then the dashboard tab cascaded 401s.
        try {
          const statusRes = await fetch("/api/auth/session-status", {
            credentials: "include",
            cache: "no-store",
          });
          if (statusRes.ok) {
            const body = (await statusRes.json().catch(() => null)) as {
              authenticated?: boolean;
              expired?: boolean;
            } | null;
            if (body?.authenticated === true && body?.expired !== true) {
              const redirectParam = searchParams.get("redirect");
              const redirectTo =
                redirectParam?.startsWith("/") && !redirectParam.startsWith("//")
                  ? redirectParam
                  : "/dashboard";
              window.location.replace(redirectTo);
              return;
            }
          }
        } catch {
          // fall through to local clear
        }
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }
        searchParams.delete("reason");
        const qs = searchParams.toString();
        window.history.replaceState({}, "", qs ? `/login?${qs}` : "/login");
      })();
    }

    // Clear stale client-only sessions. Middleware uses httpOnly cookies; a local
    // Supabase session without those cookies must not navigate to /dashboard or
    // we get an endless login ↔ dashboard reload loop.
    void (async () => {
      try {
        const statusRes = await fetch("/api/auth/session-status", {
          credentials: "include",
          cache: "no-store",
        });
        if (statusRes.ok) {
          const body = (await statusRes.json().catch(() => null)) as {
            success?: boolean;
            authenticated?: boolean;
          } | null;
          if (body?.authenticated === true) {
            // Prevent a second bounce if dashboard sends us back once.
            if (sessionStorage.getItem("gm_login_autoredirect") === "1") {
              sessionStorage.removeItem("gm_login_autoredirect");
              await supabase.auth.signOut({ scope: "local" });
              return;
            }
            sessionStorage.setItem("gm_login_autoredirect", "1");
            const redirectParam = searchParams.get("redirect");
            const redirectTo =
              redirectParam?.startsWith("/") && !redirectParam.startsWith("//")
                ? redirectParam
                : "/dashboard";
            window.location.replace(redirectTo);
            return;
          }
        }
        sessionStorage.removeItem("gm_login_autoredirect");
        if (readClientSessionFromStorage()) {
          clearStaleClientAuthStorage();
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // ignore
          }
        }
      } catch {
        // stay on login
      }
    })();

    // Add global error handler to catch unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      // Prevent the error from showing in console if it's a JSON parse error from agent logs
      if (event.reason?.message?.includes("JSON") || event.reason?.message?.includes("Unexpected")) {
        event.preventDefault();
        console.warn("Suppressed JSON parsing error (likely from agent logging):", event.reason);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const errorParam = searchParams.get("error");
    if (errorParam) {
      showLoginError(decodeURIComponent(errorParam));
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpRequestInFlightRef.current || loading || googleLoading) return;
    otpRequestInFlightRef.current = true;
    setLoading(true);

    try {
      const result = await requestEmailOTP(email);

      if (result.success) {
        setOtpSent(true);
        toast.success(`We sent a verification code to ${email.trim()}`, {
          duration: TOAST_MS,
        });
      } else {
        showLoginError(result.error || "Failed to send OTP. Please try again.");
      }
    } finally {
      setLoading(false);
      otpRequestInFlightRef.current = false;
    }
  };

  const otpValue = otpDigits.join("");

  const setOtpDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    }
  }, [otpDigits]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const chars = pasted.split("");
    setOtpDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => { if (i < OTP_LENGTH) next[i] = c; });
      return next;
    });
    const focusIndex = Math.min(pasted.length, OTP_LENGTH) - 1;
    otpInputRefs.current[focusIndex]?.focus();
  }, []);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length !== OTP_LENGTH) return;
    if (otpVerifyInFlightRef.current || loading || googleLoading) return;
    otpVerifyInFlightRef.current = true;
    setLoading(true);

    try {
      const result = await verifyOTP(email, otp, "email");

      if (result.success && result.data?.session) {
      // Set cookies on the server so middleware can see the session
      // The set-cookie endpoint will validate the user exists and has roles
        try {
        const cookieResult = await postSetCookieWithTokens(
          result.data.session.access_token,
          result.data.session.refresh_token
        );

        if (!cookieResult.ok) {
          const errorMessage =
            cookieResult.error ||
            "Your account is not authorized to access this portal. Please contact an administrator.";
          await supabase.auth.signOut();
          showLoginError(errorMessage);
          setLoading(false);
          return;
        }

        // Preload dashboard bootstrap payload before we navigate so the dashboard
        // can render from cache instantly on first paint, then revalidate in the background.
        markDashboardFreshLogin();
        try {
          const bootstrapResponse = await fetch("/api/auth/bootstrap", {
            credentials: "include",
            cache: "no-store",
          });
          const text = await bootstrapResponse.text();
          const isJson = (bootstrapResponse.headers.get("content-type") ?? "").includes("application/json");
          if (bootstrapResponse.ok && isJson && text.trim()) {
            const parsed = safeParseJson<{
              success: boolean;
              data?: {
                session: { user: Record<string, unknown> };
                permissions: unknown;
                dashboardAccess: unknown;
              };
            }>(text, "");
            if (parsed?.success && parsed.data) {
              saveBootstrapToStorage(parsed.data);
            }
          }
        } catch {
          // Ignore bootstrap preload errors; dashboard will fall back to network.
        }

        // Full navigation so the next request has cookies and middleware sees the session.
        // replace() removes /login from history so Back does not return to the auth page.
        sessionStorage.removeItem("gm_login_autoredirect");
        window.location.replace("/dashboard");
        return;
        } catch (cookieError) {
          console.error("Error setting cookies:", cookieError);
          showLoginError("Failed to complete login. Please try again.");
        }
      } else {
        showLoginError(result.error || "Invalid OTP. Please try again.");
      }
    } finally {
      setLoading(false);
      otpVerifyInFlightRef.current = false;
    }
  };

  const handleGoogleLogin = async () => {
    if (googleInFlightRef.current || googleLoading || loading) return;
    googleInFlightRef.current = true;
    setGoogleLoading(true);

    try {
      const result = await signInWithGoogle();

      if (!result.success) {
        showLoginError(result.error || "Google login failed. Please try again.");
        setGoogleLoading(false);
      }
      // If successful, the user will be redirected to Google OAuth
      // The callback handler will process the redirect
    } finally {
      if (!window.location.href.includes("/auth/callback")) {
        googleInFlightRef.current = false;
      }
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-4 sm:px-6 sm:py-6 lg:px-8 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg.png')" }}
    >
      <Toaster position="top-right" richColors closeButton />
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px]" aria-hidden />
      <div className="relative z-10 w-full max-w-xl space-y-5">
        {/* Main Login Card — matches dashboard main area bg */}
        <div className="rounded-2xl border border-slate-300 bg-[#e8eef4] p-5 sm:p-8">
          {/* Header */}
          <div className="mb-5 px-1 text-center sm:px-2">
            <div className="mb-3 flex justify-center">
              <Logo variant="full" size="md" className="w-full max-w-[160px] sm:max-w-[200px]" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Welcome Back
            </h1>
            <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">
              Sign in to access your dashboard
            </p>
          </div>

          <LoginToggle
            value={loginTab}
            onChange={(tab) => {
              setLoginTab(tab);
            }}
            disabled={loading || googleLoading}
          />

          <div className="mt-6">
            {loginTab === "google" && (
              <button
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A88F]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-[#00A88F]" />
                    <span className="text-[#00A88F]">Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            )}

            {loginTab === "email" && (
            <form
              onSubmit={otpSent ? handleVerifyOTP : handleRequestOTP}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label htmlFor="email-otp" className="block text-sm font-semibold text-slate-800">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#00A88F]" />
                  <input
                    id="email-otp"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={otpSent || loading}
                    placeholder="Enter your email"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 focus:border-[#00A88F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A88F]/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                    suppressHydrationWarning
                  />
                </div>
              </div>

              {otpSent && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Enter Verification Code
                    </label>
                    <div className="flex justify-between gap-1.5 sm:gap-2">
                      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpInputRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={1}
                          value={otpDigits[i]}
                          onChange={(e) => setOtpDigit(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          onPaste={i === 0 ? handleOtpPaste : undefined}
                          className="h-11 w-9 flex-1 max-w-[2.75rem] rounded-lg border border-slate-200 bg-white text-center text-lg font-mono font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all focus:border-[#00A88F] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/25 sm:h-12 sm:max-w-[3rem]"
                          style={{ color: "#111827" }}
                          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpDigits(Array(OTP_LENGTH).fill(""));
                      }}
                      className="shrink-0 text-left text-sm font-medium text-[#00A88F] hover:text-[#009078] hover:underline"
                    >
                      Use a different email
                    </button>
                    <button
                      type="submit"
                      disabled={loading || googleLoading || otpValue.length !== OTP_LENGTH}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#00A88F] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#009078] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-w-[160px]"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          <span>Verify Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {!otpSent && (
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A88F] px-5 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#009078] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending code...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      <span>Send Verification Code</span>
                    </>
                  )}
                </button>
              )}
            </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 pt-2">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
