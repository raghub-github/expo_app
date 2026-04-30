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
  ordersFood,
  orderEvents,
  paymentEvents,
} from "../../db/schema.js";
import { enqueuePlacementNotifications } from "./orderNotifications.js";
import { getEnv } from "../../config/env.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import {
  verifyRazorpayPaymentDetails,
  getPaymentDetails,
  getOrderPayments,
  createRazorpayRefund,
} from "../../services/payment/razorpayService.js";
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
/**
 * After payment starts we wait this long for a captured confirmation (either
 * synchronous finalize or asynchronous webhook). Past this point, the
 * reconciler auto-refunds any late-captured payment and fails the pending
 * order — the customer has almost certainly reordered elsewhere by then.
 *
 * Defaults to 10 minutes; configurable via PAYMENT_CONFIRM_WINDOW_MS.
 */
function getPaymentConfirmWindowMs(): number {
  try {
    return getEnv().PAYMENT_CONFIRM_WINDOW_MS;
  } catch {
    // Env not loaded (tests): fall back to a deterministic value.
    return 10 * 60_000;
  }
}

/**
 * What do we do when a Razorpay payment captures AFTER the TTL already
 * expired? Two sane options:
 *   - "refund" (default): customer likely reordered elsewhere — return money
 *     and mark pending as refunded. This is the policy for food orders.
 *   - "finalize": place the order anyway (only safe if merchants can ingest
 *     late orders gracefully).
 */
function getLateCapturePolicy(): "refund" | "finalize" {
  try {
    return getEnv().PAYMENT_LATE_CAPTURE_POLICY;
  } catch {
    return "refund";
  }
}

const PENDING_PAYMENT_STATES = {
  CREATED: "created",
  PENDING_CONFIRMATION: "pending_confirmation",
  PAID: "paid",
  FINALIZED: "finalized",
  FAILED: "failed",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
} as const;
export { PENDING_PAYMENT_STATES };

/**
 * Append-only audit log helper. Every meaningful state transition on a
 * pending order (payment started, webhook received, reconciler swept, refund
 * issued, …) writes one row. Never throws — logging must not break the flow.
 */
export async function logPaymentEvent(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    pendingId?: string | null;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
    orderId?: string | null;
    eventType: string;
    source: "api" | "webhook" | "reconciler" | "refund";
    prevState?: string | null;
    newState?: string | null;
    amountPaise?: number | null;
    currency?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await db.insert(paymentEvents).values({
      pendingId: args.pendingId ?? null,
      razorpayOrderId: args.razorpayOrderId ?? null,
      razorpayPaymentId: args.razorpayPaymentId ?? null,
      orderId: args.orderId ?? null,
      eventType: args.eventType,
      source: args.source,
      prevState: args.prevState ?? null,
      newState: args.newState ?? null,
      amountPaise: args.amountPaise ?? null,
      currency: args.currency ?? null,
      failureCode: args.failureCode ?? null,
      failureMessage: args.failureMessage ?? null,
      payload: (args.payload ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    // Swallow — audit logging must never block the main flow. Log to console
    // so ops can see storage-layer problems.
    // eslint-disable-next-line no-console
    console.error("[payment_events] insert failed:", err);
  }
}

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
  checkoutMetadata?: Record<string, unknown>;
  /**
   * Optional idempotency key. When provided, a second call from the same customer
   * with the same key returns the existing pendingId (prevents duplicate pending
   * orders on double-tap / retry). Generated client-side from the cart signature.
   */
  idempotencyKey?: string | null;
};

export type CreatePendingResult =
  | { ok: true; pendingId: string; amount: number; currency: string }
  | { ok: false; code: string; message: string };

export async function createPendingOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: PendingOrderInput
): Promise<CreatePendingResult> {
  const env = getEnv();
  if (env.NODE_ENV === "production" && !env.BILLING_RULES_ENABLED) {
    console.warn(
      "[orders] BILLING_RULES_ENABLED=false in production: payable totals omit delivery, platform, packaging, and configured taxes unless billing is enabled and seeded."
    );
  }

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

  const idempotencyKey = (input.idempotencyKey ?? "").trim() || null;

  // Idempotency: if a live (non-finalized, non-failed) pending row already exists
  // for this (customer, idempotency_key) pair, return it instead of creating a
  // new one. A finalized row also short-circuits: the caller should use the same
  // pending to hit /finalize.
  if (idempotencyKey) {
    const [existing] = await db
      .select({
        pendingId: pendingOrders.pendingId,
        grandTotal: pendingOrders.grandTotal,
        currency: pendingOrders.currency,
        paymentState: pendingOrders.paymentState,
        expiresAt: pendingOrders.expiresAt,
        finalizedOrderId: pendingOrders.finalizedOrderId,
      })
      .from(pendingOrders)
      .where(
        and(
          eq(pendingOrders.customerId, customerId),
          eq(pendingOrders.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    if (existing?.pendingId) {
      const expired = existing.expiresAt ? new Date() > new Date(existing.expiresAt) : false;
      const dead =
        existing.paymentState === PENDING_PAYMENT_STATES.FAILED ||
        existing.paymentState === PENDING_PAYMENT_STATES.REFUNDED ||
        existing.paymentState === PENDING_PAYMENT_STATES.REFUND_PENDING;
      // Only reuse if the pending is still actionable. If it's dead or expired and
      // not finalized, we fall through and create a new pending row (but the old
      // key still exists -> we'll clear it by nulling the stale row's key first).
      if (!dead && (!expired || existing.finalizedOrderId)) {
        return {
          ok: true,
          pendingId: existing.pendingId,
          amount: Math.round(Number(existing.grandTotal ?? 0) * 100),
          currency: String(existing.currency ?? "INR"),
        };
      }
      // Free the key so the new pending row can claim it.
      await db
        .update(pendingOrders)
        .set({ idempotencyKey: null, updatedAt: new Date() })
        .where(eq(pendingOrders.pendingId, existing.pendingId));
    }
  }

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

  if (env.BILLING_RULES_ENABLED) {
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
  if (!Number.isFinite(dropLat) || !Number.isFinite(dropLon) || dropLat === 0 || dropLon === 0) {
    return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Selected address has invalid coordinates. Please edit the address and select the pin location." };
  }
  const pickupLat = input.pickupLat ?? storeForOrder?.latitude ?? dropLat;
  const pickupLon = input.pickupLon ?? storeForOrder?.longitude ?? dropLon;
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLon) || pickupLat === 0 || pickupLon === 0) {
    return { ok: false, code: "INVALID_MERCHANT", message: "Store location is missing or invalid. Please try another store." };
  }

  // Canonical distance: route-based between pickup (store) and selected drop address.
  // Fallback to Haversine only if routing engine fails.
  let distanceKm = 0;
  try {
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

  try {
    await db.insert(pendingOrders).values({
      pendingId,
      customerId,
      merchantStoreId,
      merchantParentId: storeForOrder?.parentId ?? null,
      itemsSnapshot: items as unknown as Record<string, unknown>,
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
      checkoutMetadata: input.checkoutMetadata ?? undefined,
      paymentState: PENDING_PAYMENT_STATES.CREATED,
      expiresAt,
      idempotencyKey: idempotencyKey ?? undefined,
    });
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const pgCode = e?.code ?? e?.cause?.code;
    const constraint = e?.constraint ?? e?.cause?.constraint;
    // Unique violation on (customer_id, idempotency_key) partial index: another
    // concurrent request beat us. Return the winner.
    if (pgCode === "23505" && idempotencyKey && constraint?.includes("idem")) {
      const [winner] = await db
        .select({ pendingId: pendingOrders.pendingId, grandTotal: pendingOrders.grandTotal, currency: pendingOrders.currency })
        .from(pendingOrders)
        .where(and(eq(pendingOrders.customerId, customerId), eq(pendingOrders.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (winner?.pendingId) {
        return {
          ok: true,
          pendingId: winner.pendingId,
          amount: Math.round(Number(winner.grandTotal ?? 0) * 100),
          currency: String(winner.currency ?? "INR"),
        };
      }
    }
    throw err;
  }

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

export type PendingOrderStatusResult =
  | {
      ok: true;
      pendingId: string;
      paymentState: string;
      finalized: boolean;
      orderId: string | null;
      refundStatus: string | null;
      paymentConfirmBy: string | null;
      message?: string | null;
    }
  | { ok: false; code: string; message: string };

function pendingFailureMessage(pending: typeof pendingOrders.$inferSelect): string | null {
  return pending.paymentFailureMessage ?? null;
}

async function loadFinalizedOrderById(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string
): Promise<{ orderId: string; grandTotal: unknown; placedAt: Date | null } | null> {
  const [existing] = await db
    .select({ orderId: ordersCore.orderId, grandTotal: ordersCore.grandTotal, placedAt: ordersCore.placedAt })
    .from(ordersCore)
    .where(eq(ordersCore.orderId, orderId))
    .limit(1);
  if (!existing?.orderId) return null;
  return { orderId: existing.orderId, grandTotal: existing.grandTotal, placedAt: existing.placedAt };
}

async function loadFinalizedOrderByPaymentTxn(
  db: PostgresJsDatabase<Record<string, unknown>>,
  razorpayPaymentId: string
): Promise<{ orderId: string; grandTotal: number; placedAt: string } | null> {
  const rows = await db
    .select({
      orderId: ordersCorePayments.orderId,
      amount: ordersCorePayments.amount,
      paidAt: ordersCorePayments.paidAt,
    })
    .from(ordersCorePayments)
    .where(eq(ordersCorePayments.transactionId, razorpayPaymentId))
    .limit(1);
  const row = rows[0];
  if (!row?.orderId) return null;
  return {
    orderId: row.orderId,
    grandTotal: Number(row.amount ?? 0),
    placedAt: (row.paidAt ?? new Date()).toISOString(),
  };
}

export async function markPendingOrderPaymentStarted(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: { pendingId: string; razorpayOrderId: string }
): Promise<void> {
  const now = new Date();
  const confirmBy = new Date(now.getTime() + getPaymentConfirmWindowMs());
  // Capture prior state so the audit row records the transition accurately.
  const [prev] = await db
    .select({ state: pendingOrders.paymentState, grandTotal: pendingOrders.grandTotal, currency: pendingOrders.currency })
    .from(pendingOrders)
    .where(eq(pendingOrders.pendingId, args.pendingId))
    .limit(1);
  await db
    .update(pendingOrders)
    .set({
      razorpayOrderId: args.razorpayOrderId,
      paymentState: PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
      paymentStartedAt: now,
      paymentConfirmBy: confirmBy,
      updatedAt: now,
    })
    .where(eq(pendingOrders.pendingId, args.pendingId));
  await logPaymentEvent(db, {
    pendingId: args.pendingId,
    razorpayOrderId: args.razorpayOrderId,
    eventType: "PAYMENT_STARTED",
    source: "api",
    prevState: prev?.state ?? null,
    newState: PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
    amountPaise: prev?.grandTotal != null ? Math.round(Number(prev.grandTotal) * 100) : null,
    currency: prev?.currency ?? "INR",
    payload: { confirmBy: confirmBy.toISOString() },
  });
}

export async function getPendingOrderStatus(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: { pendingId: string; customerId: number }
): Promise<PendingOrderStatusResult> {
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(and(eq(pendingOrders.pendingId, args.pendingId), eq(pendingOrders.customerId, args.customerId)))
    .limit(1);
  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Pending order not found." };
  }
  return {
    ok: true,
    pendingId: pending.pendingId,
    paymentState: pending.paymentState ?? PENDING_PAYMENT_STATES.CREATED,
    finalized: Boolean(pending.finalizedOrderId),
    orderId: pending.finalizedOrderId ?? null,
    refundStatus: pending.refundStatus ?? null,
    paymentConfirmBy: pending.paymentConfirmBy?.toISOString?.() ?? null,
    message: pendingFailureMessage(pending),
  };
}

async function finalizeVerifiedPendingOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    pendingId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    paymentMethod: string;
    gatewayPayload?: Record<string, unknown> | null;
  }
): Promise<FinalizeResult> {
  const existingByPayment = await loadFinalizedOrderByPaymentTxn(db, args.razorpayPaymentId);
  if (existingByPayment?.orderId) {
    return {
      ok: true,
      orderId: existingByPayment.orderId,
      status: "PLACED",
      totalAmount: existingByPayment.grandTotal,
      createdAt: existingByPayment.placedAt,
    };
  }

  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.pendingId, args.pendingId))
    .limit(1);

  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Session expired or invalid. Please restart checkout." };
  }

  if (pending.finalizedOrderId) {
    const existing = await loadFinalizedOrderById(db, pending.finalizedOrderId);
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
  const pickupRaw = sanitizeStringForDb(pending.pickupAddressNormalized ?? undefined) ?? "";
  const dropRaw = sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? "";
  const pickupLat = pending.pickupLat != null ? String(pending.pickupLat) : "0";
  const pickupLon = pending.pickupLon != null ? String(pending.pickupLon) : "0";
  const dropLat = pending.dropLat != null ? String(pending.dropLat) : "0";
  const dropLon = pending.dropLon != null ? String(pending.dropLon) : "0";
  const paymentMethodEnum = paymentMethodToEnum(args.paymentMethod);

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
      const generatedOrderId =
        firstRow != null && typeof firstRow === "object" && "order_id" in firstRow
          ? String((firstRow as { order_id: unknown }).order_id)
          : null;
      if (!generatedOrderId || !generatedOrderId.startsWith("GM")) {
        throw new Error(`Failed to generate order_id: got ${JSON.stringify(seqResult)}`);
      }

      await tx.insert(ordersCore).values({
        orderId: generatedOrderId,
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
        donationAmount: pending.donationAmount ?? "0",
        placedAt: new Date(),
        pickupAddressRaw: pickupRaw || " ",
        pickupAddressNormalized: pickupRaw || undefined,
        pickupLat,
        pickupLon,
        dropAddressRaw: dropRaw || " ",
        dropAddressNormalized: dropRaw || undefined,
        dropLat,
        dropLon,
        deliveryAddress: sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? undefined,
        distanceKm: pending.distanceKm ?? undefined,
        paymentStatus: PAYMENT_STATUS_COMPLETED,
        paymentMethod: paymentMethodEnum,
        items: items as unknown as Record<string, unknown>,
        checkoutMetadata: pending.checkoutMetadata ?? undefined,
        billingSnapshot: pending.billingSnapshot ?? undefined,
        billingRulesetVersion: pending.billingRulesetVersion ?? undefined,
      });

      const itemInserts = items.map((i) => {
        const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
        const lineTotal = i.basePrice * i.quantity + addonPerUnit * i.quantity;
        return {
          orderId: generatedOrderId,
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
        if (row.addons.length === 0) continue;
        const orderItemId = insertedItems[idx]?.id;
        if (orderItemId == null) continue;
        await tx.insert(ordersCoreItemAddons).values(
          row.addons.map((ad) => ({
            orderItemId,
            addonId: ad.addonId > 0 ? ad.addonId : undefined,
            addonName: ad.addonName || undefined,
            addonPrice: sanitizeNumeric(ad.addonPrice),
            quantity: ad.quantity,
          }))
        );
      }

      await tx.insert(ordersCorePayments).values({
        orderId: generatedOrderId,
        paymentGateway: "razorpay",
        paymentMethod: paymentMethodEnum,
        transactionId: args.razorpayPaymentId,
        amount: pending.grandTotal,
        currency: pending.currency ?? "INR",
        paymentStatus: "PAID",
        gatewayResponse: args.gatewayPayload ?? { razorpayPaymentId: args.razorpayPaymentId, razorpayOrderId: args.razorpayOrderId },
        paidAt: new Date(),
      });

      await tx
        .update(pendingOrders)
        .set({
          finalizedOrderId: generatedOrderId,
          finalizedAt: new Date(),
          updatedAt: new Date(),
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          paymentState: PENDING_PAYMENT_STATES.FINALIZED,
          paymentVerifiedAt: new Date(),
          lastGatewayPayload: args.gatewayPayload ?? undefined,
        })
        .where(eq(pendingOrders.pendingId, args.pendingId));

      if (getEnv().OMS_LEDGER_SHADOW_WRITE) {
        await persistOmsLedgerArtifacts(tx as unknown as PostgresJsDatabase<Record<string, unknown>>, {
          orderId: generatedOrderId,
          pendingId: args.pendingId,
          pending,
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          paymentMethodEnum,
        });
      }

      await tx
        .update(ordersFood)
        .set({
          coreOrderId: generatedOrderId,
          merchantStoreId: pending.merchantStoreId ?? undefined,
          merchantParentId: pending.merchantParentId ?? undefined,
          customerId: pending.customerId ?? undefined,
          foodItemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
          foodItemsTotalValue: pending.itemTotal ?? undefined,
          deliveryInstructions:
            pending.checkoutMetadata &&
            typeof pending.checkoutMetadata === "object" &&
            "deliveryInstructions" in (pending.checkoutMetadata as Record<string, unknown>)
              ? String((pending.checkoutMetadata as Record<string, unknown>).deliveryInstructions ?? "")
              : undefined,
          updatedAt: new Date(),
        })
        .where(eq(ordersFood.coreOrderId, generatedOrderId));

      // Explicit ORDER_FINALIZED event (DB trigger emits PLACED on insert; this
      // complements it with payment-verified metadata so the timeline reads:
      //   PLACED -> FINALIZED -> CONFIRMED -> PREPARING -> ...
      await tx.insert(orderEvents).values({
        orderId: generatedOrderId,
        orderSource: "orders_core",
        eventType: "ORDER_FINALIZED",
        fromStatus: "PLACED",
        toStatus: "PLACED",
        payload: {
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          paymentMethod: paymentMethodEnum,
          grandTotal: Number(pending.grandTotal ?? 0),
          pendingId: args.pendingId,
        },
        actorType: "system",
      });

      // Outbox: notify merchant / rider dispatch / customer. Atomic with placement.
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      await enqueuePlacementNotifications(tx as unknown as PostgresJsDatabase<Record<string, unknown>>, {
        orderId: generatedOrderId,
        customerId: pending.customerId ?? null,
        merchantStoreId: pending.merchantStoreId ?? null,
        merchantParentId: pending.merchantParentId ?? null,
        grandTotal: Number(pending.grandTotal ?? 0),
        itemCount,
        orderCode: generatedOrderId,
        summary: `${itemCount} item${itemCount === 1 ? "" : "s"} \u2022 \u20B9${Number(pending.grandTotal ?? 0).toFixed(2)}`,
      });

      return { orderIdText: generatedOrderId };
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
    console.error("[API] finalizeVerifiedPendingOrder failed:", e?.message ?? err);
    if (pgCode) console.error("[API] finalizeVerifiedPendingOrder pgCode:", pgCode);
    if (detail) console.error("[API] finalizeVerifiedPendingOrder detail:", detail);
    if (constraint) console.error("[API] finalizeVerifiedPendingOrder constraint:", constraint);
    return {
      ok: false,
      code: "ORDER_CREATION_FAILED",
      message: "Order could not be created. Please try again.",
    };
  }

  if (!orderIdText) {
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

/** Idempotent: if this payment already finalized, returns existing order. */
export async function finalizeOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: FinalizeInput
): Promise<FinalizeResult> {
  const { pendingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, customerId } = input;
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(and(eq(pendingOrders.pendingId, pendingId), eq(pendingOrders.customerId, customerId)))
    .limit(1);
  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Session expired or invalid. Please restart checkout." };
  }
  const expectedAmountPaise = Math.round(Number(pending.grandTotal ?? 0) * 100);
  const paymentCheck = await verifyRazorpayPaymentDetails(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    expectedAmountPaise,
    String(pending.currency ?? "INR")
  );
  if (!paymentCheck.ok) {
    // If Razorpay hasn't marked the payment as captured yet OR we can't reach Razorpay to verify,
    // do NOT fail the pending order. Keep it in pending_confirmation so webhook/reconciler can
    // finalize it shortly once gateway state is visible again.
    if (paymentCheck.code === "PAYMENT_PENDING_CONFIRMATION" || paymentCheck.code === "PAYMENT_VERIFICATION_FAILED") {
      await db
        .update(pendingOrders)
        .set({
          razorpayOrderId,
          razorpayPaymentId,
          paymentState: PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
          paymentFailureCode: paymentCheck.code,
          paymentFailureMessage: paymentCheck.message,
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pendingId));
      return paymentCheck;
    }
    await db
      .update(pendingOrders)
      .set({
        paymentState: PENDING_PAYMENT_STATES.FAILED,
        paymentFailureCode: paymentCheck.code,
        paymentFailureMessage: paymentCheck.message,
        updatedAt: new Date(),
      })
      .where(eq(pendingOrders.pendingId, pendingId));
    return paymentCheck;
  }
  await db
    .update(pendingOrders)
    .set({
      razorpayOrderId,
      razorpayPaymentId,
      paymentState: PENDING_PAYMENT_STATES.PAID,
      paymentVerifiedAt: new Date(),
      lastGatewayPayload: {
        verifiedBy: "client_finalize",
        razorpayOrderId,
        razorpayPaymentId,
      },
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pendingId));
  return finalizeVerifiedPendingOrder(db, {
    pendingId,
    razorpayOrderId,
    razorpayPaymentId,
    paymentMethod: paymentCheck.paymentMethod,
    gatewayPayload: {
      verifiedBy: "client_finalize",
      razorpayOrderId,
      razorpayPaymentId,
    },
  });
}

export async function finalizePendingOrderFromWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    paymentMethod?: string | null;
    gatewayPayload?: Record<string, unknown> | null;
  }
): Promise<FinalizeResult> {
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayOrderId, args.razorpayOrderId))
    .limit(1);
  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Pending order not found for payment." };
  }
  await db
    .update(pendingOrders)
    .set({
      razorpayPaymentId: args.razorpayPaymentId,
      paymentState: PENDING_PAYMENT_STATES.PAID,
      paymentVerifiedAt: new Date(),
      lastGatewayPayload: args.gatewayPayload ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pending.pendingId));
  return finalizeVerifiedPendingOrder(db, {
    pendingId: pending.pendingId,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    paymentMethod: args.paymentMethod ?? pending.paymentMethod,
    gatewayPayload: args.gatewayPayload,
  });
}

async function refundPendingPayment(
  db: PostgresJsDatabase<Record<string, unknown>>,
  pending: typeof pendingOrders.$inferSelect,
  args: { paymentId: string; reason: string; notes?: Record<string, string>; failureMessage?: string; source?: "reconciler" | "refund" | "webhook" }
): Promise<void> {
  const amountPaise = Math.round(Number(pending.grandTotal ?? 0) * 100);
  const failureMessage =
    args.failureMessage ??
    `Payment was not confirmed within ${Math.round(getPaymentConfirmWindowMs() / 60_000)} minutes. Refund initiated.`;
  const source = args.source ?? "reconciler";
  try {
    const refund = await createRazorpayRefund({
      paymentId: args.paymentId,
      amountPaise,
      notes: {
        pendingId: pending.pendingId,
        reason: args.reason,
        ...(args.notes ?? {}),
      },
    });
    const refundId = String((refund as { id?: string }).id ?? "");
    await db
      .update(pendingOrders)
      .set({
        // Razorpay's `/refund` call returns immediately with status="processed"
        // or "pending" depending on the speed. We pessimistically mark as
        // refund_pending and let the `refund.processed` webhook flip it to
        // refunded (belt and braces; the sync response often already says
        // processed for normal speed refunds on live accounts).
        paymentState: PENDING_PAYMENT_STATES.REFUND_PENDING,
        refundStatus: String((refund as { status?: string }).status ?? "refund_pending"),
        refundReference: refundId,
        refundInitiatedAt: new Date(),
        paymentFailureCode: "PAYMENT_CONFIRMATION_TIMEOUT",
        paymentFailureMessage: failureMessage,
        updatedAt: new Date(),
      })
      .where(eq(pendingOrders.pendingId, pending.pendingId));
    await logPaymentEvent(db, {
      pendingId: pending.pendingId,
      razorpayOrderId: pending.razorpayOrderId,
      razorpayPaymentId: args.paymentId,
      eventType: "REFUND_INITIATED",
      source,
      prevState: pending.paymentState,
      newState: PENDING_PAYMENT_STATES.REFUND_PENDING,
      amountPaise,
      currency: pending.currency ?? "INR",
      failureCode: "PAYMENT_CONFIRMATION_TIMEOUT",
      failureMessage,
      payload: { refundId, reason: args.reason, refund },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Refund failed";
    await db
      .update(pendingOrders)
      .set({
        paymentState: PENDING_PAYMENT_STATES.REFUND_PENDING,
        refundStatus: "refund_failed",
        refundInitiatedAt: new Date(),
        paymentFailureCode: "REFUND_FAILED",
        paymentFailureMessage: msg,
        updatedAt: new Date(),
      })
      .where(eq(pendingOrders.pendingId, pending.pendingId));
    await logPaymentEvent(db, {
      pendingId: pending.pendingId,
      razorpayOrderId: pending.razorpayOrderId,
      razorpayPaymentId: args.paymentId,
      eventType: "REFUND_FAILED",
      source,
      prevState: pending.paymentState,
      newState: PENDING_PAYMENT_STATES.REFUND_PENDING,
      amountPaise,
      currency: pending.currency ?? "INR",
      failureCode: "REFUND_FAILED",
      failureMessage: msg,
      payload: { reason: args.reason },
    });
  }
}

/**
 * Webhook-driven helper: Razorpay fired `payment.failed`. We can mark the
 * pending order failed immediately without waiting for the reconciler TTL,
 * which lets the customer app flip to the "payment failed" screen within
 * seconds instead of minutes.
 *
 * Idempotent: if the pending is already in a terminal state (finalized /
 * refunded / failed) we just log and return.
 */
export async function markPendingOrderFailedFromWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    razorpayOrderId: string;
    razorpayPaymentId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    gatewayPayload?: Record<string, unknown> | null;
  }
): Promise<{ ok: true; pendingId: string } | { ok: false; code: string }> {
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayOrderId, args.razorpayOrderId))
    .limit(1);
  if (!pending) return { ok: false, code: "PENDING_ORDER_NOT_FOUND" };
  // Already finalized: don't regress the state — payment actually succeeded.
  if (pending.finalizedOrderId || pending.paymentState === PENDING_PAYMENT_STATES.FINALIZED) {
    await logPaymentEvent(db, {
      pendingId: pending.pendingId,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId ?? null,
      orderId: pending.finalizedOrderId,
      eventType: "WEBHOOK_FAILED_IGNORED_ALREADY_FINALIZED",
      source: "webhook",
      prevState: pending.paymentState,
      payload: args.gatewayPayload ?? null,
    });
    return { ok: true, pendingId: pending.pendingId };
  }
  // Already terminal failed/refunded — just log for audit.
  if (
    pending.paymentState === PENDING_PAYMENT_STATES.FAILED ||
    pending.paymentState === PENDING_PAYMENT_STATES.REFUNDED ||
    pending.paymentState === PENDING_PAYMENT_STATES.REFUND_PENDING
  ) {
    await logPaymentEvent(db, {
      pendingId: pending.pendingId,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId ?? null,
      eventType: "WEBHOOK_FAILED_DUPLICATE",
      source: "webhook",
      prevState: pending.paymentState,
      newState: pending.paymentState,
      payload: args.gatewayPayload ?? null,
    });
    return { ok: true, pendingId: pending.pendingId };
  }
  await db
    .update(pendingOrders)
    .set({
      paymentState: PENDING_PAYMENT_STATES.FAILED,
      razorpayPaymentId: args.razorpayPaymentId ?? pending.razorpayPaymentId,
      paymentFailureCode: args.failureCode ?? "PAYMENT_FAILED",
      paymentFailureMessage: args.failureMessage ?? "Payment failed at gateway.",
      lastGatewayPayload: args.gatewayPayload ?? pending.lastGatewayPayload ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pending.pendingId));
  await logPaymentEvent(db, {
    pendingId: pending.pendingId,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId ?? null,
    eventType: "WEBHOOK_PAYMENT_FAILED",
    source: "webhook",
    prevState: pending.paymentState,
    newState: PENDING_PAYMENT_STATES.FAILED,
    amountPaise: Math.round(Number(pending.grandTotal ?? 0) * 100),
    currency: pending.currency ?? "INR",
    failureCode: args.failureCode ?? "PAYMENT_FAILED",
    failureMessage: args.failureMessage ?? "Payment failed at gateway.",
    payload: args.gatewayPayload ?? null,
  });
  return { ok: true, pendingId: pending.pendingId };
}

/**
 * Webhook-driven helper: Razorpay fired one of `refund.created` /
 * `refund.processed` / `refund.failed`. We sync the refund status on the
 * pending order so the customer app / support dashboard reflect reality.
 *
 * Looked up by `razorpay_payment_id` (unique per payment) or falls back to
 * `refund.notes.pendingId` that we stamp in `createRazorpayRefund`.
 */
export async function applyRefundWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    eventType: "refund.created" | "refund.processed" | "refund.failed";
    razorpayPaymentId: string;
    refundId: string;
    refundStatus?: string | null;
    gatewayPayload?: Record<string, unknown> | null;
  }
): Promise<{ ok: true; pendingId: string } | { ok: false; code: string }> {
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayPaymentId, args.razorpayPaymentId))
    .limit(1);
  if (!pending) return { ok: false, code: "PENDING_ORDER_NOT_FOUND" };

  let nextState = pending.paymentState;
  let nextRefundStatus = args.refundStatus ?? pending.refundStatus ?? null;
  if (args.eventType === "refund.processed") {
    nextState = PENDING_PAYMENT_STATES.REFUNDED;
    nextRefundStatus = "refunded";
  } else if (args.eventType === "refund.failed") {
    nextState = PENDING_PAYMENT_STATES.REFUND_PENDING;
    nextRefundStatus = "refund_failed";
  } else if (args.eventType === "refund.created") {
    nextState = PENDING_PAYMENT_STATES.REFUND_PENDING;
    nextRefundStatus = nextRefundStatus ?? "refund_pending";
  }

  await db
    .update(pendingOrders)
    .set({
      paymentState: nextState,
      refundStatus: nextRefundStatus,
      refundReference: args.refundId || pending.refundReference,
      lastGatewayPayload: args.gatewayPayload ?? pending.lastGatewayPayload ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pending.pendingId));

  await logPaymentEvent(db, {
    pendingId: pending.pendingId,
    razorpayOrderId: pending.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    orderId: pending.finalizedOrderId,
    eventType:
      args.eventType === "refund.processed"
        ? "REFUND_PROCESSED"
        : args.eventType === "refund.failed"
        ? "REFUND_FAILED_WEBHOOK"
        : "REFUND_CREATED",
    source: "webhook",
    prevState: pending.paymentState,
    newState: nextState,
    amountPaise: Math.round(Number(pending.grandTotal ?? 0) * 100),
    currency: pending.currency ?? "INR",
    payload: args.gatewayPayload ?? { refundId: args.refundId },
  });

  return { ok: true, pendingId: pending.pendingId };
}

/**
 * Reconciler sweep. Runs every ~30s. For each pending order currently in
 * `pending_confirmation`:
 *
 *   - If TTL (payment_confirm_by) hasn't elapsed yet → leave it alone; the
 *     customer is still on the payment screen or a webhook is about to land.
 *
 *   - If TTL elapsed, look up Razorpay's state:
 *       * if no payment exists → mark pending as FAILED.
 *       * if payment is captured/authorized:
 *           - policy = "refund" (default for food orders): initiate refund
 *             because the customer very likely reordered elsewhere.
 *           - policy = "finalize": late-finalize (only if the merchant flow
 *             can cope).
 *
 *   - If TTL hasn't elapsed BUT payment is already captured → proactively
 *     finalize so the customer doesn't sit on the "confirming" screen waiting
 *     for the webhook (which may be stuck in Razorpay's retry queue).
 *
 * Every branch writes a payment_events audit row so we can replay any
 * incident later. Errors are swallowed per-row so one bad row can't block
 * the whole sweep.
 */
export async function reconcilePendingPayments(
  db: PostgresJsDatabase<Record<string, unknown>>
): Promise<{ checked: number; finalized: number; refunded: number; failed: number }> {
  const now = new Date();
  const rows = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.paymentState, PENDING_PAYMENT_STATES.PENDING_CONFIRMATION));

  const policy = getLateCapturePolicy();
  const windowMinutes = Math.round(getPaymentConfirmWindowMs() / 60_000);
  let finalized = 0;
  let refunded = 0;
  let failed = 0;

  for (const pending of rows) {
    if (pending.finalizedOrderId || !pending.razorpayOrderId) continue;
    const confirmBy = pending.paymentConfirmBy ? new Date(pending.paymentConfirmBy) : null;
    const ttlElapsed = confirmBy ? now >= confirmBy : false;

    try {
      const payments = await getOrderPayments(pending.razorpayOrderId);
      const captured = payments.find((p) => String(p.status ?? "").toLowerCase() === "captured");
      const latest = payments[0];

      // Fast path — captured before TTL: finalize now so the customer's
      // "confirming" screen flips green even if the webhook is delayed.
      if (captured?.id && !ttlElapsed) {
        const result = await finalizePendingOrderFromWebhook(db, {
          razorpayOrderId: pending.razorpayOrderId,
          razorpayPaymentId: String(captured.id),
          paymentMethod: String(captured.method ?? pending.paymentMethod),
          gatewayPayload: { verifiedBy: "reconciler", reason: "early_capture_detected", payment: captured },
        });
        if (result.ok) {
          finalized += 1;
          await logPaymentEvent(db, {
            pendingId: pending.pendingId,
            razorpayOrderId: pending.razorpayOrderId,
            razorpayPaymentId: String(captured.id),
            orderId: result.orderId,
            eventType: "RECONCILE_FINALIZED",
            source: "reconciler",
            prevState: pending.paymentState,
            newState: PENDING_PAYMENT_STATES.FINALIZED,
            amountPaise: Math.round(Number(pending.grandTotal ?? 0) * 100),
            currency: pending.currency ?? "INR",
            payload: { payment: captured },
          });
        }
        continue;
      }

      // Only act on TTL-elapsed rows from here on.
      if (!ttlElapsed) continue;

      // Captured after TTL: apply late-capture policy.
      if (captured?.id) {
        if (policy === "finalize") {
          const result = await finalizePendingOrderFromWebhook(db, {
            razorpayOrderId: pending.razorpayOrderId,
            razorpayPaymentId: String(captured.id),
            paymentMethod: String(captured.method ?? pending.paymentMethod),
            gatewayPayload: { verifiedBy: "reconciler", reason: "late_capture_finalize", payment: captured },
          });
          if (result.ok) {
            finalized += 1;
            await logPaymentEvent(db, {
              pendingId: pending.pendingId,
              razorpayOrderId: pending.razorpayOrderId,
              razorpayPaymentId: String(captured.id),
              orderId: result.orderId,
              eventType: "RECONCILE_LATE_FINALIZE",
              source: "reconciler",
              prevState: pending.paymentState,
              newState: PENDING_PAYMENT_STATES.FINALIZED,
              payload: { policy, payment: captured },
            });
          }
        } else {
          // Default: customer likely reordered — refund.
          await refundPendingPayment(db, pending, {
            paymentId: String(captured.id),
            reason: "payment_confirmation_timeout",
            failureMessage: `Payment captured after the ${windowMinutes}-minute confirmation window expired. Refund initiated.`,
            source: "reconciler",
          });
          refunded += 1;
        }
        continue;
      }

      // Not captured but has an authorized payment: still refund — authorize-
      // only flows should not happen on B2C because we force payment_capture=1,
      // but handle gracefully if it occurs.
      if (latest?.id && String(latest.status ?? "").toLowerCase() === "authorized") {
        await refundPendingPayment(db, pending, {
          paymentId: String(latest.id),
          reason: "payment_authorized_but_not_captured",
          failureMessage: `Payment was authorized but not captured within ${windowMinutes} minutes.`,
          source: "reconciler",
        });
        refunded += 1;
        continue;
      }

      // No captured/authorized payment at all within TTL → mark failed.
      await db
        .update(pendingOrders)
        .set({
          paymentState: PENDING_PAYMENT_STATES.FAILED,
          paymentFailureCode: "PAYMENT_NOT_CONFIRMED",
          paymentFailureMessage: `Payment was not confirmed within ${windowMinutes} minutes.`,
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pending.pendingId));
      failed += 1;
      await logPaymentEvent(db, {
        pendingId: pending.pendingId,
        razorpayOrderId: pending.razorpayOrderId,
        eventType: "RECONCILE_FAILED",
        source: "reconciler",
        prevState: pending.paymentState,
        newState: PENDING_PAYMENT_STATES.FAILED,
        amountPaise: Math.round(Number(pending.grandTotal ?? 0) * 100),
        currency: pending.currency ?? "INR",
        failureCode: "PAYMENT_NOT_CONFIRMED",
        failureMessage: `Payment was not confirmed within ${windowMinutes} minutes.`,
        payload: { razorpayPayments: payments },
      });
    } catch (error) {
      await db
        .update(pendingOrders)
        .set({
          paymentFailureCode: "PAYMENT_RECONCILIATION_FAILED",
          paymentFailureMessage: error instanceof Error ? error.message : "Payment reconciliation failed",
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pending.pendingId));
      await logPaymentEvent(db, {
        pendingId: pending.pendingId,
        razorpayOrderId: pending.razorpayOrderId,
        eventType: "RECONCILE_ERROR",
        source: "reconciler",
        prevState: pending.paymentState,
        failureCode: "PAYMENT_RECONCILIATION_FAILED",
        failureMessage: error instanceof Error ? error.message : "Payment reconciliation failed",
      });
    }
  }
  return { checked: rows.length, finalized, refunded, failed };
}
