import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/parcel
 * List parcel orders from orders_core + orders_parcel.
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listParcelOrders } from "@/lib/db/operations/parcel-orders";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const [userIsSuperAdmin, hasParcelAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email ?? ""),
      hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PARCEL"),
    ]);

    if (!userIsSuperAdmin && !hasParcelAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Parcel orders access required." },
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
    const searchType = searchParams.get("searchType")?.trim() || undefined;

    const result = await listParcelOrders({
      page,
      limit,
      status,
      dateFrom,
      dateTo,
      search,
      searchType,
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
    console.error("[GET /api/orders/parcel]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load parcel orders" },
      { status: 500 }
    );
  }
}
