/**
 * PATCH /api/admin/tracking/violations/:id  { status, note? }
 * Records the admin decision (reviewed | penalized | dismissed) on a geo-engine
 * violation. Proxies to the backend. Super-admin gated.
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const base = backendBase();
  if (!base || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${base}/v1/admin/tracking/violations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: proxyHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[PATCH tracking violation proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
