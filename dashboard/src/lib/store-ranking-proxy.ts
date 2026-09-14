/**
 * Shared proxy helpers for the Super-Admin store-ranking endpoints. The dashboard never computes
 * ranking; it proxies to the backend authority (/v1/admin/store-ranking/*) with the internal
 * secret, exactly like the ride-wallet-config proxy.
 */
import { NextResponse } from "next/server";

export function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export function proxyHeaders(actorEmail?: string): HeadersInit {
  const secret = process.env.INTERNAL_API_TOKEN ?? "";
  const h: Record<string, string> = {
    "X-Internal-Secret": secret,
    "X-Actor-Role": "super_admin",
    "content-type": "application/json",
  };
  if (actorEmail && actorEmail.includes("@")) h["X-Actor-Email"] = actorEmail;
  return h;
}

export function notConfigured(): NextResponse | null {
  if (!backendBase() || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ success: false, error: "backend_not_configured" }, { status: 503 });
  }
  return null;
}

export async function forwardJson(
  path: string,
  init: { method: "GET" | "PUT" | "POST"; body?: unknown; actorEmail?: string }
): Promise<NextResponse> {
  try {
    const upstream = await fetch(`${backendBase()}${path}`, {
      method: init.method,
      cache: "no-store",
      headers: proxyHeaders(init.actorEmail),
      body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error(`[store-ranking proxy ${init.method} ${path}]`, e);
    return NextResponse.json({ success: false, error: "backend_unreachable" }, { status: 502 });
  }
}
