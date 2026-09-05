import type { Sql } from "postgres";
import { isModernRefundRrn, isWeakRefundReference } from "./refund-rrn.js";

export type CustomerRefundTimelineStep = {
  key: string;
  label: string;
  at: string | null;
};

export type CustomerRefundSlab = {
  amount: number;
  reference: string | null;
  status: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
};

export type CustomerOrderRefundSummary = {
  status: string | null;
  amount: number | null;
  /** Primary customer-facing RRN (latest modern RRN-{UUID}). */
  reference: string | null;
  /** Every customer RRN across refund slabs (chronological). */
  references: string[];
  /** One entry per settled/in-flight refund row (partial + follow-up slabs). */
  slabs: CustomerRefundSlab[];
  /** GatiCash / wallet ledger reference when wallet portion was restored. */
  walletReference: string | null;
  /** Razorpay / PG refund id when a gateway refund exists. */
  gatewayReference: string | null;
  /** Original GatiCash payment transaction id this refund restores against. */
  originalGatiCashTxnId: string | null;
  route: string | null;
  walletAmount: number | null;
  gatewayAmount: number | null;
  initiatedAt: string | null;
  processedAt: string | null;
  completedAt: string | null;
  timeline: CustomerRefundTimelineStep[];
};

export type CustomerOrderPaymentSettlement = {
  gatiCashUsed: number;
  gatewayAmount: number;
  settlement: "gati_cash" | "gateway" | "mixed" | "unknown";
  fullyGatiCash: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseTimeline(raw: unknown): CustomerRefundTimelineStep[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerRefundTimelineStep[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!key && !label) continue;
    out.push({ key: key || "step", label: label || key, at: isoOrNull(o.at) });
  }
  return out;
}

function buildFallbackTimeline(args: {
  amount: number | null;
  initiatedAt: string | null;
  processedAt: string | null;
  completedAt: string | null;
  status: string | null;
}): CustomerRefundTimelineStep[] {
  const amt =
    args.amount != null && Number.isFinite(args.amount)
      ? ` for ₹${args.amount.toFixed(2)}`
      : "";
  const steps: CustomerRefundTimelineStep[] = [
    {
      key: "initiated",
      label: `Refund initiated${amt}`,
      at: args.initiatedAt,
    },
    {
      key: "processed",
      label: "Refund processed",
      at: args.processedAt ?? args.initiatedAt,
    },
  ];
  const st = (args.status ?? "").toLowerCase();
  if (st === "completed" || st === "refunded" || st === "processed") {
    steps.push({
      key: "completed",
      label: "Refund completed",
      at: args.completedAt ?? args.processedAt ?? args.initiatedAt,
    });
  }
  return steps;
}

function normalizeRefundStatus(
  exec: string | null | undefined,
  status: string | null | undefined,
  opts?: { amount?: number | null; hasMoneyMovement?: boolean }
): string | null {
  const e = String(exec ?? "").toUpperCase();
  const s = String(status ?? "").trim().toLowerCase();
  const amount = Number(opts?.amount ?? 0);
  const moved = opts?.hasMoneyMovement === true;
  // Hollow Completed/NOOP without wallet/gateway movement is not a customer refund.
  if (
    amount > 0.005 &&
    !moved &&
    (e === "NOOP" || e === "COMPLETED" || s === "completed" || s === "refunded")
  ) {
    return "pending";
  }
  if (e === "COMPLETED" || e === "NOOP" || s === "completed" || s === "refunded") {
    return "completed";
  }
  if (e === "PROCESSING" || s === "processing") return "processing";
  if (s) return s;
  return null;
}

function trimRef(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Local placeholder from migration / early stamp — never preferred over real ids. */
function isPlaceholderRefundRef(ref: string | null | undefined): boolean {
  if (!ref) return true;
  return isWeakRefundReference(ref);
}

function isWalletRefundRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  return /^(WALLET-|GCWR-)/i.test(ref.trim());
}

function isGatewayRefundRef(ref: string | null | undefined): boolean {
  if (!ref?.trim()) return false;
  const t = ref.trim();
  // Avoid `isModernRefundRrn` type-predicate narrowing (`string` → `never` on false).
  if (isPlaceholderRefundRef(t) || isWalletRefundRef(t)) return false;
  if (/^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(t)) {
    return false;
  }
  // Razorpay refund ids are `rfnd_…`; other gateways keep opaque non-placeholder ids.
  if (/^rfnd_/i.test(t)) return true;
  return t.length >= 8;
}

/**
 * Structured wallet refund reference for support tracing.
 * Unique per refund row + ledger entry (no payment-amount / routing changes).
 */
function buildWalletRefundReference(args: {
  refundRowId: number | null;
  ledgerId: number | null;
  stored: string | null;
}): string | null {
  const ledger =
    args.ledgerId != null && Number.isFinite(args.ledgerId) && args.ledgerId > 0
      ? Math.trunc(args.ledgerId)
      : null;
  const refundId =
    args.refundRowId != null && Number.isFinite(args.refundRowId) && args.refundRowId > 0
      ? Math.trunc(args.refundRowId)
      : null;

  if (ledger != null && refundId != null) return `GCWR-${refundId}-${ledger}`;
  if (ledger != null) return `WALLET-${ledger}`;
  if (args.stored && isWalletRefundRef(args.stored) && !isPlaceholderRefundRef(args.stored)) {
    return args.stored.trim();
  }
  if (refundId != null) return `GCWR-${refundId}`;
  return null;
}

function resolveCustomerRefundReferences(row: Record<string, unknown>): {
  reference: string | null;
  walletReference: string | null;
  gatewayReference: string | null;
} {
  const refundRowId = Number(row.id);
  const ledgerId =
    row.customer_wallet_ledger_id != null ? Number(row.customer_wallet_ledger_id) : null;
  const stored = trimRef(row.refund_reference);
  const razorpay = trimRef(row.razorpay_refund_id);
  const pg = trimRef(row.pg_refund_id);

  const gatewayReference =
    (razorpay && isGatewayRefundRef(razorpay) ? razorpay : null) ||
    (pg && isGatewayRefundRef(pg) ? pg : null);

  const hasWalletCredit =
    (ledgerId != null && Number.isFinite(ledgerId) && ledgerId > 0) ||
    num(row.split_wallet_amount ?? row.customer_wallet_amount ?? row.original_gati_cash_amount) >
      0.005;

  const walletReference = hasWalletCredit
    ? buildWalletRefundReference({
        refundRowId: Number.isFinite(refundRowId) ? refundRowId : null,
        ledgerId: Number.isFinite(ledgerId as number) ? (ledgerId as number) : null,
        stored,
      })
    : stored && isWalletRefundRef(stored)
      ? stored
      : null;

  // Customer RRN: prefer modern RRN-{UUID}; never RFND-/WALLET-/GCWR-/rfnd_*.
  const reference =
    (stored && isModernRefundRrn(stored) ? stored.toUpperCase() : null) ||
    (stored && !isPlaceholderRefundRef(stored) && !isGatewayRefundRef(stored)
      ? stored
      : null) ||
    walletReference ||
    gatewayReference ||
    stored;

  return { reference, walletReference, gatewayReference };
}

function customerFacingRrn(refs: {
  reference: string | null;
  walletReference: string | null;
  gatewayReference: string | null;
}): string | null {
  const raw = refs.reference?.trim() || null;
  if (!raw) return null;
  if (/^RFND-\d+$/i.test(raw)) return null;
  if (isModernRefundRrn(raw)) return raw.toUpperCase();
  if (isPlaceholderRefundRef(raw) || isWalletRefundRef(raw) || isGatewayRefundRef(raw)) {
    return null;
  }
  return raw;
}

function mergeRefundStatus(statuses: Array<string | null>): string | null {
  const normalized = statuses.map((s) => (s ?? "").trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return null;
  if (normalized.some((s) => s === "processing" || s === "pending")) {
    return normalized.some((s) => s === "processing") ? "processing" : "pending";
  }
  if (normalized.every((s) => s === "completed" || s === "refunded")) return "completed";
  return normalized[normalized.length - 1] ?? null;
}

function mergeRefundRoute(routes: string[], walletAmount: number, gatewayAmount: number): string | null {
  const set = new Set(routes.map((r) => r.trim().toUpperCase()).filter(Boolean));
  if (walletAmount > 0.005 && gatewayAmount > 0.005) return "MIXED";
  if (set.has("MIXED")) return "MIXED";
  if (set.has("WALLET") && (set.has("RAZORPAY") || set.has("GATEWAY"))) return "MIXED";
  if (set.has("WALLET") || (walletAmount > 0.005 && gatewayAmount <= 0.005)) return "WALLET";
  if (set.has("RAZORPAY") || set.has("GATEWAY") || gatewayAmount > 0.005) return "RAZORPAY";
  return routes.find((r) => r.trim())?.trim().toUpperCase() ?? null;
}

function pickIso(values: Array<string | null>, which: "earliest" | "latest"): string | null {
  const times = values
    .filter((v): v is string => Boolean(v))
    .map((v) => ({ v, t: Date.parse(v) }))
    .filter((x) => Number.isFinite(x.t));
  if (times.length === 0) return null;
  times.sort((a, b) => a.t - b.t);
  return which === "earliest" ? times[0]!.v : times[times.length - 1]!.v;
}

/** Combine every non-failed refund row for one order into a single customer summary. */
export function aggregateCustomerRefundRows(
  rows: Record<string, unknown>[]
): CustomerOrderRefundSummary | null {
  if (rows.length === 0) return null;

  const slabs: CustomerRefundSlab[] = [];
  const references: string[] = [];
  const seenRefs = new Set<string>();
  const statuses: Array<string | null> = [];
  const routes: string[] = [];
  let amount = 0;
  let walletAmount = 0;
  let gatewayAmount = 0;
  let walletReference: string | null = null;
  let gatewayReference: string | null = null;
  let originalGatiCashTxnId: string | null = null;
  const initiatedAts: Array<string | null> = [];
  const processedAts: Array<string | null> = [];
  const completedAts: Array<string | null> = [];
  const timeline: CustomerRefundTimelineStep[] = [];

  for (const row of rows) {
    const slabAmount = round2(num(row.refund_amount));
    const ledgerId =
      row.customer_wallet_ledger_id != null ? Number(row.customer_wallet_ledger_id) : null;
    const hasMoneyMovement =
      (ledgerId != null && Number.isFinite(ledgerId) && ledgerId > 0) ||
      Boolean(trimRef(row.razorpay_refund_id));
    const status = normalizeRefundStatus(
      row.execution_status != null ? String(row.execution_status) : null,
      row.refund_status != null ? String(row.refund_status) : null,
      { amount: slabAmount, hasMoneyMovement }
    );
    statuses.push(status);
    amount = round2(amount + slabAmount);
    const splitWallet = num(row.split_wallet_amount ?? row.customer_wallet_amount);
    const origWallet = num(row.original_gati_cash_amount);
    const slabWallet =
      splitWallet > 0.005
        ? splitWallet
        : origWallet > 0.005 && origWallet <= slabAmount + 0.02
          ? origWallet
          : String(row.execution_route ?? "").toUpperCase() === "WALLET"
            ? slabAmount
            : 0;
    const splitGw = num(row.split_razorpay_amount);
    const origGw = num(row.original_gateway_amount);
    const slabGw =
      splitGw > 0.005
        ? splitGw
        : origGw > 0.005 && origGw <= slabAmount + 0.02
          ? origGw
          : String(row.execution_route ?? "").toUpperCase() === "RAZORPAY" ||
              String(row.execution_route ?? "").toUpperCase() === "GATEWAY"
            ? slabAmount
            : 0;
    walletAmount = round2(walletAmount + slabWallet);
    gatewayAmount = round2(gatewayAmount + slabGw);
    if (typeof row.execution_route === "string" && row.execution_route.trim()) {
      routes.push(row.execution_route.trim());
    }
    const refs = resolveCustomerRefundReferences(row);
    if (refs.walletReference && !walletReference) walletReference = refs.walletReference;
    if (refs.gatewayReference && !gatewayReference) gatewayReference = refs.gatewayReference;
    const rrn = customerFacingRrn(refs);
    if (rrn && !seenRefs.has(rrn)) {
      seenRefs.add(rrn);
      references.push(rrn);
    }
    const txn =
      typeof row.original_gati_cash_txn_id === "string" && row.original_gati_cash_txn_id.trim()
        ? String(row.original_gati_cash_txn_id).trim()
        : null;
    if (txn && !originalGatiCashTxnId) originalGatiCashTxnId = txn;

    const initiatedAt = isoOrNull(row.initiated_at ?? row.created_at);
    const processedAt = isoOrNull(row.executed_at ?? row.initiated_at);
    const completedAt = isoOrNull(row.completed_at);
    initiatedAts.push(initiatedAt);
    processedAts.push(processedAt);
    completedAts.push(completedAt);

    slabs.push({
      amount: slabAmount,
      reference: rrn,
      status,
      initiatedAt,
      completedAt,
    });

    if (slabAmount > 0.005) {
      timeline.push({
        key: `initiated-${slabs.length}`,
        label:
          rows.length > 1
            ? `Refund ${slabs.length} of ₹${slabAmount.toFixed(2)} initiated`
            : `Refund initiated for ₹${slabAmount.toFixed(2)}`,
        at: initiatedAt,
      });
    }
  }

  const status = mergeRefundStatus(statuses);
  const initiatedAt = pickIso(initiatedAts, "earliest");
  const processedAt = pickIso(processedAts, "latest");
  const completedAt = pickIso(completedAts, "latest");
  const st = (status ?? "").toLowerCase();
  if (rows.length === 1) {
    const storedTimeline = parseTimeline(rows[0]?.refund_timeline);
    if (storedTimeline.length > 0) {
      timeline.length = 0;
      timeline.push(...storedTimeline);
    }
  }
  if (timeline.length === 0 && amount > 0) {
    timeline.push(
      ...buildFallbackTimeline({
        amount,
        initiatedAt,
        processedAt,
        completedAt,
        status,
      })
    );
  } else if (timeline.length > 0) {
    timeline.push({
      key: "processed",
      label: "Refund processed",
      at: processedAt ?? initiatedAt,
    });
    if (st === "completed" || st === "refunded" || st === "processed") {
      timeline.push({
        key: "completed",
        label: "Refund completed",
        at: completedAt ?? processedAt ?? initiatedAt,
      });
    }
  }

  return {
    status,
    amount: amount > 0 ? amount : null,
    reference: references[references.length - 1] ?? null,
    references,
    slabs,
    walletReference,
    gatewayReference,
    originalGatiCashTxnId,
    route: mergeRefundRoute(routes, walletAmount, gatewayAmount),
    walletAmount: walletAmount > 0.005 ? walletAmount : null,
    gatewayAmount: gatewayAmount > 0.005 ? gatewayAmount : null,
    initiatedAt,
    processedAt,
    completedAt,
    timeline,
  };
}

/**
 * Latest refund status for customer history "Refunded" badge.
 *
 * Prefer a completed/processing row on order_refunds (actual money movement),
 * then fall back to order_cancellation_reasons.refund_status (intent).
 */
export async function loadOrderRefundStatusByCorePks(
  sql: Sql,
  corePks: number[]
): Promise<Map<number, string | null>> {
  const summaries = await loadOrderRefundSummariesByCorePks(sql, corePks);
  const out = new Map<number, string | null>();
  for (const [pk, summary] of summaries) {
    out.set(pk, summary.status);
  }
  return out;
}

/** Full refund summary for list + detail (amount, RRN, timeline, split). */
export async function loadOrderRefundSummariesByCorePks(
  sql: Sql,
  corePks: number[]
): Promise<Map<number, CustomerOrderRefundSummary>> {
  const out = new Map<number, CustomerOrderRefundSummary>();
  if (corePks.length === 0) return out;

  try {
    const refundRows = await sql<Record<string, unknown>[]>`
      SELECT
        id,
        order_id,
        refund_status,
        execution_status::text AS execution_status,
        execution_route::text AS execution_route,
        refund_amount,
        refund_reference,
        razorpay_refund_id,
        pg_refund_id,
        customer_wallet_ledger_id,
        split_wallet_amount,
        split_razorpay_amount,
        customer_wallet_amount,
        original_gati_cash_amount,
        original_gateway_amount,
        original_gati_cash_txn_id,
        initiated_at,
        executed_at,
        completed_at,
        created_at,
        refund_timeline
      FROM order_refunds
      WHERE order_id IN ${sql(corePks)}
        AND UPPER(COALESCE(execution_status::text, '')) <> 'FAILED'
        AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
      ORDER BY order_id ASC, created_at ASC NULLS LAST, id ASC
    `;
    const grouped = new Map<number, Record<string, unknown>[]>();
    for (const row of refundRows) {
      const pk = Number(row.order_id);
      if (!Number.isFinite(pk)) continue;
      const list = grouped.get(pk) ?? [];
      list.push(row);
      grouped.set(pk, list);
    }
    for (const [pk, list] of grouped) {
      const summary = aggregateCustomerRefundRows(list);
      if (summary) out.set(pk, summary);
    }
  } catch {
    /* columns from 0483 / 0422 may be absent — fallback below */
    try {
      const refundRows = await sql<Record<string, unknown>[]>`
        SELECT
          id,
          order_id,
          refund_status,
          execution_status::text AS execution_status,
          refund_amount,
          refund_reference,
          razorpay_refund_id,
          pg_refund_id,
          customer_wallet_ledger_id,
          created_at,
          completed_at,
          executed_at
        FROM order_refunds
        WHERE order_id IN ${sql(corePks)}
          AND UPPER(COALESCE(execution_status::text, '')) <> 'FAILED'
          AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
        ORDER BY order_id ASC, created_at ASC NULLS LAST, id ASC
      `;
      const grouped = new Map<number, Record<string, unknown>[]>();
      for (const row of refundRows) {
        const pk = Number(row.order_id);
        if (!Number.isFinite(pk)) continue;
        const list = grouped.get(pk) ?? [];
        list.push(row);
        grouped.set(pk, list);
      }
      for (const [pk, list] of grouped) {
        if (out.has(pk)) continue;
        const summary = aggregateCustomerRefundRows(list);
        if (summary) out.set(pk, summary);
      }
    } catch {
      /* ignore */
    }
  }

  const missing = corePks.filter((pk) => !out.has(pk));
  if (missing.length === 0) return out;

  try {
    const rows = await sql<{ order_id: number; refund_status: string | null; refund_amount: unknown }[]>`
      SELECT DISTINCT ON (order_id) order_id, refund_status, refund_amount
      FROM order_cancellation_reasons
      WHERE order_id IN ${sql(missing)}
      ORDER BY order_id, created_at DESC
    `;
    for (const row of rows) {
      const pk = Number(row.order_id);
      if (!Number.isFinite(pk) || out.has(pk)) continue;
      const status = row.refund_status?.trim() || null;
      const amount = round2(num(row.refund_amount));
      out.set(pk, {
        status,
        amount: amount > 0 ? amount : null,
        reference: null,
        references: [],
        slabs:
          amount > 0
            ? [{ amount, reference: null, status, initiatedAt: null, completedAt: null }]
            : [],
        walletReference: null,
        gatewayReference: null,
        originalGatiCashTxnId: null,
        route: null,
        walletAmount: null,
        gatewayAmount: null,
        initiatedAt: null,
        processedAt: null,
        completedAt: null,
        timeline: [],
      });
    }
  } catch {
    /* table may be absent */
  }

  return out;
}

/** Original payment settlement for history “100% GatiCash used” + detail card. */
export async function loadOrderPaymentSettlementsByCorePks(
  sql: Sql,
  corePks: number[]
): Promise<Map<number, CustomerOrderPaymentSettlement>> {
  const out = new Map<number, CustomerOrderPaymentSettlement>();
  if (corePks.length === 0) return out;

  try {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT
        c.id AS core_pk,
        p.payment_gateway,
        p.amount AS payment_amount,
        p.gateway_response,
        po.gati_cash_applied AS pending_gati_cash
      FROM orders_core c
      LEFT JOIN LATERAL (
        SELECT payment_gateway, amount, gateway_response
        FROM orders_core_payments op
        WHERE op.order_id = c.order_id
          AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
        ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
        LIMIT 1
      ) p ON TRUE
      LEFT JOIN LATERAL (
        SELECT gati_cash_applied
        FROM pending_orders po
        WHERE po.finalized_order_id = c.order_id
        ORDER BY po.finalized_at DESC NULLS LAST
        LIMIT 1
      ) po ON TRUE
      WHERE c.id IN ${sql(corePks)}
    `;

    for (const row of rows) {
      const pk = Number(row.core_pk);
      if (!Number.isFinite(pk)) continue;

      let gatiCashUsed = 0;
      let gatewayAmount = 0;
      let settlement: CustomerOrderPaymentSettlement["settlement"] = "unknown";
      const gwResp = row.gateway_response;
      if (gwResp && typeof gwResp === "object") {
        const root = gwResp as Record<string, unknown>;
        const breakdown =
          root.breakdown && typeof root.breakdown === "object"
            ? (root.breakdown as Record<string, unknown>)
            : root;
        gatiCashUsed = Math.max(0, num(breakdown.gatiCashUsed));
        gatewayAmount = Math.max(0, num(breakdown.gatewayAmount));
        const s = String(breakdown.settlement ?? "").toLowerCase();
        if (s === "gati_cash" || s === "gateway" || s === "mixed") settlement = s;
      }
      if (gatiCashUsed <= 0.005) gatiCashUsed = Math.max(0, num(row.pending_gati_cash));
      const gw = String(row.payment_gateway ?? "").toLowerCase();
      const paid = Math.max(0, num(row.payment_amount));
      if (gatewayAmount <= 0.005 && (gw === "razorpay" || gw === "upi" || gw === "card")) {
        gatewayAmount = paid;
      }
      if (gatiCashUsed <= 0.005 && (gw === "gati_cash" || gw === "wallet")) {
        gatiCashUsed = paid;
      }
      if (settlement === "unknown") {
        const usedW = gatiCashUsed > 0.005;
        const usedG = gatewayAmount > 0.005;
        settlement = usedW && usedG ? "mixed" : usedW ? "gati_cash" : usedG ? "gateway" : "unknown";
      }
      const fullyGatiCash =
        settlement === "gati_cash" || (gatiCashUsed > 0.005 && gatewayAmount <= 0.005);

      out.set(pk, {
        gatiCashUsed: round2(gatiCashUsed),
        gatewayAmount: round2(gatewayAmount),
        settlement,
        fullyGatiCash,
      });
    }
  } catch {
    /* ignore */
  }

  return out;
}
