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
    init: RequestInit & { responseSchema?: z.ZodSchema<T>; idempotencyKey?: string } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const token = await this.getAccessToken?.();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.appVersion ? { "x-app-version": this.appVersion } : {}),
      ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    const text = await res.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      throw new ApiError(`API ${res.status} ${res.statusText}`, res.status, payload);
    }

    if (init.responseSchema) {
      return init.responseSchema.parse(payload);
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


