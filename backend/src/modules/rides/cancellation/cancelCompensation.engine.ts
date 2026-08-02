/**
 * Pre-pickup cancellation compensation engine.
 * Posts immutable settlement + credits rider wallet when customer cancels
 * after rider reached pickup and an active rule exists.
 */

import { getSql } from "../../../db/client.js";
import {
  computeCancellationCompensation,
  type CancelCalcType,
  type CancelPayerMode,
} from "./cancelCompensation.math.js";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export type CancelServiceType = "ride" | "parcel" | "food";

export async function postPrePickupCancellationCompensation(input: {
  orderCoreId: number;
  serviceType: CancelServiceType;
  riderId: number;
  customerId?: number | null;
  riderAtPickup: boolean;
  pickupKm: number;
  waitingMinutes: number;
  fareBase?: number;
}): Promise<{
  posted: boolean;
  settlementId: string | null;
  totalCompensation: number;
  alreadySettled?: boolean;
}> {
  if (!input.riderAtPickup || !(input.riderId > 0)) {
    return { posted: false, settlementId: null, totalCompensation: 0 };
  }

  const sql = getSql();

  const existing = await sql<Array<{ settlement_id: string; total_compensation: string }>>`
    SELECT settlement_id, total_compensation::text
    FROM service_cancellation_settlements
    WHERE order_core_id = ${input.orderCoreId}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      posted: false,
      alreadySettled: true,
      settlementId: existing[0].settlement_id,
      totalCompensation: round2(Number(existing[0].total_compensation)),
    };
  }

  const rules = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM service_cancellation_compensation_rules
    WHERE service_type = ${input.serviceType}
      AND is_active = TRUE
      AND requires_rider_at_pickup = TRUE
    ORDER BY priority DESC, id DESC
    LIMIT 1
  `;
  const ruleRow = rules[0];
  if (!ruleRow) {
    return { posted: false, settlementId: null, totalCompensation: 0 };
  }

  const result = computeCancellationCompensation({
    pickupKm: input.pickupKm,
    waitingMinutes: input.waitingMinutes,
    fareBase: input.fareBase,
    rule: {
      id: Number(ruleRow.id),
      calcType: String(ruleRow.calc_type) as CancelCalcType,
      valueNumeric: Number(ruleRow.value_numeric ?? 0),
      minCompensation:
        ruleRow.min_compensation == null ? null : Number(ruleRow.min_compensation),
      maxCompensation:
        ruleRow.max_compensation == null ? null : Number(ruleRow.max_compensation),
      includeWaitingCompensation: ruleRow.include_waiting_compensation !== false,
      waitingCompensationPerMin: Number(ruleRow.waiting_compensation_per_min ?? 0),
      payerMode: String(ruleRow.payer_mode ?? "CUSTOMER_100") as CancelPayerMode,
      customerSharePct: Number(ruleRow.customer_share_pct ?? 100),
      companySharePct: Number(ruleRow.company_share_pct ?? 0),
    },
  });

  if (!(result.totalCompensation > 0)) {
    return { posted: false, settlementId: null, totalCompensation: 0 };
  }

  const settlementId = `cancel_comp:v1:${input.orderCoreId}`;

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO service_cancellation_settlements (
          settlement_id, order_core_id, service_type, rider_id, customer_id, rule_id,
          rider_at_pickup, pickup_km, waiting_minutes,
          base_compensation, waiting_compensation, total_compensation,
          customer_share, company_share, payer_mode, calc_type,
          status, wallet_credited, breakdown
        ) VALUES (
          ${settlementId}, ${input.orderCoreId}, ${input.serviceType},
          ${input.riderId}, ${input.customerId ?? null}, ${Number(ruleRow.id)},
          TRUE, ${round2(input.pickupKm)}, ${round2(input.waitingMinutes)},
          ${result.baseCompensation}, ${result.waitingCompensation}, ${result.totalCompensation},
          ${result.customerShare}, ${result.companyShare},
          ${result.payerMode}, ${result.calcType},
          'settled', TRUE,
          ${JSON.stringify(result)}::jsonb
        )
      `;

      // Credit rider the full compensation (customer/company split is audit only for Phase C;
      // wallet credit is the rider payout).
      await tx`
        INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
        VALUES (${input.riderId}, 0, NOW())
        ON CONFLICT (rider_id) DO NOTHING
      `;
      const walletRef = `cancel_comp:${input.orderCoreId}`;
      const locked = await tx<Array<{ total_balance: string | null }>>`
        SELECT total_balance FROM rider_wallet
        WHERE rider_id = ${input.riderId}
        FOR UPDATE
      `;
      const bal = round2(Number(locked[0]?.total_balance ?? 0) + result.totalCompensation);
      await tx`
        INSERT INTO wallet_ledger (
          rider_id, entry_type, amount, balance,
          service_type, ref, ref_type, description, metadata, performed_by_type
        ) VALUES (
          ${input.riderId}, 'cancellation_payout', ${result.totalCompensation.toFixed(2)},
          ${bal.toFixed(2)},
          ${input.serviceType === "ride" ? "person_ride" : input.serviceType},
          ${walletRef}, 'cancel_compensation',
          ${`Pre-pickup cancellation compensation — order ${input.orderCoreId}`},
          ${JSON.stringify({
            settlementId,
            customerShare: result.customerShare,
            companyShare: result.companyShare,
            payerMode: result.payerMode,
          })}::jsonb,
          'system'
        )
        ON CONFLICT DO NOTHING
      `;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      return {
        posted: false,
        alreadySettled: true,
        settlementId,
        totalCompensation: result.totalCompensation,
      };
    }
    throw err;
  }

  return {
    posted: true,
    settlementId,
    totalCompensation: result.totalCompensation,
  };
}
