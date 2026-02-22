/**
 * Customer addresses and active location.
 * GET/POST /addresses, GET/PATCH/DELETE /addresses/:id
 * GET/PUT /active-location. Lock/unlock called from order flow.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import {
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setAddressDefault,
  getActiveLocation,
  setActiveLocation,
} from "./address.service.js";

async function resolveCustomerPk(db: ReturnType<typeof getDb>, sub: string, role: string): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
  return rows[0]?.id ?? null;
}

const addressBodySchema = z.object({
  label: z.string().max(50).optional().nullable(),
  fullAddress: z.string().min(1).max(500),
  landmark: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

const activeLocationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional().nullable(),
});

export async function addressRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/addresses",
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.number(),
              label: z.string().nullable(),
              fullAddress: z.string(),
              landmark: z.string().nullable(),
              city: z.string().nullable(),
              state: z.string().nullable(),
              pincode: z.string().nullable(),
              country: z.string().nullable(),
              latitude: z.number(),
              longitude: z.number(),
              isDefault: z.boolean(),
              isLastUsed: z.boolean(),
            })
          ),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      try {
        const rows = await listAddresses(customerPk);
        return reply.send(
          rows.map((r) => ({
            id: r.id,
            label: r.label,
            fullAddress: r.fullAddress,
            landmark: r.landmark,
            city: r.city,
            state: r.state,
            pincode: r.pincode,
            country: r.country,
            latitude: Number(r.latitude) || 0,
            longitude: Number(r.longitude) || 0,
            isDefault: r.isDefault ?? false,
            isLastUsed: r.isLastUsed ?? false,
          }))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("does not exist") || msg.includes("customer_addresses")) {
          request.log.warn({ err: msg }, "customer_addresses table missing – run migration backend/drizzle/0070_*");
          return reply.send([]);
        }
        throw err;
      }
    }
  );

  app.post(
    "/addresses",
    {
      schema: {
        body: addressBodySchema,
        response: {
          201: z.object({ id: z.number() }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const body = addressBodySchema.parse(request.body);
      try {
        const row = await addAddress(customerPk, body);
        return reply.status(201).send({ id: row.id });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn({ err, message }, "Add address failed");
        if (message.includes("does not exist") || message.includes("relation") || message.includes("Failed query")) {
          return reply.status(503).send({
            error: "database_migration_required",
            message: "Address table not set up. Run migration: backend/drizzle/0070_customer_addresses_and_active_location.sql",
          });
        }
        return reply.status(400).send({
          error: "address_create_failed",
          message: message || "Could not save address. Try again.",
        });
      }
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/addresses/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: addressBodySchema.partial(),
        response: { 200: z.object({ ok: z.boolean() }), 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
      const body = (request.body as object) || {};
      const updated = await updateAddress(customerPk, id, body);
      if (!updated) return reply.status(404).send({ error: "Address not found" });
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/addresses/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ ok: z.boolean() }), 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
      const ok = await deleteAddress(customerPk, id);
      if (!ok) return reply.status(404).send({ error: "Address not found" });
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/addresses/:id/default",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ ok: z.boolean() }), 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
      const ok = await setAddressDefault(customerPk, id);
      if (!ok) return reply.status(404).send({ error: "Address not found" });
      return reply.send({ ok: true });
    }
  );

  // --- Active location ---

  app.get(
    "/active-location",
    {
      schema: {
        response: {
          200: z.object({
            latitude: z.number().nullable(),
            longitude: z.number().nullable(),
            address: z.string().nullable(),
            lockedForOrder: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      try {
        const row = await getActiveLocation(customerPk);
        if (!row) {
          return reply.send({ latitude: null, longitude: null, address: null, lockedForOrder: false });
        }
        return reply.send({
          latitude: row.latitude != null ? parseFloat(row.latitude) : null,
          longitude: row.longitude != null ? parseFloat(row.longitude) : null,
          address: row.address,
          lockedForOrder: row.lockedForOrder ?? false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("does not exist") || msg.includes("customer_active_location")) {
          request.log.warn({ err: msg }, "customer_active_location table missing – run migration backend/drizzle/0070_*");
          return reply.send({ latitude: null, longitude: null, address: null, lockedForOrder: false });
        }
        throw err;
      }
    }
  );

  app.put(
    "/active-location",
    {
      schema: {
        body: activeLocationBodySchema,
        response: {
          200: z.object({ ok: z.boolean() }),
          423: z.object({ error: z.string(), lockedForOrder: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, request.auth!.sub!, request.auth!.role!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const body = activeLocationBodySchema.parse(request.body);
      const ok = await setActiveLocation(customerPk, body);
      if (!ok) {
        return reply.status(423).send({
          error: "Location is locked for an active order",
          lockedForOrder: true,
        });
      }
      return reply.send({ ok: true });
    }
  );
}
