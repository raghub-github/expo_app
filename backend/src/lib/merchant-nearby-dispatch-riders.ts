/**
 * Nearby on-duty dispatch riders for merchant LiveOps — same eligibility as dispatch waves.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore } from "../db/schema.js";
import { fetchEffectiveDispatchRadiusMeters } from "./order-dispatch-settings.js";
import {
  listEligibleRidersForDispatchOrder,
  type DispatchOrderTarget,
  type DispatchServiceType,
} from "./order-assignment-engine.js";

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isValidPickup(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 1e-4 || Math.abs(lng) > 1e-4);
}

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

const CACHE_TTL_MS = 12_000;
const summaryCache = new Map<
  number,
  { fetchedAt: number; summary: NearbyDispatchRiderSummary | null }
>();

export function formatAssignSoonMessage(count: number): string {
  if (count <= 0) {
    return "Looking for nearby riders — we will assign one soon";
  }
  if (count === 1) {
    return "1 rider near you — we will assign one soon";
  }
  return `${count} riders near you — we will assign one soon`;
}

export async function getNearbyDispatchRiderSummaryForOrderCoreId(
  orderCoreId: number,
  opts?: { forceRefresh?: boolean }
): Promise<NearbyDispatchRiderSummary | null> {
  const cached = summaryCache.get(orderCoreId);
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.summary;
  }

  const summary = await computeNearbyDispatchRiderSummary(orderCoreId);
  summaryCache.set(orderCoreId, { fetchedAt: Date.now(), summary });
  return summary;
}

async function computeNearbyDispatchRiderSummary(
  orderCoreId: number
): Promise<NearbyDispatchRiderSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  if (!row?.orderId || row.riderId != null) return null;

  const serviceType = String(row.orderType ?? "").trim().toLowerCase();
  if (serviceType !== "food") return null;

  const pickup = {
    latitude: parseCoord(row.pickupLat),
    longitude: parseCoord(row.pickupLon),
  };
  if (!isValidPickup(pickup.latitude, pickup.longitude)) {
    return {
      nearbyCount: 0,
      radiusKm: 0,
      assignSoonMessage: formatAssignSoonMessage(0),
    };
  }

  const waveNumber = 1;
  const foodService: DispatchServiceType = "food";
  const effectiveRadiusMeters = await fetchEffectiveDispatchRadiusMeters(foodService, waveNumber);
  const target: DispatchOrderTarget = {
    orderCoreId,
    orderId: row.orderId.trim(),
    formattedOrderId: null,
    serviceType: foodService,
    pickup,
    waveNumber,
    effectiveRadiusMeters,
  };

  const riders = await listEligibleRidersForDispatchOrder(target);
  const nearbyCount = riders.length;
  const radiusKm = Math.round((effectiveRadiusMeters / 1000) * 10) / 10;

  return {
    nearbyCount,
    radiusKm,
    assignSoonMessage: formatAssignSoonMessage(nearbyCount),
  };
}
