/**
 * Database operations for orders_core (hybrid order table).
 * List food/parcel/ride orders with search and status filters.
 */

import { getDb, getSql } from "../client";
import { ordersCore, orderManualStatusHistory, orderTimelines, ordersFood, customers, riders, orderCancellationReasons } from "../schema";
import {
  eq,
  and,
  or,
  ilike,
  sql,
  desc,
  asc,
  inArray,
  lte,
  ne,
  isNotNull,
  type SQL,
} from "drizzle-orm";
import type { CustomerTrustTier } from "@/lib/customers/trust-tier";
import { TRUST_TIER_LABEL } from "@/lib/customers/trust-tier";
import { sqlCustomerPrimaryMobileOrderSearch } from "./customers";
import { resolveEtaBreachTimelineEntryId } from "@/lib/orders/eta-breach";
import {
  sqlFoodOrderActiveListScope,
  sqlFoodOrderDashboardStageFilter,
} from "./food-orders-dashboard-stages";
import {
  dedupeOrderCancellationTimelineEntries,
  filterOrderProgressTimelineEntries,
  isRiderAssignmentCancellationTimelineEntry,
} from "@/lib/orders/order-timeline-rider-filter";

/** Prefer denormalized Routed To; fall back to latest remark actor for older rows. */
const sqlRoutedToEmail = sql<string | null>`(
  COALESCE(
    ${ordersCore.routedToEmail},
    (
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
    )
  )
)`;
import {
  canApplyManualStatusUpdate,
  resolveDispatchManualStage,
  type ManualStatusValue,
} from "@/lib/orders/order-dispatch-status";
import { getPrimaryRolesByEmails } from "./users";
import { publicColumnExists } from "../schema-ensure";

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
  /** Filter by `orders_core.customer_id` (internal `customers.id`). */
  customerDbId?: number;
  search?: string;
  searchType?: OrderSearchType;
  statusFilter?: OrderStatusFilter;
  orderType?: "food" | "parcel" | "person_ride";
  sortBy?: "created_at" | "updated_at" | "placed_at";
  sortOrder?: "asc" | "desc";
  /** UI labels matching `TRUST_TIER_LABEL` values (Premium, Very Good, …). */
  userTypeLabels?: string[];
  /** Delivery rail: GatiMitra = internal, Merchant = non-internal order source. */
  deliveryFilters?: ("GatiMitra" | "Merchant")[];
  /** Food orders panel: categories map to `merchant_stores.store_type`; pickup / overdue use orders_food / orders_core. */
  foodPanelFilters?: {
    pickUp?: boolean;
    food?: boolean;
    fashion?: boolean;
    grocery?: boolean;
    pharma?: boolean;
    overview?: boolean;
  };
}

/** Direct order lookup by public/internal id — skip dashboard tab filters. */
function isFoodOrderDirectLookup(filters: ListOrdersCoreFilters): boolean {
  if (filters.id != null && Number.isFinite(filters.id)) return true;
  const search = filters.search?.trim();
  if (!search) return false;
  const searchType = filters.searchType ?? "Order Id";
  return (
    searchType === "Order Id" ||
    searchType === "Internal Order Id" ||
    searchType === "Merchant Id" ||
    searchType === "Customer Mobile" ||
    searchType === "Rider Mobile"
  );
}

/** Digit-normalized rider mobile match (+91 / 10-digit variants). */
function sqlRiderMobileOrderSearch(searchRaw: string): SQL {
  const raw = searchRaw.trim();
  const compact = raw.replace(/\s/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  const phoneCharsOnly = /^[+\d\s\-().]*$/.test(raw.trim());
  if (phoneCharsOnly && digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    const variants = new Set<string>();
    variants.add(digitsOnly);
    if (digitsOnly.length === 10) variants.add(`91${digitsOnly}`);
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      variants.add(digitsOnly.slice(2));
    }
    const orParts: SQL[] = [];
    for (const v of variants) {
      orParts.push(
        sql`regexp_replace(COALESCE(${riders.mobile}, ''), '[^0-9]', '', 'g') = ${v}`
      );
    }
    return or(...orParts)!;
  }
  const term = `%${raw}%`;
  return ilike(riders.mobile, term)!;
}

/**
 * Match public order refs across formatted_order_id, legacy order_id (GM…),
 * core numeric id, and orders_food.formatted_order_id (GMF/GMC/GMP + GM alias).
 */
function sqlPublicOrderIdMatch(
  exactUpper: string,
  orderType: "food" | "parcel" | "person_ride"
): SQL {
  const bare = exactUpper.replace(/^#/, "").trim().toUpperCase();
  const candidates = new Set<string>([bare]);
  const prefixed = bare.match(/^(GMF|GMC|GMP|GM)(\d+)$/);
  if (prefixed) {
    const digits = prefixed[2];
    candidates.add(`GM${digits}`);
    candidates.add(`GMF${digits}`);
    candidates.add(`GMC${digits}`);
    candidates.add(`GMP${digits}`);
  }

  const idParts: SQL[] = [];
  for (const c of candidates) {
    idParts.push(sql`upper(trim(COALESCE(${ordersCore.formattedOrderId}, ''))) = ${c}`);
    idParts.push(sql`upper(trim(COALESCE(${ordersCore.orderId}, ''))) = ${c}`);
  }

  const digitMatch = bare.match(/^(?:GM[FCP]?)?(\d+)$/);
  if (digitMatch) {
    const legacyId = parseInt(digitMatch[1], 10);
    if (Number.isFinite(legacyId) && legacyId > 0) {
      idParts.push(and(eq(ordersCore.id, legacyId), eq(ordersCore.orderType, orderType))!);
    }
  }

  idParts.push(
    sql`EXISTS (
      SELECT 1 FROM orders_food ofood
      WHERE ofood.order_id = ${ordersCore.id}
        AND upper(trim(COALESCE(ofood.formatted_order_id, ''))) IN (${sql.join(
          [...candidates].map((c) => sql`${c}`),
          sql`, `
        )})
    )`
  );

  return or(...idParts)!;
}

/** Restaurant / meal vertical store types (not grocery/pharma/fashion). Matches merchant onboarding `store_type`. */
const STORE_TYPES_FOOD_VERTICAL = [
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "STATIONERY",
  "ELECTRONICS_ECOMMERCE",
  "OTHERS",
] as const;

function userTypeLabelsToDbTiers(labels: string[]): CustomerTrustTier[] {
  const entries = Object.entries(TRUST_TIER_LABEL) as [CustomerTrustTier, string][];
  return labels
    .map((label) => entries.find(([, l]) => l === label)?.[0])
    .filter((x): x is CustomerTrustTier => x != null);
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
  customerAlternateMobile: string | null;
  orderAlternateContactPhone: string | null;
  orderAlternateContactName: string | null;
  orderDeliveryPrimaryContactPhone: string | null;
  orderDeliveryPrimaryContactName: string | null;
  customerAccountStatus: string | null;
  customerRiskFlag: string | null;
  // Rider info
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  // Merchant / order meta
  merchantStoreId: number | null;
  merchantParentId: number | null;
  pickupAddressRaw?: string | null;
  pickupAddressNormalized?: string | null;
  pickupAddressGeocoded?: string | null;
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
  /** First ETA frozen at order placement (sidebar "First ETA"). Immutable after create. */
  firstEtaAt?: Date | null;
  /** When ETA was first breached (for ETA breached tag; mins elapsed computed at display time). */
  etaBreachedAt?: Date | null;
  /** order_timelines.id of the stage current when ETA was first breached (red dot on timeline). */
  etaBreachedTimelineId?: number | null;
  /** Core cancel timestamp — terminal for dashboard. */
  cancelledAt?: Date | null;
  /** Latest linked orders_food.order_status (for stage/action resolution). */
  foodOrderStatus?: string | null;
  /** Rider marked pickup on food row (DESPATCHED stage). */
  riderPickedUpAt?: Date | string | null;
}

/** Extra list columns for food dashboard stage/action (shared across list query branches). */
const foodDashboardListSelect = {
  cancelledAt: ordersCore.cancelledAt,
  foodOrderStatus: sql<string | null>`(
    SELECT of.order_status::text
    FROM orders_food of
    WHERE of.order_id = ${ordersCore.id}
    ORDER BY of.id DESC
    LIMIT 1
  )`,
  riderPickedUpAt: sql<Date | null>`(
    SELECT of.rider_picked_up_at
    FROM orders_food of
    WHERE of.order_id = ${ordersCore.id}
    ORDER BY of.id DESC
    LIMIT 1
  )`,
} as const;

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

  if (filters.customerDbId != null && Number.isFinite(filters.customerDbId)) {
    conditions.push(eq(ordersCore.customerId, filters.customerDbId));
  }

  const statusFilter = filters.statusFilter ?? null;
  // Customer profile listings must show all orders for that user — not the food ops board
  // (which defaults to PAYMENT DONE + hides delivered/cancelled).
  const isCustomerProfileListing =
    filters.customerDbId != null && Number.isFinite(filters.customerDbId);
  const skipDashboardStageFilters =
    orderType === "food" &&
    (isFoodOrderDirectLookup(filters) || isCustomerProfileListing);
  const effectiveStatusFilter =
    orderType === "food" && !skipDashboardStageFilters
      ? (statusFilter ?? "PAYMENT DONE")
      : statusFilter;

  // Food orders dashboard list: hide delivered/cancelled and filter by stage tab.
  // Direct order-id lookups and customer profile tabs skip these filters.
  if (orderType === "food" && !skipDashboardStageFilters) {
    conditions.push(sqlFoodOrderActiveListScope());
    if (effectiveStatusFilter === "BULK") {
      conditions.push(eq(ordersCore.isBulkOrder, true));
    } else {
      const stageSql = sqlFoodOrderDashboardStageFilter(effectiveStatusFilter);
      if (stageSql) conditions.push(stageSql);
    }
  } else if (effectiveStatusFilter === "BULK") {
    conditions.push(eq(ordersCore.isBulkOrder, true));
  }

  const trustTierDb = userTypeLabelsToDbTiers(filters.userTypeLabels ?? []);
  if (trustTierDb.length) {
    conditions.push(inArray(customers.trustTier, trustTierDb));
  }

  const deliveryFilters = filters.deliveryFilters ?? [];
  if (deliveryFilters.length > 0) {
    const parts = [];
    if (deliveryFilters.includes("GatiMitra")) parts.push(eq(ordersCore.orderSource, "internal"));
    if (deliveryFilters.includes("Merchant")) parts.push(ne(ordersCore.orderSource, "internal"));
    if (parts.length === 1) conditions.push(parts[0]);
    else if (parts.length > 1) conditions.push(or(...parts)!);
  }

  const panel = filters.foodPanelFilters;
  if (panel?.overview) {
    conditions.push(isNotNull(ordersCore.etaBreachedAt));
  }
  if (panel?.pickUp) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM orders_food of
        WHERE of.order_id = ${ordersCore.id}
        AND (
          COALESCE(of.delivery_instructions, '') ILIKE ${"%pickup%"}
          OR COALESCE(of.delivery_instructions, '') ILIKE ${"%self collect%"}
          OR COALESCE(of.delivery_instructions, '') ILIKE ${"%self-collect%"}
        )
      )`
    );
  }
  if (panel && (panel.food || panel.fashion || panel.grocery || panel.pharma)) {
    const orParts: SQL[] = [];
    if (panel.pharma) {
      orParts.push(sql`upper(trim(COALESCE(ms.store_type::text, ''))) = 'PHARMA'`);
    }
    if (panel.grocery) {
      orParts.push(sql`upper(trim(COALESCE(ms.store_type::text, ''))) = 'GROCERY'`);
    }
    if (panel.fashion) {
      orParts.push(sql`upper(trim(COALESCE(ms.store_type::text, ''))) = 'FASHION'`);
    }
    if (panel.food) {
      orParts.push(
        sql`COALESCE(NULLIF(upper(trim(ms.store_type::text)), ''), 'RESTAURANT') IN (${sql.join(
          STORE_TYPES_FOOD_VERTICAL.map((t) => sql`${t}`),
          sql`, `
        )})`
      );
    }
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM merchant_stores ms
        WHERE ms.id = ${ordersCore.merchantStoreId}
        AND (${sql.join(orParts, sql` OR `)})
      )`
    );
  }

  // Search
  const search = filters.search?.trim();
  const searchType = filters.searchType ?? "Order Id";
  if (search) {
    const term = `%${search}%`;
    const exact = search.replace(/%/g, "");
    const exactUpper = exact.toUpperCase();
    switch (searchType) {
      case "Internal Order Id": {
        // Match orders_core.order_uuid (full UUID or partial text)
        const uuidCandidate = exact.trim().toLowerCase();
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            uuidCandidate
          );
        if (isUuid) {
          conditions.push(eq(ordersCore.orderUuid, uuidCandidate));
        } else {
          conditions.push(sql`${ordersCore.orderUuid}::text ILIKE ${term}`);
        }
        break;
      }
      case "Order Id": {
        const bareUpper = exactUpper.replace(/^#/, "");
        if (/^(GMF|GMC|GMP|GM)\d+$/i.test(bareUpper) || /^\d+$/.test(bareUpper)) {
          conditions.push(sqlPublicOrderIdMatch(bareUpper, orderType));
          break;
        }
        conditions.push(
          or(
            ilike(ordersCore.formattedOrderId, term),
            ilike(ordersCore.orderId, term),
            eq(ordersCore.formattedOrderId, exact),
            eq(ordersCore.orderId, exact)
          )!
        );
        break;
      }
      case "Merchant Id": {
        const merchantNum = parseInt(search, 10);
        const merchantIdParts: SQL[] = [];
        if (Number.isFinite(merchantNum) && String(merchantNum) === search.replace(/\s/g, "")) {
          merchantIdParts.push(
            eq(ordersCore.merchantStoreId, merchantNum),
            eq(ordersCore.merchantParentId, merchantNum)
          );
        }
        merchantIdParts.push(
          sql`EXISTS (
            SELECT 1 FROM merchant_stores ms
            WHERE ms.id = ${ordersCore.merchantStoreId}
              AND upper(trim(ms.store_id)) = ${exactUpper}
          )`,
          sql`EXISTS (
            SELECT 1 FROM merchant_parents mp
            WHERE mp.id = ${ordersCore.merchantParentId}
              AND upper(trim(mp.parent_merchant_id)) = ${exactUpper}
          )`,
          sql`EXISTS (
            SELECT 1 FROM merchant_stores ms
            WHERE ms.id = ${ordersCore.merchantStoreId}
              AND ms.store_id ILIKE ${term}
          )`,
          sql`EXISTS (
            SELECT 1 FROM merchant_parents mp
            WHERE mp.id = ${ordersCore.merchantParentId}
              AND mp.parent_merchant_id ILIKE ${term}
          )`
        );
        conditions.push(or(...merchantIdParts)!);
        break;
      }
      case "Customer Mobile":
      case "Rider Mobile":
        // Need to join and filter; handled in query below
        break;
      case "Third Party Order Id":
      case "ONDC Order Id":
      case "Client Reference Id":
      case "Partner Order Id":
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

  // Build query with optional joins for search by customer/rider/name (or trust-tier-only filter).
  const needsCustomerJoin =
    (Boolean(search) && (searchType === "Customer Mobile" || searchType === "Client Name")) ||
    trustTierDb.length > 0;
  const needsRiderJoin = search && searchType === "Rider Mobile";

  if (needsCustomerJoin) {
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
        routedToEmail: sqlRoutedToEmail,
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
        customerAlternateMobile: customers.alternateMobile,
        orderAlternateContactPhone: ordersCore.alternateContactPhone,
        orderAlternateContactName: ordersCore.alternateContactName,
        orderDeliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        orderDeliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        customerAccountStatus: customers.accountStatus,
        customerRiskFlag: customers.riskFlag,
        riderId: ordersCore.riderId,
        riderName: riders.name,
        riderMobile: riders.mobile,
        merchantStoreId: ordersCore.merchantStoreId,
        merchantParentId: ordersCore.merchantParentId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
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
        ...foodDashboardListSelect,
      })
      .from(ordersCore)
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          ...conditions,
          search && searchType === "Customer Mobile"
            ? sqlCustomerPrimaryMobileOrderSearch(search)
            : search && searchType === "Client Name"
              ? ilike(customers.fullName, `%${search}%`)!
              : sql`true`
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
          ...conditions,
          search && searchType === "Customer Mobile"
            ? sqlCustomerPrimaryMobileOrderSearch(search)
            : search && searchType === "Client Name"
              ? ilike(customers.fullName, `%${search}%`)!
              : sql`true`
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
        routedToEmail: sqlRoutedToEmail,
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
        customerAlternateMobile: customers.alternateMobile,
        orderAlternateContactPhone: ordersCore.alternateContactPhone,
        orderAlternateContactName: ordersCore.alternateContactName,
        orderDeliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        orderDeliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        customerAccountStatus: customers.accountStatus,
        customerRiskFlag: customers.riskFlag,
        riderId: ordersCore.riderId,
        riderName: riders.name,
        riderMobile: riders.mobile,
        merchantStoreId: ordersCore.merchantStoreId,
        merchantParentId: ordersCore.merchantParentId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
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
        ...foodDashboardListSelect,
      })
      .from(ordersCore)
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          ...conditions,
          sqlRiderMobileOrderSearch(search!)
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
      .leftJoin(riders, eq(ordersCore.riderId, riders.id))
      .where(
        and(
          ...conditions,
          sqlRiderMobileOrderSearch(search!)
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
      routedToEmail: sqlRoutedToEmail,
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
      customerAlternateMobile: customers.alternateMobile,
      orderAlternateContactPhone: ordersCore.alternateContactPhone,
      orderAlternateContactName: ordersCore.alternateContactName,
      orderDeliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      orderDeliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
      customerAccountStatus: customers.accountStatus,
      customerRiskFlag: customers.riskFlag,
      riderId: ordersCore.riderId,
      riderName: riders.name,
      riderMobile: riders.mobile,
      merchantStoreId: ordersCore.merchantStoreId,
      merchantParentId: ordersCore.merchantParentId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
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
      ...foodDashboardListSelect,
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
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .leftJoin(riders, eq(ordersCore.riderId, riders.id))
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

export type FoodOrderMeta = {
  orderStatus: string | null;
  dispatchedAt: string | null;
  riderPickedUpAt: string | null;
  deliveredAt: string | null;
};

function toFoodIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function getFoodOrderMeta(orderId: number): Promise<FoodOrderMeta> {
  const sql = getSql();
  const rows = await sql`
    SELECT order_status, dispatched_at, rider_picked_up_at, delivered_at
    FROM orders_food
    WHERE order_id = ${orderId}
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  const r = row as
    | {
        order_status?: string | null;
        dispatched_at?: unknown;
        rider_picked_up_at?: unknown;
        delivered_at?: unknown;
      }
    | undefined;
  const status = r?.order_status;
  return {
    orderStatus:
      status != null && String(status).trim() !== "" ? String(status) : null,
    dispatchedAt: toFoodIso(r?.dispatched_at),
    riderPickedUpAt: toFoodIso(r?.rider_picked_up_at),
    deliveredAt: toFoodIso(r?.delivered_at),
  };
}

export async function getFoodOrderStatus(orderId: number): Promise<string | null> {
  const meta = await getFoodOrderMeta(orderId);
  return meta.orderStatus;
}

async function syncOrdersFoodForDashboardStatus(
  orderId: number,
  status: UpdateableOrderStatus,
  now: Date
): Promise<void> {
  const sql = getSql();
  const nowIso = now.toISOString();

  if (status === "picked_up") {
    await sql`
      UPDATE orders_food
      SET
        order_status = 'READY_FOR_PICKUP',
        updated_at = ${nowIso}::timestamptz,
        prepared_at = COALESCE(prepared_at, ${nowIso}::timestamptz)
      WHERE order_id = ${orderId}
    `;
    return;
  }

  if (status === "in_transit") {
    await sql`
      UPDATE orders_food
      SET
        order_status = 'OUT_FOR_DELIVERY',
        updated_at = ${nowIso}::timestamptz,
        dispatched_at = COALESCE(dispatched_at, ${nowIso}::timestamptz),
        rider_picked_up_at = COALESCE(rider_picked_up_at, ${nowIso}::timestamptz),
        handed_over_to_rider_at = COALESCE(handed_over_to_rider_at, ${nowIso}::timestamptz)
      WHERE order_id = ${orderId}
    `;
    // Keep assignment pickup in sync so DESPATCHED tab + rider timeline stay aligned.
    await sql`
      UPDATE order_rider_assignments
      SET
        picked_up_at = COALESCE(picked_up_at, ${nowIso}::timestamptz),
        updated_at = ${nowIso}::timestamptz
      WHERE (order_core_id = ${orderId} OR order_id = ${orderId})
        AND rider_id IS NOT NULL
        AND cancelled_at IS NULL
        AND unassigned_at IS NULL
        AND upper(coalesce(assignment_status::text, '')) NOT IN (
          'CANCELLED', 'REJECTED', 'UNASSIGNED'
        )
        AND picked_up_at IS NULL
    `;
    return;
  }

  if (status === "delivered") {
    await sql`
      UPDATE orders_food
      SET
        order_status = 'DELIVERED',
        updated_at = ${nowIso}::timestamptz,
        delivered_at = COALESCE(delivered_at, ${nowIso}::timestamptz)
      WHERE order_id = ${orderId}
    `;
  }
}

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
      // Current ETA only — First ETA (first_eta_at) is immutable from placement.
      await db
        .update(ordersCore)
        .set({
          estimatedDeliveryTime: etaToSet,
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
 * Backfill current estimated_delivery_time when missing (Payment Done, else Accepted).
 * Does NOT write first_eta_at — First ETA is an immutable placement snapshot.
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
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderId));
  return { estimatedDeliveryTime: etaToSet };
}

/**
 * If order is in progress and First ETA is breached (now > first_eta_at), record it once:
 * set eta_breached_at and eta_breached_timeline_id to the first timeline stage strictly
 * after First ETA (stages completed before First ETA are not marked breached).
 */
export async function recordEtaBreachIfNeeded(
  orderId: number
): Promise<{ etaBreachedAt: Date; etaBreachedTimelineId: number | null } | null> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      etaBreachedAt: ordersCore.etaBreachedAt,
      firstEtaAt: ordersCore.firstEtaAt,
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
    row.firstEtaAt != null
      ? new Date(row.firstEtaAt)
      : row.estimatedDeliveryTime != null
        ? new Date(row.estimatedDeliveryTime)
        : row.createdAt != null && row.etaSeconds != null && Number.isFinite(row.etaSeconds)
          ? new Date(new Date(row.createdAt).getTime() + Number(row.etaSeconds) * 1000)
          : null;
  if (!etaAt || isNaN(etaAt.getTime()) || now.getTime() <= etaAt.getTime()) return null;
  const timelineRows = await db
    .select({ id: orderTimelines.id, occurredAt: orderTimelines.occurredAt })
    .from(orderTimelines)
    .where(eq(orderTimelines.orderId, orderId))
    .orderBy(asc(orderTimelines.occurredAt));
  const timelineId = resolveEtaBreachTimelineEntryId(timelineRows, etaAt);
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
 * Timeline entries for order detail / API: same as GET /api/orders/[id]/timeline (synthetic "Created" when empty).
 * Person-ride OMS statuses (RIDER_ASSIGNED, etc.) are rider milestones for food but are the
 * primary progress trail for rides — keep them when `includeRiderMilestones` is true.
 */
export async function getOrderTimelineEntriesWithFallback(
  orderId: number,
  options?: { includeRiderMilestones?: boolean }
): Promise<OrderTimelineEntry[]> {
  const raw = await getOrderTimelineEntries(orderId);
  let entries = options?.includeRiderMilestones
    ? dedupeOrderCancellationTimelineEntries(
        raw.filter((entry) => !isRiderAssignmentCancellationTimelineEntry(entry))
      )
    : filterOrderProgressTimelineEntries(raw);
  if (entries.length === 0) {
    const createdAt = await getOrderCreatedAt(orderId);
    if (createdAt) {
      entries = [
        {
          id: 0,
          orderId,
          status: "Created",
          previousStatus: null,
          actorType: "system",
          actorId: null,
          actorName: null,
          statusMessage: null,
          occurredAt: createdAt,
          expectedByAt: null,
        },
      ];
    }
  }
  return entries;
}

/**
 * Update order status and current_status for manual status updates from the dashboard.
 * Records the updater email on the order, appends to order_manual_status_history, and appends to order_timelines.
 * If the order has no ETA yet, sets estimated_delivery_time to now + DEFAULT_ETA_MINUTES so the timeline ETA tag updates.
 */
export type UpdateOrderStatusResult =
  | { updated: true }
  | { updated: false; reason: "NOT_FOUND" | "INVALID_TRANSITION" };

export async function updateOrderStatus(
  orderId: number,
  status: UpdateableOrderStatus,
  updatedByEmail: string,
  updatedByRole?: string | null
): Promise<UpdateOrderStatusResult> {
  const db = getDb();
  const [existing] = await db
    .select({
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      estimatedDeliveryTime: ordersCore.estimatedDeliveryTime,
      firstEtaAt: ordersCore.firstEtaAt,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);

  if (!existing) return { updated: false, reason: "NOT_FOUND" };

  const foodOrderStatus = await getFoodOrderStatus(orderId);
  const stage = resolveDispatchManualStage({
    status: existing.status,
    currentStatus: existing.currentStatus,
    foodOrderStatus,
  });

  if (!canApplyManualStatusUpdate(stage, status as ManualStatusValue)) {
    return { updated: false, reason: "INVALID_TRANSITION" };
  }

  const previousLabel = existing.currentStatus ?? null;
  const label = STATUS_TO_LABEL[status];
  const now = new Date();
  const existingEta = existing.estimatedDeliveryTime
    ? new Date(existing.estimatedDeliveryTime)
    : null;
  const etaToSet =
    existingEta != null && !isNaN(existingEta.getTime())
      ? existingEta
      : new Date(now.getTime() + DEFAULT_ETA_MINUTES_AFTER_STATUS_UPDATE * 60 * 1000);

  try {
    await db.transaction(async (tx) => {
      const [result] = await tx
        .update(ordersCore)
        .set({
          status,
          currentStatus: label,
          manualStatusUpdatedByEmail: updatedByEmail,
          updatedAt: now,
          ...(existingEta == null || isNaN(existingEta.getTime())
            ? {
                // Current ETA only — never invent First ETA on status changes.
                estimatedDeliveryTime: etaToSet,
              }
            : {}),
        })
        .where(eq(ordersCore.id, orderId))
        .returning({ id: ordersCore.id });

      if (!result) {
        throw new Error("ORDER_UPDATE_FAILED");
      }

      await ensureOrderManualStatusRoleColumn();

      await tx.insert(orderManualStatusHistory).values({
        orderId,
        toStatus: status,
        updatedByEmail,
        updatedByRole: updatedByRole?.trim() || "AGENT",
      });
    });

    await insertOrderTimelineEntry({
      orderId,
      status: label,
      previousStatus: previousLabel,
      actorType: "agent",
      actorName: updatedByEmail,
      expectedByAt: etaToSet,
    });

    await syncOrdersFoodForDashboardStatus(orderId, status, now);

    const { syncRiderMilestoneFromDashboardStatus } = await import(
      "@/lib/db/operations/rider-milestone-dashboard-sync"
    );
    try {
      await syncRiderMilestoneFromDashboardStatus(
        orderId,
        status,
        updatedByEmail,
        now
      );
    } catch (err) {
      console.warn("[updateOrderStatus] rider milestone sync failed:", err);
    }

    if (status === "delivered") {
      const { creditMerchantWalletForDeliveredCoreOrder } = await import(
        "@/lib/credit-merchant-wallet-after-delivery"
      );
      const { creditRiderWalletForDeliveredCoreOrder } = await import(
        "@/lib/credit-rider-wallet-after-delivery"
      );
      try {
        await creditMerchantWalletForDeliveredCoreOrder(orderId, previousLabel);
      } catch (walletErr) {
        console.warn("[updateOrderStatus] merchant wallet credit failed:", walletErr);
      }
      try {
        await creditRiderWalletForDeliveredCoreOrder(orderId);
      } catch (walletErr) {
        console.warn("[updateOrderStatus] rider wallet credit failed:", walletErr);
      }
    }
  } catch (err) {
    console.error("[updateOrderStatus] failed:", err);
    return { updated: false, reason: "NOT_FOUND" };
  }

  return { updated: true };
}

export interface OrderManualStatusHistoryEntry {
  toStatus: string;
  updatedByEmail: string;
  updatedByRole: string;
  createdAt: Date;
}

let orderManualStatusRoleColumnReady = false;

/** Idempotent: adds updated_by_role when migration has not been applied yet. */
async function ensureOrderManualStatusRoleColumn(): Promise<void> {
  if (orderManualStatusRoleColumnReady) return;
  if (await publicColumnExists("order_manual_status_history", "updated_by_role")) {
    orderManualStatusRoleColumnReady = true;
    return;
  }
  const sql = getSql();
  await sql`
    ALTER TABLE order_manual_status_history
    ADD COLUMN updated_by_role TEXT
  `;
  orderManualStatusRoleColumnReady = true;
}

/**
 * Fetch manual status history for an order (newest first).
 */
export async function getOrderManualStatusHistory(
  orderId: number
): Promise<OrderManualStatusHistoryEntry[]> {
  await ensureOrderManualStatusRoleColumn();
  const db = getDb();
  const rows = await db
    .select({
      toStatus: orderManualStatusHistory.toStatus,
      updatedByEmail: orderManualStatusHistory.updatedByEmail,
      updatedByRole: orderManualStatusHistory.updatedByRole,
      createdAt: orderManualStatusHistory.createdAt,
    })
    .from(orderManualStatusHistory)
    .where(eq(orderManualStatusHistory.orderId, orderId))
    .orderBy(desc(orderManualStatusHistory.createdAt));

  const missingRoleEmails = rows
    .filter((r) => !r.updatedByRole?.trim())
    .map((r) => r.updatedByEmail);
  const roleByEmail =
    missingRoleEmails.length > 0
      ? await getPrimaryRolesByEmails(missingRoleEmails)
      : new Map<string, string>();

  return rows.map((row) => {
    const emailKey = row.updatedByEmail.trim().toLowerCase();
    return {
      toStatus: row.toStatus,
      updatedByEmail: row.updatedByEmail,
      updatedByRole:
        row.updatedByRole?.trim() ||
        roleByEmail.get(emailKey) ||
        "AGENT",
      createdAt: row.createdAt,
    };
  });
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

export type OrderCancellationActorType =
  | "store"
  | "customer"
  | "system"
  | "rider"
  | "admin";

export interface InsertOrderCancellationReasonInput {
  orderId: number;
  cancelledBy: string;
  cancelledById: number | null;
  reasonCode: string;
  reasonText?: string | null;
  refundStatus?: string;
  refundAmount?: number | null;
  penaltyApplied?: boolean;
  penaltyAmount?: number | null;
  metadata?: Record<string, unknown>;
  catalogReasonId?: number | null;
  cancelledByType?: OrderCancellationActorType | null;
  cancelledByLabel?: string | null;
  displayReason?: string | null;
  attribute?: string | null;
  rejectionLabel?: string | null;
  actionSource?: string | null;
  cancelMode?: "auto" | "manual" | null;
}

function slugReasonCode(text: string): string {
  const slug = text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (slug || "CANCELLED").slice(0, 200);
}

/**
 * Insert a row into order_cancellation_reasons and return its id.
 * Use this id as cancellation_reason_id when updating orders_core.
 */
export async function insertOrderCancellationReason(
  input: InsertOrderCancellationReasonInput
): Promise<number | null> {
  const db = getDb();
  const sql = getSql();
  const metadata = (input.metadata ?? {}) as Record<string, unknown>;
  const displayReason =
    (input.displayReason ?? input.reasonText ?? "").trim() || null;

  try {
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
          input.refundAmount == null ? null : String(input.refundAmount),
        penaltyApplied: input.penaltyApplied ?? false,
        penaltyAmount:
          input.penaltyAmount == null ? null : String(input.penaltyAmount),
        metadata,
        catalogReasonId: input.catalogReasonId ?? null,
        cancelledByType: input.cancelledByType ?? null,
        cancelledByLabel: input.cancelledByLabel ?? null,
        displayReason,
        attribute: input.attribute ?? null,
        rejectionLabel: input.rejectionLabel ?? null,
        actionSource: input.actionSource ?? null,
        cancelMode: input.cancelMode ?? null,
      })
      .returning({ id: orderCancellationReasons.id });
    return row?.id ?? null;
  } catch {
    /* enriched columns may be missing before migration 0237 */
    const [legacy] = await sql<{ id: number }[]>`
      INSERT INTO order_cancellation_reasons (
        order_id, cancelled_by, cancelled_by_id, reason_code, reason_text,
        refund_status, refund_amount, penalty_applied, penalty_amount, metadata
      ) VALUES (
        ${input.orderId},
        ${input.cancelledBy},
        ${input.cancelledById},
        ${input.reasonCode},
        ${input.reasonText ?? null},
        ${input.refundStatus ?? "pending"},
        ${input.refundAmount == null ? null : input.refundAmount},
        ${input.penaltyApplied ?? false},
        ${input.penaltyAmount == null ? null : input.penaltyAmount},
        ${JSON.stringify({
          ...metadata,
          catalogReasonId: input.catalogReasonId ?? null,
          attribute: input.attribute ?? null,
          rejection: input.rejectionLabel ?? null,
          source: input.cancelledByType ?? null,
          cancelled_by_label: input.cancelledByLabel ?? null,
          rejected_reason: displayReason,
          action_source: input.actionSource ?? null,
          cancel_mode: input.cancelMode ?? null,
        })}::jsonb
      )
      RETURNING id
    `;
    return legacy?.id ?? null;
  }
}

export interface RecordOrderCancellationInput
  extends InsertOrderCancellationReasonInput {
  cancelledByType: OrderCancellationActorType;
  cancelledByLabel: string;
  displayReason: string;
  cancellationDetails?: Record<string, unknown>;
  /** When false, only inserts reason row + links orders_core (status already cancelled). */
  fullCoreSync?: boolean;
  previousStatus?: string | null;
  /**
   * Skip the merchant cancellation ledger debit. Used by the atomic
   * cancel+refund flow, which defers every money side-effect until the gateway
   * has accepted the refund (so a rejected refund leaves no ledger entries to
   * unwind). Callers that skip are responsible for applying it afterwards.
   */
  skipLedgerSync?: boolean;
}

/**
 * Canonical write: order_cancellation_reasons + orders_core.cancellation_reason_id + orders_food display.
 */
export async function recordOrderCancellation(
  input: RecordOrderCancellationInput
): Promise<{ cancellationReasonId: number | null; updated: boolean }> {
  const sql = getSql();
  const existing = await sql<{ id: number; cancellation_reason_id: number | null }[]>`
    SELECT ocr.id, COALESCE(f.cancellation_reason_id, c.cancellation_reason_id) AS cancellation_reason_id
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    LEFT JOIN LATERAL (
      SELECT id FROM order_cancellation_reasons
      WHERE order_id = ${input.orderId}
      ORDER BY created_at DESC
      LIMIT 1
    ) ocr ON TRUE
    WHERE c.id = ${input.orderId}
    LIMIT 1
  `;
  const linkedId = Number(existing[0]?.cancellation_reason_id);
  const latestId = Number(existing[0]?.id);
  if (Number.isFinite(linkedId) && linkedId > 0) {
    if (!input.skipLedgerSync) await syncOrderCancellationLedger(input);
    return { cancellationReasonId: linkedId, updated: true };
  }
  if (Number.isFinite(latestId) && latestId > 0) {
    await sql`
      UPDATE orders_core SET cancellation_reason_id = ${latestId} WHERE id = ${input.orderId}
    `;
    await sql`
      UPDATE orders_food SET cancellation_reason_id = ${latestId} WHERE order_id = ${input.orderId}
    `;
    if (!input.skipLedgerSync) await syncOrderCancellationLedger(input);
    return { cancellationReasonId: latestId, updated: true };
  }

  const reasonCode =
    (input.reasonCode ?? "").trim() ||
    slugReasonCode(input.displayReason || input.reasonText || "CANCELLED");

  const cancellationReasonId = await insertOrderCancellationReason({
    ...input,
    reasonCode,
    displayReason: input.displayReason,
  });

  if (input.fullCoreSync === false) {
    const sql = getSql();
    if (cancellationReasonId != null) {
      try {
        await sql`
          UPDATE orders_core
          SET
            cancellation_reason_id = ${cancellationReasonId},
            cancelled_by_type = ${input.cancelledByType},
            cancellation_details = COALESCE(cancellation_details, '{}'::jsonb)
              || ${JSON.stringify(input.cancellationDetails ?? {})}::jsonb,
            updated_at = NOW()
          WHERE id = ${input.orderId}
        `;
      } catch {
        await sql`
          UPDATE orders_core
          SET cancellation_reason_id = ${cancellationReasonId}
          WHERE id = ${input.orderId}
        `;
      }
    }
    await syncOrdersFoodForDashboardCancellation(input.orderId, {
      cancelledAt: new Date(),
      rejectedReason: input.displayReason,
      cancelledByLabel: input.cancelledByLabel,
      cancelledByType: input.cancelledByType,
      cancellationDetails:
        input.cancellationDetails ??
        ({
          version: 1,
          source: input.cancelledByType,
          cancelled_by_label: input.cancelledByLabel,
          rejected_reason: input.displayReason,
        } as Record<string, unknown>),
    });
    if (!input.skipLedgerSync) await syncOrderCancellationLedger(input);
    return { cancellationReasonId, updated: true };
  }

  const { updated } = await updateOrdersCoreCancellation(input.orderId, {
    cancelledBy: input.cancelledBy,
    cancelledById: input.cancelledById,
    cancellationReasonId,
    cancelledByType: input.cancelledByType,
    rejectedReason: input.displayReason,
    cancelledByLabel: input.cancelledByLabel,
    cancellationDetails: input.cancellationDetails,
  });
  if (!input.skipLedgerSync) await syncOrderCancellationLedger(input);
  return { cancellationReasonId, updated };
}

async function syncOrderCancellationLedger(input: RecordOrderCancellationInput): Promise<void> {
  try {
    const { applyMerchantOrderCancellationLedger } = await import(
      "@/lib/orders/apply-merchant-cancellation-debit"
    );
    const merchantDebit =
      typeof input.metadata?.merchantDebit === "string"
        ? input.metadata.merchantDebit
        : typeof (input.metadata as { merchant_debit?: string } | undefined)?.merchant_debit ===
            "string"
          ? (input.metadata as { merchant_debit: string }).merchant_debit
          : null;
    await applyMerchantOrderCancellationLedger({
      orderCoreId: input.orderId,
      merchantDebit,
      actorSystemUserId: input.cancelledById,
      source: "order_cancellation",
    });
  } catch (ledgerErr) {
    console.warn("[recordOrderCancellation] merchant ledger failed:", ledgerErr);
  }
}

export { slugReasonCode };

export interface UpdateOrdersCoreCancellationInput {
  cancelledBy: string;
  cancelledById: number | null;
  cancellationReasonId?: number | null;
  cancelledByType?: "store" | "customer" | "system" | "rider" | "admin";
  /** Catalog / UI reason shown to merchant (e.g. "RIDER - Food not delivered"). */
  rejectedReason?: string | null;
  /** Merchant-facing actor label (defaults to Rejected by GatiMitra Team for admin). */
  cancelledByLabel?: string | null;
  /** Canonical payload for merchant apps (orders_core + orders_food JSON). */
  cancellationDetails?: Record<string, unknown>;
}

async function syncOrdersFoodForDashboardCancellation(
  orderId: number,
  args: {
    cancelledAt: Date;
    rejectedReason: string | null;
    cancelledByLabel: string;
    cancelledByType: string;
    cancellationDetails: Record<string, unknown>;
  }
): Promise<void> {
  const sql = getSql();
  const nowIso = args.cancelledAt.toISOString();
  const detailsJson = JSON.stringify(args.cancellationDetails);
  try {
    await sql`
      UPDATE orders_food
      SET
        order_status = 'CANCELLED',
        cancelled_at = COALESCE(cancelled_at, ${nowIso}::timestamptz),
        rejected_reason = ${args.rejectedReason},
        cancelled_by_label = ${args.cancelledByLabel},
        cancelled_by_type = ${args.cancelledByType},
        cancellation_details = COALESCE(cancellation_details, '{}'::jsonb) || ${detailsJson}::jsonb,
        updated_at = ${nowIso}::timestamptz
      WHERE order_id = ${orderId}
    `;
  } catch (err) {
    try {
      await sql`
        UPDATE orders_food
        SET
          order_status = 'CANCELLED',
          cancelled_at = COALESCE(cancelled_at, ${nowIso}::timestamptz),
          rejected_reason = ${args.rejectedReason},
          cancelled_by_label = ${args.cancelledByLabel},
          updated_at = ${nowIso}::timestamptz
        WHERE order_id = ${orderId}
      `;
    } catch (fallbackErr) {
      console.error("[updateOrdersCoreCancellation] orders_food sync failed", fallbackErr);
    }
  }
}

/**
 * Set cancellation fields on orders_core when an order is cancelled (e.g. via refund flow).
 * Sets status to 'cancelled', cancelled_at, cancelled_by, cancelled_by_id, and optionally cancellation_reason_id.
 * Appends a Cancelled entry to order_timelines and syncs orders_food for merchant / partner UIs.
 */
export async function updateOrdersCoreCancellation(
  orderId: number,
  input: UpdateOrdersCoreCancellationInput
): Promise<{ updated: boolean }> {
  const db = getDb();
  const sql = getSql();
  const [existing] = await db
    .select({ currentStatus: ordersCore.currentStatus })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  const previousStatus = existing?.currentStatus ?? "Delivered";
  const cancelledAt = new Date();
  const cancelledByType = input.cancelledByType ?? "admin";
  const timelineLabel =
    (input.cancelledByLabel ?? "").trim() || "Rejected by GatiMitra Team";
  const rejectedReason = (input.rejectedReason ?? "").trim() || null;

  const [result] = await db
    .update(ordersCore)
    .set({
      status: "cancelled",
      currentStatus: "Cancelled",
      cancelledAt,
      cancelledBy: input.cancelledBy,
      cancelledById: input.cancelledById,
      cancellationReasonId: input.cancellationReasonId ?? null,
      updatedAt: cancelledAt,
    })
    .where(eq(ordersCore.id, orderId))
    .returning({ id: ordersCore.id });
  if (!result) return { updated: false };

  const cancellationDetails = input.cancellationDetails ?? {
    version: 1,
    source: cancelledByType,
    cancelled_by_label: timelineLabel,
    rejected_reason: rejectedReason,
  };

  try {
    await sql`
      UPDATE orders_core
      SET
        cancelled_by_type = ${cancelledByType},
        cancellation_details = COALESCE(cancellation_details, '{}'::jsonb) || ${JSON.stringify(cancellationDetails)}::jsonb
      WHERE id = ${orderId}
    `;
  } catch {
    try {
      await sql`
        UPDATE orders_core
        SET cancelled_by_type = ${cancelledByType}
        WHERE id = ${orderId}
      `;
    } catch {
      /* column may be missing on older DBs */
    }
  }

  await syncOrdersFoodForDashboardCancellation(orderId, {
    cancelledAt,
    rejectedReason,
    cancelledByLabel: timelineLabel,
    cancelledByType,
    cancellationDetails,
  });

  // Best-effort: restore platform offer usage when admin cancels (idempotent).
  try {
    const [core] = await sql<{ order_id: string | null }[]>`
      SELECT order_id FROM orders_core WHERE id = ${orderId} LIMIT 1
    `;
    const orderKey = core?.order_id ?? String(orderId);
    const rows = await sql<
      Array<{
        id: number;
        status: string;
        consumed_budget: string | null;
        discount_amount: string | null;
        platform_offer_id: number;
        restore_on_cancel: boolean | null;
      }>
    >`
      SELECT
        u.id::int AS id,
        u.status,
        u.consumed_budget::text AS consumed_budget,
        u.discount_amount::text AS discount_amount,
        u.platform_offer_id::int AS platform_offer_id,
        o.restore_on_cancel
      FROM platform_offer_usages u
      INNER JOIN billing_platform_offers o ON o.id = u.platform_offer_id
      WHERE u.status IN ('reserved', 'consumed')
        AND (u.order_id = ${orderId} OR u.order_id_text = ${orderKey})
    `;
    for (const row of rows) {
      if (row.restore_on_cancel === false) continue;
      const wasConsumed = row.status === "consumed";
      const budgetToRestore = wasConsumed
        ? Number(row.consumed_budget ?? row.discount_amount ?? 0) || 0
        : 0;
      await sql`
        UPDATE platform_offer_usages
        SET
          status = 'cancelled',
          cancelled_at = COALESCE(cancelled_at, now()),
          updated_at = now()
        WHERE id = ${row.id}
          AND status IN ('reserved', 'consumed')
      `;
      if (budgetToRestore > 0) {
        await sql`
          UPDATE billing_platform_offers
          SET
            budget_used = GREATEST(0, COALESCE(budget_used, 0) - ${budgetToRestore}),
            updated_at = now()
          WHERE id = ${row.platform_offer_id}
        `;
      }
    }
  } catch (err) {
    console.warn("[updateOrdersCoreCancellation] platform offer usage restore failed", err);
  }

  await insertOrderTimelineEntry({
    orderId,
    status: "Cancelled",
    previousStatus,
    actorType: cancelledByType,
    actorName: input.cancelledBy,
    statusMessage: timelineLabel,
    metadata: {
      rejected_reason: rejectedReason,
      cancelled_by_label: timelineLabel,
      cancel_mode: "manual",
      action_source: "admin",
      order_cancellation: true,
    },
  });
  return { updated: true };
}

export type CancellationDisplayDbRow = {
  order_id: number;
  food_rejected_reason: string | null;
  food_cancelled_by_label: string | null;
  cancelled_by_type: string | null;
  cancellation_details: unknown;
  reason_text: string | null;
  catalog_metadata: unknown;
  refund_reason: string | null;
  ocr_display_reason: string | null;
  ocr_cancelled_by_label: string | null;
  ocr_cancelled_by_type: string | null;
  ocr_attribute: string | null;
  ocr_rejection_label: string | null;
};

/** Load cancellation fields for merchant UIs (resolves stale orders_food rows from catalog/refunds). */
export async function fetchCancellationDisplayByOrderIds(
  orderIds: number[]
): Promise<Map<number, CancellationDisplayDbRow>> {
  if (!orderIds.length) return new Map();
  const sql = getSql();
  try {
    const rows = await sql<CancellationDisplayDbRow[]>`
      SELECT
        c.id AS order_id,
        f.rejected_reason AS food_rejected_reason,
        f.cancelled_by_label AS food_cancelled_by_label,
        COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
        COALESCE(f.cancellation_details, c.cancellation_details) AS cancellation_details,
        ocr.reason_text,
        ocr.metadata AS catalog_metadata,
        ocr.display_reason AS ocr_display_reason,
        ocr.cancelled_by_label AS ocr_cancelled_by_label,
        ocr.cancelled_by_type AS ocr_cancelled_by_type,
        ocr.attribute AS ocr_attribute,
        ocr.rejection_label AS ocr_rejection_label,
        (
          SELECT r.refund_reason
          FROM order_refunds r
          WHERE r.order_id = c.id
          ORDER BY r.created_at DESC
          LIMIT 1
        ) AS refund_reason
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      LEFT JOIN LATERAL (
        SELECT
          reason_text,
          metadata,
          display_reason,
          cancelled_by_label,
          cancelled_by_type,
          attribute,
          rejection_label
        FROM order_cancellation_reasons
        WHERE id = c.cancellation_reason_id
           OR (c.cancellation_reason_id IS NULL AND order_id = c.id)
        ORDER BY created_at DESC
        LIMIT 1
      ) ocr ON TRUE
      WHERE c.id = ANY(${orderIds})
    `;
    const map = new Map<number, CancellationDisplayDbRow>();
    for (const row of rows) {
      map.set(Number(row.order_id), row);
    }
    return map;
  } catch (err) {
    console.warn("[fetchCancellationDisplayByOrderIds] enriched query failed, retrying legacy", err);
    try {
      const rows = await sql<CancellationDisplayDbRow[]>`
        SELECT
          c.id AS order_id,
          f.rejected_reason AS food_rejected_reason,
          f.cancelled_by_label AS food_cancelled_by_label,
          COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
          COALESCE(f.cancellation_details, c.cancellation_details) AS cancellation_details,
          ocr.reason_text,
          ocr.metadata AS catalog_metadata,
          NULL::text AS ocr_display_reason,
          NULL::text AS ocr_cancelled_by_label,
          NULL::text AS ocr_cancelled_by_type,
          NULL::text AS ocr_attribute,
          NULL::text AS ocr_rejection_label,
          (
            SELECT r.refund_reason
            FROM order_refunds r
            WHERE r.order_id = c.id
            ORDER BY r.created_at DESC
            LIMIT 1
          ) AS refund_reason
        FROM orders_core c
        LEFT JOIN orders_food f ON f.order_id = c.id
        LEFT JOIN LATERAL (
          SELECT reason_text, metadata
          FROM order_cancellation_reasons
          WHERE id = c.cancellation_reason_id
             OR (c.cancellation_reason_id IS NULL AND order_id = c.id)
          ORDER BY created_at DESC
          LIMIT 1
        ) ocr ON TRUE
        WHERE c.id = ANY(${orderIds})
      `;
      const map = new Map<number, CancellationDisplayDbRow>();
      for (const row of rows) {
        map.set(Number(row.order_id), row);
      }
      return map;
    } catch (legacyErr) {
      console.error("[fetchCancellationDisplayByOrderIds]", legacyErr);
      return new Map();
    }
  }
}
