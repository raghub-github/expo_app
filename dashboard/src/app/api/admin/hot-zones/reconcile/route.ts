/**
 * POST /api/admin/hot-zones/reconcile
 *
 * Forces an immediate reconcile pass (recompute city-wide zone state now) — useful right
 * after changing config so the admin sees the effect without waiting for the periodic tick.
 * Proxies to the backend admin endpoint.
 */
import { NextResponse } from "next/server";
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

export async function POST() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const base = backendBase();
  if (!base || !process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${base}/v1/admin/hot-zones/reconcile`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "X-Internal-Secret": process.env.INTERNAL_API_TOKEN ?? "",
        "X-Actor-Role": "super_admin",
        "content-type": "application/json",
      },
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[POST hot-zones/reconcile proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
