/**
 * Central API client - Axios instance with base URL, auth header, and error handling.
 * Token is attached via interceptor; refresh can be wired in response interceptor.
 */

import axios, { type AxiosError } from "axios";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS, API_TIMEOUT_MS } from "@/constants";
import { getItem } from "@/utils/storage";

let onSessionRevoked: (() => void) | null = null;
export function setOnSessionRevoked(cb: () => void) {
  onSessionRevoked = cb;
}

const { apiBaseUrl } = getConfig();

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

/** Attach Bearer token from SecureStore to every request */
api.interceptors.request.use(
  async (config) => {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

/** Global error handling; 401 can trigger logout / refresh */
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; error?: string }>) => {
    const status = err.response?.status;
    const message = err.response?.data?.message ?? err.response?.data?.error ?? err.message;
    if (__DEV__) {
      console.warn("[API]", status, message);
    }
    if (status === 401) {
      const errorCode = err.response?.data?.error;
      if (errorCode === "session_revoked" || errorCode === "user_deleted") {
        onSessionRevoked?.();
      }
    }
    return Promise.reject(err);
  }
);

export default api;
