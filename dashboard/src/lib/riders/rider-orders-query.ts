/**
 * Shared rider order queries for dashboard (orders_core + order_rider_assignments, legacy fallback).
 */

import { orders, ordersCore, ordersRide } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { eq, and, desc, gte, lte, sql, or, ilike } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { formatRiderOrderDisplayId } from "@/lib/riders/format-rider-order-display-id";
import { enrichRiderOrdersWithEarnings } from "@/lib/riders/rider-order-earnings";
import { enrichRiderOrdersWithAssignmentStatus } from "@/lib/riders/rider-order-assignment-status";

export { formatRiderOrderDisplayId };

type Db = ReturnType<typeof getDb>;
type OrdersCoreRow = InferSelectModel<typeof ordersCore>;
type OrdersLegacyRow = InferSelectModel<typeof orders>;

export type RiderRecentOrderFilters = {
  limit: number;
  from?: string;
  to?: string;
  orderType?: string;
  status?: string;
  orderId?: string;
};

export type RiderRecentOrderRow = {
  id: number;
  orderType: string;
  status: string;
  riderId: number | null;
  customerId: number | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  pickupLat: number | null;
  pickupLon: number | null;
  dropLat: number | null;
  dropLon: number | null;
  distanceKm: number | null;
  fareAmount: string | number | null;
  riderEarning: string | number | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  formattedOrderId?: string | null;
  orderId?: string | null;
  externalRef?: string | null;
  displayOrderId?: string | null;
  grandTotal?: string | number | null;
  tipAmount?: string | number | null;
  billingSnapshot?: unknown;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
  walletCredited?: boolean;
  walletDebited?: boolean;
  hasLedgerEntry?: boolean;
  earningCreditPending?: boolean;
  riderAssignmentStatus?: string | null;
  riderRideUnassigned?: boolean;
  assignmentRiderEarning?: string | number | null;
  assignmentTipAmount?: string | number | null;
  acceptPayoutSnapshot?: unknown;
};

function parseFromBound(from: string): string {
  return `${from}T00:00:00.000Z`;
}

function parseToBound(to: string): string {
  return `${to}T23:59:59.999Z`;
}

export function riderOrderScopeCondition(riderId: number) {
  return or(
    eq(ordersCore.riderId, riderId),
    sql`${ordersCore.id} IN (
      SELECT order_core_id FROM order_rider_assignments
      WHERE rider_id = ${riderId} AND order_core_id IS NOT NULL
      UNION
      SELECT order_id FROM order_rider_assignments
      WHERE rider_id = ${riderId} AND order_id IS NOT NULL
    )`
  );
}

function buildCoreOrderIdCondition(orderIdParam: string) {
  const gmfMatch = /^GMF\d+$/i.exec(orderIdParam);
  if (gmfMatch) {
    return ilike(ordersCore.formattedOrderId, orderIdParam.toUpperCase());
  }

  const orderIdNum = parseInt(orderIdParam, 10);
  if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
    return eq(ordersCore.id, orderIdNum);
  }

  const like = `%${orderIdParam}%`;
  return or(
    ilike(ordersCore.formattedOrderId, like),
    ilike(ordersCore.orderId, like),
    ilike(ordersCore.externalRef, like)
  );
}

function mapCoreRow(row: {
  id: number;
  orderType: OrdersCoreRow["orderType"];
  status: OrdersCoreRow["status"];
  riderId: number | null;
  customerId: number | null;
  pickupAddressRaw: string;
  dropAddressRaw: string;
  pickupLat: string | number;
  pickupLon: string | number;
  dropLat: string | number;
  dropLon: string | number;
  distanceKm: string | number | null;
  fareAmount: string | number | null;
  riderEarning: string | number | null;
  grandTotal?: string | number | null;
  tipAmount?: string | number | null;
  billingSnapshot?: unknown;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
  formattedOrderId: string | null;
  orderId: string | null;
  externalRef: string | null;
}): RiderRecentOrderRow {
  const formattedOrderId = row.formattedOrderId?.trim() || null;
  const orderId = row.orderId?.trim() || null;
  const externalRef = row.externalRef?.trim() || null;

  return {
    id: row.id,
    orderType: row.orderType,
    status: row.status,
    riderId: row.riderId,
    customerId: row.customerId,
    pickupAddress: row.pickupAddressRaw ?? null,
    dropAddress: row.dropAddressRaw ?? null,
    pickupLat: row.pickupLat != null ? Number(row.pickupLat) : null,
    pickupLon: row.pickupLon != null ? Number(row.pickupLon) : null,
    dropLat: row.dropLat != null ? Number(row.dropLat) : null,
    dropLon: row.dropLon != null ? Number(row.dropLon) : null,
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
    fareAmount: row.fareAmount,
    riderEarning: row.riderEarning,
    grandTotal: row.grandTotal ?? null,
    tipAmount: row.tipAmount ?? null,
    billingSnapshot: row.billingSnapshot ?? null,
    paymentStatus: row.paymentStatus ?? null,
    adminRiderPaymentClearedAt: row.adminRiderPaymentClearedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    formattedOrderId,
    orderId,
    externalRef,
    displayOrderId:
      formattedOrderId ||
      orderId ||
      externalRef ||
      null,
  };
}

function mapLegacyRow(row: OrdersLegacyRow): RiderRecentOrderRow {
  return {
    id: row.id,
    orderType: row.orderType,
    status: row.status,
    riderId: row.riderId,
    customerId: row.customerId,
    pickupAddress: row.pickupAddress ?? null,
    dropAddress: row.dropAddress ?? null,
    pickupLat: row.pickupLat ?? null,
    pickupLon: row.pickupLon ?? null,
    dropLat: row.dropLat ?? null,
    dropLon: row.dropLon ?? null,
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
    fareAmount: row.fareAmount,
    riderEarning: row.riderEarning,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    externalRef: row.externalRef ?? null,
  };
}

async function listFromOrdersCore(
  db: Db,
  riderId: number,
  filters: RiderRecentOrderFilters
): Promise<RiderRecentOrderRow[]> {
  const conditions = [riderOrderScopeCondition(riderId)];

  if (filters.from) {
    conditions.push(gte(ordersCore.createdAt, new Date(parseFromBound(filters.from))));
  }
  if (filters.to) {
    conditions.push(lte(ordersCore.createdAt, new Date(parseToBound(filters.to))));
  }
  if (filters.orderType && filters.orderType !== "all") {
    conditions.push(
      eq(ordersCore.orderType, filters.orderType as OrdersCoreRow["orderType"])
    );
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(
      eq(ordersCore.status, filters.status as OrdersCoreRow["status"])
    );
  }
  if (filters.orderId?.trim()) {
    conditions.push(buildCoreOrderIdCondition(filters.orderId.trim()));
  }

  const rows = await db
    .select({
      id: ordersCore.id,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      riderId: ordersCore.riderId,
      customerId: ordersCore.customerId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropAddressRaw: ordersCore.dropAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      fareAmount: ordersCore.fareAmount,
      riderEarning: ordersCore.riderEarning,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      paymentStatus: ordersCore.paymentStatus,
      adminRiderPaymentClearedAt: ordersRide.adminRiderPaymentClearedAt,
      createdAt: ordersCore.createdAt,
      updatedAt: ordersCore.updatedAt,
      formattedOrderId: ordersCore.formattedOrderId,
      orderId: ordersCore.orderId,
      externalRef: ordersCore.externalRef,
    })
    .from(ordersCore)
    .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(ordersCore.createdAt))
    .limit(filters.limit);

  return enrichRiderOrdersWithAssignmentStatus(
    riderId,
    await enrichRiderOrdersWithEarnings(db, riderId, rows.map(mapCoreRow))
  );
}

async function listFromLegacyOrders(
  db: Db,
  riderId: number,
  filters: RiderRecentOrderFilters
): Promise<RiderRecentOrderRow[]> {
  const conditions = [eq(orders.riderId, riderId)];

  if (filters.from) {
    conditions.push(gte(orders.createdAt, new Date(parseFromBound(filters.from))));
  }
  if (filters.to) {
    conditions.push(lte(orders.createdAt, new Date(parseToBound(filters.to))));
  }
  if (filters.orderType && filters.orderType !== "all") {
    conditions.push(
      eq(orders.orderType, filters.orderType as OrdersLegacyRow["orderType"])
    );
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(
      eq(orders.status, filters.status as OrdersLegacyRow["status"])
    );
  }
  if (filters.orderId?.trim()) {
    const orderIdNum = parseInt(filters.orderId.trim(), 10);
    if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
      conditions.push(eq(orders.id, orderIdNum));
    }
  }

  const rows = await db
    .select()
    .from(orders)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(orders.createdAt))
    .limit(filters.limit);

  return rows.map(mapLegacyRow);
}

export async function listRiderOrdersPaginated(
  db: Db,
  riderId: number,
  args: {
    limit: number;
    offset: number;
    from?: string | null;
    to?: string | null;
    orderType?: string | null;
    status?: string | null;
    orderId?: string;
  }
): Promise<{ orders: RiderRecentOrderRow[]; total: number; source: "core" | "legacy" }> {
  const filters: RiderRecentOrderFilters = {
    limit: args.limit,
    from: args.from ?? undefined,
    to: args.to ?? undefined,
    orderType: args.orderType ?? undefined,
    status: args.status ?? undefined,
    orderId: args.orderId,
  };

  try {
    const conditions = [riderOrderScopeCondition(riderId)];
    if (filters.from) {
      conditions.push(gte(ordersCore.createdAt, new Date(parseFromBound(filters.from))));
    }
    if (filters.to) {
      conditions.push(lte(ordersCore.createdAt, new Date(parseToBound(filters.to))));
    }
    if (filters.orderType && filters.orderType !== "all") {
      conditions.push(
        eq(ordersCore.orderType, filters.orderType as OrdersCoreRow["orderType"])
      );
    }
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(ordersCore.status, filters.status as OrdersCoreRow["status"]));
    }
    if (filters.orderId?.trim()) {
      conditions.push(buildCoreOrderIdCondition(filters.orderId.trim()));
    }

    const whereClause = and(...conditions);
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersCore)
      .where(whereClause);

    const rows = await db
      .select({
        id: ordersCore.id,
        orderType: ordersCore.orderType,
        status: ordersCore.status,
        riderId: ordersCore.riderId,
        customerId: ordersCore.customerId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        dropAddressRaw: ordersCore.dropAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        fareAmount: ordersCore.fareAmount,
        riderEarning: ordersCore.riderEarning,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        paymentStatus: ordersCore.paymentStatus,
        adminRiderPaymentClearedAt: ordersRide.adminRiderPaymentClearedAt,
        createdAt: ordersCore.createdAt,
        updatedAt: ordersCore.updatedAt,
        formattedOrderId: ordersCore.formattedOrderId,
        orderId: ordersCore.orderId,
        externalRef: ordersCore.externalRef,
      })
      .from(ordersCore)
      .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(whereClause)
      .orderBy(desc(ordersCore.createdAt))
      .limit(args.limit)
      .offset(args.offset);

    return {
      orders: await enrichRiderOrdersWithAssignmentStatus(
        riderId,
        await enrichRiderOrdersWithEarnings(db, riderId, rows.map(mapCoreRow))
      ),
      total: Number(total) ?? 0,
      source: "core",
    };
  } catch (err) {
    console.warn("[listRiderOrdersPaginated] orders_core failed, trying legacy:", err);
  }

  const legacyConditions = [eq(orders.riderId, riderId)];
  if (filters.from) {
    legacyConditions.push(gte(orders.createdAt, new Date(parseFromBound(filters.from))));
  }
  if (filters.to) {
    legacyConditions.push(lte(orders.createdAt, new Date(parseToBound(filters.to))));
  }
  if (filters.orderType && filters.orderType !== "all") {
    legacyConditions.push(
      eq(orders.orderType, filters.orderType as OrdersLegacyRow["orderType"])
    );
  }
  if (filters.status && filters.status !== "all") {
    legacyConditions.push(eq(orders.status, filters.status as OrdersLegacyRow["status"]));
  }
  if (filters.orderId?.trim()) {
    const orderIdNum = parseInt(filters.orderId.trim(), 10);
    if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
      legacyConditions.push(eq(orders.id, orderIdNum));
    }
  }

  const legacyWhere = legacyConditions.length > 1 ? and(...legacyConditions) : legacyConditions[0];
  const [{ count: legacyTotal }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(legacyWhere);

  const legacyRows = await db
    .select()
    .from(orders)
    .where(legacyWhere)
    .orderBy(desc(orders.createdAt))
    .limit(args.limit)
    .offset(args.offset);

  return {
    orders: legacyRows.map(mapLegacyRow),
    total: Number(legacyTotal) ?? 0,
    source: "legacy",
  };
}

/** Primary: orders_core (+ assignments). Legacy only when core query throws. */
export async function fetchRiderRecentOrders(
  db: Db,
  riderId: number,
  filters: RiderRecentOrderFilters
): Promise<RiderRecentOrderRow[]> {
  try {
    return await listFromOrdersCore(db, riderId, filters);
  } catch (err) {
    console.warn("[fetchRiderRecentOrders] orders_core query failed, trying legacy:", err);
  }

  try {
    return await listFromLegacyOrders(db, riderId, filters);
  } catch (err) {
    console.warn("[fetchRiderRecentOrders] legacy orders query failed:", err);
    return [];
  }
}
