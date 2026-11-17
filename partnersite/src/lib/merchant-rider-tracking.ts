import type { SupabaseClient } from '@supabase/supabase-js';
import type { MerchantRiderApproach } from '@/lib/merchant-rider-approach';
import { getRiderSelfieViewUrl } from '@/lib/rider-selfie-url';
import { resolveStoreMapLngLat, toLatLngPin, toMapLngLat } from '@/lib/parse-order-map-coords';
import { etaMinutesFromMeters } from '@/lib/route-remaining-distance';

export type MerchantRiderTrackingLocation = {
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  updated_at: string;
  source: 'order_tracking' | 'live_location';
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

/** Poll interval while live tracking modal is open. */
export const MERCHANT_RIDER_TRACKING_POLL_MS = 2000;

export type MerchantRiderTrackingPayload = {
  rider: {
    name: string | null;
    mobile: string | null;
    selfie_url: string | null;
    assignment_status: string | null;
  };
  location: MerchantRiderTrackingLocation | null;
  trail: MerchantRiderTrackingTrailPoint[];
  /** Merchant store pin (DB lat/lng → order pickup fallback). */
  store: MerchantMapPin | null;
  store_name: string | null;
  pickup: MerchantMapPin | null;
  drop: MerchantMapPin | null;
  /**
   * Remaining distance to store/pickup. Poll path uses straight-line so GPS
   * returns in ms — Mapbox driving ETA is computed on the client for the map line.
   */
  approach: MerchantRiderApproach | null;
};

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

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
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
  db: SupabaseClient,
  coreOrderId: number,
  opts?: { skipSelfie?: boolean }
): Promise<MerchantRiderTrackingPayload> {
  const empty: MerchantRiderTrackingPayload = {
    rider: { name: null, mobile: null, selfie_url: null, assignment_status: null },
    location: null,
    trail: [],
    store: null,
    store_name: null,
    pickup: null,
    drop: null,
    approach: null,
  };

  if (!Number.isFinite(coreOrderId)) return empty;

  const { data: core } = await db
    .from('orders_core')
    .select(
      'order_id, formatted_order_id, rider_id, merchant_store_id, pickup_lat, pickup_lon, pickup_address_geocoded, drop_lat, drop_lon'
    )
    .eq('id', coreOrderId)
    .maybeSingle();

  if (!core) return empty;

  const orderIdText =
    core.order_id != null && String(core.order_id).trim()
      ? String(core.order_id).trim()
      : null;
  const formattedOrderId =
    core.formatted_order_id != null && String(core.formatted_order_id).trim()
      ? String(core.formatted_order_id).trim()
      : null;
  const trackingIds = buildTrackingOrderIds(coreOrderId, orderIdText, formattedOrderId);

  let riderId =
    core.rider_id != null && Number.isFinite(Number(core.rider_id))
      ? Number(core.rider_id)
      : null;

  const [{ data: foodOrder }, { data: assignment }, { data: trailRows }] = await Promise.all([
    db
      .from('orders_food')
      .select('rider_id, rider_name, rider_phone, merchant_store_id')
      .eq('order_id', coreOrderId)
      .maybeSingle(),
    db
      .from('order_rider_assignments')
      .select('rider_name, rider_mobile, assignment_status, rider_id')
      .or(`order_core_id.eq.${coreOrderId},order_id.eq.${coreOrderId}`)
      .order('is_active', { ascending: false })
      .order('assignment_sequence', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('order_rider_tracking')
      .select('latitude, longitude, heading_degrees, created_at')
      .in('order_id', trackingIds)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (!riderId && assignment?.rider_id != null) {
    riderId = Number(assignment.rider_id);
  }
  if (!riderId && foodOrder?.rider_id != null) {
    riderId = Number(foodOrder.rider_id);
  }

  const riderName =
    (assignment?.rider_name as string | null)?.trim() ||
    (foodOrder?.rider_name as string | null)?.trim() ||
    null;
  const riderMobile =
    (assignment?.rider_mobile as string | null)?.trim() ||
    (foodOrder?.rider_phone as string | null)?.trim() ||
    null;

  const merchantStoreId =
    (foodOrder?.merchant_store_id as number | null | undefined) ??
    (core.merchant_store_id as number | null | undefined);

  const [selfieUrl, storeRow, live] = await Promise.all([
    riderId && !opts?.skipSelfie
      ? getRiderSelfieViewUrl(db, riderId)
      : Promise.resolve(null),
    merchantStoreId != null && Number.isFinite(Number(merchantStoreId))
      ? db
          .from('merchant_stores')
          .select('latitude, longitude, store_name')
          .eq('id', merchantStoreId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    riderId
      ? db
          .from('rider_live_locations')
          .select('latitude, longitude, heading, updated_at')
          .eq('rider_id', riderId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const merchantLat = storeRow?.latitude ?? null;
  const merchantLon = storeRow?.longitude ?? null;
  const storeName = (storeRow?.store_name as string | null)?.trim() || null;

  const storeLngLat = resolveStoreMapLngLat({
    merchantLat,
    merchantLon,
    pickupLat: core.pickup_lat,
    pickupLon: core.pickup_lon,
    pickupGeocoded: core.pickup_address_geocoded as string | null,
  });
  const store = storeLngLat ? toLatLngPin(storeLngLat) : null;

  const trail = (trailRows ?? [])
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
  const latestTrailRow = trailRows?.[0] ?? null;

  let location: MerchantRiderTrackingLocation | null = null;
  if (latestTrail) {
    location = {
      latitude: latestTrail.latitude,
      longitude: latestTrail.longitude,
      heading_degrees:
        latestTrailRow?.heading_degrees != null
          ? Number(latestTrailRow.heading_degrees)
          : null,
      updated_at: latestTrail.created_at,
      source: 'order_tracking',
    };
  }

  if (live) {
    const lat = parseCoord(live.latitude);
    const lng = parseCoord(live.longitude);
    const updatedAt = toIso(live.updated_at);
    if (lat != null && lng != null && updatedAt) {
      const liveLoc: MerchantRiderTrackingLocation = {
        latitude: lat,
        longitude: lng,
        heading_degrees: live.heading != null ? Number(live.heading) : null,
        updated_at: updatedAt,
        source: 'live_location',
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

  const pickupLngLat = toMapLngLat(pickupLat, pickupLng);
  const navDestinationLngLat = pickupLngLat ?? storeLngLat;

  // Never await Mapbox here — that was blocking GPS for ~5s/poll and the modal
  // looked like "route not loading" with only the store pin.
  let approach: MerchantRiderApproach | null = null;
  if (location && navDestinationLngLat) {
    const remainingM = haversineMeters(
      location.latitude,
      location.longitude,
      navDestinationLngLat[1],
      navDestinationLngLat[0]
    );
    if (Number.isFinite(remainingM) && remainingM > 0) {
      approach = {
        remaining_distance_m: Math.round(remainingM),
        eta_minutes: etaMinutesFromMeters(remainingM),
        source: 'straight_line',
      };
    }
  }

  return {
    rider: {
      name: riderName,
      mobile: riderMobile,
      selfie_url: selfieUrl,
      assignment_status: (assignment?.assignment_status as string | null) ?? null,
    },
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
