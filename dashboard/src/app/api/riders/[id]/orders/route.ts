/**
 * GET /api/riders/[id]/orders – rider orders with filters (orderType, status, date range)
 * Primary source: orders_core + order_rider_assignments (legacy `orders` table optional fallback).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, orders } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { listRiderOrdersPaginated } from "@/lib/riders/rider-orders-query";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

type RiderOrderUiRow = {
  id: number;
  orderType: string;
  status: string;
  fareAmount: string | null;
  riderEarning: string | null;
  createdAt: string;
  externalRef: string | null;
  earningCreditPending?: boolean;
  paymentStatus?: string | null;
};

function mapLegacyOrderRow(row: typeof orders.$inferSelect): RiderOrderUiRow {
  return {
    id: row.id,
    orderType: row.orderType,
    status: row.status,
    fareAmount: row.fareAmount != null ? String(row.fareAmount) : null,
    riderEarning: row.riderEarning != null ? String(row.riderEarning) : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    externalRef: row.externalRef != null ? String(row.externalRef) : String(row.id),
  };
}

function mapCoreOrderRow(row: {
  id: number;
  orderType: string;
  status: string;
  fareAmount: string | number | null;
  riderEarning: string | number | null;
  createdAt: Date | string;
  formattedOrderId?: string | null;
  orderId?: string | null;
  externalRef?: string | null;
  earningCreditPending?: boolean;
  paymentStatus?: string | null;
}): RiderOrderUiRow {
  const externalRef =
    (row.formattedOrderId?.trim() || null) ||
    (row.orderId?.trim() || null) ||
    (row.externalRef?.trim() || null) ||
    String(row.id);

  return {
    id: row.id,
    orderType: row.orderType,
    status: row.status,
    fareAmount: row.fareAmount != null ? String(row.fareAmount) : null,
    riderEarning: row.riderEarning != null ? String(row.riderEarning) : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    externalRef,
    earningCreditPending: row.earningCreditPending === true,
    paymentStatus: row.paymentStatus ?? null,
  };
}

function parseFromBound(from: string): string {
  return `${from}T00:00:00.000Z`;
}

function parseToBound(to: string): string {
  return `${to}T23:59:59.999Z`;
}

function shouldUseLegacyOrders(sourceParam: string | null): boolean {
  return sourceParam === "legacy";
}

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
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
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
    const sourceParam = searchParams.get("source");
    const orderIdParam = (searchParams.get("orderId") || searchParams.get("q") || "").trim();

    if (!shouldUseLegacyOrders(sourceParam)) {
      const result = await listRiderOrdersPaginated(db, riderId, {
        limit,
        offset,
        orderType,
        status,
        from,
        to,
        orderId: orderIdParam,
      });
      return NextResponse.json({
        success: true,
        data: {
          orders: result.orders.map((row) =>
            mapCoreOrderRow({
              id: row.id,
              orderType: row.orderType,
              status: row.status,
              fareAmount: row.fareAmount,
              riderEarning: row.riderEarning,
              createdAt: row.createdAt,
              formattedOrderId: row.formattedOrderId,
              orderId: row.orderId,
              externalRef: row.externalRef,
              earningCreditPending: row.earningCreditPending,
              paymentStatus: row.paymentStatus,
            })
          ),
          total: result.total,
        },
        source: result.source,
      });
    }

    const conditions: Parameters<typeof and>[0][] = [eq(orders.riderId, riderId)];
    if (orderType && orderType !== "all") {
      conditions.push(eq(orders.orderType, orderType as "food" | "parcel" | "person_ride"));
    }
    if (status && status !== "all") {
      conditions.push(eq(orders.status, status as (typeof orders.$inferSelect)["status"]));
    }
    if (from) conditions.push(gte(orders.createdAt, new Date(parseFromBound(from))));
    if (to) conditions.push(lte(orders.createdAt, new Date(parseToBound(to))));
    const orderIdNum = orderIdParam ? parseInt(orderIdParam, 10) : NaN;
    if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
      conditions.push(eq(orders.id, orderIdNum));
    }

    const whereClause = and(...conditions);
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    const list = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: { orders: list.map(mapLegacyOrderRow), total: Number(total) ?? 0 },
      source: "legacy",
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/orders] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
