/**
 * Auth service — same OTP architecture as merchant / rider apps.
 *
 * Flow (Phone):
 *  1. sendOtp   → Supabase signInWithOtp (Send SMS hook → MSG91)
 *  2. verifyOtp → Supabase verifyOtp → exchange-customer
 *
 * Fallback when Supabase is not configured or EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true:
 *  1. sendOtp   → POST /v1/auth/otp/request + MSG91
 *  2. verifyOtp → POST /v1/auth/otp/verify (appType: customer)
 */

import type { Session } from "@gatimitra/contracts";
import api from "./api";
import { getConfig } from "@/config/env";
import { getSupabaseAuth, getSupabaseOtpEnvDebugInfo } from "@/lib/supabaseClient";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

const AUTH_PREFIX = "/v1/auth";

export type SendOtpPayload = { phoneE164: string };
export type VerifyOtpPayload = {
  phoneE164: string;
  otp: string;
  deviceId: string;
};

/** Set after successful `POST /v1/auth/otp/request`; cleared on verify or new send. */
let _lastBackendOtpRequestId: string | null = null;

function shouldSendPhoneOtpViaBackend(): boolean {
  const { phoneOtpUseBackendOnly } = getConfig();
  if (phoneOtpUseBackendOnly) return true;
  return getSupabaseAuth() == null;
}

function normalizeOtpErrorMessage(message: string): string {
  const msg = String(message || "").trim();
  const lower = msg.toLowerCase();
  if (lower.includes("expired or is invalid")) return "Invalid OTP.";
  if (lower.includes("invalid otp") || (lower.includes("invalid") && lower.includes("token"))) {
    return "Invalid OTP.";
  }
  if (lower.includes("expired")) return "OTP expired. Request a new OTP.";
  return msg || "Invalid OTP.";
}

export const authService = {
  /**
   * Send OTP — same as merchant: Supabase signInWithOtp when configured (Send SMS hook → MSG91).
   * Set EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true only when Supabase hook cannot reach your API.
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;
    const viaBackend = shouldSendPhoneOtpViaBackend();
    const phoneTail = payload.phoneE164.replace(/\D/g, "").slice(-4);

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[CustomerAuth] sendOtp: start", {
        phoneTail: phoneTail ? `…${phoneTail}` : "(short)",
        channel: viaBackend ? "backend" : "supabase",
        supabase: getSupabaseOtpEnvDebugInfo(),
      });
    }

    if (viaBackend) {
      try {
        const { data } = await api.post<{ requestId?: string; message?: string; error?: string }>(
          `${AUTH_PREFIX}/otp/request`,
          payload,
          { timeout: 15000 },
        );
        const rid = typeof data?.requestId === "string" ? data.requestId : "";
        if (!rid) {
          throw new Error("Server did not return an OTP request id. Check backend /v1/auth/otp/request.");
        }
        _lastBackendOtpRequestId = rid;
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log(
            "[CustomerAuth] sendOtp: backend OK — SMS via MSG91 on API server.",
            (data as { otp?: string }).otp != null ? { devOtp: (data as { otp?: string }).otp } : {},
          );
        }
      } catch (e: unknown) {
        const ax = e as {
          message?: string;
          response?: { data?: { message?: string; error?: string }; status?: number };
        };
        const serverMsg =
          ax?.response?.data?.message ??
          (typeof ax?.response?.data?.error === "string" ? ax.response.data.error : null);
        if (serverMsg) throw new Error(serverMsg);
        throw e instanceof Error ? e : new Error("Unable to send OTP. Please try again.");
      }
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error(
        "Supabase is not configured for customer OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }

    // Normalize phone to strict E.164 — Supabase rejects mixed formats. Match
    // the partnersite implementation that works in production.
    const normalizedPhone = payload.phoneE164.startsWith("+")
      ? payload.phoneE164
      : `+91${payload.phoneE164.replace(/\D/g, "").slice(-10)}`;

    // IMPORTANT: do NOT pass `shouldCreateUser: true` for phone OTP. With the
    // Send SMS Hook configured in the Supabase project, the explicit
    // shouldCreateUser flag triggers a user-creation flow that races the
    // hook and Supabase returns 500 `unexpected_failure` for already-known
    // numbers. Partnersite + merchant (after this fix) both omit it.
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: { channel: "sms" },
    });

    if (__DEV__) {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[CustomerAuth] sendOtp: Supabase error", {
          message: error.message,
          name: error.name,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          phoneE164: normalizedPhone,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log(
          "[CustomerAuth] sendOtp: Supabase OK — SMS via Send SMS Hook → MSG91.",
        );
      }
    }

    if (error) {
      const msg = error.message || "Could not send OTP via Supabase.";
      const hint = /provider|sms|phone|hook/i.test(msg)
        ? " Check Supabase Dashboard → Auth → Providers → Phone (enabled) + Auth → Hooks → Send SMS (URL + secret)."
        : "";
      // Supabase rate-limits per phone after a few failed attempts. Surface
      // the common cases clearly.
      if ((error as { status?: number }).status === 429 || /rate.?limit|too many/i.test(msg)) {
        throw new Error("Too many OTP attempts on this number. Wait an hour or use a different number.");
      }
      throw new Error(msg + hint);
    }
  },

  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const backendRequestId = _lastBackendOtpRequestId;

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[CustomerAuth] verifyOtp: start", {
        channel: backendRequestId ? "backend" : "supabase",
        phoneTail: payload.phoneE164.replace(/\D/g, "").slice(-4),
      });
    }

    if (backendRequestId) {
      const { data } = await api.post<Session>(
        `${AUTH_PREFIX}/otp/verify`,
        {
          requestId: backendRequestId,
          phoneE164: payload.phoneE164,
          otp: payload.otp,
          deviceId: payload.deviceId,
          appType: "customer",
        },
        { timeout: 15000 },
      );
      _lastBackendOtpRequestId = null;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[CustomerAuth] verifyOtp: backend OK");
      }
      return data;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error('OTP not requested yet. Tap "Send OTP" first and wait for the code.');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone: payload.phoneE164,
      token: payload.otp,
      type: "sms",
    });

    if (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[CustomerAuth] verifyOtp: Supabase error", { message: error.message });
      }
      throw new Error(normalizeOtpErrorMessage(error.message || "Invalid OTP."));
    }

    const sbToken = data?.session?.access_token;
    if (!sbToken) {
      throw new Error("No session returned from Supabase after OTP verify.");
    }

    const { data: session } = await api.post<Session>(
      `${AUTH_PREFIX}/supabase/exchange-customer`,
      { accessToken: sbToken, phoneE164: payload.phoneE164, deviceId: payload.deviceId },
      { timeout: 15000 },
    );

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[CustomerAuth] verifyOtp: Supabase + exchange-customer OK");
    }
    return session;
  },

  /** Retry exchange when Supabase session is still valid after a failed backend exchange. */
  async exchangeCustomerFromCurrentSupabaseSession(payload: {
    phoneE164: string;
    deviceId: string;
  }): Promise<Session> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error("OTP expired. Request a new OTP.");
    }
    const { data: session } = await api.post<Session>(
      `${AUTH_PREFIX}/supabase/exchange-customer`,
      {
        accessToken: data.session.access_token,
        phoneE164: payload.phoneE164,
        deviceId: payload.deviceId,
      },
      { timeout: 15000 },
    );
    return session;
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
