/**
 * Auth service - OTP request/verify and session persistence.
 * Always uses backend; real users and real JWT. In dev, OTP value may be returned in response for testing.
 */

import type { Session } from "@gatimitra/contracts";
import api from "./api";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

const AUTH_PREFIX = "/v1/auth";

export type SendOtpPayload = { phoneE164: string };
export type SendOtpResponse = { requestId: string; expiresInSec: number; otp?: string };
export type VerifyOtpPayload = {
  requestId: string;
  phoneE164: string;
  otp: string;
  deviceId: string;
  appType?: "customer" | "rider";
};

export const authService = {
  /** Send OTP – always calls backend. In dev, backend may return otp in response for testing. */
  async sendOtp(payload: SendOtpPayload): Promise<SendOtpResponse> {
    const { data } = await api.post<SendOtpResponse>(`${AUTH_PREFIX}/otp/request`, payload, {
      timeout: 15000,
    });
    if (__DEV__ && data.otp) {
      // eslint-disable-next-line no-console
      console.log("\n[Dev OTP] Use this code to login:", data.otp, "| requestId:", data.requestId, "| phone:", payload.phoneE164, "\n");
    }
    return data;
  },

  /** Verify OTP – always calls backend; returns real JWT and creates/finds real user. */
  async verifyOtp(payload: VerifyOtpPayload): Promise<Session> {
    const body = { ...payload, appType: "customer" as const };
    const { data } = await api.post<Session>(`${AUTH_PREFIX}/otp/verify`, body, {
      timeout: 15000,
    });
    return data;
  },

  /** Persist session (token + optional full session object) */
  async persistSession(session: Session): Promise<void> {
    await setItem(STORAGE_KEYS.AUTH_TOKEN, session.accessToken);
    await setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
  },

  /** Clear auth data on logout */
  async clearSession(): Promise<void> {
    await removeItem(STORAGE_KEYS.AUTH_TOKEN);
    await removeItem(STORAGE_KEYS.AUTH_SESSION);
  },

  /** Revoke all sessions for current user (logout from all devices). Call before clearSession. */
  async logoutAllDevices(): Promise<void> {
    await api.post("/v1/me/logout-all", {}, { timeout: 10000 });
  },

  /** Get stored session for auto-login. Session stays until manual sign out or sign out from all devices. */
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
