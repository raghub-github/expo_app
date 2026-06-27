/**
 * Central API client - Axios instance with base URL, auth header, and error handling.
 * Token is attached via interceptor; refresh can be wired in response interceptor.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS, API_TIMEOUT_MS } from "@/constants";
import { getItem } from "@/utils/storage";
import { enterStartupApiGate, leaveStartupApiGate } from "@/lib/startup-api-gate";
import { isNetworkError } from "@/utils/networkError";

const MAX_RETRIES = 3;
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);

type RetryConfig = InternalAxiosRequestConfig & {
  __retryCount?: number;
  __startupGate?: boolean;
};

function isRetryableRequest(err: AxiosError): boolean {
  const config = err.config as RetryConfig | undefined;
  if (!config) return false;
  const method = (config.method ?? "get").toLowerCase();
  if (RETRYABLE_METHODS.has(method)) return true;
  // Permission sync PATCH is idempotent.
  if (method === "patch" && typeof config.url === "string" && config.url.includes("/me/profile")) {
    return true;
  }
  return false;
}

function shouldRetry(err: AxiosError): boolean {
  if (!isRetryableRequest(err)) return false;
  const status = err.response?.status;
  if (status === 503) return true;
  return isNetworkError(err);
}

let onSessionRevoked: (() => void) | null = null;
export function setOnSessionRevoked(cb: () => void) {
  onSessionRevoked = cb;
}

export const api = axios.create({
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

/** Attach Bearer token from SecureStore to every request */
api.interceptors.request.use(
  async (config) => {
    const cfg = config as RetryConfig;
    config.baseURL = getConfig().apiBaseUrl;
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    await enterStartupApiGate();
    cfg.__startupGate = true;
    return config;
  },
  (err) => Promise.reject(err)
);

/** Global error handling; 401 can trigger logout / refresh; retry transient failures */
api.interceptors.response.use(
  (res) => {
    const cfg = res.config as RetryConfig;
    if (cfg.__startupGate) leaveStartupApiGate();
    return res;
  },
  async (err: AxiosError<{ message?: string; error?: string }>) => {
    const config = err.config as RetryConfig | undefined;
    if (config?.__startupGate) leaveStartupApiGate();
    const isCanceled =
      err.code === "ERR_CANCELED" ||
      err.name === "CanceledError" ||
      (typeof err.message === "string" && err.message.toLowerCase() === "canceled");
    if (isCanceled) {
      return Promise.reject(err);
    }

    if (config && shouldRetry(err)) {
      const count = config.__retryCount ?? 0;
      if (count < MAX_RETRIES) {
        config.__retryCount = count + 1;
        const delayMs = Math.min(1200 * 2 ** count, 8000);
        await new Promise((r) => setTimeout(r, delayMs));
        return api.request(config);
      }
    }

    const status = err.response?.status;
    const message = err.response?.data?.message ?? err.response?.data?.error ?? err.message ?? "Network Error";
    if (__DEV__) {
      const method = err.config?.method?.toUpperCase() ?? "GET";
      const url = err.config?.url ?? "?";
      const silent =
        err.config?.headers?.["X-Silent-Error"] === "1" ||
        (typeof url === "string" && url.includes("/v1/weather/"));
      if (!silent) {
        // Include method + url so you can tell *which* call failed instead of
        // just "Network Error" with no context. Weather uses getForLocationSafe
        // and is intentionally quiet when the backend is unreachable.
        console.warn("[API]", status ?? "network", method, url, "—", message, "→", getConfig().apiBaseUrl);
      }
    }
    if (status === 401) {
      const errorCode = err.response?.data?.error;
      if (errorCode === "session_revoked" || errorCode === "user_deleted") {
        onSessionRevoked?.();
      }
    }
    const apiError = new Error(message) as Error & {
      response?: typeof err.response;
      status?: number;
      isAxiosError?: boolean;
    };
    apiError.response = err.response;
    apiError.status = status;
    apiError.isAxiosError = true;
    return Promise.reject(apiError);
  }
);

export default api;
