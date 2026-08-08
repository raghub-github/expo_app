/**
 * Supabase Auth helpers for merchant dashboard (client-only).
 * Google OAuth and Phone OTP are configured in Supabase Dashboard — no Google client/secret in app .env.
 *
 * OAuth redirect uses the current origin. We redirect to /auth/callback so it matches your
 * Supabase Redirect URLs list; the callback page then forwards to /api/auth/callback for
 * server-side code exchange and cookie setting (reliable on all devices).
 *
 * Supabase Dashboard > Authentication > URL Configuration (for partner app at partner.gatimitra.com):
 * - Site URL: use https://partner.gatimitra.com (not gatimitra.com or localhost) so cookies and redirects use the correct domain.
 * - Redirect URLs: must include https://partner.gatimitra.com/auth/callback and http://localhost:3002/auth/callback.
 */

import { createClient } from "@/lib/supabase/client";

export interface AuthResponse {
  success: boolean;
  error?: string;
  data?: {
    url?: string;
    session?: { access_token: string; refresh_token: string; user?: { id: string } };
    user?: { id: string };
  };
}

/** Shown to merchants when Supabase email OTP rate limit is hit. */
export const OTP_RATE_LIMIT_USER_MESSAGE =
  "OTP generation failed. Try again after 5 min.";

/**
 * Base URL for OAuth redirect. Prefer the browser origin, but never use 0.0.0.0
 * (non-routable — causes ERR_ADDRESS_INVALID + PKCE cookie loss after Google/phone auth).
 */
function getAuthRedirectBaseUrl(): string {
  const sanitize = (raw: string): string => {
    try {
      const u = new URL(raw);
      if (u.hostname === "0.0.0.0" || u.hostname === "::") {
        u.hostname = "localhost";
      }
      return u.origin;
    } catch {
      return "http://localhost:3002";
    }
  };
  if (typeof window !== "undefined") {
    return sanitize(window.location.origin);
  }
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_PARTNER_SITE_URL || "").trim();
  if (fromEnv) return sanitize(fromEnv);
  return "http://localhost:3002";
}

/** Redirect to Google sign-in (Supabase OAuth). Configure Google in Supabase Dashboard > Authentication > Providers. */
export async function signInWithGoogle(redirectTo?: string): Promise<AuthResponse> {
  try {
    if (typeof window === "undefined") {
      return { success: false, error: "Must be called from the client" };
    }
    const supabase = createClient();
    const baseUrl = getAuthRedirectBaseUrl();
    const redirectUrl = redirectTo || `${baseUrl}/auth/callback`;
    if (typeof window !== "undefined") {
      const existing = sessionStorage.getItem("auth_redirect");
      if (!existing) sessionStorage.setItem("auth_redirect", "/partners/all-stores");
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: "select_account", // Always show Google account picker (like main dashboard)
        },
      },
    });
    if (error) return { success: false, error: error.message };
    if (data?.url) {
      window.location.href = data.url;
      return { success: true, data: { url: data.url } };
    }
    return { success: true, data: data as unknown as AuthResponse["data"] };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Safely get a string message from Supabase/auth error (never return object or "{}"). */
function toErrorMessage(err: unknown): string {
  if (err == null) return "Something went wrong. Please try again.";
  if (typeof err === "string") return err.trim() || "Something went wrong. Please try again.";
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  if (typeof err === "object" && err !== null && "error" in err && typeof (err as { error?: unknown }).error === "string") {
    return (err as { error: string }).error;
  }
  return "Something went wrong. Please try again.";
}

/** Request OTP via email (Supabase). Enable Email in Supabase Dashboard; use 8-digit OTP template. */
export async function requestEmailOTP(email: string): Promise<AuthResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      const errorMsg = toErrorMessage(error);
      // Check for rate limit errors
      if (
        errorMsg.toLowerCase().includes("rate limit") ||
        errorMsg.toLowerCase().includes("rate_limit") ||
        errorMsg.toLowerCase().includes("too many") ||
        errorMsg.toLowerCase().includes("exceeded") ||
        (error as { code?: string; status?: number }).code === "429" ||
        (error as { code?: string; status?: number }).status === 429
      ) {
        return {
          success: false,
          error: "EMAIL_RATE_LIMIT_EXCEEDED",
        };
      }
      // Map common SMTP/email errors to user-friendly messages
      if (errorMsg.toLowerCase().includes("confirmation email") || errorMsg.toLowerCase().includes("magic link") || errorMsg.toLowerCase().includes("sending")) {
        return {
          success: false,
          error: "Could not send verification email. Please check your SMTP settings in Supabase (use smtppro.zoho.com for custom domain) or try again later.",
        };
      }
      return { success: false, error: errorMsg };
    }
    return { success: true, data: data as unknown as AuthResponse["data"] };
  } catch (e) {
    const errorMsg = toErrorMessage(e);
    if (
      errorMsg.toLowerCase().includes("rate limit") ||
      errorMsg.toLowerCase().includes("rate_limit") ||
      errorMsg.toLowerCase().includes("too many") ||
      errorMsg.toLowerCase().includes("exceeded")
    ) {
      return {
        success: false,
        error: "EMAIL_RATE_LIMIT_EXCEEDED",
      };
    }
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/** Verify email OTP (8-digit). */
export async function verifyEmailOTP(email: string, token: string): Promise<AuthResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: "email",
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as AuthResponse["data"] };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Request OTP via phone (Supabase). Supabase generates 6-digit OTP. Requires Send SMS Hook (e.g. /api/auth/send-sms) or built-in SMS provider. */
export async function requestPhoneOTP(phone: string): Promise<AuthResponse> {
  try {
    const supabase = createClient();
    const normalized = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "").slice(-10)}`;
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { channel: "sms" },
    });
    if (error) {
      const msg = error.message || "Unknown error";
      // 422 usually means SMS provider not configured
      if (
        msg.toLowerCase().includes("provider") ||
        msg.toLowerCase().includes("sms") ||
        msg.toLowerCase().includes("422") ||
        msg.toLowerCase().includes("unprocessable")
      ) {
        return {
          success: false,
          error:
            "SMS is not configured. Configure an SMS provider (Twilio, MessageBird, etc.) or a Send SMS Hook in Supabase Dashboard → Authentication → Providers → Phone, then try again.",
        };
      }
      return { success: false, error: msg };
    }
    return { success: true, data: data as unknown as AuthResponse["data"] };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Verify phone OTP. */
export async function verifyPhoneOTP(phone: string, token: string): Promise<AuthResponse> {
  try {
    const supabase = createClient();
    const normalized = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "").slice(-10)}`;
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token,
      type: "sms",
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as AuthResponse["data"] };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
