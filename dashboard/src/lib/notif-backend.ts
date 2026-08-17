/**
 * Small helper for dashboard → backend calls in the notifications module.
 *
 * The dashboard is trusted server-side (requireSuperAdminApi() has already
 * verified the Supabase session + role). We call backend admin endpoints
 * with the shared BACKEND_SCHEDULE_TICK_SECRET so the backend accepts the
 * request without needing to re-verify a Supabase JWT.
 */
import { NextResponse } from "next/server";

/** Where Fastify lives in local dev (backend `npm run dev` → port 3000). */
export function normalizeBackendUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "";
  }
  if (
    trimmed === "http://127.0.0.1:4000" ||
    trimmed === "http://localhost:4000" ||
    trimmed === "http://127.0.0.1:30000" ||
    trimmed === "http://localhost:30000"
  ) {
    return "http://127.0.0.1:3000";
  }
  if (process.env.NODE_ENV !== "development") return trimmed;

  try {
    const u = new URL(trimmed);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port !== "3000") return trimmed;

    const host = u.hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") return trimmed;

    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isPrivateLan) {
      u.hostname = "127.0.0.1";
      return u.origin;
    }
  } catch {
    /* ignore malformed URL */
  }

  return trimmed;
}

export function backendConfig() {
  const raw = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  const backendUrl = normalizeBackendUrl(raw);
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  return { backendUrl, secret };
}

export function backendConfigOrProblem() {
  const { backendUrl, secret } = backendConfig();
  if (!backendUrl || !secret) {
    const missing: string[] = [];
    if (!backendUrl) missing.push("BACKEND_URL or NEXT_PUBLIC_BACKEND_URL");
    if (!secret) missing.push("BACKEND_SCHEDULE_TICK_SECRET");
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "backend_not_configured",
          message: "Set the missing variables in dashboard/.env.local and restart.",
          missing,
        },
        { status: 503 },
      ),
    };
  }
  return { ok: true as const, backendUrl, secret };
}

export type BackendFetchInit = Omit<RequestInit, "body"> & {
  /** Plain objects are JSON.stringified; strings/Blob/FormData pass through. */
  body?: RequestInit["body"] | Record<string, unknown> | unknown[];
};

function normalizeRequestBody(body: BackendFetchInit["body"]): BodyInit | null | undefined {
  if (body == null || body === "") return body as null | undefined;
  if (typeof body === "string") return body;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return body as ReadableStream;
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }
  // Plain object / array from dashboard API routes
  return JSON.stringify(body);
}

export async function backendFetch(
  path: string,
  init: BackendFetchInit = {},
): Promise<{ status: number; body: unknown }> {
  const cfg = backendConfig();
  if (!cfg.backendUrl || !cfg.secret) {
    return { status: 503, body: { error: "backend_not_configured" } };
  }
  const base = cfg.backendUrl.replace(/\/$/, "");
  const method = (init.method ?? "GET").toUpperCase();
  let requestBody = normalizeRequestBody(init.body);
  // Fastify rejects POST/PUT/PATCH with Content-Type: application/json and an empty body.
  if (
    (method === "POST" || method === "PUT" || method === "PATCH") &&
    (requestBody == null || requestBody === "")
  ) {
    requestBody = "{}";
  }
  const headers: Record<string, string> = {
    "X-Internal-Secret": cfg.secret,
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (requestBody != null && requestBody !== "" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      method,
      body: requestBody,
      headers,
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { status: res.status, body };
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: unknown }).code ?? "")
        : "";
    const message = err instanceof Error ? err.message : "fetch_failed";
    return {
      status: 503,
      body: {
        error: "backend_unreachable",
        message:
          process.env.NODE_ENV === "development"
            ? `Cannot reach backend at ${base}. Start backend with \`npm run dev\` in /backend (port 3000).`
            : "Notification backend is unreachable.",
        detail: code || message,
      },
    };
  }
}
