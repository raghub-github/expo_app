import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ordersCore } from "@/lib/db/schema";
import { searchRidersNearPoint } from "@/lib/area-manager/queries";

export type ForceSelectableRiderRow = {
  riderId: number;
  name: string | null;
  mobile: string | null;
  distanceKm: number | null;
  distanceFromMxKm: number | null;
  distanceFromCxKm: number | null;
  etaMinutes: number | null;
  onlineStatus: "ONLINE" | "BUSY" | "OFFLINE";
  dutyLoadStatus: "AVAILABLE" | "OCCUPIED";
  activeOrderCount: number;
  completedOrderCount: number;
  occupiedOrderId: string | null;
  vehicleType: string | null;
  rating: number | null;
  earningsToday: number | null;
  acceptanceRate: number | null;
  lat: number | null;
  lng: number | null;
};

const MAX_RADIUS_KM = 10;

function parseCoord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Force Assignment rider pool from dashboard DB (same live-GPS source as Geo Availability).
 * Returns everyone within 10 km of merchant/pickup — including offline — so the sheet
 * can filter by radius + on-duty toggle without another fetch.
 */
export async function listForceAssignmentRidersFromDb(
  orderCoreId: number
): Promise<ForceSelectableRiderRow[]> {
  const db = getDb();
  const [order] = await db
    .select({
      riderId: ordersCore.riderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      orderType: ordersCore.orderType,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  if (!order) return [];
  if (String(order.orderType ?? "").toLowerCase() !== "food") return [];

  const mxLat = parseCoord(order.pickupLat);
  const mxLng = parseCoord(order.pickupLon);
  if (mxLat == null || mxLng == null || (mxLat === 0 && mxLng === 0)) return [];

  const dropLat = parseCoord(order.dropLat);
  const dropLng = parseCoord(order.dropLon);
  const hasDrop =
    dropLat != null &&
    dropLng != null &&
    !(dropLat === 0 && dropLng === 0);

  const currentRiderId =
    order.riderId != null && Number.isFinite(Number(order.riderId))
      ? Number(order.riderId)
      : null;

  const geo = await searchRidersNearPoint({
    lat: mxLat,
    lng: mxLng,
    radiusKm: MAX_RADIUS_KM,
    areaManagerId: null,
  });

  const out: ForceSelectableRiderRow[] = [];
  for (const r of geo.riders) {
    if (currentRiderId != null && r.id === currentRiderId) continue;

    const status = String(r.status ?? "OFFLINE").toUpperCase();
    const onlineStatus: "ONLINE" | "BUSY" | "OFFLINE" =
      status === "ONLINE" || status === "BUSY" || status === "OFFLINE"
        ? status
        : "OFFLINE";

    const occupied = Boolean(r.currentAssignedOrderId?.trim());
    const distanceFromMxKm = r.distanceKm;
    const distanceFromCxKm =
      hasDrop && Number.isFinite(r.lat) && Number.isFinite(r.lng)
        ? Math.round(haversineKm(r.lat, r.lng, dropLat!, dropLng!) * 1000) / 1000
        : null;

    out.push({
      riderId: r.id,
      name: r.name,
      mobile: r.mobile || null,
      distanceKm: distanceFromMxKm,
      distanceFromMxKm,
      distanceFromCxKm,
      etaMinutes: Math.max(1, Math.round((distanceFromMxKm / 20) * 60)),
      onlineStatus,
      dutyLoadStatus: occupied ? "OCCUPIED" : "AVAILABLE",
      activeOrderCount: occupied ? 1 : 0,
      completedOrderCount: r.totalDeliveredOrders ?? 0,
      occupiedOrderId: occupied ? r.currentAssignedOrderId : null,
      vehicleType: null,
      rating: null,
      earningsToday: null,
      acceptanceRate: null,
      lat: r.lat,
      lng: r.lng,
    });
  }

  return out.slice(0, 120);
}
