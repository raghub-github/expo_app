import { getSql } from "../client";
import { getRiderSelfieViewUrl } from "@/lib/rider-selfie-url";

export type OrderRiderTrackingLocation = {
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  updated_at: string;
  source: "order_tracking" | "live_location";
};

export type OrderRiderTrackingTrailPoint = {
  latitude: number;
  longitude: number;
  created_at: string;
};

export type OrderRiderTrackingPayload = {
  rider: {
    /** orders_core.rider_id — current assignee only. */
    id: number | null;
    name: string | null;
    mobile: string | null;
    selfie_url: string | null;
    assignment_status: string | null;
  };
  location: OrderRiderTrackingLocation | null;
  trail: OrderRiderTrackingTrailPoint[];
};

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getOrderRiderTracking(
  orderCoreId: number
): Promise<OrderRiderTrackingPayload> {
  const empty: OrderRiderTrackingPayload = {
    rider: { id: null, name: null, mobile: null, selfie_url: null, assignment_status: null },
    location: null,
    trail: [],
  };

  if (!Number.isFinite(orderCoreId)) return empty;

  const sql = getSql();

  const [orderRow] = await sql`
    SELECT
      oc.rider_id,
      oc.order_id AS formatted_order_id,
      r.name AS rider_name,
      r.mobile AS rider_mobile
    FROM orders_core oc
    LEFT JOIN riders r ON r.id = oc.rider_id
    WHERE oc.id = ${orderCoreId}
    LIMIT 1
  `;

  if (!orderRow) return empty;

  /** Only the rider currently on orders_core — never a cancelled / historical assignment. */
  const riderId =
    orderRow.rider_id != null && Number.isFinite(Number(orderRow.rider_id))
      ? Number(orderRow.rider_id)
      : null;

  const [assignment] = riderId
    ? await sql`
        SELECT rider_name, rider_mobile, assignment_status
        FROM order_rider_assignments
        WHERE rider_id = ${riderId}
          AND (order_core_id = ${orderCoreId} OR order_id = ${orderCoreId})
        ORDER BY is_active DESC NULLS LAST, assignment_sequence DESC NULLS LAST, created_at DESC
        LIMIT 1
      `
    : [];

  const riderName =
    (assignment?.rider_name as string | null)?.trim() ||
    (orderRow.rider_name as string | null)?.trim() ||
    null;
  const riderMobile =
    (assignment?.rider_mobile as string | null)?.trim() ||
    (orderRow.rider_mobile as string | null)?.trim() ||
    null;

  const formattedOrderId =
    orderRow.formatted_order_id != null && String(orderRow.formatted_order_id).trim()
      ? String(orderRow.formatted_order_id).trim()
      : String(orderCoreId);
  const trackingOrderIds = [formattedOrderId, String(orderCoreId)].filter(
    (id, index, arr) => arr.indexOf(id) === index
  );

  const trailRows = await sql`
    SELECT latitude, longitude, created_at
    FROM order_rider_tracking
    WHERE order_id IN ${sql(trackingOrderIds)}
    ORDER BY created_at DESC
    LIMIT 40
  `;

  const trail = (trailRows as Record<string, unknown>[])
    .map((row) => {
      const lat = parseCoord(row.latitude);
      const lng = parseCoord(row.longitude);
      const created_at = toIso(row.created_at);
      if (lat == null || lng == null || !created_at) return null;
      return { latitude: lat, longitude: lng, created_at };
    })
    .filter((p): p is OrderRiderTrackingTrailPoint => p != null)
    .reverse();

  const latestTracking = trail.length > 0 ? trail[trail.length - 1] : null;

  let location: OrderRiderTrackingLocation | null = null;

  if (latestTracking) {
    const [headingRow] = await sql`
      SELECT heading_degrees, created_at
      FROM order_rider_tracking
      WHERE order_id IN ${sql(trackingOrderIds)}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    location = {
      latitude: latestTracking.latitude,
      longitude: latestTracking.longitude,
      heading_degrees:
        headingRow?.heading_degrees != null ? Number(headingRow.heading_degrees) : null,
      updated_at: toIso(headingRow?.created_at) ?? latestTracking.created_at,
      source: "order_tracking",
    };
  }

  let liveLocation: OrderRiderTrackingLocation | null = null;
  if (riderId) {
    const [live] = await sql`
      SELECT latitude, longitude, heading, updated_at
      FROM rider_live_locations
      WHERE rider_id = ${riderId}
      LIMIT 1
    `;
    const lat = parseCoord(live?.latitude);
    const lng = parseCoord(live?.longitude);
    const updatedAt = toIso(live?.updated_at);
    if (lat != null && lng != null && updatedAt) {
      liveLocation = {
        latitude: lat,
        longitude: lng,
        heading_degrees: live?.heading != null ? Number(live.heading) : null,
        updated_at: updatedAt,
        source: "live_location",
      };
    }
  }

  if (liveLocation && location) {
    const liveMs = new Date(liveLocation.updated_at).getTime();
    const trackMs = new Date(location.updated_at).getTime();
    location = liveMs >= trackMs ? liveLocation : location;
  } else if (liveLocation) {
    location = liveLocation;
  }

  const selfieUrl = riderId ? await getRiderSelfieViewUrl(riderId).catch(() => null) : null;

  return {
    rider: {
      id: riderId,
      name: riderName,
      mobile: riderMobile,
      selfie_url: selfieUrl,
      assignment_status: (assignment?.assignment_status as string | null) ?? null,
    },
    location,
    trail,
  };
}
