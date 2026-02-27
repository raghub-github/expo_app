/**
 * GET /api/riders/[id]/orders – rider orders with filters (orderType, status, date range)
 * Optional ?source=core to query orders_core (hybrid schema) with compat shape.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, orders, ordersCore } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

/** Map orders_core row to legacy-order shape for UI compatibility */
function ordersCoreToLegacyShape(row: typeof ordersCore.$inferSelect) {
  return {
    id: row.id,
    orderType: row.orderType,
    riderId: row.riderId,
    customerId: row.customerId,
    merchantId: row.merchantStoreId,
    pickup_address: row.pickupAddressRaw,
    drop_address: row.dropAddressRaw,
    pickup_lat: row.pickupLat,
    pickup_lon: row.pickupLon,
    drop_lat: row.dropLat,
    drop_lon: row.dropLon,
    distance_km: row.distanceKm,
    eta_seconds: row.etaSeconds,
    fare_amount: row.fareAmount,
    commission_amount: row.commissionAmount,
    rider_earning: row.riderEarning,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    external_ref: row.externalRef,
    order_uuid: row.orderUuid,
    order_source: row.orderSource,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();
    const [riderRow] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!riderRow) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const orderType = searchParams.get("orderType");
    const status = searchParams.get("status");
    const sourceCore = searchParams.get("source") === "core";
    const orderIdParam = (searchParams.get("orderId") || searchParams.get("q") || "").trim();

    if (sourceCore) {
      const conditions: any[] = [eq(ordersCore.riderId, riderId)];
      if (orderType && orderType !== "all") {
        conditions.push(eq(ordersCore.orderType, orderType as "food" | "parcel" | "person_ride"));
      }
      if (status && status !== "all") {
        conditions.push(eq(ordersCore.status, status as any));
      }
      if (from) conditions.push(gte(ordersCore.createdAt, new Date(from)));
      if (to) conditions.push(lte(ordersCore.createdAt, new Date(to)));
      const orderIdNum = orderIdParam ? parseInt(orderIdParam, 10) : NaN;
      if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
        conditions.push(eq(ordersCore.id, orderIdNum));
      }
      const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ordersCore)
        .where(whereClause);
      const list = await db
        .select()
        .from(ordersCore)
        .where(whereClause)
        .orderBy(desc(ordersCore.createdAt))
        .limit(Number.isNaN(limit) ? 30 : limit)
        .offset(offset);
      const mapped = list.map(ordersCoreToLegacyShape);
      return NextResponse.json({ success: true, data: { orders: mapped, total: Number(total) ?? 0 }, source: "core" });
    }

    const conditions: any[] = [eq(orders.riderId, riderId)];
    if (orderType && orderType !== "all") {
      conditions.push(eq(orders.orderType, orderType as "food" | "parcel" | "person_ride"));
    }
    if (status && status !== "all") {
      conditions.push(eq(orders.status, status as any));
    }
    if (from) conditions.push(gte(orders.createdAt, new Date(from)));
    if (to) conditions.push(lte(orders.createdAt, new Date(to)));
    const orderIdNum = orderIdParam ? parseInt(orderIdParam, 10) : NaN;
    if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
      conditions.push(eq(orders.id, orderIdNum));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    const list = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(Number.isNaN(limit) ? 30 : limit)
      .offset(offset);

    return NextResponse.json({ success: true, data: { orders: list, total: Number(total) ?? 0 } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/orders] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
