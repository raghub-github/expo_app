/**
 * Order-placement adapter for the ETA engine.
 *
 * Used by `finalizeOrder` after the orders_core row is committed. Wraps:
 *   1. routing (cached Mapbox/OSRM call for store→customer)
 *   2. prep-time resolution
 *   3. computeEta()
 *   4. writeEtaPromiseToOrder() — freezes the promise on orders_core
 *   5. appendEtaRecalc({ reason: ORDER_PLACED }) — seeds the history table
 *
 * Failures are swallowed and logged: order placement must NOT fail because of
 * an ETA write. Worst-case the row gets default NULL ETA columns and the
 * tracking screen falls back to a generic "Delivery in 45–55 mins" message.
 */

import { getRoute } from "../distance/distance.service.js";
import { getEnv } from "../../config/env.js";
import { computeEta, resolveStorePrepMinutes } from "./eta.engine.js";
import { writeEtaPromiseToOrder, appendEtaRecalc } from "./eta.repository.js";

export async function freezeEtaForPlacedOrder(args: {
  orderIdText: string;
  merchantStoreId: number;
  pickupLat: number;
  pickupLon: number;
  dropLat: number;
  dropLon: number;
  /** Pre-computed distance from the pending order — used as a fallback. */
  precomputedDistanceKm?: number | null;
}): Promise<void> {
  try {
    const env = getEnv();
    let routeKm = args.precomputedDistanceKm ?? 0;
    let routeMinutes = 0;
    let mapboxRouteId: string | null = null;
    let routeSnapshot: Record<string, unknown> | null = null;
    try {
      const route = await getRoute({
        origin: { lat: args.pickupLat, lng: args.pickupLon },
        destination: { lat: args.dropLat, lng: args.dropLon },
        profile: "driving",
        mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
        osrmBaseUrl: env.OSRM_BASE_URL || undefined,
      });
      routeKm = route.distanceKm > 0 ? route.distanceKm : routeKm;
      routeMinutes = route.etaMinutes > 0 ? route.etaMinutes : 0;
      mapboxRouteId = String(route.source ?? "");
      routeSnapshot = {
        source: route.source,
        cached: route.cached,
        approximate: route.approximate,
        distanceKm: route.distanceKm,
        etaMinutes: route.etaMinutes,
      };
    } catch (e) {
      // Routing failed (rate limit / network). We still freeze ETA from
      // distance using a conservative 18 km/h avg city speed.
      console.warn("[eta] routing fetch failed at placement — falling back to distance/18kmh", {
        orderIdText: args.orderIdText,
        err: (e as Error).message,
      });
      routeMinutes = Math.max(5, Math.round((routeKm / 18) * 60));
    }

    const prepMinutes = await resolveStorePrepMinutes(args.merchantStoreId);
    const snap = computeEta({
      routeMinutes,
      routeKm,
      prepMinutes,
    });

    await writeEtaPromiseToOrder(args.orderIdText, snap, {
      mapboxRouteId,
      routeSnapshot,
    });
    await appendEtaRecalc({
      orderIdText: args.orderIdText,
      newSnap: snap,
      reason: "ORDER_PLACED",
      merchantStoreId: args.merchantStoreId,
    });

    console.log("[eta] frozen", {
      orderIdText: args.orderIdText,
      minMinutes: snap.minMinutes,
      maxMinutes: snap.maxMinutes,
      promisedDeliveryAt: snap.promisedDeliveryAt,
      prep: snap.breakdown.prepMinutes,
      route: snap.breakdown.storeToCustomerMinutes,
      buffer: snap.breakdown.bufferMinutes,
    });
  } catch (err) {
    // Never fail the order because of ETA write — log and move on.
    console.error("[eta] freezeEtaForPlacedOrder failed (non-fatal)", {
      orderIdText: args.orderIdText,
      err: (err as Error).message,
    });
  }
}
