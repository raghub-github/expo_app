/**
 * Customer food orders.
 * POST / creates an order (Razorpay verify + persist to orders_core + items + payments; trigger → orders_food).
 * GET /:id returns order detail (supports orders_core.id, order_id GM…, or formatted_order_id GMF…).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { verifyRazorpaySignature, verifyRazorpayPaymentDetails } from "../../services/payment/razorpayService.js";
import { getStoreByStoreId, getStoreByIdForOrder, getMerchantAboutPayload } from "../merchants/merchant.service.js";
import { getStoreRatingsForStores } from "../merchants/merchant-store-ratings.js";
import { auth } from "../../plugins/auth.js";
import {
  createPendingOrder,
  finalizeOrder,
  orderLinePricingFieldsFromSnapshot,
} from "./order.placement.service.js";
import { getEnv } from "../../config/env.js";
import { getRoute, haversineDistanceKm } from "../distance/distance.service.js";
import { resolveOrderItemsVegNonVeg } from "../../lib/order-item-veg.js";
import { loadOrderItemAddonLabelsByCoreItemIds } from "../../lib/load-order-item-addon-labels.js";
import {
  buildCustomerOrderDetailItems,
  buildCustomerOrderDetailItemsFromJson,
  loadAddonsByCoreItemIdsForOrders,
  loadPendingCartLinesByOrderIds,
} from "../../lib/customer-order-detail-items.js";
import { normalizeOrderItemSpecialInstructions } from "../../lib/order-item-special-instructions.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { getRiderAverageRating } from "../../lib/rider-average-rating.js";
import { resolveOrderDeliveryDetails } from "../../lib/order-delivery-details.js";
import { buildDeliveryPromiseComparison } from "../../lib/delivery-promise-comparison.js";
import { resolveCustomerAppOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { loadFoodDeliveryOtpCandidates } from "../../lib/resolve-food-delivery-otp.js";
import {
  loadOrdersFoodSummariesByCoreRows,
  ordersFoodMatchForCoreRow,
} from "../../lib/food-order-enrichment.js";
import {
  debitCustomerGatiCashForRideFare,
  getCustomerGatiCashAvailable,
} from "../../lib/checkout-gaticash-wallet-ops.js";
import {
  appendMerchantInstruction,
  canCustomerAppendCookingRequest,
  resolveMerchantInstructionsList,
} from "../../lib/merchant-instructions.js";
import {
  canCustomerUpdateDeliveryInstructions,
  normalizeDeliveryInstructionsList,
} from "../../lib/delivery-instructions-order.js";
import {
  canCustomerUpdateAlternateContact,
  normalizeOrderContactPhone,
} from "../../lib/order-alternate-contact.js";
import {
  buildCustomerOrderTaxInvoiceHtml,
  orderHasCustomerTaxInvoice,
} from "../../lib/customer-order-tax-invoice.js";
import {
  buildCustomerOrderTaxInvoicePdfBuffer,
  invoicePdfFilename,
} from "../../lib/customer-order-tax-invoice-pdf.js";
import { buildCustomerOrderSummaryReceiptHtml } from "../../lib/customer-order-summary-receipt.js";
import { loadOrderRefundSummariesByCorePks, loadOrderPaymentSettlementsByCorePks } from "../../lib/order-refund-status.js";
import {
  loadCustomerPostDeliveryFeedback,
  saveCustomerPostDeliveryFeedback,
} from "../../lib/customer-post-delivery-feedback.js";
import { rideTripDistanceFromCheckoutMetadata } from "../../lib/ride-address-display.js";
import { readRideRiderPayoutSnapshot, ensureRidePickupWaitingBillingReconciled } from "../../lib/ride-rider-payout-snapshot.js";
import {
  resolveRidePickupFreeWaitMinutes,
  resolveRidePickupWaitingChargePerMin,
} from "../../lib/ride-pickup-wait.js";

function resolveCustomerRideDistanceKm(args: {
  orderType?: string | null;
  checkoutMetadata: unknown;
  billingSnapshot: unknown;
  coreDistanceKm: string | null;
}): number | null {
  if (args.orderType !== "person_ride") {
    return args.coreDistanceKm != null ? Number(args.coreDistanceKm) : null;
  }
  const snap = readRideRiderPayoutSnapshot(args.billingSnapshot);
  if (snap?.tripDistanceKm != null) return snap.tripDistanceKm;
  const fromMeta = rideTripDistanceFromCheckoutMetadata(args.checkoutMetadata);
  if (fromMeta != null) return fromMeta;
  return args.coreDistanceKm != null ? Number(args.coreDistanceKm) : null;
}

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

/** Zod response schema requires 1–5; coerce invalid/zero DB values to null. */
function sanitizeStarRating(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

/** Store stars live in food_rating; rating may hold a delivery-only placeholder. */
function resolveStoreStarFromRatingRow(
  row:
    | {
        rating?: unknown;
        foodRating?: unknown;
        serviceRating?: unknown;
      }
    | null
    | undefined
): number | null {
  if (!row) return null;
  const food = sanitizeStarRating(row.foodRating);
  if (food != null) return food;
  if (sanitizeStarRating(row.serviceRating) != null) return null;
  return sanitizeStarRating(row.rating);
}

function resolveDeliveryStarFromRatingRow(
  row: { serviceRating?: unknown } | null | undefined
): number | null {
  return sanitizeStarRating(row?.serviceRating);
}

function normalizeReviewTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const tag = String(item ?? "").trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag.slice(0, 120));
    if (out.length >= 20) break;
  }
  return out;
}

function isMissingDbRelationError(err: unknown, relation: string): boolean {
  const msg = String(err);
  return msg.includes(relation) && /does not exist|42P01/i.test(msg);
}
import { notifyMerchantNewRating } from "../../lib/merchant-push-notify.js";
import { getDb, getSql, withDbSlot, withSqlRetry } from "../../db/client.js";
import { resolveCustomerPkForRequest } from "../../lib/customer-auth.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { normalizeOrderItems } from "./orderNormalizer.js";
import {
  resolveOrdersCorePk,
  writeOrderItemCommissionSnapshots,
} from "../commission/writeOrderCommissionSnapshots.js";
import {
  buildCtmLineInputsFromFrozenItems,
  writeMerchantCtmPricingSnapshots,
  ensureMerchantCtmPricingSnapshotsForOrder,
} from "../commission/writeMerchantCtmPricingSnapshots.js";
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
  ordersParcel,
  orderRiderTracking,
  riderLiveLocations,
  merchantStoreRatings,
} from "../../db/schema.js";

/** Person rides have no merchant store — satisfy merchant_store_ratings.store_id FK for captain ratings. */
async function resolvePersonRideRatingStoreId(): Promise<number | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM merchant_stores
    ORDER BY id ASC
    LIMIT 1
  `;
  const id = rows[0]?.id != null ? Number(rows[0].id) : null;
  return id != null && Number.isFinite(id) && id > 0 ? id : null;
}

const orderDetailItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  price: z.number(),
  lineTotal: z.number().optional().nullable(),
  menuItemId: z.string().optional().nullable(),
  vegNonVeg: z.string().optional().nullable(),
  variantName: z.string().optional().nullable(),
  customization: z.string().optional().nullable(),
  specialInstructions: z.string().optional().nullable(),
});

const orderDetailResponseSchema = z.object({
  orderId: z.string(),
  coreOrderId: z.number().optional(),
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
  deliveryAddressLabel: z.string().optional().nullable(),
  deliveryContactName: z.string().optional().nullable(),
  deliveryContactPhone: z.string().optional().nullable(),
  deliveryPrimaryContactName: z.string().optional().nullable(),
  deliveryPrimaryContactPhone: z.string().optional().nullable(),
  alternateContactName: z.string().optional().nullable(),
  alternateContactPhone: z.string().optional().nullable(),
  alternateContactSetAt: z.string().optional().nullable(),
  deliveryInstructionsList: z.array(z.string()).optional(),
  merchantInstructionsList: z.array(z.string()).optional(),
  merchantPhone: z.string().optional().nullable(),
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
  riderPickedUpAt: z.string().optional().nullable(),
  pickupOtpVerifiedAt: z.string().optional().nullable(),
  rideStarted: z.boolean().optional(),
  statusHistory: z
    .array(
      z.object({
        status: z.string(),
        at: z.string(),
        label: z.string().optional(),
      })
    )
    .optional(),
  rider: z
    .object({
      name: z.string(),
      phone: z.string().optional(),
      photoUrl: z.string().optional().nullable(),
      rating: z.number().optional().nullable(),
      deliveredOrdersCount: z.number().int().nonnegative().optional().nullable(),
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
  storeReviewTags: z.array(z.string().max(120)).max(20).optional(),
  riderReviewTags: z.array(z.string().max(120)).max(20).optional(),
  customerPackagingFeedback: z.enum(["good", "not_good"]).optional().nullable(),
  customerRiderInUniform: z.boolean().optional().nullable(),
  tipAmount: z.number().nonnegative().optional().nullable(),
  distanceKm: z.number().optional().nullable(),
  checkoutMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
  pickupWaitSeconds: z.number().int().nonnegative().optional().nullable(),
  pickupWaitingChargePerMin: z.number().nonnegative().optional(),
  estimatedPickupWaitingCharge: z.number().nonnegative().optional(),
  deliveryPromiseComparison: z
    .object({
      promisedMinutes: z.number(),
      actualMinutes: z.number(),
      deltaMinutes: z.number(),
      message: z.string(),
    })
    .optional()
    .nullable(),
  refundStatus: z.string().optional().nullable(),
  refundAmount: z.number().optional().nullable(),
  fullyGatiCashUsed: z.boolean().optional().nullable(),
  gatiCashUsed: z.number().optional().nullable(),
  refund: z
    .object({
      status: z.string().nullable(),
      amount: z.number().nullable(),
      reference: z.string().nullable(),
      walletReference: z.string().nullable().optional(),
      gatewayReference: z.string().nullable().optional(),
      originalGatiCashTxnId: z.string().nullable().optional(),
      route: z.string().nullable(),
      walletAmount: z.number().nullable(),
      gatewayAmount: z.number().nullable(),
      initiatedAt: z.string().nullable(),
      processedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      timeline: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          at: z.string().nullable(),
        })
      ),
    })
    .optional()
    .nullable(),
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
  /** Immutable order drop snapshot — tracking must use these, never live GPS. */
  deliveryLat: z.number().optional().nullable(),
  deliveryLng: z.number().optional().nullable(),
  vegNonVeg: z.string().optional().nullable(),
  avgRating: z.number().optional().nullable(),
  totalReviews: z.number().int().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  createdAt: z.string(),
  storeRatingSubmitted: z.boolean().optional(),
  storeRating: z.number().int().min(1).max(5).optional().nullable(),
  deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
  paymentStatus: z.string().optional().nullable(),
  checkoutMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
  cancellationReason: z.string().optional().nullable(),
  cancelledByLabel: z.string().optional().nullable(),
  refundStatus: z.string().optional().nullable(),
  refundAmount: z.number().optional().nullable(),
  fullyGatiCashUsed: z.boolean().optional().nullable(),
  gatiCashUsed: z.number().optional().nullable(),
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
  specialInstructions: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => normalizeOrderItemSpecialInstructions(v ?? null)),
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
  subscriptionPlanId: z.coerce.number().int().positive().optional(),
  subscriptionBillingCycle: z.enum(["weekly", "monthly", "yearly"]).optional(),
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

function toIsoTimestamp(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Customer-facing milestone timeline (placed → accepted → picked up → delivered/cancelled).
 * Uses real event timestamps — not ETA revision history.
 */
function buildCustomerMilestoneHistory(args: {
  placedAt: unknown;
  createdAt: unknown;
  acceptedAt: unknown;
  preparingAt: unknown;
  pickedUpAt: unknown;
  deliveredAt: unknown;
  cancelledAt: unknown;
}): Array<{ status: string; at: string; label: string }> {
  const entries: Array<{ status: string; at: string; label: string }> = [];
  const placed = toIsoTimestamp(args.placedAt) ?? toIsoTimestamp(args.createdAt);
  if (placed) entries.push({ status: "PLACED", at: placed, label: "Order placed" });

  const accepted = toIsoTimestamp(args.acceptedAt) ?? toIsoTimestamp(args.preparingAt);
  if (accepted) entries.push({ status: "ACCEPTED", at: accepted, label: "Accepted" });

  const pickedUp = toIsoTimestamp(args.pickedUpAt);
  if (pickedUp) entries.push({ status: "PICKED_UP", at: pickedUp, label: "Picked up" });

  const cancelled = toIsoTimestamp(args.cancelledAt);
  const delivered = toIsoTimestamp(args.deliveredAt);
  if (cancelled) {
    entries.push({ status: "CANCELLED", at: cancelled, label: "Cancelled" });
  } else if (delivered) {
    entries.push({ status: "DELIVERED", at: delivered, label: "Delivered" });
  }

  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let index = 0;

  async function run(): Promise<void> {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!);
    }
  }

  await Promise.all(Array.from({ length: safeLimit }, () => run()));
  return results;
}

function voidNotifyMerchantStoreRating(args: {
  storeId: number;
  stars: number;
  customerPk: number;
  orderCorePk: number;
}): void {
  void (async () => {
    try {
      const sql = getSql();
      const [customerRow] = await sql`
        SELECT full_name FROM customers WHERE id = ${args.customerPk} LIMIT 1
      `;
      const [orderMeta] = await sql`
        SELECT c.order_id, c.formatted_order_id, f.id::text AS food_id
        FROM orders_core c
        LEFT JOIN orders_food f ON f.order_id = c.id
        WHERE c.id = ${args.orderCorePk}
        LIMIT 1
      `;
      const meta = orderMeta as
        | { order_id?: string; formatted_order_id?: string | null; food_id?: string | null }
        | undefined;
      const displayOrderId =
        (meta?.formatted_order_id && String(meta.formatted_order_id).trim()) ||
        (meta?.order_id && String(meta.order_id).trim()) ||
        String(args.orderCorePk);
      const foodOrderId =
        meta?.food_id != null && /^\d+$/.test(String(meta.food_id))
          ? Number(meta.food_id)
          : null;
      const customerName = String((customerRow as { full_name?: string } | undefined)?.full_name ?? "Customer");
      await notifyMerchantNewRating(sql, {
        storeId: args.storeId,
        stars: args.stars,
        customerName,
        displayOrderId,
        foodOrderId,
      });
    } catch (err) {
      console.warn("[store-rating] merchant notify failed", (err as Error).message);
    }
  })();
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

      return withDbSlot(async () => {
      const customerPk = await resolveCustomerPkForRequest(req.auth!, req);
      if (customerPk === null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const db = getDb();

      const pageRows = await withSqlRetry(() =>
        db
          .select({
            id: ordersCore.id,
            orderId: ordersCore.orderId,
            formattedOrderId: ordersCore.formattedOrderId,
            merchantStoreId: ordersCore.merchantStoreId,
            orderType: ordersCore.orderType,
            pickupOtp: ordersCore.pickupOtp,
            pickupLat: ordersCore.pickupLat,
            pickupLon: ordersCore.pickupLon,
            dropLat: ordersCore.dropLat,
            dropLon: ordersCore.dropLon,
            status: ordersCore.status,
            currentStatus: ordersCore.currentStatus,
            riderId: ordersCore.riderId,
            pickupAddressRaw: ordersCore.pickupAddressRaw,
            dropAddressRaw: ordersCore.dropAddressRaw,
            grandTotal: ordersCore.grandTotal,
            paymentStatus: ordersCore.paymentStatus,
            checkoutMetadata: ordersCore.checkoutMetadata,
            items: ordersCore.items,
            createdAt: ordersCore.createdAt,
            placedAt: ordersCore.placedAt,
          })
          .from(ordersCore)
          .where(eq(ordersCore.customerId, customerPk))
          .orderBy(desc(ordersCore.placedAt), desc(ordersCore.createdAt))
          .limit(limit)
          .offset(offset)
      );

      const storeBannerCache = new Map<number, string | null>();
      const storeRatingCache = new Map<number, { avgRating: number; totalReviews: number } | null>();
      const storeIds = [...new Set(pageRows.map((r) => (r.merchantStoreId != null ? Number(r.merchantStoreId) : null)).filter((v): v is number => v != null && Number.isFinite(v) && v > 0))];
      const ratingMap = await getStoreRatingsForStores(storeIds);
      for (const sid of storeIds) {
        storeRatingCache.set(sid, ratingMap.get(sid) ?? null);
      }

      const pageOrderPks = pageRows.map((r) => r.id);
      const foodSummaryByCorePk = await loadOrdersFoodSummariesByCoreRows(db, pageRows);
      const sqlClient = getSql();
      const [refundSummaryByCorePk, paymentSettlementByCorePk] = await Promise.all([
        loadOrderRefundSummariesByCorePks(sqlClient, pageOrderPks),
        loadOrderPaymentSettlementsByCorePks(sqlClient, pageOrderPks),
      ]);
      const refundStatusByCorePk = new Map<number, string | null>();
      for (const [pk, summary] of refundSummaryByCorePk) {
        refundStatusByCorePk.set(pk, summary.status);
      }
      const customerOrderRatings =
        pageOrderPks.length > 0
          ? await db
              .select({
                orderId: merchantStoreRatings.orderId,
                rating: merchantStoreRatings.rating,
                foodRating: merchantStoreRatings.foodRating,
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

      const parcelOrderPks = pageRows
        .filter((r) => r.orderType === "parcel")
        .map((r) => r.id);
      const parcelVehicleByPk = new Map<number, string>();
      if (parcelOrderPks.length > 0) {
        const parcelRows = await db
          .select({
            orderId: ordersParcel.orderId,
            vehicleCategory: ordersParcel.vehicleCategory,
          })
          .from(ordersParcel)
          .where(inArray(ordersParcel.orderId, parcelOrderPks));
        for (const pr of parcelRows) {
          const cat = pr.vehicleCategory?.trim();
          if (cat) parcelVehicleByPk.set(Number(pr.orderId), cat);
        }
      }

      const ordersNeedingCoreItems = pageRows.filter(
        (r) => !(Array.isArray(r.items) && r.items.length > 0) && r.orderId,
      );
      const orderIdTextsForItems = ordersNeedingCoreItems
        .map((r) => r.orderId!.trim())
        .filter(Boolean);
      const coreItemsByOrderId = new Map<
        string,
        Array<{
          id: number;
          menuItemId: number;
          itemName: string;
          quantity: number;
          totalPrice: string;
          basePrice: string;
          addonPrice: string | null;
          vegNonveg: string | null;
          variantName: string | null;
          itemSnapshot: unknown;
        }>
      >();
      let addonsByCoreItemId = new Map<
        number,
        Array<{ name: string; quantity: number; price: number }>
      >();
      let pendingCartByOrderId = new Map<string, Record<string, unknown>[]>();
      if (orderIdTextsForItems.length > 0) {
        const allCoreItems = await withSqlRetry(() =>
          db
            .select({
              orderId: ordersCoreItems.orderId,
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
              specialInstructions: ordersCoreItems.specialInstructions,
            })
            .from(ordersCoreItems)
            .where(inArray(ordersCoreItems.orderId, orderIdTextsForItems)),
        );
        for (const item of allCoreItems) {
          const key = String(item.orderId ?? "").trim();
          if (!key) continue;
          const list = coreItemsByOrderId.get(key) ?? [];
          list.push(item);
          coreItemsByOrderId.set(key, list);
        }
        const allCoreItemIds = allCoreItems.map((i) => Number(i.id));
        [pendingCartByOrderId, addonsByCoreItemId] = await Promise.all([
          loadPendingCartLinesByOrderIds(orderIdTextsForItems),
          loadAddonsByCoreItemIdsForOrders(allCoreItemIds),
        ]);
      }

      const summaries = await mapWithConcurrency(pageRows, 2, async (row) => {
          const orderIdDisplay = row.orderId ?? String(row.id);
          const foodRow =
            row.orderType === "food" ? foodSummaryByCorePk.get(row.id) : undefined;
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
            const orderIdKey = row.orderId.trim();
            const coreItems = coreItemsByOrderId.get(orderIdKey) ?? [];
            items = (
              await buildCustomerOrderDetailItems({
                orderIdText: row.orderId,
                coreItems,
                itemsJsonFallback: row.items,
                pendingCartLines: pendingCartByOrderId.get(orderIdKey),
                addonsByItemId: addonsByCoreItemId,
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
            status: resolveCustomerAppOrderStatus({
              currentStatus: row.currentStatus,
              coreStatus: row.status,
              foodOrderStatus: foodRow?.orderStatus ?? null,
              riderId: row.riderId,
              orderType: row.orderType,
            }),
            merchantName: foodRow?.restaurantName ?? null,
            merchantPublicName: merchantPublicName ?? foodRow?.restaurantName ?? null,
            merchantPublicStoreId,
            merchantAddress: row.pickupAddressRaw ?? null,
            deliveryAddress:
              row.orderType === "person_ride" ? row.dropAddressRaw ?? null : null,
            merchantBannerUrl,
            merchantStoreId: row.merchantStoreId != null ? Number(row.merchantStoreId) : null,
            orderType: row.orderType ?? null,
            rideType:
              row.orderType === "person_ride"
                ? rideTypeByPk.get(row.id) ?? null
                : row.orderType === "parcel"
                  ? parcelVehicleByPk.get(row.id) ?? null
                  : null,
            pickupOtp: row.pickupOtp ?? null,
            pickupLat: row.pickupLat != null ? Number(row.pickupLat) : null,
            pickupLng: row.pickupLon != null ? Number(row.pickupLon) : null,
            deliveryLat: row.dropLat != null ? Number(row.dropLat) : null,
            deliveryLng: row.dropLon != null ? Number(row.dropLon) : null,
            vegNonVeg: foodRow?.vegNonVeg ?? null,
            avgRating: row.merchantStoreId != null ? storeRatingCache.get(Number(row.merchantStoreId))?.avgRating ?? null : null,
            totalReviews: row.merchantStoreId != null ? storeRatingCache.get(Number(row.merchantStoreId))?.totalReviews ?? null : null,
            totalAmount,
            createdAt: (at instanceof Date ? at : new Date(at)).toISOString(),
            paymentStatus: row.paymentStatus ?? null,
            checkoutMetadata:
              row.checkoutMetadata != null && typeof row.checkoutMetadata === "object"
                ? (row.checkoutMetadata as Record<string, unknown>)
                : null,
            items: items.length > 0 ? items : undefined,
            storeRatingSubmitted: resolveStoreStarFromRatingRow(customerRating) != null,
            storeRating: resolveStoreStarFromRatingRow(customerRating),
            deliveryRating: resolveDeliveryStarFromRatingRow(customerRating),
            cancellationReason: foodRow?.rejectedReason?.trim() || null,
            cancelledByLabel: foodRow?.cancelledByLabel?.trim() || null,
            refundStatus: refundStatusByCorePk.get(row.id) ?? null,
            refundAmount: refundSummaryByCorePk.get(row.id)?.amount ?? null,
            fullyGatiCashUsed: paymentSettlementByCorePk.get(row.id)?.fullyGatiCash ?? false,
            gatiCashUsed: paymentSettlementByCorePk.get(row.id)?.gatiCashUsed ?? null,
          };
        });
      return summaries;
      }, req);
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
    subscriptionPlanId: z.coerce.number().int().positive().optional(),
    subscriptionBillingCycle: z.enum(["weekly", "monthly", "yearly"]).optional(),
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
        subscriptionPlanId: body.subscriptionPlanId,
        subscriptionBillingCycle: body.subscriptionBillingCycle,
        deliveryType: body.deliveryType,
        checkoutMetadata: body.checkoutMetadata ?? null,
        selectedPlatformOfferId: body.selectedPlatformOfferId ?? null,
        selectedMerchantOfferId: body.selectedMerchantOfferId ?? null,
        forceNoAutoOffer: body.forceNoAutoOffer,
        idempotencyKey,
      });
      if (!result.ok) {
        const status = result.code === "SERVICE_BLOCKED_IN_LOCATION" ? 403 : 400;
        return reply.status(status).send({
          error: result.code,
          code: result.code,
          message: result.message,
          title:
            result.code === "SERVICE_BLOCKED_IN_LOCATION"
              ? "Service Temporarily Unavailable"
              : undefined,
        });
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
   * Finalize a pending order that GatiCash covered in full — payable is ₹0, so no Razorpay
   * order was ever minted and there is no signature to verify. The wallet debit inside
   * `finalizeOrder` is the payment. Idempotent: replays return the same order id.
   *
   * Kept separate from `/finalize` so the gateway path keeps requiring all three Razorpay
   * tokens; a zero-payable order can never slip through the signature check.
   */
  app.post(
    "/finalize-wallet",
    {
      schema: {
        body: z.object({ pendingId: z.string().min(1) }),
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
        return reply.status(403).send({ error: "FORBIDDEN", message: "Customer only" });
      }
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk === null) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Customer not found" });
      }

      const { pendingId } = req.body as { pendingId: string };
      const result = await finalizeOrder(db, { pendingId, customerId: customerPk });
      if (!result.ok) {
        const status =
          result.code === "PENDING_ORDER_NOT_FOUND" ||
          result.code === "PENDING_ORDER_EXPIRED" ||
          result.code === "INSUFFICIENT_GATICASH" ||
          result.code === "ZERO_PAYABLE_WITHOUT_WALLET" ||
          result.code === "WALLET_DEBIT_FAILED" ||
          result.code === "PAYMENT_NOT_VERIFIED" ||
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
        formattedOrderId: finalizedRow?.formattedOrderId ?? null,
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
          pickupOtpRadiusNotifiedAt: ordersCore.pickupOtpRadiusNotifiedAt,
          deliveryOtpRadiusNotifiedAt: ordersCore.deliveryOtpRadiusNotifiedAt,
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
          checkoutMetadata: ordersCore.checkoutMetadata,
          merchantInstructionsList: ordersCore.merchantInstructionsList,
          deliveryInstructionsList: ordersCore.deliveryInstructionsList,
          alternateContactName: ordersCore.alternateContactName,
          alternateContactPhone: ordersCore.alternateContactPhone,
          alternateContactSetAt: ordersCore.alternateContactSetAt,
          deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
          deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
          riderPickedUpAt: ordersCore.riderPickedUpAt,
          actualPickupTime: ordersCore.actualPickupTime,
          actualDeliveryTime: ordersCore.actualDeliveryTime,
          cancelledAt: ordersCore.cancelledAt,
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
            specialInstructions: ordersCoreItems.specialInstructions,
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
          restaurantPhone: ordersFood.restaurantPhone,
          foodItemsTotalValue: ordersFood.foodItemsTotalValue,
          customerName: ordersFood.customerName,
          customerPhone: ordersFood.customerPhone,
          deliveryInstructions: ordersFood.deliveryInstructions,
          riderReachedPickupAt: ordersFood.riderReachedPickupAt,
          riderPickedUpAt: ordersFood.riderPickedUpAt,
          orderStatus: ordersFood.orderStatus,
          acceptedAt: ordersFood.acceptedAt,
          preparingAt: ordersFood.preparingAt,
          deliveredAt: ordersFood.deliveredAt,
          cancelledAt: ordersFood.cancelledAt,
        })
        .from(ordersFood)
        .where(ordersFoodMatchForCoreRow(coreRow.id, coreRow.orderId))
        .limit(1);

      const storePromise =
        coreRow.merchantStoreId != null
          ? getStoreByIdForOrder(Number(coreRow.merchantStoreId))
          : Promise.resolve(null);

      const rideMetaPromise =
        coreRow.orderType === "person_ride"
          ? db
              .select({
                rideType: ordersRide.rideType,
                riderReachedPickupAt: ordersRide.riderReachedPickupAt,
                pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
                pickupWaitSeconds: ordersRide.pickupWaitSeconds,
                assignedRiderId: ordersRide.assignedRiderId,
              })
              .from(ordersRide)
              .where(eq(ordersRide.orderId, coreRow.id))
              .limit(1)
          : Promise.resolve([]);

      const parcelMetaPromise =
        coreRow.orderType === "parcel"
          ? db
              .select({
                vehicleCategory: ordersParcel.vehicleCategory,
                riderReachedPickupAt: ordersParcel.riderReachedPickupAt,
                pickupOtpVerifiedAt: ordersParcel.pickupOtpVerifiedAt,
                deliveryOtpVerifiedAt: ordersParcel.deliveryOtpVerifiedAt,
                assignedRiderId: ordersParcel.assignedRiderId,
                receiverName: ordersParcel.receiverName,
                receiverMobile: ordersParcel.receiverMobile,
              })
              .from(ordersParcel)
              .where(eq(ordersParcel.orderId, coreRow.id))
              .limit(1)
          : Promise.resolve([]);

      const [rideMetaEarly, parcelMetaEarly] = await Promise.all([
        rideMetaPromise,
        parcelMetaPromise,
      ]);

      const assignedFromRide =
        Array.isArray(rideMetaEarly) && rideMetaEarly[0]?.assignedRiderId != null
          ? Number(rideMetaEarly[0].assignedRiderId)
          : null;
      const assignedFromParcel =
        Array.isArray(parcelMetaEarly) && parcelMetaEarly[0]?.assignedRiderId != null
          ? Number(parcelMetaEarly[0].assignedRiderId)
          : null;
      const effectiveRiderId =
        coreRow.riderId != null
          ? Number(coreRow.riderId)
          : assignedFromRide != null && Number.isFinite(assignedFromRide)
            ? assignedFromRide
            : assignedFromParcel != null && Number.isFinite(assignedFromParcel)
              ? assignedFromParcel
              : null;

      const riderPromise =
        effectiveRiderId != null
          ? db
              .select({
                name: riders.name,
                mobile: riders.mobile,
                selfieUrl: riders.selfieUrl,
              })
              .from(riders)
              .where(eq(riders.id, effectiveRiderId))
              .limit(1)
          : Promise.resolve([]);

      const riderDeliveredCountPromise =
        effectiveRiderId != null
          ? db
              .select({ count: sql<number>`count(*)::int` })
              .from(ordersCore)
              .where(
                and(
                  eq(ordersCore.riderId, effectiveRiderId),
                  or(eq(ordersCore.status, "delivered"), eq(ordersCore.currentStatus, "DELIVERED"))
                )
              )
          : Promise.resolve([{ count: 0 }]);

      const vehiclePromise =
        effectiveRiderId != null
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
                  eq(riderVehicles.riderId, effectiveRiderId),
                  eq(riderVehicles.isActive, true),
                  isNull(riderVehicles.deletedAt)
                )
              )
              .orderBy(desc(riderVehicles.updatedAt))
              .limit(1)
          : Promise.resolve([]);

      const riderRatingPromise =
        effectiveRiderId != null
          ? getRiderAverageRating(Number(effectiveRiderId))
          : Promise.resolve(null);

      const prepPromise =
        isLiveOrder && orderIdDisplay
          ? getSql()<
              Array<{
                prep_time_minutes: number | null;
                prep_ready_by_at: Date | string | null;
                expected_ready_at: Date | string | null;
              }>
            >`
              SELECT prep_time_minutes, prep_ready_by_at, expected_ready_at
              FROM orders_core
              WHERE order_id = ${orderIdDisplay}
              LIMIT 1
            `
          : Promise.resolve([]);

      const [foodRows, items, store, riderRows, prepRows, vehicleRows, riderAvgRating, riderDeliveredRows, otpCandidates] =
        await Promise.all([
        foodPromise,
        loadDetailItems(),
        storePromise,
        riderPromise,
        prepPromise,
        vehiclePromise,
        riderRatingPromise,
        riderDeliveredCountPromise,
        loadFoodDeliveryOtpCandidates(db, coreRow.id).catch(() => ({
          deliveryCodes: [] as string[],
          pickupCode: null as string | null,
        })),
      ]);

      const foodRow = foodRows[0] ?? null;
      const rideMetaRow = Array.isArray(rideMetaEarly) ? rideMetaEarly[0] ?? null : null;
      const parcelMetaRow = Array.isArray(parcelMetaEarly) ? parcelMetaEarly[0] ?? null : null;
      const resolvedDeliveryOtp =
        otpCandidates.deliveryCodes[0] ??
        (coreRow.deliveryOtp?.trim() || null);
      // Backfill orders_core so subsequent reads / rider verify stay consistent.
      if (
        resolvedDeliveryOtp &&
        !(coreRow.deliveryOtp ?? "").trim()
      ) {
        void (async () => {
          try {
            await db
              .update(ordersCore)
              .set({ deliveryOtp: resolvedDeliveryOtp, updatedAt: new Date() })
              .where(eq(ordersCore.id, coreRow.id));
          } catch {
            /* non-blocking */
          }
        })();
      }
      const merchantBannerUrl = store?.bannerUrl ?? null;
      const merchantPublicName = store?.storeDisplayName ?? store?.storeName ?? null;
      const merchantPublicStoreId = store?.storeId ?? null;

      let rider: {
        name: string;
        phone?: string;
        photoUrl?: string | null;
        rating?: number | null;
        deliveredOrdersCount?: number | null;
        vehicleRegistration?: string | null;
        vehicleModel?: string | null;
      } | null = null;
      const riderRow = riderRows[0];
      const vehicleRow = vehicleRows[0] ?? null;
      const riderDeliveredCount = Number(riderDeliveredRows[0]?.count ?? 0);
      const coreDbStatus = String(coreRow.status ?? "").toLowerCase();
      const pickupOtpVerifiedAtResolved = (() => {
        const raw =
          rideMetaRow?.pickupOtpVerifiedAt ??
          parcelMetaRow?.pickupOtpVerifiedAt ??
          null;
        if (raw instanceof Date) return raw.toISOString();
        if (raw != null) return String(raw);
        return null;
      })();
      const riderReachedPickupAtResolved = (() => {
        const raw =
          rideMetaRow?.riderReachedPickupAt ??
          foodRow?.riderReachedPickupAt ??
          parcelMetaRow?.riderReachedPickupAt ??
          null;
        if (raw instanceof Date) return raw.toISOString();
        if (raw != null) return String(raw);
        return null;
      })();
      const riderPickedUpAtResolved = (() => {
        const raw = foodRow?.riderPickedUpAt ?? null;
        if (raw instanceof Date) return raw.toISOString();
        if (raw != null) return String(raw);
        return null;
      })();

      const appStatus = resolveCustomerAppOrderStatus({
        currentStatus: coreRow.currentStatus,
        coreStatus: coreRow.status,
        foodOrderStatus: foodRow?.orderStatus ?? null,
        riderId: effectiveRiderId ?? coreRow.riderId,
        riderReachedPickupAt: riderReachedPickupAtResolved,
        riderPickedUpAt:
          riderPickedUpAtResolved ??
          (coreRow.orderType === "parcel" ? pickupOtpVerifiedAtResolved : null),
        orderType: coreRow.orderType,
      });

      const rideStartedForCustomer =
        (coreRow.orderType === "person_ride" || coreRow.orderType === "parcel") &&
        (coreDbStatus === "picked_up" ||
          coreDbStatus === "in_transit" ||
          coreDbStatus === "delivered" ||
          pickupOtpVerifiedAtResolved != null ||
          appStatus === "RIDE_IN_PROGRESS" ||
          appStatus === "OUT_FOR_DELIVERY" ||
          appStatus === "REACHED_CUSTOMER" ||
          appStatus === "ON_THE_WAY" ||
          appStatus === "PICKED_UP" ||
          appStatus === "IN_TRANSIT");
      const pickupOtpRadiusNotified =
        coreRow.pickupOtpRadiusNotifiedAt != null ||
        riderReachedPickupAtResolved != null;
      const deliveryOtpRadiusNotified =
        coreRow.deliveryOtpRadiusNotifiedAt != null;
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
          deliveredOrdersCount: riderDeliveredCount > 0 ? riderDeliveredCount : null,
          vehicleRegistration: reg,
          vehicleModel:
            modelParts ||
            rideMetaRow?.rideType?.trim() ||
            parcelMetaRow?.vehicleCategory?.trim() ||
            null,
        };
      }

      if (coreRow.orderType === "person_ride" && coreDbStatus === "delivered") {
        const ps = String(coreRow.paymentStatus ?? "").trim().toLowerCase();
        const paymentPending = ps !== "paid" && ps !== "completed";
        const snapObj =
          coreRow.billingSnapshot != null && typeof coreRow.billingSnapshot === "object"
            ? (coreRow.billingSnapshot as Record<string, unknown>)
            : {};
        const snapPaid =
          typeof snapObj.ride_fare_paid_at === "string" &&
          snapObj.ride_fare_paid_at.trim().length > 0;

        if (paymentPending && !snapPaid) {
          if (
            rideMetaRow?.pickupWaitSeconds != null &&
            Number(rideMetaRow.pickupWaitSeconds) > 0 &&
            coreRow.riderId != null
          ) {
            await ensureRidePickupWaitingBillingReconciled(
              coreRow.id,
              Number(coreRow.riderId)
            );
          } else {
            const { syncRideCustomerBillingSnapshot } = await import(
              "../rides/ride-bill.service.js"
            );
            await syncRideCustomerBillingSnapshot(db, coreRow.id, { skipIfPaid: true });
          }

          const [refreshedCore] = await db
            .select({
              grandTotal: ordersCore.grandTotal,
              billingSnapshot: ordersCore.billingSnapshot,
            })
            .from(ordersCore)
            .where(eq(ordersCore.id, coreRow.id))
            .limit(1);
          if (refreshedCore) {
            coreRow.grandTotal = refreshedCore.grandTotal;
            coreRow.billingSnapshot = refreshedCore.billingSnapshot;
          }
        }
      }

      const totalAmount =
        coreRow.grandTotal != null
          ? Number(coreRow.grandTotal)
          : foodRow?.foodItemsTotalValue != null
            ? Number(foodRow.foodItemsTotalValue)
            : null;

      const createdAt = coreRow.placedAt ?? coreRow.createdAt ?? new Date();

      let prepTimeMinutes: number | null = null;
      let prepReadyByAt: string | null = null;
      const prepRow = prepRows[0];
      if (prepRow) {
        const pm = prepRow.prep_time_minutes;
        prepTimeMinutes = pm != null && Number(pm) > 0 ? Number(pm) : null;
        const rawExpected = prepRow.expected_ready_at;
        const rawReady = prepRow.prep_ready_by_at;
        const resolvedReady = rawExpected ?? rawReady;
        prepReadyByAt =
          resolvedReady instanceof Date
            ? resolvedReady.toISOString()
            : resolvedReady != null
              ? String(resolvedReady)
              : null;
      }

      const [existingStoreRating] = await db
        .select({
          rating: merchantStoreRatings.rating,
          foodRating: merchantStoreRatings.foodRating,
          serviceRating: merchantStoreRatings.serviceRating,
          reviewText: merchantStoreRatings.reviewText,
          reviewTitle: merchantStoreRatings.reviewTitle,
          riderReviewText: merchantStoreRatings.riderReviewText,
          storeReviewTags: merchantStoreRatings.storeReviewTags,
          riderReviewTags: merchantStoreRatings.riderReviewTags,
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

      const deliveryDetails = await resolveOrderDeliveryDetails(db, {
        orderIdText: orderIdDisplay,
        customerPk,
        checkoutMetadata: coreRow.checkoutMetadata,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        foodCustomerName: foodRow?.customerName ?? null,
        foodCustomerPhone: foodRow?.customerPhone ?? null,
        foodDeliveryInstructions: foodRow?.deliveryInstructions ?? null,
        storedDeliveryInstructionsList: coreRow.deliveryInstructionsList,
        alternateContactName: coreRow.alternateContactName,
        alternateContactPhone: coreRow.alternateContactPhone,
        deliveryPrimaryContactName:
          coreRow.deliveryPrimaryContactName?.trim() ||
          parcelMetaRow?.receiverName?.trim() ||
          null,
        deliveryPrimaryContactPhone:
          coreRow.deliveryPrimaryContactPhone?.trim() ||
          parcelMetaRow?.receiverMobile?.trim() ||
          null,
      });

      const merchantInstructionsList = resolveMerchantInstructionsList(
        coreRow.merchantInstructionsList,
        coreRow.checkoutMetadata
      );

      let deliveryPromiseComparison = null;
      if (appStatus === "DELIVERED") {
        try {
          const etaRows = (await getSql()`
            SELECT promised_eta_minutes, placed_at, actual_delivery_time
            FROM orders_core
            WHERE id = ${coreRow.id}
            LIMIT 1
          `) as unknown as Array<{
            promised_eta_minutes: number | null;
            placed_at: Date | string | null;
            actual_delivery_time: Date | string | null;
          }>;
          const etaRow = etaRows[0];
          deliveryPromiseComparison = buildDeliveryPromiseComparison({
            promisedEtaMinutes: etaRow?.promised_eta_minutes ?? null,
            placedAt: etaRow?.placed_at ?? coreRow.placedAt ?? coreRow.createdAt,
            deliveredAt: etaRow?.actual_delivery_time ?? null,
          });
        } catch {
          deliveryPromiseComparison = null;
        }
      }

      let pickupWaitSeconds: number | null = null;
      let pickupWaitingChargePerMin = 0;
      let estimatedPickupWaitingCharge = 0;
      if (coreRow.orderType === "person_ride") {
        pickupWaitSeconds =
          rideMetaRow?.pickupWaitSeconds != null
            ? Math.max(0, Number(rideMetaRow.pickupWaitSeconds) || 0)
            : null;
        pickupWaitingChargePerMin = await resolveRidePickupWaitingChargePerMin({
          checkoutMetadata: coreRow.checkoutMetadata,
          pickupLat: coreRow.pickupLat != null ? Number(coreRow.pickupLat) : null,
          pickupLng: coreRow.pickupLon != null ? Number(coreRow.pickupLon) : null,
          rideType: rideMetaRow?.rideType,
        });
        const pickupWaitFreeMinutes = await resolveRidePickupFreeWaitMinutes({
          checkoutMetadata: coreRow.checkoutMetadata,
          pickupLat: coreRow.pickupLat != null ? Number(coreRow.pickupLat) : null,
          pickupLng: coreRow.pickupLon != null ? Number(coreRow.pickupLon) : null,
          rideType: rideMetaRow?.rideType,
        });
        const freeBudgetSec = Math.max(0, Math.round(pickupWaitFreeMinutes * 60));
        if (pickupWaitingChargePerMin > 0) {
          let billableSec = 0;
          if (pickupWaitSeconds != null) {
            billableSec = Math.max(0, pickupWaitSeconds - freeBudgetSec);
          } else if (riderReachedPickupAtResolved && !pickupOtpVerifiedAtResolved) {
            const startMs = Date.parse(riderReachedPickupAtResolved);
            if (Number.isFinite(startMs)) {
              const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
              billableSec = Math.max(0, elapsed - freeBudgetSec);
            }
          }
          if (billableSec > 0) {
            estimatedPickupWaitingCharge =
              Math.round(Math.ceil(billableSec / 60) * pickupWaitingChargePerMin * 10) / 10;
          }
        }
      }

      const detailSql = getSql();
      const [refundMap, settlementMap] = await Promise.all([
        loadOrderRefundSummariesByCorePks(detailSql, [coreRow.id]),
        loadOrderPaymentSettlementsByCorePks(detailSql, [coreRow.id]),
      ]);
      const refundSummary = refundMap.get(coreRow.id) ?? null;
      const settlement = settlementMap.get(coreRow.id) ?? null;

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
        refundStatus: refundSummary?.status ?? null,
        refundAmount: refundSummary?.amount ?? null,
        fullyGatiCashUsed: settlement?.fullyGatiCash ?? false,
        gatiCashUsed: settlement?.gatiCashUsed ?? null,
        refund: refundSummary
          ? {
              status: refundSummary.status,
              amount: refundSummary.amount,
              reference: refundSummary.reference,
              walletReference: refundSummary.walletReference,
              gatewayReference: refundSummary.gatewayReference,
              originalGatiCashTxnId: refundSummary.originalGatiCashTxnId,
              route: refundSummary.route,
              walletAmount: refundSummary.walletAmount,
              gatewayAmount: refundSummary.gatewayAmount,
              initiatedAt: refundSummary.initiatedAt,
              processedAt: refundSummary.processedAt,
              completedAt: refundSummary.completedAt,
              timeline: refundSummary.timeline,
            }
          : null,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        deliveryAddressLabel: deliveryDetails.deliveryAddressLabel,
        deliveryContactName: deliveryDetails.deliveryContactName,
        deliveryContactPhone: deliveryDetails.deliveryContactPhone,
        deliveryPrimaryContactName:
          coreRow.deliveryPrimaryContactName?.trim() ||
          parcelMetaRow?.receiverName?.trim() ||
          null,
        deliveryPrimaryContactPhone:
          coreRow.deliveryPrimaryContactPhone?.trim() ||
          parcelMetaRow?.receiverMobile?.trim() ||
          null,
        alternateContactName: coreRow.alternateContactName?.trim() || null,
        alternateContactPhone: coreRow.alternateContactPhone?.trim() || null,
        alternateContactSetAt:
          coreRow.alternateContactSetAt instanceof Date
            ? coreRow.alternateContactSetAt.toISOString()
            : coreRow.alternateContactSetAt
              ? String(coreRow.alternateContactSetAt)
              : null,
        deliveryInstructionsList: deliveryDetails.deliveryInstructionsList,
        merchantInstructionsList,
        merchantPhone: foodRow?.restaurantPhone?.trim() || null,
        deliveryLat: coreRow.dropLat != null ? Number(coreRow.dropLat) : null,
        deliveryLng: coreRow.dropLon != null ? Number(coreRow.dropLon) : null,
        ...(() => {
          const orderLat = coreRow.pickupLat != null ? Number(coreRow.pickupLat) : null;
          const orderLng = coreRow.pickupLon != null ? Number(coreRow.pickupLon) : null;
          const storeLat = store?.latitude != null ? Number(store.latitude) : null;
          const storeLng = store?.longitude != null ? Number(store.longitude) : null;
          const usable = (lat: number | null, lng: number | null) =>
            lat != null &&
            lng != null &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
          // Prefer immutable order pickup; hydrate from merchant_stores when 0/null
          // so tracking maps never fall back to India-centroid placeholders.
          if (usable(orderLat, orderLng)) {
            return { pickupLat: orderLat, pickupLng: orderLng };
          }
          if (usable(storeLat, storeLng)) {
            return { pickupLat: storeLat, pickupLng: storeLng };
          }
          return { pickupLat: orderLat, pickupLng: orderLng };
        })(),
        deliveryOtp: (() => {
          const orderType = String(coreRow.orderType ?? "").toLowerCase();
          const cur = String(coreRow.currentStatus ?? "").toUpperCase();
          const afterPickup =
            riderPickedUpAtResolved != null ||
            deliveryOtpRadiusNotified ||
            cur === "PICKED_UP" ||
            cur === "PICKED_BY_RIDER" ||
            cur === "ON_THE_WAY" ||
            cur === "OUT_FOR_DELIVERY" ||
            cur === "IN_TRANSIT" ||
            cur === "DISPATCHED" ||
            cur === "REACHED_CUSTOMER" ||
            cur === "RIDER_AT_DROP" ||
            cur === "AT_CUSTOMER" ||
            appStatus === "PICKED_UP" ||
            appStatus === "ON_THE_WAY" ||
            appStatus === "OUT_FOR_DELIVERY" ||
            appStatus === "IN_TRANSIT" ||
            appStatus === "DISPATCHED" ||
            appStatus === "REACHED_CUSTOMER";
          // Food + parcel: expose delivery OTP once rider has picked up / OTW.
          if (orderType === "food" || orderType === "parcel") {
            return afterPickup ? resolvedDeliveryOtp : null;
          }
          return null;
        })(),
        pickupOtp: (() => {
          const orderType = String(coreRow.orderType ?? "").toLowerCase();
          const rawPickup = otpCandidates.pickupCode ?? coreRow.pickupOtp ?? null;
          const atPickupRadius =
            pickupOtpRadiusNotified ||
            riderReachedPickupAtResolved != null ||
            String(coreRow.currentStatus ?? "").toUpperCase() === "RIDER_AT_PICKUP" ||
            String(coreRow.currentStatus ?? "").toUpperCase() === "REACHED_STORE";
          // Parcel: show pickup PIN on tracking from book until collected.
          // Push with OTP still fires only at pickup radius (otp-radius-notify).
          if (orderType === "parcel") {
            if (pickupOtpVerifiedAtResolved || rideStartedForCustomer) return null;
            return rawPickup;
          }
          // Person ride: expose after captain reaches pickup radius.
          if (orderType === "person_ride" || orderType === "ride") {
            return atPickupRadius ? rawPickup : null;
          }
          // Food pickup OTP is merchant/rider-facing — do not expose to customer API.
          return null;
        })(),
        orderType: coreRow.orderType ?? null,
        // Person ride: catalog id. Parcel: booked vehicle category (2_wheeler / 3_wheeler / …).
        rideType:
          rideMetaRow?.rideType?.trim() ||
          parcelMetaRow?.vehicleCategory?.trim() ||
          null,
        riderReachedPickupAt: riderReachedPickupAtResolved,
        riderPickedUpAt: riderPickedUpAtResolved,
        pickupOtpVerifiedAt: pickupOtpVerifiedAtResolved,
        rideStarted: rideStartedForCustomer,
        statusHistory: (() => {
          const milestones = buildCustomerMilestoneHistory({
            placedAt: coreRow.placedAt,
            createdAt,
            acceptedAt: foodRow?.acceptedAt ?? null,
            preparingAt: foodRow?.preparingAt ?? null,
            pickedUpAt:
              riderPickedUpAtResolved ??
              foodRow?.riderPickedUpAt ??
              coreRow.riderPickedUpAt ??
              coreRow.actualPickupTime ??
              null,
            deliveredAt:
              foodRow?.deliveredAt ?? coreRow.actualDeliveryTime ?? null,
            cancelledAt: foodRow?.cancelledAt ?? coreRow.cancelledAt ?? null,
          });
          if (milestones.length > 0) return milestones;
          return [
            {
              status: appStatus,
              at: (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString(),
              label: "Order placed",
            },
          ];
        })(),
        rider,
        items: items.length > 0 ? items : undefined,
        billingSnapshot: billingSnap,
        prepTimeMinutes,
        prepReadyByAt,
        storeRatingSubmitted: resolveStoreStarFromRatingRow(existingStoreRating) != null,
        storeRating: resolveStoreStarFromRatingRow(existingStoreRating),
        deliveryRating: resolveDeliveryStarFromRatingRow(existingStoreRating),
        storeReviewText: existingStoreRating?.reviewText?.trim() || null,
        riderReviewText:
          existingStoreRating?.riderReviewText?.trim() ||
          existingStoreRating?.reviewTitle?.trim() ||
          null,
        storeReviewTags: normalizeReviewTags(existingStoreRating?.storeReviewTags),
        riderReviewTags: normalizeReviewTags(existingStoreRating?.riderReviewTags),
        ...(await loadCustomerPostDeliveryFeedback(coreRow.id, coreRow.riderId).then(
          (feedback) => ({
            customerPackagingFeedback: feedback.packagingFeedback,
            customerRiderInUniform: feedback.riderInUniform,
          })
        )),
        tipAmount: resolvedTipAmount,
        distanceKm: resolveCustomerRideDistanceKm({
          orderType: coreRow.orderType,
          checkoutMetadata: coreRow.checkoutMetadata,
          billingSnapshot: billingSnap,
          coreDistanceKm: coreRow.distanceKm,
        }),
        checkoutMetadata:
          coreRow.checkoutMetadata != null && typeof coreRow.checkoutMetadata === "object"
            ? (coreRow.checkoutMetadata as Record<string, unknown>)
            : null,
        ...(coreRow.orderType === "person_ride"
          ? {
              pickupWaitSeconds,
              pickupWaitingChargePerMin,
              estimatedPickupWaitingCharge,
            }
          : {}),
        deliveryPromiseComparison,
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
      const pLat = pickupLat != null && Number.isFinite(pickupLat) ? pickupLat : null;
      const pLon = pickupLon != null && Number.isFinite(pickupLon) ? pickupLon : null;

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

      // Immutable store snapshot at place time — never fall back pickup → drop.
      const pickupLatNum =
        storeForOrder?.latitude != null && Number.isFinite(storeForOrder.latitude)
          ? Number(storeForOrder.latitude)
          : pLat ?? 0;
      const pickupLonNum =
        storeForOrder?.longitude != null && Number.isFinite(storeForOrder.longitude)
          ? Number(storeForOrder.longitude)
          : pLon ?? 0;
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

          // Freeze the SAME per-line offer economics onto orders_core_items as the finalize /
          // webhook paths (single source of truth). Without this the CTM snapshot had no per-line
          // applied_offer_* to project from, so a Billing-Engine BOGO persisted as NONE on this path.
          const billingSnapForItems =
            billingSnapshot && typeof billingSnapshot === "object"
              ? (billingSnapshot as Record<string, unknown>)
              : null;
          const itemInserts = normItems.map((i, lineIndex) => {
            const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
            const lineAddonTotal = addonPerUnit * i.quantity;
            const lineTotal = i.basePrice * i.quantity + lineAddonTotal;
            const pricing = orderLinePricingFieldsFromSnapshot(
              billingSnapForItems,
              String(i.menuItemId),
              lineIndex,
              i.quantity,
              lineTotal,
            );
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
              specialInstructions: i.specialInstructions ?? undefined,
              isDiscountEligible: pricing.isDiscountEligible,
              effectiveUnitPrice: pricing.effectiveUnitPrice,
              effectiveLineTotal: pricing.effectiveLineTotal,
              offerDiscountAmount: pricing.offerDiscountAmount,
              appliedOfferId: pricing.appliedOfferId,
              appliedOfferLabel: pricing.appliedOfferLabel,
              appliedOfferType: pricing.appliedOfferType,
              ineligibilityReason: pricing.ineligibilityReason,
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

          if (orderIdNumRoute != null && orderIdNumRoute > 0) {
            const billingSnapRoute = billingSnapForItems;
            // Same leak-proof projection as the finalize / webhook paths: each CTM line comes from
            // its own just-frozen orders_core_items row (itemInserts[i] ↔ insertedItems[i]).
            const ctmLines = buildCtmLineInputsFromFrozenItems(
              insertedItems.map((r: { id?: number }, i: number) => {
                const ins = itemInserts[i]!;
                return {
                  orderItemId: Number(r.id),
                  menuItemId: ins.menuItemId != null ? Number(ins.menuItemId) : null,
                  quantity: ins.quantity,
                  catalogLineTotal: Number(ins.totalPrice ?? 0),
                  offerDiscountAmount: Number(ins.offerDiscountAmount ?? 0),
                  appliedOfferType: ins.appliedOfferType ?? null,
                  appliedOfferLabel: ins.appliedOfferLabel ?? null,
                  appliedOfferId: ins.appliedOfferId ?? null,
                  isItemPromo:
                    String(ins.ineligibilityReason ?? "").trim().toUpperCase() === "ITEM_PROMO",
                };
              })
            );
            await writeMerchantCtmPricingSnapshots(tx, {
              coreOrderId: orderIdNumRoute,
              commissionPercent: 0,
              billingSnapshot: billingSnapRoute,
              lines: ctmLines,
            });
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

      const legacyCorePk = await resolveOrdersCorePk(db as any, orderIdText);
      if (legacyCorePk != null) {
        void ensureMerchantCtmPricingSnapshotsForOrder(db as any, {
          coreOrderId: legacyCorePk,
          orderIdText,
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
              accuracyMeters: z.number().nullable().optional(),
              speedMps: z.number().nullable().optional(),
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
          formattedOrderId: ordersCore.formattedOrderId,
          riderId: ordersCore.riderId,
          pickupLat: ordersCore.pickupLat,
          pickupLon: ordersCore.pickupLon,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      const trackingOrderIds = Array.from(
        new Set(
          [
            orderRow.orderId,
            orderRow.formattedOrderId,
            String(orderRow.id),
            orderIdParam,
          ]
            .map((v) => (v != null ? String(v).trim() : ""))
            .filter((v) => v.length > 0)
        )
      );
      const pickupLatNum =
        orderRow.pickupLat != null ? Number(orderRow.pickupLat) : null;
      const pickupLngNum =
        orderRow.pickupLon != null ? Number(orderRow.pickupLon) : null;

      type RiderLoc = {
        latitude: number;
        longitude: number;
        headingDegrees: number | null;
        updatedAt: string;
        accuracyMeters: number | null;
        speedMps: number | null;
        source: "order_tracking" | "live_location";
      };

      let location: RiderLoc | null = null;

      if (trackingOrderIds.length > 0) {
        const [latest] = await db
          .select({
            latitude: orderRiderTracking.latitude,
            longitude: orderRiderTracking.longitude,
            headingDegrees: orderRiderTracking.headingDegrees,
            accuracyMeters: orderRiderTracking.accuracyMeters,
            speedKmh: orderRiderTracking.speedKmh,
            createdAt: orderRiderTracking.createdAt,
          })
          .from(orderRiderTracking)
          .where(inArray(orderRiderTracking.orderId, trackingOrderIds))
          .orderBy(desc(orderRiderTracking.createdAt))
          .limit(1);

        if (latest) {
          const riderLat = Number(latest.latitude);
          const riderLng = Number(latest.longitude);
          if (isRiderPlausibleForPickup(riderLat, riderLng, pickupLatNum, pickupLngNum)) {
            const speedKmh =
              latest.speedKmh != null && Number.isFinite(Number(latest.speedKmh))
                ? Number(latest.speedKmh)
                : null;
            location = {
              latitude: riderLat,
              longitude: riderLng,
              headingDegrees:
                latest.headingDegrees != null ? Number(latest.headingDegrees) : null,
              updatedAt: (latest.createdAt ?? new Date()).toISOString(),
              accuracyMeters:
                latest.accuracyMeters != null && Number.isFinite(Number(latest.accuracyMeters))
                  ? Number(latest.accuracyMeters)
                  : null,
              speedMps: speedKmh != null ? speedKmh / 3.6 : null,
              source: "order_tracking",
            };
          }
        }
      }

      if (orderRow.riderId != null) {
        const [live] = await db
          .select({
            latitude: riderLiveLocations.lat,
            longitude: riderLiveLocations.lng,
            heading: riderLiveLocations.headingDeg,
            accuracyM: riderLiveLocations.accuracyM,
            speedMps: riderLiveLocations.speedMps,
            updatedAt: riderLiveLocations.updatedAt,
          })
          .from(riderLiveLocations)
          .where(eq(riderLiveLocations.riderId, orderRow.riderId))
          .limit(1);

        if (live) {
          const riderLat = Number(live.latitude);
          const riderLng = Number(live.longitude);
          if (isRiderPlausibleForPickup(riderLat, riderLng, pickupLatNum, pickupLngNum)) {
            const liveLoc: RiderLoc = {
              latitude: riderLat,
              longitude: riderLng,
              headingDegrees: live.heading != null ? Number(live.heading) : null,
              updatedAt: (live.updatedAt ?? new Date()).toISOString(),
              accuracyMeters:
                live.accuracyM != null && Number.isFinite(Number(live.accuracyM))
                  ? Number(live.accuracyM)
                  : null,
              speedMps:
                live.speedMps != null && Number.isFinite(Number(live.speedMps))
                  ? Number(live.speedMps)
                  : null,
              source: "live_location",
            };
            if (location) {
              const liveMs = new Date(liveLoc.updatedAt).getTime();
              const trackMs = new Date(location.updatedAt).getTime();
              // Prefer fresher GPS — live rider_current_locations often advances while
              // order_rider_tracking trail lags (e.g. status not yet in trail-write set).
              location = liveMs >= trackMs ? liveLoc : location;
            } else {
              location = liveLoc;
            }
          }
        }
      }

      if (!location) return { orderId: orderIdParam, rider: null };

      return {
        orderId: orderIdParam,
        rider: {
          latitude: location.latitude,
          longitude: location.longitude,
          headingDegrees: location.headingDegrees,
          updatedAt: location.updatedAt,
          accuracyMeters: location.accuracyMeters,
          speedMps: location.speedMps,
        },
      };
    }
  );

  const storeRatingBodySchema = z
    .object({
      storeRating: z.number().int().min(1).max(5).optional().nullable(),
      deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
      reviewText: z.string().max(2000).optional().nullable(),
      riderReviewText: z.string().max(2000).optional().nullable(),
      storeReviewTags: z.array(z.string().max(120)).max(20).optional(),
      riderReviewTags: z.array(z.string().max(120)).max(20).optional(),
      riderTipAmount: z.number().nonnegative().optional().nullable(),
    })
    .refine(
      (body) =>
        (body.storeRating != null && body.storeRating >= 1) ||
        (body.deliveryRating != null && body.deliveryRating >= 1),
      { message: "Provide a restaurant and/or delivery rating." }
    );

  app.post<{ Params: { id: string }; Body: z.infer<typeof storeRatingBodySchema> }>(
    "/:id/store-rating",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: storeRatingBodySchema,
        response: {
          200: z.object({
            submitted: z.literal(true),
            storeRating: z.number().nullable(),
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
          orderType: ordersCore.orderType,
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

      const isPersonRide = orderRow.orderType === "person_ride";

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (statusUpper !== "DELIVERED") {
        return reply.status(400).send({
          error: "order_not_delivered",
          message: isPersonRide
            ? "You can rate your captain after the ride is complete."
            : "You can rate the store after delivery is complete.",
        });
      }

      let storeId =
        orderRow.merchantStoreId != null ? Number(orderRow.merchantStoreId) : null;
      if (storeId != null && (!Number.isFinite(storeId) || storeId <= 0)) {
        storeId = null;
      }

      if (!isPersonRide && storeId == null) {
        return reply.status(400).send({ error: "store_not_found" });
      }

      if (isPersonRide && storeId == null) {
        storeId = await resolvePersonRideRatingStoreId();
        if (storeId == null) {
          return reply.status(400).send({
            error: "store_not_found",
            message: "Captain rating is temporarily unavailable. Please try again later.",
          });
        }
      }

      const [existing] = await db
        .select({
          id: merchantStoreRatings.id,
          rating: merchantStoreRatings.rating,
          foodRating: merchantStoreRatings.foodRating,
          serviceRating: merchantStoreRatings.serviceRating,
        })
        .from(merchantStoreRatings)
        .where(
          and(
            eq(merchantStoreRatings.orderId, orderRow.id),
            eq(merchantStoreRatings.customerId, customerPk)
          )
        )
        .limit(1);

      const deliveryRating =
        body.deliveryRating != null && Number.isFinite(body.deliveryRating)
          ? Math.round(body.deliveryRating)
          : null;
      const storeRating =
        body.storeRating != null && Number.isFinite(body.storeRating)
          ? Math.round(body.storeRating)
          : null;
      const reviewText =
        typeof body.reviewText === "string" && body.reviewText.trim()
          ? body.reviewText.trim()
          : null;
      const riderReviewText =
        typeof body.riderReviewText === "string" && body.riderReviewText.trim()
          ? body.riderReviewText.trim()
          : null;
      const storeReviewTags = normalizeReviewTags(body.storeReviewTags);
      const riderReviewTags = normalizeReviewTags(body.riderReviewTags);

      if (existing) {
        const patch: Record<string, unknown> = {};

        if (
          (existing.serviceRating == null || Number(existing.serviceRating) <= 0) &&
          deliveryRating != null &&
          deliveryRating >= 1
        ) {
          patch.serviceRating = deliveryRating;
        }

        if (
          storeRating != null &&
          storeRating >= 1 &&
          resolveStoreStarFromRatingRow(existing) == null
        ) {
          patch.rating = storeRating;
          patch.foodRating = storeRating;
        }

        if (reviewText && storeRating != null && storeRating >= 1) patch.reviewText = reviewText;
        if (riderReviewText && deliveryRating != null && deliveryRating >= 1) {
          patch.riderReviewText = riderReviewText;
          patch.reviewTitle = riderReviewText;
        }
        if (storeReviewTags.length > 0 && storeRating != null && storeRating >= 1) {
          patch.storeReviewTags = storeReviewTags;
        }
        if (riderReviewTags.length > 0 && deliveryRating != null && deliveryRating >= 1) {
          patch.riderReviewTags = riderReviewTags;
        }

        if (Object.keys(patch).length > 0) {
          const hadStoreRating = resolveStoreStarFromRatingRow(existing) != null;
          await db
            .update(merchantStoreRatings)
            .set(patch)
            .where(eq(merchantStoreRatings.id, existing.id));

          const nextStoreRating = resolveStoreStarFromRatingRow({
            ...existing,
            foodRating:
              patch.foodRating != null ? patch.foodRating : existing.foodRating,
            rating: patch.rating != null ? patch.rating : existing.rating,
            serviceRating: existing.serviceRating,
          });
          const nextDeliveryRating = resolveDeliveryStarFromRatingRow({
            ...existing,
            serviceRating:
              patch.serviceRating != null ? patch.serviceRating : existing.serviceRating,
          });

          if (
            !isPersonRide &&
            storeId != null &&
            !hadStoreRating &&
            nextStoreRating != null &&
            nextStoreRating >= 1
          ) {
            voidNotifyMerchantStoreRating({
              storeId,
              stars: nextStoreRating,
              customerPk,
              orderCorePk: orderRow.id,
            });
          }

          return {
            submitted: true as const,
            storeRating: nextStoreRating,
            deliveryRating: nextDeliveryRating,
          };
        }

        return reply.status(409).send({ error: "already_rated" });
      }

      // Tips after prepaid orders must go through Razorpay (POST /:id/rider-tip).
      // Unpaid tip amounts on ratings are intentionally ignored.

      const primaryRating = storeRating ?? deliveryRating;
      if (primaryRating == null || primaryRating < 1) {
        return reply.status(400).send({
          error: "rating_required",
          message: isPersonRide
            ? "Provide a captain rating."
            : "Provide a restaurant and/or delivery rating.",
        });
      }

      await db.insert(merchantStoreRatings).values({
        storeId: storeId ?? 0,
        orderId: orderRow.id,
        customerId: customerPk ?? 0,
        rating: primaryRating,
        foodRating: storeRating ?? undefined,
        serviceRating: deliveryRating ?? undefined,
        packagingRating: null,
        reviewText: storeRating != null && storeRating >= 1 ? reviewText : null,
        reviewTitle:
          deliveryRating != null && deliveryRating >= 1 && riderReviewText
            ? riderReviewText
            : null,
        riderReviewText:
          deliveryRating != null && deliveryRating >= 1 ? riderReviewText : null,
        storeReviewTags:
          storeRating != null && storeRating >= 1 ? storeReviewTags : [],
        riderReviewTags:
          deliveryRating != null && deliveryRating >= 1 ? riderReviewTags : [],
        isVerified: true,
      });

      if (!isPersonRide && storeId != null && storeRating != null && storeRating >= 1) {
        voidNotifyMerchantStoreRating({
          storeId,
          stars: storeRating,
          customerPk,
          orderCorePk: orderRow.id,
        });
      }

      return {
        submitted: true as const,
        storeRating,
        deliveryRating,
      };
    }
  );

  const riderTipBodySchema = z.object({
    tipAmount: z.number().int().positive().max(5000),
    paymentMethod: z.enum(["upi", "gaticash"]).optional().default("upi"),
    razorpayOrderId: z.string().min(1).optional(),
    razorpayPaymentId: z.string().min(1).optional(),
    razorpaySignature: z.string().min(1).optional(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof riderTipBodySchema> }>(
    "/:id/rider-tip",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderTipBodySchema,
        response: {
          200: z.object({ ok: z.literal(true), tipAmount: z.number() }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = riderTipBodySchema.parse(req.body ?? {});
      const db = getDb();
      const sqlClient = getSql();

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
          orderId: ordersCore.orderId,
          orderType: ordersCore.orderType,
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
      if (
        statusUpper === "CANCELLED" ||
        statusUpper === "PAYMENT_FAILED" ||
        statusUpper === "FAILED"
      ) {
        return reply.status(400).send({
          error: "order_not_active",
          message: "Tips cannot be added on a cancelled or failed order.",
        });
      }
      if (orderRow.riderId == null) {
        return reply.status(400).send({
          error: "rider_not_assigned",
          message: "A delivery partner must be assigned before you can tip.",
        });
      }

      const existingTip =
        orderRow.tipAmount != null && Number(orderRow.tipAmount) > 0
          ? Number(orderRow.tipAmount)
          : 0;
      const snap = (orderRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      const snapTip =
        snap?.tip_amount != null && Number(snap.tip_amount) > 0 ? Number(snap.tip_amount) : 0;
      if (existingTip > 0 || snapTip > 0) {
        return reply.status(409).send({
          error: "tip_already_paid",
          message: "You have already added a tip for this order.",
        });
      }

      const tipAmount = Math.round(body.tipAmount);
      if (tipAmount <= 0) {
        return reply.status(400).send({ error: "invalid_tip_amount" });
      }

      const payWithGatiCash = body.paymentMethod === "gaticash";
      const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

      if (payWithGatiCash) {
        const available = await getCustomerGatiCashAvailable(sqlClient, customerPk);
        if (available + 0.005 < tipAmount) {
          return reply.status(400).send({
            error: "insufficient_gaticash",
            message: "GatiCash balance is not enough for this tip. Pay with UPI instead.",
          });
        }
        try {
          await debitCustomerGatiCashForRideFare(sqlClient, {
            customerInternalId: customerPk,
            orderIdText: `tip_${orderIdText}`,
            amount: tipAmount,
          });
        } catch (err) {
          console.warn("[POST /orders/:id/rider-tip] gaticash debit failed", orderRow.id, err);
          return reply.status(400).send({
            error: "gaticash_debit_failed",
            message: "Could not pay tip with GatiCash. Try UPI instead.",
          });
        }
      } else {
        const razorpayOrderId = body.razorpayOrderId?.trim() ?? "";
        const razorpayPaymentId = body.razorpayPaymentId?.trim() ?? "";
        const razorpaySignature = body.razorpaySignature?.trim() ?? "";
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return reply.status(400).send({
            error: "payment_required",
            message: "UPI payment details are required.",
          });
        }

        const signatureOk = verifyRazorpaySignature(
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature
        );
        if (!signatureOk) {
          return reply.status(400).send({ error: "invalid_payment_signature" });
        }

        try {
          const verified = await verifyRazorpayPaymentDetails(
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            tipAmount * 100
          );
          if (!verified.ok) {
            return reply.status(400).send({
              error: "payment_verification_failed",
              message: verified.message ?? "Could not verify payment.",
            });
          }
        } catch {
          /* dummy / dev simulated payments may skip gateway fetch */
        }
      }

      const nextSnap = {
        ...(snap ?? {}),
        tip_amount: tipAmount,
        live_tracking_tip: true,
        tip_payment_method: payWithGatiCash ? "gaticash" : "upi",
      };
      await db
        .update(ordersCore)
        .set({
          tipAmount: String(tipAmount),
          billingSnapshot: nextSnap,
          updatedAt: new Date(),
        })
        .where(eq(ordersCore.id, orderRow.id));

      try {
        await sqlClient`
          INSERT INTO customer_tips_given (customer_id, order_id, rider_id, tip_amount, tip_paid, paid_at)
          VALUES (
            ${customerPk}::bigint,
            ${orderRow.id}::bigint,
            ${orderRow.riderId}::integer,
            ${String(tipAmount)}::numeric,
            TRUE,
            NOW()
          )
        `;
      } catch {
        /* legacy FK may reference orders(id); orders_core tip is still updated */
      }

      if (statusUpper === "DELIVERED" && orderRow.riderId != null) {
        const rawType = String(orderRow.orderType ?? "food");
        const walletOrderType =
          rawType === "person_ride" ? "person_ride" : rawType === "parcel" ? "parcel" : "food";
        try {
          const { creditRiderOrderEarningOnDelivered } = await import(
            "../../lib/credit-rider-order-on-delivered.js"
          );
          await creditRiderOrderEarningOnDelivered({
            ordersCoreId: orderRow.id,
            riderId: Number(orderRow.riderId),
            orderType: walletOrderType,
            deliveryFee: 0,
            tipAmount,
          });
        } catch (err) {
          console.warn("[POST /orders/:id/rider-tip] wallet credit failed", orderRow.id, err);
        }
      }

      return { ok: true as const, tipAmount };
    }
  );

  const rideFareBillBodySchema = z.object({
    couponCode: z.string().min(1).optional(),
    platformOfferId: z.coerce.number().int().positive().optional(),
    forceNoAutoOffer: z.boolean().optional(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof rideFareBillBodySchema> }>(
    "/:id/ride-fare-bill",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: rideFareBillBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            rideFare: z.number(),
            finalAmount: z.number(),
            discountTotal: z.number(),
            platformFee: z.number(),
            convenienceFee: z.number(),
            taxTotal: z.number(),
            tipAmount: z.number(),
            charges: z.array(z.any()),
            discounts: z.array(z.any()),
            taxes: z.array(z.any()),
            breakdownSteps: z.array(z.any()),
            rulesetVersion: z.number(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = rideFareBillBodySchema.parse(req.body ?? {});
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const { computeRideBillForCustomerOrder } = await import("../rides/ride-bill.service.js");
      const result = await computeRideBillForCustomerOrder(db, {
        customerPk,
        orderRef: orderIdParam,
        couponCode: body.couponCode,
        platformOfferId: body.platformOfferId,
        forceNoAutoOffer: body.forceNoAutoOffer,
      });
      if (!result.ok) {
        const status = result.statusCode ?? 400;
        if (status === 404) return reply.status(404).send({ error: result.code });
        if (status === 409) return reply.status(409).send({ error: result.code, message: result.message });
        return reply.status(status as 400).send({ error: result.code, message: result.message });
      }

      const [ridePayRow] = await db
        .select({ paymentStatus: ordersCore.paymentStatus, billingSnapshot: ordersCore.billingSnapshot })
        .from(ordersCore)
        .where(eq(ordersCore.id, result.orderCoreId))
        .limit(1);
      const rideSnap =
        ridePayRow?.billingSnapshot != null && typeof ridePayRow.billingSnapshot === "object"
          ? (ridePayRow.billingSnapshot as Record<string, unknown>)
          : {};
      const rideSnapPaid =
        typeof rideSnap.ride_fare_paid_at === "string" && rideSnap.ride_fare_paid_at.trim().length > 0;
      const ridePaymentPending =
        String(ridePayRow?.paymentStatus ?? "").toLowerCase() !== "completed" && !rideSnapPaid;

      if (ridePaymentPending) {
        const { syncRideCustomerBillingSnapshot } = await import("../rides/ride-bill.service.js");
        void syncRideCustomerBillingSnapshot(db, result.orderCoreId, {
          skipIfPaid: true,
          couponCode: body.couponCode,
          platformOfferId: body.platformOfferId,
        }).catch((err) => {
          console.warn("[ride-fare-bill] billing snapshot sync failed:", err);
        });
      }

      const b = result.billing;
      void import("../../lib/persist-ride-customer-payment-snapshot.js").then(
        ({ insertRideCustomerPaymentSnapshot }) =>
          insertRideCustomerPaymentSnapshot(db, {
            orderCoreId: result.orderCoreId,
            orderIdText: result.orderIdText,
            customerId: result.customerId,
            phase: "payment_quote",
            billing: result.billing,
            billingSnapshot: result.snapshot,
            offerContext: {
              couponCode: body.couponCode,
              platformOfferId: body.platformOfferId,
            },
            rideContext: {
              rideType: result.rideType,
              pickupAddress: result.pickupAddress,
              dropAddress: result.dropAddress,
              distanceKm: result.distanceKm,
            },
            paymentContext: { paymentMethod: result.paymentMethod },
            metadata: {
              forceNoAutoOffer: body.forceNoAutoOffer === true,
            },
          })
      );
      return {
        ok: true as const,
        rideFare: b.item_total,
        finalAmount: b.final_amount,
        discountTotal: b.discount_total,
        platformFee: b.platform_fee,
        convenienceFee: b.convenience_fee,
        taxTotal: b.tax_total,
        tipAmount: b.tip_amount,
        charges: b.charges,
        discounts: b.discounts,
        taxes: b.taxes,
        breakdownSteps: b.breakdown_steps,
        rulesetVersion: b.ruleset_version,
      };
    }
  );

  const rideFarePaymentBodySchema = z
    .object({
      razorpayOrderId: z.string().min(1).optional(),
      razorpayPaymentId: z.string().min(1).optional(),
      razorpaySignature: z.string().min(1).optional(),
      gatiCashAmount: z.number().positive().optional(),
      couponCode: z.string().min(1).optional(),
      platformOfferId: z.coerce.number().int().positive().optional(),
    })
    .superRefine((body, ctx) => {
      const hasWallet = (body.gatiCashAmount ?? 0) > 0;
      const hasOffer =
        Boolean(body.couponCode?.trim()) || (body.platformOfferId != null && body.platformOfferId > 0);
      const hasRz = Boolean(
        body.razorpayOrderId?.trim() &&
          body.razorpayPaymentId?.trim() &&
          body.razorpaySignature?.trim()
      );
      const partialRz =
        Boolean(body.razorpayOrderId?.trim()) ||
        Boolean(body.razorpayPaymentId?.trim()) ||
        Boolean(body.razorpaySignature?.trim());
      if (!hasWallet && !hasRz && !hasOffer) {
        ctx.addIssue({ code: "custom", message: "payment_required" });
      }
      if (partialRz && !hasRz) {
        ctx.addIssue({ code: "custom", message: "incomplete_razorpay" });
      }
    });

  app.post<{ Params: { id: string }; Body: z.infer<typeof rideFarePaymentBodySchema> }>(
    "/:id/ride-fare-payment",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: rideFarePaymentBodySchema,
        response: {
          200: z.object({ ok: z.literal(true), amountPaid: z.number() }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = rideFarePaymentBodySchema.parse(req.body ?? {});
      try {
        const { confirmRideFarePaymentForCustomer } = await import(
          "../rides/ride-payment.service.js"
        );
        const result = await confirmRideFarePaymentForCustomer({
          customerSub: sub,
          orderRef: orderIdParam,
          razorpayOrderId: body.razorpayOrderId,
          razorpayPaymentId: body.razorpayPaymentId,
          razorpaySignature: body.razorpaySignature,
          gatiCashAmount: body.gatiCashAmount,
          couponCode: body.couponCode,
          platformOfferId: body.platformOfferId,
        });
        return result;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
        const message = err instanceof Error ? err.message : "Payment failed";
        if (statusCode === 404) return reply.status(404).send({ error: "order_not_found" });
        if (statusCode === 403) return reply.status(403).send({ error: "forbidden" });
        if (statusCode === 409) return reply.status(409).send({ error: "conflict", message });
        if (statusCode === 400) return reply.status(400).send({ error: "invalid_payment", message });
        return reply.status(500).send({ error: "payment_failed", message });
      }
    }
  );

  const rideInvoiceEmailBodySchema = z.object({
    email: z.string().email().optional(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof rideInvoiceEmailBodySchema> }>(
    "/:id/ride-invoice-email",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: rideInvoiceEmailBodySchema,
        response: {
          200: z.object({ ok: z.literal(true), sentTo: z.string() }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
          502: z.object({ error: z.string(), message: z.string().optional() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = rideInvoiceEmailBodySchema.parse(req.body ?? {});
      const db = getDb();
      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const { sendRideInvoiceEmailForCustomer } = await import("../rides/ride-invoice.service.js");
      const result = await sendRideInvoiceEmailForCustomer(db, {
        customerPk,
        customerSub: sub,
        orderRef: orderIdParam,
        emailOverride: body.email,
      });

      if (!result.ok) {
        const status = result.statusCode ?? 400;
        return reply.status(status as 400).send({
          error: result.code,
          message: result.message,
        });
      }

      return { ok: true as const, sentTo: result.sentTo };
    }
  );

  const postDeliveryFeedbackBodySchema = z
    .object({
      packagingFeedback: z.enum(["good", "not_good"]).optional(),
      riderInUniform: z.boolean().optional(),
    })
    .refine(
      (body) => body.packagingFeedback != null || body.riderInUniform != null,
      { message: "Provide packaging feedback and/or rider uniform answer." }
    );

  app.post<{ Params: { id: string }; Body: z.infer<typeof postDeliveryFeedbackBodySchema> }>(
    "/:id/post-delivery-feedback",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: postDeliveryFeedbackBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            packagingFeedback: z.enum(["good", "not_good"]).nullable(),
            riderInUniform: z.boolean().nullable(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = postDeliveryFeedbackBodySchema.parse(req.body ?? {});
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
          currentStatus: ordersCore.currentStatus,
          status: ordersCore.status,
          riderId: ordersCore.riderId,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (statusUpper !== "DELIVERED") {
        return reply.status(400).send({
          error: "order_not_delivered",
          message: "Feedback can be submitted after delivery is complete.",
        });
      }

      const saved = await saveCustomerPostDeliveryFeedback({
        orderCorePk: orderRow.id,
        riderId: orderRow.riderId,
        packagingFeedback: body.packagingFeedback ?? null,
        riderInUniform: body.riderInUniform ?? null,
      });

      return {
        ok: true as const,
        packagingFeedback: saved.packagingFeedback,
        riderInUniform: saved.riderInUniform,
      };
    }
  );

  const merchantInstructionBodySchema = z.object({
    instruction: z.string().trim().min(1).max(500),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof merchantInstructionBodySchema> }>(
    "/:id/merchant-instructions",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: merchantInstructionBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            merchantInstructionsList: z.array(z.string()),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = merchantInstructionBodySchema.parse(req.body ?? {});
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
          orderType: ordersCore.orderType,
          currentStatus: ordersCore.currentStatus,
          status: ordersCore.status,
          merchantInstructionsList: ordersCore.merchantInstructionsList,
          checkoutMetadata: ordersCore.checkoutMetadata,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      if (orderRow.orderType !== "food") {
        return reply.status(400).send({ error: "not_food_order" });
      }

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (!canCustomerAppendCookingRequest(statusUpper)) {
        return reply.status(409).send({
          error: "cooking_requests_closed",
          message: "Cooking requests can no longer be added for this order.",
        });
      }

      const current = resolveMerchantInstructionsList(
        orderRow.merchantInstructionsList,
        orderRow.checkoutMetadata
      );
      const next = appendMerchantInstruction(current, body.instruction);
      if (next.length === current.length) {
        return reply.status(400).send({ error: "empty_instruction" });
      }

      await db
        .update(ordersCore)
        .set({
          merchantInstructionsList: next,
          updatedAt: new Date(),
        })
        .where(eq(ordersCore.id, orderRow.id));

      return { ok: true as const, merchantInstructionsList: next };
    }
  );

  const deliveryInstructionsBodySchema = z.object({
    instructions: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof deliveryInstructionsBodySchema> }>(
    "/:id/delivery-instructions",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: deliveryInstructionsBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            deliveryInstructionsList: z.array(z.string()),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = deliveryInstructionsBodySchema.parse(req.body ?? {});
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
          orderType: ordersCore.orderType,
          currentStatus: ordersCore.currentStatus,
          status: ordersCore.status,
          deliveryInstructionsList: ordersCore.deliveryInstructionsList,
          checkoutMetadata: ordersCore.checkoutMetadata,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      if (orderRow.orderType !== "food") {
        return reply.status(400).send({ error: "not_food_order" });
      }

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (!canCustomerUpdateDeliveryInstructions(statusUpper)) {
        return reply.status(409).send({
          error: "delivery_instructions_closed",
          message: "Delivery instructions can no longer be updated for this order.",
        });
      }

      const normalizedIncoming = normalizeDeliveryInstructionsList(body.instructions);
      if (normalizedIncoming.length === 0) {
        return reply.status(400).send({ error: "empty_instructions" });
      }
      const next = normalizedIncoming;

      await db
        .update(ordersCore)
        .set({
          deliveryInstructionsList: next,
          updatedAt: new Date(),
        })
        .where(eq(ordersCore.id, orderRow.id));

      return { ok: true as const, deliveryInstructionsList: next };
    }
  );

  app.get(
    "/:id/invoice",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            html: z.string(),
            title: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
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
        .select({ id: customers.id, fullName: customers.fullName })
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
          paymentStatus: ordersCore.paymentStatus,
          paymentMethod: ordersCore.paymentMethod,
          deliveryAddress: ordersCore.deliveryAddress,
          billingSnapshot: ordersCore.billingSnapshot,
          checkoutMetadata: ordersCore.checkoutMetadata,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
          riderId: ordersCore.riderId,
          alternateContactName: ordersCore.alternateContactName,
          alternateContactPhone: ordersCore.alternateContactPhone,
          deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
          deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);

      if (!coreRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const appStatus = normalizeCustomerOrderStatus(coreRow.currentStatus, coreRow.status);
      if (!["DELIVERED", "CANCELLED"].includes(appStatus)) {
        return reply.status(400).send({
          error: "INVOICE_NOT_READY",
          message: "Invoice is available after the order is delivered or cancelled.",
        });
      }

      const billingSnap = (coreRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      if (!orderHasCustomerTaxInvoice(billingSnap)) {
        return reply.status(400).send({
          error: "NO_INVOICE_CHARGES",
          message: "No platform or delivery fee invoice is available for this order.",
        });
      }

      const [foodRow] = await db
        .select({ customerName: ordersFood.customerName, customerPhone: ordersFood.customerPhone })
        .from(ordersFood)
        .where(eq(ordersFood.orderId, coreRow.id))
        .limit(1);

      let riderName: string | null = null;
      if (coreRow.riderId != null) {
        const [riderRow] = await db
          .select({ name: riders.name })
          .from(riders)
          .where(eq(riders.id, coreRow.riderId))
          .limit(1);
        riderName = riderRow?.name?.trim() || null;
      }

      const deliveryDetails = await resolveOrderDeliveryDetails(db, {
        orderIdText: coreRow.orderId ?? String(coreRow.id),
        customerPk,
        checkoutMetadata: coreRow.checkoutMetadata,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        foodCustomerName: foodRow?.customerName ?? null,
        foodCustomerPhone: foodRow?.customerPhone ?? null,
        alternateContactName: coreRow.alternateContactName,
        alternateContactPhone: coreRow.alternateContactPhone,
        deliveryPrimaryContactName: coreRow.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: coreRow.deliveryPrimaryContactPhone,
      });

      const customerName =
        deliveryDetails.deliveryContactName?.trim() ||
        foodRow?.customerName?.trim() ||
        customerRow?.fullName?.trim() ||
        "Customer";
      const orderIdDisplay = coreRow.formattedOrderId ?? coreRow.orderId ?? String(coreRow.id);
      const createdAt = coreRow.placedAt ?? coreRow.createdAt;
      const placeOfSupply =
        process.env.PLATFORM_INVOICE_PLACE_OF_SUPPLY?.trim() || "Bihar(10)";

      const html = await buildCustomerOrderTaxInvoiceHtml({
        orderId: coreRow.orderId ?? String(coreRow.id),
        formattedOrderId: orderIdDisplay,
        coreOrderId: coreRow.id,
        customerPk,
        orderDateIso:
          createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString(),
        customerName,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        placeOfSupply,
        billingSnapshot: billingSnap,
        riderName,
        paymentMethod: coreRow.paymentMethod ?? null,
      });

      return reply.send({
        html,
        title: `Tax Invoice — ${orderIdDisplay}`,
      });
    }
  );

  app.get(
    "/:id/invoice.pdf",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
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
        .select({ id: customers.id, fullName: customers.fullName })
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
          paymentStatus: ordersCore.paymentStatus,
          paymentMethod: ordersCore.paymentMethod,
          deliveryAddress: ordersCore.deliveryAddress,
          billingSnapshot: ordersCore.billingSnapshot,
          checkoutMetadata: ordersCore.checkoutMetadata,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
          riderId: ordersCore.riderId,
          alternateContactName: ordersCore.alternateContactName,
          alternateContactPhone: ordersCore.alternateContactPhone,
          deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
          deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);

      if (!coreRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const appStatus = normalizeCustomerOrderStatus(coreRow.currentStatus, coreRow.status);
      if (!["DELIVERED", "CANCELLED"].includes(appStatus)) {
        return reply.status(400).send({
          error: "INVOICE_NOT_READY",
          message: "Invoice is available after the order is delivered or cancelled.",
        });
      }

      const billingSnap = (coreRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      if (!orderHasCustomerTaxInvoice(billingSnap)) {
        return reply.status(400).send({
          error: "NO_INVOICE_CHARGES",
          message: "No platform or delivery fee invoice is available for this order.",
        });
      }

      const [foodRow] = await db
        .select({ customerName: ordersFood.customerName, customerPhone: ordersFood.customerPhone })
        .from(ordersFood)
        .where(eq(ordersFood.orderId, coreRow.id))
        .limit(1);

      let riderName: string | null = null;
      if (coreRow.riderId != null) {
        const [riderRow] = await db
          .select({ name: riders.name })
          .from(riders)
          .where(eq(riders.id, coreRow.riderId))
          .limit(1);
        riderName = riderRow?.name?.trim() || null;
      }

      const deliveryDetails = await resolveOrderDeliveryDetails(db, {
        orderIdText: coreRow.orderId ?? String(coreRow.id),
        customerPk,
        checkoutMetadata: coreRow.checkoutMetadata,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        foodCustomerName: foodRow?.customerName ?? null,
        foodCustomerPhone: foodRow?.customerPhone ?? null,
        alternateContactName: coreRow.alternateContactName,
        alternateContactPhone: coreRow.alternateContactPhone,
        deliveryPrimaryContactName: coreRow.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: coreRow.deliveryPrimaryContactPhone,
      });

      const customerName =
        deliveryDetails.deliveryContactName?.trim() ||
        foodRow?.customerName?.trim() ||
        customerRow?.fullName?.trim() ||
        "Customer";
      const orderIdDisplay = coreRow.formattedOrderId ?? coreRow.orderId ?? String(coreRow.id);
      const createdAt = coreRow.placedAt ?? coreRow.createdAt;
      const placeOfSupply =
        process.env.PLATFORM_INVOICE_PLACE_OF_SUPPLY?.trim() || "Bihar(10)";

      const pdfBuffer = await buildCustomerOrderTaxInvoicePdfBuffer({
        orderId: coreRow.orderId ?? String(coreRow.id),
        formattedOrderId: orderIdDisplay,
        coreOrderId: coreRow.id,
        customerPk,
        orderDateIso:
          createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString(),
        customerName,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        placeOfSupply,
        billingSnapshot: billingSnap,
        riderName,
        paymentMethod: coreRow.paymentMethod ?? null,
      });

      const filename = invoicePdfFilename(orderIdDisplay);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdfBuffer);
    }
  );

  app.get(
    "/:id/receipt",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            html: z.string(),
            title: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
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
        .select({ id: customers.id, fullName: customers.fullName })
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
          paymentMethod: ordersCore.paymentMethod,
          deliveryAddress: ordersCore.deliveryAddress,
          billingSnapshot: ordersCore.billingSnapshot,
          checkoutMetadata: ordersCore.checkoutMetadata,
          createdAt: ordersCore.createdAt,
          placedAt: ordersCore.placedAt,
          riderId: ordersCore.riderId,
          merchantStoreId: ordersCore.merchantStoreId,
          items: ordersCore.items,
          orderType: ordersCore.orderType,
          grandTotal: ordersCore.grandTotal,
          tipAmount: ordersCore.tipAmount,
          alternateContactName: ordersCore.alternateContactName,
          alternateContactPhone: ordersCore.alternateContactPhone,
          deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
          deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);

      if (!coreRow) {
        return reply.status(404).send({ error: "Order not found" });
      }

      const appStatus = normalizeCustomerOrderStatus(coreRow.currentStatus, coreRow.status);
      if (!["DELIVERED", "CANCELLED", "PAYMENT_FAILED", "FAILED"].includes(appStatus)) {
        return reply.status(400).send({
          error: "RECEIPT_NOT_READY",
          message: "Order receipt is available after the order is completed or cancelled.",
        });
      }

      const [foodRow] = await db
        .select({
          customerName: ordersFood.customerName,
          customerPhone: ordersFood.customerPhone,
          restaurantName: ordersFood.restaurantName,
        })
        .from(ordersFood)
        .where(ordersFoodMatchForCoreRow(coreRow.id, coreRow.orderId))
        .limit(1);

      let riderName: string | null = null;
      if (coreRow.riderId != null) {
        const [riderRow] = await db
          .select({ name: riders.name })
          .from(riders)
          .where(eq(riders.id, coreRow.riderId))
          .limit(1);
        riderName = riderRow?.name?.trim() || null;
      }

      const deliveryDetails = await resolveOrderDeliveryDetails(db, {
        orderIdText: coreRow.orderId ?? String(coreRow.id),
        customerPk,
        checkoutMetadata: coreRow.checkoutMetadata,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        foodCustomerName: foodRow?.customerName ?? null,
        foodCustomerPhone: foodRow?.customerPhone ?? null,
        alternateContactName: coreRow.alternateContactName,
        alternateContactPhone: coreRow.alternateContactPhone,
        deliveryPrimaryContactName: coreRow.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: coreRow.deliveryPrimaryContactPhone,
      });

      const customerName =
        deliveryDetails.deliveryContactName?.trim() ||
        foodRow?.customerName?.trim() ||
        customerRow?.fullName?.trim() ||
        "Customer";

      const orderIdDisplay = coreRow.formattedOrderId ?? coreRow.orderId ?? String(coreRow.id);
      const createdAt = coreRow.placedAt ?? coreRow.createdAt;
      const orderDateIso =
        createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();

      let restaurantName = foodRow?.restaurantName?.trim() || "Restaurant";
      let restaurantAddress: string | null = null;
      let restaurantFssai: string | null = null;

      if (coreRow.merchantStoreId != null) {
        const store = await getStoreByIdForOrder(Number(coreRow.merchantStoreId));
        if (store) {
          restaurantName =
            store.storeDisplayName?.trim() || store.storeName?.trim() || restaurantName;
          restaurantAddress = store.fullAddress?.trim() || null;
          if (store.storeId) {
            const about = await getMerchantAboutPayload(store.storeId);
            restaurantFssai = about?.fssai_number?.trim() || null;
          }
        }
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
          specialInstructions: ordersCoreItems.specialInstructions,
        })
        .from(ordersCoreItems)
        .where(eq(ordersCoreItems.orderId, coreRow.orderId ?? ""));

      const builtItems = await buildCustomerOrderDetailItems({
        orderIdText: coreRow.orderId ?? "",
        coreItems,
        itemsJsonFallback: coreRow.items,
      });

      const receiptItems = builtItems.map((item) => {
        const qty = Math.max(1, Math.round(item.quantity));
        const total = item.lineTotal ?? item.price * qty;
        const unit = qty > 0 ? total / qty : item.price;
        return {
          name: item.variantName ? `${item.name} (${item.variantName})` : item.name,
          quantity: qty,
          unitPrice: unit,
          totalPrice: total,
        };
      });

      const billingSnap = (coreRow.billingSnapshot as Record<string, unknown> | null) ?? null;
      const fallbackTotal =
        coreRow.grandTotal != null ? Number(coreRow.grandTotal) : null;
      const fallbackTip =
        coreRow.tipAmount != null ? Number(coreRow.tipAmount) : null;

      const html = buildCustomerOrderSummaryReceiptHtml({
        formattedOrderId: orderIdDisplay,
        orderDateIso,
        customerName,
        deliveryAddress: coreRow.deliveryAddress ?? null,
        restaurantName,
        restaurantAddress,
        restaurantFssai,
        riderName,
        paymentMethod: coreRow.paymentMethod ?? null,
        orderType: coreRow.orderType ?? null,
        items: receiptItems,
        billingSnapshot: billingSnap,
        fallbackTotal: Number.isFinite(fallbackTotal) ? fallbackTotal : null,
        fallbackTipAmount: Number.isFinite(fallbackTip) ? fallbackTip : null,
      });

      return reply.send({
        html,
        title: `Order Receipt — ${orderIdDisplay}`,
      });
    }
  );

  const alternateContactBodySchema = z.object({
    contactName: z.string().trim().min(1).max(120),
    contactPhone: z.string().trim().min(8).max(20),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof alternateContactBodySchema> }>(
    "/:id/alternate-contact",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: alternateContactBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            deliveryContactName: z.string().nullable(),
            deliveryContactPhone: z.string().nullable(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = alternateContactBodySchema.parse(req.body ?? {});
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
          orderId: ordersCore.orderId,
          orderType: ordersCore.orderType,
          currentStatus: ordersCore.currentStatus,
          status: ordersCore.status,
          checkoutMetadata: ordersCore.checkoutMetadata,
          deliveryAddress: ordersCore.deliveryAddress,
          deliveryInstructionsList: ordersCore.deliveryInstructionsList,
          alternateContactPhone: ordersCore.alternateContactPhone,
          deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
          deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
        })
        .from(ordersCore)
        .where(customerOrderRefWhere(customerPk, orderIdParam))
        .limit(1);
      if (!orderRow) return reply.status(404).send({ error: "Order not found" });
      const orderType = String(orderRow.orderType ?? "").trim().toLowerCase();
      if (orderType !== "food" && orderType !== "parcel") {
        return reply.status(400).send({
          error: "unsupported_order_type",
          message: "Contact update is only available for food and parcel orders.",
        });
      }

      const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
      if (!canCustomerUpdateAlternateContact(statusUpper)) {
        return reply.status(409).send({
          error: "alternate_contact_closed",
          message:
            orderType === "parcel"
              ? "Receiver contact can no longer be updated for this parcel."
              : "Alternate contact can no longer be updated for this order.",
        });
      }

      const normalizedPhone = normalizeOrderContactPhone(body.contactPhone);
      if (!normalizedPhone) {
        return reply.status(400).send({
          error: "invalid_phone",
          message: "Enter a valid 10-digit mobile number.",
        });
      }

      const contactName = body.contactName.trim();
      const now = new Date();

      // Parcel: change receiver (primary drop contact) until pickup — may update again.
      if (orderType === "parcel") {
        await db
          .update(ordersCore)
          .set({
            deliveryPrimaryContactName: contactName,
            deliveryPrimaryContactPhone: normalizedPhone,
            updatedAt: now,
          })
          .where(eq(ordersCore.id, orderRow.id));

        await db
          .update(ordersParcel)
          .set({
            receiverName: contactName,
            receiverMobile: normalizedPhone,
            updatedAt: now,
          })
          .where(eq(ordersParcel.orderId, orderRow.id));

        return {
          ok: true as const,
          deliveryContactName: contactName,
          deliveryContactPhone: normalizedPhone,
        };
      }

      // Food: one-time alternate contact (becomes effective delivery contact).
      if (orderRow.alternateContactPhone?.trim()) {
        return reply.status(409).send({
          error: "alternate_contact_already_set",
          message: "Alternate contact can only be added once for this order.",
        });
      }

      const orderIdText = orderRow.orderId?.trim() || orderIdParam;

      const [foodRow] = await db
        .select({
          customerName: ordersFood.customerName,
          customerPhone: ordersFood.customerPhone,
          deliveryInstructions: ordersFood.deliveryInstructions,
        })
        .from(ordersFood)
        .where(eq(ordersFood.orderId, orderRow.id))
        .limit(1);

      const deliveryDetails = await resolveOrderDeliveryDetails(db, {
        orderIdText,
        customerPk,
        checkoutMetadata: orderRow.checkoutMetadata,
        deliveryAddress: orderRow.deliveryAddress ?? null,
        foodCustomerName: foodRow?.customerName ?? null,
        foodCustomerPhone: foodRow?.customerPhone ?? null,
        foodDeliveryInstructions: foodRow?.deliveryInstructions ?? null,
        storedDeliveryInstructionsList: orderRow.deliveryInstructionsList,
      });

      const primaryName =
        orderRow.deliveryPrimaryContactName?.trim() ||
        deliveryDetails.deliveryContactName?.trim() ||
        null;
      const primaryPhone =
        orderRow.deliveryPrimaryContactPhone?.trim() ||
        deliveryDetails.deliveryContactPhone?.trim() ||
        null;

      await db
        .update(ordersCore)
        .set({
          alternateContactName: contactName,
          alternateContactPhone: normalizedPhone,
          alternateContactSetAt: now,
          deliveryPrimaryContactName: primaryName,
          deliveryPrimaryContactPhone: primaryPhone,
          updatedAt: now,
        })
        .where(eq(ordersCore.id, orderRow.id));

      await db
        .update(ordersFood)
        .set({
          customerName: contactName,
          customerPhone: normalizedPhone,
        })
        .where(eq(ordersFood.orderId, orderRow.id));

      return {
        ok: true as const,
        deliveryContactName: contactName,
        deliveryContactPhone: normalizedPhone,
      };
    }
  );

  const partnerChatMessageSchema = z.object({
    id: z.number(),
    senderType: z.enum(["CUSTOMER", "RIDER", "SYSTEM"]),
    body: z.string(),
    createdAt: z.string(),
    isMine: z.boolean(),
  });

  const partnerChatListResponseSchema = z.object({
    messages: z.array(partnerChatMessageSchema),
    chatClosed: z.boolean(),
  });

  const partnerChatSendBodySchema = z.object({
    body: z.string().trim().min(1).max(500),
  });

  const partnerChatUnreadResponseSchema = z.object({
    unreadCount: z.number().int().nonnegative(),
    chatClosed: z.boolean(),
  });

  app.get<{ Params: { id: string } }>(
    "/:id/partner-chat/unread",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: partnerChatUnreadResponseSchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      try {
        const { getOrderPartnerChatUnreadForCustomer } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await getOrderPartnerChatUnreadForCustomer(sub, orderIdParam);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        if (isMissingDbRelationError(e, "order_partner_chat_messages")) {
          return reply.send({ unreadCount: 0, chatClosed: false });
        }
        throw e;
      }
    }
  );

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    "/:id/partner-chat/messages",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ since: z.string().optional() }),
        response: {
          200: partnerChatListResponseSchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const since = (req.query as { since?: string }).since;
      try {
        const { listOrderPartnerChatForCustomer } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await listOrderPartnerChatForCustomer(sub, orderIdParam, since);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        if (err.statusCode === 409) {
          return reply.status(409).send({
            error: err.message,
            code: err.code,
          });
        }
        if (isMissingDbRelationError(e, "order_partner_chat_messages")) {
          req.log.error(e, "order_partner_chat_messages table missing — run 0307_order_partner_chat.sql");
          return reply.status(503).send({
            error: "Partner chat is not available on this server yet",
            code: "chat_unavailable",
          });
        }
        throw e;
      }
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof partnerChatSendBodySchema> }>(
    "/:id/partner-chat/messages",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: partnerChatSendBodySchema,
        response: {
          200: partnerChatMessageSchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const orderIdParam = (req.params as { id: string }).id;
      const body = partnerChatSendBodySchema.parse(req.body ?? {});
      try {
        const { sendOrderPartnerChatFromCustomer } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await sendOrderPartnerChatFromCustomer(sub, orderIdParam, body.body);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        if (err.statusCode === 400) {
          return reply.status(400).send({ error: err.message });
        }
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        if (err.statusCode === 409) {
          return reply.status(409).send({ error: err.message, code: err.code });
        }
        if (isMissingDbRelationError(e, "order_partner_chat_messages")) {
          req.log.error(e, "order_partner_chat_messages table missing — run 0307_order_partner_chat.sql");
          return reply.status(503).send({
            error: "Partner chat is not available on this server yet",
            code: "chat_unavailable",
          });
        }
        throw e;
      }
    }
  );

  const cancelFoodOrderBodySchema = z.object({
    reasonCode: z.string().min(1).max(120),
    reasonText: z.string().min(1).max(500),
  });

  app.post(
    "/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: cancelFoodOrderBodySchema,
        response: {
          200: z.object({ orderId: z.string(), status: z.string() }),
          400: z.object({ error: z.string() }),
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
      const { cancelFoodOrderForCustomer, resolveCustomerPkFromSub } = await import(
        "./food.order-cancel.service.js"
      );
      const customerPk = await resolveCustomerPkFromSub(sub);
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof cancelFoodOrderBodySchema>;
      try {
        return await cancelFoodOrderForCustomer({
          customerPk,
          orderRef: id,
          reasonCode: body.reasonCode,
          reasonText: body.reasonText,
        });
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        if (status >= 400 && status < 500) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (reply as any).status(status).send({ error: err.message || "Failed to cancel order" });
        }
        throw e;
      }
    }
  );
}
