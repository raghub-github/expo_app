/**
 * Central merchant cancellation compensation service (backend).
 * Ensures schema, resolves policy, applies ledger debits with full metadata.
 */
import type { Sql } from "postgres";
import { ensureMerchantCompensationEngineSchema } from "./ensure-merchant-compensation-engine-schema.js";
import {
  resolveAutoMerchantCancellationDebit,
  type ResolvedMerchantCompensation,
} from "./merchant-cancellation-compensation.js";
import {
  buildCompensationDisplayFromResolved,
  type MerchantCancellationCompensationDisplay,
} from "./merchant-cancellation-compensation-display.js";

export type MerchantCancellationLedgerPlan = {
  merchantDebit: string | null;
  partialAmount: number | null;
  resolved: ResolvedMerchantCompensation | null;
  display: MerchantCancellationCompensationDisplay | null;
  engineUsed: boolean;
  adminOverride?: boolean;
};

export async function planMerchantCancellationLedger(
  sql: Sql,
  orderCoreId: number,
  explicitMerchantDebit?: string | null,
  displayContext?: {
    cancelledByType: string | null;
    cancelledByLabel: string | null;
    rejectedReason: string | null;
  }
): Promise<MerchantCancellationLedgerPlan> {
  if (explicitMerchantDebit?.trim()) {
    return {
      merchantDebit: explicitMerchantDebit.trim(),
      partialAmount: null,
      resolved: null,
      display: null,
      engineUsed: false,
      adminOverride: true,
    };
  }

  try {
    await ensureMerchantCompensationEngineSchema();
    const auto = await resolveAutoMerchantCancellationDebit(sql, orderCoreId, null);
    if (!auto.resolved) {
      return {
        merchantDebit: auto.merchantDebit,
        partialAmount: auto.partialAmount ?? null,
        resolved: null,
        display: null,
        engineUsed: false,
      };
    }

    let policyTitle = "Compensation Policy";
    try {
      const rows = await sql<{ policy_modal_title: string }[]>`
        SELECT policy_modal_title
        FROM gm_merchant_compensation_engine_settings
        WHERE id = 1
        LIMIT 1
      `;
      policyTitle = rows[0]?.policy_modal_title || policyTitle;
    } catch {
      /* optional */
    }

    const display = buildCompensationDisplayFromResolved({
      resolved: auto.resolved,
      cancelledByType: displayContext?.cancelledByType ?? null,
      cancelledByLabel: displayContext?.cancelledByLabel ?? null,
      rejectedReason: displayContext?.rejectedReason ?? null,
      policyModalTitle: policyTitle,
    });

    return {
      merchantDebit: auto.merchantDebit,
      partialAmount: auto.partialAmount ?? null,
      resolved: auto.resolved,
      display,
      engineUsed: true,
    };
  } catch (e) {
    console.warn("[planMerchantCancellationLedger]", e);
    return {
      merchantDebit: null,
      partialAmount: null,
      resolved: null,
      display: null,
      engineUsed: false,
    };
  }
}

export function compensationMetadataForLedger(
  resolved: ResolvedMerchantCompensation | null,
  display: MerchantCancellationCompensationDisplay | null
): Record<string, unknown> {
  if (!resolved?.engineEnabled) return {};
  return {
    compensation_engine: "gm_merchant_v1",
    compensation_pct: resolved.compensationPct,
    clawback_pct: resolved.clawbackPct,
    compensation_scenario: resolved.scenarioCode,
    compensation_exclusion: resolved.exclusionCode,
    merchant_keeps_amount: resolved.merchantKeepsAmount,
    clawback_amount: resolved.clawbackAmount,
    net_order_value: resolved.netOrderValue,
    total_ctm: resolved.netOrderValue,
    food_items_total_value: resolved.netOrderValue,
    order_ready_accuracy_pct: resolved.orderReadyAccuracyPct,
    eligible_message: display?.eligible_message ?? null,
    cancelled_by_brand: display?.cancelled_by_brand ?? null,
    reason_detail: display?.reason_detail ?? null,
    applied_policy_title: display?.applied_policy_title ?? resolved.policyTitle,
    applied_policy_description: display?.applied_policy_description ?? resolved.policyDescription,
  };
}
