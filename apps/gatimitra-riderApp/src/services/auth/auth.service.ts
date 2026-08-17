/**
 * Rider auth service — same OTP architecture as merchant app.
 *
 * Flow (Phone):
 *  1. sendOtp   → Supabase signInWithOtp (Send SMS hook → MSG91)
 *  2. verifyOtp → Supabase verifyOtp, then exchange for backend rider session
 *
 * Fallback when Supabase is not configured or EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true:
 *  1. sendOtp   → POST /v1/auth/otp/request + MSG91
 *  2. verifyOtp → POST /v1/auth/otp/verify (appType: rider)
 */

import type { Session } from "@gatimitra/contracts";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { getSupabaseAuth, getSupabaseOtpEnvDebugInfo } from "@/src/lib/supabaseClient";
import { getRiderLoginDeviceMeta } from "@/src/lib/riderDeviceInfo";
import type { RiderLoginGeoPayload } from "@/src/lib/getRiderLoginGeoFromDevice";

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
  loginGeo?: RiderLoginGeoPayload;
};

export type RiderStatusResponse = {
  exists: boolean;
  riderId?: string;
  userId: string;
  onboardingStatus?: "not_started" | "in_progress" | "pending_approval" | "approved" | "rejected";
  approvalStatus?: string;
  paymentCompleted?: boolean;
};

/** Set after successful `POST /v1/auth/otp/request`; cleared on new send or successful backend verify. */
let _lastBackendOtpRequestId: string | null = null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" && err != null && (err as { name?: string }).name === "AbortError");
    if (aborted) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s contacting ${url}. Check that the backend is running and EXPO_PUBLIC_API_BASE_URL matches this device's network.`,
      );
    }
    throw err;
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
  if (errCode === "device_change_limit_exceeded") {
    throw new RiderAuthError(
      "device_change_limit_exceeded",
      serverMessage || "You've changed devices too many times recently. Please try again later.",
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

/**
 * Deliver a phone OTP through Supabase (`signInWithOtp` → Send SMS hook → MSG91).
 * This is the ONLY channel that actually delivers on this project; the backend
 * MSG91 OTP endpoints ack but do not deliver. Used for every real number (the
 * review bypass number uses the backend fixed-OTP path instead).
 */
async function deliverOtpViaSupabase(phoneE164: string): Promise<void> {
  const supabase = getSupabaseAuth();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured for rider OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  // Normalize phone to strict E.164 (same as partnersite / merchant). Supabase rejects
  // mixed formats.
  const normalizedPhone = phoneE164.startsWith("+")
    ? phoneE164
    : `+91${phoneE164.replace(/\D/g, "").slice(-10)}`;

  // IMPORTANT: do NOT pass `shouldCreateUser: true` for phone OTP. With the
  // Send SMS Hook configured in the Supabase project, the explicit flag
  // triggers a user-creation flow that races the hook and Supabase returns
  // 500 `unexpected_failure` for already-known numbers.
  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
    options: { channel: "sms" },
  });

  if (__DEV__) {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[RiderAuth] sendOtp: Supabase error", {
        message: error.message,
        name: error.name,
        status: (error as { status?: number }).status,
        code: (error as { code?: string }).code,
        phoneE164: normalizedPhone,
      });
    } else {
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] sendOtp: Supabase OK — SMS via Send SMS Hook → MSG91.");
    }
  }

  if (error) {
    const msg = error.message || "Could not send OTP via Supabase.";
    const hint = /provider|sms|phone|hook/i.test(msg)
      ? " Check Supabase Dashboard → Auth → Providers → Phone (enabled) + Auth → Hooks → Send SMS (URL + secret)."
      : "";
    if ((error as { status?: number }).status === 429 || /rate.?limit|too many/i.test(msg)) {
      throw new Error("Too many OTP attempts on this number. Wait an hour or use a different number.");
    }
    if (
      /network request failed|failed to fetch|AuthRetryableFetchError/i.test(msg) ||
      (error as { status?: number }).status === 0
    ) {
      throw new Error(
        "Unable to reach authentication server. Check internet connection and that EXPO_PUBLIC_SUPABASE_URL matches the merchant app project (uoxkwzn…). Then restart Expo with -c.",
      );
    }
    throw new Error(msg + hint);
  }
}

export const riderAuthService = {
  /**
   * Send OTP — same architecture as the merchant app.
   *
   * ALWAYS ask the backend first (POST /otp/request, appType: rider). The backend
   * is the single place that applies the review-number bypass. Its answer decides
   * delivery:
   *   - review number  → { requestId } (fixed OTP seeded, no SMS); verify via backend
   *   - real number    → { useSupabase: true }; deliver via Supabase signInWithOtp
   *     (the only channel that delivers — the backend MSG91 endpoints ack but do
   *     not deliver on this account), then verify via Supabase + exchange-rider.
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;

    const envInfo = getSupabaseOtpEnvDebugInfo();
    const otpUrl = `${apiBaseUrl()}${AUTH_PREFIX}/otp/request`;
    if (__DEV__) {
      const tail = payload.phoneE164.replace(/\D/g, "").slice(-4);
      // eslint-disable-next-line no-console
      console.log("[RiderAuth] sendOtp: start", {
        phoneTail: tail ? `…${tail}` : "(short)",
        channel: "backend-first",
        apiBaseUrl: apiBaseUrl(),
        supabase: envInfo,
      });
    }

    // ALWAYS ask the backend first (same as merchant). Backend alone decides
    // review-number bypass vs Supabase delivery. Never skip this for a review phone.
    const res = await fetchWithTimeout(otpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneE164: payload.phoneE164, appType: "rider" }),
      timeoutMs: 30000,
    });
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

    // Review number: backend seeded a fixed OTP → verify via the backend.
    const rid = typeof dataJson.requestId === "string" ? dataJson.requestId : "";
    if (!dataJson.useSupabase && rid) {
      _lastBackendOtpRequestId = rid;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[RiderAuth] sendOtp: backend fixed-OTP path (review number).");
      }
      return;
    }

    // Real number: backend asks us to deliver via Supabase (the delivering path).
    if (dataJson.useSupabase) {
      await deliverOtpViaSupabase(payload.phoneE164);
      return;
    }

    throw new Error("Unexpected OTP response from server.");
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
          device: getRiderLoginDeviceMeta(),
          loginGeo: payload.loginGeo,
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
    loginGeo?: RiderLoginGeoPayload;
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
        device: getRiderLoginDeviceMeta(),
        loginGeo: payload.loginGeo,
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

  /** Re-issue a 7-day rider JWT when the current one is near expiry (device session must still be active). */
  async refreshSession(payload: {
    accessToken: string;
    deviceId: string;
  }): Promise<Session> {
    const res = await fetchWithTimeout(`${apiBaseUrl()}${AUTH_PREFIX}/rider/refresh-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.accessToken}`,
      },
      body: JSON.stringify({ deviceId: payload.deviceId }),
    });
    const raw = await res.text();
    let dataJson: Record<string, unknown> = {};
    try {
      dataJson = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error("Invalid response while refreshing session.");
    }
    if (!res.ok) {
      throw new Error(
        (typeof dataJson.message === "string" && dataJson.message) ||
          (typeof dataJson.error === "string" && dataJson.error) ||
          "Could not refresh session.",
      );
    }
    assertSession(dataJson);
    return dataJson;
  },
};
