import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { getStoreByStoreId } from "../merchants/merchant.service.js";
import { listHiddenStorePublicIds, setHiddenStore } from "./hidden-stores.service.js";

async function resolveCustomerPk(
  db: ReturnType<typeof getDb>,
  sub: string,
  role: string
): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
  return rows[0]?.id ?? null;
}

export async function hiddenStoresRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/",
    {
      schema: {
        response: {
          200: z.object({ storeIds: z.array(z.string()) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const sub = request.auth!.sub;
      const role = request.auth!.role;
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, sub!, role!);
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer only" });
      }
      const storeIds = await listHiddenStorePublicIds(customerPk);
      return reply.send({ storeIds });
    }
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({ storeId: z.string().min(1), hidden: z.boolean() }),
        response: {
          200: z.object({ hidden: z.boolean() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const sub = request.auth!.sub;
      const role = request.auth!.role;
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, sub!, role!);
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer only" });
      }
      const { storeId, hidden } = request.body as { storeId: string; hidden: boolean };
      const store = await getStoreByStoreId(storeId);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const result = await setHiddenStore(customerPk, store.id, hidden);
      return reply.send(result);
    }
  );
}
