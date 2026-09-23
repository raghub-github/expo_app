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
  /** Customer-facing order id (GMF/GMP/GMR…) for customer orders; null for non-order flows. */
  businessOrderId: string | null;
  entityType: string;
  /** Internal pk (customers.id / riders.id / merchant_stores.id). */
  entityId: string | null;
  /** Human name — customer/rider name or store name. */
  entityName: string | null;
  /** Display identifier — store GMMC id, rider GMR id, or customer mobile. */
  entityDisplayId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListTransactionsParams {
  app?: TxnApp | null;
  /** When more than one app is selected. Empty = use `app`. */
  apps?: string[] | null;
  service?: string | null;
  normStatus?: TxnNormStatus | null;
  /** Canonical payment statuses. Empty = use `normStatus`. */
  paymentStatuses?: string[] | null;
  paymentMode?: string | null;
  search?: string | null;
  dateFrom?: string | null; // ISO
  dateTo?: string | null; // ISO
  amountMinPaise?: number | null;
  amountMaxPaise?: number | null;
  /** Formatted public order id (GMF/GM…). Never a numeric pk. */
  orderId?: string | null;
  /** Food-board stages plus terminal outcomes. Empty = no order-status filter. */
  orderStatuses?: string[] | null;
  /** Payment modes. Empty = all. */
  paymentModes?: string[] | null;
  /** Services / order-page categories. Empty = all. */
  services?: string[] | null;
  /** GatiMitra | Merchant. Empty = all. */
  delivery?: string[] | null;
  /** Trust-tier labels (Premium, Very Good, …). Empty = all. */
  userTypes?: string[] | null;
  /** ETA-breached orders only (order page "Overdue"). */
  overdueOnly?: boolean | null;
  /** keyset cursor: base64("<created_at ISO>|<uid>"), exclusive */
  cursor?: string | null;
  /** 1-based page for offset pagination (list UI). Ignored when cursor is set. */
  page?: number | null;
  limit?: number;
  /** Raises the page cap for the export walker. Not accepted from the public list route. */
  forExport?: boolean;
}

export interface ListTransactionsResult {
  rows: TransactionRow[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Total matching rows (for page UI). Null when using cursor-only export walks. */
  total: number | null;
  page: number;
  pageSize: number;
}

/**
 * The normalized UNION. Kept as one CTE so filters/keyset apply uniformly. Each
 * SELECT maps its source's columns onto the shared projection + a norm_status.
 */
const UNION_CTE = sql`
  WITH all_txn AS (
    -- Customer food/grocery (authoritative customer-order payment lifecycle).
    -- gross = the full bill (grand_total = payable AFTER GatiCash, so add it back).
    -- business_order_id: prefer live orders_core.formatted_order_id, then pending
    -- checkout_metadata / billing_snapshot (survives core deletes for GatiCash/mixed/Razorpay).
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
      CASE
        WHEN COALESCE(po.gati_cash_applied,0) > 0.005 AND COALESCE(po.grand_total,0) <= 0.005 THEN 'gaticash'
        WHEN COALESCE(po.gati_cash_applied,0) > 0.005 THEN 'mixed'
        ELSE po.payment_method
      END AS payment_mode,
      ROUND((COALESCE(po.grand_total,0) + COALESCE(po.gati_cash_applied,0)) * 100)::bigint AS gross_paise,
      CASE WHEN po.payment_state IN ('finalized','paid')
        THEN ROUND((COALESCE(po.grand_total,0) + COALESCE(po.gati_cash_applied,0)) * 100)::bigint ELSE 0 END AS paid_paise,
      COALESCE(po.currency,'INR') AS currency,
      po.razorpay_order_id, po.razorpay_payment_id,
      po.pending_id AS internal_ref,
      COALESCE(
        NULLIF(TRIM(oc.formatted_order_id), ''),
        NULLIF(TRIM(po.checkout_metadata->>'formatted_order_id'), ''),
        NULLIF(TRIM(po.billing_snapshot->>'formatted_order_id'), ''),
        NULLIF(TRIM(ofood.formatted_order_id), '')
      ) AS business_order_id,
      'customer' AS entity_type, po.customer_id::text AS entity_id,
      c.full_name AS entity_name,
      COALESCE(c.primary_mobile, po.customer_id::text) AS entity_display_id,
      po.created_at, po.updated_at,
      oc.status::text AS order_status,
      oc.current_status AS order_current_status,
      COALESCE(oc.is_bulk_order, false) AS is_bulk,
      oc.order_source::text AS order_source,
      COALESCE(po.billing_snapshot, oc.billing_snapshot) AS billing_snapshot,
      po.tip_amount AS tip_rupees,
      po.gati_cash_applied AS gati_cash_rupees,
      po.grand_total AS grand_total_rupees,
      NULL::bigint AS fee_subtotal_paise,
      NULL::bigint AS gst_paise,
      NULL::bigint AS refund_paise,
      oc.id AS core_id,
      c.trust_tier::text AS trust_tier,
      (oc.eta_breached_at IS NOT NULL) AS eta_breached,
      oc.merchant_store_id AS merchant_store_id,
      COALESCE(NULLIF(TRIM(oc.order_id), ''), NULLIF(TRIM(po.finalized_order_id), '')) AS ledger_order_id
    FROM pending_orders po
    LEFT JOIN customers c ON c.id = po.customer_id
    LEFT JOIN LATERAL (
      SELECT oc.*
      FROM orders_core oc
      WHERE po.finalized_order_id IS NOT NULL
        AND TRIM(po.finalized_order_id) <> ''
        AND (
          oc.order_id = po.finalized_order_id
          OR oc.formatted_order_id = po.finalized_order_id
          OR oc.id::text = po.finalized_order_id
          OR (
            po.finalized_order_id ~ '^[0-9]+$'
            AND oc.id = po.finalized_order_id::bigint
          )
        )
      ORDER BY
        CASE
          WHEN oc.formatted_order_id IS NOT NULL AND TRIM(oc.formatted_order_id) <> ''
            AND (
              oc.formatted_order_id = po.finalized_order_id
              OR oc.order_id = po.finalized_order_id
              OR oc.id::text = po.finalized_order_id
            )
            THEN 0
          WHEN oc.order_id = po.finalized_order_id THEN 1
          WHEN oc.formatted_order_id = po.finalized_order_id THEN 2
          ELSE 3
        END,
        oc.id DESC
      LIMIT 1
    ) oc ON true
    LEFT JOIN orders_food ofood ON ofood.order_id = oc.id

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
      NULLIF(TRIM(oc.formatted_order_id), '') AS business_order_id,
      'customer' AS entity_type, oc.customer_id::text AS entity_id,
      c.full_name AS entity_name,
      COALESCE(c.primary_mobile, oc.customer_id::text) AS entity_display_id,
      COALESCE(ocp.paid_at, ocp.created_at) AS created_at, ocp.created_at AS updated_at,
      oc.status::text AS order_status,
      oc.current_status AS order_current_status,
      COALESCE(oc.is_bulk_order, false) AS is_bulk,
      oc.order_source::text AS order_source,
      oc.billing_snapshot AS billing_snapshot,
      oc.tip_amount AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      oc.grand_total AS grand_total_rupees,
      NULL::bigint AS fee_subtotal_paise,
      NULL::bigint AS gst_paise,
      NULL::bigint AS refund_paise,
      oc.id AS core_id,
      c.trust_tier::text AS trust_tier,
      (oc.eta_breached_at IS NOT NULL) AS eta_breached,
      oc.merchant_store_id AS merchant_store_id,
      NULLIF(TRIM(oc.order_id), '') AS ledger_order_id
    FROM orders_core_payments ocp
    LEFT JOIN LATERAL (
      SELECT oc.*
      FROM orders_core oc
      WHERE ocp.order_id IS NOT NULL
        AND TRIM(ocp.order_id) <> ''
        AND (
          oc.order_id = ocp.order_id
          OR oc.formatted_order_id = ocp.order_id
          OR oc.id::text = ocp.order_id
          OR (
            ocp.order_id ~ '^[0-9]+$'
            AND oc.id = ocp.order_id::bigint
          )
        )
      ORDER BY
        CASE
          WHEN NULLIF(TRIM(oc.formatted_order_id), '') IS NOT NULL THEN 0
          WHEN oc.order_id = ocp.order_id THEN 1
          ELSE 2
        END,
        oc.id DESC
      LIMIT 1
    ) oc ON true
    LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
    LEFT JOIN customers c ON c.id = oc.customer_id
    WHERE oc.id IS NOT NULL
      AND oc.order_type IN ('parcel','person_ride')

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
      r.name AS entity_name,
      'GMR' || op.rider_id::text AS entity_display_id,
      op.created_at, op.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      op.amount AS grand_total_rupees,
      op.subtotal_paise AS fee_subtotal_paise,
      op.gst_amount_paise AS gst_paise,
      NULL::bigint AS refund_paise,
      NULL::bigint AS core_id,
      NULL::text AS trust_tier,
      false AS eta_breached,
      NULL::bigint AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM onboarding_payments op
    LEFT JOIN riders r ON r.id = op.rider_id

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
      r.name AS entity_name,
      'GMR' || rwp.rider_id::text AS entity_display_id,
      rwp.created_at, rwp.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      NULL::numeric AS grand_total_rupees,
      NULL::bigint AS fee_subtotal_paise,
      NULL::bigint AS gst_paise,
      rwp.refund_amount_paise AS refund_paise,
      NULL::bigint AS core_id,
      NULL::text AS trust_tier,
      false AS eta_breached,
      NULL::bigint AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM rider_wallet_payments rwp
    LEFT JOIN riders r ON r.id = rwp.rider_id

    UNION ALL
    -- Merchant subscription
    SELECT
      'subscription_payment:' || spmt.id::text AS uid,
      'subscription_payment' AS source,
      'merchant' AS app,
      'subscription' AS service,
      'subscription' AS purpose,
      spmt.payment_status::text AS status,
      CASE lower(COALESCE(spmt.payment_status::text,''))
        WHEN 'paid' THEN 'paid'
        WHEN 'refunded' THEN 'refunded'
        WHEN 'refund_pending' THEN 'refund_pending'
        WHEN 'failed' THEN 'failed'
        ELSE 'paid'
      END AS norm_status,
      COALESCE(spmt.payment_gateway,'razorpay') AS payment_mode,
      COALESCE(spmt.total_paise, ROUND(COALESCE(spmt.amount,0) * 100))::bigint AS gross_paise,
      CASE WHEN lower(COALESCE(spmt.payment_status::text,'')) IN ('paid','refunded','refund_pending') THEN COALESCE(spmt.total_paise, ROUND(COALESCE(spmt.amount,0) * 100))::bigint ELSE 0 END AS paid_paise,
      'INR' AS currency,
      (spmt.payment_gateway_response->>'razorpay_order_id') AS razorpay_order_id,
      spmt.payment_gateway_id AS razorpay_payment_id,
      spmt.id::text AS internal_ref,
      NULL AS business_order_id,
      'merchant' AS entity_type, spmt.store_id::text AS entity_id,
      COALESCE(s.store_display_name, s.store_name) AS entity_name,
      s.store_id AS entity_display_id,
      COALESCE(spmt.payment_date, spmt.created_at) AS created_at, spmt.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      spmt.amount AS grand_total_rupees,
      spmt.subtotal_paise AS fee_subtotal_paise,
      spmt.gst_amount_paise AS gst_paise,
      CASE WHEN spmt.refund_amount IS NOT NULL THEN ROUND(spmt.refund_amount * 100)::bigint ELSE NULL END AS refund_paise,
      NULL::bigint AS core_id,
      NULL::text AS trust_tier,
      false AS eta_breached,
      spmt.store_id AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM subscription_payments spmt
    LEFT JOIN merchant_stores s ON s.id = spmt.store_id

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
      COALESCE(s.store_display_name, s.store_name) AS entity_name,
      s.store_id AS entity_display_id,
      mwd.created_at, mwd.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      NULL::numeric AS grand_total_rupees,
      NULL::bigint AS fee_subtotal_paise,
      NULL::bigint AS gst_paise,
      NULL::bigint AS refund_paise,
      NULL::bigint AS core_id,
      NULL::text AS trust_tier,
      false AS eta_breached,
      mwd.merchant_store_id AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM merchant_wallet_dues_payments mwd
    LEFT JOIN merchant_stores s ON s.id = mwd.merchant_store_id

    UNION ALL
    -- Merchant onboarding fee (partner-site store registration payment)
    SELECT
      'merchant_onboarding:' || mop.id::text AS uid,
      'merchant_onboarding' AS source,
      'merchant' AS app,
      'onboarding' AS service,
      'onboarding_fee' AS purpose,
      mop.status AS status,
      CASE mop.status
        WHEN 'pending' THEN 'pending'
        WHEN 'created' THEN 'pending'
        WHEN 'captured' THEN 'paid'
        WHEN 'paid' THEN 'paid'
        WHEN 'failed' THEN 'failed'
        WHEN 'refunded' THEN 'refunded'
        ELSE 'unknown'
      END AS norm_status,
      'razorpay' AS payment_mode,
      mop.amount_paise::bigint AS gross_paise,
      CASE WHEN mop.status IN ('captured','paid') THEN mop.amount_paise::bigint ELSE 0 END AS paid_paise,
      COALESCE(mop.currency,'INR') AS currency,
      mop.razorpay_order_id, mop.razorpay_payment_id,
      NULL AS internal_ref,
      NULL AS business_order_id,
      'merchant' AS entity_type,
      COALESCE(mop.merchant_store_id::text, mop.merchant_parent_id::text) AS entity_id,
      COALESCE(s.store_display_name, s.store_name, mop.plan_name) AS entity_name,
      COALESCE(s.store_id, 'parent:' || mop.merchant_parent_id::text) AS entity_display_id,
      mop.created_at, mop.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      NULL::numeric AS grand_total_rupees,
      mop.subtotal_paise AS fee_subtotal_paise,
      mop.gst_amount_paise AS gst_paise,
      NULL::bigint AS refund_paise,
      NULL::bigint AS core_id,
      NULL::text AS trust_tier,
      false AS eta_breached,
      mop.merchant_store_id AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM merchant_onboarding_payments mop
    LEFT JOIN merchant_stores s ON s.id = mop.merchant_store_id

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
      NULL AS business_order_id,
      'customer' AS entity_type, wti.customer_id::text AS entity_id,
      c.full_name AS entity_name,
      COALESCE(c.primary_mobile, wti.customer_id::text) AS entity_display_id,
      wti.created_at, wti.updated_at,
      NULL::text AS order_status,
      NULL::text AS order_current_status,
      false AS is_bulk,
      NULL::text AS order_source,
      NULL::jsonb AS billing_snapshot,
      NULL::numeric AS tip_rupees,
      NULL::numeric AS gati_cash_rupees,
      wti.amount AS grand_total_rupees,
      NULL::bigint AS fee_subtotal_paise,
      NULL::bigint AS gst_paise,
      NULL::bigint AS refund_paise,
      NULL::bigint AS core_id,
      c.trust_tier::text AS trust_tier,
      false AS eta_breached,
      NULL::bigint AS merchant_store_id,
      NULL::text AS ledger_order_id
    FROM customer_wallet_topup_intents wti
    LEFT JOIN customers c ON c.id = wti.customer_id
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

/** User-facing order id only. Drops numeric pks and UUIDs. */
export function publicOrderId(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim().replace(/^#/, "");
  if (!t) return null;
  if (/^\d+$/.test(t)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  return t;
}

/** GM10000398 also matches GMF/GMC/GMP of the same digits (order-page alias). */
export function orderIdAliases(raw: string): string[] {
  const bare = raw.trim().replace(/^#/, "").toUpperCase();
  if (!bare) return [];
  const set = new Set<string>([bare]);
  const prefixed = bare.match(/^(GMF|GMC|GMP|GM)(\d+)$/);
  if (prefixed) {
    const digits = prefixed[2];
    set.add(`GM${digits}`);
    set.add(`GMF${digits}`);
    set.add(`GMC${digits}`);
    set.add(`GMP${digits}`);
  }
  return [...set];
}

/** Map one raw union row → normalized TransactionRow. Shared by list + detail. */
function mapTxnRow(r: Record<string, unknown>): TransactionRow {
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
    businessOrderId: publicOrderId(r.business_order_id),
    entityType: String(r.entity_type ?? ""),
    entityId: r.entity_id != null ? String(r.entity_id) : null,
    entityName: r.entity_name != null ? String(r.entity_name) : null,
    entityDisplayId: r.entity_display_id != null ? String(r.entity_display_id) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: r.updated_at != null ? new Date(String(r.updated_at)).toISOString() : null,
  };
}

const TRUST_LABEL_TO_DB: Record<string, string> = {
  Premium: "PREMIUM",
  "Very Good": "VERY_GOOD",
  Good: "GOOD",
  Bad: "BAD",
  "Very Bad": "VERY_BAD",
  Fraud: "FRAUD",
};

const FOOD_STORE_TYPES = [
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "STATIONERY",
  "ELECTRONICS_ECOMMERCE",
  "OTHERS",
];

function inList(values: string[]): SQL {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

function expandPaymentModes(modes: string[]): string[] {
  const set = new Set(modes.map((m) => m.toLowerCase()).filter(Boolean));
  if (set.has("gati_cash") || set.has("gaticash")) {
    set.add("gati_cash");
    set.add("gaticash");
  }
  return [...set];
}

function orderStatusFilterSql(statuses: string[]): SQL | null {
  const parts: SQL[] = [];
  for (const raw of statuses) {
    const s = raw.trim().toUpperCase();
    if (s === "BULK") parts.push(sql`t.is_bulk = true`);
    else if (s === "PAYMENT DONE") {
      parts.push(sql`(
        t.order_status IN ('assigned','created','bill_ready','payment_initiated_at','payment_done','pymt_assign_rx')
        OR upper(replace(COALESCE(t.order_current_status, ''), ' ', '_')) IN (
          'PLACED','CREATED','NEW','ORDER_PLACED','ORDER_RECEIVED','PAYMENT_DONE','PYMT_ASSIGN_RX',
          'BILL_READY','PAYMENT_INITIATED_AT','PAYMENT_INITIATED','ASSIGNED'
        )
      )`);
    } else if (s === "ACCEPTED") {
      parts.push(sql`(
        t.order_status IN ('accepted','reached_store')
        OR upper(replace(COALESCE(t.order_current_status, ''), ' ', '_')) IN ('ACCEPTED','PREPARING','RIDER_AT_PICKUP','REACHED_STORE','REACHED_MERCHANT')
      )`);
    } else if (s === "DESPATCH READY") {
      parts.push(sql`(
        t.order_status = 'dispatch_ready'
        OR upper(replace(COALESCE(t.order_current_status, ''), ' ', '_')) IN ('READY_FOR_PICKUP','READY','DISPATCH_READY','DISPATCHREADY','DISPATCH_READY_FOR_PICKUP')
      )`);
    } else if (s === "DESPATCHED") {
      parts.push(sql`(
        t.order_status IN ('picked_up','in_transit','dispatched')
        OR upper(replace(COALESCE(t.order_current_status, ''), ' ', '_')) IN ('OUT_FOR_DELIVERY','DISPATCHED','DESPATCHED','ON_THE_WAY','IN_TRANSIT','PICKED_UP')
      )`);
    } else if (s === "DELIVERED") {
      parts.push(sql`(t.order_status = 'delivered' OR upper(COALESCE(t.order_current_status, '')) IN ('DELIVERED','COMPLETED','COMPLETE'))`);
    } else if (s === "CANCELLED") {
      parts.push(sql`(t.order_status = 'cancelled' OR upper(COALESCE(t.order_current_status, '')) IN ('CANCELLED','CANCELED'))`);
    } else if (s === "FAILED") {
      parts.push(sql`(t.order_status = 'failed' OR upper(COALESCE(t.order_current_status, '')) = 'FAILED')`);
    } else if (s === "REJECTED") {
      parts.push(sql`(t.order_status = 'rejected' OR upper(COALESCE(t.order_current_status, '')) = 'REJECTED')`);
    }
  }
  if (!parts.length) return null;
  return sql`(${sql.join(parts, sql` OR `)})`;
}

function serviceFilterSql(services: string[]): SQL | null {
  const parts: SQL[] = [];
  for (const raw of services) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    if (key === "food") {
      parts.push(sql`(
        EXISTS (
          SELECT 1 FROM merchant_stores ms
          WHERE ms.id = t.merchant_store_id
            AND COALESCE(NULLIF(upper(trim(ms.store_type::text)), ''), 'RESTAURANT') IN (${inList(FOOD_STORE_TYPES)})
        )
        OR (t.service = 'food' AND t.merchant_store_id IS NULL)
      )`);
    } else if (key === "grocery" || key === "fashion" || key === "pharma") {
      parts.push(sql`(
        t.service = ${key}
        OR EXISTS (
          SELECT 1 FROM merchant_stores ms
          WHERE ms.id = t.merchant_store_id
            AND upper(trim(COALESCE(ms.store_type::text, ''))) = ${key.toUpperCase()}
        )
      )`);
    } else if (key === "negative_wallet" || key === "negative_wallet_recovery") {
      parts.push(sql`t.service IN ('negative_wallet', 'negative_wallet_recovery')`);
    } else if (key === "pickup") {
      parts.push(sql`EXISTS (
        SELECT 1 FROM orders_food of
        WHERE of.order_id = t.core_id
          AND (
            COALESCE(of.delivery_instructions, '') ILIKE '%pickup%'
            OR COALESCE(of.delivery_instructions, '') ILIKE '%self collect%'
            OR COALESCE(of.delivery_instructions, '') ILIKE '%self-collect%'
          )
      )`);
    } else {
      parts.push(sql`t.service = ${key}`);
    }
  }
  if (!parts.length) return null;
  return sql`(${sql.join(parts, sql` OR `)})`;
}

async function fetchTxnPage(params: ListTransactionsParams): Promise<{
  page: Array<Record<string, unknown>>;
  hasMore: boolean;
  total: number | null;
  pageNum: number;
  pageSize: number;
}> {
  const cap = params.forExport ? 2_000 : 100;
  const limit = Math.min(Math.max(params.limit ?? (params.forExport ? 2_000 : 20), 1), cap);
  const conds: SQL[] = [];

  if (params.apps?.length) conds.push(sql`t.app IN (${inList(params.apps.map((a) => a.toLowerCase()))})`);
  else if (params.app) conds.push(sql`t.app = ${params.app}`);
  if (params.service) conds.push(sql`t.service = ${params.service.toLowerCase()}`);
  if (params.services?.length) {
    const svc = serviceFilterSql(params.services);
    if (svc) conds.push(svc);
  }
  if (params.paymentStatuses?.length) {
    const statuses = params.paymentStatuses.map((s) => s.toLowerCase()).filter(Boolean);
    if (statuses.length) conds.push(sql`t.norm_status IN (${inList(statuses)})`);
  } else if (params.normStatus) conds.push(sql`t.norm_status = ${params.normStatus}`);
  if (params.paymentModes?.length) {
    const modes = expandPaymentModes(params.paymentModes);
    if (modes.length) conds.push(sql`lower(COALESCE(t.payment_mode, '')) IN (${inList(modes)})`);
  } else if (params.paymentMode) {
    const modes = expandPaymentModes([params.paymentMode]);
    conds.push(sql`lower(COALESCE(t.payment_mode, '')) IN (${inList(modes)})`);
  }
  if (params.dateFrom) conds.push(sql`t.created_at >= ${params.dateFrom}::date`);
  if (params.dateTo) conds.push(sql`t.created_at < (${params.dateTo}::date + interval '1 day')`);
  if (params.amountMinPaise != null) conds.push(sql`t.gross_paise >= ${params.amountMinPaise}`);
  if (params.amountMaxPaise != null) conds.push(sql`t.gross_paise <= ${params.amountMaxPaise}`);
  if (params.orderId?.trim()) {
    const aliases = orderIdAliases(params.orderId);
    if (aliases.length) {
      conds.push(sql`upper(TRIM(COALESCE(t.business_order_id, ''))) IN (${inList(aliases)})`);
    }
  }
  if (params.orderStatuses?.length) {
    const st = orderStatusFilterSql(params.orderStatuses);
    if (st) conds.push(st);
  }
  if (params.delivery?.length) {
    const parts: SQL[] = [];
    if (params.delivery.includes("GatiMitra")) {
      parts.push(sql`(t.core_id IS NOT NULL AND (t.order_source IS NULL OR t.order_source = 'internal'))`);
    }
    if (params.delivery.includes("Merchant")) {
      parts.push(sql`(t.core_id IS NOT NULL AND t.order_source IS NOT NULL AND t.order_source <> 'internal')`);
    }
    if (parts.length) conds.push(sql`(${sql.join(parts, sql` OR `)})`);
  }
  if (params.userTypes?.length) {
    const tiers = params.userTypes.map((l) => TRUST_LABEL_TO_DB[l]).filter(Boolean);
    if (tiers.length) conds.push(sql`t.trust_tier IN (${inList(tiers)})`);
  }
  if (params.overdueOnly) conds.push(sql`t.eta_breached = true`);

  const q = params.search?.trim();
  if (q) {
    const aliases = orderIdAliases(q);
    const aliasMatch = aliases.length
      ? sql`OR upper(TRIM(COALESCE(t.business_order_id, ''))) IN (${inList(aliases)})`
      : sql``;
    conds.push(sql`(
      t.razorpay_order_id = ${q}
      OR t.razorpay_payment_id = ${q}
      OR t.business_order_id = ${q}
      ${aliasMatch}
      OR t.internal_ref = ${q}
      OR t.entity_id = ${q}
      OR t.entity_display_id = ${q}
    )`);
  }

  const useCursor = Boolean(params.cursor);
  const pageNum = Math.max(1, Math.floor(params.page ?? 1));
  if (useCursor) {
    const c = decodeCursor(params.cursor!);
    if (c) conds.push(sql`(t.created_at, t.uid) < (${c.createdAt}::timestamptz, ${c.uid})`);
  }

  const where = conds.length ? sql` WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const db = getDb();
  const offset = useCursor ? 0 : (pageNum - 1) * limit;

  let total: number | null = null;
  if (!params.forExport && !useCursor) {
    const countRes = await db.execute(sql`
      ${UNION_CTE}
      SELECT COUNT(*)::int AS total FROM all_txn t
      ${where}
    `);
    const countRows = (Array.isArray(countRes)
      ? countRes
      : (countRes as { rows?: unknown[] }).rows ?? []) as Array<{ total?: number }>;
    total = Number(countRows[0]?.total ?? 0);
  }

  const res = await db.execute(sql`
    ${UNION_CTE}
    SELECT t.* FROM all_txn t
    ${where}
    ORDER BY t.created_at DESC, t.uid DESC
    LIMIT ${limit + 1}
    ${useCursor ? sql`` : sql`OFFSET ${offset}`}
  `);
  const raw = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
  const hasMore = raw.length > limit;
  return {
    page: hasMore ? raw.slice(0, limit) : raw,
    hasMore,
    total,
    pageNum: useCursor ? 1 : pageNum,
    pageSize: limit,
  };
}

export async function listTransactions(params: ListTransactionsParams): Promise<ListTransactionsResult> {
  const { page, hasMore, total, pageNum, pageSize } = await fetchTxnPage(params);
  const rows: TransactionRow[] = page.map(mapTxnRow);
  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.uid) : null;
  return { rows, nextCursor, hasMore, total, page: pageNum, pageSize };
}

export interface PaymentLine {
  label: string;
  amountPaise: number;
}

/** One export row. Order id is always the formatted public id. */
export interface TransactionExportRow {
  formattedOrderId: string | null;
  createdAt: string;
  updatedAt: string | null;
  app: string;
  service: string;
  purpose: string;
  orderStatus: string;
  paymentStatus: string;
  normStatus: string;
  paymentMode: string | null;
  currency: string;
  grossPaise: number;
  paidPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  internalRef: string | null;
  entityName: string | null;
  entityDisplayId: string | null;
  orderSource: string | null;
  userType: string | null;
  isBulk: boolean;
  overdue: boolean;
  itemSubtotalPaise: number;
  addonPaise: number;
  tipPaise: number;
  gatiCashPaise: number;
  grandTotalPaise: number;
  feeSubtotalPaise: number;
  gstPaise: number;
  refundPaise: number;
  taxes: PaymentLine[];
  charges: PaymentLine[];
  discounts: PaymentLine[];
}

const DB_TIER_LABEL: Record<string, string> = {
  PREMIUM: "Premium",
  VERY_GOOD: "Very Good",
  GOOD: "Good",
  BAD: "Bad",
  VERY_BAD: "Very Bad",
  FRAUD: "Fraud",
};

function rupeesPaise(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function humanize(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/_/g, " ").trim();
}

function snapshotLines(snap: Record<string, unknown> | null, key: string): PaymentLine[] {
  const raw = snap?.[key];
  if (!Array.isArray(raw)) return [];
  const out: PaymentLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const amt = Number(row.amount ?? row.taxAmount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const label = String(row.label ?? row.taxGroup ?? row.type ?? row.chargeType ?? key).trim() || key;
    out.push({ label, amountPaise: Math.round(Math.abs(amt) * 100) });
  }
  return out;
}

type LedgerBreakdown = {
  taxes: PaymentLine[];
  charges: PaymentLine[];
  discounts: PaymentLine[];
};

/** Prefer OMS ledger tables (order_tax_lines / charge / discount) over billing_snapshot JSON. */
async function loadOrderLedgerBreakdown(
  orderIds: string[]
): Promise<Map<string, LedgerBreakdown>> {
  const map = new Map<string, LedgerBreakdown>();
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const db = getDb();

  const ensure = (orderId: string): LedgerBreakdown => {
    let row = map.get(orderId);
    if (!row) {
      row = { taxes: [], charges: [], discounts: [] };
      map.set(orderId, row);
    }
    return row;
  };

  // Chunk IN lists so large exports stay within postgres parameter limits.
  const CHUNK = 800;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const idList = inList(slice);

    try {
      const taxRes = await db.execute(sql`
        WITH latest AS (
          SELECT order_id, MAX(version_no)::int AS version_no
          FROM order_tax_lines
          WHERE order_id IN (${idList})
          GROUP BY order_id
        )
        SELECT t.order_id,
               COALESCE(NULLIF(TRIM(t.tax_group), ''), 'Tax') AS label,
               t.tax_amount
        FROM order_tax_lines t
        INNER JOIN latest l ON l.order_id = t.order_id AND l.version_no = t.version_no
        ORDER BY t.order_id, t.line_no
      `);
      const taxRows = (Array.isArray(taxRes) ? taxRes : (taxRes as { rows?: unknown[] }).rows ?? []) as Array<
        Record<string, unknown>
      >;
      for (const r of taxRows) {
        const orderId = String(r.order_id ?? "").trim();
        const amt = Number(r.tax_amount ?? 0);
        if (!orderId || !Number.isFinite(amt) || amt === 0) continue;
        ensure(orderId).taxes.push({
          label: String(r.label ?? "Tax"),
          amountPaise: Math.round(Math.abs(amt) * 100),
        });
      }
    } catch (err) {
      console.warn("[transactions/export] order_tax_lines load failed", err);
    }

    try {
      const chargeRes = await db.execute(sql`
        WITH latest AS (
          SELECT order_id, MAX(version_no)::int AS version_no
          FROM order_charge_lines
          WHERE order_id IN (${idList})
          GROUP BY order_id
        )
        SELECT c.order_id,
               COALESCE(NULLIF(TRIM(c.charge_type), ''), 'Charge') AS label,
               c.final_amount
        FROM order_charge_lines c
        INNER JOIN latest l ON l.order_id = c.order_id AND l.version_no = c.version_no
        ORDER BY c.order_id, c.line_no
      `);
      const chargeRows = (Array.isArray(chargeRes)
        ? chargeRes
        : (chargeRes as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
      for (const r of chargeRows) {
        const orderId = String(r.order_id ?? "").trim();
        const amt = Number(r.final_amount ?? 0);
        if (!orderId || !Number.isFinite(amt) || amt === 0) continue;
        ensure(orderId).charges.push({
          label: String(r.label ?? "Charge"),
          amountPaise: Math.round(Math.abs(amt) * 100),
        });
      }
    } catch (err) {
      console.warn("[transactions/export] order_charge_lines load failed", err);
    }

    try {
      const discountRes = await db.execute(sql`
        WITH latest AS (
          SELECT order_id, MAX(version_no)::int AS version_no
          FROM order_discount_lines
          WHERE order_id IN (${idList})
          GROUP BY order_id
        )
        SELECT d.order_id,
               COALESCE(NULLIF(TRIM(d.discount_type), ''), 'Discount') AS label,
               d.amount
        FROM order_discount_lines d
        INNER JOIN latest l ON l.order_id = d.order_id AND l.version_no = d.version_no
        ORDER BY d.order_id, d.line_no
      `);
      const discountRows = (Array.isArray(discountRes)
        ? discountRes
        : (discountRes as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
      for (const r of discountRows) {
        const orderId = String(r.order_id ?? "").trim();
        const amt = Number(r.amount ?? 0);
        if (!orderId || !Number.isFinite(amt) || amt === 0) continue;
        ensure(orderId).discounts.push({
          label: String(r.label ?? "Discount"),
          amountPaise: Math.round(Math.abs(amt) * 100),
        });
      }
    } catch (err) {
      console.warn("[transactions/export] order_discount_lines load failed", err);
    }
  }

  return map;
}

function mapExportRow(
  r: Record<string, unknown>,
  ledger?: LedgerBreakdown | null
): TransactionExportRow {
  const snap =
    r.billing_snapshot && typeof r.billing_snapshot === "object"
      ? (r.billing_snapshot as Record<string, unknown>)
      : null;
  const cur = humanize(r.order_current_status);
  const core = humanize(r.order_status);
  const bulk = r.is_bulk === true || r.is_bulk === "t" || r.is_bulk === "true";
  let orderStatus = cur || core;
  if (bulk) orderStatus = orderStatus ? `${orderStatus} (Bulk)` : "Bulk";
  const tier = r.trust_tier != null ? String(r.trust_tier) : "";
  const source = r.order_source != null ? String(r.order_source) : null;
  const snapTaxes = snapshotLines(snap, "taxes");
  const snapCharges = snapshotLines(snap, "charges");
  const snapDiscounts = snapshotLines(snap, "discounts");
  return {
    formattedOrderId: publicOrderId(r.business_order_id),
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: r.updated_at != null ? new Date(String(r.updated_at)).toISOString() : null,
    app: String(r.app ?? ""),
    service: String(r.service ?? ""),
    purpose: String(r.purpose ?? ""),
    orderStatus,
    paymentStatus: humanize(r.status),
    normStatus: String(r.norm_status ?? ""),
    paymentMode: r.payment_mode != null ? String(r.payment_mode) : null,
    currency: String(r.currency ?? "INR"),
    grossPaise: Number(r.gross_paise ?? 0),
    paidPaise: Number(r.paid_paise ?? 0),
    razorpayOrderId: r.razorpay_order_id != null ? String(r.razorpay_order_id) : null,
    razorpayPaymentId: r.razorpay_payment_id != null ? String(r.razorpay_payment_id) : null,
    internalRef: r.internal_ref != null ? String(r.internal_ref) : null,
    entityName: r.entity_name != null ? String(r.entity_name) : null,
    entityDisplayId: r.entity_display_id != null ? String(r.entity_display_id) : null,
    orderSource: source == null ? null : source === "internal" ? "GatiMitra" : source,
    userType: DB_TIER_LABEL[tier] ?? (tier ? humanize(tier) : null),
    isBulk: bulk,
    overdue: r.eta_breached === true || r.eta_breached === "t" || r.eta_breached === "true",
    itemSubtotalPaise: rupeesPaise(snap?.item_total ?? snap?.itemTotal),
    addonPaise: rupeesPaise(snap?.addon_total ?? snap?.addonTotal),
    tipPaise: rupeesPaise(r.tip_rupees ?? snap?.tip_amount),
    gatiCashPaise: rupeesPaise(r.gati_cash_rupees),
    grandTotalPaise: rupeesPaise(r.grand_total_rupees),
    feeSubtotalPaise: Number(r.fee_subtotal_paise ?? 0) || 0,
    gstPaise: Number(r.gst_paise ?? 0) || 0,
    refundPaise: Number(r.refund_paise ?? 0) || 0,
    taxes: ledger?.taxes?.length ? ledger.taxes : snapTaxes,
    charges: ledger?.charges?.length ? ledger.charges : snapCharges,
    discounts: ledger?.discounts?.length ? ledger.discounts : snapDiscounts,
  };
}

/** Soft safety ceiling — exports page through filters until exhausted or this cap. */
const EXPORT_ROW_CAP = 100_000;

export async function exportTransactions(
  params: ListTransactionsParams
): Promise<{ rows: TransactionExportRow[]; truncated: boolean }> {
  const collected: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let i = 0; i < 200; i++) {
    const { page, hasMore } = await fetchTxnPage({
      ...params,
      cursor,
      limit: 2_000,
      forExport: true,
    });
    for (const raw of page) {
      if (collected.length >= EXPORT_ROW_CAP) {
        truncated = true;
        break;
      }
      collected.push(raw);
    }
    if (truncated || !hasMore || page.length === 0) break;
    const last = page[page.length - 1];
    cursor = encodeCursor(new Date(String(last.created_at)).toISOString(), String(last.uid));
  }

  const ledgerIds = collected
    .map((r) => (r.ledger_order_id != null ? String(r.ledger_order_id).trim() : ""))
    .filter(Boolean);
  const ledger = await loadOrderLedgerBreakdown(ledgerIds);

  const rows = collected.map((raw) => {
    const id = raw.ledger_order_id != null ? String(raw.ledger_order_id).trim() : "";
    return mapExportRow(raw, id ? ledger.get(id) ?? null : null);
  });

  return { rows, truncated };
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
  if (keys.businessOrderId) {
    const formatted = keys.businessOrderId.trim();
    const aliases = orderIdAliases(formatted);
    conds.push(sql`upper(TRIM(COALESCE(pe.order_id, ''))) IN (${inList(aliases.length ? aliases : [formatted.toUpperCase()])})`);
    conds.push(sql`pe.order_id IN (
      SELECT oc.order_id FROM orders_core oc
      LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
      WHERE upper(TRIM(COALESCE(oc.formatted_order_id, ''))) IN (${inList(aliases.length ? aliases : [formatted.toUpperCase()])})
         OR upper(TRIM(COALESCE(ofood.formatted_order_id, ''))) IN (${inList(aliases.length ? aliases : [formatted.toUpperCase()])})
      UNION
      SELECT oc.id::text FROM orders_core oc
      LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
      WHERE upper(TRIM(COALESCE(oc.formatted_order_id, ''))) IN (${inList(aliases.length ? aliases : [formatted.toUpperCase()])})
         OR upper(TRIM(COALESCE(ofood.formatted_order_id, ''))) IN (${inList(aliases.length ? aliases : [formatted.toUpperCase()])})
    )`);
  }
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
  const row: TransactionRow | null = sRaw[0] ? mapTxnRow(sRaw[0]) : null;

  const breakdown: BreakdownComponent[] = [];
  try {
    if (source === "pending_orders" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT billing_snapshot, grand_total, tip_amount, gati_cash_applied FROM pending_orders WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) breakdown.push(...breakdownFromBillingSnapshot((rr.billing_snapshot as Record<string, unknown>) ?? null, { tip: asNum(rr.tip_amount), gatiCash: asNum(rr.gati_cash_applied), grandTotal: asNum(rr.grand_total) }));
    } else if (source === "order_payment" && row?.businessOrderId) {
      const aliases = orderIdAliases(row.businessOrderId);
      const r = await db.execute(sql`
        SELECT oc.billing_snapshot, oc.grand_total, oc.tip_amount
        FROM orders_core oc
        LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
        WHERE upper(TRIM(COALESCE(oc.formatted_order_id, ''))) IN (${inList(aliases)})
           OR upper(TRIM(COALESCE(ofood.formatted_order_id, ''))) IN (${inList(aliases)})
           OR upper(TRIM(COALESCE(oc.order_id, ''))) IN (${inList(aliases)})
        LIMIT 1
      `);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) breakdown.push(...breakdownFromBillingSnapshot((rr.billing_snapshot as Record<string, unknown>) ?? null, { tip: asNum(rr.tip_amount), grandTotal: asNum(rr.grand_total) }));
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
    } else if (source === "merchant_onboarding" && Number.isFinite(id)) {
      const r = await db.execute(sql`SELECT amount_paise, subtotal_paise, gst_amount_paise FROM merchant_onboarding_payments WHERE id = ${id} LIMIT 1`);
      const rr = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0];
      if (rr) {
        if (rr.subtotal_paise != null) breakdown.push({ label: "Onboarding fee", amountPaise: Number(rr.subtotal_paise), kind: "base" });
        if (rr.gst_amount_paise != null) breakdown.push({ label: "GST", amountPaise: Number(rr.gst_amount_paise), kind: "tax" });
        breakdown.push({ label: "Total", amountPaise: Number(rr.amount_paise ?? row?.grossPaise ?? 0), kind: "total" });
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
