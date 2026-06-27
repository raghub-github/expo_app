import { ApiError } from "@gatimitra/sdk";
import { notifyForceLogoutIfNeeded, parseApiErrorCode } from "@/src/services/rider-auth-errors";
import { useSessionStore } from "@/src/stores/sessionStore";

export class HttpError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export function isRiderNotFoundError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status === 404) return true;
  const haystack = `${error.message}\n${error.body ?? ""}`;
  return /rider not found/i.test(haystack);
}

export function isOrderFetchNotFoundError(error: unknown): boolean {
  if (error instanceof HttpError && error.status === 404) return true;
  if (error instanceof ApiError && error.status === 404) return true;
  return false;
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

/** Prefer `{ error }` from API JSON over raw HTTP / SQL dump in UI. */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload;
    if (payload && typeof payload === "object") {
      const rec = payload as { error?: string; message?: string };
      const apiError = rec.error?.trim() || rec.message?.trim();
      if (apiError && !apiError.includes("Failed query:")) return apiError;
    }
    if (error.status >= 500) {
      return "Server error. Please retry in a moment.";
    }
  }

  if (!(error instanceof HttpError)) {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }
  const body = error.body?.trim();
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    const apiError = parsed.error?.trim() || parsed.message?.trim();
    if (apiError && !apiError.includes("Failed query:")) return apiError;
  } catch {
    /* plain text body */
  }
  if (body.length < 240 && !body.includes("Failed query:")) return body;
  return fallback;
}

export function isVehicleDetailsRequiredError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 403) return false;
  const haystack = `${error.message}\n${error.body ?? ""}`;
  return /VEHICLE_DETAILS_REQUIRED/i.test(haystack);
}

export function isVehicleNotVerifiedError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 403) return false;
  const haystack = `${error.message}\n${error.body ?? ""}`;
  return /VEHICLE_NOT_VERIFIED/i.test(haystack);
}

function maybeNotifySessionRevoked(status: number, body?: string) {
  notifyForceLogoutIfNeeded(status, body);
}

function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
  });
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000, // 30 seconds default
): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    createTimeoutPromise(timeoutMs),
  ]) as Promise<Response>;
}

export async function postJson<TResponse>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string>; timeout?: number },
): Promise<TResponse> {
  const timeout = init?.timeout ?? 30000; // 30 seconds default
  
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    },
    timeout,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    maybeNotifySessionRevoked(res.status, text);
    throw new HttpError(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      res.status,
      text,
    );
  }

  return (await res.json()) as TResponse;
}

export async function putJson<TResponse>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string>; timeout?: number },
): Promise<TResponse> {
  const timeout = init?.timeout ?? 30000;

  const res = await fetchWithTimeout(
    url,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    },
    timeout,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    maybeNotifySessionRevoked(res.status, text);
    throw new HttpError(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      res.status,
      text,
    );
  }

  return (await res.json()) as TResponse;
}

export async function patchJson<TResponse>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string>; timeout?: number },
): Promise<TResponse> {
  const timeout = init?.timeout ?? 30000;

  const res = await fetchWithTimeout(
    url,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    },
    timeout,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    maybeNotifySessionRevoked(res.status, text);
    throw new HttpError(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      res.status,
      text,
    );
  }

  return (await res.json()) as TResponse;
}

export async function getJson<TResponse>(
  url: string,
  init?: { headers?: Record<string, string>; timeout?: number },
): Promise<TResponse> {
  const timeout = init?.timeout ?? 30000;

  const doFetch = async (headers?: Record<string, string>) => {
    return fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          ...(init?.headers ?? {}),
          ...(headers ?? {}),
        },
      },
      timeout,
    );
  };

  let res = await doFetch();

  if (res.status === 401 && parseApiErrorCode(await res.clone().text().catch(() => "")) === "invalid_token") {
    await useSessionStore.getState().refreshSessionIfNeeded({ force: true });
    const token = useSessionStore.getState().session?.accessToken;
    if (token) {
      res = await doFetch({ authorization: `Bearer ${token}` });
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    maybeNotifySessionRevoked(res.status, text);
    throw new HttpError(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      res.status,
      text,
    );
  }

  return (await res.json()) as TResponse;
}


