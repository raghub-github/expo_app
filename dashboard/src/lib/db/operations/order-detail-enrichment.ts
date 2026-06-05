/**
 * Extra order-detail fields for the dashboard order page (sidebar + customer card).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { customers, ordersCore, ordersFood } from "../schema";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import {
  buildMerchantInstructionsFromCheckout,
  buildRiderInstructionsFromCheckout,
  parseInstructionList,
  resolveFirstEtaAtIso,
  resolveLocalityDisplay,
  resolveMerchantUpdatedKptMinutes,
} from "@/lib/orders/order-detail-display";
import type { OrderCancellationInfo } from "@/lib/merchant-cancellation-display";
import { resolveMerchantCancellationFields } from "@/lib/orders/merchant-cancellation-fields";
import { getOrderOtpsForDashboard } from "./order-otps";
import { getOrderCustomerFeedback } from "./order-customer-feedback";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";

export type OrderDetailEnrichment = {
  orderTimeIso: string | null;
  orderTimeSource: "placed_at" | "created_at";
  itemCount: number;
  systemKptMinutes: number | null;
  merchantUpdatedKptMinutes: number | null;
  /** Cumulative prep minutes added via merchant "Need more time". */
  merchantExtraPrepMinutes: number | null;
  isScheduledOrder: boolean;
  scheduledDeliverySummary: string | null;
  deliveryType: string | null;
  contactlessDelivery: boolean | null;
  localityType: string | null;
  localityIsSafe: boolean | null;
  deliveredBy: string | null;
  deliveryInitiator: string | null;
  orderSource: string | null;
  riderId: number | null;
  customerTrustTierLabel: string | null;
  customerAccountStatus: string | null;
  /** Trust tier label from `customers` — shown as User Type on customer card. */
  customerUserType: string | null;
  riderInstructionsList: string[];
  merchantInstructionsList: string[];
  firstEtaAtIso: string | null;
  cancellationInfo: OrderCancellationInfo | null;
  customerFeedback: OrderCustomerFeedback | null;
};

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

async function fetchCoreExtras(
  orderId: number
): Promise<Record<string, unknown>> {
  const db = getDb();
  const attempts = [
    sql`
      SELECT
        delivery_type,
        checkout_metadata,
        billing_snapshot,
        delivered_by,
        is_scheduled_order,
        delivery_instructions_list,
        merchant_instructions_list,
        default_system_kpt_minutes,
        merchant_updated_kpt_minutes,
        prep_delay_minutes
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT
        delivery_type,
        checkout_metadata,
        billing_snapshot,
        delivered_by
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT delivery_type, checkout_metadata, billing_snapshot
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
  ];

  for (const query of attempts) {
    try {
      const rows = await db.execute(query);
      const row = (rows as unknown as Record<string, unknown>[])[0];
      if (row) return row;
    } catch {
      // column may be missing on this DB — try slimmer SELECT
    }
  }
  return {};
}

async function fetchFoodPrepMeta(orderId: number): Promise<{
  preparationTimeMinutes: number | null;
  prepTimeSource: string | null;
  prepDelayMinutes: number | null;
}> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT preparation_time_minutes, prep_time_source, prep_delay_minutes
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    return {
      preparationTimeMinutes: asNum(row?.preparation_time_minutes),
      prepTimeSource:
        row?.prep_time_source != null ? String(row.prep_time_source) : null,
      prepDelayMinutes: asNum(row?.prep_delay_minutes),
    };
  } catch {
    try {
      const rows = await db.execute(sql`
        SELECT preparation_time_minutes, prep_time_source
        FROM orders_food
        WHERE order_id = ${orderId}
        LIMIT 1
      `);
      const row = (rows as unknown as Record<string, unknown>[])[0];
      return {
        preparationTimeMinutes: asNum(row?.preparation_time_minutes),
        prepTimeSource:
          row?.prep_time_source != null ? String(row.prep_time_source) : null,
        prepDelayMinutes: null,
      };
    } catch {
      return { preparationTimeMinutes: null, prepTimeSource: null, prepDelayMinutes: null };
    }
  }
}

async function fetchFoodInstructionLists(orderId: number): Promise<{
  deliveryList: unknown;
  merchantList: unknown;
}> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT delivery_instructions_list, merchant_instructions_list
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    return {
      deliveryList: row?.delivery_instructions_list,
      merchantList: row?.merchant_instructions_list,
    };
  } catch {
    return { deliveryList: null, merchantList: null };
  }
}

async function fetchFirstTimelineExpectedAt(orderId: number): Promise<Date | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT expected_by_at
      FROM order_timelines
      WHERE order_id = ${orderId}
        AND expected_by_at IS NOT NULL
      ORDER BY occurred_at ASC
      LIMIT 1
    `);
    const raw = (rows as unknown as { expected_by_at?: Date | string | null }[])[0]
      ?.expected_by_at;
    if (raw == null) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

async function fetchEtaFields(orderId: number): Promise<Record<string, unknown>> {
  const db = getDb();
  const attempts = [
    sql`
      SELECT
        first_eta_at,
        first_eta,
        estimated_delivery_time,
        eta_seconds,
        placed_at,
        created_at
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT
        first_eta_at,
        estimated_delivery_time,
        eta_seconds,
        placed_at,
        created_at
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT estimated_delivery_time, eta_seconds, created_at
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `,
  ];
  for (const query of attempts) {
    try {
      const rows = await db.execute(query);
      const row = (rows as unknown as Record<string, unknown>[])[0];
      if (row) return row;
    } catch {
      /* try slimmer SELECT */
    }
  }
  return {};
}

async function fetchStoreAvgPrep(
  merchantStoreId: number | null
): Promise<number | null> {
  if (merchantStoreId == null || !Number.isFinite(merchantStoreId)) return null;
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT avg_preparation_time_minutes
      FROM merchant_stores
      WHERE id = ${merchantStoreId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    return asNum(row?.avg_preparation_time_minutes);
  } catch {
    return null;
  }
}

function readCancellationDetails(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function pickIsoDate(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const d = v instanceof Date ? v : new Date(String(v));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

async function fetchOrderCancellationInfo(
  orderId: number
): Promise<OrderCancellationInfo | null> {
  const db = getDb();

  let row: Record<string, unknown> | null = null;
  const foodAttempts = [
    sql`
      SELECT
        f.rejected_reason,
        f.cancelled_by_label,
        f.cancelled_by AS food_cancelled_by,
        f.cancelled_by_type AS food_cancelled_by_type,
        f.cancelled_at AS food_cancelled_at,
        f.cancellation_details AS food_cancellation_details,
        c.cancelled_at AS core_cancelled_at,
        c.cancelled_by AS core_cancelled_by,
        c.cancelled_by_type AS core_cancelled_by_type,
        c.cancellation_details AS core_cancellation_details,
        c.cancellation_reason_id
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT
        f.rejected_reason,
        f.cancelled_by_label,
        f.cancelled_by AS food_cancelled_by,
        f.cancelled_at AS food_cancelled_at,
        c.cancelled_at AS core_cancelled_at,
        c.cancelled_by AS core_cancelled_by,
        c.cancellation_reason_id
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT
        c.cancelled_at AS core_cancelled_at,
        c.cancelled_by AS core_cancelled_by,
        c.cancellation_reason_id
      FROM orders_core c
      WHERE c.id = ${orderId}
      LIMIT 1
    `,
  ];

  for (const query of foodAttempts) {
    try {
      const rows = await db.execute(query);
      const found = (rows as unknown as Record<string, unknown>[])[0];
      if (found) {
        row = found;
        break;
      }
    } catch {
      /* column may be missing — try slimmer SELECT */
    }
  }

  if (!row) return null;

  let reasonRow: Record<string, unknown> | null = null;
  const reasonId = asNum(row.cancellation_reason_id);
  try {
    const reasonQuery =
      reasonId != null
        ? sql`
            SELECT
              reason_code, reason_text, cancelled_by, refund_status, refund_amount, created_at,
              display_reason, cancelled_by_label, cancelled_by_type, attribute, rejection_label,
              catalog_reason_id, action_source, cancel_mode, metadata
            FROM order_cancellation_reasons
            WHERE id = ${reasonId}
            LIMIT 1
          `
        : sql`
            SELECT
              reason_code, reason_text, cancelled_by, refund_status, refund_amount, created_at,
              display_reason, cancelled_by_label, cancelled_by_type, attribute, rejection_label,
              catalog_reason_id, action_source, cancel_mode, metadata
            FROM order_cancellation_reasons
            WHERE order_id = ${orderId}
            ORDER BY created_at DESC
            LIMIT 1
          `;
    const reasonRows = await db.execute(reasonQuery);
    reasonRow = (reasonRows as unknown as Record<string, unknown>[])[0] ?? null;
  } catch {
    reasonRow = null;
  }

  const foodDetails = readCancellationDetails(row.food_cancellation_details);
  const coreDetails = readCancellationDetails(row.core_cancellation_details);
  const reasonMeta =
    reasonRow?.metadata &&
    typeof reasonRow.metadata === "object" &&
    !Array.isArray(reasonRow.metadata)
      ? (reasonRow.metadata as Record<string, unknown>)
      : null;
  const resolved = resolveMerchantCancellationFields({
    rejected_reason: pickString(row.rejected_reason, foodDetails?.reason, coreDetails?.reason),
    cancelled_by_label: pickString(
      row.cancelled_by_label,
      foodDetails?.cancelled_by_label,
      coreDetails?.cancelled_by_label
    ),
    cancelled_by_type: pickString(
      row.food_cancelled_by_type,
      row.core_cancelled_by_type,
      foodDetails?.cancelled_by_type,
      coreDetails?.cancelled_by_type
    ),
    cancellation_details: row.food_cancellation_details ?? row.core_cancellation_details,
    catalog_attribute:
      pickString(reasonRow?.attribute) ??
      (reasonMeta && typeof reasonMeta.attribute === "string" ? reasonMeta.attribute : null),
    catalog_rejection:
      pickString(reasonRow?.rejection_label) ??
      (reasonMeta && typeof reasonMeta.rejection === "string" ? reasonMeta.rejection : null),
    reason_text: pickString(reasonRow?.reason_text),
    ocr_display_reason: pickString(reasonRow?.display_reason),
    ocr_cancelled_by_label: pickString(reasonRow?.cancelled_by_label),
    ocr_cancelled_by_type: pickString(reasonRow?.cancelled_by_type),
  });

  const info: OrderCancellationInfo = {
    rejectedReason: resolved.rejected_reason,
    cancelledByLabel: resolved.cancelled_by_label,
    cancelledBy: pickString(
      row.food_cancelled_by,
      row.core_cancelled_by,
      reasonRow?.cancelled_by,
      foodDetails?.cancelled_by,
      coreDetails?.cancelled_by
    ),
    cancelledByType: resolved.cancelled_by_type,
    cancelledAtIso: pickIsoDate(
      row.food_cancelled_at,
      row.core_cancelled_at,
      reasonRow?.created_at
    ),
    reasonCode: pickString(reasonRow?.reason_code, foodDetails?.reason_code, coreDetails?.reason_code),
    reasonText: pickString(reasonRow?.reason_text, foodDetails?.reason_text, coreDetails?.reason_text),
    refundStatus: pickString(reasonRow?.refund_status),
    refundAmount:
      reasonRow?.refund_amount != null && reasonRow.refund_amount !== ""
        ? String(reasonRow.refund_amount)
        : null,
  };

  const hasAny =
    info.rejectedReason ||
    info.cancelledByLabel ||
    info.cancelledBy ||
    info.cancelledByType ||
    info.reasonText ||
    info.reasonCode ||
    info.cancelledAtIso;

  return hasAny ? info : null;
}

async function fetchDeliveryInitiator(orderId: number): Promise<string | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT delivery_initiator::text AS delivery_initiator
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    return row?.delivery_initiator != null ? String(row.delivery_initiator) : null;
  } catch {
    return null;
  }
}

export async function getOrderDetailEnrichment(
  orderId: number
): Promise<OrderDetailEnrichment | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  try {
    const db = getDb();

    const [base] = await db
      .select({
        orderId: ordersCore.orderId,
        placedAt: ordersCore.placedAt,
        createdAt: ordersCore.createdAt,
        orderSource: ordersCore.orderSource,
        riderId: ordersCore.riderId,
        merchantStoreId: ordersCore.merchantStoreId,
        foodItemsCount: ordersFood.foodItemsCount,
        preparationTimeMinutes: ordersFood.preparationTimeMinutes,
        trustTier: customers.trustTier,
        trustScore: customers.trustScore,
        accountStatus: customers.accountStatus,
      })
      .from(ordersCore)
      .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .leftJoin(customers, eq(customers.id, ordersCore.customerId))
      .where(eq(ordersCore.id, orderId))
      .limit(1);

    if (!base) return null;

    const extras = await fetchCoreExtras(orderId);
    const deliveryInitiator = await fetchDeliveryInitiator(orderId);
    const storeAvg = await fetchStoreAvgPrep(base.merchantStoreId ?? null);

    const textOrderId = String(base.orderId ?? "").trim();
    let itemCountFromDb = 0;
    if (textOrderId) {
      try {
        const countRows = await db.execute(sql`
          SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS cnt
          FROM orders_core_items
          WHERE order_id = ${textOrderId}
        `);
        const cntRow = (countRows as unknown as { cnt?: number }[])[0];
        itemCountFromDb = Number(cntRow?.cnt) || 0;
      } catch {
        itemCountFromDb = 0;
      }
    }

    const foodItemsCount = asNum(base.foodItemsCount);
    const itemCount =
      itemCountFromDb > 0 ? itemCountFromDb : foodItemsCount != null ? foodItemsCount : 0;

    const placedAt = base.placedAt ? new Date(base.placedAt) : null;
    const createdAt = base.createdAt ? new Date(base.createdAt) : null;
    const orderTime =
      placedAt && !Number.isNaN(placedAt.getTime())
        ? placedAt
        : createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt
          : null;

    const checkout = readRecord(extras.checkout_metadata);
    const billing = readRecord(extras.billing_snapshot);

    const scheduledFromColumn =
      extras.is_scheduled_order === true || extras.is_scheduled_order === "true";
    const scheduledSummary =
      typeof checkout?.scheduledDeliverySummary === "string"
        ? checkout.scheduledDeliverySummary.trim()
        : null;
    const isScheduled =
      scheduledFromColumn ||
      Boolean(scheduledSummary) ||
      checkout?.isScheduled === true ||
      checkout?.scheduled === true;

    const deliveryTypeRaw =
      extras.delivery_type != null
        ? String(extras.delivery_type)
        : typeof billing?.deliveryType === "string"
          ? billing.deliveryType
          : null;

    const foodPrepMeta = await fetchFoodPrepMeta(orderId);
    const foodPrepMinutes =
      asNum(base.preparationTimeMinutes) ?? foodPrepMeta.preparationTimeMinutes;

    const systemKpt =
      asNum(extras.default_system_kpt_minutes) ??
      storeAvg ??
      asNum(billing?.default_system_kpt_minutes) ??
      asNum(billing?.system_kpt_minutes) ??
      null;

    const merchantKpt = resolveMerchantUpdatedKptMinutes({
      systemKptMinutes: systemKpt,
      coreMerchantUpdatedKptMinutes: asNum(extras.merchant_updated_kpt_minutes),
      foodPrepMinutes,
      prepTimeSource: foodPrepMeta.prepTimeSource,
    });

    const foodLists = await fetchFoodInstructionLists(orderId);

    let riderInstructionsList = parseInstructionList(
      extras.delivery_instructions_list ?? foodLists.deliveryList
    );
    if (riderInstructionsList.length === 0) {
      riderInstructionsList = buildRiderInstructionsFromCheckout(checkout);
    }

    let merchantInstructionsList = parseInstructionList(
      extras.merchant_instructions_list ?? foodLists.merchantList
    );
    if (merchantInstructionsList.length === 0) {
      merchantInstructionsList = buildMerchantInstructionsFromCheckout(checkout);
    }

    const [etaFields, timelineExpectedAt, cancellationInfo, orderOtps, customerFeedback] =
      await Promise.all([
        fetchEtaFields(orderId),
        fetchFirstTimelineExpectedAt(orderId),
        fetchOrderCancellationInfo(orderId),
        getOrderOtpsForDashboard(orderId).catch(() => ({
          pickupOtp: null,
          rtoOtp: null,
          deliveryOtp: null,
        })),
        getOrderCustomerFeedback(orderId),
      ]);
    const firstEtaAtIso = resolveFirstEtaAtIso({
      firstEtaAt: etaFields.first_eta_at as Date | string | null | undefined,
      firstEtaLegacy: etaFields.first_eta as Date | string | null | undefined,
      estimatedDeliveryTime: etaFields.estimated_delivery_time as
        | Date
        | string
        | null
        | undefined,
      etaSeconds: asNum(etaFields.eta_seconds),
      placedAt: (etaFields.placed_at ?? base.placedAt) as Date | string | null | undefined,
      createdAt: (etaFields.created_at ?? base.createdAt) as Date | string | null | undefined,
      billingSnapshot: billing,
      timelineExpectedByAt: timelineExpectedAt,
    });

    const tier = resolveTrustTier(
      base.trustTier as string | null,
      base.trustScore as number | string | null
    );
    const customerTrustTierLabel = TRUST_TIER_LABEL[tier as CustomerTrustTier] ?? tier;

    let contactless =
      checkout?.leaveAtDoor === true ||
      checkout?.contactless === true ||
      checkout?.contactLessDelivery === true
        ? true
        : checkout?.leaveAtDoor === false
          ? false
          : null;
    if (contactless == null && riderInstructionsList.length > 0) {
      const joined = riderInstructionsList.join(" ").toLowerCase();
      if (joined.includes("leave at door") || joined.includes("contactless")) {
        contactless = true;
      }
    }

    let locality = resolveLocalityDisplay(billing, checkout);
    if (!locality && billing?.serviceable === true) {
      locality = { label: "GREEN", isSafe: true };
    } else if (!locality && billing?.serviceable === false) {
      locality = { label: "RED", isSafe: false };
    }

    let systemKptResolved = systemKpt ?? storeAvg;
    if (systemKptResolved == null) {
      const src = foodPrepMeta.prepTimeSource?.trim().toLowerCase() ?? null;
      // orders_food.preparation_time_minutes is merchant commit at accept — not system default.
      if (src !== "merchant" && foodPrepMinutes != null) {
        systemKptResolved = foodPrepMinutes;
      }
    }

    const merchantExtraPrepRaw =
      foodPrepMeta.prepDelayMinutes ?? asNum(extras.prep_delay_minutes);
    const merchantExtraPrepMinutes =
      merchantExtraPrepRaw != null && merchantExtraPrepRaw > 0
        ? merchantExtraPrepRaw
        : null;

    return {
      orderTimeIso: orderTime?.toISOString() ?? null,
      orderTimeSource:
        placedAt && !Number.isNaN(placedAt.getTime()) ? "placed_at" : "created_at",
      itemCount,
      systemKptMinutes: systemKptResolved,
      merchantUpdatedKptMinutes: merchantKpt,
      merchantExtraPrepMinutes,
      isScheduledOrder: isScheduled,
      scheduledDeliverySummary: scheduledSummary,
      deliveryType: deliveryTypeRaw,
      contactlessDelivery: contactless,
      localityType: locality?.label ?? null,
      localityIsSafe: locality?.isSafe ?? null,
      deliveredBy:
        extras.delivered_by != null ? String(extras.delivered_by) : null,
      deliveryInitiator,
      orderSource: base.orderSource != null ? String(base.orderSource) : null,
      riderId: base.riderId ?? null,
      customerTrustTierLabel,
      customerAccountStatus:
        base.accountStatus != null ? String(base.accountStatus) : null,
      customerUserType: customerTrustTierLabel,
      riderInstructionsList,
      merchantInstructionsList,
      firstEtaAtIso,
      cancellationInfo,
      pickupOtp: orderOtps.pickupOtp,
      rtoOtp: orderOtps.rtoOtp,
      deliveryOtp: orderOtps.deliveryOtp,
      customerFeedback,
    };
  } catch (err) {
    console.error("[getOrderDetailEnrichment] failed for order", orderId, err);
    return null;
  }
}

