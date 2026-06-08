/**
 * Rider auth service — same production architecture as customer/merchant apps.
 *
 * Phone flow:
 *  1. sendOtp   → Supabase signInWithOtp (Send SMS hook → MSG91), or backend /otp/request fallback
 *  2. verifyOtp → Supabase verifyOtp → /supabase/exchange-rider, or backend /otp/verify fallback
 */

import type { Session } from "@gatimitra/contracts";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { getSupabaseAuth, getSupabaseOtpEnvDebugInfo } from "@/src/lib/supabaseClient";

const AUTH_PREFIX = "/v1/auth";

export class RiderAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RiderAuthError";
    this.code = code;
  }
}

export function isRiderAuthError(e: unknown): e is RiderAuthError {
  return e instanceof RiderAuthError;
}

export type SendOtpPayload = { phoneE164: string };
export type VerifyOtpPayload = {
  phoneE164: string;
  otp: string;
  deviceId: string;
};

export type RiderStatusResponse = {
  exists: boolean;
  riderId?: string;
  userId: string;
  onboardingStatus?: "not_started" | "in_progress" | "pending_approval" | "approved" | "rejected";
  approvalStatus?: string;
};

/** Set after successful backend /otp/request; cleared on verify or new send. */
let _lastBackendOtpRequestId: string | null = null;

function shouldSendPhoneOtpViaBackend(): boolean {
  const { phoneOtpUseBackendOnly } = getRiderAppConfig();
  if (phoneOtpUseBackendOnly) return true;
  return getSupabaseAuth() == null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function apiBaseUrl(): string {
  return resolveUrlForDevice(getRiderAppConfig().apiBaseUrl);
}

function throwIfExchangeFailed(res: Response, dataJson: Record<string, unknown>, fallbackMessage: string): void {
  if (res.ok) return;
  const errCode = typeof dataJson.error === "string" ? dataJson.error : "";
  const serverMessage = typeof dataJson.message === "string" ? dataJson.message : "";
  const msg = serverMessage || errCode || fallbackMessage;
  if (errCode === "device_session_unavailable") {
    throw new RiderAuthError(
      "device_session_unavailable",
      serverMessage || "Could not start your session on this device. Please try again.",
    );
  }
  if (errCode === "invalid_otp") {
    throw new Error("Invalid OTP. Please check the code and try again.");
  }
  if (errCode === "otp_expired") {
    throw new Error("OTP expired. Tap Resend to get a new code.");
  }
  if (errCode === "too_many_attempts") {
    throw new Error("Too many attempts. Request a new OTP and try again.");
  }
  throw new Error(msg);
}

function assertSession(dataJson: Record<string, unknown>): asserts dataJson is Session {
  if (!dataJson.accessToken || !dataJson.userId) {
    throw new Error("Session response missing access token.");
  }
}

function normalizeOtpErrorMessage(message: string): string {
  if (/expired|invalid/i.test(message)) {
    return "Invalid or expired OTP. Please request a new code.";
  }
  return message;
}

function isNetworkFetchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|network error|aborted/i.test(msg);
}

async function sendOtpViaBackend(phoneE164: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneE164 }),
    });
  } catch (error) {
    if (isNetworkFetchError(error)) {
      throw new Error(
        "Cannot reach the API server. Check EXPO_PUBLIC_API_BASE_URL and that the backend is running on your network.",
      );
    }
    throw error;
  }

  const raw = await res.text();
  let dataJson: Record<string, unknown> = {};
  try {
    dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new Error("Invalid response from server while requesting OTP.");
  }
  if (!res.ok) {
    const msg =
      (typeof dataJson.message === "string" && dataJson.message) ||
      (typeof dataJson.error === "string" && dataJson.error) ||
      `Could not send OTP (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  const rid = typeof dataJson.requestId === "string" ? dataJson.requestId : "";
  if (!rid) {
    throw new Error("Server did not return an OTP request id.");
  }
  _lastBackendOtpRequestId = rid;
}

export const riderAuthService = {
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;
    const viaBackend = shouldSendPhoneOtpViaBackend();

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] sendOtp", {
        channel: viaBackend ? "backend" : "supabase",
        supabase: getSupabaseOtpEnvDebugInfo(),
      });
    }

    if (viaBackend) {
      await sendOtpViaBackend(payload.phoneE164);
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error(
        "Supabase is not configured for rider OTP. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (same project as customer/merchant app).",
      );
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: payload.phoneE164,
        options: { channel: "sms", shouldCreateUser: true },
      });
      if (error) {
        const hint =
          /hook|sms|provider|phone/i.test(error.message || "")
            ? " Check Supabase Phone Auth, Send SMS hook, and backend MSG91 config."
            : "";
        throw new Error((error.message || "Could not send OTP via Supabase.") + hint);
      }
    } catch (error) {
      if (isNetworkFetchError(error)) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log("[RiderAuth] Supabase unreachable, falling back to backend OTP");
        }
        await sendOtpViaBackend(payload.phoneE164);
        return;
      }
      throw error;
    }
  },

  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const backendRequestId = _lastBackendOtpRequestId;
    if (backendRequestId) {
      const res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: backendRequestId,
          phoneE164: payload.phoneE164,
          otp: payload.otp,
          deviceId: payload.deviceId,
          appType: "rider",
        }),
      });
      const raw = await res.text();
      let dataJson: Record<string, unknown> = {};
      try {
        dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Invalid response from server while verifying OTP.");
      }
      throwIfExchangeFailed(res, dataJson, "Could not verify OTP or create rider session.");
      assertSession(dataJson);
      _lastBackendOtpRequestId = null;
      return dataJson;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("OTP not requested yet. Tap \"Send OTP\" first and wait for the code.");
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone: payload.phoneE164,
      token: payload.otp,
      type: "sms",
    });
    if (error) {
      throw new Error(normalizeOtpErrorMessage(error.message || "Invalid OTP."));
    }
    const sbToken = data?.session?.access_token;
    if (!sbToken) {
      throw new Error("No session returned from Supabase after OTP verify.");
    }

    const res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/supabase/exchange-rider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: sbToken,
        phoneE164: payload.phoneE164,
        deviceId: payload.deviceId,
      }),
    });
    const raw = await res.text();
    let dataJson: Record<string, unknown> = {};
    try {
      dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error("Invalid response from server while exchanging Supabase token.");
    }
    throwIfExchangeFailed(res, dataJson, "Could not create rider session after OTP verify.");
    assertSession(dataJson);
    return dataJson;
  },

  /** Retry backend exchange when Supabase session is still valid (device session errors). */
  async exchangeRiderFromCurrentSupabaseSession(payload: {
    phoneE164: string;
    deviceId: string;
  }): Promise<Session> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error("Your sign-in code expired. Please request a new OTP.");
    }
    const res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/supabase/exchange-rider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: data.session.access_token,
        phoneE164: payload.phoneE164,
        deviceId: payload.deviceId,
      }),
    });
    const raw = await res.text();
    let dataJson: Record<string, unknown> = {};
    try {
      dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error("Invalid response from server while exchanging Supabase token.");
    }
    throwIfExchangeFailed(res, dataJson, "Could not create rider session.");
    assertSession(dataJson);
    return dataJson;
  },

  async getRiderStatus(accessToken: string): Promise<RiderStatusResponse> {
    const res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/rider-status`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const raw = await res.text();
    let dataJson: Record<string, unknown> = {};
    try {
      dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error("Invalid response while loading rider status.");
    }
    if (!res.ok) {
      throw new Error(
        (typeof dataJson.message === "string" && dataJson.message) ||
          (typeof dataJson.error === "string" && dataJson.error) ||
          "Could not load rider status.",
      );
    }
    return dataJson as RiderStatusResponse;
  },
};
