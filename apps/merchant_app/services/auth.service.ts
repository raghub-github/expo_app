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

/** Set for the review-number path (backend fixed OTP); null when Supabase delivers. */
let _lastBackendOtpRequestId: string | null = null;

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
    const tail = payload.phoneE164.replace(/\D/g, "").slice(-4);

    // ALWAYS ask the backend first. The backend is the single place that (a)
    // applies the Google-Play review-number bypass (fixed OTP, no SMS) and (b)
    // checks the number is a registered partner. Its answer decides delivery:
    //   - review number → backend seeded a fixed OTP; verify goes to the backend
    //   - registered number → { useSupabase: true }; we deliver via Supabase
    //     (the customer app's proven path — the backend MSG91 OTP channels ack
    //     but don't actually deliver on this account)
    //   - unregistered → 404 not_registered → surface the "register first" message
    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const code =
        typeof dataJson?.error === "string" && dataJson.error.trim()
          ? String(dataJson.error).trim()
          : "";
      const msg =
        (typeof dataJson?.message === "string" && dataJson.message) ||
        code ||
        `Could not send OTP (HTTP ${res.status}).`;
      if (
        code === "not_registered" ||
        /isn't registered|not registered as a gatimitra partner/i.test(msg)
      ) {
        throw new MerchantAuthError("not_registered", msg);
      }
      throw new Error(msg);
    }

    // Review number: backend already stored a fixed OTP — verify via the backend.
    const rid = typeof dataJson.requestId === "string" ? dataJson.requestId : "";
    if (!dataJson.useSupabase && rid) {
      _lastBackendOtpRequestId = rid;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[MerchantAuth] sendOtp: backend fixed-OTP path (review number).");
      }
      return;
    }

    // Registered real number: deliver via Supabase, exactly like the customer app.
    if (dataJson.useSupabase) {
      const supabase = getSupabaseAuth();
      if (!supabase) {
        throw new Error(
          "Supabase is not configured for merchant OTP. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
        );
      }
      const normalizedPhone = payload.phoneE164.startsWith("+")
        ? payload.phoneE164
        : `+91${payload.phoneE164.replace(/\D/g, "").slice(-10)}`;

      // Do NOT pass shouldCreateUser: with the Send SMS hook configured, the
      // explicit flag races the hook and Supabase 500s for known numbers.
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { channel: "sms" },
      });
      if (__DEV__) {
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[MerchantAuth] sendOtp: Supabase error", {
            message: error.message,
            status: (error as { status?: number }).status,
            phoneTail: tail,
          });
        } else {
          // eslint-disable-next-line no-console
          console.log("[MerchantAuth] sendOtp: Supabase OK — SMS delivered (registered partner).");
        }
      }
      if (error) {
        const msg = error.message || "Could not send OTP via Supabase.";
        if ((error as { status?: number }).status === 429 || /rate.?limit|too many/i.test(msg)) {
          throw new Error("Too many OTP attempts on this number. Wait an hour or use a different number.");
        }
        const hint = /provider|sms|phone|hook/i.test(msg)
          ? " Check Supabase Dashboard → Auth → Providers → Phone + Auth → Hooks → Send SMS."
          : "";
        throw new Error(msg + hint);
      }
      return;
    }

    throw new Error("Unexpected OTP response from server.");
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

  /**
   * Create a short-lived partnersite SSO handoff so Add Store / incomplete
   * onboarding opens already logged-in on the partner portal.
   */
  async createPartnerHandoff(payload: {
    accessToken: string;
    redirectPath: string;
    supabaseUserId?: string | null;
  }): Promise<{
    handoffToken: string;
    accessToken: string;
    refreshToken: string;
    redirectPath: string;
    expiresInSec: number;
  }> {
    const sbRaw = typeof payload.supabaseUserId === "string" ? payload.supabaseUserId.trim() : "";
    const supabaseUserId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sbRaw)
        ? sbRaw
        : undefined;
    const res = await fetchWithTimeout(`${apiBaseUrl}${AUTH_PREFIX}/merchant/partner-handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.accessToken}`,
      },
      body: JSON.stringify({
        redirectPath: payload.redirectPath,
        ...(supabaseUserId ? { supabaseUserId } : {}),
      }),
      timeoutMs: 20000,
    });
    const raw = await res.text();
    let dataJson: any = {};
    try {
      dataJson = raw ? JSON.parse(raw) : {};
    } catch {
      dataJson = {};
    }
    if (!res.ok) {
      const msg =
        (typeof dataJson?.message === "string" && dataJson.message) ||
        (typeof dataJson?.error === "string" && dataJson.error) ||
        "Could not open partner portal.";
      if (res.status === 401) {
        throw new MerchantAuthError("session_revoked", "Please log in again to add a store.");
      }
      throw new MerchantAuthError(
        typeof dataJson?.error === "string" ? dataJson.error : "handoff_failed",
        msg
      );
    }
    const accessToken = typeof dataJson?.accessToken === "string" ? dataJson.accessToken : "";
    const refreshToken = typeof dataJson?.refreshToken === "string" ? dataJson.refreshToken : "";
    const redirectPath =
      typeof dataJson?.redirectPath === "string" ? dataJson.redirectPath : payload.redirectPath;
    if (!accessToken || !refreshToken) {
      throw new MerchantAuthError("handoff_failed", "Could not open partner portal.");
    }
    return {
      handoffToken: typeof dataJson?.handoffToken === "string" ? dataJson.handoffToken : "",
      accessToken,
      refreshToken,
      redirectPath,
      expiresInSec: typeof dataJson?.expiresInSec === "number" ? dataJson.expiresInSec : 120,
    };
  },
};

/** Alias used by some screens — same object as `merchantAuthService`. */
export const authService = merchantAuthService;

