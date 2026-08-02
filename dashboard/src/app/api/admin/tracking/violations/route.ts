/**
 * GET /api/admin/tracking/violations[?status&type&riderId&limit]
 * Proxies to the backend geo-engine violations review queue. Super-admin gated.
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
  const qs = req.nextUrl.search ?? "";
  try {
    const upstream = await fetch(`${base}/v1/admin/tracking/violations${qs}`, {
      method: "GET",
      cache: "no-store",
      headers: proxyHeaders(),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET tracking violations proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
