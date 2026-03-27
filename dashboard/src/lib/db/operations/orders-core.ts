/**
 * Database operations for orders_core (hybrid order table).
 * List food/parcel/ride orders with search and status filters.
 */

import { getDb } from "../client";
import { ordersCore, orderManualStatusHistory, orderTimelines, ordersFood, customers, riders, orderCancellationReasons } from "../schema";
import { eq, and, or, ilike, sql, desc, asc, inArray, lte } from "drizzle-orm";

export type OrderStatusFilter =
  | "PAYMENT DONE"
  | "ACCEPTED"
  | "DESPATCH READY"
  | "DESPATCHED"
  | "BULK"
  | null;

export type OrderSearchType =
  | "Order Id"
  | "Merchant Id"
  | "Customer Mobile"
  | "Third Party Order Id"
  | "ONDC Order Id"
  | "Client Reference Id"
  | "Partner Order Id"
  | "Internal Order Id"
  | "Rider Mobile"
  | "Tracking Order Id"
  | "Client Name";

export interface ListOrdersCoreFilters {
  page?: number;
  limit?: number;
  id?: number;
  search?: string;
  searchType?: OrderSearchType;
  statusFilter?: OrderStatusFilter;
  orderType?: "food" | "parcel" | "person_ride";
  sortBy?: "created_at" | "updated_at" | "placed_at";
  sortOrder?: "asc" | "desc";
}

export interface OrdersCoreRow {
  id: number;
  orderUuid: string;
  orderType: string;
  orderSource: string | null;
  paymentMethod: string | null;
  formattedOrderId: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  fareAmount: number | null;
  itemTotal?: number | null;
  addonTotal?: number | null;
  grandTotal?: number | null;
  tipAmount?: number | null;
  createdAt: Date;
  updatedAt: Date;
  /** Email of agent who added latest remark (for "Routed To"). Null when no remarks exist. */
  routedToEmail: string | null;
  // Customer info
  customerId: number | null;
  customerExternalId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  customerAccountStatus: string | null;
  customerRiskFlag: string | null;
  // Rider info
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  // Merchant / order meta
  merchantStoreId: number | null;
  merchantParentId: number | null;
  dropAddressRaw: string | null;
  dropAddressNormalized: string | null;
  dropAddressGeocoded: string | null;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropLat?: number | null;
  dropLon?: number | null;
  pickupAddressDeviationMeters?: number | null;
  dropAddressDeviationMeters?: number | null;
  distanceMismatchFlagged?: boolean;
  distanceKm?: number | null;
  isBulkOrder: boolean;
  /** Latest internal remark text for this order (for action column). */
  latestRemark: string | null;
  /** Email of last user who manually updated order status (Dispatch Ready / Dispatched / Delivered). */
  manualStatusUpdatedByEmail: string | null;
  /** ETA in seconds from order creation (for timeline "X mins left / elapsed past ETA"). */
  etaSeconds?: number | null;
  /** Expected delivery timestamp (preferred over createdAt + etaSeconds for ETA). */
  estimatedDeliveryTime?: Date | null;
  /** First ETA set when order accepted / first estimated (sidebar "First ETA"). */
  firstEtaAt?: Date | null;
  /** When ETA was first breached (for ETA breached tag; mins elapsed computed at display time). */
  etaBreachedAt?: Date | null;
  /** order_timelines.id of the stage current when ETA was first breached (red dot on timeline). */
  etaBreachedTimelineId?: number | null;
}

const STATUS_FILTER_TO_DB = {
  "PAYMENT DONE": {
    paymentStatus: "completed" as const,
  },
  ACCEPTED: {
    status: ["accepted"] as const,
  },
  "DESPATCH READY": {
    status: ["reached_store", "picked_up"] as const,
  },
  DESPATCHED: {
    status: ["in_transit", "delivered"] as const,
  },
  BULK: {
    isBulkOrder: true,
  },
};

/**
 * List orders from orders_core with optional search and status filter.
 * For food orders page: orderType = 'food'.
 */
export async function listOrdersCore(
  filters: ListOrdersCoreFilters = {}
): Promise<{ orders: OrdersCoreRow[]; total: number; page: number; limit: number }> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;
  const orderType = filters.orderType ?? "food";
  const sortBy = filters.sortBy ?? "created_at";
  const sortOrder = filters.sortOrder ?? "desc";

  const conditions = [eq(ordersCore.orderType, orderType)];

  if (filters.id != null && Number.isFinite(filters.id)) {
    conditions.push(eq(ordersCore.id, filters.id));
  }

  // Status filter
  const statusFilter = filters.statusFilter ?? null;
  if (statusFilter && statusFilter in STATUS_FILTER_TO_DB) {
    const mapping = STATUS_FILTER_TO_DB[statusFilter as keyof typeof STATUS_FILTER_TO_DB];
    if ("status" in mapping) {
      conditions.push(inArray(ordersCore.status, [...mapping.status]));
    } else if ("paymentStatus" in mapping) {
      conditions.push(eq(ordersCore.paymentStatus, mapping.paymentStatus));
    } else if ("isBulkOrder" in mapping) {
      conditions.push(eq(ordersCore.isBulkOrder, true));
    }
  }

  // Search
  const search = filters.search?.trim();
  const searchType = filters.searchType ?? "Order Id";
  if (search) {
    const term = `%${search}%`;
    const exact = search.replace(/%/g, "");
    switch (searchType) {
      case "Order Id":
        conditions.push(
          or(
            ilike(ordersCore.formattedOrderId, term),
            eq(ordersCore.formattedOrderId, exact)
          )!
        );
        break;
      case "Merchant Id":
        const merchantNum = parseInt(search, 10);
        if (Number.isFinite(merchantNum)) {
          conditions.push(
            or(
              eq(ordersCore.merchantStoreId, merchantNum),
              eq(ordersCore.merchantParentId, merchantNum)
            )!
          );
        } else {
          conditions.push(
            or(
              sql`${ordersCore.merchantStoreId}::text ILIKE ${term}`,
              sql`${ordersCore.merchantParentId}::text ILIKE ${term}`
            )!
          );
        }
        break;
      case "Customer Mobile":
      case "Rider Mobile":
        // Need to join and filter; handled in query below
        break;
      case "Third Party Order Id":
      case "ONDC Order Id":
      case "Client Reference Id":
      case "Partner Order Id":
      case "Internal Order Id":
        conditions.push(
          or(
            ilike(ordersCore.externalRef, term),
            ilike(ordersCore.formattedOrderId, term)
          )!
        );
        break;
      case "Tracking Order Id":
        conditions.push(
          or(
            ilike(ordersCore.formattedOrderId, term),
            ilike(ordersCore.externalRef, term)
          )!
        );
        break;
      case "Client Name":
        // Handled via join in query
        break;
      default:
        // Default: search by order id / formatted id / external ref
        conditions.push(
          or(
            ilike(ordersCore.formattedOrderId, term),
            ilike(ordersCore.externalRef, term)
          )!
        );
    }
  }

  const orderBy =
    sortBy === "updated_at"
      ? sortOrder === "asc"
        ? asc(ordersCore.updatedAt)
        : desc(ordersCore.updatedAt)
      : sortOrder === "asc"
        ? asc(ordersCore.createdAt)
        : desc(ordersCore.createdAt);

  // Build query with optional joins for search by customer/rider/name
  const needsCustomerJoin =
    search && (searchType === "Customer Mobile" || searchType === "Client Name");
  const needsRiderJoin = search && searchType === "Rider Mobile";

  if (needsCustomerJoin) {
    const customerTerm = `%${search}%`;
    const baseQuery = db
      .select({
        id: ordersCore.id,
        orderUuid: ordersCore.orderUuid,
        orderType: ordersCore.orderType,
        orderSource: ordersCore.orderSource,
        paymentMethod: ordersCore.paymentMethod,
        formattedOrderId: ordersCore.formattedOrderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        paymentStatus: ordersCore.paymentStatus,
        fareAmount: ordersCore.fareAmount,
        itemTotal: ordersCore.itemTotal,
        addonTotal: ordersCore.addonTotal,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        createdAt: ordersCore.createdAt,
        updatedAt: ordersCore.updatedAt,
        routedToEmail: sql<string | null>`(
          SELECT
            COALESCE(
              (orx.remark_metadata ->> 'actorEmail'),
              su.email
            )
          FROM order_remarks orx
          LEFT JOIN system_users su ON su.id = orx.actor_id
          WHERE orx.order_id = ${ordersCore.id}
          ORDER BY orx.created_at DESC
          LIMIT 1
        )`,
        latestRemark: sql<string | null>`(
          SELECT orx.remark
          FROM order_remarks orx
          WHERE orx.order_id = ${ordersCore.id}
          ORDER BY orx.created_at DESC
          LIMIT 1
        )`,
        customerId: ordersCore.customerId,
        customerExternalId: customers.customerId,
        customerName: customers.fullName,
        customerMobile: customers.primaryMobile,
        customerEmail: customers.email,
        customerAccountStatus: customers.accountStatus,
        customerRiskFlag: customers.riskFlag,
        riderId: ordersCore.riderId,
        riderName: riders.name,
        riderMobile: riders.mobile,
        merchantStoreId: ordersCore.merchantStoreId,
        merchantParentId: ordersCore.merchantParentId,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropAddressNormalized: ordersCore.dropAddressNormalized,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        pickupAddressDeviationMeters: ordersCore.pickupAddressDeviationMeters,
        dropAddressDeviationMeters: ordersCore.dropAddressDeviationMeters,
        distanceMismatchFlagged: ordersCore.distanceMismatchFlagged,
        distanceKm: ordersCore.distanceKm,
        isBulkOrder: ordersCore.isBulkOrder,
        manualStatusUpdatedByEmail: ordersCore.manualStatusUpdatedByEmail,
        etaSeconds: ordersCore.etaSeconds,
        estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
        firstEtaAt: ordersCore.firstEtaAt,
        etaBreachedAt: ordersCore.etaBreachedAt,
        etaBreachedTimelineId: ordersCore.etaBreachedTimelineId,
      })
      .from(ordersCore)
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          ...conditions,
          searchType === "Customer Mobile"
            ? or(
                ilike(customers.primaryMobile, customerTerm),
                ilike(customers.primaryMobileNormalized, customerTerm)
              )!
            : or(
                ilike(customers.fullName, customerTerm),
                ilike(customers.firstName, customerTerm),
                ilike(customers.lastName, customerTerm)
              )!
        )
      )
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const rows = await baseQuery;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersCore)
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(
        and(
          eq(ordersCore.orderType, orderType),
          statusFilter && statusFilter in STATUS_FILTER_TO_DB
            ? (() => {
                const m = STATUS_FILTER_TO_DB[statusFilter as keyof typeof STATUS_FILTER_TO_DB];
                if ("status" in m) return inArray(ordersCore.status, [...m.status]);
                if ("paymentStatus" in m) return eq(ordersCore.paymentStatus, m.paymentStatus);
                return eq(ordersCore.isBulkOrder, true);
              })()
            : undefined,
          searchType === "Customer Mobile"
            ? or(
                ilike(customers.primaryMobile, `%${search}%`),
                ilike(customers.primaryMobileNormalized, `%${search}%`)
              )!
            : or(
                ilike(customers.fullName, `%${search}%`),
                ilike(customers.firstName, `%${search}%`),
                ilike(customers.lastName, `%${search}%`)
              )!
        )
      );

    return {
      orders: rows as unknown as OrdersCoreRow[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  if (needsRiderJoin) {
    const riderTerm = `%${search}%`;
    const baseQuery = db
      .select({
        id: ordersCore.id,
        orderUuid: ordersCore.orderUuid,
        orderType: ordersCore.orderType,
        orderSource: ordersCore.orderSource,
        paymentMethod: ordersCore.paymentMethod,
        formattedOrderId: ordersCore.formattedOrderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        paymentStatus: ordersCore.paymentStatus,
        fareAmount: ordersCore.fareAmount,
        itemTotal: ordersCore.itemTotal,
        addonTotal: ordersCore.addonTotal,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        createdAt: ordersCore.createdAt,
        updatedAt: ordersCore.updatedAt,
        routedToEmail: sql<string | null>`(
          SELECT
            COALESCE(
              (orx.remark_metadata ->> 'actorEmail'),
              su.email
            )
          FROM order_remarks orx
          LEFT JOIN system_users su ON su.id = orx.actor_id
          WHERE orx.order_id = ${ordersCore.id}
          ORDER BY orx.created_at DESC
          LIMIT 1
        )`,
        latestRemark: sql<string | null>`(
          SELECT orx.remark
          FROM order_remarks orx
          WHERE orx.order_id = ${ordersCore.id}
          ORDER BY orx.created_at DESC
          LIMIT 1
        )`,
        customerId: ordersCore.customerId,
        customerExternalId: customers.customerId,
        customerName: customers.fullName,
        customerMobile: customers.primaryMobile,
        customerEmail: customers.email,
        customerAccountStatus: customers.accountStatus,
        customerRiskFlag: customers.riskFlag,
        riderId: ordersCore.riderId,
        riderName: riders.name,
        riderMobile: riders.mobile,
        merchantStoreId: ordersCore.merchantStoreId,
        merchantParentId: ordersCore.merchantParentId,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropAddressNormalized: ordersCore.dropAddressNormalized,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        pickupAddressDeviationMeters: ordersCore.pickupAddressDeviationMeters,
        dropAddressDeviationMeters: ordersCore.dropAddressDeviationMeters,
        distanceMismatchFlagged: ordersCore.distanceMismatchFlagged,
        distanceKm: ordersCore.distanceKm,
        isBulkOrder: ordersCore.isBulkOrder,
        manualStatusUpdatedByEmail: ordersCore.manualStatusUpdatedByEmail,
        etaSeconds: ordersCore.etaSeconds,
        estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
        firstEtaAt: ordersCore.firstEtaAt,
        etaBreachedAt: ordersCore.etaBreachedAt,
        etaBreachedTimelineId: ordersCore.etaBreachedTimelineId,
      })
      .from(ordersCore)
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          ...conditions,
          or(
            ilike(riders.mobile, riderTerm),
            ilike(riders.name, riderTerm)
          )!
        )
      )
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const rows = await baseQuery;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersCore)
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          eq(ordersCore.orderType, orderType),
          statusFilter && statusFilter in STATUS_FILTER_TO_DB
            ? (() => {
                const m = STATUS_FILTER_TO_DB[statusFilter as keyof typeof STATUS_FILTER_TO_DB];
                if ("status" in m) return inArray(ordersCore.status, [...m.status]);
                if ("paymentStatus" in m) return eq(ordersCore.paymentStatus, m.paymentStatus);
                return eq(ordersCore.isBulkOrder, true);
              })()
            : undefined,
          or(
            ilike(riders.mobile, `%${search}%`),
            ilike(riders.name, `%${search}%`)
          )!
        )
      );

    return {
      orders: rows as unknown as OrdersCoreRow[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  // Default: no customer/rider search
  const baseQuery = db
    .select({
      id: ordersCore.id,
      orderUuid: ordersCore.orderUuid,
      orderType: ordersCore.orderType,
      orderSource: ordersCore.orderSource,
      paymentMethod: ordersCore.paymentMethod,
      formattedOrderId: ordersCore.formattedOrderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      addonTotal: ordersCore.addonTotal,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      createdAt: ordersCore.createdAt,
      updatedAt: ordersCore.updatedAt,
      routedToEmail: sql<string | null>`(
        SELECT
          COALESCE(
            (orx.remark_metadata ->> 'actorEmail'),
            su.email
          )
        FROM order_remarks orx
        LEFT JOIN system_users su ON su.id = orx.actor_id
        WHERE orx.order_id = ${ordersCore.id}
        ORDER BY orx.created_at DESC
        LIMIT 1
      )`,
      latestRemark: sql<string | null>`(
        SELECT orx.remark
        FROM order_remarks orx
        WHERE orx.order_id = ${ordersCore.id}
        ORDER BY orx.created_at DESC
        LIMIT 1
      )`,
      customerId: ordersCore.customerId,
      customerExternalId: customers.customerId,
      customerName: customers.fullName,
      customerMobile: customers.primaryMobile,
      customerEmail: customers.email,
      customerAccountStatus: customers.accountStatus,
      customerRiskFlag: customers.riskFlag,
      riderId: ordersCore.riderId,
      riderName: riders.name,
      riderMobile: riders.mobile,
      merchantStoreId: ordersCore.merchantStoreId,
      merchantParentId: ordersCore.merchantParentId,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropAddressNormalized: ordersCore.dropAddressNormalized,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      pickupAddressDeviationMeters: ordersCore.pickupAddressDeviationMeters,
      dropAddressDeviationMeters: ordersCore.dropAddressDeviationMeters,
      distanceMismatchFlagged: ordersCore.distanceMismatchFlagged,
      distanceKm: ordersCore.distanceKm,
      isBulkOrder: ordersCore.isBulkOrder,
      manualStatusUpdatedByEmail: ordersCore.manualStatusUpdatedByEmail,
      etaSeconds: ordersCore.etaSeconds,
      estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
      firstEtaAt: ordersCore.firstEtaAt,
      etaBreachedAt: ordersCore.etaBreachedAt,
      etaBreachedTimelineId: ordersCore.etaBreachedTimelineId,
    })
    .from(ordersCore)
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const rows = await baseQuery;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .where(and(...conditions));

  return {
    orders: rows as unknown as OrdersCoreRow[],
    total: count ?? 0,
    page,
    limit,
  };
}

/** All allowed order timeline status values (for status column in order_timelines). */
export const ORDER_TIMELINE_STATUSES = [
  "Created",
  "Bill Ready",
  "Payment Initiated At",
  "Payment Done",
  "Pymt Assign RX",
  "Accepted",
  "Dispatch Ready",
  "Dispatched",
  "Delivered",
  "Cancelled",
  "RTO Initiated",
  "RTO In Transit",
  "RTO Delivered",
  "RTO Lost",
] as const;

/** Allowed status values for manual "Update order status" (dispatch flow). */
export const UPDATEABLE_ORDER_STATUSES = [
  "picked_up",   // Dispatch Ready
  "in_transit", // Dispatched
  "delivered",  // Delivered
] as const;
export type UpdateableOrderStatus = (typeof UPDATEABLE_ORDER_STATUSES)[number];

const STATUS_TO_LABEL: Record<UpdateableOrderStatus, string> = {
  picked_up: "Dispatch Ready",
  in_transit: "Dispatched",
  delivered: "Delivered",
};

/**
 * Insert a single order timeline entry (immutable event log). Call whenever status changes from any source.
 */
/** Default ETA minutes from "now" when setting ETA on status update (e.g. Dispatch Ready). */
const DEFAULT_ETA_MINUTES_AFTER_STATUS_UPDATE = 45;

export async function insertOrderTimelineEntry(params: {
  orderId: number;
  status: string;
  previousStatus?: string | null;
  actorType: string;
  actorId?: number | null;
  actorName?: string | null;
  statusMessage?: string | null;
  metadata?: Record<string, unknown>;
  /** ETA (expected delivery) at this status; used for timeline "X mins left / elapsed". */
  expectedByAt?: Date | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expectedBy = params.expectedByAt ?? null;
  await db.insert(orderTimelines).values({
    orderId: params.orderId,
    status: params.status,
    previousStatus: params.previousStatus ?? null,
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? null,
    statusMessage: params.statusMessage ?? null,
    metadata: params.metadata ?? {},
    expectedByAt: expectedBy,
  });
  const statusNorm = params.status.toLowerCase().trim().replace(/\s+/g, " ");
  const isPaymentDone = statusNorm === "payment done";
  const isAccepted = statusNorm === "accepted";
  if (isPaymentDone || isAccepted) {
    const [existing] = await db
      .select({ estimatedDeliveryTime: ordersCore.estimatedDeliveryTime })
      .from(ordersCore)
      .where(eq(ordersCore.id, params.orderId))
      .limit(1);
    if (existing?.estimatedDeliveryTime == null) {
      const etaToSet = expectedBy ?? new Date(now.getTime() + DEFAULT_ETA_MINUTES_AFTER_STATUS_UPDATE * 60 * 1000);
      await db
        .update(ordersCore)
        .set({
          estimatedDeliveryTime: etaToSet,
          firstEtaAt: etaToSet,
          updatedAt: now,
        })
        .where(eq(ordersCore.id, params.orderId));
    }
  }
}

export interface OrderTimelineEntry {
  id: number;
  orderId: number;
  status: string;
  previousStatus: string | null;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  statusMessage: string | null;
  occurredAt: Date;
  expectedByAt: Date | null;
}

/**
 * Get order created_at for a given order (e.g. to show synthetic "Created" timeline when no entries exist).
 */
export async function getOrderCreatedAt(
  orderId: number
): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ createdAt: ordersCore.createdAt })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  return row?.createdAt ?? null;
}

/**
 * ETA engine: set estimated_delivery_time and first_eta_at from Payment Done (same as other company), else Accepted.
 * - Only runs if order has no estimatedDeliveryTime and status is one of: accepted, dispatch ready, dispatched, reached_store, picked_up, in_transit.
 * - Never sets ETA for cancelled/rejected orders.
 * - Prefer "Payment Done" timeline entry (expectedByAt if present, else occurredAt + DEFAULT_ETA_MINUTES); fallback to "Accepted".
 * Called on order detail load (GET /api/orders/core).
 */
export async function ensureOrderEtaWhenAccepted(
  orderId: number
): Promise<{ estimatedDeliveryTime: Date } | null> {
  const db = getDb();
  const [order] = await db
    .select({
      estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
      currentStatus: ordersCore.currentStatus,
      status: ordersCore.status,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  if (!order || order.estimatedDeliveryTime != null) return null;
  const statusLower = (order.currentStatus ?? order.status ?? "").toString().toLowerCase();
  if (statusLower === "cancelled" || statusLower === "rejected") return null;
  if (statusLower !== "accepted" && statusLower !== "dispatch ready" && statusLower !== "dispatched" && statusLower !== "reached_store" && statusLower !== "picked_up" && statusLower !== "in_transit") return null;

  const etaFromEntry = (entry: { occurredAt: Date | string; expectedByAt: Date | string | null }) => {
    const occurredAt = new Date(entry.occurredAt);
    return entry.expectedByAt != null
      ? new Date(entry.expectedByAt)
      : new Date(occurredAt.getTime() + DEFAULT_ETA_MINUTES_AFTER_STATUS_UPDATE * 60 * 1000);
  };

  const [paymentDoneEntry] = await db
    .select({ occurredAt: orderTimelines.occurredAt, expectedByAt: orderTimelines.expectedByAt })
    .from(orderTimelines)
    .where(and(eq(orderTimelines.orderId, orderId), ilike(orderTimelines.status, "payment done")))
    .orderBy(desc(orderTimelines.occurredAt))
    .limit(1);
  if (paymentDoneEntry?.occurredAt) {
    const etaToSet = etaFromEntry(paymentDoneEntry);
    if (!isNaN(etaToSet.getTime())) {
      await db
        .update(ordersCore)
        .set({
          estimatedDeliveryTime: etaToSet,
          firstEtaAt: etaToSet,
          updatedAt: new Date(),
        })
        .where(eq(ordersCore.id, orderId));
      return { estimatedDeliveryTime: etaToSet };
    }
  }

  const [acceptedEntry] = await db
    .select({ occurredAt: orderTimelines.occurredAt, expectedByAt: orderTimelines.expectedByAt })
    .from(orderTimelines)
    .where(and(eq(orderTimelines.orderId, orderId), ilike(orderTimelines.status, "accepted")))
    .orderBy(desc(orderTimelines.occurredAt))
    .limit(1);
  if (!acceptedEntry?.occurredAt) return null;
  const etaToSet = etaFromEntry(acceptedEntry);
  if (isNaN(etaToSet.getTime())) return null;
  await db
    .update(ordersCore)
    .set({
      estimatedDeliveryTime: etaToSet,
      firstEtaAt: etaToSet,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderId));
  return { estimatedDeliveryTime: etaToSet };
}

/**
 * If order is in progress and ETA is breached (now > expected delivery), record it once:
 * set eta_breached_at and eta_breached_timeline_id to the timeline entry that was current
 * when ETA was crossed (latest entry with occurred_at <= ETA time). Mins elapsed is
 * computed at display time. Returns the updated values if an update was performed; null otherwise.
 */
export async function recordEtaBreachIfNeeded(
  orderId: number
): Promise<{ etaBreachedAt: Date; etaBreachedTimelineId: number | null } | null> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      etaBreachedAt: ordersCore.etaBreachedAt,
      estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
      createdAt: ordersCore.createdAt,
      etaSeconds: ordersCore.etaSeconds,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  if (!row || row.etaBreachedAt != null) return null;
  const statusLower = (row.currentStatus ?? row.status ?? "").toString().toLowerCase();
  if (statusLower === "delivered" || statusLower === "cancelled" || statusLower === "rejected")
    return null;
  const etaAt =
    row.estimatedDeliveryTime != null
      ? new Date(row.estimatedDeliveryTime)
      : row.createdAt != null && row.etaSeconds != null && Number.isFinite(row.etaSeconds)
        ? new Date(new Date(row.createdAt).getTime() + Number(row.etaSeconds) * 1000)
        : null;
  if (!etaAt || isNaN(etaAt.getTime()) || now.getTime() <= etaAt.getTime()) return null;
  // Stage that was current when ETA was crossed: latest timeline entry with occurred_at <= ETA time
  const [entryAtEta] = await db
    .select({ id: orderTimelines.id })
    .from(orderTimelines)
    .where(and(eq(orderTimelines.orderId, orderId), lte(orderTimelines.occurredAt, etaAt)))
    .orderBy(desc(orderTimelines.occurredAt))
    .limit(1);
  // If no entry occurred at or before ETA (edge case), use the earliest entry
  let timelineId: number | null = entryAtEta?.id ?? null;
  if (timelineId == null) {
    const [firstEntry] = await db
      .select({ id: orderTimelines.id })
      .from(orderTimelines)
      .where(eq(orderTimelines.orderId, orderId))
      .orderBy(asc(orderTimelines.occurredAt))
      .limit(1);
    timelineId = firstEntry?.id ?? null;
  }
  await db
    .update(ordersCore)
    .set({
      etaBreachedAt: now,
      etaBreachedTimelineId: timelineId,
      updatedAt: now,
    })
    .where(eq(ordersCore.id, orderId));
  return { etaBreachedAt: now, etaBreachedTimelineId: timelineId };
}

/**
 * Fetch order timeline entries in chronological order (oldest first). Used for order page timeline UI.
 */
export async function getOrderTimelineEntries(
  orderId: number
): Promise<OrderTimelineEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: orderTimelines.id,
      orderId: orderTimelines.orderId,
      status: orderTimelines.status,
      previousStatus: orderTimelines.previousStatus,
      actorType: orderTimelines.actorType,
      actorId: orderTimelines.actorId,
      actorName: orderTimelines.actorName,
      statusMessage: orderTimelines.statusMessage,
      occurredAt: orderTimelines.occurredAt,
      expectedByAt: orderTimelines.expectedByAt,
    })
    .from(orderTimelines)
    .where(eq(orderTimelines.orderId, orderId))
    .orderBy(asc(orderTimelines.occurredAt));
  return rows;
}

/**
 * Update order status and current_status for manual status updates from the dashboard.
 * Records the updater email on the order, appends to order_manual_status_history, and appends to order_timelines.
 * If the order has no ETA yet, sets estimated_delivery_time to now + DEFAULT_ETA_MINUTES so the timeline ETA tag updates.
 */
export async function updateOrderStatus(
  orderId: number,
  status: UpdateableOrderStatus,
  updatedByEmail: string
): Promise<{ updated: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select({
      currentStatus: ordersCore.currentStatus,
      estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
      firstEtaAt: ordersCore.firstEtaAt,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  const previousLabel = existing?.currentStatus ?? null;

  const label = STATUS_TO_LABEL[status];
  const now = new Date();
  const existingEta = existing?.estimatedDeliveryTime
    ? new Date(existing.estimatedDeliveryTime)
    : null;
  const etaToSet =
    existingEta != null && !isNaN(existingEta.getTime())
      ? existingEta
      : new Date(now.getTime() + DEFAULT_ETA_MINUTES_AFTER_STATUS_UPDATE * 60 * 1000);

  const [result] = await db
    .update(ordersCore)
    .set({
      status,
      currentStatus: label,
      manualStatusUpdatedByEmail: updatedByEmail,
      updatedAt: now,
      ...(existingEta == null || isNaN(existingEta.getTime())
        ? {
            estimatedDeliveryTime: etaToSet,
            ...(existing?.firstEtaAt == null ? { firstEtaAt: etaToSet } : {}),
          }
        : {}),
    })
    .where(eq(ordersCore.id, orderId))
    .returning({ id: ordersCore.id });
  if (!result) return { updated: false };
  await db.insert(orderManualStatusHistory).values({
    orderId,
    toStatus: status,
    updatedByEmail,
  });
  await insertOrderTimelineEntry({
    orderId,
    status: label,
    previousStatus: previousLabel,
    actorType: "agent",
    actorName: updatedByEmail,
    expectedByAt: etaToSet,
  });
  return { updated: true };
}

export interface OrderManualStatusHistoryEntry {
  toStatus: string;
  updatedByEmail: string;
  createdAt: Date;
}

/**
 * Fetch manual status history for an order (newest first).
 */
export async function getOrderManualStatusHistory(
  orderId: number
): Promise<OrderManualStatusHistoryEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      toStatus: orderManualStatusHistory.toStatus,
      updatedByEmail: orderManualStatusHistory.updatedByEmail,
      createdAt: orderManualStatusHistory.createdAt,
    })
    .from(orderManualStatusHistory)
    .where(eq(orderManualStatusHistory.orderId, orderId))
    .orderBy(desc(orderManualStatusHistory.createdAt));
  return rows;
}

/**
 * Get delivery_instructions from orders_food for a given order (food orders only).
 */
export async function getFoodDeliveryInstructions(
  orderId: number
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ deliveryInstructions: ordersFood.deliveryInstructions })
    .from(ordersFood)
    .where(eq(ordersFood.orderId, orderId))
    .limit(1);
  return row?.deliveryInstructions ?? null;
}

export interface InsertOrderCancellationReasonInput {
  orderId: number;
  cancelledBy: string;
  cancelledById: number | null;
  reasonCode: string;
  reasonText?: string | null;
  refundStatus?: string;
  refundAmount?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a row into order_cancellation_reasons and return its id.
 * Use this id as cancellation_reason_id when updating orders_core.
 */
export async function insertOrderCancellationReason(
  input: InsertOrderCancellationReasonInput
): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .insert(orderCancellationReasons)
    .values({
      orderId: input.orderId,
      cancelledBy: input.cancelledBy,
      cancelledById: input.cancelledById,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText ?? null,
      refundStatus: input.refundStatus ?? "pending",
      refundAmount:
        input.refundAmount == null ? null : String(input.refundAmount),      metadata: (input.metadata ?? {}) as Record<string, unknown>,
    })
    .returning({ id: orderCancellationReasons.id });
  return row?.id ?? null;
}

export interface UpdateOrdersCoreCancellationInput {
  cancelledBy: string;
  cancelledById: number | null;
  cancellationReasonId?: number | null;
  cancelledByType?: "store" | "customer" | "system" | "rider" | "admin";
}

/**
 * Set cancellation fields on orders_core when an order is cancelled (e.g. via refund flow).
 * Sets status to 'cancelled', cancelled_at, cancelled_by, cancelled_by_id, and optionally cancellation_reason_id.
 * Appends a Cancelled entry to order_timelines.
 */
export async function updateOrdersCoreCancellation(
  orderId: number,
  input: UpdateOrdersCoreCancellationInput
): Promise<{ updated: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select({ currentStatus: ordersCore.currentStatus })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  const previousStatus = existing?.currentStatus ?? "Delivered";

  const [result] = await db
    .update(ordersCore)
    .set({
      status: "cancelled",
      currentStatus: "Cancelled",
      cancelledAt: new Date(),
      cancelledBy: input.cancelledBy,
      cancelledById: input.cancelledById,
      cancellationReasonId: input.cancellationReasonId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderId))
    .returning({ id: ordersCore.id });
  if (!result) return { updated: false };
  await insertOrderTimelineEntry({
    orderId,
    status: "Cancelled",
    previousStatus,
    actorType: input.cancelledByType ?? "admin",
    actorName: input.cancelledBy,
  });
  return { updated: true };
}
