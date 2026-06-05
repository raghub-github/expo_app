import { ApiError } from "@gatimitra/sdk";

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
      return "Server error while confirming delivery. Retry in a moment.";
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

  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        ...(init?.headers ?? {}),
      },
    },
    timeout,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      res.status,
      text,
    );
  }

  return (await res.json()) as TResponse;
}


