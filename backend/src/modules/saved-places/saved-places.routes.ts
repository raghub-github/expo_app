/**
 * GET/PUT/DELETE /v1/me/saved-places — favorite pins and favorite journeys.
 * Heart toggles only; recents stay on-device.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { resolveCustomerPkForRequest } from "../../lib/customer-auth.js";
import {
  listSavedPlaces,
  upsertSavedLocation,
  deleteSavedLocation,
  upsertSavedJourney,
  deleteSavedJourney,
  syncSavedPlaces,
  type JourneyKind,
} from "./saved-places.service.js";

const placeSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  primary: z.string().min(1).max(120),
  fullAddress: z.string().max(500).optional(),
});

const journeyKindSchema = z.enum(["ride", "parcel"]);

const journeySchema = z.object({
  serviceKind: journeyKindSchema,
  pickup: placeSchema,
  drop: placeSchema,
});

const locationDto = z.object({
  latitude: z.number(),
  longitude: z.number(),
  primary: z.string(),
  fullAddress: z.string(),
  savedAt: z.number(),
});

const journeyDto = z.object({
  serviceKind: journeyKindSchema,
  pickup: locationDto,
  drop: locationDto,
  savedAt: z.number(),
});

const deleteLocationQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

const deleteJourneyQuerySchema = z.object({
  serviceKind: journeyKindSchema,
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropLat: z.coerce.number().min(-90).max(90),
  dropLng: z.coerce.number().min(-180).max(180),
});

const syncBodySchema = z.object({
  locations: z.array(placeSchema).max(40).optional(),
  journeys: z.array(journeySchema).max(24).optional(),
});

type PlaceBody = z.infer<typeof placeSchema>;
type JourneyBody = z.infer<typeof journeySchema>;
type DeleteLocationQuery = z.infer<typeof deleteLocationQuerySchema>;
type DeleteJourneyQuery = z.infer<typeof deleteJourneyQuerySchema>;
type SyncBody = z.infer<typeof syncBodySchema>;

export async function savedPlacesRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/saved-places",
    {
      schema: {
        response: {
          200: z.object({
            ok: z.literal(true),
            locations: z.array(locationDto),
            journeys: z.array(journeyDto),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const data = await listSavedPlaces(customerPk);
      return reply.send({ ok: true as const, ...data });
    }
  );

  app.put<{ Body: PlaceBody }>(
    "/saved-places/locations",
    {
      schema: {
        body: placeSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      await upsertSavedLocation(customerPk, request.body);
      return reply.send({ ok: true as const });
    }
  );

  app.delete<{ Querystring: DeleteLocationQuery }>(
    "/saved-places/locations",
    {
      schema: {
        querystring: deleteLocationQuerySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      await deleteSavedLocation(customerPk, request.query.latitude, request.query.longitude);
      return reply.send({ ok: true as const });
    }
  );

  app.put<{ Body: JourneyBody }>(
    "/saved-places/journeys",
    {
      schema: {
        body: journeySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      await upsertSavedJourney(customerPk, {
        serviceKind: request.body.serviceKind as JourneyKind,
        pickup: request.body.pickup,
        drop: request.body.drop,
      });
      return reply.send({ ok: true as const });
    }
  );

  app.delete<{ Querystring: DeleteJourneyQuery }>(
    "/saved-places/journeys",
    {
      schema: {
        querystring: deleteJourneyQuerySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const q = request.query;
      await deleteSavedJourney(customerPk, {
        serviceKind: q.serviceKind as JourneyKind,
        pickup: { primary: "Pickup", latitude: q.pickupLat, longitude: q.pickupLng },
        drop: { primary: "Drop", latitude: q.dropLat, longitude: q.dropLng },
      });
      return reply.send({ ok: true as const });
    }
  );

  app.put<{ Body: SyncBody }>(
    "/saved-places/sync",
    {
      schema: {
        body: syncBodySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPkForRequest(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      await syncSavedPlaces(
        customerPk,
        request.body.locations ?? [],
        (request.body.journeys ?? []).map((j) => ({
          serviceKind: j.serviceKind as JourneyKind,
          pickup: j.pickup,
          drop: j.drop,
        }))
      );
      return reply.send({ ok: true as const });
    }
  );
}
