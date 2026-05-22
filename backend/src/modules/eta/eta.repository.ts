/**
 * ETA persistence — freezes the v2 snapshot on orders_core at placement
 * and appends recalc rows to order_eta_history for every subsequent change.
 *
 * Critical invariant: the promise columns on orders_core are written ONCE on
 * placement and never overwritten. Recalculations update tracking ETA via
 * history rows only. This way support / disputes can always answer
 * "what did we promise" by reading orders_core directly.
 *
 * The repository writes BOTH the v1 columns (eta_min_minutes, etc.) AND the
 * v2 columns (eta_food_prep_minutes, eta_kitchen_load_buffer_minutes, etc.).
 * v1 audit queries that already point at `eta_*` keep working; new analytics
 * use the richer v2 fields.
 */

import { getSql } from "../../db/client.js";
import { ETA_ENGINE_VERSION, type EtaSnapshot } from "./eta.engine.js";

export type EtaRecalcReason =
  | "ORDER_PLACED"
  | "RIDER_ASSIGNED"
  | "RIDER_PICKED_UP"
  | "TRAFFIC_UPDATE"
  | "WEATHER_UPDATE"
  | "MERCHANT_DELAY"
  | "BATCHING_CHANGE"
  | "MANUAL_OVERRIDE"
  | "STATUS_CHANGE";

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
      -- v1 promise columns (kept for backwards-compat audit queries)
      eta_min_minutes               = ${snap.etaMinMinutes},
      eta_max_minutes               = ${snap.etaMaxMinutes},
      promised_delivery_at          = ${snap.promisedDeliveryAt},
      eta_generated_at              = ${snap.generatedAt},
      eta_buffer_minutes            = ${snap.breakdown.uncertaintyMarginMinutes},
      eta_prep_minutes              = ${snap.breakdown.foodPrepMinutes},
      eta_rider_assignment_minutes  = ${snap.breakdown.riderAssignmentMinutes},
      eta_rider_to_store_minutes    = ${snap.breakdown.riderToStoreMinutes},
      eta_store_to_customer_minutes = ${snap.breakdown.travelMinutes},
      eta_traffic_delay_minutes     = ${trafficDelay},
      eta_weather_delay_minutes     = ${weatherDelay},
      eta_congestion_delay_minutes  = ${congestionDelay},
      eta_route_distance_km         = ${snap.routeKm.toFixed(2)},
      eta_confidence_score          = ${snap.confidenceScore.toFixed(2)},
      eta_version                   = 2,
      eta_mapbox_route_id           = ${metadata?.mapboxRouteId ?? null},
      eta_route_snapshot            = ${JSON.stringify(metadata?.routeSnapshot ?? {})}::jsonb,
      eta_metadata                  = ${JSON.stringify({ engineVersion: snap.engineVersion, ...snap.context })}::jsonb,

      -- v2 critical-path breakdown
      eta_food_prep_minutes          = ${snap.breakdown.foodPrepMinutes},
      eta_kitchen_load_buffer_minutes = ${snap.breakdown.kitchenLoadBufferMinutes},
      eta_pickup_buffer_minutes      = ${snap.breakdown.pickupBufferMinutes},
      eta_apartment_buffer_minutes   = ${snap.breakdown.apartmentBufferMinutes},
      eta_rider_arrival_minutes      = ${snap.breakdown.riderArrivalMinutes},
      eta_critical_path_minutes      = ${snap.breakdown.criticalPathMinutes},
      eta_traffic_multiplier         = ${snap.multipliers.traffic.toFixed(3)},
      eta_weather_multiplier         = ${snap.multipliers.weather.toFixed(3)},
      eta_peak_hour_multiplier       = ${snap.multipliers.peakHour.toFixed(3)},
      eta_weather_state              = ${snap.context.weather},
      eta_peak_window                = ${snap.context.peakWindow},
      eta_drop_context               = ${snap.context.dropContext},
      eta_engine_version             = ${snap.engineVersion},
      eta_v2_metadata                = ${JSON.stringify(snap)}::jsonb
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
}): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: number;
      eta_min_minutes: number | null;
      eta_max_minutes: number | null;
      promised_delivery_at: Date | string | null;
    }>
  >`
    SELECT id, eta_min_minutes, eta_max_minutes, promised_delivery_at
    FROM orders_core
    WHERE order_id = ${args.orderIdText}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    console.warn("[eta] appendEtaRecalc: order not found", args.orderIdText);
    return;
  }
  const prevPromisedIso =
    row.promised_delivery_at instanceof Date
      ? row.promised_delivery_at.toISOString()
      : typeof row.promised_delivery_at === "string"
        ? row.promised_delivery_at
        : null;

  const snap = args.newSnap;
  await sql`
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
      ${row.id}, ${args.orderIdText},
      ${row.eta_min_minutes}, ${row.eta_max_minutes},
      ${snap.etaMinMinutes}, ${snap.etaMaxMinutes},
      ${prevPromisedIso},
      ${snap.promisedDeliveryAt},
      ${args.reason},
      ${snap.breakdown.foodPrepMinutes},
      ${snap.breakdown.riderAssignmentMinutes},
      ${snap.breakdown.riderToStoreMinutes},
      ${snap.breakdown.travelMinutes},
      ${Math.max(0, Math.round(snap.breakdown.travelMinutes * (snap.multipliers.traffic - 1)))},
      ${Math.max(0, Math.round(snap.breakdown.travelMinutes * (snap.multipliers.weather - 1)))},
      0,
      ${snap.breakdown.uncertaintyMarginMinutes},
      ${args.riderId ?? null},
      ${args.merchantStoreId ?? null},
      ${snap.routeKm.toFixed(2)},
      ${JSON.stringify({})}::jsonb,
      ${JSON.stringify({ engineVersion: snap.engineVersion, breakdown: snap.breakdown, multipliers: snap.multipliers, context: snap.context })}::jsonb
    )
  `;
}

/**
 * Read the full ETA picture for an order: promise (from orders_core) + the
 * most recent recalc (from order_eta_history). UI clients use this to show
 * "promised 8:42 PM · current ETA 8:38 PM" type messaging.
 */
export type OrderEtaView = {
  orderIdText: string;
  engineVersion: string;
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

export async function getEtaForOrder(orderIdText: string): Promise<OrderEtaView | null> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      eta_min_minutes: number | null;
      eta_max_minutes: number | null;
      promised_delivery_at: Date | string | null;
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
    }>
  >`
    SELECT
      eta_min_minutes, eta_max_minutes, promised_delivery_at, eta_generated_at,
      eta_buffer_minutes, eta_route_distance_km, eta_confidence_score,
      eta_food_prep_minutes, eta_kitchen_load_buffer_minutes,
      eta_pickup_buffer_minutes, eta_apartment_buffer_minutes,
      eta_rider_arrival_minutes, eta_critical_path_minutes,
      eta_store_to_customer_minutes,
      eta_traffic_multiplier, eta_weather_multiplier, eta_peak_hour_multiplier,
      eta_weather_state, eta_peak_window, eta_drop_context,
      eta_engine_version,
      prep_time_minutes, prep_ready_by_at
    FROM orders_core
    WHERE order_id = ${orderIdText}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0]!;

  const live = await sql<
    Array<{
      new_eta_min: number;
      new_eta_max: number;
      new_promised_delivery_at: Date | string | null;
      recalc_reason: string;
      created_at: Date | string;
    }>
  >`
    SELECT new_eta_min, new_eta_max, new_promised_delivery_at, recalc_reason, created_at
    FROM order_eta_history
    WHERE order_id_text = ${orderIdText}
    ORDER BY id DESC
    LIMIT 1
  `;

  return {
    orderIdText,
    engineVersion: r.eta_engine_version ?? ETA_ENGINE_VERSION,
    promise: {
      minMinutes: r.eta_min_minutes,
      maxMinutes: r.eta_max_minutes,
      promisedDeliveryAt: toIsoOrNull(r.promised_delivery_at),
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
  };
}
