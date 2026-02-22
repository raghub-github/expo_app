/**
 * Customer food orders.
 * POST / creates an order (Razorpay verify + persist to core_orders + items + payments; trigger → orders_food).
 * GET /:id returns order detail (supports numeric orders_core.id or text core_orders.order_id).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { verifyRazorpaySignature } from "../../services/payment/razorpayService.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { auth } from "../../plugins/auth.js";
import { createPendingOrder, finalizeOrder } from "./order.placement.service.js";

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

/** Haversine distance in km. Server-side only; never trust frontend distance. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}
import { getDb } from "../../db/client.js";
import {
  customers,
  customerAddresses,
  ordersCore,
  ordersFood,
  coreOrders,
  coreOrderItems,
  coreOrderItemAddons,
  corePayments,
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
  itemSnapshot: z.record(z.unknown()).optional().nullable(),
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
        response: { 200: z.array(orderSummarySchema) },
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

      const coreRows = await db
        .select({
          id: ordersCore.id,
          status: ordersCore.status,
          createdAt: ordersCore.createdAt,
          orderType: ordersCore.orderType,
        })
        .from(ordersCore)
        .where(eq(ordersCore.customerId, customerPk))
        .orderBy(desc(ordersCore.createdAt));

      const coreOrderRows = await db
        .select({
          orderId: coreOrders.orderId,
          currentStatus: coreOrders.currentStatus,
          grandTotal: coreOrders.grandTotal,
          placedAt: coreOrders.placedAt,
        })
        .from(coreOrders)
        .where(eq(coreOrders.customerId, customerPk))
        .orderBy(desc(coreOrders.placedAt));

      const fromCore = await Promise.all(
        coreRows.map(async (row) => {
          const [foodRow] = await db
            .select({ restaurantName: ordersFood.restaurantName, foodItemsTotalValue: ordersFood.foodItemsTotalValue })
            .from(ordersFood)
            .where(eq(ordersFood.orderId, row.id))
            .limit(1);
          const totalAmount = foodRow?.foodItemsTotalValue != null ? Number(foodRow.foodItemsTotalValue) : null;
          return {
            orderId: String(row.id),
            status: toAppStatus(row.status),
            merchantName: foodRow?.restaurantName ?? null,
            totalAmount,
            createdAt: (row.createdAt ?? new Date()).toISOString(),
            _sort: (row.createdAt ?? new Date()).getTime(),
          };
        })
      );

      const fromCoreOrders = await Promise.all(
        coreOrderRows.map(async (row) => {
          const [foodRow] = await db
            .select({ restaurantName: ordersFood.restaurantName, foodItemsTotalValue: ordersFood.foodItemsTotalValue })
            .from(ordersFood)
            .where(eq(ordersFood.coreOrderId, row.orderId))
            .limit(1);
          const totalAmount = row.grandTotal != null ? Number(row.grandTotal) : (foodRow?.foodItemsTotalValue != null ? Number(foodRow.foodItemsTotalValue) : null);
          const placedAt = row.placedAt ?? new Date();
          return {
            orderId: row.orderId,
            status: row.currentStatus ?? "ORDER_PLACED",
            merchantName: foodRow?.restaurantName ?? null,
            totalAmount,
            createdAt: (placedAt instanceof Date ? placedAt : new Date(placedAt)).toISOString(),
            _sort: (placedAt instanceof Date ? placedAt : new Date(placedAt)).getTime(),
          };
        })
      );

      const merged = [...fromCore, ...fromCoreOrders].sort((a, b) => b._sort - a._sort);
      const summaries = merged.slice(offset, offset + limit).map(({ _sort: _, ...s }) => s);
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
    pickupAddressRaw: z.string().optional(),
    pickupLat: z.number().optional(),
    pickupLon: z.number().optional(),
  });

  app.post(
    "/pending",
    {
      schema: {
        body: pendingOrderBodySchema,
        response: {
          200: z.object({ pendingId: z.string(), amount: z.number(), currency: z.string() }),
          400: z.object({ error: z.string(), message: z.string() }),
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
        pickupAddressRaw: body.pickupAddressRaw,
        pickupLat: body.pickupLat,
        pickupLon: body.pickupLon,
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
        response: { 200: orderDetailResponseSchema },
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

      if (isNumericId) {
        const [coreRow] = await db
          .select({
            id: ordersCore.id,
            status: ordersCore.status,
            createdAt: ordersCore.createdAt,
            deliveryAddress: ordersCore.deliveryAddress,
            items: ordersCore.items,
          })
          .from(ordersCore)
          .where(and(eq(ordersCore.id, orderIdNum), eq(ordersCore.customerId, customerPk)))
          .limit(1);

        if (!coreRow) {
          return reply.status(404).send({ error: "Order not found" });
        }

        const [foodRow] = await db
          .select({
            restaurantName: ordersFood.restaurantName,
            foodItemsTotalValue: ordersFood.foodItemsTotalValue,
          })
          .from(ordersFood)
          .where(eq(ordersFood.orderId, coreRow.id))
          .limit(1);

        const itemsPayload = coreRow.items as Array<{ menuItemId?: string; name?: string; quantity?: number; price?: number }> | null;
        const items =
          itemsPayload?.map((i) => ({
            name: (i as { name?: string }).name ?? (i as { menuItemId?: string }).menuItemId ?? "Item",
            quantity: (i as { quantity?: number }).quantity ?? 1,
            price: (i as { price?: number }).price ?? 0,
          })) ?? [];

        const totalAmount = foodRow?.foodItemsTotalValue != null ? Number(foodRow.foodItemsTotalValue) : null;
        const appStatus = toAppStatus(coreRow.status);

        return {
          orderId: String(coreRow.id),
          status: appStatus,
          merchantName: foodRow?.restaurantName ?? null,
          totalAmount,
          createdAt: (coreRow.createdAt ?? new Date()).toISOString(),
          deliveryAddress: coreRow.deliveryAddress ?? null,
          statusHistory: [{ status: appStatus, at: (coreRow.createdAt ?? new Date()).toISOString() }],
          rider: null,
          items: items.length > 0 ? items : undefined,
        };
      }

      const [coreOrderRow] = await db
        .select({
          orderId: coreOrders.orderId,
          currentStatus: coreOrders.currentStatus,
          grandTotal: coreOrders.grandTotal,
          deliveryAddress: coreOrders.deliveryAddress,
          placedAt: coreOrders.placedAt,
        })
        .from(coreOrders)
        .where(and(eq(coreOrders.orderId, orderIdParam), eq(coreOrders.customerId, customerPk)))
        .limit(1);

      if (!coreOrderRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const [foodRow] = await db
        .select({
          restaurantName: ordersFood.restaurantName,
          foodItemsTotalValue: ordersFood.foodItemsTotalValue,
        })
        .from(ordersFood)
        .where(eq(ordersFood.coreOrderId, orderIdParam))
        .limit(1);

      const coreItems = await db
        .select({
          itemName: coreOrderItems.itemName,
          quantity: coreOrderItems.quantity,
          totalPrice: coreOrderItems.totalPrice,
        })
        .from(coreOrderItems)
        .where(eq(coreOrderItems.orderId, orderIdParam));

      const items = coreItems.map((i) => ({
        name: i.itemName ?? "Item",
        quantity: i.quantity ?? 1,
        price: Number(i.totalPrice ?? 0) / (i.quantity ?? 1),
      }));

      const totalAmount = coreOrderRow.grandTotal != null ? Number(coreOrderRow.grandTotal) : (foodRow?.foodItemsTotalValue != null ? Number(foodRow.foodItemsTotalValue) : null);
      const appStatus = coreOrderRow.currentStatus ?? "ORDER_PLACED";
      const createdAt = coreOrderRow.placedAt ?? new Date();

      return {
        orderId: coreOrderRow.orderId,
        status: appStatus,
        merchantName: foodRow?.restaurantName ?? null,
        totalAmount,
        createdAt: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString(),
        deliveryAddress: coreOrderRow.deliveryAddress ?? null,
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

      type ItemRow = z.infer<typeof createOrderItemSchema>;
      const itemTotal = items.reduce((s: number, i: ItemRow) => s + i.basePrice * i.quantity, 0);
      const addonTotalOrder = items.reduce((s: number, i: ItemRow) => {
        const lineAddon = (i.addons ?? []).reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
        return s + lineAddon;
      }, 0);
      const totalAmount = itemTotal + addonTotalOrder + (tipAmount ?? 0) + (donationAmount ?? 0);
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
        };
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

      const distanceKm = haversineKm(pickupLatNum, pickupLonNum, dropLat, dropLon);

      const merchantParentId = storeForOrder?.parentId ?? null;

      const orderIdText = `GM-${Date.now()}-${randomBytes(4).toString("hex")}`;

      const deliveryAddressForDb = sanitizeOptional(deliveryAddress) ?? null;

      try {
        await db.transaction(async (tx) => {
          await tx.insert(coreOrders).values({
            orderId: orderIdText,
            customerId: customerPk,
            merchantStoreId,
            merchantParentId: merchantParentId ?? undefined,
            orderType: "FOOD",
            currentStatus: "PLACED",
            itemTotal: String(itemTotal.toFixed(2)),
            addonTotal: String(addonTotalOrder.toFixed(2)),
            taxAmount: "0",
            deliveryFee: "0",
            platformFee: "0",
            discountAmount: "0",
            tipAmount: tipAmount != null ? String(tipAmount.toFixed(2)) : "0",
            grandTotal: String(totalAmount.toFixed(2)),
            currency: "INR",
            pickupAddressNormalized: pickupAddressNormalized ?? undefined,
            pickupAddressGeocoded:
              storeForOrder?.latitude != null && storeForOrder?.longitude != null
                ? { lat: storeForOrder.latitude, lng: storeForOrder.longitude }
                : undefined,
            pickupLat: String(pickupLatNum),
            pickupLon: String(pickupLonNum),
            dropAddressNormalized: dropAddressNormalized ?? undefined,
            dropAddressGeocoded: Number.isFinite(dropLat) && Number.isFinite(dropLon) ? { lat: dropLat, lng: dropLon } : undefined,
            dropLat: String(dropLat),
            dropLon: String(dropLon),
            deliveryAddress: deliveryAddressForDb ?? undefined,
            distanceKm: String(distanceKm),
            paymentStatus,
            paymentMethod: paymentMethodEnum,
          });

          const itemInserts = (items as ItemRow[]).map((i) => {
            const addonPerUnit = (i.addons ?? []).reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
            const lineAddonTotal = addonPerUnit * i.quantity;
            const lineTotal = i.basePrice * i.quantity + lineAddonTotal;
            return {
              orderId: orderIdText,
              menuItemId: Number(i.menuItemId),
              itemName: i.itemName,
              categoryName: null,
              vegNonveg: null,
              variantId: i.variantId != null ? Number(i.variantId) : undefined,
              variantName: i.variantName ?? undefined,
              quantity: i.quantity,
              basePrice: String(i.basePrice.toFixed(2)),
              addonPrice: String(addonPerUnit.toFixed(2)),
              totalPrice: String(lineTotal.toFixed(2)),
              itemSnapshot: i.itemSnapshot ?? undefined,
            };
          });

          const insertedItems = await tx.insert(coreOrderItems).values(itemInserts).returning({ id: coreOrderItems.id });
          for (let idx = 0; idx < (items as ItemRow[]).length; idx++) {
            const row = (items as ItemRow[])[idx];
            const addons = row.addons ?? [];
            if (addons.length === 0) continue;
            const orderItemId = insertedItems[idx]?.id;
            if (orderItemId == null) continue;
            await tx.insert(coreOrderItemAddons).values(
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

          await tx.insert(corePayments).values({
            orderId: orderIdText,
            paymentGateway: razorpayPaymentId ? "razorpay" : undefined,
            paymentMethod: paymentMethodEnum,
            transactionId: razorpayPaymentId ?? undefined,
            amount: String(totalAmount.toFixed(2)),
            currency: "INR",
            paymentStatus: razorpayPaymentId ? "PAID" : "PENDING",
            gatewayResponse: razorpayPaymentId ? { razorpayPaymentId, razorpayOrderId } : undefined,
            paidAt: razorpayPaymentId ? new Date() : undefined,
          });
        });
      } catch (err: unknown) {
        const e = err as Record<string, unknown>;
        const errMsg = (e?.message as string) ?? String(err);
        console.error("[API] core_orders insert failed:", errMsg);
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
      if (isNumeric) {
        const [coreRow] = await db.select({ id: ordersCore.id }).from(ordersCore).where(and(eq(ordersCore.id, parseInt(orderIdParam, 10)), eq(ordersCore.customerId, customerPk))).limit(1);
        if (!coreRow) return reply.status(404).send({ error: "Order not found" });
      } else {
        const [coreOrderRow] = await db.select({ orderId: coreOrders.orderId }).from(coreOrders).where(and(eq(coreOrders.orderId, orderIdParam), eq(coreOrders.customerId, customerPk))).limit(1);
        if (!coreOrderRow) return reply.status(404).send({ error: "Order not found" });
      }

      const orderIdForEvents = isNumeric ? orderIdParam : orderIdParam;
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
      if (isNumeric) {
        const [coreRow] = await db.select({ id: ordersCore.id }).from(ordersCore).where(and(eq(ordersCore.id, parseInt(orderIdParam, 10)), eq(ordersCore.customerId, customerPk))).limit(1);
        if (!coreRow) return reply.status(404).send({ error: "Order not found" });
      } else {
        const [coreOrderRow] = await db.select({ orderId: coreOrders.orderId }).from(coreOrders).where(and(eq(coreOrders.orderId, orderIdParam), eq(coreOrders.customerId, customerPk))).limit(1);
        if (!coreOrderRow) return reply.status(404).send({ error: "Order not found" });
      }

      const [latest] = await db
        .select({ etaSeconds: orderEtaSnapshots.etaSeconds, createdAt: orderEtaSnapshots.createdAt })
        .from(orderEtaSnapshots)
        .where(eq(orderEtaSnapshots.orderId, orderIdParam))
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
      if (isNumeric) {
        const [coreRow] = await db.select({ id: ordersCore.id }).from(ordersCore).where(and(eq(ordersCore.id, parseInt(orderIdParam, 10)), eq(ordersCore.customerId, customerPk))).limit(1);
        if (!coreRow) return reply.status(404).send({ error: "Order not found" });
      } else {
        const [coreOrderRow] = await db.select({ orderId: coreOrders.orderId }).from(coreOrders).where(and(eq(coreOrders.orderId, orderIdParam), eq(coreOrders.customerId, customerPk))).limit(1);
        if (!coreOrderRow) return reply.status(404).send({ error: "Order not found" });
      }

      const [latest] = await db
        .select({
          latitude: orderRiderTracking.latitude,
          longitude: orderRiderTracking.longitude,
          headingDegrees: orderRiderTracking.headingDegrees,
          createdAt: orderRiderTracking.createdAt,
        })
        .from(orderRiderTracking)
        .where(eq(orderRiderTracking.orderId, orderIdParam))
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
