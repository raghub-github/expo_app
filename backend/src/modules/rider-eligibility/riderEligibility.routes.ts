/**
 * Rider eligibility API. Internal (super-admin dashboard proxies here with the
 * x-internal-secret) so the dashboard SIMULATOR uses the SAME production engine +
 * geo policy resolver — never a duplicated frontend formula (Phase 37).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveRiderServiceEligibility,
  type EligibilityDecision,
  type EligibilityService,
} from "./eligibilityEngine.js";
import { resolveEffectiveEligibilityPolicy } from "./riderEligibility.repository.js";
import { defaultPolicyForService } from "./serviceEligibilityDefaults.js";
import { normalizeFuelKind, ALL_ELIGIBILITY_SERVICES } from "./serviceEligibilityDefaults.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../ride-state-config/rideStateConfig.repository.js";
import { resolveOnboardingDecision } from "./onboardingEligibility.js";
import { resolveRiderOnboardingSummary } from "./onboardingEligibility.service.js";

function requireInternalSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  return headers["x-internal-secret"] === secret;
}

const simulateSchema = z.object({
  service: z.enum(["food", "parcel", "person_ride"]),
  // Location: either an explicit geo node OR coordinates/pincode to resolve.
  geoLevel: z.enum(["state", "region", "district", "division", "post_office", "pincode"]).optional(),
  geoRefId: z.string().uuid().optional(),
  pincode: z.string().optional(),
  state: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Simulated rider attributes.
  vehicleClass: z.enum(["2_wheeler", "3_wheeler", "4_wheeler"]).nullable().optional(),
  vehicleType: z.string().optional().nullable(),
  fuelKind: z.string().optional().nullable(),
  ownership: z.enum(["commercial", "non_commercial"]).optional(),
  dl: z.enum(["verified", "pending", "failed", "expired", "missing"]).optional(),
  rc: z.enum(["verified", "pending", "failed", "expired", "missing"]).optional(),
});

const onboardingSimulateSchema = z.object({
  geoLevel: z.enum(["state", "region", "district", "division", "post_office", "pincode"]).optional(),
  geoRefId: z.string().uuid().optional(),
  pincode: z.string().optional(),
  state: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  vehicleClass: z.enum(["2_wheeler", "3_wheeler", "4_wheeler"]).nullable().optional(),
  vehicleType: z.string().optional().nullable(),
  fuelKind: z.string().optional().nullable(),
  ownership: z.enum(["commercial", "non_commercial"]).optional(),
  dl: z.enum(["verified", "pending", "failed", "expired", "missing"]).optional(),
  rc: z.enum(["verified", "pending", "failed", "expired", "missing"]).optional(),
  identityVerified: z.boolean().optional(),
  identitySubmitted: z.boolean().optional(),
  identityInManualReview: z.boolean().optional(),
  paymentCompleted: z.boolean().optional(),
  allowZeroServiceEligibility: z.boolean().optional(),
});

export async function riderEligibilityRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/rider-eligibility/simulate — engine-authoritative eligibility preview. */
  app.post("/simulate", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    // Resolve the effective policy: explicit node → coords/pincode → default.
    let policy;
    let resolvedGeo: { level: string; refId: string } | null = null;
    if (b.geoLevel && b.geoRefId) {
      resolvedGeo = { level: b.geoLevel, refId: b.geoRefId };
    } else if (b.lat != null || b.lng != null || b.pincode || b.state) {
      try {
        const geo = await resolveGeoLocation({
          latitude: b.lat,
          longitude: b.lng,
          livePincode: b.pincode,
          liveState: b.state,
        });
        const anchor = pickMostSpecificGeoAnchor(geo.refs);
        if (anchor) resolvedGeo = { level: anchor.level, refId: anchor.refId };
      } catch {
        /* fall through to default */
      }
    }
    policy = resolvedGeo
      ? await resolveEffectiveEligibilityPolicy({
          level: resolvedGeo.level,
          refId: resolvedGeo.refId,
          service: b.service,
        })
      : defaultPolicyForService(b.service);

    const decision = resolveRiderServiceEligibility(
      {
        vehicleClass: b.vehicleClass ?? null,
        vehicleType: b.vehicleType ?? null,
        fuelKind: normalizeFuelKind(b.fuelKind ?? null),
        ownership: b.ownership ?? "non_commercial",
        dl: b.dl ?? "missing",
        rc: b.rc ?? "missing",
      },
      policy
    );

    return reply.send({ decision, policy });
  });

  /**
   * POST /v1/rider-eligibility/simulate-onboarding (§40) — simulate the FULL onboarding
   * outcome for a hypothetical rider: runs the engine for ALL services at a location and the
   * SAME onboarding-decision resolver used in production, so an admin can verify onboarding
   * allowed/blocked + eligible/blocked services + missing docs before it ever hits a rider.
   */
  app.post("/simulate-onboarding", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = onboardingSimulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    // Resolve the geo node once (explicit node → coords/pincode/state → default).
    let resolvedGeo: { level: string; refId: string } | null = null;
    if (b.geoLevel && b.geoRefId) {
      resolvedGeo = { level: b.geoLevel, refId: b.geoRefId };
    } else if (b.lat != null || b.lng != null || b.pincode || b.state) {
      try {
        const geo = await resolveGeoLocation({
          latitude: b.lat,
          longitude: b.lng,
          livePincode: b.pincode,
          liveState: b.state,
        });
        const anchor = pickMostSpecificGeoAnchor(geo.refs);
        if (anchor) resolvedGeo = { level: anchor.level, refId: anchor.refId };
      } catch {
        /* default */
      }
    }

    const input = {
      vehicleClass: b.vehicleClass ?? null,
      vehicleType: b.vehicleType ?? null,
      fuelKind: normalizeFuelKind(b.fuelKind ?? null),
      ownership: b.ownership ?? "non_commercial",
      dl: b.dl ?? "missing",
      rc: b.rc ?? "missing",
    };

    const services = {} as Record<EligibilityService, EligibilityDecision>;
    for (const service of ALL_ELIGIBILITY_SERVICES) {
      const policy = resolvedGeo
        ? await resolveEffectiveEligibilityPolicy({ level: resolvedGeo.level, refId: resolvedGeo.refId, service })
        : defaultPolicyForService(service);
      services[service] = resolveRiderServiceEligibility(input, policy);
    }

    const onboarding = resolveOnboardingDecision({
      identityVerified: b.identityVerified ?? true,
      identitySubmitted: b.identitySubmitted ?? true,
      identityInManualReview: b.identityInManualReview ?? false,
      hasVehicle: b.vehicleClass != null,
      paymentCompleted: b.paymentCompleted ?? false,
      services,
      allowZeroServiceEligibility: b.allowZeroServiceEligibility ?? true,
    });

    return reply.send({ onboarding, services, resolvedGeo });
  });

  /**
   * POST /v1/rider-eligibility/rider-summary (§41) — the REAL onboarding + eligibility
   * summary for a specific rider, for the agent/super-admin dashboard. Internal-secret
   * gated (the dashboard proxies with the actor's admin session).
   */
  app.post("/rider-summary", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = z.object({ riderId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const summary = await resolveRiderOnboardingSummary(parsed.data.riderId);
    if (!summary) return reply.code(404).send({ error: "rider_not_found" });
    return reply.send(summary);
  });
}
