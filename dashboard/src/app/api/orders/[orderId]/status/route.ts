import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  updateOrderStatus,
  UPDATEABLE_ORDER_STATUSES,
  type UpdateableOrderStatus,
} from "@/lib/db/operations/orders-core";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { creditMerchantWalletAfterDashboardDelivery } from "@/lib/credit-merchant-wallet-after-delivery";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    if (
      typeof status !== "string" ||
      !(UPDATEABLE_ORDER_STATUSES as readonly string[]).includes(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid status. Allowed: picked_up (Dispatch Ready), in_transit (Dispatched), delivered (Delivered).",
        },
        { status: 400 }
      );
    }

    const userEmail = (user.email ?? "").trim() || "unknown";
    const systemUser = await getSystemUserByEmail(userEmail);
    const updatedByRole = systemUser?.primaryRole ?? "AGENT";
    const result = await updateOrderStatus(
      orderId,
      status as UpdateableOrderStatus,
      userEmail,
      updatedByRole
    );
    if (!result.updated) {
      if (result.reason === "INVALID_TRANSITION") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This status cannot be applied again. The order has already reached this stage or a later one.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Order not found or not updated" },
        { status: 404 }
      );
    }

    if (status === "delivered") {
      try {
        await creditMerchantWalletAfterDashboardDelivery(orderId);
      } catch (walletErr) {
        console.warn("[PATCH /api/orders/[orderId]/status] wallet credit:", walletErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: { status, orderId, updatedByEmail: userEmail },
    });
  } catch (error) {
    console.error("[PATCH /api/orders/[orderId]/status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
