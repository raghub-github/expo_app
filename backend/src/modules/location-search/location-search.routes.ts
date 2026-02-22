/**
 * Location search API – local fallback and city→area suggestions.
 * GET /location-search?q=... GET /location-suggestions/city?city=...
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import {
  searchPopularLocations,
  getPopularAreasForCity,
  searchCustomerAddresses,
  recordDeliveryLocation,
  type LocalSuggestion,
} from "./location-search.service.js";

async function resolveCustomerPk(
  db: ReturnType<typeof getDb>,
  sub: string,
  role: string
): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, sub))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function locationSearchRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/location-search",
    {
      schema: {
        querystring: z.object({
          q: z.string().min(1).max(200),
          limit: z.coerce.number().min(1).max(20).optional().default(10),
        }),
        response: {
          200: z.array(
            z.object({
              primary: z.string(),
              secondary: z.string(),
              fullAddress: z.string(),
              latitude: z.number(),
              longitude: z.number(),
              source: z.enum(["popular", "saved_address"]),
              usageCount: z.number().optional(),
              city: z.string().optional(),
              area: z.string().optional(),
            })
          ),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(
        db,
        request.auth!.sub!,
        request.auth!.role!
      );
      const { q, limit } = request.query as { q: string; limit: number };

      const [popular, saved] = await Promise.all([
        searchPopularLocations(q, { limit }),
        customerPk !== null ? searchCustomerAddresses(customerPk, q, 5) : [],
      ]);

      const byKey = new Map<string, LocalSuggestion>();
      [...saved, ...popular].forEach((s) => {
        const key = `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)},${s.primary}`;
        if (!byKey.has(key)) byKey.set(key, s);
      });
      const combined = Array.from(byKey.values()).slice(0, limit);
      return reply.send(combined);
    }
  );

  app.get(
    "/location-suggestions/city",
    {
      schema: {
        querystring: z.object({
          city: z.string().min(1).max(100),
          limit: z.coerce.number().min(1).max(15).optional().default(10),
        }),
        response: {
          200: z.array(
            z.object({
              primary: z.string(),
              secondary: z.string(),
              fullAddress: z.string(),
              latitude: z.number(),
              longitude: z.number(),
              source: z.enum(["popular", "saved_address"]),
              usageCount: z.number().optional(),
              city: z.string().optional(),
              area: z.string().optional(),
            })
          ),
        },
      },
    },
    async (request, reply) => {
      const { city, limit } = request.query as { city: string; limit: number };
      const areas = await getPopularAreasForCity(city, { limit });
      return reply.send(areas);
    }
  );

  app.post(
    "/location-record",
    {
      schema: {
        body: z.object({
          cityName: z.string().min(1).max(200),
          areaName: z.string().min(1).max(200),
          displayName: z.string().max(300).optional().nullable(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        cityName: string;
        areaName: string;
        displayName?: string | null;
        latitude: number;
        longitude: number;
      };
      await recordDeliveryLocation(body);
      return reply.send({ ok: true });
    }
  );
}
