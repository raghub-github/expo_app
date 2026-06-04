/**
 * Customer food orders.
 * POST / creates an order (Razorpay verify + persist to orders_core + items + payments; trigger → orders_food).
 * GET /:id returns order detail (supports orders_core.id, order_id GM…, or formatted_order_id GMF…).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { verifyRazorpaySignature, verifyRazorpayPaymentDetails } from "../../services/payment/razorpayService.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { getStoreRatingsForStores } from "../merchants/merchant-store-ratings.js";
import { auth } from "../../plugins/auth.js";
import { createPendingOrder, finalizeOrder } from "./order.placement.service.js";
import { getEnv } from "../../config/env.js";
import { getRoute, haversineDistanceKm } from "../distance/distance.service.js";
import { resolveOrderItemsVegNonVeg } from "../../lib/order-item-veg.js";
import { loadOrderItemAddonLabelsByCoreItemIds } from "../../lib/load-order-item-addon-labels.js";
import {
  buildCustomerOrderDetailItems,
  buildCustomerOrderDetailItemsFromJson,
} from "../../lib/customer-order-detail-items.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { getRiderAverageRating } from "../../lib/rider-average-rating.js";

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
import { getDb, getSql } from "../../db/client.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { normalizeOrderItems } from "./orderNormalizer.js";
import {
  resolveOrdersCorePk,
  writeOrderItemCommissionSnapshots,
} from "../commission/writeOrderCommissionSnapshots.js";
import { enrichAddonsWithMenuMetadata } from "../commission/resolveMenuAddonMetadata.js";
import { persistOrderItemAddonsWithSnapshots } from "../commission/persistOrderItemAddons.js";
import { resolveMenuAddonPk } from "../commission/resolveMenuAddonPk.js";
import type { Sql } from "postgres";
import {
  customers,
  customerAddresses,
  ordersCore,
  ordersFood,
  ordersCoreItems,
  ordersCorePayments,
  orderEvents,
  pendingOrders,
  orderEtaSnapshots,
  riders,
  riderVehicles,
  ordersRide,
  orderRiderTracking,
  riderLiveLocations,
  merchantStoreRatings,
} from "../../db/schema.js";

const orderDetailItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  price: z.number(),
  lineTotal: z.number().optional().nullable(),
  menuItemId: z.string().optional().nullable(),
  vegNonVeg: z.string().optional().nullable(),
  variantName: z.string().optional().nullable(),
  customization: z.string().optional().nullable(),
});

const orderDetailResponseSchema = z.object({
  orderId: z.string(),
  formattedOrderId: z.string().optional().nullable(),
  status: z.string(),
  merchantName: z.string().optional().nullable(),
  merchantPublicName: z.string().optional().nullable(),
  merchantPublicStoreId: z.string().optional().nullable(),
  merchantAddress: z.string().optional().nullable(),
  merchantBannerUrl: z.string().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  createdAt: z.string(),
  paymentMethod: z.string().optional().nullable(),
  paymentStatus: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  deliveryLat: z.number().optional().nullable(),
  deliveryLng: z.number().optional().nullable(),
  pickupLat: z.number().optional().nullable(),
  pickupLng: z.number().optional().nullable(),
  /** 4-digit delivery OTP — customer tracking only. */
  deliveryOtp: z.string().optional().nullable(),
  /** 4-digit pickup OTP — person_ride; customer shares with rider. */
  pickupOtp: z.string().optional().nullable(),
  orderType: z.string().optional().nullable(),
  rideType: z.string().optional().nullable(),
  riderReachedPickupAt: z.string().optional().nullable(),
  statusHistory: z.array(z.object({ status: z.string(), at: z.string() })).optional(),
  rider: z
    .object({
      name: z.string(),
      phone: z.string().optional(),
      photoUrl: z.string().optional().nullable(),
      rating: z.number().optional().nullable(),
      vehicleRegistration: z.string().optional().nullable(),
      vehicleModel: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  items: z.array(orderDetailItemSchema).optional(),
  billingSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
  prepTimeMinutes: z.number().int().positive().optional().nullable(),
  prepReadyByAt: z.string().optional().nullable(),
  merchantStoreId: z.number().optional().nullable(),
  storeRatingSubmitted: z.boolean().optional(),
  storeRating: z.number().int().min(1).max(5).optional().nullable(),
  deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
  storeReviewText: z.string().optional().nullable(),
  riderReviewText: z.string().optional().nullable(),
  tipAmount: z.number().nonnegative().optional().nullable(),
  distanceKm: z.number().optional().nullable(),
});

const orderSummarySchema = z.object({
  orderId: z.string(),
  formattedOrderId: z.string().optional().nullable(),
  status: z.string(),
  merchantName: z.string().optional().nullable(),
  merchantPublicName: z.string().optional().nullable(),
  merchantPublicStoreId: z.string().optional().nullable(),
  merchantAddress: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  merchantBannerUrl: z.string().optional().nullable(),
  merchantStoreId: z.number().optional().nullable(),
  orderType: z.string().optional().nullable(),
  rideType: z.string().optional().nullable(),
  pickupOtp: z.string().optional().nullable(),
  pickupLat: z.number().optional().nullable(),
  pickupLng: z.number().optional().nullable(),
  vegNonVeg: z.string().optional().nullable(),
  avgRating: z.number().optional().nullable(),
  totalReviews: z.number().int().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  createdAt: z.string(),
  storeRatingSubmitted: z.boolean().optional(),
  storeRating: z.number().int().min(1).max(5).optional().nullable(),
  deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    price: z.number(),
    menuItemId: z.string().optional().nullable(),
    vegNonVeg: z.string().optional().nullable(),
    variantName: z.string().optional().nullable(),
    customization: z.string().optional().nullable(),
  })).optional(),
});

const addonItemSchema = z.object({
  addonId: z.union([z.string(), z.number()]),
  customizationId: z.string().optional().nullable(),
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
    reached_user: "RIDER_AT_PICKUP",
    picked_up: "ON_THE_WAY",
    in_transit: "ON_THE_WAY",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };
  return map[s] ?? dbStatus ?? "ORDER_PLACED";
}

/** Uppercase OMS / rider statuses for the customer app. */
function normalizeCustomerOrderStatus(
  currentStatus: string | null | undefined,
  dbStatus: string | null | undefined
): string {
  const cur = (currentStatus ?? "").trim();
  if (cur === "PLACED") return "ORDER_PLACED";
  if (cur) return cur.toUpperCase();
  return toAppStatus(dbStatus ?? null).toUpperCase();
}

const MAX_RIDER_PICKUP_TRACKING_KM = 80;

function isValidIndiaCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
}

function isRiderPlausibleForPickup(
  riderLat: number,
  riderLng: number,
  pickupLat: number | null,
  pickupLng: number | null
): boolean {
  if (pickupLat == null || pickupLng == null) return true;
  if (!isValidIndiaCoordinate(pickupLat, pickupLng)) return true;
  if (!isValidIndiaCoordinate(riderLat, riderLng)) return false;
  const km = haversineDistanceKm(
    { lat: riderLat, lng: riderLng },
    { lat: pickupLat, lng: pickupLng }
  );
  return Number.isFinite(km) && km <= MAX_RIDER_PICKUP_TRACKING_KM;
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
          formattedOrderId: ordersCore.formattedOrderId,
          merchantStoreId: ordersCore.merchantStoreId,
          orderType: ordersCore.orderType,
          pickupOtp: ordersCore.pickupOtp,
          pickupLat: ordersCore.pickupLat,
          pickupLon: ordersCore.pickupLon,
          status: ordersCore.status,
          currentStatus: ordersCore.currentStatus,
          pickupAddressRaw: ordersCore.pickupAddressRaw,
          dropAddressRaw: ordersCore.dropAddressRaw,
          grandTotal: ordersCore.grandTotal,
          items: ordersCore.items,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
        })
        .from(ordersCore)
        .where(eq(ordersCore.customerId, customerPk))
        .orderBy(desc(ordersCore.placedAt), desc(ordersCore.createdAt));

      const storeBannerCache = new Map<number, string | null>();
      const storeRatingCache = new Map<number, { avgRating: number; totalReviews: number } | null>();
      const storeIds = [...new Set(allRows.map((r) => (r.merchantStoreId != null ? Number(r.merchantStoreId) : null)).filter((v): v is number => v != null && Number.isFinite(v) && v > 0))];
      const ratingMap = await getStoreRatingsForStores(storeIds);
      for (const sid of storeIds) {
        storeRatingCache.set(sid, ratingMap.get(sid) ?? null);
      }

      const pageRows = allRows.slice(offset, offset + limit);
      const pageOrderPks = pageRows.map((r) => r.id);
      const customerOrderRatings =
        pageOrderPks.length > 0
          ? await db
              .select({
                orderId: merchantStoreRatings.orderId,
                rating: merchantStoreRatings.rating,
                serviceRating: merchantStoreRatings.serviceRating,
              })
              .from(merchantStoreRatings)
              .where(
                and(
                  eq(merchantStoreRatings.customerId, customerPk),
                  inArray(merchantStoreRatings.orderId, pageOrderPks)
                )
              )
          : [];
      const orderRatingByPk = new Map(
        customerOrderRatings.map((r) => [Number(r.orderId), r] as const)
      );

      const rideOrderPks = pageRows
        .filter((r) => r.orderType === "person_ride")
        .map((r) => r.id);
      const rideTypeByPk = new Map<number, string>();
      if (rideOrderPks.length > 0) {
        const rideRows = await db
          .select({ orderId: ordersRide.orderId, rideType: ordersRide.rideType })
          .from(ordersRide)
          .where(inArray(ordersRide.orderId, rideOrderPks));
        for (const rr of rideRows) {
          const rt = rr.rideType?.trim();
          if (rt) rideTypeByPk.set(Number(rr.orderId), rt);
        }
      }

      const summaries = await Promise.all(
        pageRows.map(async (row) => {
          const orderIdDisplay = row.orderId ?? String(row.id);
          const [foodRow] = await db
            .select({
              restaurantName: ordersFood.restaurantName,
              foodItemsTotalValue: ordersFood.foodItemsTotalValue,
              vegNonVeg: ordersFood.vegNonVeg,
            })
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
          let merchantBannerUrl: string | null = null;
          let merchantPublicName: string | null = null;
          let merchantPublicStoreId: string | null = null;
          if (row.merchantStoreId != null) {
            const storeId = Number(row.merchantStoreId);
            if (storeBannerCache.has(storeId)) {
              merchantBannerUrl = storeBannerCache.get(storeId) ?? null;
            } else {
              const store = await getStoreByIdForOrder(storeId);
              merchantBannerUrl = store?.bannerUrl ?? null;
              merchantPublicName = store?.storeDisplayName ?? store?.storeName ?? null;
              merchantPublicStoreId = store?.storeId ?? null;
              storeBannerCache.set(storeId, merchantBannerUrl);
            }
            if (!merchantPublicName) {
              const store = await getStoreByIdForOrder(storeId);
              merchantPublicName = store?.storeDisplayName ?? store?.storeName ?? null;
              merchantPublicStoreId = store?.storeId ?? null;
            }
          }

          let items: {
            name: string;
            quantity: number;
            price: number;
            menuItemId?: string | null;
            vegNonVeg?: string | null;
            variantName?: string | null;
            customization?: string | null;
          }[] = [];
          if (Array.isArray(row.items) && row.items.length > 0) {
            const parsed = row.items as Array<{
              name?: string;
              menuItemId?: string;
              quantity?: number;
              price?: number;
              vegNonVeg?: string;
              variantName?: string;
              addons?: Array<{ addonName?: string; name?: string; quantity?: number }>;
            }>;
            items = parsed
              .map((i) => {
                const addonParts = (i.addons ?? [])
                  .map((a) => (a.addonName ?? a.name ?? "").trim())
                  .filter(Boolean);
                const customizationParts = [
                  ...(i.variantName?.trim() ? [i.variantName.trim()] : []),
                  ...addonParts,
                ];
                return {
                  name: i.name ?? i.menuItemId ?? "",
                  quantity: i.quantity ?? 1,
                  price: i.price ?? 0,
                  menuItemId: i.menuItemId?.trim() || null,
                  vegNonVeg: null as string | null,
                  variantName: i.variantName?.trim() || null,
                  customization: customizationParts.length > 0 ? customizationParts.join(" · ") : null,
                };
              })
              .filter((i) => i.name.trim().length > 0);
          }
          let itemVegInputs: Array<{
            menuItemId?: number | string | null;
            vegNonveg?: string | null;
            itemSnapshot?: Record<string, unknown> | null;
          }> = [];
          if (items.length === 0 && row.orderId) {
            const coreItems = await db
              .select({
                id: ordersCoreItems.id,
                menuItemId: ordersCoreItems.menuItemId,
                itemName: ordersCoreItems.itemName,
                quantity: ordersCoreItems.quantity,
                totalPrice: ordersCoreItems.totalPrice,
                basePrice: ordersCoreItems.basePrice,
                addonPrice: ordersCoreItems.addonPrice,
                vegNonveg: ordersCoreItems.vegNonveg,
                variantName: ordersCoreItems.variantName,
                itemSnapshot: ordersCoreItems.itemSnapshot,
              })
              .from(ordersCoreItems)
              .where(eq(ordersCoreItems.orderId, row.orderId));
            items = (
              await buildCustomerOrderDetailItems({
                orderIdText: row.orderId,
                coreItems,
                itemsJsonFallback: row.items,
              })
            ).filter((i) => i.name.trim().length > 0);
            itemVegInputs = coreItems.map((i) => ({
              menuItemId: i.menuItemId,
              vegNonveg: i.vegNonveg,
              itemSnapshot: (i.itemSnapshot as Record<string, unknown> | null | undefined) ?? null,
            }));
          }
          if (items.length > 0) {
            const vegResolved = await resolveOrderItemsVegNonVeg(
              row.merchantStoreId != null ? Number(row.merchantStoreId) : null,
              row.items,
              items.map((item, idx) =>
                itemVegInputs[idx] ?? {
                  menuItemId: item.menuItemId,
                  vegNonveg: null,
                  itemSnapshot: null,
                }
              )
            );
            items = items.map((item, idx) => ({
              ...item,
              vegNonVeg: vegResolved[idx]?.vegNonVeg ?? null,
            }));
          }

          const customerRating = orderRatingByPk.get(row.id);

          return {
            orderId: orderIdDisplay,
            coreOrderId: row.id,
            formattedOrderId: row.formattedOrderId ?? orderIdDisplay,
            status: normalizeCustomerOrderStatus(row.currentStatus, row.status),
            merchantName: foodRow?.restaurantName ?? null,
            merchantPublicName: merchantPublicName ?? foodRow?.restaurantName ?? null,
            merchantPublicStoreId,
            merchantAddress: row.pickupAddressRaw ?? null,
            deliveryAddress:
              row.orderType === "person_ride" ? row.dropAddressRaw ?? null : null,
            merchantBannerUrl,
            merchantStoreId: row.merchantStoreId != null ? Number(row.merchantStoreId) : null,
            orderType: row.orderType ?? null,
            rideType: row.orderType === "person_ride" ? rideTypeByPk.get(row.id) ?? null : null,
            pickupOtp: row.pickupOtp ?? null,
            pickupLat: row.pickupLat != null ? Number(row.pickupLat) : null,
            pickupLng: row.pickupLon != null ? Number(row.pickupLon) : null,
            vegNonVeg: foodRow?.vegNonVeg ?? null,
            avgRating: row.merchantStoreId != null ? storeRatingCache.get(Number(row.merchantStoreId))?.avgRating ?? null : null,
            totalReviews: row.merchantStoreId != null ? storeRatingCache.get(Number(row.merchantStoreId))?.totalReviews ?? null : null,
            totalAmount,
            createdAt: (at instanceof Date ? at : new Date(at)).toISOString(),
            items: items.length > 0 ? items : undefined,
            storeRatingSubmitted: customerRating != null,
            storeRating: customerRating?.rating ?? null,
            deliveryRating: customerRating?.serviceRating ?? null,
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
    /** 'delivery' (default) or 'self_pickup' — waives delivery fee, skips rider dispatch. */
    deliveryType: z.enum(["delivery", "self_pickup"]).optional(),
    checkoutMetadata: z.record(z.string(), z.unknown()).optional(),
    selectedPlatformOfferId: z.coerce.number().int().positive().optional().nullable(),
    selectedMerchantOfferId: z.coerce.number().int().positive().optional().nullable(),
    forceNoAutoOffer: z.boolean().optional(),
    idempotencyKey: z.string().min(6).max(128).optional().nullable(),
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
      const headerIdem = req.headers["idempotency-key"];
      const idempotencyKey =
        (typeof headerIdem === "string" ? headerIdem.trim() : "") ||
        body.idempotencyKey?.trim() ||
        null;
      const addressIdNum = parseInt(body.addressId, 10);
      if (Number.isNaN(addressIdNum)) {
        return reply.status(400).send({ error: "INVALID_ADDRESS_DATA", message: "Invalid addressId." });
      }
      const result = await createPendingOrder(db, {
        customerId: customerPk,
        merchantId: body.merchantId,
        merchantParentId: body.merchantParentId != null ? Number(body.merchantParentId) : null,
        // addonId is `string | number` in the wire schema (legacy clients send
        // numeric PKs). PendingOrderInput requires string — coerce here.
        items: body.items.map((it) => ({
          ...it,
          addons: (it.addons ?? []).map((a) => ({ ...a, addonId: String(a.addonId) })),
        })),
        addressId: addressIdNum,
        paymentMethod: body.paymentMethod,
        tipAmount: body.tipAmount,
        donationAmount: body.donationAmount,
        couponCode: body.couponCode,
        pickupAddressRaw: body.pickupAddressRaw,
        pickupLat: body.pickupLat,
        pickupLon: body.pickupLon,
        subscriptionOptIn: body.subscriptionOptIn,
        deliveryType: body.deliveryType,
        checkoutMetadata: body.checkoutMetadata ?? null,
        selectedPlatformOfferId: body.selectedPlatformOfferId ?? null,
        selectedMerchantOfferId: body.selectedMerchantOfferId ?? null,
        forceNoAutoOffer: body.forceNoAutoOffer,
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
            formattedOrderId: z.string().optional().nullable(),
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
      const [finalizedRow] = await db
        .select({ formattedOrderId: ordersCore.formattedOrderId })
        .from(ordersCore)
        .where(eq(ordersCore.orderId, result.orderId))
        .limit(1);
      return reply.send({
        success: true,
        orderId: result.orderId,
        order_id: result.orderId,
        formattedOrderId: finalizedRow?.formattedOrderId ?? (result as { formattedOrderId?: string | null }).formattedOrderId ?? null,
        status: result.status,
        totalAmount: result.totalAmount,
        createdAt: result.createdAt,
      });
    }
  );

  /**
   * Pending order status — used by the customer app's "Confirming payment"
   * recovery screen. After a client-side finalize that fails or times out, the
   * app polls here every few seconds. The backend reconciler (or a successful
   * Razorpay webhook) flips paymentState → FINALIZED with finalizedOrderId
   * set, and the app navigates to /orders/success.
   *
   * Returns 404 if the pending row doesn't belong to the authenticated
   * customer (no leaking of other users' orders).
   */
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
            message: z.string().optional(),
          }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Pending order not found." });
      }
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Pending order not found." });
      }

      const { pendingId } = req.params as { pendingId: string };
      const [row] = await db
        .select({
          pendingId: pendingOrders.pendingId,
          paymentState: pendingOrders.paymentState,
          finalizedOrderId: pendingOrders.finalizedOrderId,
          refundStatus: pendingOrders.refundStatus,
          paymentConfirmBy: pendingOrders.paymentConfirmBy,
          paymentFailureMessage: pendingOrders.paymentFailureMessage,
        })
        .from(pendingOrders)
        .where(and(eq(pendingOrders.pendingId, pendingId), eq(pendingOrders.customerId, customerPk)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Pending order not found." });
      }

      return reply.send({
        pendingId: row.pendingId,
        paymentState: row.paymentState ?? "unknown",
        finalized: !!row.finalizedOrderId,
        orderId: row.finalizedOrderId ?? null,
        refundStatus: row.refundStatus ?? null,
        paymentConfirmBy: row.paymentConfirmBy ? row.paymentConfirmBy.toISOString() : null,
        ...(row.paymentFailureMessage ? { message: row.paymentFailureMessage } : {}),
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
          formattedOrderId: ordersCore.formattedOrderId,
          status: ordersCore.status,
          currentStatus: ordersCore.currentStatus,
          grandTotal: ordersCore.grandTotal,
          paymentMethod: ordersCore.paymentMethod,
          paymentStatus: ordersCore.paymentStatus,
          deliveryAddress: ordersCore.deliveryAddress,
          deliveryOtp: ordersCore.deliveryOtp,
          pickupOtp: ordersCore.pickupOtp,
          orderType: ordersCore.orderType,
          items: ordersCore.items,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
          merchantStoreId: ordersCore.merchantStoreId,
          pickupAddressRaw: ordersCore.pickupAddressRaw,
          pickupLat: ordersCore.pickupLat,
          pickupLon: ordersCore.pickupLon,
          dropLat: ordersCore.dropLat,
          dropLon: ordersCore.dropLon,
          distanceKm: ordersCore.distanceKm,
          billingSnapshot: ordersCore.billingSnapshot,
          riderId: ordersCore.riderId,
          tipAmount: ordersCore.tipAmount,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);

      if (!coreRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const orderIdDisplay = coreRow.orderId ?? String(coreRow.id);
      const appStatusEarly = normalizeCustomerOrderStatus(coreRow.currentStatus, coreRow.status);
      const isLiveOrder = !["DELIVERED", "CANCELLED", "FAILED", "PAYMENT_FAILED"].includes(
        appStatusEarly
      );

      async function loadDetailItems(): Promise<
        Array<{
          name: string;
          quantity: number;
          price: number;
          lineTotal?: number;
          menuItemId?: string | null;
          vegNonVeg?: string | null;
          variantName?: string | null;
          customization?: string | null;
        }>
      > {
        if (coreRow.orderId == null) {
          const itemsPayload = coreRow.items as Array<{
            name?: string;
            item_name?: string;
            menuItemId?: string;
            item_id?: number;
            quantity?: number;
            price?: number;
            vegNonVeg?: string;
            veg_non_veg?: string;
            variantName?: string;
            variant?: string | null;
            addons?: Array<{ addonName?: string; name?: string; quantity?: number } | string>;
          }> | null;
          const built = buildCustomerOrderDetailItemsFromJson(itemsPayload);
          const vegResolved = await resolveOrderItemsVegNonVeg(
            coreRow.merchantStoreId != null ? Number(coreRow.merchantStoreId) : null,
            coreRow.items,
            built.map((item) => ({
              menuItemId: item.menuItemId,
              vegNonveg: null,
              itemSnapshot: null,
            }))
          );
          return built.map((item, idx) => ({
            ...item,
            vegNonVeg: vegResolved[idx]?.vegNonVeg ?? null,
          }));
        }

        const coreItems = await db
          .select({
            id: ordersCoreItems.id,
            menuItemId: ordersCoreItems.menuItemId,
            itemName: ordersCoreItems.itemName,
            quantity: ordersCoreItems.quantity,
            totalPrice: ordersCoreItems.totalPrice,
            basePrice: ordersCoreItems.basePrice,
            addonPrice: ordersCoreItems.addonPrice,
            vegNonveg: ordersCoreItems.vegNonveg,
            variantName: ordersCoreItems.variantName,
            itemSnapshot: ordersCoreItems.itemSnapshot,
          })
          .from(ordersCoreItems)
          .where(eq(ordersCoreItems.orderId, coreRow.orderId));

        const built = await buildCustomerOrderDetailItems({
          orderIdText: coreRow.orderId,
          coreItems,
          itemsJsonFallback: coreRow.items,
        });

        const vegInputs = coreItems.map((i) => ({
          menuItemId: i.menuItemId,
          vegNonveg: i.vegNonveg,
          itemSnapshot: (i.itemSnapshot as Record<string, unknown> | null | undefined) ?? null,
        }));
        const vegResolved = await resolveOrderItemsVegNonVeg(
          coreRow.merchantStoreId != null ? Number(coreRow.merchantStoreId) : null,
          coreRow.items,
          vegInputs
        );
        return built.map((item, idx) => ({
          ...item,
          vegNonVeg: vegResolved[idx]?.vegNonVeg ?? null,
        }));
      }

      const foodPromise = db
        .select({
          restaurantName: ordersFood.restaurantName,
          foodItemsTotalValue: ordersFood.foodItemsTotalValue,
        })
        .from(ordersFood)
        .where(
          coreRow.orderId != null
            ? eq(ordersFood.coreOrderId, coreRow.orderId)
            : eq(ordersFood.orderId, coreRow.id)
        )
        .limit(1);

      const storePromise =
        coreRow.merchantStoreId != null
          ? getStoreByIdForOrder(Number(coreRow.merchantStoreId))
          : Promise.resolve(null);

      const riderPromise =
        coreRow.riderId != null
          ? db
              .select({
                name: riders.name,
                mobile: riders.mobile,
                selfieUrl: riders.selfieUrl,
              })
              .from(riders)
              .where(eq(riders.id, coreRow.riderId))
              .limit(1)
          : Promise.resolve([]);

      const vehiclePromise =
        coreRow.riderId != null
          ? db
              .select({
                registrationNumber: riderVehicles.registrationNumber,
                vehicleNumber: riderVehicles.vehicleNumber,
                model: riderVehicles.model,
                make: riderVehicles.make,
              })
              .from(riderVehicles)
              .where(
                and(
                  eq(riderVehicles.riderId, coreRow.riderId),
                  eq(riderVehicles.isActive, true),
                  isNull(riderVehicles.deletedAt)
                )
              )
              .orderBy(desc(riderVehicles.updatedAt))
              .limit(1)
          : Promise.resolve([]);

      const rideMetaPromise =
        coreRow.orderType === "person_ride"
          ? db
              .select({
                rideType: ordersRide.rideType,
                riderReachedPickupAt: ordersRide.riderReachedPickupAt,
              })
              .from(ordersRide)
              .where(eq(ordersRide.orderId, coreRow.id))
              .limit(1)
          : Promise.resolve([]);

      const riderRatingPromise =
        coreRow.riderId != null
          ? getRiderAverageRating(Number(coreRow.riderId))
          : Promise.resolve(null);

      const prepPromise =
        isLiveOrder && orderIdDisplay
          ? getSql()<
              Array<{ prep_time_minutes: number | null; prep_ready_by_at: Date | string | null }>
            >`
              SELECT prep_time_minutes, prep_ready_by_at
              FROM orders_core
              WHERE order_id = ${orderIdDisplay}
              LIMIT 1
            `
          : Promise.resolve([]);

      const [foodRows, items, store, riderRows, prepRows, vehicleRows, rideMetaRows, riderAvgRating] =
        await Promise.all([
        foodPromise,
        loadDetailItems(),
        storePromise,
        riderPromise,
        prepPromise,
        vehiclePromise,
        rideMetaPromise,
        riderRatingPromise,
      ]);

      const foodRow = foodRows[0] ?? null;
      const merchantBannerUrl = store?.bannerUrl ?? null;
      const merchantPublicName = store?.storeDisplayName ?? store?.storeName ?? null;
      const merchantPublicStoreId = store?.storeId ?? null;

      let rider: {
        name: string;
        phone?: string;
        photoUrl?: string | null;
        rating?: number | null;
        vehicleRegistration?: string | null;
        vehicleModel?: string | null;
      } | null = null;
      const riderRow = riderRows[0];
      const vehicleRow = vehicleRows[0] ?? null;
      const rideMetaRow = rideMetaRows[0] ?? null;
      if (riderRow) {
        const reg =
          vehicleRow?.registrationNumber?.trim() ||
          vehicleRow?.vehicleNumber?.trim() ||
          null;
        const modelParts = [vehicleRow?.make, vehicleRow?.model].filter(Boolean).join(" ").trim();
        rider = {
          name: riderRow.name?.trim() || "Captain",
          phone: riderRow.mobile ?? undefined,
          photoUrl: riderRow.selfieUrl?.trim() || null,
          rating: riderAvgRating,
          vehicleRegistration: reg,
          vehicleModel: modelParts || rideMetaRow?.rideType?.trim() || null,
        };
      }

      const totalAmount =
        coreRow.grandTotal != null
          ? Number(coreRow.grandTotal)
          : foodRow?.foodItemsTotalValue != null
            ? Number(foodRow.foodItemsTotalValue)
            : null;
      const appStatus = appStatusEarly;
      const createdAt = coreRow.placedAt ?? coreRow.createdAt ?? new Date();

      let prepTimeMinutes: number | null = null;
      let prepReadyByAt: string | null = null;
      const prepRow = prepRows[0];
      if (prepRow) {
        const pm = prepRow.prep_time_minutes;
        prepTimeMinutes = pm != null && Number(pm) > 0 ? Number(pm) : null;
        const rawReady = prepRow.prep_ready_by_at;
        prepReadyByAt =
          rawReady instanceof Date
            ? rawReady.toISOString()
            : rawReady != null
              ? String(rawReady)
              : null;
      }

      const [existingStoreRating] = await db
        .select({
          rating: merchantStoreRatings.rating,
          serviceRating: merchantStoreRatings.serviceRating,
          reviewText: merchantStoreRatings.reviewText,
          reviewTitle: merchantStoreRatings.reviewTitle,
        })
        .from(merchantStoreRatings)
        .where(
          and(
            eq(merchantStoreRatings.orderId, coreRow.id),
            eq(merchantStoreRatings.customerId, customerPk)
          )
        )
        .limit(1);

      const billingSnap = (coreRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      const snapTip = billingSnap?.tip_amount != null ? Number(billingSnap.tip_amount) : 0;
      const coreTip = coreRow.tipAmount != null ? Number(coreRow.tipAmount) : 0;
      const resolvedTipAmount =
        Number.isFinite(snapTip) && snapTip > 0
          ? snapTip
          : Number.isFinite(coreTip) && coreTip > 0
            ? coreTip
            : 0;

      return {
        orderId: orderIdDisplay,
        coreOrderId: coreRow.id,
        formattedOrderId: coreRow.formattedOrderId ?? orderIdDisplay,
        status: appStatus,
        merchantName: foodRow?.restaurantName ?? merchantPublicName ?? null,
        merchantPublicName: merchantPublicName ?? foodRow?.restaurantName ?? null,
        merchantPublicStoreId,
        merchantStoreId:
          coreRow.merchantStoreId != null ? Number(coreRow.merchantStoreId) : null,
        merchantAddress: coreRow.pickupAddressRaw ?? null,
        merchantBannerUrl,
        totalAmount,
        createdAt: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString(),
        paymentMethod: coreRow.paymentMethod ?? null,
        paymentStatus: coreRow.paymentStatus ?? null,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        deliveryLat: coreRow.dropLat != null ? Number(coreRow.dropLat) : null,
        deliveryLng: coreRow.dropLon != null ? Number(coreRow.dropLon) : null,
        pickupLat: coreRow.pickupLat != null ? Number(coreRow.pickupLat) : null,
        pickupLng: coreRow.pickupLon != null ? Number(coreRow.pickupLon) : null,
        deliveryOtp: coreRow.deliveryOtp ?? null,
        pickupOtp: coreRow.pickupOtp ?? null,
        orderType: coreRow.orderType ?? null,
        rideType: rideMetaRow?.rideType?.trim() || null,
        riderReachedPickupAt:
          rideMetaRow?.riderReachedPickupAt instanceof Date
            ? rideMetaRow.riderReachedPickupAt.toISOString()
            : rideMetaRow?.riderReachedPickupAt != null
              ? String(rideMetaRow.riderReachedPickupAt)
              : null,
        statusHistory: [{ status: appStatus, at: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString() }],
        rider,
        items: items.length > 0 ? items : undefined,
        billingSnapshot: billingSnap,
        prepTimeMinutes,
        prepReadyByAt,
        storeRatingSubmitted: existingStoreRating != null,
        storeRating: existingStoreRating?.rating ?? null,
        deliveryRating: existingStoreRating?.serviceRating ?? null,
        storeReviewText: existingStoreRating?.reviewText?.trim() || null,
        riderReviewText: existingStoreRating?.reviewTitle?.trim() || null,
        tipAmount: resolvedTipAmount,
        distanceKm: coreRow.distanceKm != null ? Number(coreRow.distanceKm) : null,
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
      let billingSnapshot: Record<string, unknown> | null = null;
      let billingRulesetVersion: number | null = null;

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
        billingSnapshot = billRes.snapshot;
        billingRulesetVersion = billRes.billing.ruleset_version;
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

      if (razorpayOrderId || razorpayPaymentId || razorpaySignature) {
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return reply.status(400).send({
            error: "invalid_payment",
            message: "Incomplete Razorpay payment details. Please retry payment.",
          });
        }

        const expectedAmountPaise = Math.round(totalAmount * 100);
        const paymentCheck = await verifyRazorpayPaymentDetails(
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          expectedAmountPaise,
          "INR"
        );
        if (!paymentCheck.ok) {
          return reply.status(400).send({
            error: paymentCheck.code || "invalid_payment",
            message: paymentCheck.message || "Payment verification failed. Please try again.",
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
          storeId: store.store_id ?? null,
          fullAddress: store.full_address ?? null,
          bannerUrl: store.banner_url ?? null,
          storeName: store.store_name ?? null,
          storeDisplayName: store.store_display_name ?? null,
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
      const { sql: drizzleSql } = await import("drizzle-orm");

      let orderIdText: string;
      try {
        const txResult = await db.transaction(async (tx) => {
          const seqResult = await tx.execute(
            drizzleSql`SELECT ('GM' || nextval('order_id_seq'))::text as order_id`
          );
          // drizzle returns the rows in different shapes depending on driver;
          // coerce through unknown so the typed access compiles cleanly.
          const rowsRaw = (Array.isArray(seqResult) ? seqResult : (seqResult as { rows?: unknown[] }).rows ?? []) as unknown[];
          const firstRow = rowsRaw[0] as { order_id?: unknown } | undefined;
          const idTextMaybe = firstRow?.order_id != null ? String(firstRow.order_id) : undefined;
          if (!idTextMaybe) throw new Error("Failed to generate order_id");
          const idText: string = idTextMaybe;

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
            billingSnapshot: billingSnapshot ?? undefined,
            billingRulesetVersion: billingRulesetVersion ?? undefined,
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
              // DB column is bigint — only the numeric variant PK belongs here.
              variantId: i.variantId ?? null,
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
          const orderIdNumRoute = await resolveOrdersCorePk(tx, idText);
          const sql = getSql();
          await enrichAddonsWithMenuMetadata(sql, merchantStoreId, normItems);
          for (const it of normItems) {
            for (const ad of it.addons) {
              if (ad.menuAddonPk != null && ad.menuAddonPk > 0) continue;
              const pk = await resolveMenuAddonPk(
                sql,
                merchantStoreId,
                ad.menuAddonId,
                ad.customizationId,
              );
              if (pk) ad.menuAddonPk = pk;
            }
          }
          for (let idx = 0; idx < normItems.length; idx++) {
            const row = normItems[idx]!;
            const addons = row.addons;
            if (addons.length === 0) continue;
            const orderItemId = insertedItems[idx]?.id;
            if (orderItemId == null || orderIdNumRoute == null) continue;
            await persistOrderItemAddonsWithSnapshots(tx, {
              storeId: merchantStoreId,
              orderIdNum: orderIdNumRoute,
              orderItemId: Number(orderItemId),
              addons,
            });
          }

          const snapshotInputsRoute = insertedItems
            .map((row: { id?: number }, idx: number) => {
              if (row?.id == null) return null;
              const it = normItems[idx]!;
              return {
                orderIdText: idText,
                orderItemId: Number(row.id),
                customerVisiblePerUnitRupees: Number(it.basePrice),
                quantity: it.quantity,
              };
            })
            .filter((x: unknown): x is NonNullable<typeof x> => x != null);
          if (snapshotInputsRoute.length > 0) {
            await writeOrderItemCommissionSnapshots(
              tx,
              merchantStoreId,
              snapshotInputsRoute,
              orderIdNumRoute ?? undefined,
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

      const [createdRow] = await db
        .select({ formattedOrderId: ordersCore.formattedOrderId })
        .from(ordersCore)
        .where(eq(ordersCore.orderId, orderIdText))
        .limit(1);

      return reply.send({
        orderId: orderIdText,
        formattedOrderId: createdRow?.formattedOrderId ?? orderIdText,
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

      const [orderRow] = await db
        .select({ id: ordersCore.id, orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
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

      const [orderRow] = await db
        .select({ id: ordersCore.id, orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
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

      const [orderRow] = await db
        .select({
          id: ordersCore.id,
          orderId: ordersCore.orderId,
          riderId: ordersCore.riderId,
          pickupLat: ordersCore.pickupLat,
          pickupLon: ordersCore.pickupLon,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      const orderIdForTracking = orderRow.orderId ?? String(orderRow.id);
      const pickupLatNum =
        orderRow.pickupLat != null ? Number(orderRow.pickupLat) : null;
      const pickupLngNum =
        orderRow.pickupLon != null ? Number(orderRow.pickupLon) : null;

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

      if (latest) {
        const riderLat = Number(latest.latitude);
        const riderLng = Number(latest.longitude);
        if (isRiderPlausibleForPickup(riderLat, riderLng, pickupLatNum, pickupLngNum)) {
          return {
            orderId: orderIdParam,
            rider: {
              latitude: riderLat,
              longitude: riderLng,
              headingDegrees: latest.headingDegrees != null ? Number(latest.headingDegrees) : null,
              updatedAt: (latest.createdAt ?? new Date()).toISOString(),
            },
          };
        }
      }

      if (orderRow.riderId != null) {
        const [live] = await db
          .select({
            latitude: riderLiveLocations.latitude,
            longitude: riderLiveLocations.longitude,
            heading: riderLiveLocations.heading,
            updatedAt: riderLiveLocations.updatedAt,
          })
          .from(riderLiveLocations)
          .where(eq(riderLiveLocations.riderId, orderRow.riderId))
          .limit(1);

        if (live) {
          const riderLat = Number(live.latitude);
          const riderLng = Number(live.longitude);
          if (isRiderPlausibleForPickup(riderLat, riderLng, pickupLatNum, pickupLngNum)) {
            return {
              orderId: orderIdParam,
              rider: {
                latitude: riderLat,
                longitude: riderLng,
                headingDegrees: live.heading != null ? Number(live.heading) : null,
                updatedAt: (live.updatedAt ?? new Date()).toISOString(),
              },
            };
          }
        }
      }

      return { orderId: orderIdParam, rider: null };
    }
  );

  const storeRatingBodySchema = z.object({
    storeRating: z.number().int().min(1).max(5),
    deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
    reviewText: z.string().max(2000).optional().nullable(),
    riderReviewText: z.string().max(2000).optional().nullable(),
    riderTipAmount: z.number().nonnegative().optional().nullable(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof storeRatingBodySchema> }>(
    "/:id/store-rating",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: storeRatingBodySchema,
        response: {
          200: z.object({
            submitted: z.literal(true),
            storeRating: z.number(),
            deliveryRating: z.number().nullable(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = storeRatingBodySchema.parse(req.body ?? {});
      const db = getDb();

      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) return reply.status(403).send({ error: "Customer not found" });

      const [orderRow] = await db
        .select({
          id: ordersCore.id,
          merchantStoreId: ordersCore.merchantStoreId,
          currentStatus: ordersCore.currentStatus,
          status: ordersCore.status,
          riderId: ordersCore.riderId,
          tipAmount: ordersCore.tipAmount,
          billingSnapshot: ordersCore.billingSnapshot,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (statusUpper !== "DELIVERED") {
        return reply.status(400).send({
          error: "order_not_delivered",
          message: "You can rate the store after delivery is complete.",
        });
      }

      const storeId = orderRow.merchantStoreId != null ? Number(orderRow.merchantStoreId) : null;
      if (storeId == null || !Number.isFinite(storeId) || storeId <= 0) {
        return reply.status(400).send({ error: "store_not_found" });
      }

      const [existing] = await db
        .select({ id: merchantStoreRatings.id })
        .from(merchantStoreRatings)
        .where(
          and(
            eq(merchantStoreRatings.orderId, orderRow.id),
            eq(merchantStoreRatings.customerId, customerPk)
          )
        )
        .limit(1);
      if (existing) {
        return reply.status(409).send({ error: "already_rated" });
      }

      const deliveryRating =
        body.deliveryRating != null && Number.isFinite(body.deliveryRating)
          ? Math.round(body.deliveryRating)
          : null;
      const reviewText =
        typeof body.reviewText === "string" && body.reviewText.trim()
          ? body.reviewText.trim()
          : null;

      const riderTipRaw =
        body.riderTipAmount != null && Number.isFinite(body.riderTipAmount)
          ? Math.round(body.riderTipAmount)
          : 0;
      const existingTip =
        orderRow.tipAmount != null && Number(orderRow.tipAmount) > 0
          ? Number(orderRow.tipAmount)
          : 0;
      const snap = (orderRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      const snapTip =
        snap?.tip_amount != null && Number(snap.tip_amount) > 0 ? Number(snap.tip_amount) : 0;
      const hadCheckoutTip = existingTip > 0 || snapTip > 0;
      const riderTipAmount = !hadCheckoutTip && riderTipRaw > 0 ? riderTipRaw : 0;

      const riderReviewText =
        typeof body.riderReviewText === "string" && body.riderReviewText.trim()
          ? body.riderReviewText.trim()
          : null;

      await db.insert(merchantStoreRatings).values({
        storeId,
        orderId: orderRow.id,
        customerId: customerPk,
        rating: body.storeRating,
        foodRating: body.storeRating,
        serviceRating: deliveryRating,
        packagingRating: null,
        reviewText,
        reviewTitle: riderReviewText,
        isVerified: true,
      });

      if (riderTipAmount > 0 && orderRow.riderId != null) {
        const nextSnap = {
          ...(snap ?? {}),
          tip_amount: riderTipAmount,
          post_delivery_tip: true,
        };
        await db
          .update(ordersCore)
          .set({
            tipAmount: String(riderTipAmount),
            billingSnapshot: nextSnap,
          })
          .where(eq(ordersCore.id, orderRow.id));

        const sql = getSql();
        try {
          await sql`
            INSERT INTO customer_tips_given (customer_id, order_id, rider_id, tip_amount, tip_paid, paid_at)
            VALUES (
              ${customerPk}::bigint,
              ${orderRow.id}::bigint,
              ${orderRow.riderId}::integer,
              ${String(riderTipAmount)}::numeric,
              TRUE,
              NOW()
            )
          `;
        } catch {
          /* legacy FK may reference orders(id); orders_core tip is still updated */
        }
      }

      return {
        submitted: true as const,
        storeRating: body.storeRating,
        deliveryRating,
      };
    }
  );
}
