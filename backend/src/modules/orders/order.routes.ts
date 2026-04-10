/**
 * Customer food orders.
 * POST / creates an order (Razorpay verify + persist to orders_core + items + payments; trigger → orders_food).
 * GET /:id returns order detail (supports numeric orders_core.id or text orders_core.order_id e.g. GM10000001).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { verifyRazorpaySignature } from "../../services/payment/razorpayService.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { auth } from "../../plugins/auth.js";
import { createPendingOrder, finalizeOrder } from "./order.placement.service.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";

/** Em dash / empty → null for DB. Never insert placeholder characters. */
const EM_DASH = "\u2014";
function sanitizeOptional<T>(v: T): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === EM_DASH) return null;
    return t as T;
  }
  return v;
}
import { getDb } from "../../db/client.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { normalizeOrderItems } from "./orderNormalizer.js";
import {
  customers,
  customerAddresses,
  ordersCore,
  ordersFood,
  ordersCoreItems,
  ordersCoreItemAddons,
  ordersCorePayments,
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
});

const paymentMethodToEnum = (method: string): "upi" | "card" | "wallet" | "online" | "cod" | "other" => {
  const m = (method || "").toLowerCase();
  if (["upi", "card", "wallet", "online", "cod", "netbanking"].includes(m)) return m as "upi" | "card" | "wallet" | "online" | "cod";
  return "online";
};

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
      const body = req.body as z.infer<typeof createOrderBodySchema>;
      const {
        merchantId,
        merchantParentId: merchantParentIdRaw,
        items,
        addressId,
        paymentMethod,
        tipAmount,
        donationAmount,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        pickupAddressRaw,
        pickupLat,
        pickupLon,
        couponCode,
        subscriptionOptIn,
      } = body;

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

      const addressIdNum = parseInt(addressId, 10);
      if (Number.isNaN(addressIdNum)) {
        return reply.status(400).send({ error: "Invalid addressId" });
      }

      const [addrRow] = await db
        .select({
          addressLine1: customerAddresses.addressLine1,
          addressLine2: customerAddresses.addressLine2,
          city: customerAddresses.city,
          state: customerAddresses.state,
          postalCode: customerAddresses.postalCode,
          latitude: customerAddresses.latitude,
          longitude: customerAddresses.longitude,
        })
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, addressIdNum),
            eq(customerAddresses.customerId, customerPk),
            eq(customerAddresses.isActive, true),
            isNull(customerAddresses.deletedAt)
          )
        )
        .limit(1);

      if (!addrRow) {
        return reply.status(400).send({ error: "Address not found" });
      }

      const normOrder = normalizeOrderItems(items);
      if (!normOrder.ok) {
        return reply.status(400).send({ error: normOrder.code, message: normOrder.message });
      }
      const normItems = normOrder.items;

      const itemTotal = normItems.reduce((s, i) => s + i.basePrice * i.quantity, 0);
      const addonTotalOrder = normItems.reduce((s, i) => {
        const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
        return s + lineAddon;
      }, 0);
      let totalAmount = itemTotal + addonTotalOrder + (tipAmount ?? 0) + (donationAmount ?? 0);

      if (getEnv().BILLING_RULES_ENABLED) {
        const billRes = await computeBillForOrder(db, {
          customerId: Number(customerPk),
          merchantId,
          items: normItems,
          addressId: addressIdNum,
          tipAmount: tipAmount ?? 0,
          donationAmount: donationAmount ?? 0,
          couponCode: couponCode?.trim() || null,
          pickupLat,
          pickupLon,
          subscriptionOptIn: subscriptionOptIn === true,
        });
        if (!billRes.ok) {
          return reply.status(400).send({ error: billRes.code, message: billRes.message });
        }
        totalAmount = billRes.billing.final_amount;
      }

      const dropAddressRaw =
        [addrRow.addressLine1, addrRow.addressLine2, addrRow.city, addrRow.state, addrRow.postalCode]
          .filter(Boolean)
          .join(", ") || "";
      const dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
      const dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;
      const deliveryAddress = dropAddressRaw;
      const deliveryLat = dropLat;
      const deliveryLon = dropLon;

      const pickupRaw = pickupAddressRaw ?? dropAddressRaw;
      const pLat = pickupLat ?? dropLat;
      const pLon = pickupLon ?? dropLon;

      if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
        const valid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!valid) {
          return reply.status(400).send({
            error: "invalid_payment",
            message: "Payment verification failed. Please try again.",
          });
        }
      }

      const paymentStatus = razorpayPaymentId ? "PAID" : "PENDING";
      const paymentMethodEnum = paymentMethodToEnum(paymentMethod);

      let merchantStoreId: number;
      let storeForOrder: Awaited<ReturnType<typeof getStoreByIdForOrder>> = null;
      const parsed = parseInt(String(merchantId).trim(), 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        merchantStoreId = parsed;
        storeForOrder = await getStoreByIdForOrder(merchantStoreId);
      } else {
        const store = await getStoreByStoreId(merchantId);
        if (!store) {
          return reply.status(400).send({
            error: "Invalid merchantId",
            message: "Store not found. Please try again from the restaurant page.",
          });
        }
        merchantStoreId = Number(store.id);
        storeForOrder = {
          parentId: store.parent_id != null ? Number(store.parent_id) : null,
          fullAddress: store.full_address ?? null,
          latitude: store.latitude != null ? Number(store.latitude) : null,
          longitude: store.longitude != null ? Number(store.longitude) : null,
          is_accepting_orders: store.is_accepting_orders === true,
        };
      }

      if (storeForOrder && storeForOrder.is_accepting_orders === false) {
        return reply.status(400).send({
          error: "store_closed",
          message: "This store is not accepting orders right now. Please try again later.",
        });
      }

      const pickupLatNum = storeForOrder?.latitude != null ? storeForOrder.latitude! : pLat;
      const pickupLonNum = storeForOrder?.longitude != null ? storeForOrder.longitude! : pLon;
      const pickupAddressNormalized = sanitizeOptional((storeForOrder?.fullAddress ?? pickupRaw).trim() || "") ?? null;
      const pickupAddressGeocoded =
        storeForOrder?.latitude != null && storeForOrder?.longitude != null
          ? JSON.stringify({ lat: storeForOrder.latitude, lng: storeForOrder.longitude })
          : null;

      const dropAddressNormalized = sanitizeOptional(dropAddressRaw.trim() || "") ?? null;
      const dropAddressGeocoded =
        Number.isFinite(dropLat) && Number.isFinite(dropLon)
          ? JSON.stringify({ lat: dropLat, lng: dropLon })
          : null;

      // Canonical distance: route-based between store pickup and selected drop address.
      // Use routing engine with internal fallback to Haversine when providers fail.
      let distanceKm = 0;
      try {
        const env = getEnv();
        const route = await getRoute({
          origin: { lat: pickupLatNum, lng: pickupLonNum },
          destination: { lat: dropLat, lng: dropLon },
          profile: "driving",
          mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
          osrmBaseUrl: env.OSRM_BASE_URL || undefined,
        });
        distanceKm = route.distanceKm;
      } catch {
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(dropLat - pickupLatNum);
        const dLon = toRad(dropLon - pickupLonNum);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(pickupLatNum)) * Math.cos(toRad(dropLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanceKm = Math.round(R * c * 100) / 100;
      }

      const merchantParentId = storeForOrder?.parentId ?? null;

      const deliveryAddressForDb = sanitizeOptional(deliveryAddress) ?? null;
      const { sql } = await import("drizzle-orm");

      let orderIdText: string;
      try {
        const txResult = await db.transaction(async (tx) => {
          const seqResult = await tx.execute(
            sql`SELECT ('GM' || nextval('order_id_seq'))::text as order_id`
          );
          const rows = Array.isArray(seqResult) ? seqResult : (seqResult as { rows?: { order_id: string }[] }).rows ?? [];
          const idText = rows[0]?.order_id ?? (rows as { order_id?: string }[])[0]?.order_id;
          if (!idText) throw new Error("Failed to generate order_id");

          const coreInsert = tx.insert(ordersCore) as any;
          await coreInsert.values({
            orderId: idText,
            orderType: "food",
            orderSource: "internal",
            customerId: customerPk,
            merchantStoreId,
            merchantParentId: merchantParentId ?? undefined,
            status: "assigned",
            currentStatus: "PLACED",
            itemTotal: String(itemTotal.toFixed(2)),
            addonTotal: String(addonTotalOrder.toFixed(2)),
            grandTotal: String(totalAmount.toFixed(2)),
            tipAmount: tipAmount != null ? String(tipAmount.toFixed(2)) : "0",
            placedAt: new Date(),
            pickupAddressRaw: pickupAddressNormalized ?? " ",
            pickupLat: String(pickupLatNum),
            pickupLon: String(pickupLonNum),
            dropAddressRaw: dropAddressNormalized ?? " ",
            dropLat: String(dropLat),
            dropLon: String(dropLon),
            deliveryAddress: deliveryAddressForDb ?? undefined,
            distanceKm: String(distanceKm),
            paymentStatus: paymentStatus === "PAID" ? "completed" : "pending",
            paymentMethod: paymentMethodEnum,
          } as any);

          const itemInserts = normItems.map((i) => {
            const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
            const lineAddonTotal = addonPerUnit * i.quantity;
            const lineTotal = i.basePrice * i.quantity + lineAddonTotal;
            return {
              orderId: idText,
              menuItemId: i.menuItemId,
              itemName: i.itemName,
              categoryName: null,
              vegNonveg: null,
              variantId: i.variantId ?? undefined,
              variantName: i.variantName ?? undefined,
              quantity: i.quantity,
              basePrice: String(i.basePrice.toFixed(2)),
              addonPrice: String(addonPerUnit.toFixed(2)),
              totalPrice: String(lineTotal.toFixed(2)),
              itemSnapshot: i.itemSnapshot ?? undefined,
            };
          });

          const insertedItems = await (tx.insert(ordersCoreItems) as any)
            .values(itemInserts as any)
            .returning({ id: ordersCoreItems.id });
          for (let idx = 0; idx < normItems.length; idx++) {
            const row = normItems[idx]!;
            const addons = row.addons;
            if (addons.length === 0) continue;
            const orderItemId = insertedItems[idx]?.id;
            if (orderItemId == null) continue;
            await tx.insert(ordersCoreItemAddons).values(
              addons.map((ad) => {
                const n = Number(ad.addonId);
                return {
                  orderItemId,
                  addonId: Number.isNaN(n) ? undefined : n,
                  addonName: ad.addonName,
                  addonPrice: String(ad.addonPrice.toFixed(2)),
                  quantity: ad.quantity,
                };
              })
            );
          }

          const paymentInsert = tx.insert(ordersCorePayments) as any;
          await paymentInsert.values({
            orderId: idText,
            paymentGateway: razorpayPaymentId ? "razorpay" : undefined,
            paymentMethod: paymentMethodEnum,
            transactionId: razorpayPaymentId ?? undefined,
            amount: String(totalAmount.toFixed(2)),
            currency: "INR",
            paymentStatus: razorpayPaymentId ? "PAID" : "PENDING",
            gatewayResponse: razorpayPaymentId ? { razorpayPaymentId, razorpayOrderId } : undefined,
            paidAt: razorpayPaymentId ? new Date() : undefined,
          } as any);

          return idText;
        });
        orderIdText = txResult as string;
      } catch (err: unknown) {
        const e = err as Record<string, unknown>;
        const errMsg = (e?.message as string) ?? String(err);
        console.error("[API] orders_core insert failed:", errMsg);
        if (e?.detail) console.error("[API] detail:", e.detail);
        if (e?.constraint) console.error("[API] constraint:", e.constraint);
        if (e?.code) console.error("[API] code:", e.code);
        if (e?.cause) console.error("[API] cause:", e.cause);
        console.error("[API] full error:", err);
        return reply.status(500).send({
          error: "order_creation_failed",
          message: "Order could not be created. Please try again.",
          ...(process.env.NODE_ENV !== "production" && { debug: errMsg }),
        });
      }

      return reply.send({
        orderId: orderIdText,
        status: "ORDER_PLACED",
        totalAmount,
        createdAt: new Date().toISOString(),
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
