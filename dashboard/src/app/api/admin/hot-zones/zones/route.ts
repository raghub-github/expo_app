/**
 * GET /api/admin/hot-zones/zones[?service=food|parcel|person_ride]
 *
 * Live inspector for the current persisted hot-zone state, with the full "why is this zone
 * hot" explainability breakdown (weighted demand, effective supply, pressure, unassigned vs
 * assigned demand, order/supply counts). Proxies to the backend admin endpoint.
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

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const base = backendBase();
  if (!base || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }
  const service = req.nextUrl.searchParams.get("service");
  const qs = service ? `?service=${encodeURIComponent(service)}` : "";
  try {
    const upstream = await fetch(`${base}/v1/admin/hot-zones/zones${qs}`, {
      method: "GET",
      cache: "no-store",
      headers: proxyHeaders(),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET hot-zones/zones proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
