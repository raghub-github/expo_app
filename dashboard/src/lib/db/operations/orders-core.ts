/**
 * Database operations for orders_core (hybrid order table).
 * List food/parcel/ride orders with search and status filters.
 */

import { getDb } from "../client";
import { ordersCore, customers, riders } from "../schema";
import { eq, and, or, ilike, sql, desc, asc, inArray } from "drizzle-orm";

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
 * Update order status and current_status for manual status updates from the dashboard.
 */
export async function updateOrderStatus(
  orderId: number,
  status: UpdateableOrderStatus
): Promise<{ updated: boolean }> {
  const db = getDb();
  const label = STATUS_TO_LABEL[status];
  const [result] = await db
    .update(ordersCore)
    .set({
      status,
      currentStatus: label,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderId))
    .returning({ id: ordersCore.id });
  return { updated: !!result };
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
 */
export async function updateOrdersCoreCancellation(
  orderId: number,
  input: UpdateOrdersCoreCancellationInput
): Promise<{ updated: boolean }> {
  const db = getDb();
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
  return { updated: !!result };
}
