/**
 * Rider auth service — mirrors merchant app OTP architecture.
 *
 * Phone flow (default — same as merchant):
 *  1. sendOtp   → Supabase signInWithOtp (Send SMS hook → MSG91 Flow DLT)
 *  2. verifyOtp → Supabase verifyOtp → /supabase/exchange-rider
 *
 * Fallback when Supabase is not configured or EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true:
 *  1. sendOtp   → POST /v1/auth/otp/request + MSG91
 *  2. verifyOtp → POST /v1/auth/otp/verify (appType: rider)
 */

import type { Session } from "@gatimitra/contracts";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { getSupabaseAuth, getSupabaseOtpEnvDebugInfo } from "@/src/lib/supabaseClient";

const AUTH_PREFIX = "/v1/auth";

/** Thrown when backend returns structured auth errors (e.g. device session could not be created). */
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

/** Set after successful `POST /v1/auth/otp/request`; cleared on new send or successful backend verify. */
let _lastBackendOtpRequestId: string | null = null;

function shouldSendPhoneOtpViaBackend(): boolean {
  const { phoneOtpUseBackendOnly } = getRiderAppConfig();
  if (phoneOtpUseBackendOnly) return true;
  return getSupabaseAuth() == null;
}

function isSupabaseSmsDeliveryError(message: string, status?: number): boolean {
  if (status != null && status >= 500) return true;
  return /hook|sms|provider|phone|otp|unexpected_failure|authretryablefetch|deliver|rate.?limit|too many/i.test(
    message,
  );
}

async function sendOtpViaBackend(payload: SendOtpPayload, phoneTail: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneE164: payload.phoneE164 }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/network request failed|failed to fetch|network error|aborted/i.test(msg)) {
      throw new Error("Unable to send OTP. Please try again.");
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
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[RiderAuth] SMS Failed (backend)", { status: res.status, dataJson, phoneTail });
    }
    const msg =
      (typeof dataJson.message === "string" && dataJson.message) ||
      (typeof dataJson.error === "string" && dataJson.error) ||
      "Unable to send OTP. Please try again.";
    throw new Error(msg);
  }

  const rid = typeof dataJson.requestId === "string" ? dataJson.requestId : "";
  if (!rid) {
    throw new Error("Server did not return an OTP request id. Check backend /v1/auth/otp/request.");
  }
  _lastBackendOtpRequestId = rid;

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[RiderAuth] SMS Sent (backend path)", {
      requestId: rid,
      smsSent: dataJson.smsSent === true,
      phoneTail,
    });
  }
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

function mapVerifyErrorCode(errCode: string, serverMessage: string, fallbackMessage: string): never {
  if (errCode === "device_session_unavailable") {
    throw new RiderAuthError(
      "device_session_unavailable",
      serverMessage || "Could not start your session on this device. Please try again.",
    );
  }
  if (errCode === "invalid_otp") {
    throw new Error("Invalid OTP.");
  }
  if (errCode === "otp_expired") {
    throw new Error("OTP expired. Request a new OTP.");
  }
  if (errCode === "too_many_attempts") {
    throw new Error("Too many attempts. Request a new OTP.");
  }
  if (errCode === "invalid_request_id" || errCode === "phone_mismatch") {
    throw new Error("OTP expired. Request a new OTP.");
  }
  if (errCode === "sms_delivery_failed") {
    throw new Error(serverMessage || "Unable to send OTP. Please try again.");
  }
  throw new Error(serverMessage || errCode || fallbackMessage);
}

function throwIfExchangeFailed(res: Response, dataJson: Record<string, unknown>, fallbackMessage: string): void {
  if (res.ok) return;
  const errCode = typeof dataJson.error === "string" ? dataJson.error : "";
  const serverMessage = typeof dataJson.message === "string" ? dataJson.message : "";
  mapVerifyErrorCode(errCode, serverMessage, fallbackMessage);
}

function assertSession(dataJson: Record<string, unknown>): asserts dataJson is Session {
  if (!dataJson.accessToken || !dataJson.userId) {
    throw new Error("Session response missing access token.");
  }
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

export const riderAuthService = {
  /**
   * Send OTP — same logic as merchantAuthService.sendOtp.
   * Default: Supabase signInWithOtp → Send SMS hook → MSG91 (proven merchant path).
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;

    const envInfo = getSupabaseOtpEnvDebugInfo();
    const viaBackend = shouldSendPhoneOtpViaBackend();
    const phoneTail = payload.phoneE164.replace(/\D/g, "").slice(-4);

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] OTP Requested", {
        phoneTail: phoneTail ? `…${phoneTail}` : "(short)",
        channel: viaBackend ? "backend" : "supabase",
        supabase: envInfo,
      });
    }

    if (viaBackend) {
      await sendOtpViaBackend(payload, phoneTail ? `…${phoneTail}` : "(short)");
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      await sendOtpViaBackend(payload, phoneTail ? `…${phoneTail}` : "(short)");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: payload.phoneE164,
      options: { channel: "sms", shouldCreateUser: true },
    });

    if (__DEV__) {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[RiderAuth] SMS Failed (Supabase)", {
          message: error.message,
          name: error.name,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log(
          "[RiderAuth] SMS Sent (Supabase path — hook → MSG91). Session stays null until verify; that is normal.",
        );
      }
    }

    if (error) {
      const errMsg = error.message || "Unable to send OTP. Please try again.";
      const status = (error as { status?: number }).status;
      if (isSupabaseSmsDeliveryError(errMsg, status)) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[RiderAuth] Falling back to backend MSG91 OTP");
        }
        await sendOtpViaBackend(payload, phoneTail ? `…${phoneTail}` : "(short)");
        return;
      }
      const hint = isSupabaseSmsDeliveryError(errMsg, status)
        ? " Check Supabase Auth (Phone enabled), Send SMS hook URL, and backend MSG91 / SUPABASE_SEND_SMS_HOOK_SECRET."
        : "";
      throw new Error(errMsg + hint);
    }
  },

  /** Verify OTP — same branching as merchant (backend requestId vs Supabase verify + exchange). */
  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const backendRequestId = _lastBackendOtpRequestId;

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] OTP Verify attempted", {
        channel: backendRequestId ? "backend" : "supabase",
        phoneTail: payload.phoneE164.replace(/\D/g, "").slice(-4),
      });
    }

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

      if (!res.ok) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[RiderAuth] OTP Verify failed", { status: res.status, error: dataJson.error });
        }
        throwIfExchangeFailed(res, dataJson, "Could not verify OTP or create rider session.");
      }

      throwIfExchangeFailed(res, dataJson, "Could not verify OTP or create rider session.");
      assertSession(dataJson);
      _lastBackendOtpRequestId = null;

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[RiderAuth] OTP Verified (backend path)");
      }
      return dataJson;
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
        console.warn("[RiderAuth] OTP Verify failed (Supabase)", { message: error.message });
      }
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

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] OTP Verified (Supabase + exchange-rider)");
    }
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
      throw new Error("OTP expired. Request a new OTP.");
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
