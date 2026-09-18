/**
 * Rider eligibility orchestrator — the ONE backend-authoritative entry point that
 * loads a rider's real vehicle + document-verification state, resolves the effective
 * geo policy for the order's location, and runs the deterministic engine. Order
 * assignment/acceptance calls this; the app is never trusted.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments, riderVehicles } from "../../db/schema.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../ride-state-config/rideStateConfig.repository.js";
import {
  resolveRiderServiceEligibility,
  applyEligibilityOverride,
  type EligibilityDecision,
  type EligibilityService,
  type RiderEligibilityInput,
} from "./eligibilityEngine.js";
import { loadActiveOverridesForRider } from "./riderEligibilityOverrides.repository.js";
import {
  docStateFrom,
  ownershipFromVehicle,
  rcDocStateFromVehicle,
  resolveOwnershipProofState,
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
  fileUrl?: string | null;
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
  const fileUrl = String(row.fileUrl || "").trim();
  const hasUpload =
    Boolean(fileUrl) &&
    !/cashfree_(dl|rc|pan)_verified|digilocker_verified|aadhaar_masking_verified/i.test(fileUrl);
  const submitted =
    !verified &&
    !rejected &&
    (Boolean(row.verificationMethod || row.verificationStatus) ||
      method === "MANUAL_UPLOAD" ||
      hasUpload ||
      status === "pending");
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

  // Resolve the vehicle whose attributes drive eligibility. Prefer the rider's chosen ACTIVE
  // vehicle (riders.active_vehicle_id); fall back to the verified-first active vehicle when no
  // active vehicle is set (single-vehicle / legacy riders — unchanged behaviour). Attributes
  // (class/fuel/ownership) come from the vehicle row; RC verification is per-vehicle.
  const vehicleCols = {
    vehicleType: riderVehicles.vehicleType,
    vehicleCategory: riderVehicles.vehicleCategory,
    fuelType: riderVehicles.fuelType,
    isCommercial: riderVehicles.isCommercial,
    ownershipType: riderVehicles.ownershipType,
    verified: riderVehicles.verified,
    fitnessExpiry: riderVehicles.fitnessExpiry,
    permitExpiry: riderVehicles.permitExpiry,
  };
  const [riderRow] = await db
    .select({ activeVehicleId: riders.activeVehicleId })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  type VehicleRow = {
    vehicleType: string | null;
    vehicleCategory: string | null;
    fuelType: string | null;
    isCommercial: boolean | null;
    ownershipType: string | null;
    verified: boolean | null;
    fitnessExpiry: string | null;
    permitExpiry: string | null;
  };
  let vehicle: VehicleRow | undefined;
  if (riderRow?.activeVehicleId != null) {
    [vehicle] = await db
      .select(vehicleCols)
      .from(riderVehicles)
      .where(
        and(
          eq(riderVehicles.id, riderRow.activeVehicleId),
          eq(riderVehicles.riderId, riderId),
          isNull(riderVehicles.deletedAt)
        )
      )
      .limit(1);
  }
  if (!vehicle) {
    // Offline / no selected vehicle: only auto-bind when the rider has exactly one
    // garage vehicle. Two vehicles must be chosen explicitly at ON-DUTY.
    const garage = await db
      .select({
        id: riderVehicles.id,
        status: riderVehicles.vehicleActiveStatus,
        vehicleType: riderVehicles.vehicleType,
        vehicleCategory: riderVehicles.vehicleCategory,
        fuelType: riderVehicles.fuelType,
        isCommercial: riderVehicles.isCommercial,
        ownershipType: riderVehicles.ownershipType,
        verified: riderVehicles.verified,
        fitnessExpiry: riderVehicles.fitnessExpiry,
        permitExpiry: riderVehicles.permitExpiry,
      })
      .from(riderVehicles)
      .where(and(eq(riderVehicles.riderId, riderId), isNull(riderVehicles.deletedAt)));
    const live = garage.filter((row) => String(row.status ?? "active").toLowerCase() !== "retired");
    if (live.length === 1) {
      const only = live[0]!;
      vehicle = {
        vehicleType: only.vehicleType,
        vehicleCategory: only.vehicleCategory,
        fuelType: only.fuelType,
        isCommercial: only.isCommercial,
        ownershipType: only.ownershipType,
        verified: only.verified,
        fitnessExpiry: only.fitnessExpiry,
        permitExpiry: only.permitExpiry,
      };
    }
  }

  const docs = await db
    .select({
      docType: riderDocuments.docType,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      expiryDate: riderDocuments.expiryDate,
      fileUrl: riderDocuments.fileUrl,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const now = Date.now();
  const isDocExpired = (row: (typeof docs)[number] | undefined): boolean => {
    const raw = row?.expiryDate;
    if (!raw) return false;
    const t = new Date(String(raw)).getTime();
    return Number.isFinite(t) && t < now;
  };

  const stateFor = (docType: string) => {
    const row = docs.find((d) => d.docType === docType);
    return docStateFrom({ ...docVerified(row), expired: isDocExpired(row) });
  };
  const dlRow = docs.find((d) => d.docType === "dl");
  const rcRow = docs.find((d) => d.docType === "rc");
  const dl = docVerified(dlRow);

  // RC is PER-VEHICLE: use the resolved vehicle's own verification + fitness/permit validity.
  // Fall back to the rider-level rc document only when no vehicle row is present.
  const rc = vehicle
    ? rcDocStateFromVehicle({
        verified: vehicle.verified,
        fitnessExpiry: vehicle.fitnessExpiry,
        permitExpiry: vehicle.permitExpiry,
      })
    : docStateFrom({ ...docVerified(rcRow), expired: isDocExpired(rcRow) });

  return {
    vehicleClass: vehicleClassFromCategory(vehicle?.vehicleCategory ?? null, vehicle?.vehicleType ?? null),
    vehicleType: vehicle?.vehicleType ?? null,
    fuelKind: vehicle?.fuelType ?? null,
    ownership: ownershipFromVehicle(vehicle?.isCommercial ?? false),
    dl: docStateFrom({ ...dl, expired: isDocExpired(dlRow) }),
    rc,
    evProof: stateFor("ev_proof"),
    ownershipProof: resolveOwnershipProofState({
      dedicated: stateFor("ownership_proof"),
      rcDocument: stateFor("rc"),
      vehicleRc: rc,
      rentalProof: stateFor("rental_proof"),
      evOwnershipProof: stateFor("ev_ownership_proof"),
    }),
    commercialProof: stateFor("commercial_proof"),
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
  const decision = resolveRiderServiceEligibility(attributes, policy);
  const overrides = await loadActiveOverridesForRider(args.riderId);
  return applyEligibilityOverride(decision, overrides[args.service]);
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

  const decision = resolveRiderServiceEligibility(attributes, policy);
  const overrides = await loadActiveOverridesForRider(args.riderId);
  let finalDecision = applyEligibilityOverride(decision, overrides[args.service]);

  try {
    const { resolveGeoServiceAvailability } = await import(
      "../geo/geoServiceAvailability.service.js"
    );
    const coverage = await resolveGeoServiceAvailability({
      lat: args.pickupLat,
      lng: args.pickupLng,
      pincode: args.pickupPincode,
      state: args.pickupState,
    });
    if (coverage.found) {
      const on =
        args.service === "food"
          ? coverage.coverageFood
          : args.service === "parcel"
            ? coverage.coverageParcel
            : coverage.coverageRide;
      if (!on) {
        const block = {
          code: "SERVICE_DISABLED" as const,
          reason: "Oops! This service isn’t available in your area yet.",
          requiredAction: undefined,
        };
        const already = finalDecision.blocking.some((b) => b.code === "SERVICE_DISABLED");
        finalDecision = {
          ...finalDecision,
          eligible: false,
          blocking: already ? finalDecision.blocking : [block, ...finalDecision.blocking],
          reasonCode: "SERVICE_DISABLED",
          nextAction: "CONTINUE",
        };
      }
    }
  } catch {
    /* never wedge accept on coverage lookup */
  }

  return finalDecision;
}

/** All rider-facing services, in display order. */
export const ALL_ELIGIBILITY_SERVICES: EligibilityService[] = ["food", "parcel", "person_ride"];

/**
 * RTO state code / name from the rider's operating vehicle — used when the rider
 * profile has no home lat/pincode/state yet (typical mid-onboarding).
 */
async function loadActiveVehicleRegistrationState(riderId: number): Promise<string | null> {
  const db = getDb();
  const [riderRow] = await db
    .select({ activeVehicleId: riders.activeVehicleId })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const pick = async (vehicleId?: number | null) => {
    if (vehicleId == null) return undefined;
    const [row] = await db
      .select({ registrationState: riderVehicles.registrationState })
      .from(riderVehicles)
      .where(
        and(
          eq(riderVehicles.id, vehicleId),
          eq(riderVehicles.riderId, riderId),
          isNull(riderVehicles.deletedAt)
        )
      )
      .limit(1);
    return row;
  };

  let row = await pick(riderRow?.activeVehicleId ?? null);
  if (!row?.registrationState) {
    [row] = await db
      .select({ registrationState: riderVehicles.registrationState })
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
  }
  const s = row?.registrationState?.trim();
  return s || null;
}

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
  /**
   * Onboarding PREVIEW: merge the vehicle attributes the rider is currently choosing in the
   * form (vehicleClass/vehicleType/fuelKind/ownership) OVER their real, backend-resolved
   * inputs (DL/RC verification, EV/ownership/commercial proof stay authoritative). Lets the
   * "Services you will deliver" picker show exactly what THIS vehicle would be eligible for
   * before it is saved — without ever trusting the client for document verification (§4/§7).
   */
  attributesOverride?: Partial<RiderEligibilityInput> | null;
}): Promise<{
  attributes: RiderEligibilityInput;
  resolvedGeo: { level: string; refId: string } | null;
  services: Record<EligibilityService, EligibilityDecision>;
}> {
  const base = await loadRiderEligibilityAttributes(args.riderId);
  const attributes: RiderEligibilityInput = args.attributesOverride
    ? { ...base, ...args.attributesOverride }
    : base;
  const overrides = await loadActiveOverridesForRider(args.riderId);

  let resolvedGeo: { level: string; refId: string } | null = null;
  // Onboarding riders often have no saved lat/pincode/state yet. Fall back to the
  // active vehicle's RTO registration_state (e.g. HR) so geo person_ride rules apply
  // instead of the commercial-required GLOBAL default.
  let liveState = args.state ?? null;
  let livePincode = args.pincode ?? null;
  const hasCoords =
    args.lat != null &&
    args.lng != null &&
    Number.isFinite(Number(args.lat)) &&
    Number.isFinite(Number(args.lng)) &&
    !(Number(args.lat) === 0 && Number(args.lng) === 0);
  if (!liveState && !livePincode && !hasCoords) {
    const regState = await loadActiveVehicleRegistrationState(args.riderId);
    if (regState) liveState = regState;
  }
  try {
    const geo = await resolveGeoLocation({
      latitude: args.lat ?? undefined,
      longitude: args.lng ?? undefined,
      livePincode: livePincode ?? undefined,
      liveState: liveState ?? undefined,
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
    const decision = resolveRiderServiceEligibility(attributes, policy);
    services[service] = applyEligibilityOverride(decision, overrides[service]);
  }

  // Layer 2 — Geo & coverage customer toggles (states/... is_food/parcel/ride_enabled).
  // Docs/vehicle may pass, but an OFF coverage toggle still locks the service.
  await applyGeoCoverageServiceGates(services, {
    lat: args.lat ?? null,
    lng: args.lng ?? null,
    pincode: livePincode,
    state: liveState,
  });

  return { attributes, resolvedGeo, services };
}

/**
 * AND Geo & coverage FOOD/PARCEL/RIDE toggles onto engine decisions.
 * Uses coverage* flags (before Prevent Services) so duty eligibility matches the
 * Super Admin Geo & coverage tree the ops team toggles.
 */
export async function applyGeoCoverageServiceGates(
  services: Record<EligibilityService, EligibilityDecision>,
  location: {
    lat?: number | null;
    lng?: number | null;
    pincode?: string | null;
    state?: string | null;
  },
): Promise<void> {
  try {
    const { resolveGeoServiceAvailability } = await import(
      "../geo/geoServiceAvailability.service.js"
    );
    const coverage = await resolveGeoServiceAvailability({
      lat: location.lat,
      lng: location.lng,
      pincode: location.pincode,
      state: location.state,
    });
    // Unknown geo → do not invent an OFF lock (engine policy already ran).
    if (!coverage.found) return;

    const enabled: Record<EligibilityService, boolean> = {
      food: coverage.coverageFood === true,
      parcel: coverage.coverageParcel === true,
      person_ride: coverage.coverageRide === true,
    };

    for (const service of ALL_ELIGIBILITY_SERVICES) {
      if (enabled[service]) continue;
      const current = services[service];
      const alreadyDisabled = current.blocking.some((b) => b.code === "SERVICE_DISABLED");
      const block = {
        code: "SERVICE_DISABLED" as const,
        reason: "Oops! This service isn’t available in your area yet.",
        requiredAction: undefined,
      };
      services[service] = {
        ...current,
        eligible: false,
        blocking: alreadyDisabled ? current.blocking : [block, ...current.blocking],
        reasonCode: "SERVICE_DISABLED",
        nextAction: "CONTINUE",
      };
    }
  } catch (err) {
    console.warn(
      "[rider-eligibility] geo coverage gate skipped:",
      (err as Error)?.message ?? err,
    );
  }
}

/** Registered working location — used when the app has no live GPS yet. */
export async function loadRiderRegisteredLocation(riderId: number): Promise<{
  lat: number | null;
  lng: number | null;
  pincode: string | null;
  state: string | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      lat: riders.lat,
      lon: riders.lon,
      pincode: riders.pincode,
      state: riders.state,
    })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  return {
    lat: row?.lat ?? null,
    lng: row?.lon ?? null,
    pincode: row?.pincode ?? null,
    state: row?.state ?? null,
  };
}

export function applyRestrictionBlocks(
  services: Record<EligibilityService, EligibilityDecision>,
  snapshot: {
    allServicesBlocked: boolean;
    blockedServices: EligibilityService[];
  },
): Record<EligibilityService, EligibilityDecision> {
  const next = { ...services };
  for (const service of ALL_ELIGIBILITY_SERVICES) {
    const blocked =
      snapshot.allServicesBlocked || snapshot.blockedServices.includes(service);
    if (!blocked) continue;
    const current = next[service];
    const code = snapshot.allServicesBlocked ? "ACCOUNT_RESTRICTED" : "ADMIN_BLOCKED";
    const label = service === "person_ride" ? "Person Ride" : service;
    const reason = snapshot.allServicesBlocked
      ? "Your account is restricted from receiving orders."
      : `You are currently blocked from ${label} orders.`;
    next[service] = {
      ...current,
      eligible: false,
      blocking: [
        { code, reason, requiredAction: "Contact support if you believe this is a mistake." },
        ...current.blocking,
      ],
      reasonCode: code,
      nextAction: "CONTINUE",
    };
  }
  return next;
}

/**
 * Rider-facing + assignment-facing eligibility: engine at a location, then account
 * restriction / blacklist / wallet blocks. Home, KYC, Vehicles, duty toggle, and
 * dispatch must share this interpretation.
 */
export async function resolveRiderUnifiedServiceEligibility(args: {
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
  let lat = args.lat ?? null;
  let lng = args.lng ?? null;
  let pincode = args.pincode ?? null;
  let state = args.state ?? null;
  const hasCoords =
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    !(Number(lat) === 0 && Number(lng) === 0);
  if (!hasCoords && !pincode && !state) {
    const registered = await loadRiderRegisteredLocation(args.riderId);
    lat = registered.lat;
    lng = registered.lng;
    pincode = registered.pincode;
    state = registered.state;
  }

  const result = await resolveRiderAllServiceEligibilityAtLocation({
    riderId: args.riderId,
    lat,
    lng,
    pincode,
    state,
  });
  const { getRiderDispatchBlockSnapshot } = await import("../../lib/rider-account-restrictions.js");
  const snapshot = await getRiderDispatchBlockSnapshot(args.riderId);
  return {
    ...result,
    services: applyRestrictionBlocks(result.services, snapshot),
  };
}

export async function filterServicesByUnifiedEligibility(args: {
  riderId: number;
  requested: EligibilityService[];
  lat?: number | null;
  lng?: number | null;
}): Promise<EligibilityService[]> {
  if (eligibilityEnforcementMode() === "off") return args.requested;
  const { services } = await resolveRiderUnifiedServiceEligibility({
    riderId: args.riderId,
    lat: args.lat,
    lng: args.lng,
  });
  return args.requested.filter((s) => services[s]?.eligible === true);
}

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
