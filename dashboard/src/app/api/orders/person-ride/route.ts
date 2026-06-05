/**
 * GET /api/orders/person-ride
 * List person ride orders from orders_core + orders_ride.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listPersonRideOrders } from "@/lib/db/operations/person-ride-orders";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const [userIsSuperAdmin, hasPersonRideAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email ?? ""),
      hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"),
    ]);

    if (!userIsSuperAdmin && !hasPersonRideAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Person ride orders access required." },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status")?.trim() || undefined;
    const dateFrom = searchParams.get("dateFrom")?.trim() || undefined;
    const dateTo = searchParams.get("dateTo")?.trim() || undefined;
    const search = searchParams.get("search")?.trim() || undefined;

    const result = await listPersonRideOrders({
      page,
      limit,
      status,
      dateFrom,
      dateTo,
      search,
    });

    return NextResponse.json({
      success: true,
      data: result.orders.map((order) => ({
        ...order,
        createdAt:
          order.createdAt instanceof Date
            ? order.createdAt.toISOString()
            : String(order.createdAt),
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit) || 1,
      },
    });
  } catch (error) {
    console.error("[GET /api/orders/person-ride]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load person ride orders" },
      { status: 500 }
    );
  }
}
