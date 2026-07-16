/**
 * GET /api/admin/merchant-subscriptions/payments
 *   Query: storeId? merchantId? status? gateway? search? limit? offset?
 *
 * Proxies to the backend admin list endpoint. Dashboard authenticates the
 * admin via Supabase (requireSuperAdminApi); backend accepts the request via
 * the X-Internal-Secret shared token. Actor identity is forwarded so the
 * backend can log who initiated the read (audit trail).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { success: false, error: "backend_not_configured" },
      { status: 503 }
    );
  }

  // Forward the caller's query string as-is. The backend validates + coerces.
  const url = `${base}/v1/admin/merchant-subscriptions/payments?${request.nextUrl.searchParams.toString()}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Internal-Secret": secret,
        "X-Actor-Subject-Id": String(gate.systemUserId ?? ""),
        "X-Actor-Role": "admin",
      },
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET merchant-subscriptions/payments proxy]", e);
    return NextResponse.json(
      { success: false, error: "backend_unreachable" },
      { status: 502 }
    );
  }
}
