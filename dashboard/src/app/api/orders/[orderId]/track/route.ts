/**
 * GET /api/orders/[orderId]/track
 * Full rider GPS breadcrumb trail + per-leg/cumulative distance + pickup/drop +
 * route polyline + geo-engine violations for one order, for the tracking map +
 * timeline. [orderId] is the TEXT order id (e.g. GMF100045) — the value stored
 * in order_rider_tracking.order_id. Proxies the backend admin tracking endpoint.
 *
 * Access mirrors the other order-page APIs: super-admin OR ORDER_FOOD dashboard
 * access (agents track riders too) — not super-admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const id = String(orderId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;
    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const base = backendBase();
    if (!base || !process.env.INTERNAL_API_TOKEN) {
      return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
    }

    const qs = request.nextUrl.search ?? "";
    const upstream = await fetch(
      `${base}/v1/admin/tracking/order/${encodeURIComponent(id)}/track${qs}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-Internal-Secret": process.env.INTERNAL_API_TOKEN,
          "X-Actor-Role": "super_admin",
          "content-type": "application/json",
        },
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET /api/orders/[orderId]/track]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
