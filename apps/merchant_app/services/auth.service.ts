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

import { getSupabaseAuth, getSupabaseOtpEnvDebugInfo } from "@/lib/supabaseClient";
import { getConfig } from "@/config/env";

const AUTH_PREFIX = "/v1/auth";

/** Thrown when backend returns structured auth errors (e.g. device session could not be created). */
export class MerchantAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MerchantAuthError";
    this.code = code;
  }
}

export function isMerchantAuthError(e: unknown): e is MerchantAuthError {
  return e instanceof MerchantAuthError;
}

export type SendOtpPayload = { phoneE164: string };
export type VerifyOtpPayload = {
  phoneE164: string;
  otp: string;
  deviceId: string;
};

const { apiBaseUrl } = getConfig();

/** Set after successful `POST /v1/auth/otp/request`; cleared on new send or successful backend verify. */
let _lastBackendOtpRequestId: string | null = null;

function shouldSendPhoneOtpViaBackend(): boolean {
  // Merchant phone OTP ALWAYS goes through the backend. The backend is the only
  // place that (a) applies the Google-Play review-number bypass and (b) checks
  // that the number is a registered partner before sending an SMS. Falling back
  // to Supabase's signInWithOtp would skip both — sending a real SMS to the
  // review number and to unregistered numbers. Google OAuth still uses Supabase;
  // only the phone-OTP send is pinned here.
  return true;
}

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

type ExchangeMerchantResponse = {
  accessToken: string;
  expiresAt: number;
  role: string;
  userId: string;
  partner: { parent: unknown; childStores: unknown[] };
};

function throwIfExchangeFailed(res: Response, dataJson: any, fallbackMessage: string): void {
  if (res.ok) return;
  const errCode = typeof dataJson?.error === "string" ? dataJson.error : "";
  const serverMessage = typeof dataJson?.message === "string" ? dataJson.message : "";
  const humanFromError =
    errCode && errCode !== "device_session_unavailable" ? errCode : "";
  const msg =
    serverMessage ||
    humanFromError ||
    fallbackMessage;
  if (errCode === "device_session_unavailable") {
    throw new MerchantAuthError(
      "device_session_unavailable",
      serverMessage || "Could not start your session on this device. Please try again."
    );
  }
  throw new Error(msg);
}

function assertExchangePayload(dataJson: any): asserts dataJson is ExchangeMerchantResponse {
  if (!dataJson?.accessToken || !dataJson?.partner) {
    throw new Error("Merchant session response missing partner information.");
  }
}

export const merchantAuthService = {
  /**
   * Send OTP: Supabase `signInWithOtp` when configured (Send SMS hook → MSG91), otherwise same as customer app —
   * `POST /v1/auth/otp/request` so the API sends SMS via MSG91 directly.
   * Set `EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true` to force the backend path even when Supabase keys are present.
   */
  async sendOtp(payload: SendOtpPayload): Promise<void> {
    _lastBackendOtpRequestId = null;

    const envInfo = getSupabaseOtpEnvDebugInfo();
    const viaBackend = shouldSendPhoneOtpViaBackend();
    if (__DEV__) {
      const tail = payload.phoneE164.replace(/\D/g, "").slice(-4);
      // eslint-disable-next-line no-console
      console.log("[MerchantAuth] sendOtp: start", {
        phoneTail: tail ? `…${tail}` : "(short)",
        channel: viaBackend ? "backend" : "supabase",
        supabase: envInfo,
      });
    }

    if (viaBackend) {
      const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // appType lets the backend reject unregistered numbers up front (and
        // not waste an SMS) instead of only failing at verify.
        body: JSON.stringify({ phoneE164: payload.phoneE164, appType: "merchant" }),
      });
      const raw = await res.text();
      let dataJson: any;
      try {
        dataJson = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("Invalid response from server while requesting OTP.");
      }
      if (!res.ok) {
        const msg =
          (typeof dataJson?.message === "string" && dataJson.message) ||
          (typeof dataJson?.error === "string" && dataJson.error) ||
          `Could not send OTP (HTTP ${res.status}).`;
        throw new Error(msg);
      }
      const rid = typeof dataJson.requestId === "string" ? dataJson.requestId : "";
      if (!rid) {
        throw new Error("Server did not return an OTP request id. Check backend /v1/auth/otp/request.");
      }
      _lastBackendOtpRequestId = rid;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          "[MerchantAuth] sendOtp: backend OK — SMS via MSG91 on API server (set EXPO_PUBLIC_API_BASE_URL reachable from device; backend needs MSG91_AUTH_KEY). OTP may appear in backend console in non-production.",
          dataJson.otp != null ? { devOtp: dataJson.otp } : {},
        );
      }
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured for merchant OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    }

    // Normalize phone to strict E.164 (same as partnersite). Supabase rejects
    // mixed formats.
    const normalizedPhone = payload.phoneE164.startsWith("+")
      ? payload.phoneE164
      : `+91${payload.phoneE164.replace(/\D/g, "").slice(-10)}`;

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
        console.warn("[MerchantAuth] sendOtp: Supabase error", {
          message: error.message,
          name: error.name,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          phoneE164: normalizedPhone,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log(
          "[MerchantAuth] sendOtp: Supabase OK — SMS via Send SMS Hook → MSG91.",
        );
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
      throw new Error(msg + hint);
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
    const backendRequestId = _lastBackendOtpRequestId;
    if (backendRequestId) {
      const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: backendRequestId,
          phoneE164: payload.phoneE164,
          otp: payload.otp,
          deviceId: payload.deviceId,
          appType: "merchant",
        }),
      });
      const raw = await res.text();
      let dataJson: any;
      try {
        dataJson = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("Invalid response from server while verifying OTP.");
      }
      throwIfExchangeFailed(
        res,
        dataJson,
        "Could not verify OTP or create merchant session.",
      );
      assertExchangePayload(dataJson);
      _lastBackendOtpRequestId = null;
      return dataJson;
    }

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
    throwIfExchangeFailed(
      res,
      dataJson,
      "Could not create merchant session after OTP verify."
    );
    assertExchangePayload(dataJson);
    return dataJson;
  },

  /**
   * After a successful Supabase OTP verify, if the backend exchange failed (e.g. device session),
   * the Supabase session may still be valid — retry exchange without re-entering OTP.
   */
  async exchangeMerchantFromCurrentSupabaseSession(payload: {
    phoneE164: string;
    deviceId: string;
  }): Promise<ExchangeMerchantResponse> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured for merchant OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error("Your sign-in code expired. Please request a new OTP.");
    }
    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/supabase/exchange-merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: data.session.access_token,
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
    throwIfExchangeFailed(
      res,
      dataJson,
      "Could not create merchant session after OTP verify."
    );
    assertExchangePayload(dataJson);
    return dataJson;
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
    throwIfExchangeFailed(
      res,
      dataJson,
      "Could not create merchant session after Google sign-in."
    );
    assertExchangePayload(dataJson);
    return dataJson;
  },

  async exchangeGoogleMerchantFromCurrentSupabaseSession(payload: {
    deviceId: string;
  }): Promise<ExchangeMerchantResponse> {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      throw new Error("Supabase is not configured. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error("Google sign-in expired. Please sign in with Google again.");
    }
    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/supabase/exchange-merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: data.session.access_token,
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
    throwIfExchangeFailed(
      res,
      dataJson,
      "Could not create merchant session after Google sign-in."
    );
    assertExchangePayload(dataJson);
    return dataJson;
  },
};

