/**
 * Rider eligibility orchestrator — the ONE backend-authoritative entry point that
 * loads a rider's real vehicle + document-verification state, resolves the effective
 * geo policy for the order's location, and runs the deterministic engine. Order
 * assignment/acceptance calls this; the app is never trusted.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { riderDocuments, riderVehicles } from "../../db/schema.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../ride-state-config/rideStateConfig.repository.js";
import {
  resolveRiderServiceEligibility,
  type EligibilityDecision,
  type EligibilityService,
  type RiderEligibilityInput,
} from "./eligibilityEngine.js";
import {
  docStateFrom,
  ownershipFromVehicle,
  vehicleClassFromCategory,
} from "./riderEligibilityInputs.js";
import { resolveEffectiveEligibilityPolicy } from "./riderEligibility.repository.js";
import { defaultPolicyForService } from "./serviceEligibilityDefaults.js";

/** A rider document is verified when the backend/provider says so (never the app).
 * Exported for scenario testing — encodes the Cashfree/manual verification contract. */
export function docVerified(row: {
  verified: boolean | null;
  verificationMethod: string | null;
  verificationStatus: string | null;
} | undefined): { verified: boolean; submitted: boolean; rejected: boolean } {
  if (!row) return { verified: false, submitted: false, rejected: false };
  const method = String(row.verificationMethod || "").toUpperCase();
  const status = String(row.verificationStatus || "").toLowerCase();
  const verified =
    row.verified === true ||
    status === "auto_verified" ||
    status === "approved" ||
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK";
  const rejected = status === "rejected" || status === "auto_rejected";
  const submitted = !verified && !rejected && Boolean(row.verificationMethod || row.verificationStatus);
  return { verified, submitted, rejected };
}

/**
 * Load the rider's eligibility inputs from the authoritative tables:
 *  - active+verified rider_vehicles → class (2W/3W/4W), fuel, commercial/ownership;
 *  - rider_documents (dl, rc) → verification DocState.
 */
export async function loadRiderEligibilityAttributes(
  riderId: number
): Promise<RiderEligibilityInput> {
  const db = getDb();

  // Read the rider's ACTIVE vehicle's declared attributes (class/fuel/ownership) — these are
  // known at selection, independent of RC verification. A verified vehicle is preferred when
  // present, but an unverified one still supplies the attributes so a service whose RC is
  // optional (e.g. food) can be evaluated. Document VERIFICATION is handled separately below.
  const [vehicle] = await db
    .select({
      vehicleType: riderVehicles.vehicleType,
      vehicleCategory: riderVehicles.vehicleCategory,
      fuelType: riderVehicles.fuelType,
      isCommercial: riderVehicles.isCommercial,
      ownershipType: riderVehicles.ownershipType,
    })
    .from(riderVehicles)
    .where(
      and(
        eq(riderVehicles.riderId, riderId),
        eq(riderVehicles.isActive, true),
        isNull(riderVehicles.deletedAt)
      )
    )
    .orderBy(desc(riderVehicles.verified))
    .limit(1);

  const docs = await db
    .select({
      docType: riderDocuments.docType,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      metadata: riderDocuments.metadata,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const now = Date.now();
  const isDocExpired = (row: (typeof docs)[number] | undefined): boolean => {
    const raw = (row?.metadata as { expiresAt?: string } | null | undefined)?.expiresAt;
    if (!raw) return false;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) && t < now;
  };

  const dlRow = docs.find((d) => d.docType === "dl");
  const rcRow = docs.find((d) => d.docType === "rc");
  const dl = docVerified(dlRow);
  const rc = docVerified(rcRow);

  return {
    vehicleClass: vehicleClassFromCategory(vehicle?.vehicleCategory ?? null, vehicle?.vehicleType ?? null),
    vehicleType: vehicle?.vehicleType ?? null,
    fuelKind: vehicle?.fuelType ?? null,
    ownership: ownershipFromVehicle(vehicle?.isCommercial ?? false),
    dl: docStateFrom({ ...dl, expired: isDocExpired(dlRow) }),
    rc: docStateFrom({ ...rc, expired: isDocExpired(rcRow) }),
  };
}

/** Resolve eligibility for a rider + service at an already-resolved geo node. */
export async function resolveRiderServiceEligibilityForGeo(args: {
  riderId: number;
  service: EligibilityService;
  geoLevel: string;
  geoRefId: string;
  attributes?: RiderEligibilityInput;
}): Promise<EligibilityDecision> {
  const attributes = args.attributes ?? (await loadRiderEligibilityAttributes(args.riderId));
  const policy = await resolveEffectiveEligibilityPolicy({
    level: args.geoLevel,
    refId: args.geoRefId,
    service: args.service,
  });
  return resolveRiderServiceEligibility(attributes, policy);
}

/**
 * Resolve eligibility for a rider + service at an order's PICKUP location. Falls back
 * to the code default policy (no geo block) when the pickup geo cannot be resolved, so
 * eligibility is still evaluated on documents/vehicle and dispatch never wedges.
 */
export async function resolveRiderServiceEligibilityAtPickup(args: {
  riderId: number;
  service: EligibilityService;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPincode?: string | null;
  pickupState?: string | null;
  attributes?: RiderEligibilityInput;
}): Promise<EligibilityDecision> {
  const attributes = args.attributes ?? (await loadRiderEligibilityAttributes(args.riderId));

  let geoLevel: string | null = null;
  let geoRefId: string | null = null;
  try {
    const geo = await resolveGeoLocation({
      latitude: args.pickupLat ?? undefined,
      longitude: args.pickupLng ?? undefined,
      livePincode: args.pickupPincode ?? undefined,
      liveState: args.pickupState ?? undefined,
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (anchor) {
      geoLevel = anchor.level;
      geoRefId = anchor.refId;
    }
  } catch {
    /* fall through to default policy */
  }

  const policy =
    geoLevel && geoRefId
      ? await resolveEffectiveEligibilityPolicy({ level: geoLevel, refId: geoRefId, service: args.service })
      : defaultPolicyForService(args.service);

  return resolveRiderServiceEligibility(attributes, policy);
}

/** All rider-facing services, in display order. */
export const ALL_ELIGIBILITY_SERVICES: EligibilityService[] = ["food", "parcel", "person_ride"];

/**
 * Rider-facing "my eligibility for every service, here" — loads the rider's real
 * attributes ONCE, resolves the geo ONCE, then runs the SAME engine per service. Powers
 * the rider-app surface that shows WHY a service is (in)eligible so PREFERENCE is never
 * confused with ELIGIBILITY. Falls back to the code-default policy (no geo block) when the
 * location can't be resolved, so the rider still sees a document/vehicle-based decision.
 */
export async function resolveRiderAllServiceEligibilityAtLocation(args: {
  riderId: number;
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  state?: string | null;
}): Promise<{
  attributes: RiderEligibilityInput;
  resolvedGeo: { level: string; refId: string } | null;
  services: Record<EligibilityService, EligibilityDecision>;
}> {
  const attributes = await loadRiderEligibilityAttributes(args.riderId);

  let resolvedGeo: { level: string; refId: string } | null = null;
  try {
    const geo = await resolveGeoLocation({
      latitude: args.lat ?? undefined,
      longitude: args.lng ?? undefined,
      livePincode: args.pincode ?? undefined,
      liveState: args.state ?? undefined,
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (anchor) resolvedGeo = { level: anchor.level, refId: anchor.refId };
  } catch {
    /* fall through to default policy per service */
  }

  const services = {} as Record<EligibilityService, EligibilityDecision>;
  for (const service of ALL_ELIGIBILITY_SERVICES) {
    const policy = resolvedGeo
      ? await resolveEffectiveEligibilityPolicy({
          level: resolvedGeo.level,
          refId: resolvedGeo.refId,
          service,
        })
      : defaultPolicyForService(service);
    services[service] = resolveRiderServiceEligibility(attributes, policy);
  }

  return { attributes, resolvedGeo, services };
}

/* ─────────────────────────── Enforcement (accept/assign) ─────────────────────── */

/**
 * Rollout mode for eligibility ENFORCEMENT at order accept/assignment:
 *  - "off":     do not evaluate (kill switch).
 *  - "shadow":  evaluate + log what WOULD be blocked, but never block (DEFAULT — safe
 *               to deploy without retroactively blocking existing riders under the new
 *               default policy; observe impact first).
 *  - "enforce": actually block ineligible accepts (flip on once geo policies are set).
 * Controlled by RIDER_ELIGIBILITY_MODE. The VPS env has override authority.
 */
export type EligibilityEnforcementMode = "off" | "shadow" | "enforce";

export function eligibilityEnforcementMode(): EligibilityEnforcementMode {
  const v = String(process.env.RIDER_ELIGIBILITY_MODE || "shadow").trim().toLowerCase();
  return v === "off" || v === "enforce" ? v : "shadow";
}

export class RiderServiceIneligibleError extends Error {
  statusCode = 403;
  code = "rider_service_ineligible";
  decision: EligibilityDecision;
  constructor(decision: EligibilityDecision) {
    super(decision.blocking[0]?.reason || "You are not eligible for this service at this location.");
    this.name = "RiderServiceIneligibleError";
    this.decision = decision;
  }
}

export function mapOrderTypeToEligibilityService(orderType: string): EligibilityService | null {
  const t = String(orderType || "").trim().toLowerCase();
  if (t === "food") return "food";
  if (t === "parcel") return "parcel";
  if (t === "person_ride" || t === "ride") return "person_ride";
  return null;
}

/**
 * Backend-authoritative eligibility gate for order accept/assignment. Honors the
 * rollout mode: shadow logs, enforce throws RiderServiceIneligibleError (403). Never
 * blocks on an infra error — eligibility must never wedge live dispatch.
 */
export async function assertRiderEligibleForOrderAccept(args: {
  riderId: number;
  orderType: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<void> {
  const mode = eligibilityEnforcementMode();
  if (mode === "off") return;
  const service = mapOrderTypeToEligibilityService(args.orderType);
  if (!service) return;

  let decision: EligibilityDecision;
  try {
    decision = await resolveRiderServiceEligibilityAtPickup({
      riderId: args.riderId,
      service,
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      pickupPincode: args.pickupPincode,
      pickupState: args.pickupState,
    });
  } catch (err) {
    console.warn("[rider-eligibility] check skipped (infra):", args.riderId, (err as Error)?.message ?? err);
    return;
  }

  if (decision.eligible) return;
  const reasons = decision.blocking.map((b) => b.code).join(",");
  if (mode === "shadow") {
    console.info("[rider-eligibility][shadow] would block accept", {
      riderId: args.riderId,
      service,
      reasons,
      geo: decision.resolvedGeo,
    });
    return;
  }
  console.info("[rider-eligibility][enforce] blocked accept", { riderId: args.riderId, service, reasons });
  throw new RiderServiceIneligibleError(decision);
}
