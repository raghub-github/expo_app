/**
 * Merchant auth service – Supabase OTP (via Send SMS hook / MSG91) and Supabase Google OAuth + backend session exchange.
 *
 * Flow (Phone):
 *  1. sendOtp   → Supabase signInWithOtp (Supabase triggers Send SMS hook → MSG91).
 *  2. verifyOtp → Supabase verifyOtp, then exchange Supabase token for backend merchant session.
 *
 * Flow (Google):
 *  1. App uses Supabase signInWithOAuth(google) and opens browser; user signs in; Supabase redirects to app with tokens.
 *  2. exchangeSupabaseOAuth → backend exchange-merchant (no phoneE164); backend looks up partner by email from Supabase user.
 */

import { getSupabaseAuth } from "@/lib/supabaseClient";
import { getConfig } from "@/config/env";

const AUTH_PREFIX = "/v1/auth";

export type SendOtpPayload = { phoneE164: string };
export type VerifyOtpPayload = {
  phoneE164: string;
  otp: string;
  deviceId: string;
};

const { apiBaseUrl } = getConfig();

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export const merchantAuthService = {
  /**
   * Send OTP via Supabase Auth (triggers the Send SMS hook → MSG91).
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured for merchant OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: payload.phoneE164,
      options: { channel: "sms", shouldCreateUser: true },
    });
    if (error) {
      throw new Error(error.message || "Could not send OTP via Supabase.");
    }
  },

  /**
   * Verify OTP via Supabase Auth, then exchange the Supabase access token
   * for a backend merchant session (JWT + partner parent/child stores).
   */
  async verifyOtp(payload: VerifyOtpPayload): Promise<{
    accessToken: string;
    expiresAt: number;
    role: string;
    userId: string;
    partner: { parent: unknown; childStores: unknown[] };
  }> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured for merchant OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone: payload.phoneE164,
      token: payload.otp,
      type: "sms",
    });
    if (error) {
      throw new Error(error.message || "Invalid OTP.");
    }
    const sbToken = data?.session?.access_token;
    if (!sbToken) {
      throw new Error("No session returned from Supabase after OTP verify.");
    }

    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/supabase/exchange-merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: sbToken,
        phoneE164: payload.phoneE164,
        deviceId: payload.deviceId,
      }),
    });
    const raw = await res.text();
    let dataJson: any;
    try {
      dataJson = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Invalid response from server while exchanging Supabase token.");
    }
    if (!res.ok) {
      const msg: string =
        dataJson?.message ??
        dataJson?.error ??
        "Could not create merchant session after OTP verify.";
      throw new Error(msg);
    }
    if (!dataJson.accessToken || !dataJson.partner) {
      throw new Error("Merchant session response missing partner information.");
    }
    return dataJson as {
      accessToken: string;
      expiresAt: number;
      role: string;
      userId: string;
      partner: { parent: unknown; childStores: unknown[] };
    };
  },

  /**
   * Exchange a Supabase access token (from Google OAuth via Supabase) for a backend merchant partner session.
   * Backend looks up partner by owner_email from the Supabase user.
   */
  async exchangeSupabaseOAuth(payload: { accessToken: string; deviceId: string }): Promise<{
    accessToken: string;
    expiresAt: number;
    role: string;
    userId: string;
    partner: { parent: unknown; childStores: unknown[] };
  }> {
    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/supabase/exchange-merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: payload.accessToken,
        deviceId: payload.deviceId,
      }),
    });
    const raw = await res.text();
    let dataJson: any;
    try {
      dataJson = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Invalid response from server while exchanging Google sign-in.");
    }
    if (!res.ok) {
      const msg: string =
        dataJson?.message ??
        dataJson?.error ??
        "Could not create merchant session after Google sign-in.";
      throw new Error(msg);
    }
    if (!dataJson.accessToken || !dataJson.partner) {
      throw new Error("Merchant session response missing partner information.");
    }
    return dataJson as {
      accessToken: string;
      expiresAt: number;
      role: string;
      userId: string;
      partner: { parent: unknown; childStores: unknown[] };
    };
  },
};

