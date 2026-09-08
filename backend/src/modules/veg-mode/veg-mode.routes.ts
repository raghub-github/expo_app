import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { getVegModePreference, upsertVegModePreference } from "./veg-mode.service.js";

const storeScopeSchema = z.enum(["all_restaurants", "pure_veg_only"]);
const weekdaysSchema = z.array(z.number().int().min(0).max(6)).nullable();

const preferenceSchema = z.object({
  enabled: z.boolean(),
  storeScope: storeScopeSchema,
  weekdays: weekdaysSchema,
  updatedAt: z.string(),
});

async function resolveCustomerPk(
  db: ReturnType<typeof getDb>,
  sub: string,
  role: string
): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
  return rows[0]?.id ?? null;
}

export async function vegModeRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/",
    {
      schema: {
        response: {
          200: preferenceSchema,
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
      return reply.send(await getVegModePreference(customerPk));
    }
  );

  app.put(
    "/",
    {
      schema: {
        body: z.object({
          enabled: z.boolean(),
          storeScope: storeScopeSchema,
          weekdays: weekdaysSchema,
        }),
        response: {
          200: preferenceSchema,
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
      const body = request.body as {
        enabled: boolean;
        storeScope: "all_restaurants" | "pure_veg_only";
        weekdays: number[] | null;
      };
      return reply.send(
        await upsertVegModePreference(customerPk, {
          enabled: body.enabled,
          storeScope: body.storeScope,
          weekdays: body.weekdays,
        })
      );
    }
  );
}
