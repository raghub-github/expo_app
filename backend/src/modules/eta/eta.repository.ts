/**
 * ETA persistence — freezes the v2 snapshot on orders_core at placement
 * and appends recalc rows to order_eta_history for every subsequent change.
 *
 * Critical invariant: the promise columns on orders_core are written ONCE on
 * placement and never overwritten. Recalculations update tracking ETA via
 * history rows only. This way support / disputes can always answer
 * "what did we promise" by reading orders_core directly.
 *
 * Also freezes `first_eta_at` (dashboard First ETA / SLA) from the same
 * promisedDeliveryAt — COALESCE so accept/dispatch/live recalc never replace it.
 *
 * The repository writes BOTH the v1 columns (eta_min_minutes, etc.) AND the
 * v2 columns (eta_food_prep_minutes, eta_kitchen_load_buffer_minutes, etc.).
 * v1 audit queries that already point at `eta_*` keep working; new analytics
 * use the richer v2 fields.
 */

import { getSql } from "../../db/client.js";
import { ETA_ENGINE_VERSION, type EtaSnapshot } from "./eta.engine.js";
import {
  resolveCustomerEtaContext,
  MIN_ACTIVE_ETA,
  type CustomerEtaView,
} from "./eta.customer-view.js";
import {
  resolveOperationalStage,
  resolveStageAwareEta,
  type StageAwareEta,
} from "./eta.stage-aware.js";
import { parseStageAwareFromHistoryMetadata } from "./eta.realtime.js";
import { resolveCanonicalOrderIdText } from "./eta.order-ref.js";

export type EtaRecalcReason =
  | "ORDER_PLACED"
  | "RIDER_ASSIGNED"
  | "RIDER_PICKED_UP"
  | "TRAFFIC_UPDATE"
  | "WEATHER_UPDATE"
  | "MERCHANT_DELAY"
  | "BATCHING_CHANGE"
  | "MANUAL_OVERRIDE"
  | "STATUS_CHANGE"
  /** Periodic live refresh — must not spam order_eta_history on countdown ticks. */
  | "LIVE_TICK";

/**
 * Write the v2 snapshot to orders_core. v1 columns are populated by mapping
 * v2 → v1 (delay-style fields = base × (multiplier − 1)) so any analytics
 * still keyed off the v1 schema continues to work.
 */
export async function writeEtaPromiseToOrder(
  orderIdText: string,
  snap: EtaSnapshot,
  metadata?: { mapboxRouteId?: string | null; routeSnapshot?: unknown },
): Promise<void> {
  const sql = getSql();

  // v1-shaped delay decomposition derived from v2 multipliers so the legacy
  // columns reflect roughly the same story.
  const baseTravel = snap.breakdown.travelMinutes;
  const trafficDelay = Math.max(
    0,
    Math.round(baseTravel - baseTravel / Math.max(1, snap.multipliers.traffic)),
  );
  const weatherDelay = Math.max(
    0,
    Math.round(baseTravel - baseTravel / Math.max(1, snap.multipliers.weather)),
  );
  const congestionDelay = Math.max(
    0,
    Math.round((snap.breakdown.adjustedEtaMinutes ?? 0) - (snap.breakdown.criticalPathMinutes +
      snap.breakdown.pickupBufferMinutes +
      snap.breakdown.travelMinutes +
      snap.breakdown.apartmentBufferMinutes)),
  );

  await sql`
    UPDATE orders_core
    SET
      -- v1 promise columns — COALESCE so a second freeze (client + webhook) never
      -- replaces the original customer promise.
      eta_min_minutes               = COALESCE(eta_min_minutes, ${snap.etaMinMinutes}),
      eta_max_minutes               = COALESCE(eta_max_minutes, ${snap.etaMaxMinutes}),
      promised_delivery_at          = COALESCE(promised_delivery_at, ${snap.promisedDeliveryAt}::timestamptz),
      eta_generated_at              = COALESCE(eta_generated_at, ${snap.generatedAt}::timestamptz),
      eta_buffer_minutes            = COALESCE(eta_buffer_minutes, ${snap.breakdown.uncertaintyMarginMinutes}),
      eta_prep_minutes              = COALESCE(eta_prep_minutes, ${snap.breakdown.foodPrepMinutes}),
      eta_rider_assignment_minutes  = COALESCE(eta_rider_assignment_minutes, ${snap.breakdown.riderAssignmentMinutes}),
      eta_rider_to_store_minutes    = COALESCE(eta_rider_to_store_minutes, ${snap.breakdown.riderToStoreMinutes}),
      eta_store_to_customer_minutes = COALESCE(eta_store_to_customer_minutes, ${snap.breakdown.travelMinutes}),
      eta_traffic_delay_minutes     = COALESCE(eta_traffic_delay_minutes, ${trafficDelay}),
      eta_weather_delay_minutes     = COALESCE(eta_weather_delay_minutes, ${weatherDelay}),
      eta_congestion_delay_minutes  = COALESCE(eta_congestion_delay_minutes, ${congestionDelay}),
      eta_route_distance_km         = COALESCE(eta_route_distance_km, ${snap.routeKm.toFixed(2)}),
      eta_confidence_score          = COALESCE(eta_confidence_score, ${snap.confidenceScore.toFixed(2)}),
      eta_version                   = COALESCE(eta_version, 2),
      eta_mapbox_route_id           = COALESCE(eta_mapbox_route_id, ${metadata?.mapboxRouteId ?? null}),
      eta_route_snapshot            = COALESCE(eta_route_snapshot, ${JSON.stringify(metadata?.routeSnapshot ?? {})}::jsonb),
      eta_metadata                  = COALESCE(eta_metadata, ${JSON.stringify({ engineVersion: snap.engineVersion, ...snap.context })}::jsonb),

      -- v2 critical-path breakdown (immutable after first freeze)
      eta_food_prep_minutes          = COALESCE(eta_food_prep_minutes, ${snap.breakdown.foodPrepMinutes}),
      eta_kitchen_load_buffer_minutes = COALESCE(eta_kitchen_load_buffer_minutes, ${snap.breakdown.kitchenLoadBufferMinutes}),
      eta_pickup_buffer_minutes      = COALESCE(eta_pickup_buffer_minutes, ${snap.breakdown.pickupBufferMinutes}),
      eta_apartment_buffer_minutes   = COALESCE(eta_apartment_buffer_minutes, ${snap.breakdown.apartmentBufferMinutes}),
      eta_rider_arrival_minutes      = COALESCE(eta_rider_arrival_minutes, ${snap.breakdown.riderArrivalMinutes}),
      eta_critical_path_minutes      = COALESCE(eta_critical_path_minutes, ${snap.breakdown.criticalPathMinutes}),
      eta_traffic_multiplier         = COALESCE(eta_traffic_multiplier, ${snap.multipliers.traffic.toFixed(3)}),
      eta_weather_multiplier         = COALESCE(eta_weather_multiplier, ${snap.multipliers.weather.toFixed(3)}),
      eta_peak_hour_multiplier       = COALESCE(eta_peak_hour_multiplier, ${snap.multipliers.peakHour.toFixed(3)}),
      eta_weather_state              = COALESCE(eta_weather_state, ${snap.context.weather}),
      eta_peak_window                = COALESCE(eta_peak_window, ${snap.context.peakWindow}),
      eta_drop_context               = COALESCE(eta_drop_context, ${snap.context.dropContext}),
      eta_engine_version             = COALESCE(eta_engine_version, ${snap.engineVersion}),
      eta_v2_metadata                = COALESCE(eta_v2_metadata, ${JSON.stringify(snap)}::jsonb),

      promised_eta_minutes           = COALESCE(promised_eta_minutes, ${snap.etaMaxMinutes}),
      -- Seed current ETA once; live engine owns later revisions.
      current_eta_minutes            = COALESCE(current_eta_minutes, ${snap.etaMaxMinutes}),
      live_promised_delivery_at      = COALESCE(live_promised_delivery_at, ${snap.promisedDeliveryAt}::timestamptz),
      live_eta_updated_at            = COALESCE(live_eta_updated_at, NOW()),

      -- Immutable First ETA snapshot at placement (never overwrite if already set).
      first_eta_at                   = COALESCE(first_eta_at, ${snap.promisedDeliveryAt}::timestamptz),
      -- Seed current/revised ETA clock once; accept/live paths may revise later.
      estimated_delivery_time        = COALESCE(estimated_delivery_time, ${snap.promisedDeliveryAt}::timestamptz)
    WHERE order_id = ${orderIdText}
  `;
}

/**
 * Append a recalculation row. Reads the order's current (promise) ETA from
 * orders_core so the diff in the history row is meaningful.
 */
export async function appendEtaRecalc(args: {
  orderIdText: string;
  newSnap: EtaSnapshot;
  reason: EtaRecalcReason;
  riderId?: number | null;
  merchantStoreId?: number | null;
  /** Persisted for meaningful-change detection + WS consumers. */
  stageAware?: StageAwareEta | null;
  customer?: CustomerEtaView | null;
  fingerprint?: string | null;
  /** Previous stageAware for immutable audit delta. */
  previousStageAware?: StageAwareEta | null;
  previousCustomer?: CustomerEtaView | null;
  orderStatus?: string | null;
}): Promise<number | null> {
  const sql = getSql();
  let rows: Array<{
    id: number;
    eta_min_minutes: number | null;
    eta_max_minutes: number | null;
    promised_delivery_at: Date | string | null;
    current_eta_minutes: number | null;
    current_status: string | null;
    status: string | null;
  }>;
  try {
    rows = await sql`
      SELECT id, eta_min_minutes, eta_max_minutes, promised_delivery_at,
             current_eta_minutes, current_status, status::text AS status
      FROM orders_core
      WHERE order_id = ${args.orderIdText}
      LIMIT 1
    `;
  } catch {
    rows = await sql`
      SELECT id, eta_min_minutes, eta_max_minutes, promised_delivery_at,
             NULL::int AS current_eta_minutes,
             current_status, status::text AS status
      FROM orders_core
      WHERE order_id = ${args.orderIdText}
      LIMIT 1
    `;
  }
  const row = rows[0];
  if (!row) {
    console.warn("[eta] appendEtaRecalc: order not found", args.orderIdText);
    return null;
  }
  const prevPromisedIso =
    row.promised_delivery_at instanceof Date
      ? row.promised_delivery_at.toISOString()
      : typeof row.promised_delivery_at === "string"
        ? row.promised_delivery_at
        : null;

  const snap = args.newSnap;
  const orderStatusRaw =
    args.orderStatus ??
    String(row.current_status ?? row.status ?? "")
      .trim()
      .toUpperCase();
  const orderStatus = orderStatusRaw || null;

  const newDisplay =
    args.stageAware?.displayEta ??
    args.customer?.etaMinutes ??
    snap.etaMaxMinutes;
  const oldDisplay =
    args.previousStageAware?.displayEta ??
    args.previousCustomer?.etaMinutes ??
    row.current_eta_minutes ??
    row.eta_max_minutes;
  const deltaMinutes =
    oldDisplay != null && newDisplay != null
      ? Math.round(Number(newDisplay) - Number(oldDisplay))
      : null;

  const previousSnapshot = {
    stageAware: args.previousStageAware ?? null,
    customer: args.previousCustomer ?? null,
    displayEta: oldDisplay ?? null,
    totalEta: args.previousStageAware?.totalEta ?? oldDisplay ?? null,
    orderStatus,
  };
  const newSnapshot = {
    stageAware: args.stageAware ?? null,
    customer: args.customer ?? null,
    displayEta: newDisplay ?? null,
    totalEta: args.stageAware?.totalEta ?? snap.etaMaxMinutes,
    orderStatus,
  };

  const metadata = {
    engineVersion: snap.engineVersion,
    breakdown: snap.breakdown,
    multipliers: snap.multipliers,
    context: snap.context,
    orderStatus,
    deltaMinutes,
    previous: previousSnapshot,
    new: newSnapshot,
    ...(args.stageAware ? { stageAware: args.stageAware } : {}),
    ...(args.customer ? { customer: args.customer } : {}),
    ...(args.fingerprint ? { fingerprint: args.fingerprint } : {}),
    ...(args.previousStageAware
      ? { previousStageAware: args.previousStageAware }
      : {}),
  };

  const baseValues = {
    orderId: row.id,
    orderIdText: args.orderIdText,
    oldMin: row.eta_min_minutes,
    oldMax: row.eta_max_minutes,
    newMin: snap.etaMinMinutes,
    newMax: snap.etaMaxMinutes,
    prevPromised: prevPromisedIso,
    newPromised: snap.promisedDeliveryAt,
    reason: args.reason,
    prep: snap.breakdown.foodPrepMinutes,
    assign: snap.breakdown.riderAssignmentMinutes,
    toStore: snap.breakdown.riderToStoreMinutes,
    travel: snap.breakdown.travelMinutes,
    traffic: Math.max(
      0,
      Math.round(snap.breakdown.travelMinutes * (snap.multipliers.traffic - 1))
    ),
    weather: Math.max(
      0,
      Math.round(snap.breakdown.travelMinutes * (snap.multipliers.weather - 1))
    ),
    buffer: snap.breakdown.uncertaintyMarginMinutes,
    riderId: args.riderId ?? null,
    storeId: args.merchantStoreId ?? null,
    routeKm: snap.routeKm.toFixed(2),
    metaJson: JSON.stringify(metadata),
  };

  try {
    const inserted = await sql<Array<{ id: number }>>`
      INSERT INTO order_eta_history (
        order_id, order_id_text,
        old_eta_min, old_eta_max,
        new_eta_min, new_eta_max,
        promised_delivery_at, new_promised_delivery_at,
        recalc_reason,
        prep_minutes, rider_assignment_minutes,
        rider_to_store_minutes, store_to_customer_minutes,
        traffic_delay_minutes, weather_delay_minutes, congestion_delay_minutes,
        buffer_minutes,
        rider_id, merchant_store_id,
        route_distance_km, route_snapshot, metadata,
        order_status, current_stage, display_eta_minutes, total_eta_minutes,
        confidence, freeze_countdown, eta_source, delta_minutes,
        previous_snapshot, new_snapshot
      ) VALUES (
        ${baseValues.orderId}, ${baseValues.orderIdText},
        ${baseValues.oldMin}, ${baseValues.oldMax},
        ${baseValues.newMin}, ${baseValues.newMax},
        ${baseValues.prevPromised},
        ${baseValues.newPromised},
        ${baseValues.reason},
        ${baseValues.prep},
        ${baseValues.assign},
        ${baseValues.toStore},
        ${baseValues.travel},
        ${baseValues.traffic},
        ${baseValues.weather},
        0,
        ${baseValues.buffer},
        ${baseValues.riderId},
        ${baseValues.storeId},
        ${baseValues.routeKm},
        ${JSON.stringify({})}::jsonb,
        ${baseValues.metaJson}::jsonb,
        ${orderStatus},
        ${args.stageAware?.currentStage ?? null},
        ${newDisplay != null ? Math.round(Number(newDisplay)) : null},
        ${args.stageAware?.totalEta ?? snap.etaMaxMinutes},
        ${args.stageAware?.confidence ?? null},
        ${args.stageAware?.freezeCountdown ?? null},
        ${args.stageAware?.etaSource ?? args.reason},
        ${deltaMinutes},
        ${JSON.stringify(previousSnapshot)}::jsonb,
        ${JSON.stringify(newSnapshot)}::jsonb
      )
      RETURNING id
    `;
    const historyId = inserted[0]?.id ?? null;
    if (historyId != null) {
      await stampEtaVersionOnHistoryRow(sql, historyId);
    }
    return historyId;
  } catch (err) {
    const msg = String(err);
    if (!/order_status|current_stage|display_eta_minutes|previous_snapshot|does not exist|42703/i.test(msg)) {
      throw err;
    }
    // Pre-migration fallback — metadata still holds the full audit.
    const inserted = await sql<Array<{ id: number }>>`
      INSERT INTO order_eta_history (
        order_id, order_id_text,
        old_eta_min, old_eta_max,
        new_eta_min, new_eta_max,
        promised_delivery_at, new_promised_delivery_at,
        recalc_reason,
        prep_minutes, rider_assignment_minutes,
        rider_to_store_minutes, store_to_customer_minutes,
        traffic_delay_minutes, weather_delay_minutes, congestion_delay_minutes,
        buffer_minutes,
        rider_id, merchant_store_id,
        route_distance_km, route_snapshot, metadata
      ) VALUES (
        ${baseValues.orderId}, ${baseValues.orderIdText},
        ${baseValues.oldMin}, ${baseValues.oldMax},
        ${baseValues.newMin}, ${baseValues.newMax},
        ${baseValues.prevPromised},
        ${baseValues.newPromised},
        ${baseValues.reason},
        ${baseValues.prep},
        ${baseValues.assign},
        ${baseValues.toStore},
        ${baseValues.travel},
        ${baseValues.traffic},
        ${baseValues.weather},
        0,
        ${baseValues.buffer},
        ${baseValues.riderId},
        ${baseValues.storeId},
        ${baseValues.routeKm},
        ${JSON.stringify({})}::jsonb,
        ${baseValues.metaJson}::jsonb
      )
      RETURNING id
    `;
    const historyId = inserted[0]?.id ?? null;
    if (historyId != null) {
      await stampEtaVersionOnHistoryRow(sql, historyId).catch(() => {});
    }
    return historyId;
  }
}

/** Ensure nested stageAware.etaVersion equals the immutable history row id. */
async function stampEtaVersionOnHistoryRow(
  sql: ReturnType<typeof getSql>,
  historyId: number
): Promise<void> {
  try {
    await sql`
      UPDATE order_eta_history
      SET
        metadata = CASE
          WHEN metadata IS NULL THEN metadata
          ELSE jsonb_set(
            jsonb_set(
              metadata,
              '{stageAware,etaVersion}',
              to_jsonb(${historyId}::bigint),
              true
            ),
            '{new,stageAware,etaVersion}',
            to_jsonb(${historyId}::bigint),
            true
          )
        END,
        new_snapshot = CASE
          WHEN new_snapshot IS NULL THEN new_snapshot
          ELSE jsonb_set(
            new_snapshot,
            '{stageAware,etaVersion}',
            to_jsonb(${historyId}::bigint),
            true
          )
        END
      WHERE id = ${historyId}
    `;
  } catch {
    /* columns/json path may be missing on very old DBs — row id remains SoT */
  }
}

/** Latest history row id + fingerprint for version gating / dedupe. */
export async function getLatestEtaHistoryMeta(orderIdText: string): Promise<{
  id: number;
  fingerprint: string | null;
  stageAware: StageAwareEta | null;
} | null> {
  const sql = getSql();
  const rows = await sql<
    Array<{ id: number; metadata: unknown }>
  >`
    SELECT id, metadata
    FROM order_eta_history
    WHERE order_id_text = ${orderIdText}
    ORDER BY id DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
  const fingerprint =
    typeof meta?.fingerprint === "string" ? meta.fingerprint : null;
  const stageAware = parseStageAwareFromHistoryMetadata(row.metadata);
  return { id: row.id, fingerprint, stageAware };
}

/**
 * Read the full ETA picture for an order: promise (from orders_core) + the
 * most recent recalc (from order_eta_history). UI clients use this to show
 * "promised 8:42 PM · current ETA 8:38 PM" type messaging.
 */
export type OrderEtaView = {
  orderIdText: string;
  engineVersion: string;
  /** Immutable First ETA (first_eta_at → promised_delivery_at). Same across all apps. */
  firstEtaAt: string | null;
  promise: {
    minMinutes: number | null;
    maxMinutes: number | null;
    promisedDeliveryAt: string | null;
    generatedAt: string | null;
    bufferMinutes: number | null;
    routeKm: number | null;
    confidenceScore: number | null;
  };
  breakdown: {
    foodPrepMinutes: number | null;
    kitchenLoadBufferMinutes: number | null;
    pickupBufferMinutes: number | null;
    apartmentBufferMinutes: number | null;
    riderArrivalMinutes: number | null;
    criticalPathMinutes: number | null;
    travelMinutes: number | null;
  };
  multipliers: { traffic: number | null; weather: number | null; peakHour: number | null };
  context: {
    weather: string | null;
    peakWindow: string | null;
    dropContext: string | null;
  };
  live: {
    minMinutes: number;
    maxMinutes: number;
    promisedDeliveryAt: string;
    reason: string;
    createdAt: string;
  } | null;
  /** Merchant-committed prep window (set on accept). */
  prep: {
    minutes: number | null;
    readyByAt: string | null;
  };
  /** Single dynamic ETA for customer UI (v3 live engine) — stage-display minutes. */
  customer: CustomerEtaView;
  /** Enterprise stage-aware ETA model — client must prefer this over guessing. */
  stageAware: StageAwareEta;
};

function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v === "string") {
    const t = new Date(v);
    return Number.isFinite(t.getTime()) ? t.toISOString() : v;
  }
  return null;
}

type EtaOrderRow = {
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
  promised_delivery_at: Date | string | null;
  first_eta_at: Date | string | null;
  eta_generated_at: Date | string | null;
  eta_buffer_minutes: number | null;
  eta_route_distance_km: string | null;
  eta_confidence_score: string | null;
  eta_food_prep_minutes: number | null;
  eta_kitchen_load_buffer_minutes: number | null;
  eta_pickup_buffer_minutes: number | null;
  eta_apartment_buffer_minutes: number | null;
  eta_rider_arrival_minutes: number | null;
  eta_critical_path_minutes: number | null;
  eta_store_to_customer_minutes: number | null;
  eta_traffic_multiplier: string | null;
  eta_weather_multiplier: string | null;
  eta_peak_hour_multiplier: string | null;
  eta_weather_state: string | null;
  eta_peak_window: string | null;
  eta_drop_context: string | null;
  eta_engine_version: string | null;
  prep_time_minutes: number | null;
  prep_ready_by_at: Date | string | null;
  current_eta_minutes: number | null;
  promised_eta_minutes: number | null;
  merchant_delayed: boolean | null;
  merchant_delay_minutes: number | null;
  rider_wait_minutes: number | null;
  live_promised_delivery_at: Date | string | null;
  rider_id: number | null;
  status: string | null;
  current_status: string | null;
  rider_reached_pickup_at: Date | string | null;
  prepared_at: Date | string | null;
  rider_picked_up_at: Date | string | null;
};

async function loadEtaOrderRow(orderIdText: string): Promise<EtaOrderRow[]> {
  const sql = getSql();
  try {
    return await sql<EtaOrderRow[]>`
      SELECT
        eta_min_minutes, eta_max_minutes, promised_delivery_at, first_eta_at, eta_generated_at,
        eta_buffer_minutes, eta_route_distance_km, eta_confidence_score,
        eta_food_prep_minutes, eta_kitchen_load_buffer_minutes,
        eta_pickup_buffer_minutes, eta_apartment_buffer_minutes,
        eta_rider_arrival_minutes, eta_critical_path_minutes,
        eta_store_to_customer_minutes,
        eta_traffic_multiplier, eta_weather_multiplier, eta_peak_hour_multiplier,
        eta_weather_state, eta_peak_window, eta_drop_context,
        eta_engine_version,
        prep_time_minutes, prep_ready_by_at,
        current_eta_minutes, promised_eta_minutes,
        merchant_delayed, merchant_delay_minutes, rider_wait_minutes,
        live_promised_delivery_at,
        rider_id, status::text AS status, current_status,
        reached_store_at AS rider_reached_pickup_at,
        actual_ready_at AS prepared_at,
        rider_picked_up_at
      FROM orders_core
      WHERE order_id = ${orderIdText}
      LIMIT 1
    `;
  } catch (err) {
    const msg = String(err);
    if (!/reached_store_at|actual_ready_at|current_eta_minutes|live_promised_delivery_at|first_eta_at|does not exist|42703/i.test(msg)) {
      throw err;
    }
    return await sql<EtaOrderRow[]>`
      SELECT
        oc.eta_min_minutes, oc.eta_max_minutes, oc.promised_delivery_at,
        oc.promised_delivery_at AS first_eta_at, oc.eta_generated_at,
        oc.eta_buffer_minutes, oc.eta_route_distance_km, oc.eta_confidence_score,
        oc.eta_food_prep_minutes, oc.eta_kitchen_load_buffer_minutes,
        oc.eta_pickup_buffer_minutes, oc.eta_apartment_buffer_minutes,
        oc.eta_rider_arrival_minutes, oc.eta_critical_path_minutes,
        oc.eta_store_to_customer_minutes,
        oc.eta_traffic_multiplier, oc.eta_weather_multiplier, oc.eta_peak_hour_multiplier,
        oc.eta_weather_state, oc.eta_peak_window, oc.eta_drop_context,
        oc.eta_engine_version,
        oc.prep_time_minutes, oc.prep_ready_by_at,
        NULL::int AS current_eta_minutes,
        oc.promised_eta_minutes,
        NULL::boolean AS merchant_delayed,
        NULL::int AS merchant_delay_minutes,
        NULL::int AS rider_wait_minutes,
        oc.promised_delivery_at AS live_promised_delivery_at,
        oc.rider_id, oc.status::text AS status, oc.current_status,
        of.rider_reached_pickup_at AS rider_reached_pickup_at,
        of.prepared_at AS prepared_at,
        of.rider_picked_up_at AS rider_picked_up_at
      FROM orders_core oc
      LEFT JOIN orders_food of ON of.order_id = oc.id OR of.core_order_id = oc.order_id
      WHERE oc.order_id = ${orderIdText}
      LIMIT 1
    `;
  }
}

export async function getEtaForOrder(orderIdText: string): Promise<OrderEtaView | null> {
  const sql = getSql();
  const canonical = (await resolveCanonicalOrderIdText(orderIdText)) ?? orderIdText.trim();
  const rows = await loadEtaOrderRow(canonical);
  if (rows.length === 0) return null;
  const r = rows[0]!;

  const live = await sql<
    Array<{
      id: number;
      new_eta_min: number;
      new_eta_max: number;
      new_promised_delivery_at: Date | string | null;
      recalc_reason: string;
      created_at: Date | string;
    }>
  >`
    SELECT id, new_eta_min, new_eta_max, new_promised_delivery_at, recalc_reason, created_at
    FROM order_eta_history
    WHERE order_id_text = ${canonical}
    ORDER BY id DESC
    LIMIT 1
  `;

  const promisedMinutes = r.promised_eta_minutes ?? r.eta_max_minutes;
  const currentMinutes =
    r.current_eta_minutes ??
    (live.length > 0 ? Number(live[0]!.new_eta_max) : null) ??
    promisedMinutes;

  const orderStatus = String(r.current_status ?? r.status ?? "").trim().toUpperCase();
  const hasRider = r.rider_id != null && r.rider_id > 0;
  const riderAtStore = r.rider_reached_pickup_at != null;
  const isReady =
    r.prepared_at != null || orderStatus === "READY_FOR_PICKUP" || orderStatus === "READY";
  const isPickedUp =
    r.rider_picked_up_at != null ||
    orderStatus === "OUT_FOR_DELIVERY" ||
    orderStatus === "IN_TRANSIT" ||
    orderStatus === "PICKED_UP";
  const delivered = orderStatus === "DELIVERED";

  const travel = Math.max(
    MIN_ACTIVE_ETA,
    Number(r.eta_store_to_customer_minutes ?? promisedMinutes ?? MIN_ACTIVE_ETA)
  );
  const remainingPrep =
    !isReady && !isPickedUp
      ? Math.max(
          MIN_ACTIVE_ETA,
          Number(r.prep_time_minutes ?? r.eta_food_prep_minutes ?? MIN_ACTIVE_ETA)
        )
      : 0;
  const pickupLeg = isPickedUp
    ? 0
    : riderAtStore
      ? 2
      : hasRider
        ? Math.max(MIN_ACTIVE_ETA, Number(r.eta_rider_arrival_minutes ?? 4))
        : isReady
          ? 6
          : 0;

  const legs = {
    remainingPrep,
    pickupLeg,
    travelLeg: travel,
    total: Math.max(
      MIN_ACTIVE_ETA,
      Number(currentMinutes ?? remainingPrep + pickupLeg + travel)
    ),
  };

  const stage = resolveOperationalStage({
    delivered,
    pickedUp: isPickedUp,
    ready: isReady,
    hasRider,
    riderAtStore,
    arrivingSoon: isPickedUp && Number(currentMinutes ?? 99) <= 2,
  });

  const liveCreatedAt = live.length > 0 ? toIsoOrNull(live[0]!.created_at) : null;
  const stageAware = resolveStageAwareEta({
    stage,
    legs,
    merchantDelayed: r.merchant_delayed === true,
    confidenceScore: r.eta_confidence_score == null ? null : Number(r.eta_confidence_score),
    etaSource: live.length > 0 ? (String(live[0]!.recalc_reason) as StageAwareEta["etaSource"]) : "INITIAL_ESTIMATE",
    promisedAt: toIsoOrNull(r.first_eta_at) ?? toIsoOrNull(r.promised_delivery_at),
    lastUpdatedAt: liveCreatedAt ?? toIsoOrNull(r.eta_generated_at) ?? new Date().toISOString(),
    etaVersion: live.length > 0 ? Number(live[0]!.id) : 1,
  });

  const customer = resolveCustomerEtaContext({
    orderStatus,
    currentEtaMinutes: stageAware.displayEta ?? currentMinutes,
    promisedEtaMinutes: promisedMinutes,
    merchantDelayed: r.merchant_delayed === true,
    hasRider,
    riderAtStore,
    isReady,
    isPickedUp,
  });

  const firstEtaAt =
    toIsoOrNull(r.first_eta_at) ?? toIsoOrNull(r.promised_delivery_at);

  return {
    orderIdText: canonical,
    engineVersion: r.eta_engine_version ?? ETA_ENGINE_VERSION,
    firstEtaAt,
    promise: {
      minMinutes: r.eta_min_minutes,
      maxMinutes: r.eta_max_minutes,
      // Immutable original promise — prefer first_eta_at for all app surfaces.
      promisedDeliveryAt: firstEtaAt,
      generatedAt: toIsoOrNull(r.eta_generated_at),
      bufferMinutes: r.eta_buffer_minutes,
      routeKm: r.eta_route_distance_km == null ? null : Number(r.eta_route_distance_km),
      confidenceScore: r.eta_confidence_score == null ? null : Number(r.eta_confidence_score),
    },
    breakdown: {
      foodPrepMinutes: r.eta_food_prep_minutes,
      kitchenLoadBufferMinutes: r.eta_kitchen_load_buffer_minutes,
      pickupBufferMinutes: r.eta_pickup_buffer_minutes,
      apartmentBufferMinutes: r.eta_apartment_buffer_minutes,
      riderArrivalMinutes: r.eta_rider_arrival_minutes,
      criticalPathMinutes: r.eta_critical_path_minutes,
      travelMinutes: r.eta_store_to_customer_minutes,
    },
    multipliers: {
      traffic: r.eta_traffic_multiplier == null ? null : Number(r.eta_traffic_multiplier),
      weather: r.eta_weather_multiplier == null ? null : Number(r.eta_weather_multiplier),
      peakHour: r.eta_peak_hour_multiplier == null ? null : Number(r.eta_peak_hour_multiplier),
    },
    context: {
      weather: r.eta_weather_state,
      peakWindow: r.eta_peak_window,
      dropContext: r.eta_drop_context,
    },
    live:
      live.length > 0
        ? {
            minMinutes: Number(live[0]!.new_eta_min),
            maxMinutes: Number(live[0]!.new_eta_max),
            promisedDeliveryAt: toIsoOrNull(live[0]!.new_promised_delivery_at) ?? "",
            reason: String(live[0]!.recalc_reason),
            createdAt: toIsoOrNull(live[0]!.created_at) ?? "",
          }
        : null,
    prep: {
      minutes:
        r.prep_time_minutes != null && Number(r.prep_time_minutes) > 0
          ? Number(r.prep_time_minutes)
          : null,
      readyByAt: toIsoOrNull(r.prep_ready_by_at),
    },
    customer,
    stageAware,
  };
}
