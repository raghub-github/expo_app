/**
 * Parcel orders list for dashboard (orders_core + orders_parcel).
 */

import { getDb } from "../client";
import { ordersCore, ordersParcel, customers, riders } from "../schema";
import {
  eq,
  and,
  or,
  ilike,
  gte,
  lte,
  desc,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  normalizeParcelSearchType,
  type ParcelSearchType,
} from "@/lib/orders/parcel-search";

export type ParcelOrderRow = {
  id: number;
  formattedOrderId: string | null;
  status: string;
  currentStatus: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  customerName: string | null;
  customerMobile: string | null;
  vehicleCategory: string | null;
  vehicleTypeRequired: string | null;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  isCod: boolean | null;
  codAmount: number | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  fare: number | null;
  createdAt: Date;
};

export type ListParcelOrdersFilters = {
  page?: number;
  limit?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  searchType?: ParcelSearchType | string;
};

const PARCEL_STATUSES = [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export const PARCEL_ACTIVE_STATUSES = [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
] as const;

export { PARCEL_STATUSES };

function sqlParcelCurrentStatusKey(): SQL {
  return sql`upper(replace(replace(trim(coalesce(${ordersCore.currentStatus}, '')), ' ', '_'), '-', '_'))`;
}

function sqlParcelCoreStatusKey(): SQL {
  return sql`lower(trim(coalesce(${ordersCore.status}::text, '')))`;
}

/**
 * Delivered / completed / cancelled / failed — never shown on the parcel ops board.
 * Checks core status, current_status label, and cancelled_at (core may lag).
 */
export function sqlParcelOrderIsTerminal(): SQL {
  const cur = sqlParcelCurrentStatusKey();
  const core = sqlParcelCoreStatusKey();
  return sql`(
    ${core} IN (
      'delivered', 'completed', 'complete', 'cancelled', 'failed', 'rejected'
    )
    OR ${cur} IN (
      'DELIVERED', 'COMPLETED', 'COMPLETE', 'CANCELLED', 'CANCELED',
      'FAILED', 'REJECTED'
    )
    OR ${ordersCore.cancelledAt} IS NOT NULL
  )`;
}

const PARCEL_CUR_ASSIGNED = sql`(
  'ASSIGNED', 'SEARCHING_RIDER', 'CREATED', 'PENDING', 'PLACED',
  'CONFIRMED', 'RIDER_ASSIGNED'
)`;
const PARCEL_CUR_ACCEPTED = sql`('ACCEPTED', 'RIDER_ON_THE_WAY', 'ON_THE_WAY')`;
const PARCEL_CUR_REACHED = sql`(
  'REACHED_STORE', 'REACHED_PICKUP', 'RIDER_AT_PICKUP',
  'RIDER_REACHED_PICKUP', 'RIDER_WAITING_FOR_OTP', 'ARRIVED'
)`;
const PARCEL_CUR_PICKED = sql`('PICKED_UP', 'TRIP_STARTED', 'RIDE_IN_PROGRESS')`;
const PARCEL_CUR_TRANSIT = sql`('IN_TRANSIT', 'NEAR_DROP', 'ARRIVED_AT_DROP')`;

/** Any known ops current_status that maps to an active pipeline stage. */
function sqlParcelCurrentMapsToActiveStage(): SQL {
  const cur = sqlParcelCurrentStatusKey();
  return sql`(
    ${cur} IN ${PARCEL_CUR_ASSIGNED}
    OR ${cur} IN ${PARCEL_CUR_ACCEPTED}
    OR ${cur} IN ${PARCEL_CUR_REACHED}
    OR ${cur} IN ${PARCEL_CUR_PICKED}
    OR ${cur} IN ${PARCEL_CUR_TRANSIT}
  )`;
}

/**
 * Stage-tab match: prefer current_status when it maps to a pipeline stage;
 * otherwise fall back to core status (avoids stale core vs advanced current).
 */
function sqlParcelMatchesStage(
  stage: (typeof PARCEL_ACTIVE_STATUSES)[number]
): SQL {
  const cur = sqlParcelCurrentStatusKey();
  const core = sqlParcelCoreStatusKey();
  const curKnown = sqlParcelCurrentMapsToActiveStage();

  const curAliases =
    stage === "assigned"
      ? PARCEL_CUR_ASSIGNED
      : stage === "accepted"
        ? PARCEL_CUR_ACCEPTED
        : stage === "reached_store"
          ? PARCEL_CUR_REACHED
          : stage === "picked_up"
            ? PARCEL_CUR_PICKED
            : PARCEL_CUR_TRANSIT;

  return sql`(
    (${curKnown} AND ${cur} IN ${curAliases})
    OR (NOT ${curKnown} AND ${core} = ${stage})
  )`;
}

function isParcelDirectOrderIdLookup(filters: ListParcelOrdersFilters): boolean {
  const search = filters.search?.trim();
  if (!search) return false;
  const searchType = normalizeParcelSearchType(
    typeof filters.searchType === "string" ? filters.searchType : undefined
  );
  return searchType === "Order Id";
}

function buildParcelSearchCondition(
  search: string,
  searchTypeInput?: ParcelSearchType | string
): SQL | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;

  const searchType = normalizeParcelSearchType(
    typeof searchTypeInput === "string" ? searchTypeInput : undefined
  );
  const like = `%${trimmed}%`;

  switch (searchType) {
    case "Order Id": {
      const gmcMatch = /^GMC\d+$/i.exec(trimmed);
      if (gmcMatch) {
        return ilike(ordersCore.formattedOrderId, trimmed.toUpperCase());
      }
      return or(
        ilike(ordersCore.formattedOrderId, like),
        ilike(ordersCore.orderId, like),
        ilike(ordersCore.externalRef, like)
      );
    }
    case "Internal Order Id": {
      const uuidCandidate = trimmed.trim().toLowerCase();
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          uuidCandidate
        );
      if (isUuid) {
        return eq(ordersCore.orderUuid, uuidCandidate);
      }
      return sql`${ordersCore.orderUuid}::text ILIKE ${like}`;
    }
    case "Receiver Name":
      return or(
        ilike(ordersParcel.receiverName, like),
        ilike(customers.fullName, like)
      );
    case "Receiver Mobile":
      return or(
        ilike(ordersParcel.receiverMobile, like),
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
        ilike(ordersParcel.receiverName, like),
        ilike(ordersParcel.receiverMobile, like),
        ilike(customers.fullName, like),
        ilike(customers.primaryMobile, like),
        ilike(riders.name, like),
        ilike(riders.mobile, like),
        sql`${ordersCore.id}::text ILIKE ${like}`
      );
  }
}

export function isValidParcelStatus(value: string): boolean {
  return (PARCEL_STATUSES as readonly string[]).includes(value);
}

function parseNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function listParcelOrders(
  filters: ListParcelOrdersFilters = {}
): Promise<{ orders: ParcelOrderRow[]; total: number; page: number; limit: number }> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [eq(ordersCore.orderType, "parcel")];

  const status = filters.status?.trim() ?? "";
  const skipActiveScope = isParcelDirectOrderIdLookup(filters);

  if (!skipActiveScope) {
    // Hide completed / cancelled even when core.status still looks active.
    conditions.push(sql`NOT ${sqlParcelOrderIsTerminal()}`);
  }

  if (
    status &&
    (PARCEL_ACTIVE_STATUSES as readonly string[]).includes(status)
  ) {
    conditions.push(
      sqlParcelMatchesStage(status as (typeof PARCEL_ACTIVE_STATUSES)[number])
    );
  } else if (status && isValidParcelStatus(status)) {
    // delivered / cancelled etc. — rare (UI strips these tabs); honor exact core match.
    conditions.push(
      eq(ordersCore.status, status as (typeof PARCEL_STATUSES)[number])
    );
  } else if (!skipActiveScope) {
    conditions.push(
      inArray(
        ordersCore.status,
        PARCEL_ACTIVE_STATUSES as unknown as (typeof PARCEL_STATUSES)[number][]
      )
    );
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
    const searchCondition = buildParcelSearchCondition(search, filters.searchType);
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
      receiverName: ordersParcel.receiverName,
      receiverMobile: ordersParcel.receiverMobile,
      customerName: customers.fullName,
      customerMobile: customers.primaryMobile,
      vehicleCategory: ordersParcel.vehicleCategory,
      vehicleTypeRequired: ordersParcel.vehicleTypeRequired,
      weightKg: ordersParcel.weightKg,
      lengthCm: ordersParcel.lengthCm,
      widthCm: ordersParcel.widthCm,
      heightCm: ordersParcel.heightCm,
      pickupAddressParcel: ordersParcel.pickupAddress,
      dropAddressParcel: ordersParcel.dropAddress,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropAddressNormalized: ordersCore.dropAddressNormalized,
      isCod: ordersParcel.isCod,
      codAmount: ordersParcel.codAmount,
      riderId: ordersCore.riderId,
      riderName: riders.name,
      riderMobile: riders.mobile,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      estimatedFare: ordersParcel.estimatedFare,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
    .where(whereClause)
    .orderBy(desc(ordersCore.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
    .where(whereClause);

  const orders: ParcelOrderRow[] = rows.map((row) => ({
    id: row.id,
    formattedOrderId: row.formattedOrderId,
    status: row.status,
    currentStatus: row.currentStatus,
    receiverName: row.receiverName,
    receiverMobile: row.receiverMobile,
    customerName: row.customerName,
    customerMobile: row.customerMobile,
    vehicleCategory: row.vehicleCategory,
    vehicleTypeRequired: row.vehicleTypeRequired,
    weightKg: parseNum(row.weightKg),
    lengthCm: parseNum(row.lengthCm),
    widthCm: parseNum(row.widthCm),
    heightCm: parseNum(row.heightCm),
    pickupAddress:
      row.pickupAddressParcel?.trim() ||
      row.pickupAddressNormalized?.trim() ||
      row.pickupAddressRaw?.trim() ||
      null,
    dropAddress:
      row.dropAddressParcel?.trim() ||
      row.dropAddressNormalized?.trim() ||
      row.dropAddressRaw?.trim() ||
      null,
    isCod: row.isCod,
    codAmount: parseNum(row.codAmount),
    riderId: row.riderId,
    riderName: row.riderName,
    riderMobile: row.riderMobile,
    fare:
      parseNum(row.grandTotal) ??
      parseNum(row.fareAmount) ??
      parseNum(row.estimatedFare),
    createdAt: row.createdAt,
  }));

  return { orders, total: count ?? 0, page, limit };
}
