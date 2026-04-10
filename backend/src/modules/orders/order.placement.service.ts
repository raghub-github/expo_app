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
import { getEnv } from "../../config/env.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { verifyRazorpaySignature } from "../../services/payment/razorpayService.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { normalizeOrderItems } from "./orderNormalizer.js";
import { getRoute } from "../distance/distance.service.js";

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

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toJson(v: unknown): string {
  return JSON.stringify(v ?? {}, (_, val) => (typeof val === "bigint" ? String(val) : val));
}

/**
 * Persist immutable billing/ledger artifacts for audit/reconstruction.
 * This is additive and runs in the same finalize transaction.
 */
async function persistOmsLedgerArtifacts(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    orderId: string;
    pendingId: string;
    pending: (typeof pendingOrders.$inferSelect);
    razorpayOrderId: string;
    razorpayPaymentId: string;
    paymentMethodEnum: "upi" | "card" | "wallet" | "online" | "cod" | "other";
  }
): Promise<void> {
  const { orderId, pendingId, pending, razorpayOrderId, razorpayPaymentId, paymentMethodEnum } = args;
  const versionNo = 1;
  const snap = (pending.billingSnapshot as Record<string, unknown> | null) ?? null;

  await tx.execute(sql`
    INSERT INTO order_version_snapshots (order_id, version_no, source, snapshot, ruleset_version)
    VALUES (
      ${orderId},
      ${versionNo},
      'finalize_order',
      ${toJson(snap ?? {
        item_total: pending.itemTotal,
        addon_total: pending.addonTotal,
        payable_total: pending.grandTotal,
      })}::jsonb,
      ${pending.billingRulesetVersion ?? null}
    )
    ON CONFLICT (order_id, version_no) DO NOTHING
  `);

  const charges: Record<string, unknown>[] = Array.isArray((snap as { charges?: unknown[] } | null)?.charges)
    ? (((snap as { charges?: unknown[] }).charges ?? []) as Record<string, unknown>[])
    : [];
  const discounts: Record<string, unknown>[] = Array.isArray((snap as { discounts?: unknown[] } | null)?.discounts)
    ? (((snap as { discounts?: unknown[] }).discounts ?? []) as Record<string, unknown>[])
    : [];
  const taxes: Record<string, unknown>[] = Array.isArray((snap as { taxes?: unknown[] } | null)?.taxes)
    ? (((snap as { taxes?: unknown[] }).taxes ?? []) as Record<string, unknown>[])
    : [];

  let lineNo = 0;
  for (const c of charges) {
    lineNo += 1;
    const row = c as Record<string, unknown>;
    const base = asNumber(row.base ?? row.amount ?? 0);
    const discount = asNumber(row.discount ?? 0);
    const tax = asNumber(row.tax ?? 0);
    const finalAmount = asNumber(row.amount ?? base - discount + tax);
    await tx.execute(sql`
      INSERT INTO order_charge_lines (
        order_id, version_no, line_no, charge_type, source_rule_id, source_slab_id, source_tax_config_id,
        base_amount, discount_amount, taxable_amount, tax_amount, final_amount, metadata
      )
      VALUES (
        ${orderId},
        ${versionNo},
        ${lineNo},
        ${String(row.chargeType ?? row.type ?? "charge")},
        ${row.ruleId != null ? Number(row.ruleId) : null},
        ${row.slabId != null ? Number(row.slabId) : null},
        ${row.taxConfigId != null ? Number(row.taxConfigId) : null},
        ${String(base)},
        ${String(discount)},
        ${String(Math.max(0, base - discount))},
        ${String(tax)},
        ${String(finalAmount)},
        ${toJson(row)}::jsonb
      )
      ON CONFLICT (order_id, version_no, line_no) DO NOTHING
    `);
  }

  let discountLineNo = 0;
  for (const d of discounts) {
    discountLineNo += 1;
    const row = d as Record<string, unknown>;
    const amount = Math.abs(asNumber(row.amount ?? 0));
    await tx.execute(sql`
      INSERT INTO order_discount_lines (
        order_id, version_no, line_no, discount_type, funding_type, applies_on, source_rule_id, source_discount_id, amount, metadata
      )
      VALUES (
        ${orderId},
        ${versionNo},
        ${discountLineNo},
        ${String(row.discountType ?? row.type ?? "discount")},
        ${String(row.fundingType ?? "platform")},
        ${row.appliesOn != null ? String(row.appliesOn) : null},
        ${row.ruleId != null ? Number(row.ruleId) : null},
        ${row.discountId != null ? Number(row.discountId) : null},
        ${String(amount)},
        ${toJson(row)}::jsonb
      )
      ON CONFLICT (order_id, version_no, line_no) DO NOTHING
    `);
  }

  let taxLineNo = 0;
  for (const t of taxes) {
    taxLineNo += 1;
    const row = t as Record<string, unknown>;
    const taxAmount = asNumber(row.amount ?? row.taxAmount ?? 0);
    const rate = asNumber(row.rate ?? row.taxRate ?? 0);
    const taxableBase = asNumber(row.base ?? row.taxableBase ?? 0);
    await tx.execute(sql`
      INSERT INTO order_tax_lines (
        order_id, version_no, line_no, tax_config_id, tax_group, applies_on_component,
        tax_rate_snapshot, taxable_base_amount, tax_amount, metadata
      )
      VALUES (
        ${orderId},
        ${versionNo},
        ${taxLineNo},
        ${row.taxConfigId != null ? Number(row.taxConfigId) : null},
        ${row.taxGroup != null ? String(row.taxGroup) : null},
        ${row.appliesOnComponent != null ? String(row.appliesOnComponent) : null},
        ${String(rate)},
        ${String(taxableBase)},
        ${String(taxAmount)},
        ${toJson(row)}::jsonb
      )
      ON CONFLICT (order_id, version_no, line_no) DO NOTHING
    `);
  }

  const itemTotal = asNumber(snap?.item_total ?? pending.itemTotal ?? 0);
  const addonTotal = asNumber(snap?.addon_total ?? pending.addonTotal ?? 0);
  const chargeTotal = charges.reduce((s, c) => s + asNumber((c as Record<string, unknown>).amount), 0);
  const discountTotal = discounts.reduce((s, d) => s + Math.abs(asNumber((d as Record<string, unknown>).amount)), 0);
  const taxTotal = taxes.reduce((s, t) => s + asNumber((t as Record<string, unknown>).amount ?? (t as Record<string, unknown>).taxAmount), 0);
  const tipTotal = asNumber(pending.tipAmount ?? 0);
  const donationTotal = asNumber(pending.donationAmount ?? 0);
  const payableTotal = asNumber(pending.grandTotal ?? 0);
  await tx.execute(sql`
    INSERT INTO order_bill_summary_versions (
      order_id, version_no, item_total, addon_total, charge_total, discount_total, tax_total,
      tip_total, donation_total, payable_total, metadata
    )
    VALUES (
      ${orderId},
      ${versionNo},
      ${String(itemTotal)},
      ${String(addonTotal)},
      ${String(chargeTotal)},
      ${String(discountTotal)},
      ${String(taxTotal)},
      ${String(tipTotal)},
      ${String(donationTotal)},
      ${String(payableTotal)},
      ${toJson({ pendingId, razorpayOrderId, razorpayPaymentId })}::jsonb
    )
    ON CONFLICT (order_id, version_no) DO NOTHING
  `);

  const paymentIntentId = `pi_${pendingId}`;
  await tx.execute(sql`
    INSERT INTO payment_intents (intent_id, order_id, idempotency_key, amount, currency, status, metadata)
    VALUES (
      ${paymentIntentId},
      ${orderId},
      ${`intent:${paymentIntentId}`},
      ${String(payableTotal)},
      ${pending.currency ?? "INR"},
      'succeeded',
      ${toJson({ source: "finalizeOrder" })}::jsonb
    )
    ON CONFLICT (intent_id) DO NOTHING
  `);

  const [pi] = await tx.execute(sql`
    SELECT id FROM payment_intents WHERE intent_id = ${paymentIntentId} LIMIT 1
  `) as unknown as Array<{ id: number }>;

  await tx.execute(sql`
    INSERT INTO payment_transactions (
      payment_intent_id, order_id, gateway, payment_mode, transaction_reference, status, amount, currency, idempotency_key, raw_response
    )
    VALUES (
      ${pi?.id ?? null},
      ${orderId},
      'razorpay',
      ${paymentMethodEnum},
      ${razorpayPaymentId},
      'succeeded',
      ${String(payableTotal)},
      ${pending.currency ?? "INR"},
      ${`payment:${razorpayPaymentId}`},
      ${toJson({ razorpayPaymentId, razorpayOrderId })}::jsonb
    )
    ON CONFLICT (gateway, transaction_reference) DO NOTHING
  `);

  await tx.execute(sql`
    INSERT INTO ledger_accounts (account_code, account_name, account_type, owner_entity_type, owner_entity_id)
    VALUES
      ('AR_CUSTOMER', 'Customer Receivable', 'asset', 'customer', NULL),
      ('REV_PLATFORM', 'Platform Revenue', 'income', 'platform', NULL)
    ON CONFLICT (account_code) DO NOTHING
  `);

  const journalRef = `jrnl_${orderId}_finalize`;
  await tx.execute(sql`
    INSERT INTO ledger_journals (journal_ref, order_id, event_type, status, currency, metadata)
    VALUES (
      ${journalRef},
      ${orderId},
      'order_finalized_payment',
      'posted',
      ${pending.currency ?? "INR"},
      ${toJson({ pendingId, razorpayPaymentId })}::jsonb
    )
    ON CONFLICT (journal_ref) DO NOTHING
  `);

  const [journal] = await tx.execute(sql`
    SELECT id FROM ledger_journals WHERE journal_ref = ${journalRef} LIMIT 1
  `) as unknown as Array<{ id: number }>;

  const [ar] = await tx.execute(sql`SELECT id FROM ledger_accounts WHERE account_code = 'AR_CUSTOMER' LIMIT 1`) as unknown as Array<{ id: number }>;
  const [rev] = await tx.execute(sql`SELECT id FROM ledger_accounts WHERE account_code = 'REV_PLATFORM' LIMIT 1`) as unknown as Array<{ id: number }>;

  if (journal?.id && ar?.id && rev?.id) {
    await tx.execute(sql`
      INSERT INTO ledger_entries (journal_id, order_id, account_id, direction, amount, entry_no, metadata)
      VALUES
        (${journal.id}, ${orderId}, ${ar.id}, 'debit', ${String(payableTotal)}, 1, ${toJson({ source: "finalizeOrder" })}::jsonb),
        (${journal.id}, ${orderId}, ${rev.id}, 'credit', ${String(payableTotal)}, 2, ${toJson({ source: "finalizeOrder" })}::jsonb)
      ON CONFLICT (journal_id, entry_no) DO NOTHING
    `);
    await tx.execute(sql`
      INSERT INTO ledger_references (journal_id, reference_type, reference_id, metadata)
      VALUES
        (${journal.id}, 'order_id', ${orderId}, '{}'::jsonb),
        (${journal.id}, 'payment_txn', ${razorpayPaymentId}, '{}'::jsonb)
      ON CONFLICT (journal_id, reference_type, reference_id) DO NOTHING
    `);
  }
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
  couponCode?: string | null;
  subscriptionOptIn?: boolean;
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

  const {
    customerId,
    merchantId,
    addressId,
    paymentMethod,
    tipAmount = 0,
    donationAmount = 0,
    subscriptionOptIn = false,
  } = input;

  const itemTotal = items.reduce((s, i) => s + i.basePrice * i.quantity, 0);
  const addonTotal = items.reduce((s, i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return s + lineAddon;
  }, 0);

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
      is_accepting_orders: store.is_accepting_orders === true,
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

  let grandTotal = itemTotal + addonTotal + tipAmount + donationAmount;
  let billingSnapshot: Record<string, unknown> | null = null;
  let billingRulesetVersion: number | null = null;
  const couponStored = input.couponCode?.trim() || null;

  if (getEnv().BILLING_RULES_ENABLED) {
    const billRes = await computeBillForOrder(db, {
      customerId,
      merchantId: input.merchantId,
      items,
      addressId: input.addressId,
      tipAmount,
      donationAmount,
      couponCode: couponStored,
      pickupLat: input.pickupLat,
      pickupLon: input.pickupLon,
      subscriptionOptIn,
    });
    if (!billRes.ok) {
      return { ok: false, code: billRes.code, message: billRes.message };
    }
    grandTotal = billRes.billing.final_amount;
    billingSnapshot = billRes.snapshot;
    billingRulesetVersion = billRes.billing.ruleset_version;
  }

  const dropAddressRaw = [addrRow.addressLine1, addrRow.addressLine2, addrRow.city, addrRow.state, addrRow.postalCode]
    .filter(Boolean)
    .join(", ");
  const dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
  const dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;
  const pickupLat = input.pickupLat ?? storeForOrder?.latitude ?? dropLat;
  const pickupLon = input.pickupLon ?? storeForOrder?.longitude ?? dropLon;

  // Canonical distance: route-based between pickup (store) and selected drop address.
  // Fallback to Haversine only if routing engine fails.
  let distanceKm = 0;
  try {
    const env = getEnv();
    const route = await getRoute({
      origin: { lat: pickupLat, lng: pickupLon },
      destination: { lat: dropLat, lng: dropLon },
      profile: "driving",
      mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
      osrmBaseUrl: env.OSRM_BASE_URL || undefined,
    });
    distanceKm = route.distanceKm;
  } catch {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(dropLat - pickupLat);
    const dLon = toRad(dropLon - pickupLon);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(pickupLat)) * Math.cos(toRad(dropLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distanceKm = Math.round(R * c * 100) / 100;
  }
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
    billingSnapshot: billingSnapshot ?? undefined,
    billingRulesetVersion: billingRulesetVersion ?? undefined,
    couponCode: couponStored ?? undefined,
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

      if (getEnv().OMS_LEDGER_SHADOW_WRITE) {
        await persistOmsLedgerArtifacts(tx as unknown as PostgresJsDatabase<Record<string, unknown>>, {
          orderId: orderIdText,
          pendingId,
          pending,
          razorpayOrderId,
          razorpayPaymentId,
          paymentMethodEnum,
        });
      }

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
