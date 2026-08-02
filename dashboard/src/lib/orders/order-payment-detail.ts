/**
 * Order payment card + modal — amounts from orders_core, billing_snapshot,
 * payment_intents / payment_transactions (canonical capture), plus
 * pending_orders / payment_events / timelines for Razorpay ids.
 * Total CTM = merchant-visible bill total (same as partnersite / merchant app).
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { merchantOrderTotalFromBilling } from "@/lib/merchant-visible-pricing";
import {
  orderDiscountGrantedSummaryFromBilling,
  parseBillingSnapshot,
  discountTotalFromBilling,
  type OrderDiscountOfferSource,
} from "@/lib/merchant-billing-discount";
import { computeMerchantCtmForPartnerOrder } from "@/lib/merchant-order-ctm";
import { resolveDeliveryFeeDisplayFromBilling } from "@/lib/orderItemsPayload";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  formatPaymentInstrumentSource,
  formatPaymentModeOnlineOrCash,
} from "@/lib/orders/order-payment-display";
import type { OrderPaymentDetail, OrderPaymentRecord } from "@/lib/orders/order-payment-types";
import { resolveCustomerCtcPaidAmount } from "@/lib/orders/customer-ctc";

export type { OrderPaymentDetail, OrderPaymentRecord } from "@/lib/orders/order-payment-types";
export {
  formatPaymentInstrumentSource,
  formatPaymentModeOnlineOrCash,
} from "@/lib/orders/order-payment-display";

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Real Razorpay payment capture id only — never GatiCash / legacy wallet keys. */
function asRazorpayPaymentId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/^(gaticash_|order_gaticash_|ride_gaticash_|GC-)/i.test(t)) return null;
  return /^pay_[A-Za-z0-9]+$/.test(t) ? t : null;
}

function asRazorpayOrderId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return /^order_[A-Za-z0-9]+$/.test(t) ? t : null;
}

/** Normalize drizzle / postgres-js execute results to a plain row array. */
/**
 * Run a read whose table/columns are optional on older envs. Never throws —
 * mirrors the per-query try/catch these reads used when they ran serially.
 */
async function safeRows(query: PromiseLike<unknown>): Promise<Record<string, unknown>[]> {
  try {
    return rowsOf(await query);
  } catch {
    return [];
  }
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  return parseBillingSnapshot(raw);
}

function gatiCashFromBilling(billing: Record<string, unknown> | null): number | null {
  if (!billing) return null;
  const direct =
    asNum(billing.gati_cash_applied) ??
    asNum(billing.gatiCashApplied) ??
    asNum(billing.gati_cash_amount) ??
    asNum(billing.gatiCashAmount);
  if (direct != null && direct > 0) return round2(direct);

  const adj = billing.checkout_adjustments ?? billing.checkoutAdjustments;
  if (adj && typeof adj === "object") {
    const a = adj as Record<string, unknown>;
    const fromAdj = asNum(a.gatiCashApplied) ?? asNum(a.gati_cash_applied);
    if (fromAdj != null && fromAdj > 0) return round2(fromAdj);
    const lines = Array.isArray(a.lines) ? a.lines : [];
    let sum = 0;
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const row = line as Record<string, unknown>;
      if (String(row.kind ?? "") !== "gati_cash_applied") continue;
      sum += Math.abs(asNum(row.amount) ?? 0);
    }
    if (sum > 0.005) return round2(sum);
  }

  const meta = billing.checkout_metadata ?? billing.checkoutMetadata;
  if (meta && typeof meta === "object") {
    const fromMeta =
      asNum((meta as Record<string, unknown>).gatiCashAmount) ??
      asNum((meta as Record<string, unknown>).gati_cash_amount);
    if (fromMeta != null && fromMeta > 0) return round2(fromMeta);
  }
  return null;
}

async function fetchDiscountFromOrderTables(input: {
  orderCoreId: number;
  orderIdText: string | null;
  formattedOrderId: string | null;
}): Promise<{ amount: number | null; offerSource: OrderDiscountOfferSource | null }> {
  const db = getDb();
  const textIds = [
    input.orderIdText?.trim(),
    input.formattedOrderId?.trim(),
  ].filter((v): v is string => Boolean(v));

  for (const orderText of textIds) {
    try {
      const rows = await db.execute(sql`
        SELECT discount_total
        FROM order_bill_summary_versions
        WHERE order_id = ${orderText}
        ORDER BY version_no DESC
        LIMIT 1
      `);
      const total = asNum((rows as unknown as Record<string, unknown>[])[0]?.discount_total);
      if (total != null && total > 0) {
        return { amount: round2(total), offerSource: null };
      }
    } catch {
      /* table may not exist */
    }
  }

  for (const orderText of textIds) {
    try {
      const rows = await db.execute(sql`
        SELECT amount, funding_type
        FROM order_discount_lines
        WHERE order_id = ${orderText}
        ORDER BY line_no ASC
      `);
      const lines = rows as unknown as Array<{
        amount?: unknown;
        funding_type?: unknown;
      }>;
      if (lines.length === 0) continue;

      let sum = 0;
      const funding = new Set<string>();
      for (const line of lines) {
        sum += Math.abs(asNum(line.amount) ?? 0);
        if (line.funding_type != null) {
          funding.add(String(line.funding_type).toUpperCase());
        }
      }
      if (sum <= 0) continue;

      let offerSource: OrderDiscountOfferSource | null = null;
      if (funding.size === 1) {
        const only = [...funding][0];
        if (only.includes("MERCHANT") || only.includes("STORE")) {
          offerSource = "Store";
        } else if (only.includes("PLATFORM")) {
          offerSource = "Platform";
        }
      } else if (funding.size > 1) {
        offerSource = "Mixed";
      }
      return { amount: round2(sum), offerSource };
    } catch {
      /* table may not exist */
    }
  }

  const lookupIds = new Set<number>([input.orderCoreId]);
  for (const orderText of textIds) {
    const digits = orderText.replace(/\D/g, "");
    if (digits) {
      const n = Number(digits);
      if (Number.isFinite(n) && n > 0) lookupIds.add(n);
    }
  }

  for (const lookupId of lookupIds) {
    try {
      const rows = await db.execute(sql`
        SELECT discount_amount, offer_source, platform_share, merchant_share
        FROM offer_order_applications
        WHERE order_id = ${lookupId}
      `);
      const apps = rows as unknown as Array<{
        discount_amount?: unknown;
        offer_source?: unknown;
        platform_share?: unknown;
        merchant_share?: unknown;
      }>;
      if (apps.length === 0) continue;

      let sum = 0;
      let platformShare = 0;
      let merchantShare = 0;
      for (const app of apps) {
        const amt = Math.abs(asNum(app.discount_amount) ?? 0);
        sum += amt;
        platformShare += Math.abs(asNum(app.platform_share) ?? 0);
        merchantShare += Math.abs(asNum(app.merchant_share) ?? 0);
      }
      if (sum <= 0) continue;

      let offerSource: OrderDiscountOfferSource | null = null;
      const sources = new Set(
        apps.map((a) => String(a.offer_source ?? "").toUpperCase()).filter(Boolean),
      );
      if (sources.size === 1) {
        const only = [...sources][0];
        offerSource =
          only === "MERCHANT" ? "Store" : only === "PLATFORM" || only === "COUPON" ? "Platform" : null;
      } else if (sources.size > 1) {
        offerSource = "Mixed";
      } else if (merchantShare > 0.01 && platformShare > 0.01) {
        offerSource = "Mixed";
      } else if (merchantShare > 0.01) {
        offerSource = "Store";
      } else if (platformShare > 0.01) {
        offerSource = "Platform";
      }

      return { amount: round2(sum), offerSource };
    } catch {
      /* table may not exist */
    }
  }

  return { amount: null, offerSource: null };
}

function merchantItemSubtotalFromBilling(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): number {
  return (
    round2(
      (asNum(billing?.item_total) ?? 0) + (asNum(billing?.addon_total) ?? 0)
    ) ||
    round2((asNum(core.item_total) ?? 0) + (asNum(core.addon_total) ?? 0))
  );
}

function merchantGrossFromBilling(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): number {
  return merchantItemSubtotalFromBilling(billing, core);
}

function cashbackFromBilling(billing: Record<string, unknown> | null): number | null {
  if (!billing) return null;
  let sum = 0;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const label = String(row.label ?? "").toLowerCase();
    const kind = String(row.kind ?? "").toLowerCase();
    if (label.includes("cashback") || kind === "cashback") {
      sum += asNum(row.amount) ?? 0;
    }
  }
  const meta = billing.cashback_amount ?? billing.cashbackAmount;
  if (meta != null) sum += asNum(meta) ?? 0;
  return sum > 0 ? round2(sum) : null;
}

function resolveDeliveryFee(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>,
  settlementDelivery: number | null
): { fee: number | null; quoted: number | null; waived: boolean } {
  const fromSnap = resolveDeliveryFeeDisplayFromBilling(billing);
  if (fromSnap.waived && fromSnap.quoted != null) {
    return { fee: fromSnap.quoted, quoted: fromSnap.quoted, waived: true };
  }

  const fromBilling = asNum(billing?.delivery_fee);
  const quoted =
    fromSnap.quoted ??
    asNum(billing?.deliveryFeeQuotedInr ?? billing?.delivery_fee_quoted);
  const fee =
    (fromBilling != null ? fromBilling : null) ??
    settlementDelivery ??
    asNum(core.total_delivery_fee) ??
    (quoted != null && quoted > 0 ? quoted : null);
  return {
    fee: fee != null ? round2(Math.max(0, fee)) : null,
    quoted: quoted != null && quoted > 0 ? round2(quoted) : null,
    waived: false,
  };
}

/** Public order id variants used across payment_intents / payment_transactions / pending_orders. */
function collectOrderIdCandidates(input: {
  orderCoreId: number;
  orderIdText: string | null;
  formattedOrderId: string | null;
  displayId: string;
}): string[] {
  const raw = [
    input.orderIdText,
    input.formattedOrderId,
    input.displayId,
    String(input.orderCoreId),
  ];
  const out = new Set<string>();
  const add = (v: string) => {
    const s = v.trim();
    if (!s) return;
    out.add(s);
    out.add(s.replace(/^#/, ""));
    out.add(s.replace(/-/g, ""));
    out.add(s.replace(/^#/, "").replace(/-/g, ""));
    // GM100044 ↔ GMF100044 (core seq vs formatted public id)
    if (/^GMF\d+/i.test(s)) out.add(s.replace(/^GMF/i, "GM"));
    if (/^GM\d+/i.test(s) && !/^GMF/i.test(s)) out.add(s.replace(/^GM/i, "GMF"));
  };
  for (const v of raw) {
    if (v == null) continue;
    add(String(v));
  }
  return [...out];
}

type CapturedPaymentRow = {
  transactionId: number;
  intentId: string | null;
  gateway: string | null;
  paymentMode: string | null;
  transactionReference: string | null;
  status: string | null;
  amount: number | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
};

async function fetchCapturedPayments(
  orderIdCandidates: string[]
): Promise<CapturedPaymentRow[]> {
  if (orderIdCandidates.length === 0) return [];
  const db = getDb();
  try {
    const rows = rowsOf(
      await db.execute(sql`
      SELECT
        pt.id AS transaction_id,
        pi.intent_id,
        pt.gateway,
        pt.payment_mode,
        pt.transaction_reference,
        pt.status,
        pt.amount::text AS amount,
        pt.raw_response,
        pi.metadata AS intent_metadata
      FROM payment_transactions pt
      LEFT JOIN payment_intents pi ON pi.id = pt.payment_intent_id
      WHERE pt.order_id IN (${sql.join(
        orderIdCandidates.map((id) => sql`${id}`),
        sql`, `
      )})
         OR pi.order_id IN (${sql.join(
           orderIdCandidates.map((id) => sql`${id}`),
           sql`, `
         )})
      ORDER BY pt.created_at DESC
      LIMIT 20
    `)
    );

    return rows.map((r) => {
      const raw = readRecord(r.raw_response) ?? {};
      const intentMeta = readRecord(r.intent_metadata) ?? {};
      const fromRef =
        r.transaction_reference != null ? String(r.transaction_reference).trim() : "";
      const razorpayPaymentId =
        asRazorpayPaymentId(raw.razorpayPaymentId) ||
        asRazorpayPaymentId(raw.razorpay_payment_id) ||
        asRazorpayPaymentId(raw.id) ||
        asRazorpayPaymentId(fromRef);
      const razorpayOrderId =
        asRazorpayOrderId(raw.razorpayOrderId) ||
        asRazorpayOrderId(raw.razorpay_order_id) ||
        asRazorpayOrderId(intentMeta.razorpayOrderId) ||
        asRazorpayOrderId(intentMeta.razorpay_order_id) ||
        asRazorpayOrderId(intentMeta.order_id) ||
        null;
      return {
        transactionId: Number(r.transaction_id) || 0,
        intentId: r.intent_id != null ? String(r.intent_id) : null,
        gateway: r.gateway != null ? String(r.gateway) : null,
        paymentMode: r.payment_mode != null ? String(r.payment_mode) : null,
        transactionReference: fromRef || null,
        status: r.status != null ? String(r.status) : null,
        amount: asNum(r.amount),
        razorpayOrderId,
        razorpayPaymentId,
      };
    });
  } catch {
    return [];
  }
}

async function merchantGrossFromCommissionSnapshots(
  orderCoreId: number,
  merchantStoreId: number | null,
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): Promise<number | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT
        s.merchant_base_price::text AS merchant_base_price,
        oci.quantity,
        oci.base_price::text AS base_price,
        oci.addon_price::text AS addon_price
      FROM order_item_commission_snapshots s
      JOIN orders_core_items oci ON oci.id = s.order_item_id
      WHERE s.order_id = ${orderCoreId}
        ${merchantStoreId != null && merchantStoreId > 0 ? sql`AND s.store_id = ${merchantStoreId}` : sql``}
    `);
    const list = rows as unknown as Array<{
      merchant_base_price: string;
      quantity: number;
      base_price: string;
      addon_price: string;
    }>;
    if (list.length === 0) return null;
    let itemSum = 0;
    for (const r of list) {
      const qty = Math.max(1, Number(r.quantity) || 1);
      const merchantBase = asNum(r.merchant_base_price) ?? 0;
      const customerBase = asNum(r.base_price) ?? 0;
      const customerAddonPerUnit = asNum(r.addon_price) ?? 0;
      let merchantAddonPerUnit = customerAddonPerUnit;
      if (
        customerAddonPerUnit > 0.005 &&
        merchantBase > 0.005 &&
        customerBase > 0.005
      ) {
        merchantAddonPerUnit = round2(
          customerAddonPerUnit * (merchantBase / customerBase)
        );
      }
      itemSum += (merchantBase + merchantAddonPerUnit) * qty;
    }
    if (itemSum <= 0) return null;
    return round2(itemSum);
  } catch {
    return null;
  }
}

/** Merchant bill total — same SSOT as partnersite / merchant app:
 * Σ(net_line_total) + packaging − merchant_precision_discount
 */
async function resolveTotalCtm(
  merchantStoreId: number | null,
  core: Record<string, unknown>,
  billing: Record<string, unknown> | null,
  orderCoreId?: number
): Promise<number | null> {
  const db = getDb();
  const packagingFallback = asNum(billing?.packaging_fee) ?? 0;
  const customerGrand =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    asNum(billing?.final_payable);

  // Prefer frozen CTM written at accept (same as merchant wallet credit).
  const frozenCtm = asNum(core.total_ctm);
  if (frozenCtm != null && frozenCtm > 0) return round2(frozenCtm);

  // Canonical partnersite/merchant path via CTM nets + precision.
  if (
    supabaseAdmin &&
    orderCoreId != null &&
    orderCoreId > 0 &&
    merchantStoreId != null &&
    merchantStoreId > 0
  ) {
    try {
      const ctm = await computeMerchantCtmForPartnerOrder(
        supabaseAdmin,
        orderCoreId,
        merchantStoreId
      );
      if (ctm != null && ctm > 0) return round2(ctm);
    } catch {
      /* fall through to legacy */
    }
  }

  let merchantItemSubtotal =
    orderCoreId != null && orderCoreId > 0
      ? await merchantGrossFromCommissionSnapshots(
          orderCoreId,
          merchantStoreId,
          billing,
          core
        )
      : null;
  if (merchantItemSubtotal == null || merchantItemSubtotal <= 0) {
    merchantItemSubtotal = merchantGrossFromBilling(billing, core);
  }

  const precision =
    asNum(core.merchant_precision_discount) ??
    asNum((billing as Record<string, unknown> | null)?.merchant_precision_discount) ??
    0;
  if (merchantItemSubtotal > 0) {
    // Prefer precision-only when known (avoids double-subtracting BOOST already in nets).
    if (precision > 0.005) {
      return round2(Math.max(0, merchantItemSubtotal + packagingFallback - precision));
    }
    const computed = merchantOrderTotalFromBilling(
      merchantItemSubtotal,
      billing,
      packagingFallback
    );
    if (computed != null && computed > 0) return computed;
  }

  if (orderCoreId != null && orderCoreId > 0) {
    try {
      const foodRows = await db.execute(sql`
        SELECT food_items_total_value::text AS food_items_total_value
        FROM orders_food
        WHERE order_id = ${orderCoreId}
        LIMIT 1
      `);
      const foodTotal = asNum(
        (foodRows as unknown as Record<string, unknown>[])[0]?.food_items_total_value
      );
      if (foodTotal != null && foodTotal > 0) {
        const looksLikeCustomerTotal =
          customerGrand != null && foodTotal >= customerGrand - 0.02;
        if (!looksLikeCustomerTotal) return round2(foodTotal);
      }
    } catch {
      /* orders_food optional */
    }
  }

  return null;
}

export async function fetchOrderPaymentDetail(input: {
  orderCoreId: number;
  orderIdText: string | null;
  formattedOrderId: string | null;
  displayId: string;
  merchantStoreId: number | null;
  orderType: string;
  orderSource: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  grandTotal?: number | null;
  itemTotal?: number | null;
  addonTotal?: number | null;
  tipAmount?: number | null;
}): Promise<OrderPaymentDetail> {
  const db = getDb();
  const orderCoreId = input.orderCoreId;
  const paymentIdLabel =
    input.formattedOrderId?.trim() ||
    input.orderIdText?.trim() ||
    input.displayId;

  const orderIdCandidates = collectOrderIdCandidates({
    orderCoreId,
    orderIdText: input.orderIdText,
    formattedOrderId: input.formattedOrderId,
    displayId: input.displayId,
  });
  const candidateIdList =
    orderIdCandidates.length > 0
      ? sql.join(
          orderIdCandidates.map((id) => sql`${id}`),
          sql`, `
        )
      : null;

  // None of these reads depends on another — precedence is decided purely by the
  // merge order below — so they go out as one batch. Serially this was seven
  // round-trips and made the payment card land well after the rest of the page.
  const [
    coreRows,
    settlementRows,
    capturedPayments,
    corePaymentRows,
    pendingRows,
    paymentEventRows,
    timelineRows,
  ] = await Promise.all([
    safeRows(
      db.execute(sql`
      SELECT
        grand_total,
        item_total,
        addon_total,
        tip_amount,
        commission_amount,
        total_delivery_fee,
        total_ctm,
        total_refunded,
        total_paid,
        billing_snapshot,
        payment_method,
        payment_status,
        order_source,
        merchant_precision_discount
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `)
    ),
    safeRows(
      db.execute(sql`
      SELECT delivery_fee
      FROM order_settlement_breakdown
      WHERE order_id = ${orderCoreId}
      LIMIT 1
    `)
    ),
    fetchCapturedPayments(orderIdCandidates),
    candidateIdList
      ? safeRows(
          db.execute(sql`
        SELECT
          payment_gateway,
          payment_method,
          transaction_id,
          amount::text AS amount,
          gateway_response
        FROM orders_core_payments
        WHERE order_id IN (${candidateIdList})
          AND COALESCE(UPPER(payment_status), '') IN (
            'PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED'
          )
        ORDER BY paid_at DESC NULLS LAST, id DESC
        LIMIT 1
      `)
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    candidateIdList
      ? safeRows(
          db.execute(sql`
        SELECT
          razorpay_order_id,
          razorpay_payment_id,
          payment_method,
          billing_snapshot,
          gati_cash_applied::text AS gati_cash_applied
        FROM pending_orders
        WHERE finalized_order_id IN (${candidateIdList})
        ORDER BY updated_at DESC
        LIMIT 1
      `)
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    candidateIdList
      ? safeRows(
          db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id, payload, source
        FROM payment_events
        WHERE order_id IN (${candidateIdList})
          AND razorpay_payment_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `)
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    safeRows(
      db.execute(sql`
      SELECT metadata
      FROM order_timelines
      WHERE order_id = ${orderCoreId}
        AND metadata IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT 5
    `)
    ),
  ]);

  const core: Record<string, unknown> = coreRows[0] ?? {};

  let billing = readRecord(core.billing_snapshot ?? core.billingSnapshot);

  const settlementRow = settlementRows[0];
  const settlementDelivery: number | null = settlementRow
    ? asNum(settlementRow.delivery_fee)
    : null;

  let razorpayOrderId: string | null = null;
  let razorpayPaymentId: string | null = null;
  let pgName: string | null = null;
  let instrumentRaw: string | null = null;
  let gatiCashUsed: number | null = null;
  let gatiCashTxnId: string | null = null;
  let legacyGatiCashTxnId: string | null = null;
  const primaryCapture = capturedPayments[0] ?? null;
  if (primaryCapture) {
    razorpayPaymentId = asRazorpayPaymentId(primaryCapture.razorpayPaymentId);
    razorpayOrderId = asRazorpayOrderId(primaryCapture.razorpayOrderId);
    if (primaryCapture.gateway) pgName = primaryCapture.gateway;
    if (primaryCapture.paymentMode) instrumentRaw = primaryCapture.paymentMode;
  }

  // Prefer orders_core_payments for GatiCash / mixed settlement refs (GC-{UUID}).
  if (orderIdCandidates.length > 0) {
    try {
      const cp = corePaymentRows[0];
      if (cp) {
        const gw =
          cp.payment_gateway != null ? String(cp.payment_gateway).toLowerCase() : "";
        if (gw) pgName = pgName ?? gw;
        if (cp.payment_method != null) {
          instrumentRaw = instrumentRaw ?? String(cp.payment_method);
        }
        const resp = readRecord(cp.gateway_response) ?? {};
        const breakdown = readRecord(resp.breakdown) ?? {};
        const fromResp =
          (typeof resp.gatiCashTxnId === "string" && resp.gatiCashTxnId.trim()) ||
          (typeof resp.gati_cash_txn_id === "string" && resp.gati_cash_txn_id.trim()) ||
          (typeof breakdown.gatiCashTxnId === "string" && breakdown.gatiCashTxnId.trim()) ||
          null;
        const txn =
          cp.transaction_id != null ? String(cp.transaction_id).trim() : "";
        if (fromResp && /^GC-/i.test(fromResp)) {
          gatiCashTxnId = fromResp.toUpperCase();
        } else if (txn && /^GC-/i.test(txn)) {
          gatiCashTxnId = txn.toUpperCase();
        } else if (txn && /^gaticash_/i.test(txn)) {
          legacyGatiCashTxnId = txn;
        }
        if (
          typeof resp.legacyGatiCashTxnId === "string" &&
          resp.legacyGatiCashTxnId.trim()
        ) {
          legacyGatiCashTxnId = resp.legacyGatiCashTxnId.trim();
        }
        const gatiFromBreakdown = asNum(breakdown.gatiCashUsed);
        if (gatiFromBreakdown != null && gatiFromBreakdown > 0) {
          gatiCashUsed = round2(gatiFromBreakdown);
        }
        if (!razorpayPaymentId) {
          razorpayPaymentId = asRazorpayPaymentId(txn);
        }
      }
    } catch {
      /* orders_core_payments optional on older envs */
    }
  }

  if (orderIdCandidates.length > 0) {
    try {
      const p = pendingRows[0];
      if (p) {
        if (!billing || discountTotalFromBilling(billing) <= 0) {
          const pendingBilling = readRecord(p.billing_snapshot ?? p.billingSnapshot);
          if (pendingBilling) billing = pendingBilling;
        }
        razorpayOrderId =
          razorpayOrderId ?? asRazorpayOrderId(p.razorpay_order_id);
        razorpayPaymentId =
          razorpayPaymentId ?? asRazorpayPaymentId(p.razorpay_payment_id);
        if (p.payment_method != null) {
          instrumentRaw = instrumentRaw ?? String(p.payment_method);
          if (!pgName) pgName = String(p.payment_method);
        }
        const pendingGati = asNum(p.gati_cash_applied);
        if (pendingGati != null && pendingGati > 0) gatiCashUsed = round2(pendingGati);
      }
    } catch {
      /* ignore */
    }

    try {
      const e = paymentEventRows[0];
      if (e) {
        razorpayOrderId =
          razorpayOrderId ?? asRazorpayOrderId(e.razorpay_order_id);
        razorpayPaymentId =
          razorpayPaymentId ?? asRazorpayPaymentId(e.razorpay_payment_id);
        const payload = readRecord(e.payload);
        const method =
          payload?.method ??
          payload?.payment_method ??
          (payload?.payment && typeof payload.payment === "object"
            ? (payload.payment as Record<string, unknown>).method
            : null);
        if (method != null) {
          instrumentRaw = String(method);
          if (!pgName) pgName = String(method);
        } else if (!pgName && e.source != null) {
          pgName = String(e.source);
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    for (const row of timelineRows) {
      const meta = readRecord(row.metadata);
      if (!meta) continue;
      razorpayOrderId =
        razorpayOrderId ?? asRazorpayOrderId(meta.razorpay_order_id);
      razorpayPaymentId =
        razorpayPaymentId ?? asRazorpayPaymentId(meta.razorpay_payment_id);
      if (razorpayOrderId && razorpayPaymentId) break;
    }
  } catch {
    /* ignore */
  }

  const totalAmount =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    input.grandTotal ??
    null;

  const deliveryResolved = resolveDeliveryFee(billing, core, settlementDelivery);
  const deliveryFee = deliveryResolved.fee;

  // CTM and the discount fallback both only need `core` / `billing`, which are
  // already resolved — run them together rather than back to back.
  const billingDiscountSummary = orderDiscountGrantedSummaryFromBilling(billing);
  const [totalCtm, discountFromOrderTables] = await Promise.all([
    resolveTotalCtm(input.merchantStoreId, core, billing, orderCoreId),
    billingDiscountSummary.amount == null
      ? fetchDiscountFromOrderTables({
          orderCoreId,
          orderIdText: input.orderIdText,
          formattedOrderId: input.formattedOrderId,
        })
      : Promise.resolve(null),
  ]);

  const totalRefunded =
    asNum(core.total_refunded) ?? null;
  const totalPaid = asNum(core.total_paid) ?? totalAmount;

  const paymentStatus =
    (core.payment_status != null ? String(core.payment_status) : null) ??
    input.paymentStatus ??
    "—";

  const paymentModeRaw =
    (core.payment_method != null ? String(core.payment_method) : null) ??
    primaryCapture?.paymentMode ??
    input.paymentMethod;

  const paymentModeDisplay = formatPaymentModeOnlineOrCash(paymentModeRaw);
  const paymentSourceDisplay =
    formatPaymentInstrumentSource(instrumentRaw, paymentModeRaw, pgName) ??
    (paymentModeDisplay === "Cash" ? "Cash" : paymentModeDisplay === "Online" ? "Online" : null);

  if (!pgName) {
    pgName = razorpayPaymentId ? "razorpay" : paymentModeRaw;
  }
  if (pgName && ["upi", "card", "wallet", "cod", "online", "cash"].includes(pgName.toLowerCase())) {
    pgName = razorpayPaymentId ? "razorpay" : pgName;
  }

  gatiCashUsed = gatiCashUsed ?? gatiCashFromBilling(billing);

  const isRefunded =
    paymentStatus.toLowerCase().includes("refund") ||
    (totalRefunded != null && totalRefunded > 0);

  const cashbackEarned = cashbackFromBilling(billing);
  const discountSummary = discountFromOrderTables ?? billingDiscountSummary;

  // CTC = Cashin + GatiCash. grand_total alone is post-wallet to-pay (₹0 on full wallet).
  const { ctc, cashin, gatiCashUsed: gatiResolved } = resolveCustomerCtcPaidAmount({
    netPayable: totalAmount,
    gatiCashUsed: gatiCashUsed,
    capturedAmount: primaryCapture?.amount ?? null,
  });
  const gati = gatiResolved > 0.005 ? gatiResolved : null;

  const partialRefunded =
    isRefunded &&
    totalRefunded != null &&
    ctc > 0 &&
    totalRefunded > 0 &&
    totalRefunded < ctc - 0.01;

  // Sanitize once more — never leak wallet keys into PG columns.
  razorpayPaymentId = asRazorpayPaymentId(razorpayPaymentId);
  razorpayOrderId = asRazorpayOrderId(razorpayOrderId);

  // Prefer modern GC-{UUID} for Transaction Id / PG Transaction Id on wallet rows.
  const gatiCashTxnFromCapture =
    gatiCashTxnId ||
    (primaryCapture?.transactionReference &&
    /^GC-/i.test(primaryCapture.transactionReference)
      ? primaryCapture.transactionReference
      : null);
  const displayTxnId =
    (gatiCashTxnId ? gatiCashTxnId.toUpperCase() : null) ||
    (gatiCashTxnFromCapture ? gatiCashTxnFromCapture.toUpperCase() : null) ||
    razorpayPaymentId ||
    null;
  const isWalletSettled = Boolean(
    displayTxnId?.startsWith("GC-") ||
      (gati != null && gati > 0 && !razorpayPaymentId) ||
      legacyGatiCashTxnId
  );
  // Transaction Id + PG Transaction Id both surface the settlement capture ref:
  //   • Razorpay → pay_*
  //   • GatiCash  → GC-{UUID} (never legacy gaticash_*)
  const records: OrderPaymentRecord[] = [
    {
      paymentId: paymentIdLabel,
      transactionId: displayTxnId,
      mpTransactionId: razorpayOrderId,
      paymentStatus: primaryCapture?.status?.trim() || paymentStatus,
      paymentMode: paymentModeDisplay,
      source: paymentSourceDisplay,
      refunded: isRefunded && !partialRefunded,
      partialRefunded,
      partiallyRefundedAmount:
        totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
      amount: ctc > 0 ? ctc : null,
      deliveryFee,
      ctc: ctc > 0 ? ctc : null,
      cashin: cashin >= 0 ? cashin : null,
      gatiCashUsed: gati,
      ctm: totalCtm,
      pgName: razorpayPaymentId ? "razorpay" : isWalletSettled ? "gati_cash" : pgName,
      pgTransactionId: razorpayPaymentId ?? displayTxnId,
    },
  ];

  return {
    totalAmount: ctc > 0 ? ctc : null,
    totalCtm,
    totalCashbackEarned: cashbackEarned,
    gatiCashUsed: gati,
    totalDiscountGranted: discountSummary.amount,
    discountOfferSource: discountSummary.offerSource,
    deliveryFee,
    deliveryFeeQuoted: deliveryResolved.quoted,
    deliveryFeeWaived: deliveryResolved.waived,
    source: paymentSourceDisplay,
    paymentMode: paymentModeDisplay,
    partialRefunded,
    refundAmount: totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
    totalRefunded: totalRefunded != null ? round2(totalRefunded) : null,
    totalPaid: totalPaid != null ? round2(totalPaid) : null,
    records,
  };
}

/**
 * Resolve the orders_core header for `orderCoreId`, then build the payment
 * payload. Shared by GET /api/orders/[orderId]/payment-detail and the
 * single-order enrichment on GET /api/orders/core so the card is identical
 * whether it arrives embedded with the page or via the standalone fetch.
 * Returns null when the order does not exist.
 */
export async function fetchOrderPaymentDetailByCoreId(
  orderCoreId: number
): Promise<OrderPaymentDetail | null> {
  const db = getDb();
  const rows = rowsOf(
    await db.execute(sql`
      SELECT
        order_id,
        formatted_order_id,
        merchant_store_id,
        order_type,
        order_source,
        payment_status,
        payment_method,
        grand_total,
        item_total,
        addon_total,
        tip_amount
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `)
  );
  const row = rows[0];
  if (!row) return null;

  return fetchOrderPaymentDetail({
    orderCoreId,
    orderIdText: row.order_id != null ? String(row.order_id) : null,
    formattedOrderId:
      row.formatted_order_id != null ? String(row.formatted_order_id) : null,
    displayId:
      (typeof row.formatted_order_id === "string" && row.formatted_order_id.trim()) ||
      (row.order_id ? String(row.order_id) : `ORDER-${orderCoreId}`),
    merchantStoreId:
      row.merchant_store_id != null && Number.isFinite(Number(row.merchant_store_id))
        ? Number(row.merchant_store_id)
        : null,
    orderType: row.order_type != null ? String(row.order_type) : "food",
    orderSource: row.order_source != null ? String(row.order_source) : null,
    paymentStatus: row.payment_status != null ? String(row.payment_status) : null,
    paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
    grandTotal: row.grand_total != null ? Number(row.grand_total) : null,
    itemTotal: row.item_total != null ? Number(row.item_total) : null,
    addonTotal: row.addon_total != null ? Number(row.addon_total) : null,
    tipAmount: row.tip_amount != null ? Number(row.tip_amount) : null,
  });
}
