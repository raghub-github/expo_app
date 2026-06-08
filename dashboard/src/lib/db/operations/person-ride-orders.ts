/**
 * Person ride orders list for dashboard (orders_core + orders_ride).
 */

import { getDb } from "../client";
import { ordersCore, ordersRide, customers, riders } from "../schema";
import {
  eq,
  and,
  or,
  ilike,
  gte,
  lte,
  desc,
  sql,
  type SQL,
} from "drizzle-orm";

export type PersonRideOrderRow = {
  id: number;
  formattedOrderId: string | null;
  status: string;
  currentStatus: string | null;
  passengerName: string | null;
  passengerPhone: string | null;
  customerName: string | null;
  customerMobile: string | null;
  rideType: string | null;
  vehicleTypeRequired: string | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  fare: number | null;
  createdAt: Date;
};

export type ListPersonRideOrdersFilters = {
  page?: number;
  limit?: number;
  /** orders_core.status e.g. assigned, accepted, delivered, cancelled */
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

const PERSON_RIDE_STATUSES = [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export function isValidPersonRideStatus(value: string): boolean {
  return (PERSON_RIDE_STATUSES as readonly string[]).includes(value);
}

function parseFare(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function listPersonRideOrders(
  filters: ListPersonRideOrdersFilters = {}
): Promise<{ orders: PersonRideOrderRow[]; total: number; page: number; limit: number }> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [eq(ordersCore.orderType, "person_ride")];

  if (filters.status?.trim() && isValidPersonRideStatus(filters.status.trim())) {
    conditions.push(eq(ordersCore.status, filters.status.trim() as never));
  }

  if (filters.dateFrom) {
    const d = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(gte(ordersCore.createdAt, d));
    }
  }

  if (filters.dateTo) {
    const d = new Date(`${filters.dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(lte(ordersCore.createdAt, d));
    }
  }

  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(ordersCore.formattedOrderId, term),
        ilike(ordersRide.passengerName, term),
        ilike(ordersRide.passengerPhone, term),
        ilike(customers.fullName, term),
        ilike(customers.primaryMobile, term),
        ilike(riders.name, term),
        ilike(riders.mobile, term),
        sql`${ordersCore.id}::text ILIKE ${term}`
      )!
    );
  }

  const whereClause = and(...conditions);

  const rows = await db
    .select({
      id: ordersCore.id,
      formattedOrderId: ordersCore.formattedOrderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      passengerName: ordersRide.passengerName,
      passengerPhone: ordersRide.passengerPhone,
      customerName: customers.fullName,
      customerMobile: customers.primaryMobile,
      rideType: ordersRide.rideType,
      vehicleTypeRequired: ordersRide.vehicleTypeRequired,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropAddressNormalized: ordersCore.dropAddressNormalized,
      riderId: ordersCore.riderId,
      riderName: riders.name,
      riderMobile: riders.mobile,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
    .where(whereClause)
    .orderBy(desc(ordersCore.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
    .where(whereClause);

  const orders: PersonRideOrderRow[] = rows.map((row) => ({
    id: row.id,
    formattedOrderId: row.formattedOrderId,
    status: row.status,
    currentStatus: row.currentStatus,
    passengerName: row.passengerName,
    passengerPhone: row.passengerPhone,
    customerName: row.customerName,
    customerMobile: row.customerMobile,
    rideType: row.rideType,
    vehicleTypeRequired: row.vehicleTypeRequired,
    pickupAddress:
      row.pickupAddressNormalized?.trim() ||
      row.pickupAddressRaw?.trim() ||
      null,
    dropAddress:
      row.dropAddressNormalized?.trim() || row.dropAddressRaw?.trim() || null,
    riderId: row.riderId,
    riderName: row.riderName,
    riderMobile: row.riderMobile,
    fare: parseFare(row.grandTotal) ?? parseFare(row.fareAmount),
    createdAt: row.createdAt,
  }));

  return { orders, total: count ?? 0, page, limit };
}
