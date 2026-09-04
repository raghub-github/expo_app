import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** Fetch aborted by a bounded client timeout — not a business failure. */
export class NetworkTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "NetworkTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null> | string | null;
  appVersion?: string;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: ApiClientOptions["getAccessToken"];
  private readonly appVersion?: string;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.appVersion = opts.appVersion;
  }

  async request<T>(
    path: string,
    init: RequestInit & {
      responseSchema?: z.ZodSchema<T>;
      idempotencyKey?: string;
      onBeforeFetch?: () => void;
      /** Abort the request after this many ms. Unset = no client timeout. */
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const {
      responseSchema,
      idempotencyKey,
      onBeforeFetch,
      headers: initHeaders,
      timeoutMs,
      ...fetchInit
    } = init;
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const token = this.getAccessToken?.();
    const resolvedToken = token instanceof Promise ? await token : token;
    const method = (fetchInit.method ?? "GET").toUpperCase();
    let body: BodyInit | null | undefined = fetchInit.body;
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const sendsJson = method === "POST" || method === "PUT" || method === "PATCH";

    // Fastify rejects application/json requests with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
    if (sendsJson && !isFormData && (body == null || body === "")) {
      body = "{}";
    }

    const headers: Record<string, string> = {
      ...(sendsJson && !isFormData ? { "content-type": "application/json" } : {}),
      ...(this.appVersion ? { "x-app-version": this.appVersion } : {}),
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      ...(initHeaders as Record<string, string> | undefined),
    };
    if (resolvedToken) headers.authorization = `Bearer ${resolvedToken}`;

    onBeforeFetch?.();
    const timeoutController =
      timeoutMs != null && timeoutMs > 0 && !fetchInit.signal ? new AbortController() : null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutController) {
      timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    }
    let res: Response;
    try {
      res = await fetch(url, {
        ...fetchInit,
        method,
        body,
        headers,
        signal: timeoutController?.signal ?? fetchInit.signal,
      });
    } catch (err) {
      if (timeoutController?.signal.aborted) {
        throw new NetworkTimeoutError(timeoutMs ?? 0);
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const text = await res.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      throw new ApiError(`API ${res.status} ${res.statusText}`, res.status, payload);
    }

    if (responseSchema) {
      return responseSchema.parse(payload);
    }
    return payload as T;
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}


