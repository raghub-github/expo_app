/**
 * GET /api/customers/[id]/orders-core?orderType=food|parcel|person_ride
 * List orders_core rows for the customer (by internal id or customer_id string).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions/engine";
import { getCustomerById, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import { listOrdersCore } from "@/lib/db/operations/orders-core";

export const runtime = "nodejs";

const VALID_ORDER_TYPES = ["food", "parcel", "person_ride"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const hasPermission = await checkPermission(
      user.id,
      user.email ?? "",
      "CUSTOMERS",
      "VIEW"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const numericId = parseInt(id, 10);
    const customer =
      !isNaN(numericId) && numericId.toString() === id
        ? await getCustomerById(numericId)
        : await getCustomerByCustomerId(id);

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const orderTypeParam = request.nextUrl.searchParams.get("orderType") ?? "food";
    const orderType = VALID_ORDER_TYPES.includes(orderTypeParam as (typeof VALID_ORDER_TYPES)[number])
      ? (orderTypeParam as (typeof VALID_ORDER_TYPES)[number])
      : "food";

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10))
    );

    const result = await listOrdersCore({
      page,
      limit,
      orderType,
      customerDbId: customer.id,
      sortBy: "created_at",
      sortOrder: "desc",
    });

    return NextResponse.json({
      success: true,
      data: result.orders,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (e) {
    console.error("GET /api/customers/[id]/orders-core", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
