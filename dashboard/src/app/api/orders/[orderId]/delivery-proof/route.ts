import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/[orderId]/delivery-proof
 * Latest rider delivery proof image URL for an order (orders_core.id).
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { fetchOrderDeliveryProofImageUrl } from "@/lib/db/operations/order-detail-enrichment";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

export const runtime = "nodejs";

function parseId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseId(orderIdParam);

    if (!orderCoreId) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deliveryProofImageUrl = await fetchOrderDeliveryProofImageUrl(orderCoreId);
    const displayUrl = deliveryProofImageUrl
      ? resolveAttachmentProxyUrl(deliveryProofImageUrl)
      : null;

    return NextResponse.json({
      deliveryProofImageUrl: displayUrl,
      hasDeliveryProof: Boolean(displayUrl),
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/delivery-proof] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
