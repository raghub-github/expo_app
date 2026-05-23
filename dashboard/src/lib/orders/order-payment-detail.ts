/**
 * Order payment card + modal — amounts from orders_core, billing_snapshot,
 * order_settlement_breakdown, pending_orders / payment_events / timelines.
 * Total CTM = net payable to merchant (after commission); commission is never returned to UI.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getActiveCommissionForStore } from "@/lib/db/operations/commission";
import { merchantFundedDiscountFromBilling } from "@/lib/merchant-billing-discount";

export type OrderPaymentRecord = {
  paymentId: string;
  transactionId: string | null;
  mpTransactionId: string | null;
  paymentStatus: string;
  redemptionType: string | null;
  productType: string | null;
  refunded: boolean;
  partialRefunded: boolean;
  amount: number | null;
  deliveryFee: number | null;
};

export type OrderPaymentDetail = {
  totalAmount: number | null;
  /** Net amount credited / payable to merchant after commission. */
  totalCtm: number | null;
  totalCashbackEarned: number | null;
  deliveryFee: number | null;
  source: string | null;
  paymentMode: string | null;
  partialRefunded: boolean;
  refundAmount: number | null;
  totalRefunded: number | null;
  totalPaid: number | null;
  records: OrderPaymentRecord[];
};

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function merchantGrossFromBilling(
  billing: Record<string, unknown> | null,
  core: Record<string, unknown>
): number {
  const itemTotal =
    round2(
      (asNum(billing?.item_total) ?? 0) + (asNum(billing?.addon_total) ?? 0)
    ) ||
    round2((asNum(core.item_total) ?? 0) + (asNum(core.addon_total) ?? 0));
  const packaging = asNum(billing?.packaging_fee) ?? 0;
  const merchantDisc = merchantFundedDiscountFromBilling(billing);
  return round2(Math.max(0, itemTotal + packaging - merchantDisc));
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

async function resolveCommissionAmount(
  merchantStoreId: number | null,
  merchantGross: number,
  coreCommission: number | null
): Promise<number | null> {
  if (coreCommission != null && coreCommission >= 0) return round2(coreCommission);
  if (merchantStoreId == null || merchantGross <= 0) return null;
  try {
    const trace = await getActiveCommissionForStore(merchantStoreId);
    if (trace.percent > 0) return round2((merchantGross * trace.percent) / 100);
  } catch {
    /* commission tables optional */
  }
  return null;
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
        oci.quantity
      FROM order_item_commission_snapshots s
      JOIN orders_core_items oci ON oci.id = s.order_item_id
      WHERE s.order_id = ${orderCoreId}
        ${merchantStoreId != null && merchantStoreId > 0 ? sql`AND s.store_id = ${merchantStoreId}` : sql``}
    `);
    const list = rows as unknown as Array<{ merchant_base_price: string; quantity: number }>;
    if (list.length === 0) return null;
    let itemSum = 0;
    for (const r of list) {
      itemSum += (asNum(r.merchant_base_price) ?? 0) * Math.max(1, Number(r.quantity) || 1);
    }
    if (itemSum <= 0) return null;
    const packaging = asNum(billing?.packaging_fee) ?? 0;
    const merchantDisc = merchantFundedDiscountFromBilling(billing);
    return round2(Math.max(0, itemSum + packaging - merchantDisc));
  } catch {
    return null;
  }
}

/** Net payable to merchant (CTM) — uses merchant_base subtotal when snapshots exist. */
async function resolveTotalCtm(
  merchantStoreId: number | null,
  core: Record<string, unknown>,
  billing: Record<string, unknown> | null,
  settlementNet: number | null,
  settlementCommission: number | null,
  orderCoreId?: number
): Promise<number | null> {
  if (settlementNet != null && settlementNet > 0) return round2(settlementNet);

  let merchantGross =
    orderCoreId != null && orderCoreId > 0
      ? await merchantGrossFromCommissionSnapshots(
          orderCoreId,
          merchantStoreId,
          billing,
          core
        )
      : null;
  if (merchantGross == null || merchantGross <= 0) {
    merchantGross = merchantGrossFromBilling(billing, core);
  }
  const commission =
    settlementCommission != null && settlementCommission >= 0
      ? settlementCommission
      : await resolveCommissionAmount(
          merchantStoreId,
          merchantGross,
          asNum(core.commission_amount)
        );

  const storedCtm = asNum(core.total_ctm);
  const grand =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    asNum(billing?.final_payable);

  if (storedCtm != null && storedCtm > 0) {
    if (commission != null && commission > 0 && Math.abs(storedCtm - commission) < 0.02) {
      return round2(Math.max(0, merchantGross - commission));
    }
    if (grand != null && grand > 0 && storedCtm < grand * 0.98) {
      return round2(storedCtm);
    }
    if (commission == null) return round2(storedCtm);
  }

  if (merchantGross > 0 && commission != null) {
    return round2(Math.max(0, merchantGross - commission));
  }

  if (merchantGross > 0) return merchantGross;
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
    const rows = await db.execute(sql`
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
        order_source
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `);
    core = (rows as unknown as Record<string, unknown>[])[0] ?? {};
  } catch {
    core = {};
  }

  const billing = readRecord(core.billing_snapshot);

  let settlementNet: number | null = null;
  let settlementCommission: number | null = null;
  let settlementDelivery: number | null = null;
  try {
    const sb = await db.execute(sql`
      SELECT merchant_net, commission_amount, delivery_fee
      FROM order_settlement_breakdown
      WHERE order_id = ${orderCoreId}
      LIMIT 1
    `);
    const row = (sb as unknown as Record<string, unknown>[])[0];
    if (row) {
      settlementNet = asNum(row.merchant_net);
      settlementCommission = asNum(row.commission_amount);
      settlementDelivery = asNum(row.delivery_fee);
    }
  } catch {
    /* table may not exist */
  }

  let razorpayOrderId: string | null = null;
  let razorpayPaymentId: string | null = null;

  try {
    const tl = await db.execute(sql`
      SELECT metadata
      FROM order_timelines
      WHERE order_id = ${orderCoreId}
        AND metadata IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT 5
    `);
    for (const row of tl as unknown as { metadata?: unknown }[]) {
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

  const orderText = input.orderIdText?.trim();
  if (orderText) {
    try {
      const pending = await db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id
        FROM pending_orders
        WHERE finalized_order_id = ${orderText}
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      const p = (pending as unknown as Record<string, unknown>[])[0];
      if (p) {
        razorpayOrderId =
          razorpayOrderId ??
          (p.razorpay_order_id != null ? String(p.razorpay_order_id) : null);
        razorpayPaymentId =
          razorpayPaymentId ??
          (p.razorpay_payment_id != null ? String(p.razorpay_payment_id) : null);
      }
    } catch {
      /* ignore */
    }

    try {
      const pe = await db.execute(sql`
        SELECT razorpay_order_id, razorpay_payment_id
        FROM payment_events
        WHERE order_id = ${orderText}
          AND razorpay_payment_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const e = (pe as unknown as Record<string, unknown>[])[0];
      if (e) {
        razorpayOrderId =
          razorpayOrderId ??
          (e.razorpay_order_id != null ? String(e.razorpay_order_id) : null);
        razorpayPaymentId =
          razorpayPaymentId ??
          (e.razorpay_payment_id != null ? String(e.razorpay_payment_id) : null);
      }
    } catch {
      /* ignore */
    }
  }

  const totalAmount =
    asNum(core.grand_total) ??
    asNum(billing?.final_amount) ??
    input.grandTotal ??
    null;

  const deliveryFee =
    settlementDelivery ??
    asNum(core.total_delivery_fee) ??
    asNum(billing?.delivery_fee) ??
    null;

  const totalCtm = await resolveTotalCtm(
    input.merchantStoreId,
    core,
    billing,
    settlementNet,
    settlementCommission,
    orderCoreId
  );

  const totalRefunded =
    asNum(core.total_refunded) ?? null;
  const totalPaid = asNum(core.total_paid) ?? totalAmount;

  const paymentStatus =
    (core.payment_status != null ? String(core.payment_status) : null) ??
    input.paymentStatus ??
    "—";

  const isRefunded =
    paymentStatus.toLowerCase().includes("refund") ||
    (totalRefunded != null && totalRefunded > 0);

  const partialRefunded =
    isRefunded &&
    totalRefunded != null &&
    totalAmount != null &&
    totalRefunded > 0 &&
    totalRefunded < totalAmount - 0.01;

  const record: OrderPaymentRecord = {
    paymentId: paymentIdLabel,
    transactionId: razorpayPaymentId,
    mpTransactionId: razorpayOrderId,
    paymentStatus,
    redemptionType:
      (core.order_source != null ? String(core.order_source) : null) ??
      input.orderSource,
    productType: input.orderType,
    refunded: isRefunded && !partialRefunded,
    partialRefunded,
    amount: totalAmount,
    deliveryFee: deliveryFee != null ? round2(Math.max(0, deliveryFee)) : null,
  };

  return {
    totalAmount: totalAmount != null ? round2(totalAmount) : null,
    totalCtm,
    totalCashbackEarned: cashbackFromBilling(billing),
    deliveryFee: deliveryFee != null ? round2(Math.max(0, deliveryFee)) : null,
    source:
      (core.order_source != null ? String(core.order_source) : null) ??
      input.orderSource,
    paymentMode:
      (core.payment_method != null ? String(core.payment_method) : null) ??
      input.paymentMethod,
    partialRefunded,
    refundAmount: totalRefunded != null && totalRefunded > 0 ? round2(totalRefunded) : null,
    totalRefunded: totalRefunded != null ? round2(totalRefunded) : null,
    totalPaid: totalPaid != null ? round2(totalPaid) : null,
    records: [record],
  };
}
