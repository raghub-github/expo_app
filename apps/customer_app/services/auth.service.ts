/**
 * Auth service – Supabase OTP (via Send SMS hook / MSG91) + backend session exchange.
 *
 * Flow:
 *  1. sendOtp   → Supabase signInWithOtp (Supabase triggers Send SMS hook → MSG91).
 *  2. verifyOtp → Supabase verifyOtp, then exchange Supabase token for backend session.
 *  3. Backend finds-or-creates customer row and returns a backend JWT.
 */

import type { Session } from "@gatimitra/contracts";
import api from "./api";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

const AUTH_PREFIX = "/v1/auth";

export type SendOtpPayload = { phoneE164: string };
export type VerifyOtpPayload = {
  phoneE164: string;
  otp: string;
  deviceId: string;
};

export const authService = {
  /**
   * Send OTP via Supabase Auth (triggers the Send SMS hook → MSG91).
   * Falls back to backend /otp/request if Supabase is not configured.
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    const supabase = getSupabaseAuth();
    if (supabase) {
      const { error } = await supabase.auth.signInWithOtp({
        phone: payload.phoneE164,
        options: { channel: "sms", shouldCreateUser: true },
      });
      if (error) throw new Error(error.message);
      return;
    }
    // Fallback: backend-owned OTP (for dev when Supabase is not configured)
    await api.post(`${AUTH_PREFIX}/otp/request`, payload, { timeout: 15000 });
  },

  /**
   * Verify OTP via Supabase Auth, then exchange the Supabase access token
   * for a backend customer session (JWT + customer row).
   * Falls back to backend /otp/verify if Supabase is not configured.
   */
  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const supabase = getSupabaseAuth();
    if (supabase) {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: payload.phoneE164,
        token: payload.otp,
        type: "sms",
      });
      if (error) throw new Error(error.message);
      const sbToken = data?.session?.access_token;
      if (!sbToken) throw new Error("No session returned from Supabase after OTP verify.");
      const { data: session } = await api.post<Session>(
        `${AUTH_PREFIX}/supabase/exchange-customer`,
        { accessToken: sbToken, phoneE164: payload.phoneE164, deviceId: payload.deviceId },
        { timeout: 15000 },
      );
      return session;
    }
    // Fallback: backend-owned OTP
    const body = { ...payload, requestId: "", appType: "customer" as const };
    const { data } = await api.post<Session>(`${AUTH_PREFIX}/otp/verify`, body, { timeout: 15000 });
    return data;
  },

  async persistSession(session: Session): Promise<void> {
    await setItem(STORAGE_KEYS.AUTH_TOKEN, session.accessToken);
    await setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
  },

  async clearSession(): Promise<void> {
    await removeItem(STORAGE_KEYS.AUTH_TOKEN);
    await removeItem(STORAGE_KEYS.AUTH_SESSION);
  },

  async logoutAllDevices(): Promise<void> {
    await api.post("/v1/me/logout-all", {}, { timeout: 10000 });
  },

  async getStoredSession(): Promise<Session | null> {
    const raw = await getItem(STORAGE_KEYS.AUTH_SESSION);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Session;
      if (session.accessToken) return session;
    } catch {
      // ignore
    }
    return null;
  },
};
