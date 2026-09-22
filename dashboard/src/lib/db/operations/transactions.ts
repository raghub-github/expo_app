/**
 * Central Transactions read model (dashboard).
 *
 * READ-ONLY aggregation over the EXISTING payment sources — no new transaction
 * store, no financial recomputation. It UNIONs the per-flow anchor tables into a
 * normalized row so the Transactions page can list/filter/search across all three
 * apps, and reads the payment_events spine for the per-transaction lifecycle.
 *
 * Source partition (no double counting):
 *   pending_orders                                  -> customer food/grocery (all states)
 *   orders_core_payments x orders_core (parcel/ride)-> customer parcel + person_ride captures
 *   onboarding_payments                             -> rider onboarding fee
 *   rider_wallet_payments                           -> rider negative-wallet / top-up
 *   subscription_payments                           -> merchant subscription
 *   customer_wallet_topup_intents                   -> customer GatiCash top-up
 *
 * Amounts are normalized to paise. Status is normalized to a canonical vocabulary
 * for filtering; the raw per-source status is preserved for display.
 *
 * NOTE: this query has not been executed against the live DB in this environment;
 * verify on staging (see the module test for the expected shape).
 */
import { getDb } from "../client";
import { sql, type SQL } from "drizzle-orm";

export type TxnApp = "customer" | "merchant" | "rider";
export type TxnNormStatus =
  | "created"
  | "pending"
  | "paid"
  | "captured_unfinalized"
  | "failed"
  | "reconciliation_required"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "cancelled"
  | "unknown";

export interface TransactionRow {
  uid: string;
  source: string;
  app: TxnApp;
  service: string;
  purpose: string;
  status: string; // raw
  normStatus: TxnNormStatus;
  paymentMode: string | null;
  grossPaise: number;
  paidPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  internalRef: string | null;
  businessOrderId: string | null;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListTransactionsParams {
  app?: TxnApp | null;
  service?: string | null;
  normStatus?: TxnNormStatus | null;
  paymentMode?: string | null;
  search?: string | null;
  dateFrom?: string | null; // ISO
  dateTo?: string | null; // ISO
  amountMinPaise?: number | null;
  amountMaxPaise?: number | null;
  /** keyset cursor: base64("<created_at ISO>|<uid>"), exclusive */
  cursor?: string | null;
  limit?: number;
}

export interface ListTransactionsResult {
  rows: TransactionRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * The normalized UNION. Kept as one CTE so filters/keyset apply uniformly. Each
 * SELECT maps its source's columns onto the shared projection + a norm_status.
 */
const UNION_CTE = sql`
  WITH all_txn AS (
    -- Customer food/grocery (authoritative customer-order payment lifecycle)
    SELECT
      'pending_orders:' || po.id::text AS uid,
      'pending_orders' AS source,
      'customer' AS app,
      lower(COALESCE(NULLIF(po.billing_snapshot->>'billing_service_type',''), 'food')) AS service,
      'order' AS purpose,
      po.payment_state AS status,
      CASE po.payment_state
        WHEN 'created' THEN 'created'
        WHEN 'pending_confirmation' THEN 'pending'
        WHEN 'paid' THEN 'paid'
        WHEN 'finalized' THEN 'paid'
        WHEN 'captured_unfinalized' THEN 'captured_unfinalized'
        WHEN 'reconciliation_required' THEN 'reconciliation_required'
        WHEN 'failed' THEN 'failed'
        WHEN 'refund_pending' THEN 'refund_pending'
        WHEN 'refunded' THEN 'refunded'
        WHEN 'refund_failed' THEN 'refund_failed'
        ELSE 'unknown'
      END AS norm_status,
      po.payment_method AS payment_mode,
      ROUND(COALESCE(po.grand_total,0) * 100)::bigint AS gross_paise,
      CASE WHEN po.payment_state IN ('finalized','paid') THEN ROUND(COALESCE(po.grand_total,0) * 100)::bigint ELSE 0 END AS paid_paise,
      COALESCE(po.currency,'INR') AS currency,
      po.razorpay_order_id, po.razorpay_payment_id,
      po.pending_id AS internal_ref,
      po.finalized_order_id AS business_order_id,
      'customer' AS entity_type, po.customer_id::text AS entity_id,
      po.created_at, po.updated_at
    FROM pending_orders po

    UNION ALL
    -- Customer parcel + person-ride captures (order-type partitioned to avoid overlap)
    SELECT
      'order_payment:' || ocp.id::text AS uid,
      'order_payment' AS source,
      'customer' AS app,
      lower(oc.order_type::text) AS service,
      'order' AS purpose,
      COALESCE(ocp.payment_status,'PAID') AS status,
      CASE lower(COALESCE(ocp.payment_status,'paid'))
        WHEN 'paid' THEN 'paid'
        WHEN 'refunded' THEN 'refunded'
        WHEN 'failed' THEN 'failed'
        ELSE 'paid'
      END AS norm_status,
      lower(COALESCE(ocp.payment_gateway, ocp.payment_method, 'online')) AS payment_mode,
      ROUND(COALESCE(ocp.amount,0) * 100)::bigint AS gross_paise,
      ROUND(COALESCE(ocp.amount,0) * 100)::bigint AS paid_paise,
      COALESCE(ocp.currency,'INR') AS currency,
      (ocp.gateway_response->>'razorpayOrderId') AS razorpay_order_id,
      COALESCE(ocp.gateway_response->>'razorpayPaymentId', ocp.transaction_id) AS razorpay_payment_id,
      ocp.transaction_id AS internal_ref,
      ocp.order_id AS business_order_id,
      'customer' AS entity_type, oc.customer_id::text AS entity_id,
      COALESCE(ocp.paid_at, ocp.created_at) AS created_at, ocp.created_at AS updated_at
    FROM orders_core_payments ocp
    JOIN orders_core oc ON oc.order_id = ocp.order_id
    WHERE oc.order_type IN ('parcel','person_ride')

    UNION ALL
    -- Rider onboarding fee
    SELECT
      'onboarding_payment:' || op.id::text AS uid,
      'onboarding_payment' AS source,
      'rider' AS app,
      'onboarding' AS service,
      'onboarding_fee' AS purpose,
      op.status AS status,
      CASE op.status
        WHEN 'pending' THEN 'pending'
        WHEN 'completed' THEN 'paid'
        WHEN 'failed' THEN 'failed'
        WHEN 'refunded' THEN 'refunded'
        ELSE 'unknown'
      END AS norm_status,
      COALESCE(op.metadata->>'paymentMethod','razorpay') AS payment_mode,
      ROUND(COALESCE(op.amount,0) * 100)::bigint AS gross_paise,
      CASE WHEN op.status = 'completed' THEN ROUND(COALESCE(op.amount,0) * 100)::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      COALESCE(op.metadata->>'razorpayOrderId', op.payment_id) AS razorpay_order_id,
      COALESCE(op.metadata->>'razorpayPaymentId', CASE WHEN op.status='completed' THEN op.payment_id END) AS razorpay_payment_id,
      op.ref_id AS internal_ref,
      NULL AS business_order_id,
      'rider' AS entity_type, op.rider_id::text AS entity_id,
      op.created_at, op.updated_at
    FROM onboarding_payments op

    UNION ALL
    -- Rider negative-wallet recovery / top-up
    SELECT
      'rider_wallet_payment:' || rwp.id::text AS uid,
      'rider_wallet_payment' AS source,
      'rider' AS app,
      COALESCE(rwp.purpose,'negative_wallet') AS service,
      COALESCE(rwp.purpose,'negative_wallet') AS purpose,
      rwp.status AS status,
      CASE rwp.status
        WHEN 'initiated' THEN 'pending'
        WHEN 'pending' THEN 'pending'
        WHEN 'completed' THEN 'paid'
        WHEN 'settled' THEN 'paid'
        WHEN 'failed' THEN 'failed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'refunded' THEN 'refunded'
        ELSE 'unknown'
      END AS norm_status,
      COALESCE(rwp.method, rwp.gateway,'razorpay') AS payment_mode,
      rwp.amount_paise::bigint AS gross_paise,
      CASE WHEN rwp.status IN ('completed','settled') THEN rwp.amount_paise::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      rwp.razorpay_order_id, rwp.razorpay_payment_id,
      NULL AS internal_ref,
      NULL AS business_order_id,
      'rider' AS entity_type, rwp.rider_id::text AS entity_id,
      rwp.created_at, rwp.updated_at
    FROM rider_wallet_payments rwp

    UNION ALL
    -- Merchant subscription
    SELECT
      'subscription_payment:' || spmt.id::text AS uid,
      'subscription_payment' AS source,
      'merchant' AS app,
      'subscription' AS service,
      'subscription' AS purpose,
      spmt.payment_status AS status,
      CASE lower(COALESCE(spmt.payment_status,''))
        WHEN 'paid' THEN 'paid'
        WHEN 'refunded' THEN 'refunded'
        WHEN 'refund_pending' THEN 'refund_pending'
        WHEN 'failed' THEN 'failed'
        ELSE 'paid'
      END AS norm_status,
      COALESCE(spmt.payment_gateway,'razorpay') AS payment_mode,
      COALESCE(spmt.total_paise, ROUND(COALESCE(spmt.amount,0) * 100))::bigint AS gross_paise,
      CASE WHEN lower(COALESCE(spmt.payment_status,'')) IN ('paid','refunded','refund_pending') THEN COALESCE(spmt.total_paise, ROUND(COALESCE(spmt.amount,0) * 100))::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      (spmt.payment_gateway_response->>'razorpay_order_id') AS razorpay_order_id,
      spmt.payment_gateway_id AS razorpay_payment_id,
      spmt.id::text AS internal_ref,
      spmt.subscription_id::text AS business_order_id,
      'merchant' AS entity_type, spmt.store_id::text AS entity_id,
      COALESCE(spmt.payment_date, spmt.created_at) AS created_at, spmt.updated_at
    FROM subscription_payments spmt

    UNION ALL
    -- Merchant wallet dues (partner-site / merchant-app collection)
    SELECT
      'merchant_dues:' || mwd.id::text AS uid,
      'merchant_dues' AS source,
      'merchant' AS app,
      'wallet_dues' AS service,
      'wallet_dues' AS purpose,
      mwd.status AS status,
      CASE mwd.status
        WHEN 'initiated' THEN 'pending'
        WHEN 'pending' THEN 'pending'
        WHEN 'success' THEN 'paid'
        WHEN 'completed' THEN 'paid'
        WHEN 'failed' THEN 'failed'
        ELSE 'unknown'
      END AS norm_status,
      COALESCE(mwd.method,'razorpay') AS payment_mode,
      mwd.amount_paise::bigint AS gross_paise,
      CASE WHEN mwd.status IN ('success','completed') THEN mwd.amount_paise::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      mwd.razorpay_order_id, mwd.razorpay_payment_id,
      NULL AS internal_ref,
      NULL AS business_order_id,
      'merchant' AS entity_type, mwd.merchant_store_id::text AS entity_id,
      mwd.created_at, mwd.updated_at
    FROM merchant_wallet_dues_payments mwd

    UNION ALL
    -- Customer GatiCash wallet top-up
    SELECT
      'wallet_topup:' || wti.id::text AS uid,
      'wallet_topup' AS source,
      'customer' AS app,
      'wallet_topup' AS service,
      'wallet_topup' AS purpose,
      wti.status AS status,
      CASE wti.status
        WHEN 'CREATED' THEN 'created'
        WHEN 'PAYMENT_PENDING' THEN 'pending'
        WHEN 'PAID' THEN 'paid'
        WHEN 'FAILED' THEN 'failed'
        WHEN 'EXPIRED' THEN 'failed'
        WHEN 'CANCELLED' THEN 'cancelled'
        ELSE 'unknown'
      END AS norm_status,
      'razorpay' AS payment_mode,
      ROUND(COALESCE(wti.amount,0) * 100)::bigint AS gross_paise,
      CASE WHEN wti.status = 'PAID' THEN ROUND(COALESCE(wti.amount,0) * 100)::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      wti.pg_order_id AS razorpay_order_id,
      wti.pg_payment_id AS razorpay_payment_id,
      wti.intent_id AS internal_ref,
      wti.wallet_transaction_id::text AS business_order_id,
      'customer' AS entity_type, wti.customer_id::text AS entity_id,
      wti.created_at, wti.updated_at
    FROM customer_wallet_topup_intents wti
  )
`;

function decodeCursor(cursor: string): { createdAt: string; uid: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const idx = raw.indexOf("|");
    if (idx < 0) return null;
    return { createdAt: raw.slice(0, idx), uid: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: string, uid: string): string {
  return Buffer.from(`${createdAt}|${uid}`, "utf8").toString("base64");
}

export async function listTransactions(params: ListTransactionsParams): Promise<ListTransactionsResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const conds: SQL[] = [];

  if (params.app) conds.push(sql`t.app = ${params.app}`);
  if (params.service) conds.push(sql`t.service = ${params.service.toLowerCase()}`);
  if (params.normStatus) conds.push(sql`t.norm_status = ${params.normStatus}`);
  if (params.paymentMode) conds.push(sql`t.payment_mode = ${params.paymentMode.toLowerCase()}`);
  if (params.dateFrom) conds.push(sql`t.created_at >= ${params.dateFrom}`);
  if (params.dateTo) conds.push(sql`t.created_at <= ${params.dateTo}`);
  if (params.amountMinPaise != null) conds.push(sql`t.gross_paise >= ${params.amountMinPaise}`);
  if (params.amountMaxPaise != null) conds.push(sql`t.gross_paise <= ${params.amountMaxPaise}`);

  const q = params.search?.trim();
  if (q) {
    // Exact-lookup on the indexed id columns (avoid unbounded LIKE on huge tables).
    conds.push(sql`(
      t.razorpay_order_id = ${q}
      OR t.razorpay_payment_id = ${q}
      OR t.business_order_id = ${q}
      OR t.internal_ref = ${q}
      OR t.entity_id = ${q}
    )`);
  }

  if (params.cursor) {
    const c = decodeCursor(params.cursor);
    if (c) conds.push(sql`(t.created_at, t.uid) < (${c.createdAt}::timestamptz, ${c.uid})`);
  }

  const where = conds.length ? sql` WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  const query = sql`
    ${UNION_CTE}
    SELECT t.* FROM all_txn t
    ${where}
    ORDER BY t.created_at DESC, t.uid DESC
    LIMIT ${limit + 1}
  `;

  const db = getDb();
  const res = await db.execute(query);
  const raw = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

  const hasMore = raw.length > limit;
  const page = hasMore ? raw.slice(0, limit) : raw;

  const rows: TransactionRow[] = page.map((r) => {
    const createdAt = new Date(String(r.created_at)).toISOString();
    return {
      uid: String(r.uid),
      source: String(r.source),
      app: String(r.app) as TxnApp,
      service: String(r.service ?? ""),
      purpose: String(r.purpose ?? ""),
      status: String(r.status ?? ""),
      normStatus: String(r.norm_status ?? "unknown") as TxnNormStatus,
      paymentMode: r.payment_mode != null ? String(r.payment_mode) : null,
      grossPaise: Number(r.gross_paise ?? 0),
      paidPaise: Number(r.paid_paise ?? 0),
      currency: String(r.currency ?? "INR"),
      razorpayOrderId: r.razorpay_order_id != null ? String(r.razorpay_order_id) : null,
      razorpayPaymentId: r.razorpay_payment_id != null ? String(r.razorpay_payment_id) : null,
      internalRef: r.internal_ref != null ? String(r.internal_ref) : null,
      businessOrderId: r.business_order_id != null ? String(r.business_order_id) : null,
      entityType: String(r.entity_type ?? ""),
      entityId: r.entity_id != null ? String(r.entity_id) : null,
      createdAt,
      updatedAt: r.updated_at != null ? new Date(String(r.updated_at)).toISOString() : null,
    };
  });

  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.uid) : null;
  return { rows, nextCursor, hasMore };
}

export interface TransactionLifecycleEvent {
  eventType: string;
  source: string;
  prevState: string | null;
  newState: string | null;
  amountPaise: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

/**
 * Lifecycle timeline for one transaction, read from the payment_events spine by
 * whatever gateway/business ids we hold. Read-only.
 */
export async function getTransactionLifecycle(keys: {
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  businessOrderId?: string | null;
  internalRef?: string | null;
}): Promise<TransactionLifecycleEvent[]> {
  const conds: SQL[] = [];
  if (keys.razorpayOrderId) conds.push(sql`pe.razorpay_order_id = ${keys.razorpayOrderId}`);
  if (keys.razorpayPaymentId) conds.push(sql`pe.razorpay_payment_id = ${keys.razorpayPaymentId}`);
  if (keys.businessOrderId) conds.push(sql`pe.order_id = ${keys.businessOrderId}`);
  if (keys.internalRef) conds.push(sql`pe.pending_id = ${keys.internalRef}`);
  if (!conds.length) return [];

  const db = getDb();
  const res = await db.execute(sql`
    SELECT pe.event_type, pe.source, pe.prev_state, pe.new_state,
           pe.amount_paise, pe.failure_code, pe.failure_message, pe.created_at
    FROM payment_events pe
    WHERE ${sql.join(conds, sql` OR `)}
    ORDER BY pe.created_at ASC
    LIMIT 200
  `);
  const raw = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
  return raw.map((r) => ({
    eventType: String(r.event_type ?? ""),
    source: String(r.source ?? ""),
    prevState: r.prev_state != null ? String(r.prev_state) : null,
    newState: r.new_state != null ? String(r.new_state) : null,
    amountPaise: r.amount_paise != null ? Number(r.amount_paise) : null,
    failureCode: r.failure_code != null ? String(r.failure_code) : null,
    failureMessage: r.failure_message != null ? String(r.failure_message) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

export type BreakdownKind =
  | "base" | "fee" | "tax" | "surge" | "tip" | "discount" | "wallet" | "subscription" | "total" | "paid" | "refund" | "other";
export interface BreakdownComponent { label: string; amountPaise: number; kind: BreakdownKind; }
export interface TransactionDetail {
  row: TransactionRow | null;
  breakdown: BreakdownComponent[];
  lifecycle: TransactionLifecycleEvent[];
}

const rupeesToPaise = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
const asNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Normalize a persisted billing_snapshot into display components. Never recomputes. */
function breakdownFromBillingSnapshot(snap: Record<string, unknown> | null, extras: { tip?: number; gatiCash?: number; grandTotal?: number }): BreakdownComponent[] {
  const out: BreakdownComponent[] = [];
  const itemTotal = asNum(snap?.item_total ?? snap?.itemTotal);
  const addonTotal = asNum(snap?.addon_total ?? snap?.addonTotal);
  if (itemTotal + addonTotal > 0) out.push({ label: "Item subtotal", amountPaise: rupeesToPaise(itemTotal + addonTotal), kind: "base" });

  const charges = Array.isArray(snap?.charges) ? (snap!.charges as Array<Record<string, unknown>>) : [];
  for (const c of charges) {
    const amt = asNum(c.amount);
    if (amt === 0) continue;
    const type = String(c.chargeType ?? c.type ?? "charge");
    const isSurge = /surge/i.test(type);
    out.push({ label: String(c.label ?? type), amountPaise: rupeesToPaise(amt), kind: isSurge ? "surge" : "fee" });
  }
  const taxes = Array.isArray(snap?.taxes) ? (snap!.taxes as Array<Record<string, unknown>>) : [];
  for (const tx of taxes) {
    const amt = asNum(tx.amount ?? tx.taxAmount);
    if (amt === 0) continue;
    out.push({ label: String(tx.label ?? tx.taxGroup ?? "GST"), amountPaise: rupeesToPaise(amt), kind: "tax" });
  }
  const tip = asNum(extras.tip ?? snap?.tip_amount);
  if (tip > 0) out.push({ label: "Tip", amountPaise: rupeesToPaise(tip), kind: "tip" });

  const discounts = Array.isArray(snap?.discounts) ? (snap!.discounts as Array<Record<string, unknown>>) : [];
  for (const d of discounts) {
    const amt = Math.abs(asNum(d.amount));
    if (amt === 0) continue;
    out.push({ label: String(d.label ?? d.type ?? "Discount"), amountPaise: -rupeesToPaise(amt), kind: "discount" });
  }
  const gatiCash = asNum(extras.gatiCash);
  if (gatiCash > 0) out.push({ label: "GatiCash", amountPaise: -rupeesToPaise(gatiCash), kind: "wallet" });

  if (extras.grandTotal != null) out.push({ label: "Total payable", amountPaise: rupeesToPaise(extras.grandTotal), kind: "total" });
  return out;
}

export async function getTransactionDetail(uid: string): Promise<TransactionDetail> {
  const sep = uid.indexOf(":");
  const source = sep >= 0 ? uid.slice(0, sep) : "";
  const idStr = sep >= 0 ? uid.slice(sep + 1) : "";
  const id = Number(idStr);
  const db = getDb();

  // Summary row: re-select this uid through the same normalized union (one row).
  const summaryRes = await db.execute(sql`${UNION_CTE} SELECT t.* FROM all_txn t WHERE t.uid = ${uid} LIMIT 1`);
  const sRaw = (Array.isArray(summaryRes) ? summaryRes : (summaryRes as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
  const row: TransactionRow | null = sRaw[0]
    ? {
        uid: String(sRaw[0].uid),
        source: String(sRaw[0].source),
        app: String(sRaw[0].app) as TxnApp,
        service: String(sRaw[0].service ?? ""),
        purpose: String(sRaw[0].purpose ?? ""),
        status: String(sRaw[0].status ?? ""),
        normStatus: String(sRaw[0].norm_status ?? "unknown") as TxnNormStatus,
        paymentMode: sRaw[0].payment_mode != null ? String(sRaw[0].payment_mode) : null,
        grossPaise: Number(sRaw[0].gross_paise ?? 0),
        paidPaise: Number(sRaw[0].paid_paise ?? 0),
        currency: String(sRaw[0].currency ?? "INR"),
        razorpayOrderId: sRaw[0].razorpay_order_id != null ? String(sRaw[0].razorpay_order_id) : null,
        razorpayPaymentId: sRaw[0].razorpay_payment_id != null ? String(sRaw[0].razorpay_payment_id) : null,
        internalRef: sRaw[0].internal_ref != null ? String(sRaw[0].internal_ref) : null,
        businessOrderId: sRaw[0].business_order_id != null ? String(sRaw[0].business_order_id) : null,
        entityType: String(sRaw[0].entity_type ?? ""),
        entityId: sRaw[0].entity_id != null ? String(sRaw[0].entity_id) : null,
        createdAt: new Date(String(sRaw[0].created_at)).toISOString(),
        updatedAt: sRaw[0].updated_at != null ? new Date(String(sRaw[0].updated_at)).toISOString() : null,
      }
    : null;

  const breakdown: BreakdownComponent[] = [];
  try {
    if (source === "pending_orders" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT billing_snapshot, grand_total, tip_amount, gati_cash_applied FROM pending_orders WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) breakdown.push(...breakdownFromBillingSnapshot((rr.billing_snapshot as Record<string, unknown>) ?? null, { tip: asNum(rr.tip_amount), gatiCash: asNum(rr.gati_cash_applied), grandTotal: asNum(rr.grand_total) }));
    } else if (source === "order_payment" && row?.businessOrderId) {
      const r = await db.execute(sql`SELECT billing_snapshot, grand_total FROM orders_core WHERE order_id = ${row.businessOrderId} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) breakdown.push(...breakdownFromBillingSnapshot((rr.billing_snapshot as Record<string, unknown>) ?? null, { grandTotal: asNum(rr.grand_total) }));
    } else if (source === "onboarding_payment" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT amount, subtotal_paise, gst_amount_paise FROM onboarding_payments WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) {
        if (rr.subtotal_paise != null) breakdown.push({ label: "Onboarding fee", amountPaise: Number(rr.subtotal_paise), kind: "base" });
        if (rr.gst_amount_paise != null) breakdown.push({ label: "GST", amountPaise: Number(rr.gst_amount_paise), kind: "tax" });
        breakdown.push({ label: "Total", amountPaise: rupeesToPaise(rr.amount), kind: "total" });
      }
    } else if (source === "subscription_payment" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT amount, subtotal_paise, gst_amount_paise, total_paise, refund_amount FROM subscription_payments WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) {
        if (rr.subtotal_paise != null) breakdown.push({ label: "Plan fee", amountPaise: Number(rr.subtotal_paise), kind: "subscription" });
        if (rr.gst_amount_paise != null) breakdown.push({ label: "GST", amountPaise: Number(rr.gst_amount_paise), kind: "tax" });
        breakdown.push({ label: "Total", amountPaise: Number(rr.total_paise ?? rupeesToPaise(rr.amount)), kind: "total" });
        if (rr.refund_amount != null && asNum(rr.refund_amount) > 0) breakdown.push({ label: "Refunded", amountPaise: -rupeesToPaise(rr.refund_amount), kind: "refund" });
      }
    } else if (source === "rider_wallet_payment" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT amount_paise, refund_amount_paise FROM rider_wallet_payments WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) {
        breakdown.push({ label: "Amount", amountPaise: Number(rr.amount_paise ?? 0), kind: "total" });
        if (rr.refund_amount_paise != null && Number(rr.refund_amount_paise) > 0) breakdown.push({ label: "Refunded", amountPaise: -Number(rr.refund_amount_paise), kind: "refund" });
      }
    } else if (row) {
      // Wallet top-up / other: single amount.
      breakdown.push({ label: row.service === "wallet_topup" ? "Top-up amount" : "Amount", amountPaise: row.grossPaise, kind: "total" });
    }
  } catch {
    /* breakdown best-effort — summary + lifecycle still returned */
  }

  const lifecycle = row
    ? await getTransactionLifecycle({
        razorpayOrderId: row.razorpayOrderId,
        razorpayPaymentId: row.razorpayPaymentId,
        businessOrderId: row.businessOrderId,
        internalRef: row.internalRef,
      })
    : [];

  return { row, breakdown, lifecycle };
}
