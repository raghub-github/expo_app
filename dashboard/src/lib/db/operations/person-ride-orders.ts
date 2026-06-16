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
import {
  normalizePersonRideSearchType,
  type PersonRideSearchType,
} from "@/lib/orders/person-ride-search";

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
  searchType?: PersonRideSearchType | string;
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

export { PERSON_RIDE_STATUSES };

function buildPersonRideSearchCondition(
  search: string,
  searchTypeInput?: PersonRideSearchType | string
): SQL | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;

  const searchType = normalizePersonRideSearchType(
    typeof searchTypeInput === "string" ? searchTypeInput : undefined
  );
  const like = `%${trimmed}%`;

  switch (searchType) {
    case "Order Id": {
      const gmpMatch = /^GMP\d+$/i.exec(trimmed);
      if (gmpMatch) {
        return ilike(ordersCore.formattedOrderId, trimmed.toUpperCase());
      }
      return or(
        ilike(ordersCore.formattedOrderId, like),
        ilike(ordersCore.orderId, like),
        ilike(ordersCore.externalRef, like)
      );
    }
    case "Internal Order Id": {
      const orderIdNum = parseInt(trimmed, 10);
      if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
        return eq(ordersCore.id, orderIdNum);
      }
      return sql`${ordersCore.id}::text ILIKE ${like}`;
    }
    case "Passenger Name":
      return or(
        ilike(ordersRide.passengerName, like),
        ilike(customers.fullName, like)
      );
    case "Passenger Mobile":
      return or(
        ilike(ordersRide.passengerPhone, like),
        ilike(customers.primaryMobile, like)
      );
    case "Customer Mobile":
      return ilike(customers.primaryMobile, like);
    case "Rider Name":
      return ilike(riders.name, like);
    case "Rider Mobile":
      return ilike(riders.mobile, like);
    case "Rider Id": {
      const riderNum = parseInt(trimmed.replace(/^GMR/i, ""), 10);
      if (!Number.isNaN(riderNum) && riderNum > 0) {
        return eq(ordersCore.riderId, riderNum);
      }
      return sql`${ordersCore.riderId}::text ILIKE ${like}`;
    }
    default:
      return or(
        ilike(ordersCore.formattedOrderId, like),
        ilike(ordersRide.passengerName, like),
        ilike(ordersRide.passengerPhone, like),
        ilike(customers.fullName, like),
        ilike(customers.primaryMobile, like),
        ilike(riders.name, like),
        ilike(riders.mobile, like),
        sql`${ordersCore.id}::text ILIKE ${like}`
      );
  }
}

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
    const searchCondition = buildPersonRideSearchCondition(search, filters.searchType);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
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
