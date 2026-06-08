/**
 * Customer store bookmarks. Requires auth (customer). customer_id resolved from JWT; store_id resolved from merchant_stores.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { checkBookmark, setBookmark, listBookmarkedStorePublicIds } from "./bookmark.service.js";
import {
  checkMenuItemBookmark,
  listBookmarkedMenuItems,
  setMenuItemBookmark,
} from "./menu-item-bookmark.service.js";
import { getStoreByStoreId } from "../merchants/merchant.service.js";

async function resolveCustomerPk(db: ReturnType<typeof getDb>, sub: string, role: string): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
  return rows[0]?.id ?? null;
}

export async function bookmarkRoutes(app: FastifyInstance) {
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
      const storeIds = await listBookmarkedStorePublicIds(customerPk);
      return reply.send({ storeIds });
    }
  );

  app.get<{ Querystring: { storeId: string } }>(
    "/check",
    {
      schema: {
        querystring: z.object({ storeId: z.string().min(1) }),
        response: {
          200: z.object({ saved: z.boolean() }),
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
      const store = await getStoreByStoreId(request.query.storeId);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const saved = await checkBookmark(customerPk, store.id);
      return reply.send({ saved });
    }
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({ storeId: z.string().min(1), saved: z.boolean() }),
        response: {
          200: z.object({ saved: z.boolean() }),
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
      const { storeId, saved } = request.body as { storeId: string; saved: boolean };
      const store = await getStoreByStoreId(storeId);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const result = await setBookmark(customerPk, store.id, saved);
      return reply.send(result);
    }
  );

  app.get<{ Querystring: { storeId?: string } }>(
    "/menu-items",
    {
      schema: {
        querystring: z.object({ storeId: z.string().min(1).optional() }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                storeId: z.string(),
                menuItemId: z.number(),
                itemId: z.string(),
                name: z.string(),
                imageUrl: z.string().nullable(),
                price: z.number(),
                isVeg: z.boolean(),
                storeName: z.string(),
              })
            ),
          }),
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
      const items = await listBookmarkedMenuItems(customerPk, request.query.storeId ?? null);
      return reply.send({ items });
    }
  );

  app.get<{ Querystring: { storeId: string; menuItemId: string } }>(
    "/menu-items/check",
    {
      schema: {
        querystring: z.object({
          storeId: z.string().min(1),
          menuItemId: z.coerce.number().int().positive(),
        }),
        response: {
          200: z.object({ saved: z.boolean() }),
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
      const store = await getStoreByStoreId(request.query.storeId);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const saved = await checkMenuItemBookmark(customerPk, request.query.menuItemId);
      return reply.send({ saved });
    }
  );

  app.post(
    "/menu-items",
    {
      schema: {
        body: z.object({
          storeId: z.string().min(1),
          menuItemId: z.number().int().positive(),
          saved: z.boolean(),
        }),
        response: {
          200: z.object({ saved: z.boolean() }),
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
      const { storeId, menuItemId, saved } = request.body as {
        storeId: string;
        menuItemId: number;
        saved: boolean;
      };
      const store = await getStoreByStoreId(storeId);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const result = await setMenuItemBookmark(customerPk, store.id, menuItemId, saved);
      return reply.send(result);
    }
  );
}
