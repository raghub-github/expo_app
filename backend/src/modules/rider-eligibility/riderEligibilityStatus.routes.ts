/**
 * Rider-FACING eligibility status (Step 5). Registered INSIDE the rider plugin (which is
 * already rider-authenticated), so the logged-in rider can see — for every service at
 * their current location — whether they are eligible and, if not, exactly WHY plus what to
 * do about it. This is the read-only surface behind "preference ≠ eligibility": the engine
 * decision is authoritative; the app never computes eligibility itself.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  eligibilityEnforcementMode,
  resolveRiderAllServiceEligibilityAtLocation,
} from "./riderEligibility.service.js";
import { resolveRiderOnboardingSummary } from "./onboardingEligibility.service.js";
import {
  listRiderVehiclesWithEligibility,
  setRiderActiveVehicle,
} from "./riderVehicles.service.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { riders } from "../../db/schema.js";
import { vehicleClassFromCategory } from "./riderEligibilityInputs.js";
import { normalizeFuelKind } from "./serviceEligibilityDefaults.js";
import type { OwnershipType, RiderEligibilityInput } from "./eligibilityEngine.js";

const bodySchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  pincode: z.string().optional(),
  state: z.string().optional(),
});

/**
 * Onboarding "which services can THIS vehicle deliver" preview. The rider is choosing the
 * vehicle in the form (type/fuel/commercial) — the RC (fuel, class) is already fetched from
 * Cashfree — so we run the SAME eligibility engine with those form attributes merged over the
 * rider's real, backend-resolved DL/RC verification + geo policy, and return per-service
 * eligibility. The picker then offers only the eligible services and explains the rest.
 */
const previewSchema = z.object({
  vehicleType: z.string().trim().min(1).max(64).optional(),
  vehicleCategory: z.string().trim().min(1).max(64).optional(),
  vehicleClass: z.enum(["2_wheeler", "3_wheeler", "4_wheeler"]).optional(),
  fuelKind: z.string().trim().max(32).optional(),
  isCommercial: z.boolean().optional(),
  ownership: z.enum(["commercial", "non_commercial"]).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  pincode: z.string().optional(),
  state: z.string().optional(),
});

export function registerRiderEligibilityStatusRoutes(
  app: FastifyInstance,
  parseRiderIdFromAuth: (sub: string) => number | null
): void {
  app.post(
    "/eligibility/status",
    { schema: { body: bodySchema } },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (riderId == null) return (reply as any).status(403).send({ error: "Invalid rider session" });

      const b = req.body as z.infer<typeof bodySchema>;
      const result = await resolveRiderAllServiceEligibilityAtLocation({
        riderId,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        pincode: b.pincode ?? null,
        state: b.state ?? null,
      });
      // `enforced` tells the app whether eligibility is actually gating (enforce mode) vs
      // merely advisory (shadow). The app only HARD-restricts which services can go online
      // when enforced; in shadow it shows reasons but never blocks selection.
      return reply.send({ ...result, enforced: eligibilityEnforcementMode() === "enforce" });
    }
  );

  // POST /eligibility/preview-services — per-service eligibility for the vehicle the rider is
  // currently entering in the onboarding form (RC/DL + geo authoritative; vehicle attrs from
  // the form). Drives the "Services you will deliver" picker so it shows only eligible ones.
  app.post("/eligibility/preview-services", { schema: { body: previewSchema } }, async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (riderId == null) return (reply as any).status(403).send({ error: "Invalid rider session" });
    const b = req.body as z.infer<typeof previewSchema>;

    // Build the attribute override from ONLY the fields the form provided (merge semantics —
    // never null-out the rider's real DL/RC/proof states).
    const override: Partial<RiderEligibilityInput> = {};
    const derivedClass =
      b.vehicleClass ?? vehicleClassFromCategory(b.vehicleCategory ?? null, b.vehicleType ?? null);
    if (derivedClass != null) override.vehicleClass = derivedClass;
    if (b.vehicleType != null) override.vehicleType = b.vehicleType;
    if (b.fuelKind != null) override.fuelKind = normalizeFuelKind(b.fuelKind);
    const ownership: OwnershipType | null =
      b.ownership ?? (b.isCommercial == null ? null : b.isCommercial ? "commercial" : "non_commercial");
    if (ownership != null) override.ownership = ownership;

    // Location: prefer what the app sent (device), else the rider's registered location.
    let { lat, lng, pincode, state } = b;
    if (lat == null && lng == null && !pincode && !state) {
      const db = getDb();
      const [row] = await db
        .select({ lat: riders.lat, lon: riders.lon, pincode: riders.pincode, state: riders.state })
        .from(riders)
        .where(eq(riders.id, riderId))
        .limit(1);
      lat = row?.lat ?? undefined;
      lng = row?.lon ?? undefined;
      pincode = row?.pincode ?? undefined;
      state = row?.state ?? undefined;
    }

    const result = await resolveRiderAllServiceEligibilityAtLocation({
      riderId,
      lat: lat ?? null,
      lng: lng ?? null,
      pincode: pincode ?? null,
      state: state ?? null,
      attributesOverride: Object.keys(override).length > 0 ? override : null,
    });
    return reply.send({ ...result, enforced: eligibilityEnforcementMode() === "enforce" });
  });

  // GET /eligibility/onboarding-summary — the authoritative onboarding + eligibility
  // payload for the app onboarding UI, payment gate, and Profile → Documents (§25, §26).
  app.get("/eligibility/onboarding-summary", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (riderId == null) return (reply as any).status(403).send({ error: "Invalid rider session" });
    const summary = await resolveRiderOnboardingSummary(riderId);
    if (!summary) return reply.code(404).send({ error: "rider_not_found" });
    return reply.send(summary);
  });

  // GET /eligibility/vehicles — the rider's vehicles, each with per-vehicle service
  // eligibility, + which one is active (multi-vehicle Phase 1).
  app.get("/eligibility/vehicles", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (riderId == null) return (reply as any).status(403).send({ error: "Invalid rider session" });
    return reply.send(await listRiderVehiclesWithEligibility({ riderId }));
  });

  // POST /eligibility/active-vehicle — select the active vehicle (validated ownership +
  // verified + not retired). Live-order guard is applied by the online/dispatch layer.
  app.post("/eligibility/active-vehicle", { schema: { body: z.object({ vehicleId: z.number().int().positive() }) } }, async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (riderId == null) return (reply as any).status(403).send({ error: "Invalid rider session" });
    const { vehicleId } = req.body as { vehicleId: number };
    const result = await setRiderActiveVehicle(riderId, vehicleId);
    if (!result.ok) return reply.code(400).send(result);
    return reply.send(result);
  });
}
