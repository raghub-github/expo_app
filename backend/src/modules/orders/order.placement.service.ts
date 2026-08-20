/**
 * Order placement service: payment-first flow.
 * - createPending: validate cart + address, lock data in pending_orders.
 * - finalizeOrder: verify payment → single atomic transaction (orders_core + orders_core_items + addons + payments → update pending_orders → trigger emits order_events).
 * Order ID format: GM10000001, GM10000002, ... from order_id_seq.
 * All string/number values are sanitized before DB insert (no "—", undefined, NaN).
 */

import { randomBytes } from "crypto";
import { and, eq, gt, isNull, lt, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
// drizzleSql alias used to avoid name collision in offer snapshot helpers
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  pendingOrders,
  ordersCore,
  ordersCoreItems,
  ordersCoreItemAddons,
  ordersCorePayments,
  paymentEvents,
  offerOrderApplications,
  merchantOfferUsages,
  merchantOffers as merchantOffersTable,
} from "../../db/schema.js";
import {
  assertCustomerServiceNotBlocked,
  CUSTOMER_SERVICE_BLOCKED_CODE,
} from "../../lib/customer-service-blocks.js";
import { getEnv } from "../../config/env.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { verifyRazorpayPaymentDetails, verifyRazorpaySignature } from "../../services/payment/razorpayService.js";
import { computeBillForOrder } from "../billing/billing.service.js";
import { resolveStoreDeliveryQuote } from "../distance/storeQuote.service.js";
import { normalizeOrderItems } from "./orderNormalizer.js";
import { getRoute } from "../distance/distance.service.js";
import {
  parseCheckoutGatiCashAdjustments,
  enrichBillingSnapshotWithCheckoutAdjustments,
} from "../../lib/checkout-gaticash-adjustments.js";
import {
  fulfillCheckoutGatiCashWalletOps,
  getCustomerGatiCashAvailable,
} from "../../lib/checkout-gaticash-wallet-ops.js";
import { ensureGatiCashTxnIdInCheckoutMetadata } from "../../lib/gaticash-txn-id.js";
import { buildOrderPaymentBreakdown } from "../../lib/order-payment-breakdown.js";
import {
  resolveOrdersCorePk,
  writeOrderItemCommissionSnapshots,
} from "../commission/writeOrderCommissionSnapshots.js";
import {
  buildCtmLineInputsFromFrozenItems,
  writeMerchantCtmPricingSnapshots,
  ensureMerchantCtmPricingSnapshotsForOrder,
} from "../commission/writeMerchantCtmPricingSnapshots.js";
import { resolveStoreCommission, type ResolvedCommission } from "../commission/commission.resolver.js";
import { persistOrderItemAddonsWithSnapshots } from "../commission/persistOrderItemAddons.js";
import { formatAddressLabelEnum } from "../../lib/order-delivery-details.js";
import { enrichAddonsWithMenuMetadata } from "../commission/resolveMenuAddonMetadata.js";
import { resolveMenuAddonPk } from "../commission/resolveMenuAddonPk.js";
import type { NormalizedOrderItem } from "./orderNormalizer.js";
import { freezeEtaForPlacedOrder } from "../eta/eta.placement.js";
import { vegNonvegForPlacementItem } from "../../lib/order-item-veg.js";
import { insertPlacedOrderCoreWithTimelines, runInSavepoint } from "../../lib/order-placement-persist.js";
import { jsonForSql } from "../../lib/sql-timestamps.js";
import { getSql } from "../../db/client.js";
import { notifyMerchantStoreNewOrder } from "../../lib/merchant-new-order-notify.js";
import { maybeStartOrderDispatch } from "../../lib/order-dispatch.service.js";
import { captureOrderWeatherSnapshot } from "../weather/weather.order-snapshot.js";
import {
  getActiveLocation,
  setAddressLastUsed,
} from "../addresses/address.service.js";

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

/**
 * Resolve frozen per-line effective pricing from billing snapshot (Offer Engine SSOT).
 * Exported so EVERY order-placement path freezes the SAME applied_offer_* columns onto
 * orders_core_items — the single source of truth the CTM snapshot projects from. No path may
 * insert bare order lines and rely on later inference; that is what made a BOGO persist as NONE.
 */
export function orderLinePricingFieldsFromSnapshot(
  snap: Record<string, unknown> | null | undefined,
  menuItemId: string,
  lineIndex: number,
  quantity: number,
  catalogLineTotal: number,
): {
  effectiveUnitPrice: string | null;
  effectiveLineTotal: string | null;
  offerDiscountAmount: string | null;
  appliedOfferId: number | null;
  appliedOfferLabel: string | null;
  appliedOfferType: string | null;
  ineligibilityReason: string | null;
  isDiscountEligible: boolean | undefined;
} {
  const pricingRaw =
    (Array.isArray(snap?.order_line_pricing) && snap?.order_line_pricing) ||
    (Array.isArray(snap?.orderLinePricing) && snap?.orderLinePricing) ||
    [];
  const eligRaw =
    (Array.isArray(snap?.order_line_eligibility) && snap?.order_line_eligibility) ||
    (Array.isArray(snap?.orderLineEligibility) && snap?.orderLineEligibility) ||
    [];

  const rows = pricingRaw as Array<Record<string, unknown>>;
  const byIndex = rows[lineIndex];
  const mid = String(menuItemId ?? "").trim();
  const byId =
    mid.length > 0
      ? rows.find((r) => String(r.menuItemId ?? r.menu_item_id ?? "").trim() === mid)
      : undefined;
  const row = byIndex ?? byId;

  const eligRows = eligRaw as Array<Record<string, unknown>>;
  const eligRow =
    eligRows[lineIndex] ??
    (mid
      ? eligRows.find((r) => String(r.menuItemId ?? r.menu_item_id ?? "").trim() === mid)
      : undefined);

  let isDiscountEligible: boolean | undefined;
  if (eligRow) {
    if (typeof eligRow.isDiscountEligible === "boolean") isDiscountEligible = eligRow.isDiscountEligible;
    else if (typeof eligRow.discountEligible === "boolean") isDiscountEligible = eligRow.discountEligible;
  }
  if (row && typeof row.isDiscountEligible === "boolean") {
    isDiscountEligible = row.isDiscountEligible;
  }

  const ineligibilityReason = (() => {
    const r = row?.ineligibilityReason ?? row?.ineligibility_reason
      ?? eligRow?.ineligibilityReason ?? eligRow?.ineligibility_reason;
    const s = r != null ? String(r).trim() : "";
    return s || null;
  })();

  if (!row) {
    return {
      effectiveUnitPrice: null,
      effectiveLineTotal: null,
      offerDiscountAmount: null,
      appliedOfferId: null,
      appliedOfferLabel: null,
      appliedOfferType: null,
      ineligibilityReason,
      isDiscountEligible,
    };
  }

  const catalog = asNumber(row.catalogLineTotal ?? row.catalog_line_total ?? catalogLineTotal);
  const disc = Math.max(0, asNumber(row.offerDiscountAmount ?? row.offer_discount_amount ?? 0));
  let effective = asNumber(row.effectiveLineTotal ?? row.effective_line_total);
  if (!Number.isFinite(effective) || effective < 0) {
    effective = Math.max(0, catalog - disc);
  }
  const qty = Math.max(1, quantity);
  const unit = Math.round((effective / qty) * 100) / 100;
  const offerIdRaw = row.appliedOfferId ?? row.applied_offer_id;
  const offerId =
    offerIdRaw != null && Number.isFinite(Number(offerIdRaw)) && Number(offerIdRaw) > 0
      ? Math.floor(Number(offerIdRaw))
      : null;
  const labelRaw = row.appliedOfferLabel ?? row.applied_offer_label;
  const typeRaw = row.appliedOfferType ?? row.applied_offer_type;

  return {
    effectiveUnitPrice: disc > 0.005 || Math.abs(effective - catalog) > 0.005
      ? sanitizeNumeric(unit)
      : sanitizeNumeric(catalog / qty),
    effectiveLineTotal: sanitizeNumeric(effective),
    offerDiscountAmount: sanitizeNumeric(disc),
    appliedOfferId: offerId,
    appliedOfferLabel: labelRaw != null && String(labelRaw).trim() ? String(labelRaw).trim() : null,
    appliedOfferType: typeRaw != null && String(typeRaw).trim() ? String(typeRaw).trim() : null,
    ineligibilityReason,
    isDiscountEligible,
  };
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toJson(v: unknown): string {
  return jsonForSql(v);
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
    /** Null for wallet-settled orders — no gateway was involved. */
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    paymentMethodEnum: "upi" | "card" | "wallet" | "online" | "cod" | "other";
    /** Unique GatiCash payment txn id when wallet settled the bill (or mixed wallet portion). */
    gatiCashTxnId?: string | null;
  }
): Promise<void> {
  const { orderId, pendingId, pending, razorpayOrderId, razorpayPaymentId, paymentMethodEnum } = args;
  const versionNo = 1;
  // A GatiCash-covered order has no gateway transaction, so the ledger reference is the
  // unique GatiCash txn id. Keeps (gateway, transaction_reference) unique either way.
  const settledByWallet = !razorpayPaymentId;
  const ledgerGateway = settledByWallet ? "gati_cash" : "razorpay";
  const ledgerTxnRef =
    razorpayPaymentId ??
    (args.gatiCashTxnId?.trim() || null) ??
    // Should not happen for new wallet settlements — retained as last-resort only.
    `gaticash_${orderId}`;
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
  const breakdown = buildOrderPaymentBreakdown(pending, {
    gatewayAmount: settledByWallet ? 0 : payableTotal,
    gatewayMethod: settledByWallet ? null : paymentMethodEnum,
  });
  // Wallet-settled orders still have a real settlement amount (GatiCash debit). Ledger /
  // payment_intents should record that, not ₹0 — otherwise support thinks nothing was paid.
  const settlementAmount = settledByWallet
    ? Math.max(payableTotal, asNumber(pending.gatiCashApplied ?? 0), breakdown.totalBillAmount)
    : payableTotal;

  await tx.execute(sql`
    INSERT INTO payment_intents (intent_id, order_id, idempotency_key, amount, currency, status, metadata)
    VALUES (
      ${paymentIntentId},
      ${orderId},
      ${`intent:${paymentIntentId}`},
      ${String(settlementAmount)},
      ${pending.currency ?? "INR"},
      'succeeded',
      ${toJson({
        source: "finalizeOrder",
        settlement: settledByWallet ? "gati_cash" : "gateway",
        breakdown,
      })}::jsonb
    )
    ON CONFLICT (intent_id) DO NOTHING
  `);

  const piRows = await tx.execute(sql`
    SELECT id FROM payment_intents WHERE intent_id = ${paymentIntentId} LIMIT 1
  `);
  const piRow = Array.isArray(piRows)
    ? (piRows[0] as { id?: number } | undefined)
    : ((piRows as { rows?: Array<{ id?: number }> })?.rows?.[0] ?? undefined);
  const paymentIntentPk = piRow?.id != null ? Number(piRow.id) : null;

  // payment_intent_id is NOT NULL — skip the txn row if the intent select missed (pooler
  // shape quirks) rather than aborting the whole finalize behind a flaky savepoint.
  if (paymentIntentPk != null && Number.isFinite(paymentIntentPk)) {
    await tx.execute(sql`
      INSERT INTO payment_transactions (
        payment_intent_id, order_id, gateway, payment_mode, transaction_reference, status, amount, currency, idempotency_key, raw_response
      )
      VALUES (
        ${paymentIntentPk},
        ${orderId},
        ${ledgerGateway},
        ${paymentMethodEnum},
        ${ledgerTxnRef},
        'succeeded',
        ${String(settlementAmount)},
        ${pending.currency ?? "INR"},
        ${`payment:${ledgerTxnRef}`},
        ${toJson(
          settledByWallet
            ? { settledBy: "gati_cash_wallet", gatiCashApplied: asNumber(pending.gatiCashApplied ?? 0) }
            : { razorpayPaymentId, razorpayOrderId }
        )}::jsonb
      )
      ON CONFLICT (gateway, transaction_reference) DO NOTHING
    `);
  }

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
      ${toJson({ pendingId, razorpayPaymentId, settlement: ledgerGateway, ledgerTxnRef })}::jsonb
    )
    ON CONFLICT (journal_ref) DO NOTHING
  `);

  const journalRows = await tx.execute(sql`
    SELECT id FROM ledger_journals WHERE journal_ref = ${journalRef} LIMIT 1
  `);
  const journal = Array.isArray(journalRows)
    ? (journalRows[0] as { id?: number } | undefined)
    : ((journalRows as { rows?: Array<{ id?: number }> })?.rows?.[0] ?? undefined);
  const arRows = await tx.execute(sql`SELECT id FROM ledger_accounts WHERE account_code = 'AR_CUSTOMER' LIMIT 1`);
  const revRows = await tx.execute(sql`SELECT id FROM ledger_accounts WHERE account_code = 'REV_PLATFORM' LIMIT 1`);
  const ar = Array.isArray(arRows)
    ? (arRows[0] as { id?: number } | undefined)
    : ((arRows as { rows?: Array<{ id?: number }> })?.rows?.[0] ?? undefined);
  const rev = Array.isArray(revRows)
    ? (revRows[0] as { id?: number } | undefined)
    : ((revRows as { rows?: Array<{ id?: number }> })?.rows?.[0] ?? undefined);

  if (journal?.id && ar?.id && rev?.id) {
    await tx.execute(sql`
      INSERT INTO ledger_entries (journal_id, order_id, account_id, direction, amount, entry_no, metadata)
      VALUES
        (${journal.id}, ${orderId}, ${ar.id}, 'debit', ${String(settlementAmount)}, 1, ${toJson({ source: "finalizeOrder" })}::jsonb),
        (${journal.id}, ${orderId}, ${rev.id}, 'credit', ${String(settlementAmount)}, 2, ${toJson({ source: "finalizeOrder" })}::jsonb)
      ON CONFLICT (journal_id, entry_no) DO NOTHING
    `);
    // reference_id is NOT NULL — never pass a null razorpay id on wallet-settled orders.
    await tx.execute(sql`
      INSERT INTO ledger_references (journal_id, reference_type, reference_id, metadata)
      VALUES
        (${journal.id}, 'order_id', ${orderId}, '{}'::jsonb),
        (${journal.id}, 'payment_txn', ${ledgerTxnRef}, '{}'::jsonb)
      ON CONFLICT (journal_id, reference_type, reference_id) DO NOTHING
    `);
  }

  // Persist immutable offer snapshots and per-user usage records
  await persistOfferSnapshots(tx, orderId, pending);
}

/**
 * For every discount line in billingSnapshot, write an offer_order_applications row
 * and (for merchant offers) a merchant_offer_usages row + increment current_uses.
 */
async function persistOfferSnapshots(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string,
  pending: typeof pendingOrders.$inferSelect
): Promise<void> {
  const snap = (pending.billingSnapshot as Record<string, unknown> | null) ?? {};
  const discounts: Record<string, unknown>[] = Array.isArray(snap.discounts)
    ? (snap.discounts as Record<string, unknown>[])
    : [];

  const customerId = asNumber(pending.customerId ?? 0);

  for (const d of discounts) {
    const meta = (d.meta ?? {}) as Record<string, unknown>;
    const amount = Math.abs(asNumber(d.amount ?? 0));
    if (amount <= 0) continue;

    const merchantOfferId = meta.merchantOfferId != null ? Number(meta.merchantOfferId) : null;
    const platformOfferId = meta.platformOfferId != null ? Number(meta.platformOfferId) : null;

    let offerSource: "MERCHANT" | "PLATFORM" | "COUPON" = "PLATFORM";
    if (merchantOfferId != null) offerSource = "MERCHANT";
    else if (meta.source === "coupon" || meta.couponCode) offerSource = "COUPON";

    const offerTitle = String(d.label ?? d.step ?? "Discount").trim() || "Discount";
    const offerType  = String(meta.offerType ?? (merchantOfferId ? "PERCENTAGE" : "DISCOUNT"));
    const couponCode = meta.couponCode != null ? String(meta.couponCode) : null;

    try {
      await tx.insert(offerOrderApplications).values({
        orderId:         BigInt(orderId.replace(/\D/g, "") || 0),
        offerSource,
        merchantOfferId: merchantOfferId != null ? BigInt(merchantOfferId) : null,
        platformOfferId: platformOfferId != null ? BigInt(platformOfferId) : null,
        offerType,
        offerTitle,
        couponCode,
        discountAmount:  String(amount),
        platformShare:   String(asNumber(meta.platformContribution ?? meta.platformShare ?? (offerSource === "PLATFORM" ? amount : 0))),
        merchantShare:   String(asNumber(meta.merchantContribution ?? meta.merchantShare ?? (offerSource === "MERCHANT" ? amount : 0))),
        platformContribution: String(asNumber(meta.platformContribution ?? meta.platformShare ?? 0)),
        merchantContribution: String(asNumber(meta.merchantContribution ?? meta.merchantShare ?? 0)),
        fundingMode:     String(meta.fundingMode ?? (offerSource === "MERCHANT" ? "MERCHANT_ONLY" : "PLATFORM_ONLY")),
        snapshotJson:    d,
      } as never).onConflictDoNothing();
    } catch {
      // Never let snapshot failures break order placement
    }

    if (merchantOfferId != null && customerId > 0) {
      try {
        await tx.insert(merchantOfferUsages).values({
          offerId:        BigInt(merchantOfferId),
          userId:         BigInt(customerId),
          orderId:        BigInt(orderId.replace(/\D/g, "") || 0),
          discountAmount: String(amount),
        } as never).onConflictDoNothing();

        // Increment current_uses counter on the offer
        await tx
          .update(merchantOffersTable)
          .set({ currentUses: sql`COALESCE(current_uses, 0) + 1` })
          .where(eq(merchantOffersTable.id, merchantOfferId));
      } catch {
        // Non-critical — snapshot already saved
      }
    }

    if (platformOfferId != null && customerId > 0 && offerSource === "PLATFORM") {
      try {
        const { recordPlatformOfferUsageAtPlacement } = await import(
          "../billing/platformOfferUsage.service.js"
        );
        // Prefer snapshot meta; otherwise omit so DB consume_mode (e.g. ON_DELIVERED) is used.
        const snapConsume =
          meta.consumeMode != null
            ? String(meta.consumeMode)
            : meta.consume_mode != null
              ? String(meta.consume_mode)
              : undefined;
        await recordPlatformOfferUsageAtPlacement(tx, {
          platformOfferId,
          customerId,
          orderId,
          discountAmount: amount,
          orderSaleAmount: asNumber(pending.grandTotal ?? 0),
          ...(snapConsume ? { consumeMode: snapConsume } : {}),
        });
      } catch {
        // Non-critical — snapshot already saved; eligibility re-checks on next order
      }
    }
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

/** Read-only menu lookups — must use postgres `getSql()`, not Drizzle `tx`. */
async function enrichAddonsWithMenuPk(
  storeId: number,
  items: NormalizedOrderItem[],
): Promise<void> {
  if (!storeId || storeId <= 0) return;
  const { getSql } = await import("../../db/client.js");
  const sql = getSql();
  await enrichAddonsWithMenuMetadata(sql, storeId, items);
  for (const it of items) {
    for (const ad of it.addons) {
      if (ad.menuAddonPk != null && ad.menuAddonPk > 0) continue;
      const pk = await resolveMenuAddonPk(sql, storeId, ad.menuAddonId, ad.customizationId);
      if (pk) ad.menuAddonPk = pk;
    }
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
    addons?: Array<{
      addonId: string;
      customizationId?: string | null;
      addonName: string;
      addonPrice: number;
      quantity: number;
    }>;
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
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: "weekly" | "monthly" | "yearly";
  /** 'delivery' (default) or 'self_pickup'. Self-pickup waives delivery fee in billing. */
  deliveryType?: "delivery" | "self_pickup";
  checkoutMetadata?: Record<string, unknown> | null;
  selectedPlatformOfferId?: number | null;
  selectedMerchantOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  idempotencyKey?: string | null;
};

export type CreatePendingResult =
  | { ok: true; pendingId: string; amount: number; currency: string }
  | { ok: false; code: string; message: string };

/**
 * A DB error that is a transient CONNECTION/network drop (not a data/constraint problem), so the
 * exact same write is safe to retry. Seen in prod as intermittent checkout 500s ("Failed query:
 * insert into pending_orders …") when the remote Postgres connection is reset mid-insert of the
 * large billing_snapshot row — postgres.js surfaces this as "Premature close" / CONNECTION_ENDED,
 * never as a constraint violation.
 */
function isTransientDbConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = String(e?.code ?? e?.cause?.code ?? "").toUpperCase();
  const transientCodes = new Set([
    "ECONNRESET", "EPIPE", "ETIMEDOUT", "ENETUNREACH", "ENOTFOUND",
    "CONNECTION_ENDED", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECTION_CONNECT_TIMEOUT",
    "08000", "08001", "08003", "08004", "08006", "08007", // SQLSTATE connection exceptions
    "57P01", "57P02", "57P03", // admin shutdown / crash shutdown / cannot connect now
  ]);
  if (transientCodes.has(code)) return true;
  const msg = String(e?.message ?? e?.cause?.message ?? "").toLowerCase();
  return (
    msg.includes("premature close") ||
    msg.includes("connection terminated") ||
    msg.includes("connection ended") ||
    msg.includes("econnreset") ||
    msg.includes("write after end") ||
    msg.includes("timeout")
  );
}

/**
 * Persist the pending_orders row, retrying ONLY on transient connection drops. The pendingId is
 * generated once by the caller, so a retry re-uses it: if a prior attempt actually committed but
 * its ack was lost, the retry hits a unique(pending_id) violation — which we treat as success (the
 * row is already there). Constraint/data errors are never retried; they surface immediately.
 */
async function insertPendingOrderRow(
  db: PostgresJsDatabase<Record<string, unknown>>,
  values: typeof pendingOrders.$inferInsert
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.insert(pendingOrders).values(values);
      return;
    } catch (err) {
      const code = String(
        (err as { code?: string; cause?: { code?: string } })?.code ??
          (err as { cause?: { code?: string } })?.cause?.code ??
          ""
      );
      // 23505 = unique_violation. The only unique column here is pending_id, so this means our own
      // earlier (connection-dropped) attempt already committed the row — idempotent success.
      if (code === "23505") {
        console.warn(
          "[orders] pending insert saw unique pending_id on retry — row already persisted, treating as success"
        );
        return;
      }
      if (attempt < maxAttempts && isTransientDbConnectionError(err)) {
        const backoffMs = 120 * attempt;
        console.warn(
          `[orders] pending_orders insert transient DB error (attempt ${attempt}/${maxAttempts}); retrying in ${backoffMs}ms:`,
          (err as { cause?: { message?: string }; message?: string })?.cause?.message ??
            (err as { message?: string })?.message
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

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
    paymentMethod,
    tipAmount = 0,
    donationAmount = 0,
    subscriptionOptIn = false,
    subscriptionPlanId,
    subscriptionBillingCycle,
  } = input;

  const serviceBlock = await assertCustomerServiceNotBlocked(customerId, "food");
  if (serviceBlock.blocked) {
    return {
      ok: false,
      code: CUSTOMER_SERVICE_BLOCKED_CODE,
      message: serviceBlock.reason,
    };
  }

  // Order delivery snapshot = checkout addressId (what the customer confirmed).
  // Never override with customer_active_location — active pin can be live GPS or a
  // different Saved Address and must not rewrite immutable order drop coords.
  const active = await getActiveLocation(customerId);
  const addressId = input.addressId;
  if (active?.addressId != null && active.addressId !== addressId) {
    console.info("[orders] pending_address_checkout_wins_over_active", {
      customerId,
      checkoutAddressId: addressId,
      activeAddressId: active.addressId,
    });
  }

  // Production-critical serviceability gate. Run this before idempotency
  // lookup and independently of billing flags so even retries cannot reuse a
  // pending delivery after its address becomes unserviceable.
  if ((input.deliveryType ?? "delivery") === "delivery") {
    const deliveryQuote = await resolveStoreDeliveryQuote({
      storeId: String(input.merchantId),
      customerId,
      addressId,
      actor: "customer",
      serviceType: "FOOD",
      skipCache: true,
    });
    if (!deliveryQuote.ok) {
      return {
        ok: false,
        code: deliveryQuote.code,
        message: deliveryQuote.message,
      };
    }
    if (!deliveryQuote.quote.serviceable) {
      const storeInactive =
        deliveryQuote.quote.unserviceable_reason === "store_inactive";
      return {
        ok: false,
        code: storeInactive ? "STORE_CLOSED" : "OUT_OF_DELIVERY_ZONE",
        message: storeInactive
          ? "This restaurant is not accepting orders right now."
          : "This address is outside the restaurant's delivery area. Please select a deliverable address or add a new one.",
      };
    }
  }

  // Emergency Prevent Services — block new food orders inside an active radius.
  try {
    const { customerAddresses: addrTable } = await import("../../db/schema.js");
    const { assertServiceNotPrevented, preventCodesForStoreType } = await import(
      "../prevent-services/preventServices.engine.js"
    );
    const [addrCoords] = await db
      .select({
        latitude: addrTable.latitude,
        longitude: addrTable.longitude,
      })
      .from(addrTable)
      .where(
        and(
          eq(addrTable.id, addressId),
          eq(addrTable.customerId, customerId),
          eq(addrTable.isActive, true),
          isNull(addrTable.deletedAt)
        )
      )
      .limit(1);
    const dropLat = addrCoords?.latitude != null ? Number(addrCoords.latitude) : null;
    const dropLng = addrCoords?.longitude != null ? Number(addrCoords.longitude) : null;
    // store_type decides which prevent codes apply (grocery / pharmacy / courier).
    let storeType: string | null = null;
    try {
      const { getSql } = await import("../../db/client.js");
      const [storeRow] = await getSql()<Array<{ store_type: string | null }>>`
        SELECT store_type
        FROM merchant_stores
        WHERE id = ${Number(merchantId)}
        LIMIT 1
      `;
      storeType = storeRow?.store_type ?? null;
    } catch {
      storeType = null;
    }
    for (const code of preventCodesForStoreType(storeType)) {
      const blocked = await assertServiceNotPrevented({
        lat: dropLat,
        lng: dropLng,
        service: code,
      });
      if (!blocked.ok) {
        return {
          ok: false,
          code: blocked.code,
          message: blocked.message,
        };
      }
    }
  } catch {
    /* schema missing / non-fatal — placement continues */
  }

  const idemKey = input.idempotencyKey?.trim() || null;
  if (idemKey) {
    const [existing] = await db
      .select({
        pendingId: pendingOrders.pendingId,
        grandTotal: pendingOrders.grandTotal,
        currency: pendingOrders.currency,
      })
      .from(pendingOrders)
      .where(
        and(
          eq(pendingOrders.customerId, customerId),
          eq(pendingOrders.idempotencyKey, idemKey),
          gt(pendingOrders.expiresAt, new Date())
        )
      )
      .limit(1);
    if (existing) {
      return {
        ok: true,
        pendingId: existing.pendingId,
        amount: Math.round(Number(existing.grandTotal ?? 0) * 100),
        currency: existing.currency ?? "INR",
      };
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

  // Defense-in-depth entitlement gate: a plan-locked menu item must NEVER be orderable,
  // even if it was cached/bookmarked/reordered before the merchant's plan downgraded.
  // The customer menu/search/recommendation APIs already hide `is_locked_by_plan` items;
  // this is the authoritative backend check that rejects any that slip through to checkout.
  {
    const orderedItemIds = Array.from(
      new Set(items.map((i) => Number(i.menuItemId)).filter((n) => Number.isFinite(n) && n > 0))
    );
    if (orderedItemIds.length > 0) {
      // Local import matches the read-only-lookup pattern used elsewhere in this function
      // (getSql is re-imported per-block below), avoiding the function-scope shadow.
      const { getSql: getSqlRo } = await import("../../db/client.js");
      const sqlRo = getSqlRo();
      const lockedRows = await sqlRo<Array<{ item_name: string | null }>>`
        SELECT item_name
        FROM merchant_menu_items
        WHERE id IN ${sqlRo(orderedItemIds)}
          AND store_id = ${merchantStoreId}
          AND COALESCE(is_locked_by_plan, FALSE) = TRUE
      `;
      if (lockedRows.length > 0) {
        const names = lockedRows
          .map((r) => (r.item_name ?? "").trim())
          .filter(Boolean)
          .join(", ");
        return {
          ok: false,
          code: "ITEM_UNAVAILABLE",
          message: names
            ? `These items are no longer available: ${names}. Please remove them from your cart and try again.`
            : "Some items in your cart are no longer available. Please review your cart and try again.",
        };
      }
    }
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
      label: customerAddresses.label,
      customLabel: customerAddresses.customLabel,
      contactName: customerAddresses.contactName,
      contactMobile: customerAddresses.contactMobile,
      deliveryInstructionsList: customerAddresses.deliveryInstructionsList,
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
      addressId,
      tipAmount,
      donationAmount,
      couponCode: couponStored,
      pickupLat: input.pickupLat,
      pickupLon: input.pickupLon,
      subscriptionOptIn,
      subscriptionPlanId,
      subscriptionBillingCycle,
      deliveryType: input.deliveryType ?? "delivery",
      selectedPlatformOfferId: input.selectedPlatformOfferId ?? null,
      selectedMerchantOfferId: input.selectedMerchantOfferId ?? null,
      forceNoAutoOffer: input.forceNoAutoOffer,
    });
    if (!billRes.ok) {
      return { ok: false, code: billRes.code, message: billRes.message };
    }
    if (billRes.snapshot?.serviceable === false) {
      const reason =
        billRes.snapshot?.unserviceableReason === "store_inactive"
          ? "This restaurant is not accepting orders right now."
          : "This address is outside the restaurant delivery zone. Please choose another address.";
      return {
        ok: false,
        code: "OUT_OF_DELIVERY_ZONE",
        message: reason,
      };
    }
    if (storeForOrder?.is_accepting_orders === false) {
      return {
        ok: false,
        code: "STORE_CLOSED",
        message: "This restaurant is not accepting orders right now.",
      };
    }
    grandTotal = billRes.billing.final_amount;
    billingSnapshot = billRes.snapshot;
    billingRulesetVersion = billRes.billing.ruleset_version;
  }

  const checkoutMetadataEarly =
    input.checkoutMetadata && typeof input.checkoutMetadata === "object"
      ? (input.checkoutMetadata as Record<string, unknown>)
      : {};
  const checkoutAdj = parseCheckoutGatiCashAdjustments(checkoutMetadataEarly, grandTotal);
  if (checkoutAdj.gatiCashApplied > 0.005) {
    const { getSql } = await import("../../db/client.js");
    const available = await getCustomerGatiCashAvailable(getSql(), customerId);
    if (available + 0.005 < checkoutAdj.gatiCashApplied) {
      return {
        ok: false,
        code: "INSUFFICIENT_GATICASH",
        message: "Insufficient GatiCash balance. Please update wallet and try again.",
      };
    }
  }
  if (
    checkoutAdj.gatiCashApplied > 0.005 ||
    checkoutAdj.missedOfferDiscount > 0.005 ||
    checkoutAdj.missedOfferWalletAdd > 0.005
  ) {
    grandTotal = checkoutAdj.adjustedGrandTotal;
    billingSnapshot = enrichBillingSnapshotWithCheckoutAdjustments(billingSnapshot, checkoutAdj);
  }

  const dropAddressRaw = [addrRow.addressLine1, addrRow.addressLine2, addrRow.city, addrRow.state, addrRow.postalCode]
    .filter(Boolean)
    .join(", ");
  // Immutable delivery snapshot from the checkout address row (never live GPS /
  // customer_active_location lat/lng — those can diverge while addressId is bound).
  const dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
  const dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;
  const isUsableLatLon = (lat: number | null, lon: number | null): boolean =>
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  const storePickupLat =
    storeForOrder?.latitude != null && Number.isFinite(storeForOrder.latitude)
      ? Number(storeForOrder.latitude)
      : null;
  const storePickupLon =
    storeForOrder?.longitude != null && Number.isFinite(storeForOrder.longitude)
      ? Number(storeForOrder.longitude)
      : null;
  const clientPickupLat =
    input.pickupLat != null && Number.isFinite(input.pickupLat) ? Number(input.pickupLat) : null;
  const clientPickupLon =
    input.pickupLon != null && Number.isFinite(input.pickupLon) ? Number(input.pickupLon) : null;
  const pickupLat = isUsableLatLon(storePickupLat, storePickupLon)
    ? (storePickupLat as number)
    : isUsableLatLon(clientPickupLat, clientPickupLon)
      ? (clientPickupLat as number)
      : 0;
  const pickupLon = isUsableLatLon(storePickupLat, storePickupLon)
    ? (storePickupLon as number)
    : isUsableLatLon(clientPickupLat, clientPickupLon)
      ? (clientPickupLon as number)
      : 0;

  let distanceKm = 0;
  const snapDist = Number(billingSnapshot?.distanceKm);
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const airKm =
    isUsableLatLon(pickupLat, pickupLon) && isUsableLatLon(dropLat, dropLon)
      ? (() => {
          const dLat = toRad(dropLat - pickupLat);
          const dLon = toRad(dropLon - pickupLon);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(pickupLat)) *
              Math.cos(toRad(dropLat)) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })()
      : null;
  const snapMatchesPins =
    airKm != null &&
    Number.isFinite(snapDist) &&
    snapDist >= 0 &&
    snapDist >= airKm * 0.75 &&
    snapDist <= Math.max(airKm * 2.2, airKm + 1.5);
  if (snapMatchesPins) {
    distanceKm = snapDist;
  } else if (isUsableLatLon(pickupLat, pickupLon) && isUsableLatLon(dropLat, dropLon)) {
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
      distanceKm = airKm != null ? Math.round(airKm * 100) / 100 : 0;
    }
  }
  const pickupAddressNormalized = sanitizeOptional((storeForOrder?.fullAddress ?? input.pickupAddressRaw ?? dropAddressRaw).trim() || null);

  const { getSql } = await import("../../db/client.js");
  await enrichAddonsWithMenuMetadata(getSql(), merchantStoreId, items);

  const pendingId = `PEND-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);

  const { enrichBillingSnapshotForPersistence } = await import("../../lib/food-order-payload.js");
  billingSnapshot = enrichBillingSnapshotForPersistence(billingSnapshot, {
    deliveryType: input.deliveryType ?? "delivery",
    distanceKm,
    serviceable:
      billingSnapshot?.serviceable === false
        ? false
        : billingSnapshot?.serviceable === true
          ? true
          : true,
    storeKptMinutes: null,
  });

  const checkoutMetadataBase =
    input.checkoutMetadata && typeof input.checkoutMetadata === "object"
      ? { ...(input.checkoutMetadata as Record<string, unknown>) }
      : {};
  const checkoutMetadata = {
    ...checkoutMetadataBase,
    ...(subscriptionOptIn && subscriptionPlanId
      ? {
          subscriptionOptIn: true,
          subscriptionPlanId,
          subscriptionBillingCycle: subscriptionBillingCycle ?? "monthly",
        }
      : {}),
    addressLabel:
      checkoutMetadataBase.addressLabel ??
      formatAddressLabelEnum(String(addrRow.label ?? ""), addrRow.customLabel),
    receiverContactName:
      checkoutMetadataBase.receiverContactName ?? addrRow.contactName?.trim() ?? null,
    receiverContactMobile:
      checkoutMetadataBase.receiverContactMobile ?? addrRow.contactMobile?.trim() ?? null,
    ...(Array.isArray(addrRow.deliveryInstructionsList) &&
    addrRow.deliveryInstructionsList.length > 0 &&
    !Array.isArray(checkoutMetadataBase.deliveryInstructionsList)
      ? { deliveryInstructionsList: addrRow.deliveryInstructionsList }
      : {}),
  };

  await insertPendingOrderRow(db, {
    pendingId,
    customerId,
    merchantStoreId,
    merchantParentId: storeForOrder?.parentId ?? null,
    itemsSnapshot: items as unknown as Record<string, unknown>, // already normalized
    addressIdUsed: addressId,
    paymentMethod,
    deliveryType: input.deliveryType ?? "delivery",
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
    gatiCashApplied: sanitizeNumeric(checkoutAdj.gatiCashApplied),
    missedOfferDiscount: sanitizeNumeric(checkoutAdj.missedOfferDiscount),
    missedOfferWalletAdd: sanitizeNumeric(checkoutAdj.missedOfferWalletAdd),
    couponCode: couponStored ?? undefined,
    checkoutMetadata: checkoutMetadata ?? undefined,
    idempotencyKey: idemKey ?? undefined,
    expiresAt,
  });

  // MRU: bump last_used for the address that actually entered the order pipeline.
  try {
    await setAddressLastUsed(customerId, addressId);
  } catch (err) {
    console.warn("[orders] setAddressLastUsed failed", {
      customerId,
      addressId,
      err: err instanceof Error ? err.message : String(err),
    });
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
  /**
   * Absent for wallet-settled orders — when GatiCash covers the whole bill the payable is
   * ₹0, no gateway order is ever minted, and there is nothing to verify a signature against.
   */
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
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
  const { pendingId, customerId } = input;

  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(and(eq(pendingOrders.pendingId, pendingId), eq(pendingOrders.customerId, customerId)))
    .limit(1);

  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND", message: "Session expired or invalid. Please restart checkout." };
  }

  const expectedAmountPaise = Math.round(Number(pending.grandTotal ?? 0) * 100);
  const gatiCashApplied = Number(pending.gatiCashApplied ?? 0);

  // GatiCash covered the whole bill: settle off the wallet ledger. There is no gateway
  // order, payment id, or signature to verify — the wallet debit below IS the payment.
  const walletSettled = expectedAmountPaise <= 0;

  let razorpayOrderId: string | null = input.razorpayOrderId?.trim() || null;
  let razorpayPaymentId: string | null = input.razorpayPaymentId?.trim() || null;
  const razorpaySignature = input.razorpaySignature?.trim() || null;

  let paymentMethodEnum: ReturnType<typeof paymentMethodToEnum>;

  if (walletSettled) {
    if (gatiCashApplied <= 0.005) {
      return {
        ok: false,
        code: "ZERO_PAYABLE_WITHOUT_WALLET",
        message: "This order has nothing to pay and no wallet amount to settle against.",
      };
    }
    // Re-check the balance at finalize time: the pending row may be up to 30 minutes old
    // and the customer could have spent the balance elsewhere in the meantime.
    const available = await getCustomerGatiCashAvailable(getSql(), Number(pending.customerId));
    if (available + 0.005 < gatiCashApplied && !pending.finalizedOrderId) {
      return {
        ok: false,
        code: "INSUFFICIENT_GATICASH",
        message: "Insufficient GatiCash balance. Please update wallet and try again.",
      };
    }
    // Gateway ids stay null — the wallet transaction id is the payment reference.
    razorpayOrderId = null;
    razorpayPaymentId = null;
    paymentMethodEnum = "wallet";
  } else {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return {
        ok: false,
        code: "PAYMENT_NOT_VERIFIED",
        message: "Payment details are missing. Please retry the payment.",
      };
    }
    const paymentCheck = await verifyRazorpayPaymentDetails(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      expectedAmountPaise,
      String(pending.currency ?? "INR")
    );
    if (!paymentCheck.ok) {
      return paymentCheck;
    }
    paymentMethodEnum = paymentMethodToEnum(paymentCheck.paymentMethod);
  }

  if (pending.finalizedOrderId) {
    const [existing] = await db
      .select({
        orderId: ordersCore.orderId,
        grandTotal: ordersCore.grandTotal,
        placedAt: ordersCore.placedAt,
        merchantStoreId: ordersCore.merchantStoreId,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
      })
      .from(ordersCore)
      .where(eq(ordersCore.orderId, pending.finalizedOrderId))
      .limit(1);
    if (existing?.orderId) {
      // Idempotent replay — still ensure First ETA exists (webhook/client race).
      void freezeEtaForPlacedOrder({
        orderIdText: existing.orderId,
        merchantStoreId: Number(existing.merchantStoreId) || pending.merchantStoreId,
        pickupLat: Number(existing.pickupLat ?? pending.pickupLat ?? 0) || 0,
        pickupLon: Number(existing.pickupLon ?? pending.pickupLon ?? 0) || 0,
        dropLat: Number(existing.dropLat ?? pending.dropLat ?? 0) || 0,
        dropLon: Number(existing.dropLon ?? pending.dropLon ?? 0) || 0,
        precomputedDistanceKm:
          existing.distanceKm != null
            ? Number(existing.distanceKm)
            : pending.distanceKm != null
              ? Number(pending.distanceKm)
              : null,
      });
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

  await enrichAddonsWithMenuPk(pending.merchantStoreId, items);

  // Pre-resolve commission outside the placement transaction. resolveStoreCommission
  // uses a separate pool connection; calling it inside db.transaction() can exhaust
  // the pool under load and hit statement_timeout, aborting paid orders.
  let storeCommission: ResolvedCommission | null = null;
  try {
    storeCommission = await resolveStoreCommission(pending.merchantStoreId);
  } catch (e) {
    console.warn(
      "[commission] pre-resolve before finalize failed — item snapshots may skip:",
      (e as Error).message,
    );
  }

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

  const dropLatNum = Number(dropLat);
  const dropLonNum = Number(dropLon);
  const cityHint =
    typeof pending.checkoutMetadata === "object" && pending.checkoutMetadata != null
      ? String((pending.checkoutMetadata as Record<string, unknown>).deliveryCity ?? "").trim() || null
      : null;

  // Mint (or reuse) a unique GatiCash payment txn id whenever wallet settles any portion.
  // Stored on pending.checkout_metadata so finalize + webhook retries share one reference.
  let gatiCashTxnId: string | null = null;
  let checkoutMetadataForTxn: Record<string, unknown> | null = null;
  if (walletSettled || gatiCashApplied > 0.005) {
    const ensured = ensureGatiCashTxnIdInCheckoutMetadata(pending.checkoutMetadata);
    gatiCashTxnId = ensured.gatiCashTxnId;
    checkoutMetadataForTxn = ensured.metadata;
    try {
      await db
        .update(pendingOrders)
        .set({
          checkoutMetadata: ensured.metadata,
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pending.pendingId));
    } catch (e) {
      console.warn("[gaticash] failed to persist gatiCashTxnId on pending:", (e as Error).message);
    }
  }

  let orderIdText: string | undefined;
  let orderCorePk: number | undefined;
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

      const { orderCorePk } = await insertPlacedOrderCoreWithTimelines(tx, {
        pending: {
          pendingId: pending.pendingId,
          customerId: pending.customerId,
          merchantStoreId: pending.merchantStoreId,
          merchantParentId: pending.merchantParentId,
          itemTotal: String(pending.itemTotal),
          addonTotal: pending.addonTotal != null ? String(pending.addonTotal) : null,
          grandTotal: String(pending.grandTotal),
          tipAmount: pending.tipAmount != null ? String(pending.tipAmount) : null,
          pickupAddressNormalized: pending.pickupAddressNormalized,
          deliveryAddress: pending.deliveryAddress,
          pickupLat: pending.pickupLat != null ? String(pending.pickupLat) : null,
          pickupLon: pending.pickupLon != null ? String(pending.pickupLon) : null,
          dropLat,
          dropLon,
          distanceKm: pending.distanceKm != null ? String(pending.distanceKm) : null,
          deliveryType: pending.deliveryType ?? "delivery",
          billingSnapshot: pending.billingSnapshot,
          billingRulesetVersion: pending.billingRulesetVersion,
          checkoutMetadata: pending.checkoutMetadata,
          createdAt: pending.createdAt,
          paymentStartedAt: pending.paymentStartedAt,
          currency: pending.currency,
        },
        orderIdText,
        items,
        paymentMethodEnum,
        razorpayOrderId,
        razorpayPaymentId,
        finalizedAt: new Date(),
      });

      const eligibilityByMenuId = new Map<string, boolean>();
      const snapElig =
        (pending.billingSnapshot as Record<string, unknown> | null)?.order_line_eligibility ??
        (pending.billingSnapshot as Record<string, unknown> | null)?.orderLineEligibility;
      if (Array.isArray(snapElig)) {
        for (const row of snapElig) {
          if (row == null || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const id = String(r.menuItemId ?? "").trim();
          if (!id) continue;
          const flag =
            typeof r.isDiscountEligible === "boolean"
              ? r.isDiscountEligible
              : typeof r.discountEligible === "boolean"
                ? r.discountEligible
                : undefined;
          if (flag !== undefined) eligibilityByMenuId.set(id, flag);
        }
      }

      const billingSnapRec = (pending.billingSnapshot as Record<string, unknown> | null) ?? null;
      const itemInserts = items.map((i, lineIndex) => {
        const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
        const lineTotal = i.basePrice * i.quantity + addonPerUnit * i.quantity;
        const pricing = orderLinePricingFieldsFromSnapshot(
          billingSnapRec,
          String(i.menuItemId),
          lineIndex,
          i.quantity,
          lineTotal,
        );
        const elig =
          pricing.isDiscountEligible ??
          eligibilityByMenuId.get(String(i.menuItemId)) ??
          (typeof (i as { isDiscountEligible?: boolean }).isDiscountEligible === "boolean"
            ? (i as { isDiscountEligible?: boolean }).isDiscountEligible
            : undefined);
        return {
          orderId: orderIdText,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          categoryName: null,
          vegNonveg: vegNonvegForPlacementItem(i.itemSnapshot),
          // DB column is bigint — only the numeric variant PK belongs here.
          // The text key (variantKey like "half/full") is captured in
          // itemSnapshot, and the human-readable label is in variantName.
          variantId: i.variantId ?? null,
          variantName: sanitizeOptional(i.variantName ?? "") ?? undefined,
          quantity: i.quantity,
          basePrice: sanitizeNumeric(i.basePrice),
          addonPrice: sanitizeNumeric(addonPerUnit),
          totalPrice: sanitizeNumeric(lineTotal),
          itemSnapshot: i.itemSnapshot ?? undefined,
          specialInstructions: i.specialInstructions ?? undefined,
          isDiscountEligible: elig,
          effectiveUnitPrice: pricing.effectiveUnitPrice,
          effectiveLineTotal: pricing.effectiveLineTotal,
          offerDiscountAmount: pricing.offerDiscountAmount,
          appliedOfferId: pricing.appliedOfferId,
          appliedOfferLabel: pricing.appliedOfferLabel,
          appliedOfferType: pricing.appliedOfferType,
          ineligibilityReason: pricing.ineligibilityReason,
        };
      });

      const insertedItems = await tx.insert(ordersCoreItems).values(itemInserts).returning({ id: ordersCoreItems.id });
      const orderIdNum = await resolveOrdersCorePk(
        tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
        orderIdText,
      );
      for (let idx = 0; idx < items.length; idx++) {
        const row = items[idx]!;
        const addons = row.addons;
        if (addons.length === 0) continue;
        const orderItemId = insertedItems[idx]?.id;
        if (orderItemId == null || orderIdNum == null) continue;
        await persistOrderItemAddonsWithSnapshots(
          tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
          {
            storeId: pending.merchantStoreId,
            orderIdNum,
            orderItemId: Number(orderItemId),
            addons,
            storeCommission,
          },
        );
      }

      // Lock the resolved commission %, merchant payout, customer-visible price,
      // and source rule onto each line so settlement is reproducible from a JOIN
      // (no JSON parsing required) and future rule changes never affect this order.
      const snapshotInputs = insertedItems
        .map((row, idx) => {
          if (row?.id == null) return null;
          const it = items[idx]!;
          return {
            orderIdText,
            orderItemId: Number(row.id),
            customerVisiblePerUnitRupees: Number(it.basePrice),
            quantity: it.quantity,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      await writeOrderItemCommissionSnapshots(
        tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
        pending.merchantStoreId,
        snapshotInputs,
        orderIdNum ?? undefined,
        storeCommission,
      );

      if (orderIdNum != null && orderIdNum > 0) {
        // Project each CTM line from its OWN just-frozen orders_core_items row (itemInserts[i] ↔
        // insertedItems[i], same insert order) — never a cross-item match against the billing
        // array. One item's offer can never leak onto another's snapshot.
        const ctmLines = buildCtmLineInputsFromFrozenItems(
          insertedItems.map((r, i) => {
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
              itemSnapshot: (ins.itemSnapshot as Record<string, unknown> | undefined) ?? null,
            };
          })
        );
        await writeMerchantCtmPricingSnapshots(
          tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
          {
            coreOrderId: orderIdNum,
            commissionPercent: storeCommission?.percent ?? 0,
            billingSnapshot: billingSnapRec,
            lines: ctmLines,
            commission: storeCommission,
          }
        );
      }

      // Full money trail on the payment row: total bill, every discount, GatiCash consumed,
      // and what actually cleared the gateway. Reconciliation reads this instead of
      // re-deriving amounts from the billing snapshot.
      const breakdown = buildOrderPaymentBreakdown(pending, {
        gatewayAmount: walletSettled ? 0 : Number(pending.grandTotal ?? 0),
        gatewayMethod: walletSettled ? null : paymentMethodEnum,
      });
      // Wallet-only: amount is the GatiCash that settled the bill (not ₹0). Gateway
      // amount stays 0 inside breakdown.gatewayAmount.
      // Mixed: persist total customer outlay (wallet + gateway) and stamp gateway=mixed
      // so refunds restore each source instead of Razorpay-only.
      const isMixedSettlement = breakdown.settlement === "mixed";
      const paymentRowAmount = walletSettled
        ? String(breakdown.gatiCashUsed > 0.005 ? breakdown.gatiCashUsed : breakdown.totalBillAmount)
        : isMixedSettlement
          ? String(
              Math.round((breakdown.gatiCashUsed + breakdown.gatewayAmount) * 100) / 100
            )
          : pending.grandTotal;
      const paymentGatewayStamp = walletSettled
        ? "gati_cash"
        : isMixedSettlement
          ? "mixed"
          : "razorpay";

      // 100% GatiCash → unique GC-{UUID} as payment.transaction_id (and wallet ledger key).
      // Mixed → Razorpay payment id remains primary; GatiCash txn stored in gateway_response.
      const paymentTransactionId = walletSettled
        ? (gatiCashTxnId as string)
        : (razorpayPaymentId as string);

      await tx.insert(ordersCorePayments).values({
        orderId: orderIdText,
        paymentGateway: paymentGatewayStamp,
        paymentMethod: paymentMethodEnum,
        transactionId: paymentTransactionId,
        amount: paymentRowAmount,
        currency: pending.currency ?? "INR",
        paymentStatus: "PAID",
        gatewayResponse: {
          ...(walletSettled
            ? {
                settledBy: "gati_cash_wallet",
                gatiCashTxnId,
              }
            : {
                razorpayPaymentId,
                razorpayOrderId,
                ...(isMixedSettlement
                  ? {
                      settledBy: "mixed",
                      gatiCashUsed: breakdown.gatiCashUsed,
                      gatewayAmount: breakdown.gatewayAmount,
                      gatiCashTxnId,
                    }
                  : gatiCashTxnId
                    ? { gatiCashTxnId }
                    : {}),
              }),
          breakdown: {
            ...breakdown,
            ...(gatiCashTxnId ? { gatiCashTxnId } : {}),
          },
        },
        paidAt: new Date(),
      });

      await tx
        .update(pendingOrders)
        .set({
          finalizedOrderId: orderIdText,
          finalizedAt: new Date(),
          updatedAt: new Date(),
          paymentState: PENDING_PAYMENT_STATES.FINALIZED,
          paymentVerifiedAt: new Date(),
          ...(checkoutMetadataForTxn ? { checkoutMetadata: checkoutMetadataForTxn } : {}),
          ...(razorpayOrderId ? { razorpayOrderId } : {}),
          ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        })
        .where(eq(pendingOrders.pendingId, pendingId));

      if (getEnv().OMS_LEDGER_SHADOW_WRITE) {
        await runInSavepoint(
          tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
          "oms_ledger_shadow",
          async () => {
            await persistOmsLedgerArtifacts(tx as unknown as PostgresJsDatabase<Record<string, unknown>>, {
              orderId: orderIdText,
              pendingId,
              pending,
              razorpayOrderId,
              razorpayPaymentId,
              paymentMethodEnum,
              gatiCashTxnId,
            });
          }
        );
      }

      await tx
        .update(pendingOrders)
        .set({
          finalizedOrderId: orderIdText,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pendingId));

      return { orderIdText, orderCorePk };
    });

    // NOTE: order_notifications outbox is intentionally NOT written here.
    // The deployed `order_notifications` table belongs to a different (legacy)
    // schema (extra required columns like `notification_type`) that doesn't
    // match `backend/src/db/schema.ts`. Writing to it always errored, polluting
    // logs without delivering anything since this app has no consumer for the
    // outbox today.
    //
    // When merchant/rider realtime notifications get wired up, do it via a
    // direct Supabase channel publish or a dedicated notifications table that
    // matches the schema in code. See order GM-* placement audit in
    // `payment_events` + `orders_core` itself for current observability.
    orderIdText = result.orderIdText;
    orderCorePk = result.orderCorePk;

    // Freeze ETA + first_eta_at outside the payment txn so Mapbox failures never
    // roll back a paid order. Await so new orders always have First ETA before
    // the client continues (errors are swallowed inside freezeEtaForPlacedOrder).
    await freezeEtaForPlacedOrder({
      orderIdText,
      merchantStoreId: pending.merchantStoreId,
      pickupLat: Number(pickupLat) || 0,
      pickupLon: Number(pickupLon) || 0,
      dropLat: dropLatNum || 0,
      dropLon: dropLonNum || 0,
      precomputedDistanceKm:
        pending.distanceKm != null ? Number(pending.distanceKm) : null,
    });

    if (orderCorePk != null && Number.isFinite(orderCorePk)) {
      void captureOrderWeatherSnapshot(db, {
        orderCorePk,
        orderIdText,
        dropLat: dropLatNum,
        dropLon: dropLonNum,
        cityHint,
      }).catch((e) => {
        console.warn("[weather] post-finalize snapshot skipped:", (e as Error).message);
      });

      // Guarantee Merchant CTM rows exist even if in-txn write was skipped/partial.
      void ensureMerchantCtmPricingSnapshotsForOrder(
        db as unknown as PostgresJsDatabase<Record<string, unknown>>,
        {
          coreOrderId: Number(orderCorePk),
          orderIdText,
          commissionPercent: storeCommission?.percent ?? 0,
        }
      );
    }
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
    const hint =
      typeof e?.message === "string" && e.message.trim() && e.message.length < 180
        ? ` (${e.message.trim()})`
        : "";
    return {
      ok: false,
      code: "ORDER_CREATION_FAILED",
      message: `Order could not be created. Please try again.${hint}`,
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

  void notifyMerchantStoreNewOrder(getSql(), {
    merchantStoreId: pending.merchantStoreId,
    orderIdText,
    grandTotal: Number(pending.grandTotal),
  }).catch((e) => {
    console.error("[merchant-new-order-notify] finalizeOrder failed:", e);
  });

  if (orderCorePk != null && Number.isFinite(orderCorePk)) {
    void import("../../lib/merchant-acceptance-deadline.js")
      .then(({ ensureMerchantAcceptanceDeadlineForFoodOrder }) =>
        ensureMerchantAcceptanceDeadlineForFoodOrder(getSql(), {
          orderCorePk,
          merchantStoreId: pending.merchantStoreId,
        })
      )
      .catch((e) => {
        console.error("[merchant-acceptance-deadline] finalizeOrder failed:", e);
      });
    void maybeStartOrderDispatch(orderCorePk);
  }

  const checkoutMeta =
    pending.checkoutMetadata && typeof pending.checkoutMetadata === "object"
      ? (pending.checkoutMetadata as Record<string, unknown>)
      : null;
  void import("../subscription/customer-subscription.service.js")
    .then(({ maybeActivateSubscriptionFromOrderMetadata }) =>
      maybeActivateSubscriptionFromOrderMetadata({
        customerId: Number(pending.customerId),
        checkoutMetadata: checkoutMeta,
        razorpayOrderId,
        razorpayPaymentId,
      })
    )
    .catch((e) => {
      console.error("[customer-subscription] post-finalize activation failed:", e);
    });

  const finalizeAdj = parseCheckoutGatiCashAdjustments(
    checkoutMeta,
    Number(pending.grandTotal ?? 0) +
      (Number(pending.gatiCashApplied ?? 0) +
        Number(pending.missedOfferDiscount ?? 0) -
        Number(pending.missedOfferWalletAdd ?? 0))
  );
  if (finalizeAdj.gatiCashApplied > 0.005 || finalizeAdj.missedOfferWalletAdd > 0.005) {
    const walletOps = fulfillCheckoutGatiCashWalletOps(getSql(), {
      customerInternalId: Number(pending.customerId),
      orderIdText,
      merchantStoreId: Number(pending.merchantStoreId),
      adjustments: finalizeAdj,
      gatiCashTxnId,
    });
    if (walletSettled) {
      // The wallet debit IS this order's payment — it has to land before we report success,
      // otherwise a placed order could exist with no money moved anywhere. Awaited (and
      // idempotent by the unique GatiCash txn id), unlike the gateway path where the debit
      // is a side settlement that can safely lag.
      try {
        await walletOps;
      } catch (e) {
        console.error("[gaticash] wallet-settled debit failed:", e);
        return {
          ok: false,
          code: "WALLET_DEBIT_FAILED",
          message: "Could not settle GatiCash for this order. Please try again.",
        };
      }
    } else {
      void walletOps.catch((e) => {
        console.error("[gaticash] post-finalize wallet ops failed:", e);
      });
    }
  }

  await logPaymentEvent(db, {
    eventType: walletSettled ? "ORDER_FINALIZED_WALLET_ONLY" : "ORDER_FINALIZED",
    source: "client",
    pendingId,
    orderId: orderIdText,
    razorpayOrderId: razorpayOrderId ?? undefined,
    razorpayPaymentId: razorpayPaymentId ?? undefined,
    newState: PENDING_PAYMENT_STATES.FINALIZED,
    amountPaise: expectedAmountPaise,
    payload: {
      breakdown: buildOrderPaymentBreakdown(pending, {
        gatewayAmount: walletSettled ? 0 : Number(pending.grandTotal ?? 0),
        gatewayMethod: walletSettled ? null : paymentMethodEnum,
      }),
    },
  });

  return {
    ok: true,
    orderId: orderIdText,
    status: "PLACED",
    totalAmount: Number(pending.grandTotal),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Payment lifecycle helpers (used by payment.routes.ts webhook ingress)
// ---------------------------------------------------------------------------

export const PENDING_PAYMENT_STATES = {
  CREATED: "created",
  PENDING_CONFIRMATION: "pending_confirmation",
  PAID: "paid",
  FINALIZED: "finalized",
  FAILED: "failed",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
  REFUND_FAILED: "refund_failed",
} as const;

/** Append a row to payment_events (audit log). Never throws — errors are swallowed. */
export async function logPaymentEvent(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    eventType: string;
    source: string;
    pendingId?: string | null;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
    orderId?: string | null;
    prevState?: string | null;
    newState?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    amountPaise?: number | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.insert(paymentEvents).values({
      eventType: args.eventType,
      source: args.source,
      pendingId: args.pendingId ?? null,
      razorpayOrderId: args.razorpayOrderId ?? null,
      razorpayPaymentId: args.razorpayPaymentId ?? null,
      orderId: args.orderId ?? null,
      prevState: args.prevState ?? null,
      newState: args.newState ?? null,
      amountPaise: args.amountPaise ?? null,
      failureCode: args.failureCode ?? null,
      failureMessage: args.failureMessage ?? null,
      payload: args.payload ?? {},
    });
  } catch {
    // audit log failures must never block payment processing
  }
}

/**
 * Called when Razorpay order is created for a pending checkout session.
 * Stores razorpayOrderId on the pending_orders row and flips state to
 * pending_confirmation so the customer's payment screen knows which gateway
 * order to present.
 */
export async function markPendingOrderPaymentStarted(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: { pendingId: string; razorpayOrderId: string }
): Promise<void> {
  const { pendingId, razorpayOrderId } = args;
  const env = getEnv();
  const confirmBy = new Date(Date.now() + env.PAYMENT_CONFIRM_WINDOW_MS);
  try {
    await db
      .update(pendingOrders)
      .set({
        razorpayOrderId,
        paymentState: PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
        paymentStartedAt: new Date(),
        paymentConfirmBy: confirmBy,
        updatedAt: new Date(),
      })
      .where(eq(pendingOrders.pendingId, pendingId));
  } catch {
    // non-fatal: worst case razorpayOrderId isn't persisted, webhook will still match
  }
}

/**
 * Webhook handler for payment.captured / order.paid.
 * Idempotent: if the order was already finalized by the client callback, returns ok=true.
 * If not yet finalized, runs the full order-creation transaction from the pending snapshot.
 */
export async function finalizePendingOrderFromWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    paymentMethod: string;
    gatewayPayload?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; code?: string }> {
  const { razorpayOrderId, razorpayPaymentId, paymentMethod, gatewayPayload } = args;

  // Pre-flight read (no lock) — fast path for the very common already-finalized case
  // and for missing-row errors. This avoids opening a tx in the easy paths.
  const [preflight] = await db
    .select({ pendingId: pendingOrders.pendingId, finalizedOrderId: pendingOrders.finalizedOrderId, paymentState: pendingOrders.paymentState })
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!preflight) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND" };
  }

  if (preflight.finalizedOrderId) {
    await logPaymentEvent(db, {
      eventType: "WEBHOOK_CAPTURED_IGNORED_ALREADY_FINALIZED",
      source: "webhook",
      pendingId: preflight.pendingId,
      razorpayOrderId,
      razorpayPaymentId,
      orderId: preflight.finalizedOrderId,
      prevState: preflight.paymentState,
      newState: preflight.paymentState,
      payload: gatewayPayload ?? {},
    });
    return { ok: true };
  }

  const paymentMethodEnum = paymentMethodToEnum(paymentMethod);

  try {
    // STRICT IDEMPOTENCY: take a row-level lock on the pending row inside the
    // transaction so that if two webhooks (e.g. payment.captured + order.paid
    // for the same payment) race here, only one wins. The loser sees the row
    // already finalized after the winner commits and returns idempotent ok.
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute<{
        id: number;
        pending_id: string;
        customer_id: number;
        merchant_store_id: number;
        merchant_parent_id: number | null;
        item_total: string;
        addon_total: string | null;
        grand_total: string;
        tip_amount: string | null;
        donation_amount: string | null;
        coupon_code: string | null;
        gati_cash_applied: string | null;
        missed_offer_discount: string | null;
        missed_offer_wallet_add: string | null;
        currency: string | null;
        items_snapshot: unknown;
        billing_snapshot: unknown;
        billing_ruleset_version: number | null;
        pickup_address_normalized: string | null;
        delivery_address: string | null;
        pickup_lat: string | null;
        pickup_lon: string | null;
        drop_lat: string | null;
        drop_lon: string | null;
        distance_km: string | null;
        finalized_order_id: string | null;
        payment_state: string | null;
        delivery_type: string | null;
      }>(sql`
        SELECT id, pending_id, customer_id, merchant_store_id, merchant_parent_id,
               item_total, addon_total, grand_total, tip_amount, donation_amount,
               coupon_code, gati_cash_applied, missed_offer_discount, missed_offer_wallet_add,
               currency,
               items_snapshot, billing_snapshot, billing_ruleset_version,
               checkout_metadata, created_at, payment_started_at,
               pickup_address_normalized, delivery_address,
               pickup_lat, pickup_lon, drop_lat, drop_lon, distance_km,
               finalized_order_id, payment_state, delivery_type
        FROM pending_orders
        WHERE razorpay_order_id = ${razorpayOrderId}
        FOR UPDATE
      `);
      const rows: Array<Record<string, unknown>> = Array.isArray(lockedRows)
        ? (lockedRows as Array<Record<string, unknown>>)
        : ((lockedRows as { rows?: unknown[] })?.rows as Array<Record<string, unknown>>) ?? [];
      const pending = rows[0] as
        | {
            pending_id: string;
            customer_id: number;
            merchant_store_id: number;
            merchant_parent_id: number | null;
            item_total: string;
            addon_total: string | null;
            grand_total: string;
            tip_amount: string | null;
            donation_amount: string | null;
            coupon_code: string | null;
            gati_cash_applied: string | null;
            missed_offer_discount: string | null;
            missed_offer_wallet_add: string | null;
            currency: string | null;
            items_snapshot: unknown;
            billing_snapshot: unknown;
            billing_ruleset_version: number | null;
            checkout_metadata: unknown;
            created_at: Date | string;
            payment_started_at: Date | string | null;
            pickup_address_normalized: string | null;
            delivery_address: string | null;
            pickup_lat: string | null;
            pickup_lon: string | null;
            drop_lat: string | null;
            drop_lon: string | null;
            distance_km: string | null;
            finalized_order_id: string | null;
            payment_state: string | null;
            delivery_type: string | null;
          }
        | undefined;

      if (!pending) {
        return { ok: false as const, code: "PENDING_ORDER_NOT_FOUND" };
      }

      // Race-loser path: another concurrent webhook already finalized while we
      // were waiting for the row lock. Return idempotent ok with the existing order.
      if (pending.finalized_order_id) {
        return { ok: true as const, alreadyFinalized: true, orderId: pending.finalized_order_id, prevState: pending.payment_state };
      }

      const norm = normalizeOrderItems(pending.items_snapshot);
      if (!norm.ok) {
        return { ok: false as const, code: norm.code };
      }
      const items = norm.items;
      await enrichAddonsWithMenuPk(Number(pending.merchant_store_id), items);

      let storeCommissionWebhook: ResolvedCommission | null = null;
      try {
        storeCommissionWebhook = await resolveStoreCommission(Number(pending.merchant_store_id));
      } catch (e) {
        console.warn(
          "[commission] pre-resolve before webhook finalize failed — item snapshots may skip:",
          (e as Error).message,
        );
      }

      const pickupRaw = sanitizeStringForDb(pending.pickup_address_normalized ?? undefined) ?? "";
      const dropRaw = sanitizeStringForDb(pending.delivery_address ?? undefined) ?? "";
      const pickupLat = pending.pickup_lat != null ? String(pending.pickup_lat) : "0";
      const pickupLon = pending.pickup_lon != null ? String(pending.pickup_lon) : "0";
      const dropLat = pending.drop_lat != null ? String(pending.drop_lat) : "0";
      const dropLon = pending.drop_lon != null ? String(pending.drop_lon) : "0";
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
        throw new Error(`order_id generation failed: ${JSON.stringify(seqResult)}`);
      }

      const { orderCorePk } = await insertPlacedOrderCoreWithTimelines(tx, {
        pending: {
          pendingId: pending.pending_id,
          customerId: Number(pending.customer_id),
          merchantStoreId: Number(pending.merchant_store_id),
          merchantParentId: pending.merchant_parent_id,
          itemTotal: String(pending.item_total),
          addonTotal: pending.addon_total != null ? String(pending.addon_total) : null,
          grandTotal: String(pending.grand_total),
          tipAmount: pending.tip_amount != null ? String(pending.tip_amount) : null,
          pickupAddressNormalized: pending.pickup_address_normalized,
          deliveryAddress: pending.delivery_address,
          pickupLat: pending.pickup_lat != null ? String(pending.pickup_lat) : null,
          pickupLon: pending.pickup_lon != null ? String(pending.pickup_lon) : null,
          dropLat,
          dropLon,
          distanceKm: pending.distance_km != null ? String(pending.distance_km) : null,
          deliveryType: pending.delivery_type ?? "delivery",
          billingSnapshot: pending.billing_snapshot,
          billingRulesetVersion: pending.billing_ruleset_version,
          checkoutMetadata: pending.checkout_metadata,
          createdAt: new Date(pending.created_at),
          paymentStartedAt: pending.payment_started_at
            ? new Date(pending.payment_started_at)
            : null,
          currency: pending.currency,
        },
        orderIdText,
        items,
        paymentMethodEnum,
        razorpayOrderId,
        razorpayPaymentId,
        finalizedAt: new Date(),
      });

      const eligibilityByMenuIdWh = new Map<string, boolean>();
      const snapEligWh =
        (pending.billing_snapshot as Record<string, unknown> | null)?.order_line_eligibility ??
        (pending.billing_snapshot as Record<string, unknown> | null)?.orderLineEligibility;
      if (Array.isArray(snapEligWh)) {
        for (const row of snapEligWh) {
          if (row == null || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const id = String(r.menuItemId ?? "").trim();
          if (!id) continue;
          const flag =
            typeof r.isDiscountEligible === "boolean"
              ? r.isDiscountEligible
              : typeof r.discountEligible === "boolean"
                ? r.discountEligible
                : undefined;
          if (flag !== undefined) eligibilityByMenuIdWh.set(id, flag);
        }
      }

      const billingSnapWh = (pending.billing_snapshot as Record<string, unknown> | null) ?? null;
      const itemInserts = items.map((i, lineIndex) => {
        const addonPerUnit = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity, 0);
        const lineTotal = i.basePrice * i.quantity + addonPerUnit * i.quantity;
        const pricing = orderLinePricingFieldsFromSnapshot(
          billingSnapWh,
          String(i.menuItemId),
          lineIndex,
          i.quantity,
          lineTotal,
        );
        return {
          orderId: orderIdText,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          categoryName: null as string | null,
          vegNonveg: vegNonvegForPlacementItem(i.itemSnapshot),
          // DB column is bigint — only the numeric variant PK belongs here.
          // The text key (variantKey like "half/full") is captured in
          // itemSnapshot, and the human-readable label is in variantName.
          variantId: i.variantId ?? null,
          variantName: sanitizeOptional(i.variantName ?? "") ?? undefined,
          quantity: i.quantity,
          basePrice: sanitizeNumeric(i.basePrice),
          addonPrice: sanitizeNumeric(addonPerUnit),
          totalPrice: sanitizeNumeric(lineTotal),
          itemSnapshot: i.itemSnapshot ?? undefined,
          specialInstructions: i.specialInstructions ?? undefined,
          isDiscountEligible:
            pricing.isDiscountEligible ?? eligibilityByMenuIdWh.get(String(i.menuItemId)),
          effectiveUnitPrice: pricing.effectiveUnitPrice,
          effectiveLineTotal: pricing.effectiveLineTotal,
          offerDiscountAmount: pricing.offerDiscountAmount,
          appliedOfferId: pricing.appliedOfferId,
          appliedOfferLabel: pricing.appliedOfferLabel,
          appliedOfferType: pricing.appliedOfferType,
          ineligibilityReason: pricing.ineligibilityReason,
        };
      });

      const insertedItems = await tx.insert(ordersCoreItems).values(itemInserts).returning({ id: ordersCoreItems.id });
      const orderIdNumWebhook = await resolveOrdersCorePk(
        tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
        orderIdText,
      );
      const storeIdWebhook = Number(pending.merchant_store_id);
      for (let idx = 0; idx < items.length; idx++) {
        const addons = items[idx]!.addons;
        if (addons.length === 0) continue;
        const orderItemId = insertedItems[idx]?.id;
        if (orderItemId == null || orderIdNumWebhook == null) continue;
        await persistOrderItemAddonsWithSnapshots(
          tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
          {
            storeId: storeIdWebhook,
            orderIdNum: orderIdNumWebhook,
            orderItemId: Number(orderItemId),
            addons,
            storeCommission: storeCommissionWebhook,
          },
        );
      }

      // Commission snapshot (webhook finalize path) — see writeOrderItemCommissionSnapshots for rationale.
      const snapshotInputs = insertedItems
        .map((row, idx) => {
          if (row?.id == null) return null;
          const it = items[idx]!;
          return {
            orderIdText,
            orderItemId: Number(row.id),
            customerVisiblePerUnitRupees: Number(it.basePrice),
            quantity: it.quantity,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      await writeOrderItemCommissionSnapshots(
        tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
        storeIdWebhook,
        snapshotInputs,
        orderIdNumWebhook ?? undefined,
        storeCommissionWebhook,
      );

      if (orderIdNumWebhook != null && orderIdNumWebhook > 0) {
        // Same leak-proof projection as the finalize path: each CTM line comes from its own
        // frozen orders_core_items row (itemInserts[i] ↔ insertedItems[i]).
        const ctmLines = buildCtmLineInputsFromFrozenItems(
          insertedItems.map((r, i) => {
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
              itemSnapshot: (ins.itemSnapshot as Record<string, unknown> | undefined) ?? null,
            };
          })
        );
        await writeMerchantCtmPricingSnapshots(
          tx as unknown as PostgresJsDatabase<Record<string, unknown>>,
          {
            coreOrderId: orderIdNumWebhook,
            commissionPercent: storeCommissionWebhook?.percent ?? 0,
            billingSnapshot: billingSnapWh,
            lines: ctmLines,
            commission: storeCommissionWebhook,
          }
        );
      }

      await tx.insert(ordersCorePayments).values({
        orderId: orderIdText,
        paymentGateway: "razorpay",
        paymentMethod: paymentMethodEnum,
        transactionId: razorpayPaymentId,
        amount: pending.grand_total,
        currency: pending.currency ?? "INR",
        paymentStatus: "PAID",
        gatewayResponse: (() => {
          const whBreakdown = buildOrderPaymentBreakdown(
            {
              itemTotal: pending.item_total,
              addonTotal: pending.addon_total,
              tipAmount: pending.tip_amount,
              donationAmount: pending.donation_amount,
              grandTotal: pending.grand_total,
              currency: pending.currency,
              couponCode: pending.coupon_code,
              gatiCashApplied: pending.gati_cash_applied,
              missedOfferDiscount: pending.missed_offer_discount,
              missedOfferWalletAdd: pending.missed_offer_wallet_add,
              billingSnapshot: pending.billing_snapshot,
            },
            {
              gatewayAmount: Number(pending.grand_total ?? 0),
              gatewayMethod: paymentMethodEnum,
            }
          );
          const meta =
            pending.checkout_metadata && typeof pending.checkout_metadata === "object"
              ? (pending.checkout_metadata as Record<string, unknown>)
              : null;
          const ensured = ensureGatiCashTxnIdInCheckoutMetadata(meta);
          const gatiCashTxnId =
            Number(pending.gati_cash_applied ?? 0) > 0.005 ? ensured.gatiCashTxnId : null;
          return {
            razorpayPaymentId,
            razorpayOrderId,
            via: "webhook",
            ...(gatiCashTxnId ? { gatiCashTxnId } : {}),
            // Same money trail as the client finalize path, so support and reconciliation see
            // one shape regardless of which side won the race.
            breakdown: {
              ...whBreakdown,
              ...(gatiCashTxnId ? { gatiCashTxnId } : {}),
            },
          };
        })(),
        paidAt: new Date(),
      });

      await tx
        .update(pendingOrders)
        .set({
          finalizedOrderId: orderIdText,
          finalizedAt: new Date(),
          razorpayPaymentId,
          paymentState: PENDING_PAYMENT_STATES.FINALIZED,
          paymentVerifiedAt: new Date(),
          lastGatewayPayload: gatewayPayload ?? null,
          updatedAt: new Date(),
        })
        .where(eq(pendingOrders.pendingId, pending.pending_id));

      return {
        ok: true as const,
        alreadyFinalized: false,
        orderId: orderIdText,
        orderCorePk,
        prevState: pending.payment_state,
        pendingIdValue: pending.pending_id,
      };
    });

    if (!result.ok) {
      return { ok: false, code: result.code };
    }

    if (result.orderId && result.orderCorePk != null && Number.isFinite(result.orderCorePk)) {
      void ensureMerchantCtmPricingSnapshotsForOrder(
        db as unknown as PostgresJsDatabase<Record<string, unknown>>,
        {
          coreOrderId: Number(result.orderCorePk),
          orderIdText: String(result.orderId),
          commissionPercent: undefined,
        }
      );
    }

    if (result.orderId && result.pendingIdValue) {
      void (async () => {
        try {
          const [pendingRow] = await db
            .select({
              customerId: pendingOrders.customerId,
              merchantStoreId: pendingOrders.merchantStoreId,
              checkoutMetadata: pendingOrders.checkoutMetadata,
              grandTotal: pendingOrders.grandTotal,
              gatiCashApplied: pendingOrders.gatiCashApplied,
              missedOfferDiscount: pendingOrders.missedOfferDiscount,
              missedOfferWalletAdd: pendingOrders.missedOfferWalletAdd,
            })
            .from(pendingOrders)
            .where(eq(pendingOrders.pendingId, result.pendingIdValue!))
            .limit(1);
          if (!pendingRow) return;
          const checkoutMeta =
            pendingRow.checkoutMetadata && typeof pendingRow.checkoutMetadata === "object"
              ? (pendingRow.checkoutMetadata as Record<string, unknown>)
              : null;

          // The webhook can beat the client's finalize call, in which case this is the only
          // place the GatiCash debit happens. Without it a partly-wallet-paid order would
          // leave the customer's balance untouched. Idempotent by the unique GatiCash txn id
          // (also recoverable from orders_core_payments / pending checkout_metadata).
          const adj = parseCheckoutGatiCashAdjustments(
            checkoutMeta,
            Number(pendingRow.grandTotal ?? 0) +
              (Number(pendingRow.gatiCashApplied ?? 0) +
                Number(pendingRow.missedOfferDiscount ?? 0) -
                Number(pendingRow.missedOfferWalletAdd ?? 0))
          );
          if (adj.gatiCashApplied > 0.005 || adj.missedOfferWalletAdd > 0.005) {
            try {
              const metaTxn =
                checkoutMeta && typeof checkoutMeta === "object"
                  ? String(
                      (checkoutMeta as Record<string, unknown>).gatiCashTxnId ??
                        (checkoutMeta as Record<string, unknown>).gati_cash_txn_id ??
                        ""
                    ).trim() || null
                  : null;
              await fulfillCheckoutGatiCashWalletOps(getSql(), {
                customerInternalId: Number(pendingRow.customerId),
                orderIdText: String(result.orderId),
                merchantStoreId: Number(pendingRow.merchantStoreId),
                adjustments: adj,
                gatiCashTxnId: metaTxn,
              });
            } catch (e) {
              console.error("[gaticash] webhook post-finalize wallet ops failed:", e);
            }
          }

          const { maybeActivateSubscriptionFromOrderMetadata } = await import(
            "../subscription/customer-subscription.service.js"
          );
          await maybeActivateSubscriptionFromOrderMetadata({
            customerId: Number(pendingRow.customerId),
            checkoutMetadata: checkoutMeta,
            razorpayOrderId,
            razorpayPaymentId,
          });
        } catch (e) {
          console.error("[customer-subscription] webhook post-finalize activation failed:", e);
        }
      })();
    }

    // See note in finalizeOrder — outbox writes are disabled until the
    // deployed schema matches `backend/src/db/schema.ts`.

    if (result.alreadyFinalized) {
      // Race-loser: another concurrent webhook finalized while we waited for the lock.
      await logPaymentEvent(db, {
        eventType: "WEBHOOK_CAPTURED_RACE_LOSER",
        source: "webhook",
        pendingId: preflight.pendingId,
        razorpayOrderId,
        razorpayPaymentId,
        orderId: result.orderId ?? null,
        prevState: result.prevState ?? null,
        newState: result.prevState ?? null,
        payload: gatewayPayload ?? {},
      });
      return { ok: true };
    }

    // Freeze First ETA BEFORE notifying the merchant so accept/SLA never race
    // a null first_eta_at. Still outside the payment txn; failures are non-fatal.
    if (result.orderId) {
      void (async () => {
        try {
          const [oc] = await db.execute(
            sql`
              SELECT id, merchant_store_id, grand_total::text AS grand_total, pickup_lat::text AS pickup_lat,
                     pickup_lon::text AS pickup_lon, drop_lat::text AS drop_lat,
                     drop_lon::text AS drop_lon, distance_km::text AS distance_km
              FROM orders_core
              WHERE order_id = ${result.orderId}
              LIMIT 1
            `
          ) as unknown as Array<Record<string, unknown>>;
          if (!oc) return;
          const coreOrderPk = Number(oc.id);
          await freezeEtaForPlacedOrder({
            orderIdText: result.orderId,
            merchantStoreId: Number(oc.merchant_store_id),
            pickupLat: Number(oc.pickup_lat ?? 0),
            pickupLon: Number(oc.pickup_lon ?? 0),
            dropLat: Number(oc.drop_lat ?? 0),
            dropLon: Number(oc.drop_lon ?? 0),
            precomputedDistanceKm:
              oc.distance_km != null ? Number(oc.distance_km) : null,
          });
          if (Number.isFinite(coreOrderPk) && coreOrderPk > 0) {
            void maybeStartOrderDispatch(coreOrderPk);
          }
          await notifyMerchantStoreNewOrder(getSql(), {
            merchantStoreId: Number(oc.merchant_store_id),
            orderIdText: result.orderId,
            grandTotal: Number(oc.grand_total ?? 0),
          });
        } catch (e) {
          console.warn("[eta] webhook-path post-place hooks failed (non-fatal)", {
            orderId: result.orderId,
            err: (e as Error).message,
          });
        }
      })();
    }

    await logPaymentEvent(db, {
      eventType: "WEBHOOK_PAYMENT_CAPTURED",
      source: "webhook",
      pendingId: result.pendingIdValue ?? preflight.pendingId,
      razorpayOrderId,
      razorpayPaymentId,
      orderId: result.orderId ?? null,
      prevState: result.prevState ?? null,
      newState: PENDING_PAYMENT_STATES.FINALIZED,
      payload: gatewayPayload ?? {},
    });

    return { ok: true };
  } catch (err) {
    console.error("[webhook] finalizePendingOrderFromWebhook failed:", err);
    await logPaymentEvent(db, {
      eventType: "WEBHOOK_FINALIZATION_FAILED",
      source: "webhook",
      pendingId: preflight.pendingId,
      razorpayOrderId,
      razorpayPaymentId,
      failureMessage: (err as Error)?.message ?? "unknown",
      payload: gatewayPayload ?? {},
    });
    return { ok: false, code: "ORDER_CREATION_FAILED" };
  }
}

/**
 * Webhook handler for payment.failed.
 * Idempotent: does not regress an already-finalized row.
 */
export async function markPendingOrderFailedFromWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    razorpayOrderId: string;
    razorpayPaymentId?: string | null;
    failureCode: string;
    failureMessage: string;
    gatewayPayload?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; pendingId?: string; code?: string }> {
  const { razorpayOrderId, razorpayPaymentId, failureCode, failureMessage, gatewayPayload } = args;

  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!pending) {
    return { ok: false, code: "PENDING_ORDER_NOT_FOUND" };
  }

  // Do not regress a finalized row — reordered webhook events happen.
  if (pending.paymentState === PENDING_PAYMENT_STATES.FINALIZED || pending.finalizedOrderId) {
    await logPaymentEvent(db, {
      eventType: "WEBHOOK_FAILED_IGNORED_ALREADY_FINALIZED",
      source: "webhook",
      pendingId: pending.pendingId,
      razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId ?? null,
      orderId: pending.finalizedOrderId ?? null,
      prevState: pending.paymentState,
      newState: pending.paymentState,
      failureCode,
      failureMessage,
      payload: gatewayPayload ?? {},
    });
    return { ok: true, pendingId: pending.pendingId };
  }

  await db
    .update(pendingOrders)
    .set({
      paymentState: PENDING_PAYMENT_STATES.FAILED,
      paymentFailureCode: failureCode,
      paymentFailureMessage: failureMessage,
      razorpayPaymentId: razorpayPaymentId ?? pending.razorpayPaymentId,
      lastGatewayPayload: gatewayPayload ?? null,
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pending.pendingId));

  await logPaymentEvent(db, {
    eventType: "WEBHOOK_PAYMENT_FAILED",
    source: "webhook",
    pendingId: pending.pendingId,
    razorpayOrderId,
    razorpayPaymentId: razorpayPaymentId ?? null,
    prevState: pending.paymentState,
    newState: PENDING_PAYMENT_STATES.FAILED,
    failureCode,
    failureMessage,
    payload: gatewayPayload ?? {},
  });

  return { ok: true, pendingId: pending.pendingId };
}

/**
 * Webhook handler for refund.created / refund.processed / refund.failed.
 * Looks up the pending order by razorpayPaymentId.
 */
export async function applyRefundWebhook(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    eventType: "refund.created" | "refund.processed" | "refund.failed" | string;
    razorpayPaymentId: string;
    refundId: string;
    refundStatus?: string | null;
    gatewayPayload?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; pendingId?: string; code?: string }> {
  const { eventType, razorpayPaymentId, refundId, gatewayPayload } = args;

  // Fan-out: if a dashboard-initiated order refund routed through Razorpay,
  // flip its execution_status from PROCESSING → COMPLETED. Idempotent and
  // scoped by razorpay_refund_id, so it's a no-op when no dashboard refund
  // matches (e.g. refund initiated directly on the Razorpay dashboard).
  //
  // NOTE: this must run independently of the pending_orders lookup below — a
  // dashboard order refund is keyed only by razorpay_refund_id and may have no
  // matching pending_orders row (finalized orders, manual replays). Running it
  // via a helper guarantees it fires on BOTH the early-return and normal paths.
  const runOrderRefundFanout = async (): Promise<void> => {
    if (eventType !== "refund.processed") return;
    try {
      const { completeOrderRefundFromRazorpayWebhook } = await import(
        "./order-refund-executor.js"
      );
      await completeOrderRefundFromRazorpayWebhook({
        razorpayRefundId: refundId,
        razorpayPaymentId,
        refundStatus: args.refundStatus ?? null,
        gatewayPayload: gatewayPayload ?? {},
      });
    } catch (err) {
      // Never fail the webhook because of a dashboard-refund side-effect.
      console.warn(
        "[applyRefundWebhook] order-refund executor sync failed:",
        (err as Error)?.message ?? err
      );
    }
  };

  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.razorpayPaymentId, razorpayPaymentId))
    .limit(1);

  if (!pending) {
    // Refund for a payment not in our pending_orders (e.g. manual refund) — log and ack.
    await logPaymentEvent(db, {
      eventType: eventType.toUpperCase().replace(".", "_"),
      source: "webhook",
      razorpayPaymentId,
      payload: { refundId, ...gatewayPayload },
    });
    // Still complete any dashboard order refund keyed by this razorpay_refund_id.
    await runOrderRefundFanout();
    return { ok: true };
  }

  let newPaymentState: string = pending.paymentState;
  let newRefundStatus: string = pending.refundStatus ?? "refund_pending";
  let auditEventType: string;

  if (eventType === "refund.processed") {
    newPaymentState = PENDING_PAYMENT_STATES.REFUNDED;
    newRefundStatus = "refunded";
    auditEventType = "REFUND_PROCESSED";
  } else if (eventType === "refund.failed") {
    newPaymentState = PENDING_PAYMENT_STATES.REFUND_PENDING;
    newRefundStatus = "refund_failed";
    auditEventType = "REFUND_FAILED_WEBHOOK";
  } else {
    // refund.created
    newPaymentState = PENDING_PAYMENT_STATES.REFUND_PENDING;
    newRefundStatus = "refund_pending";
    auditEventType = "REFUND_CREATED";
  }

  await db
    .update(pendingOrders)
    .set({
      paymentState: newPaymentState,
      refundStatus: newRefundStatus,
      refundReference: refundId,
      refundInitiatedAt: pending.refundInitiatedAt ?? new Date(),
      lastGatewayPayload: gatewayPayload ?? null,
      updatedAt: new Date(),
    })
    .where(eq(pendingOrders.pendingId, pending.pendingId));

  await logPaymentEvent(db, {
    eventType: auditEventType,
    source: "webhook",
    pendingId: pending.pendingId,
    razorpayOrderId: pending.razorpayOrderId ?? null,
    razorpayPaymentId,
    orderId: pending.finalizedOrderId ?? null,
    prevState: pending.paymentState,
    newState: newPaymentState,
    payload: { refundId, ...gatewayPayload },
  });

  // Complete any dashboard order refund keyed by this razorpay_refund_id
  // (see runOrderRefundFanout above — the pending_orders update already
  // succeeded, so this side-effect must never fail the webhook).
  await runOrderRefundFanout();

  return { ok: true, pendingId: pending.pendingId };
}

/**
 * Background reconciler: sweep pending_orders rows whose paymentConfirmBy has
 * elapsed and are still in an unresolved state. Marks them FAILED so the
 * customer cart unlocks and the app shows an appropriate error.
 *
 * When PAYMENT_LATE_CAPTURE_POLICY=finalize, rows whose razorpayPaymentId is
 * already set (payment actually came through after the TTL) are finalized
 * instead of failed.
 */
export async function reconcilePendingPayments(
  db: PostgresJsDatabase<Record<string, unknown>>
): Promise<void> {
  const env = getEnv();
  const now = new Date();

  const staleStates = [
    PENDING_PAYMENT_STATES.CREATED,
    PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
  ];

  let stalePending: (typeof pendingOrders.$inferSelect)[] = [];
  try {
    stalePending = await db
      .select()
      .from(pendingOrders)
      .where(
        and(
          inArray(pendingOrders.paymentState, staleStates),
          lt(pendingOrders.paymentConfirmBy, now)
        )
      )
      .limit(50);
  } catch {
    return; // DB unavailable; retry next tick
  }

  for (const row of stalePending) {
    try {
      if (row.finalizedOrderId) continue; // already finalized

      if (
        env.PAYMENT_LATE_CAPTURE_POLICY === "finalize" &&
        row.razorpayPaymentId
      ) {
        await finalizePendingOrderFromWebhook(db, {
          razorpayOrderId: row.razorpayOrderId ?? "",
          razorpayPaymentId: row.razorpayPaymentId,
          paymentMethod: row.paymentMethod ?? "online",
          gatewayPayload: { via: "reconciler", policy: "finalize" },
        });
        continue;
      }

      await db
        .update(pendingOrders)
        .set({
          paymentState: PENDING_PAYMENT_STATES.FAILED,
          paymentFailureCode: "PAYMENT_TIMEOUT",
          paymentFailureMessage: "Payment confirmation window expired.",
          updatedAt: now,
        })
        .where(eq(pendingOrders.pendingId, row.pendingId));

      await logPaymentEvent(db, {
        eventType: "RECONCILER_TIMEOUT_FAILED",
        source: "reconciler",
        pendingId: row.pendingId,
        razorpayOrderId: row.razorpayOrderId ?? null,
        razorpayPaymentId: row.razorpayPaymentId ?? null,
        prevState: row.paymentState,
        newState: PENDING_PAYMENT_STATES.FAILED,
        failureCode: "PAYMENT_TIMEOUT",
        failureMessage: "Payment confirmation window expired.",
        payload: { policy: env.PAYMENT_LATE_CAPTURE_POLICY },
      });
    } catch {
      // non-fatal: skip this row, retry next sweep
    }
  }
}
