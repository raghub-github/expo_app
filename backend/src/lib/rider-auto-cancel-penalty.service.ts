/**
 * Penalty for a watchdog AUTO-CANCEL (sustained pre-pickup breach: GPS off / not moving /
 * wrong direction). Debits the configured flat penalty from the rider wallet.
 *
 * The 0318 wallet trigger intentionally does NOTHING for entry_type 'penalty' (see migration),
 * so — like the manual cancellation-penalty path — we update rider_wallet EXPLICITLY here.
 * Idempotent via a unique ledger ref. Best-effort; returns whether it debited.
 */
import { getSql } from "../db/client.js";

export type AutoCancelPenaltyResult = { applied: boolean; amount?: number; skipped?: string };

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function serviceKey(orderType: string): "food" | "parcel" | "person_ride" {
  const t = String(orderType ?? "").trim().toLowerCase();
  if (t === "person_ride" || t === "ride") return "person_ride";
  if (t === "parcel") return "parcel";
  return "food";
}

function penaltyColumn(service: "food" | "parcel" | "person_ride"): string {
  return service === "food"
    ? "penalties_food"
    : service === "parcel"
      ? "penalties_parcel"
      : "penalties_person_ride";
}

function negativeUsedColumn(service: "food" | "parcel" | "person_ride"): string {
  return service === "food"
    ? "negative_used_food"
    : service === "parcel"
      ? "negative_used_parcel"
      : "negative_used_person_ride";
}

export function autoCancelPenaltyRef(orderCoreId: number, riderId: number, rule: string): string {
  return `rider_autocancel_pen:${orderCoreId}:${riderId}:${rule}`;
}

export async function applyAutoCancelRiderPenalty(input: {
  orderCoreId: number;
  riderId: number;
  orderType: string;
  amount: number;
  rule: string;
  ledgerTitle: string;
  ledgerDescription?: string | null;
  orderPublicId?: string | null;
}): Promise<AutoCancelPenaltyResult> {
  const amount = round2(input.amount);
  if (!(amount > 0)) return { applied: false, skipped: "zero_amount" };

  const sql = getSql();
  const ref = autoCancelPenaltyRef(input.orderCoreId, input.riderId, input.rule);
  try {
    const dup = await sql`SELECT 1 FROM wallet_ledger WHERE rider_id = ${input.riderId} AND ref = ${ref} LIMIT 1`;
    if (dup.length > 0) return { applied: false, skipped: "already_applied" };

    const service = serviceKey(input.orderType);
    const title = input.ledgerTitle?.trim() || "Auto-cancellation penalty";
    const desc = (input.ledgerDescription ?? title).trim();

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
        VALUES (${input.riderId}, 0, NOW())
        ON CONFLICT (rider_id) DO NOTHING
      `;
      const walletRows = await tx`
        SELECT COALESCE(total_balance, 0) AS bal FROM rider_wallet WHERE rider_id = ${input.riderId} FOR UPDATE
      `;
      const current = round2(Number((walletRows[0] as { bal?: unknown })?.bal ?? 0));
      const balanceAfter = round2(current - amount);
      const negativeUsedDelta = balanceAfter < 0 ? (current >= 0 ? amount - current : amount) : 0;

      // Trigger skips 'penalty' — update the wallet explicitly (debit + penalty bucket).
      await tx`
        INSERT INTO wallet_ledger (
          rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, performed_by_type
        ) VALUES (
          ${input.riderId}, 'penalty', ${amount.toFixed(2)}, ${balanceAfter.toFixed(2)}, ${service}, ${ref}, 'penalty',
          ${desc},
          ${JSON.stringify({
            orderId: input.orderCoreId,
            orderPublicId: input.orderPublicId ?? String(input.orderCoreId),
            serviceType: service,
            reason: "auto_cancel_penalty",
            rule: input.rule,
          })}::text::jsonb,
          'system'
        )
      `;
      await tx.unsafe(
        `UPDATE rider_wallet
           SET total_balance = $1,
               ${penaltyColumn(service)} = ${penaltyColumn(service)} + $2,
               ${negativeUsedColumn(service)} = ${negativeUsedColumn(service)} + $3,
               last_updated_at = NOW()
         WHERE rider_id = $4`,
        [balanceAfter.toFixed(2), amount.toFixed(2), negativeUsedDelta.toFixed(2), input.riderId]
      );
    });

    // Best-effort: re-sync any negative-wallet duty blocks.
    try {
      const { syncNegativeWalletBlocks } = await import("./rider-negative-wallet-blocks.js");
      await syncNegativeWalletBlocks(input.riderId);
    } catch {
      /* non-fatal */
    }

    return { applied: true, amount };
  } catch {
    return { applied: false, skipped: "error" };
  }
}
