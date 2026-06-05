/**
 * Shared ETA recalculation — used by public /v1/eta routes and internal
 * merchant prep-delay side effects.
 */
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { computeEta, resolveStorePrepMinutes } from "./eta.engine.js";
import { appendEtaRecalc, type EtaRecalcReason } from "./eta.repository.js";

export type RecalcOrderEtaInput = {
  reason: EtaRecalcReason;
  extraTrafficMinutes?: number;
  extraWeatherMinutes?: number;
  extraCongestionMinutes?: number;
  riderId?: number;
};

export async function recalcOrderEta(orderIdText: string, input: RecalcOrderEtaInput) {
  const sql = getSql();
  const rows = await sql<
    Array<{
      merchant_store_id: number;
      pickup_lat: string;
      pickup_lon: string;
      drop_lat: string;
      drop_lon: string;
      distance_km: string | null;
      prep_time_minutes: number | null;
    }>
  >`
    SELECT merchant_store_id,
           pickup_lat::text AS pickup_lat,
           pickup_lon::text AS pickup_lon,
           drop_lat::text   AS drop_lat,
           drop_lon::text   AS drop_lon,
           distance_km::text AS distance_km,
           prep_time_minutes
    FROM orders_core
    WHERE order_id = ${orderIdText}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0]!;
  const env = getEnv();
  let routeKm = row.distance_km != null ? Number(row.distance_km) : 0;
  let routeMinutes = 0;
  try {
    const route = await getRoute({
      origin: { lat: Number(row.pickup_lat), lng: Number(row.pickup_lon) },
      destination: { lat: Number(row.drop_lat), lng: Number(row.drop_lon) },
      profile: "driving",
      mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
      osrmBaseUrl: env.OSRM_BASE_URL || undefined,
    });
    if (route.distanceKm > 0) routeKm = route.distanceKm;
    if (route.etaMinutes > 0) routeMinutes = route.etaMinutes;
  } catch {
    routeMinutes = Math.max(5, Math.round((routeKm / 18) * 60));
  }

  const noPrep = input.reason === "RIDER_PICKED_UP";
  const orderPrep =
    row.prep_time_minutes != null && Number(row.prep_time_minutes) > 0
      ? Math.round(Number(row.prep_time_minutes))
      : null;
  const prepMinutes = noPrep
    ? 0
    : orderPrep != null
      ? orderPrep
      : await resolveStorePrepMinutes(Number(row.merchant_store_id));
  const noAssignment = input.reason === "RIDER_PICKED_UP" || input.reason === "RIDER_ASSIGNED";
  const { getActiveOrdersForStore } = await import("./restaurantLoad.js");
  const activeOrders = noPrep ? 0 : await getActiveOrdersForStore(Number(row.merchant_store_id));

  const snap = computeEta({
    items: noPrep ? [{ kptMinutes: 0, quantity: 1 }] : [{ kptMinutes: prepMinutes, quantity: 1 }],
    fallbackPrepMinutes: prepMinutes,
    routeMinutes,
    routeKm,
    activeOrdersAtStore: activeOrders,
    riderAssigned: noAssignment ? true : false,
    riderAssignmentDelayMinutes: noAssignment ? 0 : undefined,
    weather:
      (input.extraWeatherMinutes ?? 0) >= 8
        ? "HEAVY_RAIN"
        : (input.extraWeatherMinutes ?? 0) >= 3
          ? "LIGHT_RAIN"
          : "CLEAR",
  });

  await appendEtaRecalc({
    orderIdText,
    newSnap: snap,
    reason: input.reason,
    riderId: input.riderId ?? null,
    merchantStoreId: Number(row.merchant_store_id),
  });

  return snap;
}
