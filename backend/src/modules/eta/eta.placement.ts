/**
 * Order-placement adapter — collects every input the v2 ETA engine needs
 * (items + KPTs, route w/ traffic, restaurant load, weather, peak window,
 * drop context), runs `computeEta`, and persists the snapshot to orders_core
 * + order_eta_history.
 *
 * Runs OUTSIDE the order-placement transaction. ETA write failures must
 * never roll back a paid order.
 */

import { getRoute } from "../distance/distance.service.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import {
  computeEta,
  resolveStorePrepMinutes,
  resolveWeatherState,
  type EtaItem,
} from "./eta.engine.js";
import {
  appendEtaRecalc,
  writeEtaPromiseToOrder,
} from "./eta.repository.js";
import { getActiveOrdersForStore, recordLoadSample } from "./restaurantLoad.js";

/**
 * Fetch the per-item KPT for each order item. Defensive about schema drift —
 * if a column doesn't exist, returns empty array and engine falls back to
 * the store's avg_preparation_time_minutes.
 */
async function loadOrderItemKpts(orderIdText: string): Promise<EtaItem[]> {
  const sql = getSql();
  try {
    const rows = await sql<
      Array<{
        menu_item_id: number | null;
        qty: number | string | null;
        kpt: number | string | null;
      }>
    >`
      SELECT oci.menu_item_id::int      AS menu_item_id,
             oci.quantity::int          AS qty,
             COALESCE(mmi.preparation_time_minutes, 0)::int AS kpt
      FROM orders_core_items oci
      LEFT JOIN merchant_menu_items mmi ON mmi.id = oci.menu_item_id
      WHERE oci.order_id = ${orderIdText}
    `;
    return rows
      .map((r) => ({
        itemId: r.menu_item_id ?? undefined,
        kptMinutes: Number(r.kpt) || 0,
        quantity: Math.max(1, Number(r.qty) || 1),
      }))
      .filter((x) => x.kptMinutes > 0 || x.quantity > 0);
  } catch (e) {
    console.warn("[eta] loadOrderItemKpts failed — falling back to store-level prep", {
      orderIdText,
      err: (e as Error).message,
    });
    return [];
  }
}

export async function freezeEtaForPlacedOrder(args: {
  orderIdText: string;
  merchantStoreId: number;
  pickupLat: number;
  pickupLon: number;
  dropLat: number;
  dropLon: number;
  /** From pending_orders (haversine fallback). */
  precomputedDistanceKm?: number | null;
  /** Drop address for apartment/office classification. */
  dropAddress?: string | null;
}): Promise<void> {
  try {
    const env = getEnv();

    /* 1. Route (Mapbox driving-traffic; falls back to haversine 18km/h) */
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
      console.warn("[eta] routing fetch failed at placement — distance/18kmh fallback", {
        orderIdText: args.orderIdText,
        err: (e as Error).message,
      });
      routeMinutes = Math.max(5, Math.round((routeKm / 18) * 60));
    }

    /* 2. Critical-path inputs */
    const [items, activeOrders, weather, storeFallback] = await Promise.all([
      loadOrderItemKpts(args.orderIdText),
      getActiveOrdersForStore(args.merchantStoreId),
      resolveWeatherState(args.dropLat, args.dropLon),
      resolveStorePrepMinutes(args.merchantStoreId),
    ]);

    /* 3. Run engine */
    const snap = computeEta({
      items,
      fallbackPrepMinutes: storeFallback,
      routeMinutes,
      routeKm,
      activeOrdersAtStore: activeOrders,
      weather,
      dropAddress: args.dropAddress,
      // Rider context: at placement no rider is assigned yet.
      riderAssigned: false,
    });

    /* 4. Persist snapshot — orders_core + history */
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
    void recordLoadSample({ storeId: args.merchantStoreId, activeOrders });

    console.log("[eta] v2 frozen", {
      orderIdText: args.orderIdText,
      etaMin: snap.etaMinMinutes,
      etaMax: snap.etaMaxMinutes,
      criticalPath: snap.breakdown.criticalPathMinutes,
      foodPrep: snap.breakdown.foodPrepMinutes,
      activeOrders,
      peak: snap.context.peakWindow,
      confidence: snap.confidenceScore,
    });
  } catch (err) {
    console.error("[eta] freezeEtaForPlacedOrder failed (non-fatal)", {
      orderIdText: args.orderIdText,
      err: (err as Error).message,
    });
  }
}
