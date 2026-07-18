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

/** Normalize drizzle / postgres-js execute results to a plain row array. */
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
    (fromBilling != null && fromBilling > 0 ? fromBilling : null) ??
    settlementDelivery ??
    asNum(core.total_delivery_fee) ??
    (quoted != null && quoted > 0 ? quoted : null);
  return {
    fee: fee != null && fee > 0 ? round2(fee) : null,
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
        (typeof raw.razorpayPaymentId === "string" && raw.razorpayPaymentId) ||
        (typeof raw.razorpay_payment_id === "string" && raw.razorpay_payment_id) ||
        (typeof raw.id === "string" && String(raw.id).startsWith("pay_") ? String(raw.id) : null) ||
        (fromRef.startsWith("pay_") || fromRef.length > 0 ? fromRef : null);
      const razorpayOrderId =
        (typeof raw.razorpayOrderId === "string" && raw.razorpayOrderId) ||
        (typeof raw.razorpay_order_id === "string" && raw.razorpay_order_id) ||
        (typeof intentMeta.razorpayOrderId === "string" && intentMeta.razorpayOrderId) ||
        (typeof intentMeta.razorpay_order_id === "string" && intentMeta.razorpay_order_id) ||
        (typeof intentMeta.order_id === "string" &&
        String(intentMeta.order_id).startsWith("order_")
          ? String(intentMeta.order_id)
          : null) ||
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

  let core: Record<string, unknown> = {};
  try {
    const rows = rowsOf(
      await db.execute(sql`
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
    );
    core = rows[0] ?? {};
  } catch {
    core = {};
  }

  let billing = readRecord(core.billing_snapshot ?? core.billingSnapshot);

  let settlementDelivery: number | null = null;
  try {
    const sb = rowsOf(
      await db.execute(sql`
      SELECT delivery_fee
      FROM order_settlement_breakdown
      WHERE order_id = ${orderCoreId}
      LIMIT 1
    `)
    );
    const row = sb[0];
    if (row) {
      settlementDelivery = asNum(row.delivery_fee);
    }
  } catch {
    /* table may not exist */
  }

  let razorpayOrderId: string | null = null;
  let razorpayPaymentId: string | null = null;
  let pgName: string | null = null;
  let instrumentRaw: string | null = null;
  let gatiCashUsed: number | null = null;

  const orderIdCandidates = collectOrderIdCandidates({
    orderCoreId,
    orderIdText: input.orderIdText,
    formattedOrderId: input.formattedOrderId,
    displayId: input.displayId,
  });
  const capturedPayments = await fetchCapturedPayments(orderIdCandidates);
  const primaryCapture = capturedPayments[0] ?? null;
  if (primaryCapture) {
    razorpayPaymentId = primaryCapture.razorpayPaymentId;
    razorpayOrderId = primaryCapture.razorpayOrderId;
    if (primaryCapture.gateway) pgName = primaryCapture.gateway;
    if (primaryCapture.paymentMode) instrumentRaw = primaryCapture.paymentMode;
  }

  if (orderIdCandidates.length > 0) {
    try {
      const pending = rowsOf(
        await db.execute(sql`
        SELECT
          razorpay_order_id,
          razorpay_payment_id,
          payment_method,
          billing_snapshot,
          gati_cash_applied::text AS gati_cash_applied
        FROM pending_orders
        WHERE finalized_order_id IN (${sql.join(
          orderIdCandidates.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      );
      const p = pending[0];
      if (p) {
        if (!billing || discountTotalFromBilling(billing) <= 0) {
          const pendingBilling = readRecord(p.billing_snapshot ?? p.billingSnapshot);
          if (pendingBilling) billing = pendingBilling;
        }
        razorpayOrderId =
          razorpayOrderId ??
          (p.razorpay_order_id != null ? String(p.razorpay_order_id) : null);
        razorpayPaymentId =
          razorpayPaymentId ??
          (p.razorpay_payment_id != null ? String(p.razorpay_payment_id) : null);
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
      const pe = rowsOf(
        await db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id, payload, source
        FROM payment_events
        WHERE order_id IN (${sql.join(
          orderIdCandidates.map((id) => sql`${id}`),
          sql`, `
        )})
          AND razorpay_payment_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `)
      );
      const e = pe[0];
      if (e) {
        razorpayOrderId =
          razorpayOrderId ??
          (e.razorpay_order_id != null ? String(e.razorpay_order_id) : null);
        razorpayPaymentId =
          razorpayPaymentId ??
          (e.razorpay_payment_id != null ? String(e.razorpay_payment_id) : null);
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
    const tl = rowsOf(
      await db.execute(sql`
      SELECT metadata
      FROM order_timelines
      WHERE order_id = ${orderCoreId}
        AND metadata IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT 5
    `)
    );
    for (const row of tl) {
      const meta = readRecord(row.metadata);
      if (!meta) continue;
      razorpayOrderId =
        razorpayOrderId ??
        (typeof meta.razorpay_order_id === "string" ? meta.razorpay_order_id : null);
      razorpayPaymentId =
        razorpayPaymentId ??
        (typeof meta.razorpay_payment_id === "string" ? meta.razorpay_payment_id : null);
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

  const totalCtm = await resolveTotalCtm(
    input.merchantStoreId,
    core,
    billing,
    orderCoreId
  );

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

  const partialRefunded =
    isRefunded &&
    totalRefunded != null &&
    totalAmount != null &&
    totalRefunded > 0 &&
    totalRefunded < totalAmount - 0.01;

  const cashbackEarned = cashbackFromBilling(billing);
  let discountSummary = orderDiscountGrantedSummaryFromBilling(billing);
  if (discountSummary.amount == null) {
    discountSummary = await fetchDiscountFromOrderTables({
      orderCoreId,
      orderIdText: input.orderIdText,
      formattedOrderId: input.formattedOrderId,
    });
  }

  const ctc =
    totalAmount != null && totalAmount > 0
      ? round2(totalAmount)
      : primaryCapture?.amount != null && primaryCapture.amount > 0
        ? round2(primaryCapture.amount)
        : null;
  const gati = gatiCashUsed != null && gatiCashUsed > 0 ? round2(gatiCashUsed) : null;
  const online = paymentModeDisplay !== "Cash";
  const cashin =
    ctc != null
      ? round2(Math.max(0, ctc - (gati ?? 0)))
      : online && primaryCapture?.amount != null
        ? round2(primaryCapture.amount)
        : null;

  // One capture row — CTM uses the same SSOT as the summary card (no fee-line guesswork).
  const records: OrderPaymentRecord[] = [
    {
      paymentId: paymentIdLabel,
      transactionId: razorpayPaymentId ?? primaryCapture?.transactionReference ?? null,
      mpTransactionId: razorpayOrderId,
      paymentStatus: primaryCapture?.status?.trim() || paymentStatus,
      paymentMode: paymentModeDisplay,
      source: paymentSourceDisplay,
      refunded: isRefunded && !partialRefunded,
      partialRefunded,
      partiallyRefundedAmount:
        totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
      amount: ctc,
      deliveryFee,
      ctc,
      cashin: online ? cashin : cashin,
      gatiCashUsed: gati,
      ctm: totalCtm,
      pgName: razorpayPaymentId ? "razorpay" : pgName,
      pgTransactionId: razorpayPaymentId ?? primaryCapture?.transactionReference ?? null,
    },
  ];

  return {
    totalAmount: ctc,
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
