import type { Sql } from "postgres";
import {
  resolveRiderDisplayVariant,
  riderEnRouteToMerchant,
  type RiderDisplayVariant,
} from "./rider-merchant-display-state.js";
import { toAbsoluteClientMediaUrl } from "../utils/publicAttachmentUrl.js";

export type MerchantRiderTrackingLocation = {
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  updated_at: string;
  source: "order_tracking" | "live_location";
};

export type MerchantRiderTrackingTrailPoint = {
  latitude: number;
  longitude: number;
  created_at: string;
};

export type MerchantMapPin = {
  latitude: number;
  longitude: number;
};

export type MerchantRiderApproach = {
  remaining_distance_m: number;
  eta_minutes: number;
  source: "straight_line";
};

export type MerchantRiderTrackingPayload = {
  rider: {
    name: string | null;
    mobile: string | null;
    selfie_url: string | null;
    assignment_status: string | null;
  };
  rider_display_variant: RiderDisplayVariant;
  location: MerchantRiderTrackingLocation | null;
  trail: MerchantRiderTrackingTrailPoint[];
  store: MerchantMapPin | null;
  store_name: string | null;
  pickup: MerchantMapPin | null;
  drop: MerchantMapPin | null;
  approach: MerchantRiderApproach | null;
};

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = new Date(value as string | number | Date);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function etaMinutesFromMeters(m: number): number {
  const speedMps = 8.33; // ~30 km/h urban delivery
  return Math.max(1, Math.ceil(m / speedMps / 60));
}

function resolveStorePin(input: {
  merchantLat: unknown;
  merchantLon: unknown;
  pickupLat: unknown;
  pickupLon: unknown;
}): MerchantMapPin | null {
  const mLat = parseCoord(input.merchantLat);
  const mLng = parseCoord(input.merchantLon);
  if (mLat != null && mLng != null) return { latitude: mLat, longitude: mLng };
  const pLat = parseCoord(input.pickupLat);
  const pLng = parseCoord(input.pickupLon);
  if (pLat != null && pLng != null) return { latitude: pLat, longitude: pLng };
  return null;
}

function buildTrackingOrderIds(
  coreOrderId: number,
  orderIdText: string | null,
  formattedOrderId: string | null
): string[] {
  const ids = new Set<string>();
  if (orderIdText?.trim()) ids.add(orderIdText.trim());
  if (formattedOrderId?.trim()) ids.add(formattedOrderId.trim());
  ids.add(String(coreOrderId));
  return Array.from(ids);
}

export async function getMerchantOrderRiderTracking(
  sql: Sql,
  coreOrderId: number
): Promise<MerchantRiderTrackingPayload> {
  const empty: MerchantRiderTrackingPayload = {
    rider: { name: null, mobile: null, selfie_url: null, assignment_status: null },
    rider_display_variant: "on_the_way",
    location: null,
    trail: [],
    store: null,
    store_name: null,
    pickup: null,
    drop: null,
    approach: null,
  };

  if (!Number.isFinite(coreOrderId)) return empty;

  const coreRows = await sql<
    Array<{
      order_id: string | null;
      formatted_order_id: string | null;
      rider_id: number | null;
      merchant_store_id: number | null;
      status: string | null;
      current_status: string | null;
      pickup_lat: unknown;
      pickup_lon: unknown;
      drop_lat: unknown;
      drop_lon: unknown;
    }>
  >`
    SELECT order_id, formatted_order_id, rider_id, merchant_store_id, status, current_status,
      pickup_lat, pickup_lon, drop_lat, drop_lon
    FROM orders_core
    WHERE id = ${coreOrderId}
    LIMIT 1
  `;
  const core = coreRows[0];
  if (!core) return empty;

  const orderIdText = core.order_id != null ? String(core.order_id).trim() : null;
  const formattedOrderId =
    core.formatted_order_id != null ? String(core.formatted_order_id).trim() : null;
  const trackingIds = buildTrackingOrderIds(coreOrderId, orderIdText, formattedOrderId);

  const foodRows = await sql<
    Array<{
      rider_id: number | null;
      rider_name: string | null;
      rider_phone: string | null;
      merchant_store_id: number | null;
      order_status: string | null;
      rider_reached_pickup_at: unknown;
      rider_picked_up_at: unknown;
      pickup_wait_seconds: number | null;
    }>
  >`
    SELECT rider_id, rider_name, rider_phone, merchant_store_id, order_status,
      rider_reached_pickup_at, rider_picked_up_at, pickup_wait_seconds
    FROM orders_food
    WHERE order_id = ${coreOrderId}
    LIMIT 1
  `;
  const food = foodRows[0] ?? null;

  let riderId =
    core.rider_id != null && Number.isFinite(Number(core.rider_id))
      ? Number(core.rider_id)
      : null;

  const assignRows = await sql<
    Array<{
      rider_id: number;
      rider_name: string | null;
      rider_mobile: string | null;
      assignment_status: string | null;
      reached_merchant_at: string | null;
    }>
  >`
    SELECT rider_id, rider_name, rider_mobile, assignment_status::text AS assignment_status,
      reached_merchant_at
    FROM order_rider_assignments
    WHERE (order_core_id = ${coreOrderId} OR order_id = ${coreOrderId})
      AND cancelled_at IS NULL
      AND unassigned_at IS NULL
    ORDER BY is_active DESC NULLS LAST, assignment_sequence DESC NULLS LAST, assigned_at DESC NULLS LAST
    LIMIT 1
  `;
  const assignment = assignRows[0] ?? null;

  const riderDisplayInput = {
    order_status: String(food?.order_status ?? core.status ?? "CREATED"),
    core_status: core.status != null ? String(core.status) : null,
    current_status: core.current_status ?? null,
    reached_merchant_at: assignment?.reached_merchant_at ?? null,
    rider_reached_pickup_at: toIso(food?.rider_reached_pickup_at),
    rider_picked_up_at: toIso(food?.rider_picked_up_at),
    pickup_wait_seconds:
      food?.pickup_wait_seconds != null && Number.isFinite(food.pickup_wait_seconds)
        ? Math.max(0, Math.floor(food.pickup_wait_seconds))
        : null,
    rider_assignment_status: assignment?.assignment_status ?? null,
  };
  const riderDisplayVariant = resolveRiderDisplayVariant(riderDisplayInput);
  const enRoute = riderEnRouteToMerchant(riderDisplayInput);

  if (!riderId && assignment?.rider_id) riderId = assignment.rider_id;
  if (!riderId && food?.rider_id != null) riderId = Number(food.rider_id);

  let riderName: string | null = null;
  let riderMobile = assignment?.rider_mobile?.trim() || food?.rider_phone?.trim() || null;
  let selfieUrl: string | null = null;

  if (riderId) {
    const riderRows = await sql<Array<{ name: string | null; mobile: string | null; selfie_url: string | null }>>`
      SELECT name, mobile, selfie_url FROM riders WHERE id = ${riderId} LIMIT 1
    `;
    const rider = riderRows[0];
    if (rider) {
      riderName =
        rider.name?.trim() ||
        assignment?.rider_name?.trim() ||
        food?.rider_name?.trim() ||
        null;
      riderMobile = riderMobile || rider.mobile?.trim() || null;
      selfieUrl = toAbsoluteClientMediaUrl(rider.selfie_url?.trim() || null);
    }
  }

  if (!riderName) {
    riderName = assignment?.rider_name?.trim() || food?.rider_name?.trim() || null;
  }

  const merchantStoreId = food?.merchant_store_id ?? core.merchant_store_id;
  let storeName: string | null = null;
  let merchantLat: unknown = null;
  let merchantLon: unknown = null;
  if (merchantStoreId != null && Number.isFinite(Number(merchantStoreId))) {
    const storeRows = await sql<
      Array<{ latitude: unknown; longitude: unknown; store_name: string | null }>
    >`
      SELECT latitude, longitude, store_name
      FROM merchant_stores
      WHERE id = ${Number(merchantStoreId)}
      LIMIT 1
    `;
    const store = storeRows[0];
    merchantLat = store?.latitude;
    merchantLon = store?.longitude;
    storeName = store?.store_name?.trim() || null;
  }

  const store = resolveStorePin({
    merchantLat,
    merchantLon,
    pickupLat: core.pickup_lat,
    pickupLon: core.pickup_lon,
  });

  const trailRows = await sql<
    Array<{ latitude: unknown; longitude: unknown; created_at: unknown }>
  >`
    SELECT latitude, longitude, created_at
    FROM order_rider_tracking
    WHERE order_id IN ${sql(trackingIds)}
    ORDER BY created_at DESC
    LIMIT 40
  `;

  const trail = trailRows
    .map((row) => {
      const lat = parseCoord(row.latitude);
      const lng = parseCoord(row.longitude);
      const created_at = toIso(row.created_at);
      if (lat == null || lng == null || !created_at) return null;
      return { latitude: lat, longitude: lng, created_at };
    })
    .filter((p): p is MerchantRiderTrackingTrailPoint => p != null)
    .reverse();

  const latestTrail = trail.length > 0 ? trail[trail.length - 1] : null;

  let location: MerchantRiderTrackingLocation | null = null;
  if (latestTrail) {
    const headingRows = await sql<Array<{ heading_degrees: unknown; created_at: unknown }>>`
      SELECT heading_degrees, created_at
      FROM order_rider_tracking
      WHERE order_id IN ${sql(trackingIds)}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const headingRow = headingRows[0];
    location = {
      latitude: latestTrail.latitude,
      longitude: latestTrail.longitude,
      heading_degrees:
        headingRow?.heading_degrees != null ? Number(headingRow.heading_degrees) : null,
      updated_at: toIso(headingRow?.created_at) ?? latestTrail.created_at,
      source: "order_tracking",
    };
  }

  if (riderId) {
    const liveRows = await sql<
      Array<{ latitude: unknown; longitude: unknown; heading: unknown; updated_at: unknown }>
    >`
      SELECT latitude, longitude, heading, updated_at
      FROM rider_live_locations
      WHERE rider_id = ${riderId}
      LIMIT 1
    `;
    const live = liveRows[0];
    const lat = parseCoord(live?.latitude);
    const lng = parseCoord(live?.longitude);
    const updatedAt = toIso(live?.updated_at);
    if (lat != null && lng != null && updatedAt) {
      const liveLoc: MerchantRiderTrackingLocation = {
        latitude: lat,
        longitude: lng,
        heading_degrees: live?.heading != null ? Number(live.heading) : null,
        updated_at: updatedAt,
        source: "live_location",
      };
      if (location) {
        const liveMs = new Date(liveLoc.updated_at).getTime();
        const trackMs = new Date(location.updated_at).getTime();
        location = liveMs >= trackMs ? liveLoc : location;
      } else {
        location = liveLoc;
      }
    }
  }

  const pickupLat = parseCoord(core.pickup_lat);
  const pickupLng = parseCoord(core.pickup_lon);
  const dropLat = parseCoord(core.drop_lat);
  const dropLng = parseCoord(core.drop_lon);

  let approach: MerchantRiderApproach | null = null;
  const dest = store ?? (pickupLat != null && pickupLng != null ? { latitude: pickupLat, longitude: pickupLng } : null);
  if (enRoute && location && dest) {
    const remainingM = haversineMeters(
      location.latitude,
      location.longitude,
      dest.latitude,
      dest.longitude
    );
    if (Number.isFinite(remainingM) && remainingM > 0) {
      approach = {
        remaining_distance_m: Math.round(remainingM),
        eta_minutes: etaMinutesFromMeters(remainingM),
        source: "straight_line",
      };
    }
  }

  return {
    rider: {
      name: riderName,
      mobile: riderMobile,
      selfie_url: selfieUrl,
      assignment_status: assignment?.assignment_status ?? null,
    },
    rider_display_variant: riderDisplayVariant,
    location,
    trail,
    store,
    store_name: storeName,
    pickup:
      pickupLat != null && pickupLng != null
        ? { latitude: pickupLat, longitude: pickupLng }
        : null,
    drop: dropLat != null && dropLng != null ? { latitude: dropLat, longitude: dropLng } : null,
    approach,
  };
}
