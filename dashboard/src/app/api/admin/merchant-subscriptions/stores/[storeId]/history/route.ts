/**
 * GET /api/admin/merchant-subscriptions/stores/:storeId/history
 *
 * Combined purchase + refund history for a single store. Refund events
 * include agent (actor) identity — admin-only view.
 *
 * Access: MERCHANT dashboard access (or super_admin). View-only agents
 * can still see the full history including agent identity of past refunds;
 * REFUND action is only needed to ISSUE a refund, not to see who did.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const gate = await requireMerchantSubscriptionViewApi();
  if (!gate.ok) return gate.response;

  const { storeId } = await params;
  const sid = Number(storeId);
  if (!Number.isInteger(sid) || sid < 1) {
    return NextResponse.json({ success: false, error: "invalid_store_id" }, { status: 400 });
  }

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { success: false, error: "backend_not_configured" },
      { status: 503 }
    );
  }

  const qs = new URLSearchParams(request.nextUrl.searchParams);
  const url = `${base}/v1/admin/merchant-subscriptions/stores/${sid}/history?${qs.toString()}`;
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
    if (upstream.ok && typeof data === "object" && data !== null) {
      (data as Record<string, unknown>).canRefund = gate.canRefund;
      (data as Record<string, unknown>).callerIsSuperAdmin = gate.isSuperAdmin;
    }
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET admin subscription history proxy]", e);
    return NextResponse.json(
      { success: false, error: "backend_unreachable" },
      { status: 502 }
    );
  }
}
