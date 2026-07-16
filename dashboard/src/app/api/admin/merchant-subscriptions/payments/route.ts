/**
 * GET /api/admin/merchant-subscriptions/payments
 *   Query: storeId? merchantId? status? gateway? search? limit? offset?
 *
 * Access:
 *   - MERCHANT dashboard access (or super_admin) — read the list.
 *   - `canRefund` is derived from REFUND action permission and included in the
 *     response so the client can hide/disable the Refund button for view-only
 *     agents. Backend refund POST still re-checks; this is purely a UX hint.
 *
 * Proxies to the backend admin list endpoint via X-Internal-Secret. Actor
 * identity forwarded so the backend audit log records who queried what.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireMerchantSubscriptionViewApi } from "@/lib/admin/require-merchant-subscription-refund-api";

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
  const gate = await requireMerchantSubscriptionViewApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { success: false, error: "backend_not_configured" },
      { status: 503 }
    );
  }

  const url = `${base}/v1/admin/merchant-subscriptions/payments?${request.nextUrl.searchParams.toString()}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Internal-Secret": secret,
        "X-Actor-Subject-Id": String(gate.systemUserId),
        "X-Actor-Role": gate.isSuperAdmin ? "super_admin" : "admin",
      },
    });
    const data = await upstream.json().catch(() => ({}));
    // Enrich the response with the caller's refund capability so the client
    // never has to make a second request just to figure out button state.
    if (upstream.ok && typeof data === "object" && data !== null) {
      (data as Record<string, unknown>).canRefund = gate.canRefund;
      (data as Record<string, unknown>).callerIsSuperAdmin = gate.isSuperAdmin;
    }
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET merchant-subscriptions/payments proxy]", e);
    return NextResponse.json(
      { success: false, error: "backend_unreachable" },
      { status: 502 }
    );
  }
}
