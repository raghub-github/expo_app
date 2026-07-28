/**
 * GET /api/orders/[orderId]/rider-activity-log
 * Full rider assignment activity log for an order (orders_core.id).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getOrderRiderActivityLogPayload } from "@/lib/db/operations/order-rider-assignments";

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

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await getOrderRiderActivityLogPayload(orderCoreId);

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/rider-activity-log] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
