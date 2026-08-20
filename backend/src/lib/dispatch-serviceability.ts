/**
 * Dispatch Engine — Phase 2: pre-placement serviceability.
 *
 * Decides whether a customer may place an order at a pickup location, REUSING the
 * existing geo stack rather than duplicating it:
 *   1. service enabled + Prevent Services  -> resolveGeoServiceAvailability (existing)
 *   2. self-pickup / delivery / internal-rider / 3PL toggles + service radius
 *      -> resolveGeoCoverage (dispatch-extension layer)
 *   3. rider availability within the service radius (the genuinely new gate),
 *      **unless** Super Admin turned off `states.require_rider_online_check`
 *      for that state (Geo & coverage → Rider online check).
 *
 * Rules (per product decisions):
 *   - Self-pickup: skip the rider check entirely (allow if self-pickup enabled here).
 *   - Delivery: require an available internal rider within the service radius, OR 3PL
 *     enabled for this location; otherwise BLOCK ("No riders are currently available.").
 *
 * The availability check here is intentionally looser than full dispatch eligibility
 * (order-assignment-engine): it answers "is there any on-duty rider for this service
 * near the pickup", which is the correct placement gate — strict per-order eligibility
 * remains the dispatch engine's job.
 */

import {
  riderDispatchLocationMaxAgeSeconds,
  type DispatchServiceType,
} from "./order-assignment-engine.js";
import { resolveGeoCoverage } from "./geo-coverage.js";
import { getSql } from "../db/client.js";
import { queryRiderAvailabilityCandidates } from "@gatimitra/rider-availability";
import { stateNameFromPincode } from "../modules/billing/pincodePrefixToState.js";

export type FulfillmentMode = "self_pickup" | "delivery";

export type ServiceabilityReason =
  | "serviceable"
  | "self_pickup_ok"
  | "outside_coverage"
  | "service_disabled"
  | "prevent_blocked"
  | "delivery_disabled"
  | "self_pickup_disabled"
  | "no_rider_available";

export type DispatchServiceabilityResult = {
  serviceable: boolean;
  reason: ServiceabilityReason;
  message: string;
  serviceEnabled: boolean;
  selfPickupEnabled: boolean;
  deliveryEnabled: boolean;
  internalRiderEnabled: boolean;
  tplEnabled: boolean;
  ridersAvailable: number;
  serviceRadiusMeters: number;
  /** True when placement is allowed only because 3PL is enabled (no internal rider). */
  usedTpl: boolean;
  /**
   * Super Admin Geo & coverage per-state toggle. When false, the nearby-rider
   * gate is skipped (order may still be placed). Defaults true.
   */
  riderOnlineCheckRequired: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function flagFromStateRow(
  sql: ReturnType<typeof getSql>,
  stateId?: string | null,
  stateName?: string | null
): Promise<boolean | null> {
  const id = String(stateId ?? "").trim();
  if (id && UUID_RE.test(id)) {
    const [row] = (await sql`
      SELECT require_rider_online_check
      FROM states
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<{ require_rider_online_check: boolean }>;
    if (row) return row.require_rider_online_check !== false;
  }
  const name = String(stateName ?? "").trim();
  if (!name) return null;
  const [row] = (await sql`
    SELECT require_rider_online_check
    FROM states
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(${name}))
       OR LOWER(REPLACE(TRIM(name), ' ', '')) = LOWER(REPLACE(TRIM(${name}), ' ', ''))
    LIMIT 1
  `) as Array<{ require_rider_online_check: boolean }>;
  return row ? row.require_rider_online_check !== false : null;
}

/**
 * State flag: ON = run nearby-rider gate; OFF = skip.
 * Resolves state from UUID, name, pincode prefix, reverse-geocode chain, then merchant store.
 */
async function isRiderOnlineCheckRequired(opts: {
  stateId?: string | null;
  stateName?: string | null;
  pincode?: string | null;
  lat: number;
  lng: number;
  merchantStoreId?: string | null;
}): Promise<boolean> {
  try {
    const sql = getSql();

    const direct = await flagFromStateRow(sql, opts.stateId, opts.stateName);
    if (direct != null) return direct;

    const fromPinPrefix = await flagFromStateRow(sql, null, stateNameFromPincode(opts.pincode));
    if (fromPinPrefix != null) return fromPinPrefix;

    if (Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
      const { resolveGeoLocation } = await import("../modules/billing/geoLocationResolver.js");
      const geo = await resolveGeoLocation({
        livePincode: opts.pincode,
        liveState: opts.stateName,
        latitude: opts.lat,
        longitude: opts.lng,
      });
      const fromGeo = await flagFromStateRow(
        sql,
        geo.refs?.state ?? null,
        geo.stateName ?? stateNameFromPincode(geo.pincode)
      );
      if (fromGeo != null) return fromGeo;
    }

    const storeKey = String(opts.merchantStoreId ?? "").trim();
    if (storeKey) {
      const numericId = Number(storeKey);
      const rows = Number.isFinite(numericId) && numericId >= 1
        ? ((await sql`
            SELECT state, postal_code
            FROM merchant_stores
            WHERE id = ${numericId}
               OR LOWER(TRIM(COALESCE(store_id, ''))) = LOWER(TRIM(${storeKey}))
            LIMIT 1
          `) as Array<{ state: string | null; postal_code: string | null }>)
        : ((await sql`
            SELECT state, postal_code
            FROM merchant_stores
            WHERE LOWER(TRIM(COALESCE(store_id, ''))) = LOWER(TRIM(${storeKey}))
            LIMIT 1
          `) as Array<{ state: string | null; postal_code: string | null }>);
      const store = rows[0];
      if (store) {
        const fromStore = await flagFromStateRow(
          sql,
          null,
          store.state ?? stateNameFromPincode(store.postal_code)
        );
        if (fromStore != null) return fromStore;
      }
    }
  } catch (err) {
    console.warn("[dispatch-serviceability] rider-online-check lookup failed; default ON", err);
  }
  return true;
}

const SERVICE_LABEL: Record<DispatchServiceType, string> = {
  food: "Food delivery",
  parcel: "Parcel delivery",
  person_ride: "Ride",
};

/** Maps dispatch service to the geo-coverage service code ('ride' for person_ride). */
function geoServiceCode(serviceType: DispatchServiceType): "food" | "parcel" | "ride" {
  return serviceType === "person_ride" ? "ride" : serviceType;
}

/**
 * Count dispatchable riders for a service with a fresh GPS ping inside `radiusMeters` of
 * the pickup. Delegates to the shared `@gatimitra/rider-availability` engine — the single
 * source of truth also used by the Super Admin Geo Rx dashboard, so both surfaces now
 * agree on what "available" means (fixed the reported divergence: this check used to be
 * the only one of three that applied a location-freshness filter at all).
 */
export type RiderAvailabilityCounts = {
  /** Fully dispatchable now: online + fresh + service-eligible + has spare capacity. */
  available: number;
  /** Online + fresh + service-eligible in the area, IGNORING capacity — i.e. present but
   *  possibly all busy. Lets callers say "all busy" vs "none online" accurately. */
  onlineInArea: number;
};

export async function countAvailableRidersWithinServiceRadius(
  serviceType: DispatchServiceType,
  pickup: { lat: number; lng: number },
  radiusMeters: number
): Promise<RiderAvailabilityCounts> {
  if (
    !Number.isFinite(pickup.lat) ||
    !Number.isFinite(pickup.lng) ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    return { available: 0, onlineInArea: 0 };
  }

  const sql = getSql();
  const candidates = await queryRiderAvailabilityCandidates(sql, {
    service: serviceType,
    lat: pickup.lat,
    lng: pickup.lng,
    radiusMeters,
    freshnessMaxAgeMinutes: riderDispatchLocationMaxAgeSeconds() / 60,
  });

  return {
    available: candidates.filter((c) => c.eligible).length,
    onlineInArea: candidates.filter(
      (c) => c.accountActive && c.onDuty && c.serviceEligible && c.locationFresh
    ).length,
  };
}

/** Pre-placement serviceability decision for a pickup location + fulfillment mode. */
export async function checkDispatchServiceability(args: {
  serviceType: DispatchServiceType;
  fulfillment: FulfillmentMode;
  pickup: {
    lat: number;
    lng: number;
    pincode?: string | null;
    state?: string | null;
    merchantStoreId?: string | null;
  };
}): Promise<DispatchServiceabilityResult> {
  const { serviceType, fulfillment, pickup } = args;
  const label = SERVICE_LABEL[serviceType];
  const serviceCode = geoServiceCode(serviceType);

  // 1) Existing geo authority: service enabled + Prevent Services.
  const { resolveGeoServiceAvailability } = await import(
    "../modules/geo/geoServiceAvailability.service.js"
  );
  const avail = await resolveGeoServiceAvailability({
    pincode: pickup.pincode,
    state: pickup.state,
    lat: pickup.lat,
    lng: pickup.lng,
  });

  const serviceEnabled =
    serviceCode === "food" ? avail.food : serviceCode === "parcel" ? avail.parcel : avail.ride;
  const preventBlocked = (avail.preventBlocked ?? []).includes(serviceCode);

  // 2) Dispatch-extension layer: self-pickup / delivery / internal-rider / 3PL + radius.
  const cov = await resolveGeoCoverage(serviceType, {
    pincode: avail.pincode,
    state: avail.stateName,
  });

  const base = {
    serviceEnabled,
    selfPickupEnabled: cov.selfPickupEnabled,
    deliveryEnabled: cov.deliveryEnabled,
    internalRiderEnabled: cov.internalRiderEnabled,
    tplEnabled: cov.tplEnabled,
    ridersAvailable: 0,
    serviceRadiusMeters: cov.serviceRadiusMeters,
    usedTpl: false,
    riderOnlineCheckRequired: true,
  };

  if (!avail.found) {
    return {
      serviceable: false,
      reason: "outside_coverage",
      message: "We don't serve this location yet.",
      ...base,
    };
  }
  if (!serviceEnabled) {
    return preventBlocked
      ? {
          serviceable: false,
          reason: "prevent_blocked",
          message: avail.preventReason ?? "Service is temporarily unavailable in this area.",
          ...base,
        }
      : {
          serviceable: false,
          reason: "service_disabled",
          message: `${label} isn't available at this location.`,
          ...base,
        };
  }
  // Optional dispatch-level kill switch (geo_coverage.enabled) for this service+location.
  if (!cov.enabled) {
    return {
      serviceable: false,
      reason: "service_disabled",
      message: `${label} isn't available at this location.`,
      ...base,
    };
  }

  // Self-pickup: no rider needed.
  if (fulfillment === "self_pickup") {
    return cov.selfPickupEnabled
      ? { serviceable: true, reason: "self_pickup_ok", message: "", ...base }
      : {
          serviceable: false,
          reason: "self_pickup_disabled",
          message: "Self-pickup isn't available here.",
          ...base,
        };
  }

  // Delivery.
  if (!cov.deliveryEnabled) {
    return {
      serviceable: false,
      reason: "delivery_disabled",
      message: "Delivery isn't available here.",
      ...base,
    };
  }

  const riderOnlineCheckRequired = await isRiderOnlineCheckRequired({
    stateId: avail.stateId,
    stateName: avail.stateName ?? pickup.state,
    pincode: avail.pincode ?? pickup.pincode,
    lat: pickup.lat,
    lng: pickup.lng,
    merchantStoreId: pickup.merchantStoreId,
  });
  if (!riderOnlineCheckRequired) {
    return {
      serviceable: true,
      reason: "serviceable",
      message: "",
      ...base,
      riderOnlineCheckRequired: false,
    };
  }

  let ridersAvailable = 0;
  let onlineRidersInArea = 0;
  if (cov.internalRiderEnabled) {
    const counts = await countAvailableRidersWithinServiceRadius(
      serviceType,
      { lat: pickup.lat, lng: pickup.lng },
      cov.serviceRadiusMeters
    );
    ridersAvailable = counts.available;
    onlineRidersInArea = counts.onlineInArea;
  }

  if (ridersAvailable > 0) {
    return { serviceable: true, reason: "serviceable", message: "", ...base, ridersAvailable };
  }
  if (cov.tplEnabled) {
    return {
      serviceable: true,
      reason: "serviceable",
      message: "",
      ...base,
      ridersAvailable,
      usedTpl: true,
    };
  }
  // Accurate copy: only say "busy" when partners are genuinely online in the area but at
  // capacity; otherwise say none are available (the common real case — no online/fresh
  // rider nearby), instead of the misleading "all busy".
  return {
    serviceable: false,
    reason: "no_rider_available",
    message:
      onlineRidersInArea > 0
        ? "All delivery partners near you are busy right now. Please try again shortly."
        : "No delivery partner is available in your area right now. Please try again shortly.",
    ...base,
    ridersAvailable,
  };
}
