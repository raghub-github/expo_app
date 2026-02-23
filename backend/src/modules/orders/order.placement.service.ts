/**
 * Order placement service: payment-first flow.
 * - createPending: validate cart + address, lock data in pending_orders.
 * - finalizeOrder: verify payment → single atomic transaction (orders_core + orders_core_items + addons + payments → update pending_orders → trigger emits order_events).
 * Order ID format: GM10000001, GM10000002, ... from order_id_seq.
 * All string/number values are sanitized before DB insert (no "—", undefined, NaN).
 */

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  pendingOrders,
  ordersCore,
  ordersCoreItems,
  ordersCoreItemAddons,
  ordersCorePayments,
} from "../../db/schema.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { verifyRazorpaySignature } from "../../services/payment/razorpayService.js";
import { normalizeOrderItems } from "./orderNormalizer.js";

const EM_DASH = "\u2014";

/** Strip placeholder chars from string (—, etc.) then trim. For addresses and any free text. */
function sanitizeStringForDb(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\u2014/g, "").replace(/\s*—\s*/g, "").trim();
  return t === "" ? null : t;
}

/** Convert invalid values to null for DB. Never insert placeholders. */
export function sanitizeOptional<T>(v: T): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.replace(/\u2014/g, "").trim();
    if (t === "") return null;
    return t as T;
  }
  if (typeof v === "number" && (Number.isNaN(v) || !Number.isFinite(v))) return null;
  return v;
}

/** Sanitize numeric for DB: return string fixed to 2 decimals or "0". */
export function sanitizeNumeric(value: number): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "0";
  return Math.max(0, value).toFixed(2);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

const PAYMENT_METHOD_MAP = ["upi", "card", "wallet", "online", "cod", "netbanking"] as const;
export function paymentMethodToEnum(method: string): "upi" | "card" | "wallet" | "online" | "cod" | "other" {
  const m = (method || "").toLowerCase();
  if (PAYMENT_METHOD_MAP.includes(m as (typeof PAYMENT_METHOD_MAP)[number])) return m as "upi" | "card" | "wallet" | "online" | "cod";
  return "online";
}

/** Pending order TTL: 30 minutes */
const PENDING_TTL_MS = 30 * 60 * 1000;

export type PendingOrderInput = {
  customerId: number;
  merchantId: string;
  merchantParentId?: number | null;
  items: Array<{
    menuItemId: string;
    itemName: string;
    quantity: number;
    basePrice: number;
    variantId?: string | null;
    variantName?: string | null;
    addons?: Array<{ addonId: string; addonName: string; addonPrice: number; quantity: number }>;
    itemSnapshot?: Record<string, unknown> | null;
  }>;
  addressId: number;
  paymentMethod: string;
  tipAmount?: number;
  donationAmount?: number;
  pickupAddressRaw?: string;
  pickupLat?: number;
  pickupLon?: number;
};

export type CreatePendingResult =
  | { ok: true; pendingId: string; amount: number; currency: string }
  | { ok: false; code: string; message: string };

export async function createPendingOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: PendingOrderInput
): Promise<CreatePendingResult> {
  const norm = normalizeOrderItems(input.items);
  if (!norm.ok) return norm;
  const items = norm.items;

  const { customerId, merchantId, addressId, paymentMethod, tipAmount = 0, donationAmount = 0 } = input;

  const itemTotal = items.reduce((s, i) => s + i.basePrice * i.quantity, 0);
  const addonTotal = items.reduce((s, i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return s + lineAddon;
  }, 0);
  const grandTotal = itemTotal + addonTotal + tipAmount + donationAmount;

  let merchantStoreId: number;
  let storeForOrder: Awaited<ReturnType<typeof getStoreByIdForOrder>> = null;
  const parsed = parseInt(String(merchantId).trim(), 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    merchantStoreId = parsed;
    storeForOrder = await getStoreByIdForOrder(merchantStoreId);
  } else {
    const store = await getStoreByStoreId(merchantId);
    if (!store) {
      return { ok: false, code: "INVALID_MERCHANT", message: "Store not found. Please try again from the restaurant page." };
    }
    merchantStoreId = Number(store.id);
    storeForOrder = {
      parentId: store.parent_id != null ? Number(store.parent_id) : null,
      fullAddress: store.full_address ?? null,
      latitude: store.latitude != null ? Number(store.latitude) : null,
      longitude: store.longitude != null ? Number(store.longitude) : null,
    };
  }

  const { customerAddresses } = await import("../../db/schema.js");
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
        eq(customerAddresses.id, addressId),
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt)
      )
    )
    .limit(1);

  if (!addrRow) {
    return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Address not found." };
  }

  const dropAddressRaw = [addrRow.addressLine1, addrRow.addressLine2, addrRow.city, addrRow.state, addrRow.postalCode]
    .filter(Boolean)
    .join(", ");
  const dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
  const dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;
  const pickupLat = input.pickupLat ?? storeForOrder?.latitude ?? dropLat;
  const pickupLon = input.pickupLon ?? storeForOrder?.longitude ?? dropLon;
  const distanceKm = haversineKm(pickupLat, pickupLon, dropLat, dropLon);
  const pickupAddressNormalized = sanitizeOptional((storeForOrder?.fullAddress ?? input.pickupAddressRaw ?? dropAddressRaw).trim() || null);

  const pendingId = `PEND-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);

  await db.insert(pendingOrders).values({
    pendingId,
    customerId,
    merchantStoreId,
    merchantParentId: storeForOrder?.parentId ?? null,
    itemsSnapshot: items as unknown as Record<string, unknown>, // already normalized
    addressIdUsed: addressId,
    paymentMethod,
    tipAmount: sanitizeNumeric(tipAmount),
    donationAmount: sanitizeNumeric(donationAmount),
    itemTotal: sanitizeNumeric(itemTotal),
    addonTotal: sanitizeNumeric(addonTotal),
    grandTotal: sanitizeNumeric(grandTotal),
    currency: "INR",
    deliveryAddress: sanitizeStringForDb(dropAddressRaw) ?? undefined,
    dropLat: String(dropLat),
    dropLon: String(dropLon),
    pickupAddressNormalized: pickupAddressNormalized ?? undefined,
    pickupLat: String(pickupLat),
    pickupLon: String(pickupLon),
    distanceKm: String(distanceKm),
    expiresAt,
  });

  return {
    ok: true,
    pendingId,
    amount: Math.round(grandTotal * 100),
    currency: "INR",
  };
}

export type FinalizeInput = {
  pendingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  customerId: number;
};

export type FinalizeResult =
  | { ok: true; orderId: string; status: string; totalAmount: number; createdAt: string }
  | { ok: false; code: string; message: string };

/** Idempotent: if this payment already finalized, returns existing order. */
export async function finalizeOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: FinalizeInput
): Promise<FinalizeResult> {
  const { pendingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, customerId } = input;

  const valid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!valid) {
    return { ok: false, code: "PAYMENT_NOT_VERIFIED", message: "Payment verification failed. Please try again." };
  }

  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(and(eq(pendingOrders.pendingId, pendingId), eq(pendingOrders.customerId, customerId)))
    .limit(1);

  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Session expired or invalid. Please restart checkout." };
  }

  if (pending.finalizedOrderId) {
    const [existing] = await db
      .select({ orderId: ordersCore.orderId, grandTotal: ordersCore.grandTotal, placedAt: ordersCore.placedAt })
      .from(ordersCore)
      .where(eq(ordersCore.orderId, pending.finalizedOrderId))
      .limit(1);
    if (existing?.orderId) {
      return {
        ok: true,
        orderId: existing.orderId,
        status: "PLACED",
        totalAmount: Number(existing.grandTotal ?? 0),
        createdAt: (existing.placedAt ?? new Date()).toISOString(),
      };
    }
  }

  if (new Date() > new Date(pending.expiresAt)) {
    return { ok: false, code: "PENDING_ORDER_EXPIRED", message: "Checkout session expired. Please try again." };
  }

  const norm = normalizeOrderItems(pending.itemsSnapshot);
  if (!norm.ok) {
    return { ok: false, code: norm.code, message: norm.message };
  }
  const items = norm.items;

  const paymentMethodEnum = paymentMethodToEnum(pending.paymentMethod);
  const pickupRaw = sanitizeStringForDb(pending.pickupAddressNormalized ?? undefined) ?? "";
  const dropRaw = sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? "";
  const pickupLat = pending.pickupLat != null ? String(pending.pickupLat) : "0";
  const pickupLon = pending.pickupLon != null ? String(pending.pickupLon) : "0";
  const dropLat = pending.dropLat != null ? String(pending.dropLat) : "0";
  const dropLon = pending.dropLon != null ? String(pending.dropLon) : "0";

  /** DB enum values for orders_core (must match PostgreSQL enums: lowercase) */
  const ORDER_TYPE_FOOD = "food" as const;
  const ORDER_SOURCE_INTERNAL = "internal" as const;
  const ORDER_STATUS_ASSIGNED = "assigned" as const;
  const PAYMENT_STATUS_COMPLETED = "completed" as const;

  let orderIdText: string | undefined;
  try {
    const result = await db.transaction(async (tx) => {
      const seqResult = await tx.execute(
        sql`SELECT ('GM' || nextval('order_id_seq'))::text as order_id`
      );
      const firstRow = Array.isArray(seqResult)
        ? seqResult[0]
        : (seqResult as { rows?: unknown[] })?.rows?.[0] ?? (seqResult as unknown[])?.[0];
      const orderIdText =
        firstRow != null && typeof firstRow === "object" && "order_id" in firstRow
          ? String((firstRow as { order_id: unknown }).order_id)
          : null;
      if (!orderIdText || !orderIdText.startsWith("GM")) {
        throw new Error(`Failed to generate order_id: got ${JSON.stringify(seqResult)}`);
      }

      await tx.insert(ordersCore).values({
        orderId: orderIdText,
        orderType: ORDER_TYPE_FOOD,
        orderSource: ORDER_SOURCE_INTERNAL,
        customerId: pending.customerId,
        merchantStoreId: pending.merchantStoreId,
        merchantParentId: pending.merchantParentId ?? undefined,
        status: ORDER_STATUS_ASSIGNED,
        currentStatus: "PLACED",
        itemTotal: pending.itemTotal,
        addonTotal: pending.addonTotal ?? "0",
        grandTotal: pending.grandTotal,
        tipAmount: pending.tipAmount ?? "0",
        placedAt: new Date(),
        pickupAddressRaw: pickupRaw || " ",
        pickupLat,
        pickupLon,
        dropAddressRaw: dropRaw || " ",
        dropLat,
        dropLon,
        deliveryAddress: sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? undefined,
        distanceKm: pending.distanceKm ?? undefined,
        paymentStatus: PAYMENT_STATUS_COMPLETED,
        paymentMethod: paymentMethodEnum,
      });

      const itemInserts = items.map((i) => {
        const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
        const lineTotal = i.basePrice * i.quantity + addonPerUnit * i.quantity;
        return {
          orderId: orderIdText,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          categoryName: null,
          vegNonveg: null,
          variantId: i.variantId != null ? i.variantId : undefined,
          variantName: sanitizeOptional(i.variantName ?? "") ?? undefined,
          quantity: i.quantity,
          basePrice: sanitizeNumeric(i.basePrice),
          addonPrice: sanitizeNumeric(addonPerUnit),
          totalPrice: sanitizeNumeric(lineTotal),
          itemSnapshot: i.itemSnapshot ?? undefined,
        };
      });

      const insertedItems = await tx.insert(ordersCoreItems).values(itemInserts).returning({ id: ordersCoreItems.id });
      for (let idx = 0; idx < items.length; idx++) {
        const row = items[idx]!;
        const addons = row.addons;
        if (addons.length === 0) continue;
        const orderItemId = insertedItems[idx]?.id;
        if (orderItemId == null) continue;
        await tx.insert(ordersCoreItemAddons).values(
          addons.map((ad) => ({
            orderItemId,
            addonId: ad.addonId > 0 ? ad.addonId : undefined,
            addonName: ad.addonName || undefined,
            addonPrice: sanitizeNumeric(ad.addonPrice),
            quantity: ad.quantity,
          }))
        );
      }

      await tx.insert(ordersCorePayments).values({
        orderId: orderIdText,
        paymentGateway: "razorpay",
        paymentMethod: paymentMethodEnum,
        transactionId: razorpayPaymentId,
        amount: pending.grandTotal,
        currency: pending.currency ?? "INR",
        paymentStatus: "PAID",
        gatewayResponse: { razorpayPaymentId, razorpayOrderId },
        paidAt: new Date(),
      });

      await tx
        .update(pendingOrders)
        .set({
          finalizedOrderId: orderIdText,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pendingId));

      return { orderIdText };
    });
    orderIdText = result.orderIdText;
  } catch (err: unknown) {
    const e = err as {
      code?: string;
      constraint?: string;
      message?: string;
      detail?: string;
      cause?: { code?: string; detail?: string; constraint?: string; message?: string };
    };
    const detail = e?.detail ?? e?.cause?.detail;
    const constraint = e?.constraint ?? e?.cause?.constraint;
    const pgCode = e?.code ?? (e?.cause as { code?: string })?.code;
    console.error("[API] finalizeOrder failed:", e?.message ?? err);
    if (pgCode) console.error("[API] finalizeOrder pgCode:", pgCode);
    if (detail) console.error("[API] finalizeOrder detail:", detail);
    if (constraint) console.error("[API] finalizeOrder constraint:", constraint);
    if (e?.cause && !detail) console.error("[API] finalizeOrder cause:", e.cause);
    return {
      ok: false,
      code: "ORDER_CREATION_FAILED",
      message: "Order could not be created. Please try again.",
    };
  }

  if (!orderIdText) {
    console.error("[API] finalizeOrder: transaction succeeded but orderIdText missing");
    return {
      ok: false,
      code: "ORDER_CREATION_FAILED",
      message: "Order could not be created. Please try again.",
    };
  }

  return {
    ok: true,
    orderId: orderIdText,
    status: "PLACED",
    totalAmount: Number(pending.grandTotal),
    createdAt: new Date().toISOString(),
  };
}
