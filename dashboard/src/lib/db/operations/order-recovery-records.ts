/**
 * Read-only aggregation of penalty / recovery ledger rows tied to an order.
 * Combines rider cancellation penalties (rider_penalties) and merchant
 * cancellation debits/credits (merchant_wallet_ledger) so the dashboard can
 * show "who was charged how much" for a single order in one table.
 */

import { getSql } from "../client";

export type RecoveryParty = "rider" | "merchant";
export type RecoveryImpact = "debit" | "credit" | "info";

export interface OrderRecoveryRecord {
  id: string;
  party: RecoveryParty;
  partyLabel: string;
  kind: string;
  reason: string | null;
  /** Always a positive magnitude. Sign is derived from `impact` in the UI. */
  amount: number;
  impact: RecoveryImpact;
  /** Whether the debit was a partial or full charge (null when N/A). */
  debitScope: "partial" | "full" | null;
  status: string | null;
  createdAt: string | null;
}

function resolveDebitScope(
  debitMode: string | null | undefined,
  impact: RecoveryImpact,
  amount: number,
  referenceAmount: number | null
): "partial" | "full" | null {
  const mode = (debitMode ?? "").trim().toLowerCase();
  if (mode.includes("partial")) return "partial";
  if (mode.includes("full")) return "full";
  // Credits never have a debit scope.
  if (impact === "credit") return null;
  if (
    referenceAmount != null &&
    referenceAmount > 0 &&
    amount > 0 &&
    amount < referenceAmount - 0.01
  ) {
    return "partial";
  }
  // Debits (and info-only cancellation charges) default to full when amount > 0.
  if (impact === "debit" || (impact === "info" && amount > 0)) return "full";
  return null;
}

function isRelationMissingError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const o = e as { code?: string; message?: string };
    if (o.code === "42P01" || o.code === "42703") return true;
    if (typeof o.message === "string" && /does not exist/i.test(o.message)) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist/i.test(msg);
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.abs(Math.round(n * 100) / 100) : 0;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function listRiderPenalties(orderCoreId: number): Promise<OrderRecoveryRecord[]> {
  const sql = getSql();
  try {
    const rows = await sql.unsafe<
      {
        id: number;
        amount: string | null;
        reason: string | null;
        status: string | null;
        penalty_type: string | null;
        imposed_at: string | Date | null;
        rider_id: number | null;
        rider_name: string | null;
        rider_mobile: string | null;
      }[]
    >(
      `
        SELECT
          rp.id,
          rp.amount::text AS amount,
          rp.reason,
          rp.status,
          rp.penalty_type,
          rp.imposed_at,
          rp.rider_id,
          r.name AS rider_name,
          r.mobile AS rider_mobile
        FROM rider_penalties rp
        LEFT JOIN riders r ON r.id = rp.rider_id
        WHERE rp.order_id = $1
        ORDER BY rp.imposed_at DESC
      `,
      [orderCoreId]
    );

    return rows.map((row) => {
      const riderLabel = row.rider_name?.trim() || row.rider_mobile?.trim();
      const partyLabel = row.rider_id
        ? `Rider #${row.rider_id}${riderLabel ? ` · ${riderLabel}` : ""}`
        : "Rider";
      const status = row.status?.trim() || "active";
      const reversed = status.toLowerCase() === "reversed";
      const kindRaw = row.penalty_type?.trim() || "cancellation";
      const kind = `${kindRaw.charAt(0).toUpperCase()}${kindRaw.slice(1)} penalty`.replace(
        /_/g,
        " "
      );
      const impact: RecoveryImpact = reversed ? "info" : "debit";
      const amount = toNum(row.amount);
      return {
        id: `rider-penalty-${row.id}`,
        party: "rider" as const,
        partyLabel,
        kind,
        reason: row.reason?.trim() || null,
        amount,
        impact,
        debitScope: resolveDebitScope(null, impact, amount, null),
        status,
        createdAt: toIso(row.imposed_at),
      };
    });
  } catch (e) {
    if (isRelationMissingError(e)) return [];
    console.error("[listRiderPenalties]", orderCoreId, e);
    return [];
  }
}

async function listMerchantCancellationLedger(
  orderCoreId: number
): Promise<OrderRecoveryRecord[]> {
  const sql = getSql();
  try {
    const rows = await sql.unsafe<
      {
        id: number;
        amount: string | null;
        direction: string | null;
        description: string | null;
        status: string | null;
        created_at: string | Date | null;
        balance_impact: string | null;
        debit_mode: string | null;
      }[]
    >(
      `
        SELECT
          l.id,
          l.amount::text AS amount,
          l.direction::text AS direction,
          l.description,
          l.status::text AS status,
          l.created_at,
          (l.metadata->>'balance_impact') AS balance_impact,
          (l.metadata->>'merchant_debit_mode') AS debit_mode
        FROM merchant_wallet_ledger l
        WHERE (l.metadata->>'orders_core_id')::bigint = $1
          AND (l.metadata->>'entry_type') = 'order_cancellation'
        ORDER BY l.created_at DESC
      `,
      [orderCoreId]
    );

    return rows.map((row) => {
      const dir = (row.direction ?? "").trim().toUpperCase();
      const balanceImpact = (row.balance_impact ?? "").trim().toLowerCase();
      let impact: RecoveryImpact;
      if (balanceImpact === "none" || balanceImpact === "info") {
        impact = "info";
      } else if (dir === "CREDIT" || balanceImpact === "credit") {
        impact = "credit";
      } else {
        impact = "debit";
      }
      const kind =
        impact === "credit"
          ? "Merchant compensation credit"
          : impact === "info"
            ? "Merchant cancellation (no wallet impact)"
            : "Merchant debit";
      const amount = toNum(row.amount);
      return {
        id: `merchant-ledger-${row.id}`,
        party: "merchant" as const,
        partyLabel: "Merchant",
        kind,
        reason: row.description?.trim() || null,
        amount,
        impact,
        debitScope: resolveDebitScope(row.debit_mode, impact, amount, null),
        status: row.status?.trim() || null,
        createdAt: toIso(row.created_at),
      };
    });
  } catch (e) {
    if (isRelationMissingError(e)) return [];
    console.error("[listMerchantCancellationLedger]", orderCoreId, e);
    return [];
  }
}

/** Returns all penalty / debit / credit records tied to an order, newest first. */
export async function listOrderRecoveryRecords(
  orderCoreId: number
): Promise<OrderRecoveryRecord[]> {
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) return [];
  const [riderRows, merchantRows] = await Promise.all([
    listRiderPenalties(orderCoreId),
    listMerchantCancellationLedger(orderCoreId),
  ]);
  return [...riderRows, ...merchantRows].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}
