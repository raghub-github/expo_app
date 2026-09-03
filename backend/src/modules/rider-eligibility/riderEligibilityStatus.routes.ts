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
}
