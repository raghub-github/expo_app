/**
 * Public live trip tracking JSON API (no auth).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadPublicTripByToken } from "../../lib/public-trip-tracking.js";

const trackingSchema = z.object({
  token: z.string(),
  tripId: z.string(),
  orderType: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  statusHeading: z.string(),
  tripTitle: z.string(),
  tripPhase: z.enum(["to_pickup", "to_drop", "completed"]),
  pickupPin: z.string().nullable(),
  tripCompleted: z.boolean(),
  tripCancelled: z.boolean(),
  linkExpired: z.boolean(),
  etaMinutes: z.number().nullable(),
  distanceRemainingKm: z.number().nullable(),
  distanceTravelledKm: z.number().nullable(),
  currentSpeedKmh: z.number().nullable(),
  tripProgressPercent: z.number().nullable(),
  completedAt: z.string().nullable(),
  customer: z.object({ name: z.string().nullable(), displayName: z.string().nullable() }),
  rider: z
    .object({
      name: z.string().nullable(),
      photoUrl: z.string().nullable(),
      rating: z.number().nullable(),
      vehicleModel: z.string().nullable(),
      vehicleRegistration: z.string().nullable(),
      latitude: z.number(),
      longitude: z.number(),
      headingDegrees: z.number().nullable(),
      speedKmh: z.number().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
  customerLocation: z
    .object({ latitude: z.number(), longitude: z.number() })
    .nullable(),
  pickup: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().nullable(),
    })
    .nullable(),
  destination: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().nullable(),
    })
    .nullable(),
  routeCoordinates: z.array(
    z.object({ latitude: z.number(), longitude: z.number() })
  ),
  safety: z.object({
    liveLocationVerified: z.boolean(),
    tripInProgress: z.boolean(),
    routeMonitoringActive: z.boolean(),
  }),
  timeline: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      completed: z.boolean(),
      at: z.string().nullable(),
    })
  ),
  updatedAt: z.string(),
});

export async function publicTrackingRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    "/track/:token",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        params: z.object({ token: z.string().min(8).max(64) }),
        response: { 200: trackingSchema },
      },
    },
    async (req, reply) => {
      const payload = await loadPublicTripByToken(req.params.token.trim());
      if (!payload) return reply.status(404).send({ error: "Tracking link not found" });
      if (payload.linkExpired && !payload.tripCompleted) {
        return reply.status(410).send({ error: "This tracking link has expired" });
      }
      return payload;
    }
  );
}
