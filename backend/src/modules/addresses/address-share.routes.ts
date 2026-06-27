/**
 * Public + customer address share link routes.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import {
  claimAddressShareLink,
  createAddressShareLink,
  getAddressSharePreview,
  resolveCustomerPkFromSub,
} from "../../lib/address-share.js";

export async function addressSharePublicRoutes(app: FastifyInstance) {
  app.get(
    "/address-share/:token/preview",
    {
      schema: {
        params: z.object({ token: z.string().min(8).max(64) }),
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const preview = await getAddressSharePreview(token.trim());
      if (!preview.ok) {
        const code = preview.error === "not_found" ? 404 : 410;
        return reply.status(code).send({ ok: false, error: preview.error });
      }
      return reply.send(preview);
    }
  );
}

export async function addressShareMeRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post<{ Params: { id: string } }>(
    "/addresses/:id/share-link",
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        response: {
          200: z.object({
            token: z.string(),
            shortCode: z.string(),
            url: z.string().url(),
            expiresAt: z.string(),
            shareMessage: z.string(),
            linkPreviewSupported: z.boolean(),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const customerPk = await resolveCustomerPkFromSub(sub);
      if (customerPk == null) return reply.status(403).send({ error: "Customer not found" });

      try {
        const link = await createAddressShareLink({
          customerPk,
          addressId: Number(req.params.id),
        });
        return reply.send(link);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "address_not_found") return reply.status(404).send({ error: msg });
        throw e;
      }
    }
  );

  app.post(
    "/address-share/claim",
    {
      schema: {
        body: z.object({ token: z.string().min(8).max(64) }),
        response: {
          200: z.object({
            ok: z.literal(true),
            addressId: z.number(),
            fullAddress: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            label: z.string().nullable(),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const customerPk = await resolveCustomerPkFromSub(sub);
      if (customerPk == null) return reply.status(403).send({ error: "Customer not found" });

      const body = req.body as { token: string };
      try {
        const result = await claimAddressShareLink({
          token: body.token.trim(),
          recipientCustomerPk: customerPk,
        });
        return reply.send({ ok: true as const, ...result });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "not_found") return reply.status(404).send({ ok: false, error: msg });
        if (msg === "expired" || msg === "already_claimed") {
          return reply.status(410).send({ ok: false, error: msg });
        }
        throw e;
      }
    }
  );
}
