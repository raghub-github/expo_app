/**
 * Customer food orders.
 * POST / creates an order (Razorpay verify + persist to orders_core + items + payments; trigger → orders_food).
 * GET /:id returns order detail (supports numeric orders_core.id or text orders_core.order_id e.g. GM10000001).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { createPendingOrder, finalizeOrder, getPendingOrderStatus } from "./order.placement.service.js";
import { getDb } from "../../db/client.js";
import {
  customers,
  ordersCore,
  ordersFood,
  ordersCoreItems,
  orderEvents,
  orderEtaSnapshots,
  orderRiderTracking,
} from "../../db/schema.js";

const orderDetailResponseSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  merchantName: z.string().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  createdAt: z.string(),
  deliveryAddress: z.string().optional().nullable(),
  statusHistory: z.array(z.object({ status: z.string(), at: z.string() })).optional(),
  rider: z.object({ name: z.string(), phone: z.string().optional() }).optional().nullable(),
  items: z.array(z.object({ name: z.string(), quantity: z.number(), price: z.number() })).optional(),
});

const orderSummarySchema = z.object({
  orderId: z.string(),
  status: z.string(),
  merchantName: z.string().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  createdAt: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: z.number(), price: z.number() })).optional(),
});

const addonItemSchema = z.object({
  addonId: z.string(),
  addonName: z.string(),
  addonPrice: z.number().nonnegative(),
  quantity: z.number().int().min(1).default(1),
});

const createOrderItemSchema = z.object({
  menuItemId: z.string(),
  itemName: z.string().min(1),
  quantity: z.number().int().positive(),
  basePrice: z.number().nonnegative(),
  variantId: z.string().optional().nullable(),
  variantName: z.string().optional().nullable(),
  addons: z.array(addonItemSchema).optional().default([]),
  itemSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
});

const createOrderBodySchema = z.object({
  merchantId: z.string().min(1),
  merchantParentId: z.union([z.string(), z.number()]).optional(),
  items: z.array(createOrderItemSchema).min(1),
  addressId: z.string().min(1),
  paymentMethod: z.string(),
  tipAmount: z.number().nonnegative().optional(),
  donationAmount: z.number().nonnegative().optional(),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
  pickupAddressRaw: z.string().optional(),
  pickupLat: z.number().optional(),
  pickupLon: z.number().optional(),
  couponCode: z.string().optional().nullable(),
  subscriptionOptIn: z.boolean().optional(),
  checkoutMetadata: z.record(z.string(), z.unknown()).optional(),
});

/** Map DB order_status_type to app-facing status (ORDER_PLACED, PREPARING, etc.). */
function toAppStatus(dbStatus: string | null): string {
  const s = (dbStatus ?? "assigned").toLowerCase();
  const map: Record<string, string> = {
    assigned: "ORDER_PLACED",
    accepted: "ORDER_PLACED",
    reached_store: "PREPARING",
    picked_up: "PICKED_UP",
    in_transit: "ON_THE_WAY",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };
  return map[s] ?? dbStatus ?? "ORDER_PLACED";
}

export async function orderRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(50), offset: z.coerce.number().int().min(0).optional().default(0) }),
        response: {
          200: z.array(orderSummarySchema),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      const role = req.auth?.role;
      if (!sub || role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const { limit, offset } = req.query as { limit: number; offset: number };
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const allRows = await db
        .select({
          id: ordersCore.id,
          orderId: ordersCore.orderId,
          status: ordersCore.status,
          currentStatus: ordersCore.currentStatus,
          grandTotal: ordersCore.grandTotal,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
        })
        .from(ordersCore)
        .where(eq(ordersCore.customerId, customerPk))
        .orderBy(desc(ordersCore.placedAt), desc(ordersCore.createdAt));

      const summaries = await Promise.all(
        allRows.slice(offset, offset + limit).map(async (row) => {
          const orderIdDisplay = row.orderId ?? String(row.id);
          const [foodRow] = await db
            .select({ restaurantName: ordersFood.restaurantName, foodItemsTotalValue: ordersFood.foodItemsTotalValue })
            .from(ordersFood)
            .where(
              row.orderId != null ? eq(ordersFood.coreOrderId, row.orderId) : eq(ordersFood.orderId, row.id)
            )
            .limit(1);
          const totalAmount =
            row.grandTotal != null
              ? Number(row.grandTotal)
              : foodRow?.foodItemsTotalValue != null
                ? Number(foodRow.foodItemsTotalValue)
                : null;
          const at = row.placedAt ?? row.createdAt ?? new Date();
          return {
            orderId: orderIdDisplay,
            status: row.currentStatus === "PLACED" ? "ORDER_PLACED" : (row.currentStatus ?? toAppStatus(row.status)),
            merchantName: foodRow?.restaurantName ?? null,
            totalAmount,
            createdAt: (at instanceof Date ? at : new Date(at)).toISOString(),
          };
        })
      );
      return summaries;
    }
  );

  const pendingOrderBodySchema = z.object({
    merchantId: z.string().min(1),
    merchantParentId: z.union([z.string(), z.number()]).optional(),
    items: z.array(createOrderItemSchema).min(1),
    addressId: z.string().min(1),
    paymentMethod: z.string(),
    tipAmount: z.number().nonnegative().optional(),
    donationAmount: z.number().nonnegative().optional(),
    couponCode: z.string().optional().nullable(),
    pickupAddressRaw: z.string().optional(),
    pickupLat: z.number().optional(),
    pickupLon: z.number().optional(),
    subscriptionOptIn: z.boolean().optional(),
    checkoutMetadata: z.record(z.string(), z.unknown()).optional(),
    /**
     * Optional: stable key derived from the cart signature + customer so that
     * rapid double-tap / network retries return the same pending order instead
     * of creating a duplicate. Preferred transport is the "Idempotency-Key"
     * HTTP header; this body field is kept for clients that cannot set headers.
     */
    idempotencyKey: z.string().min(8).max(128).optional(),
  });

  app.post(
    "/pending",
    {
      schema: {
        body: pendingOrderBodySchema,
        response: {
          200: z.object({ pendingId: z.string(), amount: z.number(), currency: z.string() }),
          400: z.object({ error: z.string(), message: z.string() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const body = req.body as z.infer<typeof pendingOrderBodySchema>;
      const addressIdNum = parseInt(body.addressId, 10);
      if (Number.isNaN(addressIdNum)) {
        return reply.status(400).send({ error: "INVALID_ADDRESS_DATA", message: "Invalid addressId." });
      }
      // Accept Idempotency-Key header per RFC draft. Fallback to request-body
      // field for older clients.
      const headerIdemRaw = req.headers["idempotency-key"];
      const headerIdem = Array.isArray(headerIdemRaw) ? headerIdemRaw[0] : headerIdemRaw;
      const idempotencyKey =
        (headerIdem && String(headerIdem).trim()) ||
        ((req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey != null
          ? String((req.body as { idempotencyKey?: unknown }).idempotencyKey).trim()
          : "") ||
        null;

      const result = await createPendingOrder(db, {
        customerId: customerPk,
        merchantId: body.merchantId,
        merchantParentId: body.merchantParentId != null ? Number(body.merchantParentId) : null,
        items: body.items,
        addressId: addressIdNum,
        paymentMethod: body.paymentMethod,
        tipAmount: body.tipAmount,
        donationAmount: body.donationAmount,
        couponCode: body.couponCode,
        pickupAddressRaw: body.pickupAddressRaw,
        pickupLat: body.pickupLat,
        pickupLon: body.pickupLon,
        subscriptionOptIn: body.subscriptionOptIn,
        checkoutMetadata: body.checkoutMetadata,
        idempotencyKey,
      });
      if (!result.ok) {
        return reply.status(400).send({ error: result.code, message: result.message });
      }
      return reply.send({ pendingId: result.pendingId, amount: result.amount, currency: result.currency });
    }
  );

  const finalizeOrderBodySchema = z.object({
    pendingId: z.string().min(1),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  });

  app.post(
    "/finalize",
    {
      schema: {
        body: finalizeOrderBodySchema,
        response: {
          200: z.object({
            success: z.boolean().optional(),
            orderId: z.string(),
            order_id: z.string().optional(),
            status: z.string(),
            totalAmount: z.number(),
            createdAt: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string() }),
          403: z.object({ error: z.string(), message: z.string() }),
          500: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const body = req.body as z.infer<typeof finalizeOrderBodySchema>;
      const result = await finalizeOrder(db, {
        pendingId: body.pendingId,
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
        razorpaySignature: body.razorpaySignature,
        customerId: customerPk,
      });
      if (!result.ok) {
        const status =
          result.code === "PAYMENT_NOT_VERIFIED" ||
          result.code === "PENDING_ORDER_NOT_FOUND" ||
          result.code === "INVALID_ADDRESS_DATA" ||
          result.code === "INVALID_CART_DATA"
            ? 400
            : 500;
        return reply.status(status).send({ error: result.code, message: result.message });
      }
      if (!result.orderId) {
        return reply.status(500).send({
          error: "ORDER_CREATION_FAILED",
          message: "Order was created but confirmation failed. Check My Orders.",
        });
      }
      return reply.send({
        success: true,
        orderId: result.orderId,
        order_id: result.orderId,
        status: result.status,
        totalAmount: result.totalAmount,
        createdAt: result.createdAt,
      });
    }
  );

  app.get(
    "/pending/:pendingId",
    {
      schema: {
        params: z.object({ pendingId: z.string().min(1) }),
        response: {
          200: z.object({
            pendingId: z.string(),
            paymentState: z.string(),
            finalized: z.boolean(),
            orderId: z.string().nullable(),
            refundStatus: z.string().nullable(),
            paymentConfirmBy: z.string().nullable(),
            message: z.string().nullable().optional(),
          }),
          403: z.object({ error: z.string(), message: z.string().optional() }),
          404: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const result = await getPendingOrderStatus(db, {
        pendingId: (req.params as { pendingId: string }).pendingId,
        customerId: customerPk,
      });
      if (!result.ok) {
        return reply.status(404).send({ error: result.code, message: result.message });
      }
      return reply.send({
        pendingId: result.pendingId,
        paymentState: result.paymentState,
        finalized: result.finalized,
        orderId: result.orderId,
        refundStatus: result.refundStatus,
        paymentConfirmBy: result.paymentConfirmBy,
        message: result.message ?? null,
      });
    }
  );

  app.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: orderDetailResponseSchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      const role = req.auth?.role;
      if (!sub || role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const orderIdNum = parseInt(orderIdParam, 10);
      const isNumericId = !Number.isNaN(orderIdNum);

      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const [coreRow] = await db
        .select({
          id: ordersCore.id,
          orderId: ordersCore.orderId,
          status: ordersCore.status,
          currentStatus: ordersCore.currentStatus,
          grandTotal: ordersCore.grandTotal,
          deliveryAddress: ordersCore.deliveryAddress,
          items: ordersCore.items,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
        })
        .from(ordersCore)
        .where(
          and(
            eq(ordersCore.customerId, customerPk),
            isNumericId ? eq(ordersCore.id, orderIdNum) : eq(ordersCore.orderId, orderIdParam)
          )
        )
        .limit(1);

      if (!coreRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const orderIdDisplay = coreRow.orderId ?? String(coreRow.id);
      const [foodRow] = await db
        .select({
          restaurantName: ordersFood.restaurantName,
          foodItemsTotalValue: ordersFood.foodItemsTotalValue,
        })
        .from(ordersFood)
        .where(
          coreRow.orderId != null ? eq(ordersFood.coreOrderId, coreRow.orderId) : eq(ordersFood.orderId, coreRow.id)
        )
        .limit(1);

      let items: Array<{ name: string; quantity: number; price: number }>;
      if (coreRow.orderId != null) {
        const coreItems = await db
          .select({
            itemName: ordersCoreItems.itemName,
            quantity: ordersCoreItems.quantity,
            totalPrice: ordersCoreItems.totalPrice,
          })
          .from(ordersCoreItems)
          .where(eq(ordersCoreItems.orderId, coreRow.orderId));
        items = coreItems.map((i) => ({
          name: i.itemName ?? "Item",
          quantity: i.quantity ?? 1,
          price: Number(i.totalPrice ?? 0) / (i.quantity ?? 1),
        }));
      } else {
        const itemsPayload = coreRow.items as Array<{ name?: string; menuItemId?: string; quantity?: number; price?: number }> | null;
        items =
          itemsPayload?.map((i) => ({
            name: i.name ?? i.menuItemId ?? "Item",
            quantity: i.quantity ?? 1,
            price: i.price ?? 0,
          })) ?? [];
      }

      const totalAmount =
        coreRow.grandTotal != null
          ? Number(coreRow.grandTotal)
          : foodRow?.foodItemsTotalValue != null
            ? Number(foodRow.foodItemsTotalValue)
            : null;
      const appStatus = coreRow.currentStatus === "PLACED" ? "ORDER_PLACED" : (coreRow.currentStatus ?? toAppStatus(coreRow.status));
      const createdAt = coreRow.placedAt ?? coreRow.createdAt ?? new Date();

      return {
        orderId: orderIdDisplay,
        status: appStatus,
        merchantName: foodRow?.restaurantName ?? null,
        totalAmount,
        createdAt: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString(),
        deliveryAddress: coreRow.deliveryAddress ?? null,
        statusHistory: [{ status: appStatus, at: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString() }],
        rider: null,
        items: items.length > 0 ? items : undefined,
      };
    }
  );

  app.post(
    "/",
    {
      schema: {
        body: createOrderBodySchema,
        response: {
          200: z.object({
            orderId: z.string(),
            status: z.string(),
            merchantName: z.string().optional(),
            totalAmount: z.number().optional(),
            createdAt: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string(), message: z.string().optional() }),
          500: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      const role = req.auth?.role;
      if (!sub || role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }

      const db = getDb();

      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const body = req.body as z.infer<typeof createOrderBodySchema>;
      if (!body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature) {
        return reply.status(400).send({
          error: "payment_required",
          message: "Use payment-first checkout: create pending order, complete payment, then finalize.",
        });
      }

      const addressIdNum = parseInt(body.addressId, 10);
      if (Number.isNaN(addressIdNum)) {
        return reply.status(400).send({ error: "INVALID_ADDRESS_DATA", message: "Invalid addressId." });
      }

      const pending = await createPendingOrder(db, {
        customerId: customerPk,
        merchantId: body.merchantId,
        merchantParentId: body.merchantParentId != null ? Number(body.merchantParentId) : null,
        items: body.items,
        addressId: addressIdNum,
        paymentMethod: body.paymentMethod,
        tipAmount: body.tipAmount,
        donationAmount: body.donationAmount,
        couponCode: body.couponCode,
        pickupAddressRaw: body.pickupAddressRaw,
        pickupLat: body.pickupLat,
        pickupLon: body.pickupLon,
        subscriptionOptIn: body.subscriptionOptIn,
        checkoutMetadata: body.checkoutMetadata,
      });
      if (!pending.ok) {
        return reply.status(400).send({ error: pending.code, message: pending.message });
      }

      const result = await finalizeOrder(db, {
        pendingId: pending.pendingId,
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
        razorpaySignature: body.razorpaySignature,
        customerId: customerPk,
      });
      if (!result.ok) {
        return reply.status(400).send({ error: result.code, message: result.message });
      }

      return reply.send({
        orderId: result.orderId,
        status: "ORDER_PLACED",
        totalAmount: result.totalAmount,
        createdAt: result.createdAt,
      });
    }
  );

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/:id/events",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(50) }),
        response: {
          200: z.object({
            orderId: z.string(),
            events: z.array(z.object({
              eventType: z.string(),
              toStatus: z.string(),
              createdAt: z.string(),
              payload: z.unknown().optional(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") return reply.status(403).send({ error: "Customer only" });
      const orderIdParam = (req.params as { id: string }).id;
      const limit = (req.query as { limit?: number }).limit ?? 50;
      const db = getDb();
      const [customerRow] = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) return reply.status(403).send({ error: "Customer not found" });

      const isNumeric = !Number.isNaN(parseInt(orderIdParam, 10));
      const [orderRow] = await db
        .select({ id: ordersCore.id, orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(
          and(
            eq(ordersCore.customerId, customerPk),
            isNumeric ? eq(ordersCore.id, parseInt(orderIdParam, 10)) : eq(ordersCore.orderId, orderIdParam)
          )
        )
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });

      const orderIdForEvents = orderRow.orderId ?? String(orderRow.id);
      const rows = await db
        .select({ eventType: orderEvents.eventType, toStatus: orderEvents.toStatus, createdAt: orderEvents.createdAt, payload: orderEvents.payload })
        .from(orderEvents)
        .where(eq(orderEvents.orderId, orderIdForEvents))
        .orderBy(desc(orderEvents.createdAt))
        .limit(limit);

      return {
        orderId: orderIdParam,
        events: rows.map((r) => ({
          eventType: r.eventType ?? "",
          toStatus: r.toStatus ?? "",
          createdAt: (r.createdAt ?? new Date()).toISOString(),
          payload: r.payload ?? undefined,
        })),
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/:id/eta",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            orderId: z.string(),
            etaSeconds: z.number().nullable(),
            etaMinutes: z.number().nullable(),
            updatedAt: z.string().optional(),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") return reply.status(403).send({ error: "Customer only" });
      const orderIdParam = (req.params as { id: string }).id;
      const db = getDb();
      const [customerRow] = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) return reply.status(403).send({ error: "Customer not found" });

      const isNumeric = !Number.isNaN(parseInt(orderIdParam, 10));
      const [orderRow] = await db
        .select({ id: ordersCore.id, orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(
          and(
            eq(ordersCore.customerId, customerPk),
            isNumeric ? eq(ordersCore.id, parseInt(orderIdParam, 10)) : eq(ordersCore.orderId, orderIdParam)
          )
        )
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      const orderIdForEta = orderRow.orderId ?? String(orderRow.id);

      const [latest] = await db
        .select({ etaSeconds: orderEtaSnapshots.etaSeconds, createdAt: orderEtaSnapshots.createdAt })
        .from(orderEtaSnapshots)
        .where(eq(orderEtaSnapshots.orderId, orderIdForEta))
        .orderBy(desc(orderEtaSnapshots.createdAt))
        .limit(1);

      const etaSeconds = latest?.etaSeconds != null ? Number(latest.etaSeconds) : null;
      return {
        orderId: orderIdParam,
        etaSeconds,
        etaMinutes: etaSeconds != null ? Math.round(etaSeconds / 60) : null,
        updatedAt: latest?.createdAt != null ? (latest.createdAt instanceof Date ? latest.createdAt : new Date(latest.createdAt)).toISOString() : undefined,
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/:id/tracking",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            orderId: z.string(),
            rider: z.object({
              latitude: z.number(),
              longitude: z.number(),
              headingDegrees: z.number().nullable(),
              updatedAt: z.string(),
            }).nullable(),
          }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") return reply.status(403).send({ error: "Customer only" });
      const orderIdParam = (req.params as { id: string }).id;
      const db = getDb();
      const [customerRow] = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerId, sub)).limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) return reply.status(403).send({ error: "Customer not found" });

      const isNumeric = !Number.isNaN(parseInt(orderIdParam, 10));
      const [orderRow] = await db
        .select({ id: ordersCore.id, orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(
          and(
            eq(ordersCore.customerId, customerPk),
            isNumeric ? eq(ordersCore.id, parseInt(orderIdParam, 10)) : eq(ordersCore.orderId, orderIdParam)
          )
        )
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      const orderIdForTracking = orderRow.orderId ?? String(orderRow.id);

      const [latest] = await db
        .select({
          latitude: orderRiderTracking.latitude,
          longitude: orderRiderTracking.longitude,
          headingDegrees: orderRiderTracking.headingDegrees,
          createdAt: orderRiderTracking.createdAt,
        })
        .from(orderRiderTracking)
        .where(eq(orderRiderTracking.orderId, orderIdForTracking))
        .orderBy(desc(orderRiderTracking.createdAt))
        .limit(1);

      if (!latest) {
        return { orderId: orderIdParam, rider: null };
      }
      return {
        orderId: orderIdParam,
        rider: {
          latitude: Number(latest.latitude),
          longitude: Number(latest.longitude),
          headingDegrees: latest.headingDegrees != null ? Number(latest.headingDegrees) : null,
          updatedAt: (latest.createdAt ?? new Date()).toISOString(),
        },
      };
    }
  );
}
