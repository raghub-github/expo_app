/**
 * POST /v1/merchants/:id/report – customer reports (menu, pricing, fraud). Auth required.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { customers, restaurantReports } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { getStoreByStoreId } from "./merchant.service.js";

const reportBodySchema = z.object({
  report_type: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
});

async function resolveCustomerPk(db: ReturnType<typeof getDb>, sub: string, role: string): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
  return rows[0]?.id ?? null;
}

export async function merchantReportRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post<{ Params: { id: string } }>(
    "/:id/report",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: reportBodySchema,
        response: { 201: z.object({ id: z.number(), ok: z.boolean() }), 400: z.object({ error: z.string() }), 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const storeIdStr = request.params.id;
      const body = reportBodySchema.parse(request.body);
      const store = await getStoreByStoreId(storeIdStr);
      if (!store) return reply.status(404).send({ error: "Store not found" });
      const [row] = await db
        .insert(restaurantReports)
        .values({
          customerId: customerPk,
          storeId: store.id,
          reportType: body.report_type,
          description: body.description ?? null,
        })
        .returning({ id: restaurantReports.id });
      return reply.status(201).send({ id: row.id, ok: true });
    }
  );
}
