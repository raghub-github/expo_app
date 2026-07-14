/**
 * Offer Engine V3 — pricing & preview HTTP routes.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PricingService } from "./pricing.service.js";
import { detectOfferConflicts } from "./offer-conflict.service.js";
import { getStoreByStoreId } from "../merchants/merchant.service.js";

const productPriceSchema = z.object({
  storeId: z.union([z.string(), z.number()]),
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
});

const previewSchema = z.object({
  storeId: z.number().int().positive(),
  menuItemId: z.number().int().positive().optional(),
  sampleQuantity: z.number().int().positive().optional(),
  excludeOfferId: z.number().int().positive().optional().nullable(),
  draftOffer: z.record(z.string(), z.unknown()).optional(),
});

const conflictSchema = z.object({
  storeId: z.number().int().positive(),
  validFrom: z.string(),
  validTill: z.string(),
  menuItemIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.number()).optional(),
  priority: z.number().optional(),
  isStackable: z.boolean().optional(),
  excludeOfferId: z.number().int().positive().optional().nullable(),
  applicableOnDays: z.array(z.string()).optional().nullable(),
  applicableTimeStart: z.string().optional().nullable(),
  applicableTimeEnd: z.string().optional().nullable(),
});

const settlementSchema = z.object({
  billingSnapshot: z.record(z.string(), z.unknown()),
});

async function resolveInternalStoreId(storeIdParam: string | number): Promise<number | null> {
  const trimmed = String(storeIdParam).trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const store = await getStoreByStoreId(trimmed);
  return store?.id ?? null;
}

function requireInternalSecret(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  const hdr = headers["x-internal-secret"];
  return hdr === secret;
}

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/pricing/product?storeId=&menuItemId=&quantity= */
  app.get("/product", async (req, reply) => {
    const parsed = productPriceSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const storeId = await resolveInternalStoreId(parsed.data.storeId);
    if (!storeId) {
      return reply.code(404).send({ error: "store_not_found" });
    }
    try {
      const result = await PricingService.calculateProductPrice({
        storeId,
        menuItemId: parsed.data.menuItemId,
        quantity: parsed.data.quantity,
      });
      return reply.send({ ok: true, pricing: result });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "menu_item_not_found") {
        return reply.code(404).send({ error: msg });
      }
      req.log.error(e);
      return reply.code(500).send({ error: "pricing_failed" });
    }
  });

  /** POST /v1/pricing/preview — Partner Site live preview (internal or merchant session via proxy) */
  app.post("/preview", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const result = await PricingService.previewOfferPricing(parsed.data);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ error: "preview_failed" });
    }
  });

  /** POST /v1/pricing/conflicts */
  app.post("/conflicts", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = conflictSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const conflicts = await detectOfferConflicts(parsed.data);
      return reply.send({ ok: true, conflicts });
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ error: "conflict_check_failed" });
    }
  });

  /** POST /v1/pricing/settlement — read-only snapshot interpretation */
  app.post("/settlement", async (req, reply) => {
    const parsed = settlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const settlement = PricingService.calculateSettlement(parsed.data.billingSnapshot);
    return reply.send({ ok: true, settlement });
  });
}
