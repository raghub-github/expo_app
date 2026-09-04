/**
 * GET / PUT /api/admin/hot-zones/config
 *
 * Super Admin controls for the Hot Zone Engine (rider_hot_zone_config singleton):
 * spatial (H3 resolution, neighbourhood rings, supply + visibility radius), demand
 * (window, half-life, min-demand gate, assigned weight), supply (ring decay, floor,
 * freshness), pressure thresholds + hysteresis, reconcile cadence and zone validity.
 *
 * Proxies to the backend admin endpoint via X-Internal-Secret. Mirrors tracking-config.
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
  return {
    "X-Internal-Secret": process.env.INTERNAL_API_TOKEN ?? "",
    "X-Actor-Role": "super_admin",
    "content-type": "application/json",
  };
}

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const base = backendBase();
  if (!base || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${base}/v1/admin/hot-zones/config`, {
      method: "GET",
      cache: "no-store",
      headers: proxyHeaders(),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET hot-zones/config proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const base = backendBase();
  if (!base || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${base}/v1/admin/hot-zones/config`, {
      method: "PUT",
      cache: "no-store",
      headers: proxyHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[PUT hot-zones/config proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
