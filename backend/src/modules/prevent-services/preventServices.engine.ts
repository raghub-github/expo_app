/**
 * Prevent Services — emergency location-based service blocking.
 * Central runtime engine used by placement, geo/services, and /v1/prevent-services/check.
 */

import { cacheDel, cacheGet, cacheSet } from "@gatimitra/redis";
import { getSql } from "../../db/client.js";

export const PREVENT_SERVICE_CODES = [
  "food",
  "grocery",
  "parcel",
  "ride",
  "courier",
  "pharmacy",
] as const;

export type PreventServiceCode = (typeof PREVENT_SERVICE_CODES)[number];

export const PREVENT_SERVICE_USER_MESSAGE =
  "This service is temporarily unavailable in your current location. Please try again later or choose another nearby location.";

export const PREVENT_SERVICE_ERROR_CODE = "SERVICE_BLOCKED_IN_LOCATION" as const;

const CACHE_KEY_ACTIVE = "prevent-services:active-v1";
const CACHE_TTL_SEC = 30;

export type PreventMatch = {
  ruleId: string;
  locationId: string;
  locationName: string;
  address: string | null;
  searchType: "flat_search" | "lat_lng";
  latitude: number;
  longitude: number;
  radiusMeters: number;
  distanceMeters: number;
  reason: string | null;
  blockedServices: PreventServiceCode[];
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type PreventCheckResult = {
  blocked: boolean;
  blockedServices: PreventServiceCode[];
  matches: PreventMatch[];
  /** Nearest matching rule (priority when overlaps). */
  nearest: PreventMatch | null;
  message: string | null;
  code: typeof PREVENT_SERVICE_ERROR_CODE | null;
};

type CheckRow = {
  rule_id: string;
  location_id: string;
  location_name: string;
  address: string | null;
  search_type: "flat_search" | "lat_lng";
  latitude: number;
  longitude: number;
  radius_meters: number;
  distance_meters: number;
  reason: string | null;
  blocked_services: string[] | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

function mapRow(r: CheckRow): PreventMatch {
  const services = (r.blocked_services ?? []).filter((s): s is PreventServiceCode =>
    (PREVENT_SERVICE_CODES as readonly string[]).includes(s)
  );
  return {
    ruleId: r.rule_id,
    locationId: r.location_id,
    locationName: r.location_name,
    address: r.address,
    searchType: r.search_type,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    radiusMeters: Number(r.radius_meters),
    distanceMeters: Number(r.distance_meters),
    reason: r.reason,
    blockedServices: services,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  };
}

function isFiniteCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Normalize app/order service labels to prevent-service codes. */
export function toPreventServiceCode(service: string | null | undefined): PreventServiceCode | null {
  if (!service) return null;
  const s = service.trim().toLowerCase();
  if (s === "food" || s === "restaurant") return "food";
  if (s === "grocery") return "grocery";
  if (s === "parcel") return "parcel";
  if (s === "courier") return "courier";
  if (s === "pharmacy" || s === "pharma") return "pharmacy";
  if (s === "ride" || s === "person_ride" || s === "person-ride") return "ride";
  return null;
}

/** Map store_type / category hints onto prevent codes to check. */
export function preventCodesForStoreType(storeType: string | null | undefined): PreventServiceCode[] {
  const t = (storeType ?? "").trim().toUpperCase();
  if (t === "GROCERY") return ["grocery", "food"];
  if (t === "PHARMACY" || t === "MEDICINE") return ["pharmacy", "food"];
  if (t === "COURIER") return ["courier", "parcel"];
  return ["food"];
}

let lastSignalBumpLogAt = 0;

export async function invalidatePreventServicesCache(): Promise<void> {
  await cacheDel(CACHE_KEY_ACTIVE);
  // Rate-limit signal_bumped rows — admin CRUD can touch many tables at once.
  const now = Date.now();
  if (now - lastSignalBumpLogAt > 2_000) {
    lastSignalBumpLogAt = now;
    void logPreventRuntimeEvent({
      action: "signal_bumped",
      ruleId: null,
      reason: "Active-rules cache invalidated after prevent-services change",
      snapshot: { at: new Date().toISOString() },
    });
  }
}

export type PreventRuntimeLogAction =
  | "placement_blocked"
  | "dispatch_blocked"
  | "acceptance_blocked"
  | "signal_bumped"
  | "trigger_fired";

/** In-process throttle so high-frequency dispatch polls do not flood audit logs. */
const auditThrottleMs = new Map<string, number>();

function shouldEmitThrottledAudit(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = auditThrottleMs.get(key) ?? 0;
  if (now - last < windowMs) return false;
  auditThrottleMs.set(key, now);
  if (auditThrottleMs.size > 4_000) {
    for (const [k, t] of auditThrottleMs) {
      if (now - t > windowMs * 2) auditThrottleMs.delete(k);
    }
  }
  return true;
}

/**
 * Fire-and-forget audit row for runtime enforcement. Never throws to callers —
 * logging must not break placement/dispatch under load.
 */
export async function logPreventRuntimeEvent(args: {
  action: PreventRuntimeLogAction;
  ruleId?: string | null;
  reason?: string | null;
  snapshot?: unknown;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO public.prevent_service_logs (
        rule_id, action, admin_name, reason, snapshot
      ) VALUES (
        ${args.ruleId ?? null}::uuid,
        ${args.action},
        'system',
        ${args.reason ?? null},
        ${args.snapshot != null ? JSON.stringify(args.snapshot) : null}::jsonb
      )
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[prevent-services] audit_log_failed", args.action, msg.slice(0, 160));
  }
}

/** Rate-limited companion row when a rule first engages under load. */
function maybeLogTriggerFired(ruleId: string | null | undefined, reason: string, snapshot?: unknown): void {
  if (!ruleId) return;
  if (!shouldEmitThrottledAudit(`trigger_fired:${ruleId}`, 60_000)) return;
  void logPreventRuntimeEvent({
    action: "trigger_fired",
    ruleId,
    reason,
    snapshot,
  });
}

/**
 * Fast path for dispatch pool / wave eligibility: one Redis/DB snapshot of
 * active rules, then in-memory Haversine. Placement still uses the RPC.
 */
export async function checkPreventServicesAtPointCached(args: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  service?: string | null;
}): Promise<PreventCheckResult> {
  if (!isFiniteCoord(args.lat, args.lng)) {
    return {
      blocked: false,
      blockedServices: [],
      matches: [],
      nearest: null,
      message: null,
      code: null,
    };
  }
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  const serviceCode = toPreventServiceCode(args.service ?? null);
  const rules = await loadActivePreventRulesCached();
  const matches: PreventMatch[] = [];
  for (const r of rules) {
    if (serviceCode && !r.blockedServices.includes(serviceCode)) continue;
    const distanceMeters = haversineMeters(lat, lng, r.latitude, r.longitude);
    if (distanceMeters > r.radiusMeters) continue;
    matches.push({
      ruleId: r.ruleId,
      locationId: "",
      locationName: r.locationName,
      address: null,
      searchType: "lat_lng",
      latitude: r.latitude,
      longitude: r.longitude,
      radiusMeters: r.radiusMeters,
      distanceMeters,
      reason: null,
      blockedServices: r.blockedServices,
      status: "active",
      startsAt: null,
      endsAt: null,
    });
  }
  matches.sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (matches.length === 0) {
    return {
      blocked: false,
      blockedServices: [],
      matches: [],
      nearest: null,
      message: null,
      code: null,
    };
  }
  const blockedSet = new Set<PreventServiceCode>();
  for (const m of matches) for (const s of m.blockedServices) blockedSet.add(s);
  const blockedServices = [...blockedSet];
  const nearest = matches[0] ?? null;
  const serviceBlocked =
    serviceCode == null ? blockedServices.length > 0 : blockedServices.includes(serviceCode);
  return {
    blocked: serviceBlocked,
    blockedServices,
    matches,
    nearest,
    message: serviceBlocked ? PREVENT_SERVICE_USER_MESSAGE : null,
    code: serviceBlocked ? PREVENT_SERVICE_ERROR_CODE : null,
  };
}

/**
 * Flips rules whose scheduled `ends_at` has passed to 'expired'.
 *
 * The runtime check already ignores a finished rule, so this is bookkeeping —
 * but the status write bumps `prevent_service_signals`, which is what pushes
 * connected apps to refetch availability immediately at expiry time.
 * Returns the number of rules expired.
 */
export async function expireDuePreventServiceRules(): Promise<number> {
  try {
    const sql = getSql();
    const [row] = await sql<Array<{ expired: number }>>`
      SELECT public.prevent_services_expire_due() AS expired
    `;
    const expired = Number(row?.expired ?? 0);
    if (expired > 0) await invalidatePreventServicesCache();
    return expired;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/prevent_service|prevent_services_expire_due/i.test(msg)) return 0;
    throw err;
  }
}

/**
 * Check whether any active Prevent Services rule covers (lat, lng).
 * If `service` is set, only rules that block that service are returned as blocking.
 * Overlaps: nearest rule is preferred for messaging; ANY matching block wins.
 */
export async function checkPreventServicesAtPoint(args: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  service?: string | null;
}): Promise<PreventCheckResult> {
  if (!isFiniteCoord(args.lat, args.lng)) {
    return {
      blocked: false,
      blockedServices: [],
      matches: [],
      nearest: null,
      message: null,
      code: null,
    };
  }

  const lat = Number(args.lat);
  const lng = Number(args.lng);
  const serviceCode = toPreventServiceCode(args.service ?? null);

  try {
    const sql = getSql();
    const rows = await sql<CheckRow[]>`
      SELECT *
      FROM public.prevent_services_check_point(
        ${lat},
        ${lng},
        ${serviceCode}
      )
    `;

    const matches = (rows ?? []).map(mapRow);
    if (matches.length === 0) {
      return {
        blocked: false,
        blockedServices: [],
        matches: [],
        nearest: null,
        message: null,
        code: null,
      };
    }

    const blockedSet = new Set<PreventServiceCode>();
    for (const m of matches) {
      for (const s of m.blockedServices) blockedSet.add(s);
    }
    const blockedServices = [...blockedSet];
    const nearest = matches[0] ?? null;
    const serviceBlocked =
      serviceCode == null
        ? blockedServices.length > 0
        : blockedServices.includes(serviceCode);

    return {
      blocked: serviceBlocked,
      blockedServices,
      matches,
      nearest,
      message: serviceBlocked ? PREVENT_SERVICE_USER_MESSAGE : null,
      code: serviceBlocked ? PREVENT_SERVICE_ERROR_CODE : null,
    };
  } catch (err) {
    // Migration not applied yet — fail open so existing flows keep working.
    const msg = err instanceof Error ? err.message : String(err);
    if (/prevent_services_check_point|prevent_service_/i.test(msg)) {
      console.warn("[prevent-services] check skipped (schema missing?):", msg.slice(0, 200));
      return {
        blocked: false,
        blockedServices: [],
        matches: [],
        nearest: null,
        message: null,
        code: null,
      };
    }
    throw err;
  }
}

/** Assert a service is allowed at a point; returns a placement-style error object when blocked. */
export async function assertServiceNotPrevented(args: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  service: string;
  /** Override default placement_blocked audit (or pass null to skip). */
  auditAction?: PreventRuntimeLogAction | null;
}): Promise<
  | { ok: true }
  | { ok: false; code: typeof PREVENT_SERVICE_ERROR_CODE; message: string; nearest: PreventMatch | null }
> {
  const result = await checkPreventServicesAtPoint(args);
  if (!result.blocked) return { ok: true };
  const auditAction = args.auditAction === undefined ? "placement_blocked" : args.auditAction;
  if (auditAction) {
    const snapshot = {
      service: args.service,
      lat: args.lat,
      lng: args.lng,
      nearest: result.nearest,
    };
    void logPreventRuntimeEvent({
      action: auditAction,
      ruleId: result.nearest?.ruleId ?? null,
      reason: `service=${args.service}`,
      snapshot,
    });
    maybeLogTriggerFired(result.nearest?.ruleId, `placement;service=${args.service}`, snapshot);
  }
  return {
    ok: false,
    code: PREVENT_SERVICE_ERROR_CODE,
    message: result.message ?? PREVENT_SERVICE_USER_MESSAGE,
    nearest: result.nearest,
  };
}

/** Check multiple points (e.g. ride pickup + drop). Blocked if ANY point blocks the service. */
export async function assertServiceNotPreventedAtAnyPoint(args: {
  points: Array<{ lat: number | null | undefined; lng: number | null | undefined; label?: string }>;
  service: string;
  auditAction?: PreventRuntimeLogAction | null;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      code: typeof PREVENT_SERVICE_ERROR_CODE;
      message: string;
      nearest: PreventMatch | null;
      blockedPointLabel: string | null;
    }
> {
  for (const p of args.points) {
    const result = await checkPreventServicesAtPoint({
      lat: p.lat,
      lng: p.lng,
      service: args.service,
    });
    if (result.blocked) {
      const auditAction = args.auditAction === undefined ? "placement_blocked" : args.auditAction;
      if (auditAction) {
        const snapshot = {
          service: args.service,
          point: p.label ?? null,
          lat: p.lat,
          lng: p.lng,
          nearest: result.nearest,
        };
        void logPreventRuntimeEvent({
          action: auditAction,
          ruleId: result.nearest?.ruleId ?? null,
          reason: `service=${args.service};point=${p.label ?? "point"}`,
          snapshot,
        });
        maybeLogTriggerFired(
          result.nearest?.ruleId,
          `placement;service=${args.service};point=${p.label ?? "point"}`,
          snapshot
        );
      }
      return {
        ok: false,
        code: PREVENT_SERVICE_ERROR_CODE,
        message: result.message ?? PREVENT_SERVICE_USER_MESSAGE,
        nearest: result.nearest,
        blockedPointLabel: p.label ?? null,
      };
    }
  }
  return { ok: true };
}

type ActiveRuleCacheRow = {
  ruleId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  blockedServices: PreventServiceCode[];
  locationName: string;
};

/** Cached snapshot of active rules (for batch / listing filters). */
export async function loadActivePreventRulesCached(): Promise<ActiveRuleCacheRow[]> {
  const cached = await cacheGet<ActiveRuleCacheRow[]>(CACHE_KEY_ACTIVE);
  if (cached) return cached;

  try {
    const sql = getSql();
    await sql`SELECT public.prevent_services_expire_due()`.catch(() => undefined);
    const rows = await sql<
      Array<{
        rule_id: string;
        latitude: number;
        longitude: number;
        radius_meters: number;
        location_name: string;
        blocked_services: string[] | null;
      }>
    >`
      SELECT
        r.id AS rule_id,
        l.latitude,
        l.longitude,
        l.radius_meters,
        l.location_name,
        ARRAY(
          SELECT s.service_code
          FROM public.prevent_service_services s
          WHERE s.rule_id = r.id
          ORDER BY s.service_code
        ) AS blocked_services
      FROM public.prevent_service_rules r
      JOIN public.prevent_service_locations l ON l.id = r.location_id
      WHERE r.deleted_at IS NULL
        AND r.status = 'active'
        AND (r.starts_at IS NULL OR r.starts_at <= NOW())
        AND (r.ends_at IS NULL OR r.ends_at > NOW())
    `;

    const mapped: ActiveRuleCacheRow[] = (rows ?? []).map((r) => ({
      ruleId: r.rule_id,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      radiusMeters: Number(r.radius_meters),
      locationName: r.location_name,
      blockedServices: (r.blocked_services ?? []).filter((s): s is PreventServiceCode =>
        (PREVENT_SERVICE_CODES as readonly string[]).includes(s)
      ),
    }));
    await cacheSet(CACHE_KEY_ACTIVE, mapped, CACHE_TTL_SEC);
    return mapped;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/prevent_service_/i.test(msg)) return [];
    throw err;
  }
}

/**
 * Merge Prevent Services blocks into geo food/parcel/ride flags.
 * When lat/lng missing, returns flags unchanged.
 *
 * IMPORTANT: This is for the *customer pin* (or any single point). It must never
 * be used to turn a merchant store or a rider's duty off wholesale — blocking is
 * always area/order-level. Riders should prefer `coverageFood`/`coverageParcel`/
 * `coverageRide` (pre-prevent) for duty eligibility.
 */
export async function applyPreventServicesToGeoFlags(args: {
  food: boolean;
  parcel: boolean;
  ride: boolean;
  lat?: number | null;
  lng?: number | null;
}): Promise<{
  food: boolean;
  parcel: boolean;
  ride: boolean;
  preventBlocked: PreventServiceCode[];
  /** Nearest matching rule reason (for customer UX). */
  preventReason: string | null;
  preventLocationName: string | null;
  preventRuleId: string | null;
  preventStartsAt: string | null;
  preventEndsAt: string | null;
}> {
  if (!isFiniteCoord(args.lat, args.lng)) {
    return {
      food: args.food,
      parcel: args.parcel,
      ride: args.ride,
      preventBlocked: [],
      preventReason: null,
      preventLocationName: null,
      preventRuleId: null,
      preventStartsAt: null,
      preventEndsAt: null,
    };
  }
  const check = await checkPreventServicesAtPoint({ lat: args.lat, lng: args.lng });
  const blocked = new Set(check.blockedServices);
  // Grocery/pharmacy blocks also hide the food surface; courier hides parcel.
  const foodBlocked = blocked.has("food") || blocked.has("grocery") || blocked.has("pharmacy");
  const parcelBlocked = blocked.has("parcel") || blocked.has("courier");
  const rideBlocked = blocked.has("ride");
  const nearest = check.nearest;
  return {
    food: args.food && !foodBlocked,
    parcel: args.parcel && !parcelBlocked,
    ride: args.ride && !rideBlocked,
    preventBlocked: check.blockedServices,
    preventReason: nearest?.reason?.trim() || null,
    preventLocationName: nearest?.locationName?.trim() || null,
    preventRuleId: nearest?.ruleId ?? null,
    preventStartsAt: nearest?.startsAt ?? null,
    preventEndsAt: nearest?.endsAt ?? null,
  };
}

/** Haversine distance in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

/** Two circles overlap when distance(centers) < r1 + r2. */
export function circlesOverlap(
  aLat: number,
  aLng: number,
  aRadiusM: number,
  bLat: number,
  bLng: number,
  bRadiusM: number
): boolean {
  return haversineMeters(aLat, aLng, bLat, bLng) < aRadiusM + bRadiusM;
}

const DEFAULT_STORE_DELIVERY_RADIUS_M = 8_000;

export function preventCodesForDispatchService(
  serviceType: string
): PreventServiceCode[] {
  const s = serviceType.trim().toLowerCase();
  if (s === "food") return ["food", "grocery", "pharmacy"];
  if (s === "parcel") return ["parcel", "courier"];
  if (s === "person_ride" || s === "ride") return ["ride"];
  return [];
}

/**
 * Area-level gate for dispatch: hide an order only when its relevant
 * pickup/drop point sits inside an active block for that service.
 *
 * Food → drop (customer address) only — a store inside a block still gets
 * orders from unblocked areas.
 * Parcel / ride → pickup OR drop.
 *
 * Returns true when the order must be excluded from the rider pool / wave.
 */
export async function isDispatchOrderBlockedByPrevent(args: {
  serviceType: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
  /** When true, write a dispatch_blocked audit row (use for wave/accept, not tight pool polls). */
  audit?: boolean;
  orderId?: string | null;
}): Promise<boolean> {
  const codes = preventCodesForDispatchService(args.serviceType);
  if (codes.length === 0) return false;

  const points: Array<{ lat: number; lng: number; label: string }> = [];
  const isFood = args.serviceType.trim().toLowerCase() === "food";

  if (!isFood && isFiniteCoord(args.pickupLat, args.pickupLng)) {
    points.push({ lat: args.pickupLat!, lng: args.pickupLng!, label: "pickup" });
  }
  if (isFiniteCoord(args.dropLat, args.dropLng)) {
    points.push({ lat: args.dropLat!, lng: args.dropLng!, label: "drop" });
  }
  if (points.length === 0) return false;

  for (const code of codes) {
    // Prefer cached snapshot for pool/wave volume; avoid N RPCs per rider poll.
    let hit: PreventCheckResult | null = null;
    for (const p of points) {
      const result = await checkPreventServicesAtPointCached({
        lat: p.lat,
        lng: p.lng,
        service: code,
      });
      if (result.blocked) {
        hit = result;
        break;
      }
    }
    if (hit) {
      if (args.audit) {
        const throttleKey = `dispatch_blocked:${args.orderId ?? "unknown"}:${code}`;
        if (shouldEmitThrottledAudit(throttleKey, 60_000)) {
          const snapshot = {
            serviceType: args.serviceType,
            orderId: args.orderId ?? null,
            nearest: hit.nearest,
          };
          void logPreventRuntimeEvent({
            action: "dispatch_blocked",
            ruleId: hit.nearest?.ruleId ?? null,
            reason: `serviceType=${args.serviceType};order=${args.orderId ?? ""}`,
            snapshot,
          });
          maybeLogTriggerFired(
            hit.nearest?.ruleId,
            `dispatch;serviceType=${args.serviceType}`,
            snapshot
          );
        }
      }
      return true;
    }
  }
  return false;
}

export type PreventImpactSummary = {
  affected: boolean;
  signalVersion: number;
  overlappingRules: Array<{
    ruleId: string;
    locationName: string;
    radiusMeters: number;
    blockedServices: PreventServiceCode[];
    reason: string | null;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  blockedServices: PreventServiceCode[];
};

export async function getPreventSignalVersion(): Promise<number> {
  try {
    const sql = getSql();
    const [row] = await sql<Array<{ version: number | string }>>`
      SELECT version FROM public.prevent_service_signals WHERE id = 1 LIMIT 1
    `;
    return Number(row?.version ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * A store is "affected" when any active block for services it sells overlaps
 * its delivery circle. The store itself is NEVER turned offline — only orders
 * whose drop falls inside a block are rejected at placement.
 */
export async function evaluateStorePreventImpact(args: {
  storeLat: number | null | undefined;
  storeLng: number | null | undefined;
  deliveryRadiusKm?: number | null;
  storeType?: string | null;
}): Promise<PreventImpactSummary> {
  const signalVersion = await getPreventSignalVersion();
  const empty: PreventImpactSummary = {
    affected: false,
    signalVersion,
    overlappingRules: [],
    blockedServices: [],
  };
  if (!isFiniteCoord(args.storeLat, args.storeLng)) return empty;

  const storeRadiusM =
    args.deliveryRadiusKm != null &&
    Number.isFinite(Number(args.deliveryRadiusKm)) &&
    Number(args.deliveryRadiusKm) > 0
      ? Number(args.deliveryRadiusKm) * 1000
      : DEFAULT_STORE_DELIVERY_RADIUS_M;

  const relevant = new Set(preventCodesForStoreType(args.storeType));
  const rules = await loadActivePreventRulesCached();
  const overlapping: PreventImpactSummary["overlappingRules"] = [];
  const blocked = new Set<PreventServiceCode>();

  for (const rule of rules) {
    const overlapServices = rule.blockedServices.filter((c) => relevant.has(c));
    if (overlapServices.length === 0) continue;
    if (
      !circlesOverlap(
        args.storeLat!,
        args.storeLng!,
        storeRadiusM,
        rule.latitude,
        rule.longitude,
        rule.radiusMeters
      )
    ) {
      continue;
    }
    overlapping.push({
      ruleId: rule.ruleId,
      locationName: rule.locationName,
      radiusMeters: rule.radiusMeters,
      blockedServices: overlapServices,
      reason: null,
      startsAt: null,
      endsAt: null,
    });
    for (const c of overlapServices) blocked.add(c);
  }

  return {
    affected: overlapping.length > 0,
    signalVersion,
    overlappingRules: overlapping,
    blockedServices: [...blocked],
  };
}

/**
 * A rider is "affected" (for UX only) when their live GPS is near any active
 * block for services they can do — within (blockRadius + proximityBuffer).
 * Duty status and service pool must NOT change because of this.
 */
export async function evaluateRiderPreventImpact(args: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Extra meters beyond the block radius to show the advisory sheet. */
  proximityBufferMeters?: number;
}): Promise<PreventImpactSummary> {
  const signalVersion = await getPreventSignalVersion();
  const empty: PreventImpactSummary = {
    affected: false,
    signalVersion,
    overlappingRules: [],
    blockedServices: [],
  };
  if (!isFiniteCoord(args.lat, args.lng)) return empty;

  const buffer = args.proximityBufferMeters ?? 5_000;
  const rules = await loadActivePreventRulesCached();
  const overlapping: PreventImpactSummary["overlappingRules"] = [];
  const blocked = new Set<PreventServiceCode>();

  for (const rule of rules) {
    const dist = haversineMeters(args.lat!, args.lng!, rule.latitude, rule.longitude);
    if (dist > rule.radiusMeters + buffer) continue;
    overlapping.push({
      ruleId: rule.ruleId,
      locationName: rule.locationName,
      radiusMeters: rule.radiusMeters,
      blockedServices: rule.blockedServices,
      reason: null,
      startsAt: null,
      endsAt: null,
    });
    for (const c of rule.blockedServices) blocked.add(c);
  }

  return {
    affected: overlapping.length > 0,
    signalVersion,
    overlappingRules: overlapping,
    blockedServices: [...blocked],
  };
}

export type PreventRuleImpactCounts = {
  affectedMerchants: number;
  affectedRiders: number;
};

/**
 * Approx impact for Super Admin visibility: merchants whose delivery circle
 * overlaps the rule, and on-duty riders whose live GPS sits inside the rule.
 */
export async function countImpactForRule(args: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  blockedServices: PreventServiceCode[];
}): Promise<PreventRuleImpactCounts> {
  try {
    const sql = getSql();
    const lat = args.latitude;
    const lng = args.longitude;
    const radiusM = args.radiusMeters;
    const foodish = args.blockedServices.some((c) =>
      c === "food" || c === "grocery" || c === "pharmacy"
    );

    // Merchants: active stores with coords whose delivery circle overlaps the block.
    // Default 8 km when delivery_radius_km is null — matches product example.
    const [merchantRow] = foodish
      ? await sql<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n
          FROM merchant_stores ms
          WHERE COALESCE(ms.is_active, true) = true
            AND ms.latitude IS NOT NULL
            AND ms.longitude IS NOT NULL
            AND (
              6371000.0 * 2 * ASIN(
                SQRT(
                  POWER(SIN(RADIANS(ms.latitude::float8 - ${lat}) / 2), 2) +
                  COS(RADIANS(${lat})) * COS(RADIANS(ms.latitude::float8)) *
                  POWER(SIN(RADIANS(ms.longitude::float8 - ${lng}) / 2), 2)
                )
              )
            ) < (
              COALESCE(NULLIF(ms.delivery_radius_km::float8, 0), 8) * 1000
              + ${radiusM}
            )
        `
      : [{ n: 0 }];

    // On-duty riders with a fresh live location inside the blocked radius.
    const [riderRow] = await sql<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT rcl.rider_id)::int AS n
      FROM rider_current_locations rcl
      INNER JOIN riders r ON r.id = rcl.rider_id
      INNER JOIN LATERAL (
        SELECT dl.status
        FROM duty_logs dl
        WHERE dl.rider_id = rcl.rider_id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE r.deleted_at IS NULL
        AND r.status = 'ACTIVE'
        AND ld.status = 'ON'
        AND rcl.last_seen_at > NOW() - INTERVAL '15 minutes'
        AND (
          6371000.0 * 2 * ASIN(
            SQRT(
              POWER(SIN(RADIANS(rcl.lat - ${lat}) / 2), 2) +
              COS(RADIANS(${lat})) * COS(RADIANS(rcl.lat)) *
              POWER(SIN(RADIANS(rcl.lng - ${lng}) / 2), 2)
            )
          )
        ) <= ${radiusM}
    `;

    return {
      affectedMerchants: Number(merchantRow?.n ?? 0) || 0,
      affectedRiders: Number(riderRow?.n ?? 0) || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Column name drift (is_on_duty / deleted_at) — degrade gracefully.
    if (/column|relation|prevent_/i.test(msg)) {
      return { affectedMerchants: 0, affectedRiders: 0 };
    }
    throw err;
  }
}
