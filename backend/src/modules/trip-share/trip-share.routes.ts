/**
 * Customer — create/reuse live trip share links.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import {
  assertCustomerCanShareOrder,
  createOrReuseTripShareLink,
} from "../../lib/public-trip-tracking.js";

export async function tripShareRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post<{ Params: { id: string } }>(
    "/:id/share-link",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            token: z.string(),
            url: z.string().url(),
            expiresAt: z.string(),
            shareMessage: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = req.params.id;
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) return reply.status(403).send({ error: "Customer not found" });

      const allowed = await assertCustomerCanShareOrder({ customerPk, orderIdParam });
      if (!allowed) {
        return reply.status(404).send({ error: "Active trip not found or sharing unavailable" });
      }

      const link = await createOrReuseTripShareLink({
        orderIdText: allowed.orderIdText,
        customerPk,
      });

      const shareMessage = [
        "Hi 👋,",
        "",
        "I'm currently travelling with GatiMitra.",
        "",
        "You can track my live location and trip status here:",
        "",
        `📍 ${link.url}`,
        "",
        "The link will show my real-time location, route, and ETA.",
        "",
        "🔒 For security, this link will automatically expire when my trip ends.",
        "",
        "Thank you ❤️",
      ].join("\n");

      return {
        token: link.token,
        url: link.url,
        expiresAt: link.expiresAt,
        shareMessage,
      };
    }
  );
}
