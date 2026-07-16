/**
 * GET /api/admin/merchant-subscriptions/refunds
 *   Query: storeId? merchantId? paymentId? limit? offset?
 *
 * Admin refund audit trail. Includes agent (actor) identity in every row.
 * Proxies to backend /v1/admin/merchant-subscriptions/refunds.
 *
 * Access: MERCHANT dashboard access (or super_admin). Any merchant-facing
 * agent can view refund history — including agents without REFUND action —
 * so support staff can see who did what without being able to issue refunds.
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

  const url = `${base}/v1/admin/merchant-subscriptions/refunds?${request.nextUrl.searchParams.toString()}`;
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
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET merchant-subscriptions/refunds proxy]", e);
    return NextResponse.json(
      { success: false, error: "backend_unreachable" },
      { status: 502 }
    );
  }
}
