/**
 * Small helper for dashboard → backend calls in the notifications module.
 *
 * The dashboard is trusted server-side (requireSuperAdminApi() has already
 * verified the Supabase session + role). We call backend admin endpoints
 * with the shared BACKEND_SCHEDULE_TICK_SECRET so the backend accepts the
 * request without needing to re-verify a Supabase JWT.
 */
import { NextResponse } from "next/server";

export function backendConfig() {
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
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

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const cfg = backendConfig();
  if (!cfg.backendUrl || !cfg.secret) {
    return { status: 503, body: { error: "backend_not_configured" } };
  }
  const base = cfg.backendUrl.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": cfg.secret,
      ...(init.headers ?? {}),
    },
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
}
