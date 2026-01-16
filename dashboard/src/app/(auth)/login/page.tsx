"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestEmailOTP, verifyOTP, signInWithGoogle } from "@/lib/auth/supabase";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  // Check for error in URL params (e.g., from OAuth callback or validation failures)
  useEffect(() => {
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

    const searchParams = new URLSearchParams(window.location.search);
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await requestEmailOTP(email);

    if (result.success) {
      setOtpSent(true);
      setError("");
      // Show success message
      console.log("OTP request successful. Check your email for the verification code.");
    } else {
      setError(result.error || "Failed to send OTP. Please try again.");
    }

    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await verifyOTP(email, otp, "email");

    if (result.success && result.data?.session) {
      // Set cookies on the server so middleware can see the session
      // The set-cookie endpoint will validate the user exists and has roles
      try {
        const setCookieResponse = await fetch("/api/auth/set-cookie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token,
          }),
        });

        if (!setCookieResponse.ok) {
          let errorMessage = "Your account is not authorized to access this portal. Please contact an administrator.";
          try {
            const contentType = setCookieResponse.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await setCookieResponse.json();
              errorMessage = errorData.error || errorMessage;
            } else {
              const errorText = await setCookieResponse.text();
              errorMessage = errorText || errorMessage;
            }
          } catch (parseError) {
            console.error("Error parsing error response:", parseError);
            // Use default error message
          }
          // Sign out from Supabase if validation failed
          await supabase.auth.signOut();
          setError(errorMessage);
          setLoading(false);
          return;
        }

        // Redirect to dashboard after successful OTP verification and validation
        router.push("/dashboard");
        router.refresh();
      } catch (cookieError) {
        console.error("Error setting cookies:", cookieError);
        setError("Failed to complete login. Please try again.");
        setLoading(false);
      }
    } else {
      setError(result.error || "Invalid OTP. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");

    const result = await signInWithGoogle();
    
    if (!result.success) {
      setError(result.error || "Google login failed. Please try again.");
      setGoogleLoading(false);
    }
    // If successful, the user will be redirected to Google OAuth
    // The callback handler will process the redirect
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="w-full max-w-md space-y-5">
        {/* Logo Section */}
        <div className="flex flex-col items-center space-y-2">
          <div className="flex justify-center -mb-1">
            <Logo variant="full" size="md" className="w-full max-w-[140px] sm:max-w-[180px]" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Welcome Back
            </h1>
            <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">
              Sign in to access your dashboard
            </p>
          </div>
        </div>

        {/* Main Login Card */}
        <div className="rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-gray-200 sm:p-7">
          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-red-800 sm:text-sm">{error}</p>
            </div>
          )}

          {/* Google Login - Primary Option */}
          <div className="space-y-4">
            <div>
              <button
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
                className="group relative flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:text-base sm:px-6 sm:py-4"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span className="text-blue-600">Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-6 w-6" viewBox="0 0 24 24">
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
                    <span>Continue with Google</span>
                    <ArrowRight className="ml-auto h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-gray-500">Or continue with email</span>
              </div>
            </div>

            {/* OTP Login - Secondary Option */}
            <form
              onSubmit={otpSent ? handleVerifyOTP : handleRequestOTP}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email-otp" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="email-otp"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={otpSent || loading}
                    placeholder="Enter your email"
                    className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm placeholder-gray-400 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>

              {otpSent && (
                <div>
                  <label htmlFor="otp" className="block text-sm font-semibold text-gray-700 mb-2">
                    Enter Verification Code
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-center text-lg font-mono tracking-widest text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                      style={{ color: '#111827' }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    We sent a verification code to <span className="font-medium text-gray-700">{email}</span>
                  </p>
                  <p className="mt-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    📧 Check your inbox (and spam folder) for the code. Enter the first 6 digits above.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                      setError("");
                    }}
                    className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Use a different email
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:px-6 sm:py-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{otpSent ? "Verifying..." : "Sending code..."}</span>
                  </>
                ) : (
                  <>
                    {otpSent ? (
                      <>
                        <Lock className="h-4 w-4" />
                        <span>Verify Code</span>
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        <span>Send Verification Code</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </form>
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
