/**
 * Live ETA engine — continuously recalculates a single customer-facing ETA minute
 * value. Never allows ETA to reach 0 while the order is still being prepared
 * or awaiting pickup. Auto-detects merchant delay when prep_ready_by passes.
 */
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { computeEta, type EtaSnapshot } from "./eta.engine.js";
import { resolveBlendedStorePrepMinutes } from "./eta.merchant-prep-stats.js";
import { appendEtaRecalc, getLatestEtaHistoryMeta, type EtaRecalcReason } from "./eta.repository.js";
import { resolveCustomerEtaContext, MIN_ACTIVE_ETA } from "./eta.customer-view.js";
import {
  resolveOperationalStage,
  resolveStageAwareEta,
  type LiveEtaLegs,
  type StageAwareEta,
  type EtaSource,
} from "./eta.stage-aware.js";
import {
  etaMeaningfulFingerprint,
  shouldAppendEtaHistory,
  publishEtaUpdated,
} from "./eta.realtime.js";
import { processRiderWaitEscalations } from "./eta.rider-wait-escalation.js";
import { processRiderWaitDecisionPrompt } from "../../lib/rider-waiting-decision-prompt.js";
import { processRiderFreeWaitPriority } from "./eta.rider-free-wait-priority.js";
import { getActiveOrdersForStore } from "./restaurantLoad.js";
import { resolveCanonicalOrderIdText } from "./eta.order-ref.js";

export type LiveOrderEtaContext = {
  orderCoreId: number;
  orderIdText: string;
  merchantStoreId: number;
  riderId: number | null;
  status: string;
  currentStatus: string | null;
  foodStatus: string | null;
  prepTimeMinutes: number | null;
  prepReadyByAt: Date | null;
  preparedAt: Date | null;
  riderReachedPickupAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  promisedEtaMinutes: number | null;
  currentEtaMinutes: number | null;
  routeMinutes: number;
  routeKm: number;
  pickupLat: number;
  pickupLon: number;
  dropLat: number;
  dropLon: number;
  placedAt: Date | null;
};

const TERMINAL_STATUSES = new Set([
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "PAYMENT_FAILED",
  "RTO",
]);

const READY_STATUSES = new Set(["READY_FOR_PICKUP", "READY"]);

function normalizeStatus(...parts: Array<string | null | undefined>): string {
  for (const p of parts) {
    const s = String(p ?? "").trim().toUpperCase();
    if (s) return s;
  }
  return "";
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isOrderActive(ctx: LiveOrderEtaContext): boolean {
  const s = normalizeStatus(ctx.currentStatus, ctx.foodStatus, ctx.status);
  return !TERMINAL_STATUSES.has(s) && s !== "delivered".toUpperCase();
}

function isReady(ctx: LiveOrderEtaContext): boolean {
  return (
    ctx.preparedAt != null ||
    READY_STATUSES.has(normalizeStatus(ctx.foodStatus, ctx.currentStatus))
  );
}

function isPickedUp(ctx: LiveOrderEtaContext): boolean {
  return (
    ctx.pickedUpAt != null ||
    normalizeStatus(ctx.foodStatus, ctx.currentStatus) === "OUT_FOR_DELIVERY" ||
    normalizeStatus(ctx.status) === "picked_up".toUpperCase() ||
    normalizeStatus(ctx.status) === "in_transit".toUpperCase()
  );
}

function isDelivered(ctx: LiveOrderEtaContext): boolean {
  return (
    ctx.deliveredAt != null ||
    normalizeStatus(ctx.foodStatus, ctx.currentStatus, ctx.status) === "DELIVERED"
  );
}

export function detectMerchantDelay(
  ctx: LiveOrderEtaContext,
  now: Date
): { delayed: boolean; delayMinutes: number; reason: string | null } {
  if (isReady(ctx) || isPickedUp(ctx) || isDelivered(ctx)) {
    return { delayed: false, delayMinutes: 0, reason: null };
  }
  const readyBy = ctx.prepReadyByAt ?? ctx.preparedAt;
  if (!readyBy) return { delayed: false, delayMinutes: 0, reason: null };
  if (now.getTime() <= readyBy.getTime()) {
    return { delayed: false, delayMinutes: 0, reason: null };
  }
  const delayMinutes = Math.ceil((now.getTime() - readyBy.getTime()) / 60_000);
  return {
    delayed: true,
    delayMinutes: Math.max(1, delayMinutes),
    reason: "PREP_READY_BY_PASSED",
  };
}

function computeRiderWaitMinutes(ctx: LiveOrderEtaContext, now: Date): number {
  if (!ctx.riderReachedPickupAt || isReady(ctx)) return 0;
  if (now.getTime() <= ctx.riderReachedPickupAt.getTime()) return 0;
  return Math.ceil((now.getTime() - ctx.riderReachedPickupAt.getTime()) / 60_000);
}

/** Status-aware remaining minutes + independent legs. */
export function computeLiveEtaLegs(
  ctx: LiveOrderEtaContext,
  snap: EtaSnapshot,
  now: Date
): LiveEtaLegs {
  if (isDelivered(ctx)) {
    return { remainingPrep: 0, pickupLeg: 0, travelLeg: 0, total: 0 };
  }

  const delay = detectMerchantDelay(ctx, now);
  const riderWait = computeRiderWaitMinutes(ctx, now);
  const pickedUp = isPickedUp(ctx);
  const ready = isReady(ctx);
  const riderAtStore = ctx.riderReachedPickupAt != null;
  const hasRider = ctx.riderId != null && ctx.riderId > 0;

  let remainingPrep = 0;
  if (!ready && !pickedUp) {
    if (ctx.prepReadyByAt && now.getTime() < ctx.prepReadyByAt.getTime()) {
      remainingPrep = Math.ceil((ctx.prepReadyByAt.getTime() - now.getTime()) / 60_000);
    } else if (delay.delayed) {
      remainingPrep = MIN_ACTIVE_ETA + delay.delayMinutes;
    } else {
      remainingPrep = Math.max(
        MIN_ACTIVE_ETA,
        ctx.prepTimeMinutes ?? snap.breakdown.foodPrepMinutes ?? MIN_ACTIVE_ETA
      );
    }
  }

  let pickupLeg = 0;
  if (ready && !pickedUp) {
    // Rider→merchant when assigned; short handover buffer when already at store.
    pickupLeg = riderAtStore ? 2 : hasRider ? 4 : 6;
  } else if (riderAtStore && !ready) {
    pickupLeg = MIN_ACTIVE_ETA;
  } else if (hasRider && !pickedUp) {
    pickupLeg = Math.max(MIN_ACTIVE_ETA, snap.breakdown.riderArrivalMinutes || 4);
  }

  let travelLeg = 0;
  if (pickedUp) {
    travelLeg = Math.max(MIN_ACTIVE_ETA, snap.breakdown.travelMinutes);
  } else if (ready && hasRider) {
    travelLeg = snap.breakdown.travelMinutes + 2;
  } else if (hasRider) {
    travelLeg = snap.breakdown.travelMinutes + snap.breakdown.pickupBufferMinutes;
  } else {
    travelLeg =
      snap.breakdown.travelMinutes +
      snap.breakdown.riderArrivalMinutes +
      snap.breakdown.pickupBufferMinutes;
  }

  let total = remainingPrep + pickupLeg + travelLeg;

  if (delay.delayed) {
    total = Math.max(total, (ctx.promisedEtaMinutes ?? total) + Math.ceil(delay.delayMinutes * 0.6));
  }

  if (riderWait > 0 && !ready) {
    total += Math.min(12, Math.ceil(riderWait * 0.35));
  }

  if (!isDelivered(ctx) && total < MIN_ACTIVE_ETA) {
    total = delay.delayed ? Math.max(MIN_ACTIVE_ETA, delay.delayMinutes + MIN_ACTIVE_ETA) : MIN_ACTIVE_ETA;
  }

  total = Math.min(120, Math.max(MIN_ACTIVE_ETA, Math.round(total)));

  return {
    remainingPrep: Math.max(0, Math.round(remainingPrep)),
    pickupLeg: Math.max(0, Math.round(pickupLeg)),
    travelLeg: Math.max(0, Math.round(travelLeg)),
    total,
  };
}

/** @deprecated Prefer computeLiveEtaLegs — kept for call sites expecting a number. */
export function computeLiveEtaMinutes(
  ctx: LiveOrderEtaContext,
  snap: EtaSnapshot,
  now: Date
): number {
  return computeLiveEtaLegs(ctx, snap, now).total;
}

export function buildStageAwareFromContext(
  ctx: LiveOrderEtaContext,
  legs: LiveEtaLegs,
  opts: {
    merchantDelayed: boolean;
    etaSource?: EtaSource;
    promisedAt?: string | null;
    confidenceScore?: number | null;
    etaVersion?: number;
    arrivingSoon?: boolean;
  }
): StageAwareEta {
  const stage = resolveOperationalStage({
    delivered: isDelivered(ctx),
    pickedUp: isPickedUp(ctx),
    ready: isReady(ctx),
    hasRider: ctx.riderId != null && ctx.riderId > 0,
    riderAtStore: ctx.riderReachedPickupAt != null,
    arrivingSoon: opts.arrivingSoon,
  });
  return resolveStageAwareEta({
    stage,
    legs,
    merchantDelayed: opts.merchantDelayed,
    confidenceScore: opts.confidenceScore,
    etaSource: opts.etaSource,
    promisedAt: opts.promisedAt,
    etaVersion: opts.etaVersion,
  });
}

export async function loadLiveOrderEtaContext(orderIdText: string): Promise<LiveOrderEtaContext | null> {
  const sql = getSql();
  const canonical = (await resolveCanonicalOrderIdText(orderIdText)) ?? orderIdText.trim();
  const rows = await sql<
    Array<{
      order_core_id: number;
      order_id: string;
      merchant_store_id: number;
      rider_id: number | null;
      status: string;
      current_status: string | null;
      food_status: string | null;
      prep_time_minutes: number | null;
      prep_ready_by_at: Date | string | null;
      expected_ready_at: Date | string | null;
      prepared_at: Date | string | null;
      actual_ready_at: Date | string | null;
      rider_reached_pickup_at: Date | string | null;
      reached_store_at: Date | string | null;
      rider_picked_up_at: Date | string | null;
      actual_delivery_time: Date | string | null;
      promised_eta_minutes: number | null;
      current_eta_minutes: number | null;
      eta_max_minutes: number | null;
      distance_km: string | null;
      eta_store_to_customer_minutes: number | null;
      pickup_lat: string;
      pickup_lon: string;
      drop_lat: string;
      drop_lon: string;
      placed_at: Date | string | null;
    }>
  >`
    SELECT
      oc.id AS order_core_id,
      oc.order_id,
      oc.merchant_store_id::int AS merchant_store_id,
      oc.rider_id,
      oc.status::text AS status,
      oc.current_status,
      of.order_status AS food_status,
      oc.prep_time_minutes,
      COALESCE(oc.expected_ready_at, oc.prep_ready_by_at, of.prep_ready_by_at) AS prep_ready_by_at,
      oc.expected_ready_at,
      COALESCE(oc.actual_ready_at, of.prepared_at) AS prepared_at,
      oc.actual_ready_at,
      COALESCE(oc.reached_store_at, of.rider_reached_pickup_at) AS rider_reached_pickup_at,
      oc.reached_store_at,
      COALESCE(oc.rider_picked_up_at, of.rider_picked_up_at) AS rider_picked_up_at,
      oc.actual_delivery_time,
      oc.promised_eta_minutes,
      oc.current_eta_minutes,
      oc.eta_max_minutes,
      oc.distance_km::text,
      oc.eta_store_to_customer_minutes,
      oc.pickup_lat::text,
      oc.pickup_lon::text,
      oc.drop_lat::text,
      oc.drop_lon::text,
      oc.placed_at
    FROM orders_core oc
    LEFT JOIN orders_food of ON of.order_id = oc.id
    WHERE oc.order_id = ${canonical}
    LIMIT 1
  `;
  const r = rows[0];
  if (!r?.order_id) return null;

  let routeKm = r.distance_km != null ? Number(r.distance_km) : 0;
  let routeMinutes = r.eta_store_to_customer_minutes ?? 0;

  if (routeMinutes <= 0) {
    const env = getEnv();
    try {
      const route = await getRoute({
        origin: { lat: Number(r.pickup_lat), lng: Number(r.pickup_lon) },
        destination: { lat: Number(r.drop_lat), lng: Number(r.drop_lon) },
        profile: "driving",
        mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
        osrmBaseUrl: env.OSRM_BASE_URL || undefined,
      });
      if (route.distanceKm > 0) routeKm = route.distanceKm;
      if (route.etaMinutes > 0) routeMinutes = route.etaMinutes;
    } catch {
      routeMinutes = Math.max(5, Math.round((routeKm / 18) * 60));
    }
  }

  return {
    orderCoreId: r.order_core_id,
    orderIdText: r.order_id,
    merchantStoreId: r.merchant_store_id,
    riderId: r.rider_id,
    status: r.status,
    currentStatus: r.current_status,
    foodStatus: r.food_status,
    prepTimeMinutes: r.prep_time_minutes,
    prepReadyByAt: toDate(r.prep_ready_by_at),
    preparedAt: toDate(r.prepared_at),
    riderReachedPickupAt: toDate(r.rider_reached_pickup_at),
    pickedUpAt: toDate(r.rider_picked_up_at),
    deliveredAt: toDate(r.actual_delivery_time),
    promisedEtaMinutes: r.promised_eta_minutes ?? r.eta_max_minutes,
    currentEtaMinutes: r.current_eta_minutes,
    routeMinutes,
    routeKm,
    pickupLat: Number(r.pickup_lat),
    pickupLon: Number(r.pickup_lon),
    dropLat: Number(r.drop_lat),
    dropLon: Number(r.drop_lon),
    placedAt: toDate(r.placed_at),
  };
}

async function buildEngineSnap(ctx: LiveOrderEtaContext, now: Date): Promise<EtaSnapshot> {
  const noPrep = isPickedUp(ctx) || isReady(ctx);
  const prepMinutes = noPrep
    ? 0
    : ctx.prepTimeMinutes != null && ctx.prepTimeMinutes > 0
      ? ctx.prepTimeMinutes
      : await resolveBlendedStorePrepMinutes(ctx.merchantStoreId);

  const activeOrders = noPrep ? 0 : await getActiveOrdersForStore(ctx.merchantStoreId);
  const hasRider = ctx.riderId != null && ctx.riderId > 0;

  return computeEta({
    items: noPrep ? [{ kptMinutes: 0, quantity: 1 }] : [{ kptMinutes: prepMinutes, quantity: 1 }],
    fallbackPrepMinutes: prepMinutes,
    routeMinutes: ctx.routeMinutes,
    routeKm: ctx.routeKm,
    activeOrdersAtStore: activeOrders,
    riderAssigned: hasRider,
    riderAssignmentDelayMinutes: hasRider ? 0 : undefined,
    now,
  });
}

function snapWithLiveMinutes(snap: EtaSnapshot, liveMinutes: number, now: Date): EtaSnapshot {
  const livePromisedAt = new Date(now.getTime() + liveMinutes * 60_000).toISOString();
  return {
    ...snap,
    etaMinMinutes: liveMinutes,
    etaMaxMinutes: liveMinutes,
    promisedDeliveryAt: livePromisedAt,
  };
}

export type LiveEtaRunResult = {
  orderIdText: string;
  currentEtaMinutes: number;
  merchantDelayed: boolean;
  merchantDelayMinutes: number;
  riderWaitMinutes: number;
  changed: boolean;
  customer: ReturnType<typeof resolveCustomerEtaContext>;
  stageAware: StageAwareEta;
};

export async function runLiveEtaForOrder(
  orderIdText: string,
  reason: EtaRecalcReason = "STATUS_CHANGE"
): Promise<LiveEtaRunResult | null> {
  const ctx = await loadLiveOrderEtaContext(orderIdText);
  if (!ctx || !isOrderActive(ctx)) return null;

  const now = new Date();
  const delay = detectMerchantDelay(ctx, now);
  const riderWaitMinutes = computeRiderWaitMinutes(ctx, now);
  const baseSnap = await buildEngineSnap(ctx, now);
  const legs = computeLiveEtaLegs(ctx, baseSnap, now);
  const liveMinutes = legs.total;
  const liveSnap = snapWithLiveMinutes(baseSnap, liveMinutes, now);
  const livePromisedAt = liveSnap.promisedDeliveryAt;
  const effectiveReason: EtaRecalcReason =
    delay.delayed && (reason === "STATUS_CHANGE" || reason === "LIVE_TICK")
      ? "MERCHANT_DELAY"
      : reason;

  const prevMeta = await getLatestEtaHistoryMeta(orderIdText);
  const prevVersion = prevMeta?.id ?? 1;

  const stageAwareDraft = buildStageAwareFromContext(ctx, legs, {
    merchantDelayed: delay.delayed,
    etaSource: delay.delayed ? "MERCHANT_DELAY" : (effectiveReason as EtaSource),
    promisedAt: livePromisedAt,
    etaVersion: prevVersion,
  });

  const orderStatus = normalizeStatus(ctx.currentStatus, ctx.foodStatus, ctx.status);
  const customerDraft = resolveCustomerEtaContext({
    orderStatus,
    currentEtaMinutes: stageAwareDraft.displayEta ?? liveMinutes,
    promisedEtaMinutes: ctx.promisedEtaMinutes,
    merchantDelayed: delay.delayed,
    hasRider: ctx.riderId != null && ctx.riderId > 0,
    riderAtStore: ctx.riderReachedPickupAt != null,
    isReady: isReady(ctx),
    isPickedUp: isPickedUp(ctx),
  });

  const fingerprint = etaMeaningfulFingerprint(stageAwareDraft, customerDraft, {
    orderStatus,
    // Boolean delay only — do not include growing delay minutes (would spam audits).
    merchantDelayMinutes: delay.delayed ? 1 : 0,
  });
  const appendHistory = shouldAppendEtaHistory({
    reason: effectiveReason,
    prevFingerprint: prevMeta?.fingerprint,
    nextFingerprint: fingerprint,
    prevStage: prevMeta?.stageAware?.currentStage ?? null,
    nextStage: stageAwareDraft.currentStage,
    prevDisplayEta: prevMeta?.stageAware?.displayEta ?? null,
    nextDisplayEta: stageAwareDraft.displayEta ?? liveMinutes,
    hasPriorHistory: prevMeta != null,
  });

  const sql = getSql();
  const clocksChanged =
    ctx.currentEtaMinutes == null ||
    Math.abs((ctx.currentEtaMinutes ?? 0) - liveMinutes) >= 1;

  // Heartbeat live clocks without spamming order_eta_history on countdown ticks.
  if (appendHistory || clocksChanged || effectiveReason === "LIVE_TICK") {
    await sql`
      UPDATE orders_core
      SET
        current_eta_minutes = ${liveMinutes},
        live_promised_delivery_at = ${livePromisedAt}::timestamptz,
        live_eta_updated_at = ${now.toISOString()}::timestamptz,
        -- Current / revised ETA clock (First ETA first_eta_at is never touched here).
        estimated_delivery_time = ${livePromisedAt}::timestamptz,
        merchant_delayed = ${delay.delayed},
        merchant_delay_minutes = ${delay.delayMinutes},
        merchant_delay_reason = ${delay.reason},
        rider_wait_minutes = ${riderWaitMinutes > 0 ? riderWaitMinutes : null},
        expected_ready_at = COALESCE(expected_ready_at, prep_ready_by_at),
        reached_store_at = COALESCE(reached_store_at, ${ctx.riderReachedPickupAt?.toISOString() ?? null}::timestamptz),
        actual_ready_at = COALESCE(actual_ready_at, ${ctx.preparedAt?.toISOString() ?? null}::timestamptz)
      WHERE order_id = ${orderIdText}
    `;
  }

  if (!appendHistory) {
    return {
      orderIdText,
      currentEtaMinutes: liveMinutes,
      merchantDelayed: delay.delayed,
      merchantDelayMinutes: delay.delayMinutes,
      riderWaitMinutes,
      changed: false,
      customer: customerDraft,
      stageAware: { ...stageAwareDraft, etaVersion: prevVersion },
    };
  }

  const historyId = await appendEtaRecalc({
    orderIdText,
    newSnap: liveSnap,
    reason: effectiveReason,
    riderId: ctx.riderId,
    merchantStoreId: ctx.merchantStoreId,
    stageAware: stageAwareDraft,
    customer: customerDraft,
    fingerprint,
    previousStageAware: prevMeta?.stageAware ?? null,
    orderStatus,
  });

  const etaVersion = historyId ?? prevVersion + 1;
  const stageAware: StageAwareEta = {
    ...stageAwareDraft,
    etaVersion,
    lastUpdatedAt: now.toISOString(),
  };
  const customer = {
    ...customerDraft,
    etaUpdated: true,
  };

  void publishEtaUpdated({
    orderIdText,
    riderId: ctx.riderId,
    payload: {
      etaVersion,
      reason: effectiveReason,
      customer,
      stageAware,
      livePromisedDeliveryAt: livePromisedAt,
      prepReadyByAt: ctx.prepReadyByAt ? ctx.prepReadyByAt.toISOString() : null,
      prepMinutes: ctx.prepTimeMinutes ?? null,
      currentEtaMinutes: liveMinutes,
    },
  }).catch(() => {});

  if (riderWaitMinutes >= 5 && !isReady(ctx)) {
    void processRiderWaitEscalations({
      orderCoreId: ctx.orderCoreId,
      orderIdText,
      merchantStoreId: ctx.merchantStoreId,
      riderId: ctx.riderId,
      riderWaitMinutes,
    });
    // Step 4: rider continue/cancel decision prompt. Re-asks every 10 min for up to 30 min,
    // then STOPS — never auto-cancels. The processor gates internally on its own threshold.
    void processRiderWaitDecisionPrompt({
      orderCoreId: ctx.orderCoreId,
      orderIdText,
      riderId: ctx.riderId,
      riderWaitMinutes,
    });
  }

  // Free-wait PRIORITY push — works even when order is already READY (handover delay).
  if (ctx.riderReachedPickupAt && !isPickedUp(ctx)) {
    void processRiderFreeWaitPriority({
      orderCoreId: ctx.orderCoreId,
      orderIdText,
      merchantStoreId: ctx.merchantStoreId,
      riderId: ctx.riderId,
      riderReachedPickupAt: ctx.riderReachedPickupAt,
      pickedUpAt: ctx.pickedUpAt,
      now,
    });
  }

  return {
    orderIdText,
    currentEtaMinutes: liveMinutes,
    merchantDelayed: delay.delayed,
    merchantDelayMinutes: delay.delayMinutes,
    riderWaitMinutes,
    changed: true,
    customer,
    stageAware,
  };
}

export async function recordDeliveryEtaAccuracy(orderIdText: string): Promise<void> {
  const ctx = await loadLiveOrderEtaContext(orderIdText);
  if (!ctx?.deliveredAt || !ctx.placedAt) return;

  const promised = ctx.promisedEtaMinutes ?? ctx.currentEtaMinutes ?? 0;
  if (promised <= 0) return;

  const actualMinutes = Math.round(
    (ctx.deliveredAt.getTime() - ctx.placedAt.getTime()) / 60_000
  );
  const delta = actualMinutes - promised;

  const sql = getSql();
  try {
    const meta = await sql<
      Array<{ merchant_delayed: boolean; merchant_delay_minutes: number; rider_wait_minutes: number | null }>
    >`
      SELECT merchant_delayed, merchant_delay_minutes, rider_wait_minutes
      FROM orders_core
      WHERE order_id = ${orderIdText}
      LIMIT 1
    `;
    const m = meta[0];
    await sql`
      INSERT INTO order_eta_accuracy_snapshots (
        order_id, order_id_text, merchant_store_id,
        promised_eta_minutes, actual_delivery_minutes, delta_minutes,
        merchant_delayed, merchant_delay_minutes, rider_wait_minutes,
        delivered_on_time, delivered_faster_than_promised
      ) VALUES (
        ${ctx.orderCoreId},
        ${orderIdText},
        ${ctx.merchantStoreId},
        ${promised},
        ${actualMinutes},
        ${delta},
        ${m?.merchant_delayed ?? false},
        ${m?.merchant_delay_minutes ?? 0},
        ${m?.rider_wait_minutes ?? null},
        ${Math.abs(delta) <= 2},
        ${delta < -2}
      )
    `;
  } catch {
    /* table may not exist yet during rollout */
  }
}
