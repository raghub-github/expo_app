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
import { buildCustomerFraudReasons } from "@/lib/customers/fraud-reason";
import { getCustomerFraudAlerts } from "@/lib/db/operations/customers";
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
import {
  isPrepPipelineStatus,
  prepOverdueSeconds,
  resolvePreparedLateMinutes,
} from "@/lib/order-prep-time";
import type { OrdersFoodRow } from "@/lib/types/food-orders";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { listR2KeysByPrefix } from "@/lib/services/r2";

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
  /** Populated when customer trust tier is FRAUD. */
  customerFraudReasons: string[];
  riderInstructionsList: string[];
  merchantInstructionsList: string[];
  firstEtaAtIso: string | null;
  cancellationInfo: OrderCancellationInfo | null;
  /** OTP for handover at pickup; null when not yet generated or already redeemed. */
  pickupOtp: string | null;
  /** OTP shown to rider/customer at delivery. */
  deliveryOtp: string | null;
  /** OTP for return-to-origin flow. */
  rtoOtp: string | null;
  customerFeedback: OrderCustomerFeedback | null;
  /** Seconds merchant was late marking ready (after prep_ready_by_at). Null if not applicable. */
  storePrepDelaySeconds: number | null;
  /** True while order is still preparing past the committed ready-by time. */
  storePrepDelayLive: boolean;
  /** ISO anchor for live store prep duration (accepted_at). */
  storePrepDelayAnchorAt: string | null;
  /** True when merchant marked ready after prep_ready_by_at. */
  storePrepDelayWasLate: boolean;
  /** Seconds rider waited at restaurant until merchant marked ready. */
  riderRestaurantWaitSeconds: number | null;
  /** True while rider is at store waiting for merchant ready. */
  riderRestaurantWaitLive: boolean;
  /** ISO anchor for live rider wait (rider_reached_pickup_at). */
  riderRestaurantWaitAnchorAt: string | null;
  /** Latest rider delivery proof image for this order (proxy URL when possible). */
  deliveryProofImageUrl: string | null;
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

type FoodTimingMeta = {
  orderStatus: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  preparedAt: string | null;
  prepReadyByAt: string | null;
  preparedLateMinutes: number | null;
  preparationTimeMinutes: number | null;
  prepDelayMinutes: number | null;
  pickupWaitSeconds: number | null;
  riderReachedPickupAt: string | null;
};

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

async function fetchFoodTimingMeta(orderId: number): Promise<FoodTimingMeta> {
  const empty: FoodTimingMeta = {
    orderStatus: null,
    acceptedAt: null,
    preparingAt: null,
    preparedAt: null,
    prepReadyByAt: null,
    preparedLateMinutes: null,
    preparationTimeMinutes: null,
    prepDelayMinutes: null,
    pickupWaitSeconds: null,
    riderReachedPickupAt: null,
  };
  const db = getDb();
  const queries = [
    sql`
      SELECT
        order_status,
        accepted_at,
        preparing_at,
        prepared_at,
        prep_ready_by_at,
        prepared_late_minutes,
        preparation_time_minutes,
        prep_delay_minutes,
        pickup_wait_seconds,
        rider_reached_pickup_at
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `,
    sql`
      SELECT
        order_status,
        accepted_at,
        preparing_at,
        prepared_at,
        prep_ready_by_at,
        prepared_late_minutes,
        preparation_time_minutes,
        prep_delay_minutes
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `,
  ];

  for (const query of queries) {
    try {
      const rows = await db.execute(query);
      const row = (rows as unknown as Record<string, unknown>[])[0];
      if (!row) return empty;
      return {
        orderStatus: row.order_status != null ? String(row.order_status) : null,
        acceptedAt: toIso(row.accepted_at),
        preparingAt: toIso(row.preparing_at),
        preparedAt: toIso(row.prepared_at),
        prepReadyByAt: toIso(row.prep_ready_by_at),
        preparedLateMinutes: asNum(row.prepared_late_minutes),
        preparationTimeMinutes: asNum(row.preparation_time_minutes),
        prepDelayMinutes: asNum(row.prep_delay_minutes),
        pickupWaitSeconds: asNum(row.pickup_wait_seconds),
        riderReachedPickupAt: toIso(row.rider_reached_pickup_at),
      };
    } catch {
      // slimmer SELECT when pickup columns are missing
    }
  }
  return empty;
}

function resolveStorePrepDelay(meta: FoodTimingMeta): {
  seconds: number | null;
  live: boolean;
  anchorAt: string | null;
  wasLate: boolean;
} {
  if (meta.preparedAt) {
    const lateMins = resolvePreparedLateMinutes({
      prepared_late_minutes: meta.preparedLateMinutes,
      prepared_at: meta.preparedAt,
      prep_ready_by_at: meta.prepReadyByAt,
    });
    if (lateMins == null || lateMins <= 0) {
      return { seconds: null, live: false, anchorAt: null, wasLate: false };
    }
    return {
      seconds: Math.max(0, Math.floor(lateMins * 60)),
      live: false,
      anchorAt: null,
      wasLate: true,
    };
  }

  if (isPrepPipelineStatus(meta.orderStatus) && meta.prepReadyByAt) {
    const overdue = prepOverdueSeconds(
      {
        prep_ready_by_at: meta.prepReadyByAt,
        accepted_at: meta.acceptedAt,
        preparing_at: meta.preparingAt,
        preparation_time_minutes: meta.preparationTimeMinutes,
        prep_delay_minutes: meta.prepDelayMinutes,
      } as OrdersFoodRow,
      Date.now()
    );
    if (overdue <= 0) {
      return { seconds: null, live: false, anchorAt: null, wasLate: false };
    }
    return {
      seconds: overdue,
      live: true,
      anchorAt: meta.prepReadyByAt,
      wasLate: true,
    };
  }

  return { seconds: null, live: false, anchorAt: null, wasLate: false };
}

function resolveRiderRestaurantWait(meta: FoodTimingMeta): {
  seconds: number | null;
  live: boolean;
  anchorAt: string | null;
} {
  if (meta.pickupWaitSeconds != null) {
    return {
      seconds: Math.max(0, Math.floor(meta.pickupWaitSeconds)),
      live: false,
      anchorAt: null,
    };
  }

  if (meta.riderReachedPickupAt && meta.preparedAt) {
    const reachedMs = new Date(meta.riderReachedPickupAt).getTime();
    const preparedMs = new Date(meta.preparedAt).getTime();
    if (Number.isFinite(reachedMs) && Number.isFinite(preparedMs)) {
      return {
        seconds: Math.max(0, Math.floor((preparedMs - reachedMs) / 1000)),
        live: false,
        anchorAt: null,
      };
    }
  }

  if (meta.riderReachedPickupAt && !meta.preparedAt) {
    const reachedMs = new Date(meta.riderReachedPickupAt).getTime();
    if (Number.isFinite(reachedMs)) {
      const elapsed = Math.max(0, Math.floor((Date.now() - reachedMs) / 1000));
      return { seconds: elapsed, live: true, anchorAt: meta.riderReachedPickupAt };
    }
  }

  return { seconds: null, live: false, anchorAt: null };
}

async function fetchAssignmentReachedMerchantAt(orderId: number): Promise<string | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT reached_merchant_at
      FROM order_rider_assignments
      WHERE order_core_id = ${orderId}
        AND reached_merchant_at IS NOT NULL
      ORDER BY reached_merchant_at ASC
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    return toIso(row?.reached_merchant_at);
  } catch {
    return null;
  }
}

function resolveDeliveryImageUrl(
  imageUrl: unknown,
  legacyUrl: unknown,
  r2Key: unknown
): string | null {
  const modern = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const legacy = typeof legacyUrl === "string" ? legacyUrl.trim() : "";
  const key = typeof r2Key === "string" ? r2Key.trim() : "";
  const raw = modern || legacy || key;
  if (!raw) return null;
  const resolved = resolveAttachmentProxyUrl(raw);
  return resolved.trim() || null;
}

function readDeliveryImageFromMetadata(raw: unknown): string | null {
  const meta = readRecord(raw);
  if (!meta) return null;
  const candidates = [
    meta.delivery_image_url,
    meta.deliveryImageUrl,
    meta.delivery_proof_url,
    meta.deliveryProofUrl,
    meta.delivery_photo_url,
    meta.deliveryPhotoUrl,
  ];
  for (const candidate of candidates) {
    const resolved = resolveDeliveryImageUrl(candidate, null, null);
    if (resolved) return resolved;
  }
  return null;
}

function sanitizeOrderRefForR2(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "order";
}

async function fetchOrderRefsForDeliveryProof(orderId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT order_id, formatted_order_id
    FROM orders_core
    WHERE id = ${orderId}
    LIMIT 1
  `);
  const row = (rows as unknown as Record<string, unknown>[])[0];
  const refs = new Set<string>();
  for (const key of ["order_id", "formatted_order_id"] as const) {
    const val = row?.[key];
    if (typeof val === "string" && val.trim()) refs.add(val.trim());
  }
  return [...refs];
}

async function backfillDeliveryProofRow(
  orderId: number,
  imageUrl: string,
  r2Key: string | null
): Promise<void> {
  const db = getDb();
  try {
    const existing = await db.execute(sql`
      SELECT id
      FROM order_delivery_images
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    if ((existing as unknown as unknown[]).length > 0) return;

    await db.execute(sql`
      INSERT INTO order_delivery_images (
        order_id,
        image_type,
        image_url,
        r2_key,
        uploaded_by,
        taken_at,
        created_at
      )
      VALUES (
        ${orderId},
        'delivery',
        ${imageUrl},
        ${r2Key},
        'rider',
        NOW(),
        NOW()
      )
    `);
  } catch {
    // optional backfill — R2 fallback still works
  }
}

async function fetchDeliveryProofFromR2(orderId: number): Promise<string | null> {
  try {
    const refs = await fetchOrderRefsForDeliveryProof(orderId);
    if (refs.length === 0) return null;

    const prefixes = new Set<string>();
    for (const ref of refs) {
      prefixes.add(`orders/${ref}/delivery-proof/`);
      prefixes.add(`orders/${sanitizeOrderRefForR2(ref)}/delivery-proof/`);
    }

    let bestKey: string | null = null;
    for (const prefix of prefixes) {
      const keys = await listR2KeysByPrefix(prefix, 20);
      for (const key of keys) {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(key)) continue;
        if (!bestKey || key.localeCompare(bestKey) > 0) bestKey = key;
      }
    }

    if (!bestKey) return null;
    return `/api/attachments/proxy?key=${encodeURIComponent(bestKey)}`;
  } catch {
    return null;
  }
}

export async function fetchOrderDeliveryProofImageUrl(orderId: number): Promise<string | null> {
  const db = getDb();

  const imageQueries = [
    sql`
      SELECT image_url, url, r2_key
      FROM order_delivery_images
      WHERE order_id = ${orderId}
        AND image_type IN ('delivery_proof', 'delivery')
      ORDER BY taken_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    sql`
      SELECT image_url, url, r2_key
      FROM order_delivery_images
      WHERE order_id = ${orderId}
      ORDER BY taken_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    sql`
      SELECT url
      FROM order_delivery_images
      WHERE order_id = ${orderId}
        AND image_type IN ('delivery_proof', 'delivery')
      ORDER BY taken_at DESC, id DESC
      LIMIT 1
    `,
  ];

  for (const query of imageQueries) {
    try {
      const rows = await db.execute(query);
      const row = (rows as unknown as Record<string, unknown>[])[0];
      if (!row) continue;
      const resolved = resolveDeliveryImageUrl(row.image_url, row.url, row.r2_key);
      if (resolved) return resolved;
    } catch {
      // column mismatch — try next query shape
    }
  }

  try {
    const rows = await db.execute(sql`
      SELECT delivery_proof_url
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    const resolved = resolveDeliveryImageUrl(row?.delivery_proof_url, null, null);
    if (resolved) return resolved;
  } catch {
    // optional column
  }

  try {
    const rows = await db.execute(sql`
      SELECT assignment_metadata
      FROM order_rider_assignments
      WHERE order_core_id = ${orderId}
        AND assignment_metadata IS NOT NULL
      ORDER BY
        CASE WHEN delivered_at IS NOT NULL THEN 0 ELSE 1 END,
        delivered_at DESC NULLS LAST,
        id DESC
      LIMIT 3
    `);
    for (const row of rows as unknown as Record<string, unknown>[]) {
      const resolved = readDeliveryImageFromMetadata(row.assignment_metadata);
      if (resolved) return resolved;
    }
  } catch {
    // optional metadata column
  }

  const r2Url = await fetchDeliveryProofFromR2(orderId);
  if (r2Url) {
    const keyMatch = r2Url.match(/[?&]key=([^&]+)/);
    const r2Key = keyMatch ? decodeURIComponent(keyMatch[1]) : null;
    void backfillDeliveryProofRow(orderId, r2Url, r2Key);
    return r2Url;
  }

  return null;
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
      row.core_cancelled_by,
      reasonRow?.cancelled_by,
      coreDetails?.cancelled_by,
      row.food_cancelled_by,
      foodDetails?.cancelled_by
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
    actionSource: pickString(
      reasonRow?.action_source,
      foodDetails?.action_source,
      coreDetails?.action_source
    ),
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
        statusReason: customers.statusReason,
        customerDbId: customers.id,
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

    let customerFraudReasons: string[] = [];
    if (tier === "FRAUD" && base.customerDbId != null) {
      const fraudAlerts = await getCustomerFraudAlerts(Number(base.customerDbId));
      customerFraudReasons = buildCustomerFraudReasons({
        trustTier: tier,
        trustScore: base.trustScore as number | string | null,
        statusReason: base.statusReason as string | null,
        fraudAlerts,
      });
    }

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

    const foodTimingMeta = await fetchFoodTimingMeta(orderId);
    if (!foodTimingMeta.riderReachedPickupAt) {
      const reachedMerchantAt = await fetchAssignmentReachedMerchantAt(orderId);
      if (reachedMerchantAt) {
        foodTimingMeta.riderReachedPickupAt = reachedMerchantAt;
      }
    }
    const storePrepDelay = resolveStorePrepDelay(foodTimingMeta);
    const riderRestaurantWait = resolveRiderRestaurantWait(foodTimingMeta);
    const deliveryProofImageUrl = await fetchOrderDeliveryProofImageUrl(orderId);

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
      customerFraudReasons,
      riderInstructionsList,
      merchantInstructionsList,
      firstEtaAtIso,
      cancellationInfo,
      pickupOtp: orderOtps.pickupOtp,
      rtoOtp: orderOtps.rtoOtp,
      deliveryOtp: orderOtps.deliveryOtp,
      customerFeedback,
      storePrepDelaySeconds: storePrepDelay.seconds,
      storePrepDelayLive: storePrepDelay.live,
      storePrepDelayAnchorAt: storePrepDelay.anchorAt,
      storePrepDelayWasLate: storePrepDelay.wasLate,
      riderRestaurantWaitSeconds: riderRestaurantWait.seconds,
      riderRestaurantWaitLive: riderRestaurantWait.live,
      riderRestaurantWaitAnchorAt: riderRestaurantWait.anchorAt,
      deliveryProofImageUrl,
    };
  } catch (err) {
    console.error("[getOrderDetailEnrichment] failed for order", orderId, err);
    return null;
  }
}

