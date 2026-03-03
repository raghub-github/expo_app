import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listOrderRiderAssignmentsForOrder } from "@/lib/db/operations/order-rider-assignments";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
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

    const assignments = await listOrderRiderAssignmentsForOrder(orderId);

    return NextResponse.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[GET /api/orders/[orderId]/rider-assignments] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

