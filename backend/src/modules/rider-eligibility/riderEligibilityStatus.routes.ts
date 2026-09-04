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

const bodySchema = z.object({
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
