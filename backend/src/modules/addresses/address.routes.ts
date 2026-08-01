/**
 * Customer addresses and active location.
 * GET/POST /addresses, GET/PATCH/DELETE /addresses/:id
 * GET/PUT /active-location. Lock/unlock called from order flow.
 */

import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";
import type { AuthContext } from "../../plugins/auth.js";
import { resolveCustomerPkForRequest } from "../../lib/customer-auth.js";
import {
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setAddressDefault,
  getActiveLocation,
  setActiveLocation,
  reconcileActiveLocationWithGps,
  doorImageProxyUrlFromR2Key,
} from "./address.service.js";

async function resolveCustomerPk(authCtx: AuthContext): Promise<number | null> {
  return resolveCustomerPkForRequest(authCtx);
}

const addressBodySchema = z.object({
  label: z.string().max(50).optional().nullable(),
  fullAddress: z.string().min(1).max(500),
  landmark: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
  contactName: z.string().max(80).optional().nullable(),
  contactMobile: z.string().max(20).optional().nullable(),
  deliveryInstructionsList: z.array(z.string().max(500)).max(25).optional(),
});

const activeLocationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional().nullable(),
  /** Explicit saved address for delivery. null clears (live GPS). Omit to leave unchanged. */
  addressId: z.number().int().positive().optional().nullable(),
});

const reconcileActiveLocationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional().nullable(),
});

const reconcileActiveLocationResponseSchema = z.object({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  addressId: z.number().nullable(),
  lockedForOrder: z.boolean(),
  source: z.enum(["selected", "current"]),
  switchedToCurrent: z.boolean(),
  reason: z.enum(["kept_nearby", "switched_far", "no_bound_address", "bound_missing"]),
  distanceM: z.number().nullable(),
  retentionRadiusM: z.number(),
  savedAddress: z
    .object({
      id: z.number(),
      label: z.string().nullable(),
      fullAddress: z.string(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      pincode: z.string().nullable(),
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable(),
});

export async function addressRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });

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
              contactName: z.string().nullable().optional(),
              contactMobile: z.string().nullable().optional(),
              deliveryDoorImageUrl: z.string().nullable().optional(),
              deliveryInstructionsList: z.array(z.string()).optional(),
              isDefault: z.boolean(),
              isLastUsed: z.boolean(),
              /** ISO timestamp — backend MRU key; clients must not re-sort by this. */
              lastUsedAt: z.string().nullable().optional(),
              isSelected: z.boolean(),
            })
          ),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
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
              contactName: r.contactName ?? null,
              contactMobile: r.contactMobile ?? null,
              deliveryDoorImageUrl: r.deliveryDoorImageUrl ?? null,
              deliveryInstructionsList: r.deliveryInstructionsList ?? [],
            isDefault: r.isDefault ?? false,
            isLastUsed: r.isLastUsed ?? false,
            lastUsedAt: r.lastUsedAt
              ? (r.lastUsedAt instanceof Date
                  ? r.lastUsedAt.toISOString()
                  : new Date(r.lastUsedAt).toISOString())
              : null,
            isSelected: r.isSelected ?? false,
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
          403: z.object({ error: z.string() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
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
        response: {
          200: z.object({ ok: z.boolean() }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
      const body = (request.body as object) || {};
      try {
        const updated = await updateAddress(customerPk, id, body);
        if (!updated) return reply.status(404).send({ error: "Address not found" });
        return reply.send({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn({ err, message }, "Update address failed");
        if (message.includes("unique_customer_home_address") || message.includes("unique_customer_work_address")) {
          return reply.status(400).send({
            error: "address_label_conflict",
            message: "You already have a Home or Work address. Edit or remove it first.",
          });
        }
        if (message.includes("does not exist") || message.includes("relation") || message.includes("Failed query")) {
          return reply.status(503).send({
            error: "database_migration_required",
            message: "Address table not set up. Run migration: backend/drizzle/0070_customer_addresses_and_active_location.sql",
          });
        }
        return reply.status(400).send({
          error: "address_update_failed",
          message: message || "Could not update address. Try again.",
        });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/addresses/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
      const ok = await deleteAddress(customerPk, id);
      if (!ok) return reply.status(404).send({ error: "Address not found" });
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/addresses/:id/door-image",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          201: z.object({
            ok: z.boolean(),
            deliveryDoorImageUrl: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          500: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) return reply.status(400).send({ error: "Invalid id" });

      const filePart = await (request as unknown as { file?: () => Promise<{
        filename?: string;
        mimetype?: string;
        toBuffer: () => Promise<Buffer>;
      } | undefined> }).file?.();
      if (!filePart) return reply.status(400).send({ error: "no_file" });
      const buffer = await filePart.toBuffer();
      if (!buffer || buffer.length === 0) return reply.status(400).send({ error: "empty_file" });
      if (buffer.length > 8 * 1024 * 1024) {
        return reply.status(400).send({ error: "file_too_large", message: "Max 8 MB." });
      }

      const originalName = String(filePart.filename || "door-image.jpg");
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "door-image.jpg";
      const mime = String(filePart.mimetype || "image/jpeg");
      if (!/^image\/(jpeg|png|gif|webp)$/i.test(mime)) {
        return reply.status(400).send({ error: "unsupported_mime_type", message: "Only images allowed." });
      }

      const { randomUUID } = await import("crypto");
      const r2Key = `customer-addresses/${customerPk}/${id}/${randomUUID()}-${safeName}`;

      try {
        const { uploadToR2 } = await import("../../services/r2/r2Service.js");
        const uploaded = await uploadToR2(buffer, r2Key, mime);
        const imageUrl = doorImageProxyUrlFromR2Key(uploaded.key);
        const updated = await updateAddress(customerPk, id, { deliveryDoorImageUrl: imageUrl });
        if (!updated) return reply.status(404).send({ error: "Address not found" });
        return reply.status(201).send({ ok: true, deliveryDoorImageUrl: imageUrl });
      } catch (err: unknown) {
        request.log.error({ err }, "address door image upload failed");
        return reply.status(500).send({ error: "upload_failed" });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/addresses/:id/default",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
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
            addressId: z.number().nullable(),
            lockedForOrder: z.boolean(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      try {
        const row = await getActiveLocation(customerPk);
        if (!row) {
          return reply.send({
            latitude: null,
            longitude: null,
            address: null,
            addressId: null,
            lockedForOrder: false,
          });
        }
        return reply.send({
          latitude: row.latitude != null ? parseFloat(row.latitude) : null,
          longitude: row.longitude != null ? parseFloat(row.longitude) : null,
          address: row.address,
          addressId: row.addressId ?? null,
          lockedForOrder: row.lockedForOrder ?? false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("does not exist") || msg.includes("customer_active_location")) {
          request.log.warn({ err: msg }, "customer_active_location table missing – run migration backend/drizzle/0070_*");
          return reply.send({
            latitude: null,
            longitude: null,
            address: null,
            addressId: null,
            lockedForOrder: false,
          });
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
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          423: z.object({ error: z.string(), lockedForOrder: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const db = getDb();
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const body = activeLocationBodySchema.parse(request.body);
      try {
        const ok = await setActiveLocation(customerPk, body);
        if (!ok) {
          return reply.status(423).send({
            error: "Location is locked for an active order",
            lockedForOrder: true,
          });
        }
        return reply.send({ ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "Address not found") {
          return reply.status(404).send({ error: "Address not found" });
        }
        throw err;
      }
    }
  );

  /**
   * Reconcile session active delivery address against live GPS.
   * Keeps a bound saved address when GPS is within retention radius;
   * otherwise switches to Current Location (clears addressId).
   */
  app.post(
    "/active-location/reconcile",
    {
      schema: {
        body: reconcileActiveLocationBodySchema,
        response: {
          200: reconcileActiveLocationResponseSchema,
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const customerPk = await resolveCustomerPk(request.auth!);
      if (customerPk === null) return reply.status(403).send({ error: "Customer only" });
      const body = reconcileActiveLocationBodySchema.parse(request.body);
      try {
        const result = await reconcileActiveLocationWithGps(customerPk, body);
        return reply.send(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("does not exist") || msg.includes("customer_active_location")) {
          request.log.warn({ err: msg }, "customer_active_location table missing");
          return reply.send({
            latitude: body.latitude,
            longitude: body.longitude,
            address: body.address ?? "Current location",
            addressId: null,
            lockedForOrder: false,
            source: "current" as const,
            switchedToCurrent: false,
            reason: "no_bound_address" as const,
            distanceM: null,
            retentionRadiusM: 500,
            savedAddress: null,
          });
        }
        throw err;
      }
    }
  );
}
