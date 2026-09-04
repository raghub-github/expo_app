/**
 * Multi-vehicle service (backend Phase 1). Per-vehicle service eligibility + the rider's
 * single ACTIVE vehicle. Each vehicle carries its OWN RC verification (rider_vehicles.verified
 * + fitness/permit validity); DL + proof documents are rider-level. Everything resolves
 * through the SAME engine + geo policy + overrides used everywhere else — no duplicate logic.
 */
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments, riderVehicles } from "../../db/schema.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../ride-state-config/rideStateConfig.repository.js";
import {
  resolveRiderServiceEligibility,
  applyEligibilityOverride,
  type EligibilityDecision,
  type EligibilityService,
} from "./eligibilityEngine.js";
import {
  docStateFrom,
  ownershipFromVehicle,
  rcDocStateFromVehicle,
  resolveOwnershipProofState,
  vehicleClassFromCategory,
} from "./riderEligibilityInputs.js";
import { resolveEffectiveEligibilityPolicy } from "./riderEligibility.repository.js";
import { defaultPolicyForService } from "./serviceEligibilityDefaults.js";
import { ALL_ELIGIBILITY_SERVICES, docVerified } from "./riderEligibility.service.js";
import { loadActiveOverridesForRider } from "./riderEligibilityOverrides.repository.js";
import { normalizeRegistrationNumber } from "./vehicleTaxonomy.js";

export type RiderVehicleView = {
  id: number;
  registrationNumber: string;
  registrationMasked: string;
  vehicleClass: string | null;
  vehicleType: string | null;
  fuelKind: string | null;
  ownership: string;
  commercial: boolean;
  verified: boolean;
  status: string;
  isActiveVehicle: boolean;
  services: Record<EligibilityService, EligibilityDecision>;
};

function maskReg(reg: string): string {
  const s = normalizeRegistrationNumber(reg);
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}${"•".repeat(Math.max(0, s.length - 6))}${s.slice(-4)}`;
}

/** All the rider's non-retired vehicles, each with its per-vehicle service eligibility. */
export async function listRiderVehiclesWithEligibility(args: {
  riderId: number;
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  state?: string | null;
}): Promise<{
  vehicles: RiderVehicleView[];
  activeVehicleId: number | null;
  resolvedGeo: { level: string; refId: string } | null;
}> {
  const db = getDb();

  const [rider] = await db
    .select({ activeVehicleId: riders.activeVehicleId, state: riders.state, pincode: riders.pincode, lat: riders.lat, lon: riders.lon })
    .from(riders)
    .where(eq(riders.id, args.riderId))
    .limit(1);
  if (!rider) return { vehicles: [], activeVehicleId: null, resolvedGeo: null };

  // Non-retired vehicles.
  const vehicles = await db
    .select()
    .from(riderVehicles)
    .where(
      and(
        eq(riderVehicles.riderId, args.riderId),
        isNull(riderVehicles.deletedAt),
        or(isNull(riderVehicles.vehicleActiveStatus), ne(riderVehicles.vehicleActiveStatus, "retired"))
      )
    );

  // Rider-level documents (DL + proofs). RC is per-vehicle (from the vehicle row).
  const docs = await db
    .select({
      docType: riderDocuments.docType,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      expiryDate: riderDocuments.expiryDate,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, args.riderId));

  const now = Date.now();
  const riderDocState = (docType: string) => {
    const row = docs.find((d) => d.docType === docType);
    const expired = Boolean(row?.expiryDate && new Date(String(row.expiryDate)).getTime() < now);
    return docStateFrom({ ...docVerified(row), expired });
  };
  const dl = riderDocState("dl");
  const evProof = riderDocState("ev_proof");
  const dedicatedOwnership = riderDocState("ownership_proof");
  const rcDocument = riderDocState("rc");
  const rentalProof = riderDocState("rental_proof");
  const evOwnershipProof = riderDocState("ev_ownership_proof");
  const commercialProof = riderDocState("commercial_proof");

  // Resolve geo once (rider registered location unless coords passed).
  let resolvedGeo: { level: string; refId: string } | null = null;
  try {
    const geo = await resolveGeoLocation({
      latitude: args.lat ?? rider.lat ?? undefined,
      longitude: args.lng ?? rider.lon ?? undefined,
      livePincode: args.pincode ?? rider.pincode ?? undefined,
      liveState: args.state ?? rider.state ?? undefined,
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (anchor) resolvedGeo = { level: anchor.level, refId: anchor.refId };
  } catch {
    /* default policy per service */
  }

  const overrides = await loadActiveOverridesForRider(args.riderId);
  const policyCache = new Map<EligibilityService, Awaited<ReturnType<typeof resolveEffectiveEligibilityPolicy>>>();
  const policyFor = async (service: EligibilityService) => {
    const cached = policyCache.get(service);
    if (cached) return cached;
    const p = resolvedGeo
      ? await resolveEffectiveEligibilityPolicy({ level: resolvedGeo.level, refId: resolvedGeo.refId, service })
      : defaultPolicyForService(service);
    policyCache.set(service, p);
    return p;
  };

  const out: RiderVehicleView[] = [];
  for (const v of vehicles) {
    const vehicleRc = rcDocStateFromVehicle({
      verified: v.verified,
      fitnessExpiry: v.fitnessExpiry,
      permitExpiry: v.permitExpiry,
    });
    const input = {
      vehicleClass: vehicleClassFromCategory(v.vehicleCategory ?? null, v.vehicleType ?? null),
      vehicleType: v.vehicleType ?? null,
      fuelKind: v.fuelType ?? null,
      ownership: ownershipFromVehicle(v.isCommercial),
      dl,
      rc: vehicleRc,
      evProof,
      ownershipProof: resolveOwnershipProofState({
        dedicated: dedicatedOwnership,
        rcDocument,
        vehicleRc,
        rentalProof,
        evOwnershipProof,
      }),
      commercialProof,
    };
    const services = {} as Record<EligibilityService, EligibilityDecision>;
    for (const service of ALL_ELIGIBILITY_SERVICES) {
      const decision = resolveRiderServiceEligibility(input, await policyFor(service));
      services[service] = applyEligibilityOverride(decision, overrides[service]);
    }
    out.push({
      id: v.id,
      registrationNumber: v.registrationNumber,
      registrationMasked: maskReg(v.registrationNumber),
      vehicleClass: input.vehicleClass,
      vehicleType: v.vehicleType ?? null,
      fuelKind: v.fuelType ?? null,
      ownership: input.ownership,
      commercial: v.isCommercial === true,
      verified: v.verified === true,
      status: v.vehicleActiveStatus ?? "active",
      isActiveVehicle: rider.activeVehicleId === v.id,
      services,
    });
  }

  return { vehicles: out, activeVehicleId: rider.activeVehicleId ?? null, resolvedGeo };
}

export type SetActiveVehicleResult =
  | { ok: true; activeVehicleId: number }
  | { ok: false; code: "NOT_FOUND" | "NOT_VERIFIED" | "RETIRED" | "LIVE_ORDER"; reason: string };

/** Set the rider's active vehicle. Validates ownership + verified + not-retired, and — per
 * §10 — refuses to SWITCH to a different vehicle while the rider has a live/active order
 * (setting it for the first time, or re-selecting the same vehicle, is always allowed). */
export async function setRiderActiveVehicle(
  riderId: number,
  vehicleId: number
): Promise<SetActiveVehicleResult> {
  const db = getDb();
  const [v] = await db
    .select({
      id: riderVehicles.id,
      verified: riderVehicles.verified,
      status: riderVehicles.vehicleActiveStatus,
      deletedAt: riderVehicles.deletedAt,
    })
    .from(riderVehicles)
    .where(and(eq(riderVehicles.id, vehicleId), eq(riderVehicles.riderId, riderId)))
    .limit(1);
  if (!v || v.deletedAt) return { ok: false, code: "NOT_FOUND", reason: "Vehicle not found." };
  if ((v.status ?? "active") === "retired") return { ok: false, code: "RETIRED", reason: "This vehicle is retired." };
  if (v.verified !== true) return { ok: false, code: "NOT_VERIFIED", reason: "This vehicle is not verified yet." };

  const [riderRow] = await db
    .select({ activeVehicleId: riders.activeVehicleId })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  const current = riderRow?.activeVehicleId ?? null;

  // Switching to a DIFFERENT vehicle while a live order is assigned would invalidate that
  // order's vehicle — block it (§10). First-time selection / re-selecting the same is fine.
  if (current != null && current !== vehicleId) {
    try {
      const { countRiderActiveAssignments } = await import("../../lib/rider-assignment-control.js");
      const counts = await countRiderActiveAssignments(riderId);
      if (counts.total > 0) {
        return {
          ok: false,
          code: "LIVE_ORDER",
          reason: "Vehicle cannot be switched while active orders are assigned.",
        };
      }
    } catch {
      /* if the active-order check is unavailable, do not block the switch */
    }
  }

  await db.update(riders).set({ activeVehicleId: vehicleId, updatedAt: new Date() }).where(eq(riders.id, riderId));
  return { ok: true, activeVehicleId: vehicleId };
}
