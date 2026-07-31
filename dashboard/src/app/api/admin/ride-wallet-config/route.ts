/**
 * GET / PUT /api/admin/ride-wallet-config
 *
 * Super Admin controls the Ride Wallet policy:
 *   * per-service negative threshold (default 50)
 *   * global block threshold (default -200)
 *   * cash settlement toggle
 *   * auto-unblock on positive balance toggle
 *
 * Proxies to the backend admin endpoint via X-Internal-Secret. Super admin
 * gate enforced by requireSuperAdminApi.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

function proxyHeaders(): HeadersInit {
  const secret = process.env.INTERNAL_API_TOKEN ?? "";
  return {
    "X-Internal-Secret": secret,
    "X-Actor-Role": "super_admin",
    "content-type": "application/json",
  };
}

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { error: "backend_not_configured" },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${base}/v1/admin/ride-wallet-config`, {
      method: "GET",
      cache: "no-store",
      headers: proxyHeaders(),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET ride-wallet-config proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { error: "backend_not_configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${base}/v1/admin/ride-wallet-config`, {
      method: "PUT",
      cache: "no-store",
      headers: proxyHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[PUT ride-wallet-config proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
