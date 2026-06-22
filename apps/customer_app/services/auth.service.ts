/**
 * Auth service – Supabase OTP (via Send SMS hook / MSG91) + backend session exchange.
 *
 * Flow (same pattern as merchant / rider apps):
 *  1. sendOtp   → Supabase signInWithOtp (Send SMS hook → MSG91), or backend /otp/request
 *  2. verifyOtp → Supabase verifyOtp → exchange-customer, or backend /otp/verify
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

/** Set after successful backend /otp/request; cleared on verify or new send. */
let _lastBackendOtpRequestId: string | null = null;

function shouldSendPhoneOtpViaBackend(): boolean {
  const { phoneOtpUseBackendOnly } = getConfig();
  if (phoneOtpUseBackendOnly) return true;
  return getSupabaseAuth() == null;
}

function isSupabaseSmsDeliveryError(message: string): boolean {
  return /hook|sms|provider|phone|otp|twilio|msg91|send|deliver|rate.?limit|too many/i.test(message);
}

async function sendOtpViaBackend(payload: SendOtpPayload): Promise<void> {
  try {
    const { data, status } = await api.post<{ requestId?: string; message?: string; error?: string }>(
      `${AUTH_PREFIX}/otp/request`,
      payload,
      { timeout: 15000 },
    );
    const rid = typeof data?.requestId === "string" ? data.requestId : "";
    if (!rid) {
      throw new Error("Server did not return an OTP request id.");
    }
    _lastBackendOtpRequestId = rid;
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[CustomerAuth] sendOtp: backend OK", { requestId: rid, status });
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
}

export const authService = {
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;
    const viaBackend = shouldSendPhoneOtpViaBackend();

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[CustomerAuth] sendOtp", {
        channel: viaBackend ? "backend" : "supabase",
        supabase: getSupabaseOtpEnvDebugInfo(),
      });
    }

    if (viaBackend) {
      await sendOtpViaBackend(payload);
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      await sendOtpViaBackend(payload);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: payload.phoneE164,
      options: { channel: "sms", shouldCreateUser: true },
    });

    if (__DEV__ && error) {
      // eslint-disable-next-line no-console
      console.warn("[CustomerAuth] sendOtp: Supabase error", {
        message: error.message,
        code: (error as { code?: string }).code,
        status: (error as { status?: number }).status,
      });
    }

    if (error) {
      const errMsg = error.message || "Could not send OTP via Supabase.";
      if (isSupabaseSmsDeliveryError(errMsg)) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[CustomerAuth] sendOtp: falling back to backend MSG91");
        }
        await sendOtpViaBackend(payload);
        return;
      }
      const hint = isSupabaseSmsDeliveryError(errMsg)
        ? " Check Supabase Phone Auth, Send SMS hook, and backend MSG91 config."
        : "";
      throw new Error(errMsg + hint);
    }
  },

  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const backendRequestId = _lastBackendOtpRequestId;
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
      return data;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("OTP not requested yet. Tap Send OTP first and wait for the code.");
    }

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
