/**
 * ETA persistence — freezes the promise snapshot on orders_core at placement
 * and appends recalc rows to order_eta_history for every subsequent change.
 *
 * Critical invariant: the promise columns on orders_core are written ONCE on
 * placement and never overwritten. Recalculations update tracking ETA via
 * history rows only. This way support / disputes can always answer
 * "what did we promise" by reading orders_core directly.
 */

import { getSql } from "../../db/client.js";
import type { EtaSnapshot } from "./eta.engine.js";

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
 * Write the immutable promise snapshot onto orders_core. Called once per order
 * at finalize time. After this row is written, recalculations only append to
 * order_eta_history.
 */
export async function writeEtaPromiseToOrder(
  orderIdText: string,
  snap: EtaSnapshot,
  metadata?: { mapboxRouteId?: string | null; routeSnapshot?: unknown },
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE orders_core
    SET
      eta_min_minutes               = ${snap.minMinutes},
      eta_max_minutes               = ${snap.maxMinutes},
      promised_delivery_at          = ${snap.promisedDeliveryAt},
      eta_generated_at              = ${snap.generatedAt},
      eta_buffer_minutes            = ${snap.breakdown.bufferMinutes},
      eta_prep_minutes              = ${snap.breakdown.prepMinutes},
      eta_rider_assignment_minutes  = ${snap.breakdown.riderAssignmentMinutes},
      eta_rider_to_store_minutes    = ${snap.breakdown.riderToStoreMinutes},
      eta_store_to_customer_minutes = ${snap.breakdown.storeToCustomerMinutes},
      eta_traffic_delay_minutes     = ${snap.breakdown.trafficDelayMinutes},
      eta_weather_delay_minutes     = ${snap.breakdown.weatherDelayMinutes},
      eta_congestion_delay_minutes  = ${snap.breakdown.congestionDelayMinutes},
      eta_route_distance_km         = ${snap.routeKm.toFixed(2)},
      eta_confidence_score          = ${snap.confidenceScore.toFixed(2)},
      eta_version                   = 1,
      eta_mapbox_route_id           = ${metadata?.mapboxRouteId ?? null},
      eta_route_snapshot            = ${JSON.stringify(metadata?.routeSnapshot ?? {})}::jsonb,
      eta_metadata                  = ${JSON.stringify(snap.metadata)}::jsonb
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
  // postgres.js returns timestamptz as Date OR string depending on driver
  // path; normalize before serialising back into the JSONB column.
  const prevPromisedIso =
    row.promised_delivery_at instanceof Date
      ? row.promised_delivery_at.toISOString()
      : typeof row.promised_delivery_at === "string"
        ? row.promised_delivery_at
        : null;

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
      ${args.newSnap.minMinutes}, ${args.newSnap.maxMinutes},
      ${prevPromisedIso},
      ${args.newSnap.promisedDeliveryAt},
      ${args.reason},
      ${args.newSnap.breakdown.prepMinutes},
      ${args.newSnap.breakdown.riderAssignmentMinutes},
      ${args.newSnap.breakdown.riderToStoreMinutes},
      ${args.newSnap.breakdown.storeToCustomerMinutes},
      ${args.newSnap.breakdown.trafficDelayMinutes},
      ${args.newSnap.breakdown.weatherDelayMinutes},
      ${args.newSnap.breakdown.congestionDelayMinutes},
      ${args.newSnap.breakdown.bufferMinutes},
      ${args.riderId ?? null},
      ${args.merchantStoreId ?? null},
      ${args.newSnap.routeKm.toFixed(2)},
      ${JSON.stringify({})}::jsonb,
      ${JSON.stringify(args.newSnap.metadata)}::jsonb
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
  promise: {
    minMinutes: number | null;
    maxMinutes: number | null;
    promisedDeliveryAt: string | null;
    generatedAt: string | null;
    bufferMinutes: number | null;
    routeKm: number | null;
    confidenceScore: number | null;
  };
  live: {
    minMinutes: number;
    maxMinutes: number;
    promisedDeliveryAt: string;
    reason: string;
    createdAt: string;
  } | null;
};

export async function getEtaForOrder(orderIdText: string): Promise<OrderEtaView | null> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      eta_min_minutes: number | null;
      eta_max_minutes: number | null;
      promised_delivery_at: Date | null;
      eta_generated_at: Date | null;
      eta_buffer_minutes: number | null;
      eta_route_distance_km: string | null;
      eta_confidence_score: string | null;
    }>
  >`
    SELECT
      eta_min_minutes, eta_max_minutes, promised_delivery_at, eta_generated_at,
      eta_buffer_minutes, eta_route_distance_km, eta_confidence_score
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
    promise: {
      minMinutes: r.eta_min_minutes,
      maxMinutes: r.eta_max_minutes,
      // postgres.js returns timestamps as either Date or string depending on
      // the query path / driver version — accept both so the endpoint never
      // 500s on a benign type mismatch.
      promisedDeliveryAt: toIsoOrNull(r.promised_delivery_at),
      generatedAt: toIsoOrNull(r.eta_generated_at),
      bufferMinutes: r.eta_buffer_minutes,
      routeKm: r.eta_route_distance_km == null ? null : Number(r.eta_route_distance_km),
      confidenceScore: r.eta_confidence_score == null ? null : Number(r.eta_confidence_score),
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
  };
}

/**
 * Normalize whatever postgres.js handed us — Date instance, ISO string, or
 * null — into a plain ISO 8601 string (or null). Returns null on garbage so
 * the caller can decide whether to surface a 0/null instead of crashing.
 */
function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v === "string") {
    const t = new Date(v);
    return Number.isFinite(t.getTime()) ? t.toISOString() : v; // pass through raw if not parsable
  }
  return null;
}
