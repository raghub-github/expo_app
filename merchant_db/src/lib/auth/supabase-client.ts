/**
 * Supabase Auth helpers for merchant dashboard (client-only).
 * Google OAuth and Phone OTP are configured in Supabase Dashboard — no Google client/secret in app .env.
 */

import { supabase } from "@/lib/supabase";

export interface AuthResponse {
  success: boolean;
  error?: string;
  data?: { url?: string; session?: { access_token: string; refresh_token: string } };
}

/** Redirect to Google sign-in (Supabase OAuth). Configure Google in Supabase Dashboard > Authentication > Providers. */
export async function signInWithGoogle(redirectTo?: string): Promise<AuthResponse> {
  try {
    if (typeof window === "undefined") {
      return { success: false, error: "Must be called from the client" };
    }
    const baseUrl = window.location.origin;
    const redirectUrl = redirectTo || `${baseUrl}/auth/callback`;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("auth_redirect", "/auth/post-login");
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
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Request OTP via email (Supabase). Enable Email in Supabase Dashboard; use 6-digit OTP template. */
export async function requestEmailOTP(email: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Verify email OTP (6-digit). */
export async function verifyEmailOTP(email: string, token: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: "email",
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Request OTP via phone (Supabase). Enable Phone provider in Supabase Dashboard. */
export async function requestPhoneOTP(phone: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "").slice(-10)}`,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
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
    const normalized = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "").slice(-10)}`;
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token,
      type: "sms",
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
