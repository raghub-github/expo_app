/**
 * Internal offer cache invalidation — called from Partner Site on publish/update.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  invalidateOfferPricing,
  syncOfferApplicability,
  syncOfferLifecycleBatch,
} from "../pricing/offer-invalidation.js";

const bodySchema = z.object({
  storeId: z.number().int().positive(),
  offerId: z.number().int().positive().optional(),
  event: z
    .enum([
      "offer_created",
      "offer_updated",
      "offer_deleted",
      "offer_published",
      "offer_disabled",
      "offer_expired",
      "offer_started",
    ])
    .default("offer_updated"),
});

function requireInternalSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  return headers["x-internal-secret"] === secret;
}

export async function offersInternalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/offers/invalidate", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const { storeId, offerId, event } = parsed.data;
    if (offerId != null) {
      await syncOfferApplicability(offerId);
    }
    await syncOfferLifecycleBatch();
    const { cacheVersion } = await invalidateOfferPricing(storeId, event, {
      offerId: offerId ?? null,
    });
    return reply.send({ ok: true, cacheVersion });
  });
}
