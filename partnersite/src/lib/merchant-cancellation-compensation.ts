/**
 * Merchant cancellation compensation resolution (partnersite).
 * Keep in sync with backend/src/lib/merchant-cancellation-compensation.ts
 */
import type { Sql } from "postgres";
import { ensureMerchantCompensationEngineSchema } from "@/lib/ensure-merchant-compensation-engine-schema";

export type MerchantCompensationScenarioCode =
  | "ORDER_PICKED_UP"
  | "ORDER_READY_HIGH_ACCURACY"
  | "ORDER_READY_LOW_ACCURACY"
  | "NOT_ORDER_READY";

export type MerchantCompensationExclusionCode =
  | "CUSTOMER_CANCEL_WITHIN_GRACE"
  | "MERCHANT_ACCEPTED_CANCEL";

export type MerchantCompensationOrderContext = {
  orderCoreId: number;
  merchantStoreId: number;
  cancelledByType: string;
  orderCreatedAt: string | null;
  cancelledAt: string | null;
  preparedAt: string | null;
  riderPickedUpAt: string | null;
  netOrderValue: number;
  merchantAcceptedCancel?: boolean;
};

export type ResolvedMerchantCompensation = {
  engineEnabled: boolean;
  compensationPct: number;
  clawbackPct: number;
  scenarioCode: MerchantCompensationScenarioCode | "NO_COMPENSATION";
  exclusionCode: MerchantCompensationExclusionCode | null;
  netOrderValue: number;
  merchantKeepsAmount: number;
  clawbackAmount: number;
  orderReadyAccuracyPct: number | null;
  policyTitle: string;
  policyDescription: string;
};

type EnginePayload = {
  settings: {
    isEnabled: boolean;
    orderReadyAccuracyThreshold: number;
    customerCancelGraceSeconds: number;
  } | null;
  scenarios: Array<{
    scenarioCode: MerchantCompensationScenarioCode;
    isEnabled: boolean;
    compensationPct: number;
    policyTitle: string;
    policyDescription: string;
  }>;
  exclusions: Array<{
    exclusionCode: MerchantCompensationExclusionCode;
    isEnabled: boolean;
    policyTitle: string;
    policyDescription: string;
  }>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isRelationMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|42P01/i.test(msg);
}

function previousWeekIstRange(reference = new Date()): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(reference);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const ref = new Date(Date.UTC(y, m - 1, d));
  const day = ref.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(ref);
  thisMonday.setUTCDate(ref.getUTCDate() + mondayOffset);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(thisMonday);
  prevSunday.setUTCDate(thisMonday.getUTCDate() - 1);
  const toIso = (dt: Date) =>
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return { start: toIso(prevMonday), end: toIso(prevSunday) };
}

async function loadEnginePayload(sql: Sql): Promise<EnginePayload | null> {
  try {
    const settingsRows = await sql<
      {
        is_enabled: boolean;
        order_ready_accuracy_threshold: string;
        customer_cancel_grace_seconds: number;
      }[]
    >`
      SELECT is_enabled, order_ready_accuracy_threshold::text, customer_cancel_grace_seconds
      FROM gm_merchant_compensation_engine_settings
      WHERE id = 1
      LIMIT 1
    `;
    const scenarios = await sql<
      {
        scenario_code: MerchantCompensationScenarioCode;
        is_enabled: boolean;
        compensation_pct: string;
        policy_title: string;
        policy_description: string;
      }[]
    >`
      SELECT scenario_code, is_enabled, compensation_pct::text, policy_title, policy_description
      FROM gm_merchant_compensation_scenario_config
      ORDER BY sort_order
    `;
    const exclusions = await sql<
      {
        exclusion_code: MerchantCompensationExclusionCode;
        is_enabled: boolean;
        policy_title: string;
        policy_description: string;
      }[]
    >`
      SELECT exclusion_code, is_enabled, policy_title, policy_description
      FROM gm_merchant_compensation_exclusion_rules
    `;
    const s = settingsRows[0];
    return {
      settings: s
        ? {
            isEnabled: s.is_enabled,
            orderReadyAccuracyThreshold: num(s.order_ready_accuracy_threshold),
            customerCancelGraceSeconds: Number(s.customer_cancel_grace_seconds) || 60,
          }
        : null,
      scenarios: scenarios.map((row) => ({
        scenarioCode: row.scenario_code,
        isEnabled: row.is_enabled,
        compensationPct: num(row.compensation_pct),
        policyTitle: row.policy_title,
        policyDescription: row.policy_description,
      })),
      exclusions: exclusions.map((row) => ({
        exclusionCode: row.exclusion_code,
        isEnabled: row.is_enabled,
        policyTitle: row.policy_title,
        policyDescription: row.policy_description,
      })),
    };
  } catch (e) {
    if (isRelationMissingError(e)) return null;
    throw e;
  }
}

async function computeMerchantOrderReadyAccuracyPct(
  sql: Sql,
  merchantStoreId: number,
  referenceDate = new Date()
): Promise<number | null> {
  const { start, end } = previousWeekIstRange(referenceDate);
  const rows = await sql<{ total_ready: string; accurate_ready: string }[]>`
    SELECT
      COUNT(*)::text AS total_ready,
      COUNT(*) FILTER (
        WHERE prepared_at <= prep_ready_by_at
      )::text AS accurate_ready
    FROM orders_food
    WHERE merchant_store_id = ${merchantStoreId}
      AND prepared_at IS NOT NULL
      AND prep_ready_by_at IS NOT NULL
      AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
      AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
  `;
  const total = num(rows[0]?.total_ready);
  if (total <= 0) return null;
  return round2((num(rows[0]?.accurate_ready) / total) * 100);
}

function resolveFromConfig(
  payload: EnginePayload,
  ctx: MerchantCompensationOrderContext,
  orderReadyAccuracyPct: number | null
): ResolvedMerchantCompensation {
  const netOrderValue = round2(Math.max(0, ctx.netOrderValue));
  const settings = payload.settings;
  const scenarioMap = new Map(payload.scenarios.map((s) => [s.scenarioCode, s]));
  const exclusionMap = new Map(payload.exclusions.map((e) => [e.exclusionCode, e]));

  const base: ResolvedMerchantCompensation = {
    engineEnabled: Boolean(settings?.isEnabled),
    compensationPct: 0,
    clawbackPct: 100,
    scenarioCode: "NO_COMPENSATION",
    exclusionCode: null,
    netOrderValue,
    merchantKeepsAmount: 0,
    clawbackAmount: netOrderValue,
    orderReadyAccuracyPct,
    policyTitle: "No compensation",
    policyDescription: "No compensation applies for this cancellation.",
  };

  if (!settings?.isEnabled) return base;

  const graceRule = exclusionMap.get("CUSTOMER_CANCEL_WITHIN_GRACE");
  if (
    graceRule?.isEnabled &&
    String(ctx.cancelledByType).toLowerCase() === "customer" &&
    ctx.orderCreatedAt &&
    ctx.cancelledAt
  ) {
    const created = new Date(ctx.orderCreatedAt).getTime();
    const cancelled = new Date(ctx.cancelledAt).getTime();
    if (
      Number.isFinite(created) &&
      Number.isFinite(cancelled) &&
      cancelled - created <= settings.customerCancelGraceSeconds * 1000
    ) {
      return {
        ...base,
        exclusionCode: "CUSTOMER_CANCEL_WITHIN_GRACE",
        policyTitle: graceRule.policyTitle,
        policyDescription: graceRule.policyDescription,
      };
    }
  }

  const merchantRule = exclusionMap.get("MERCHANT_ACCEPTED_CANCEL");
  const merchantType = String(ctx.cancelledByType).toLowerCase();
  if (
    merchantRule?.isEnabled &&
    (ctx.merchantAcceptedCancel || merchantType === "store" || merchantType === "merchant")
  ) {
    return {
      ...base,
      exclusionCode: "MERCHANT_ACCEPTED_CANCEL",
      policyTitle: merchantRule.policyTitle,
      policyDescription: merchantRule.policyDescription,
    };
  }

  let scenarioCode: MerchantCompensationScenarioCode;
  if (ctx.riderPickedUpAt?.trim()) {
    scenarioCode = "ORDER_PICKED_UP";
  } else if (ctx.preparedAt?.trim()) {
    const accuracy = orderReadyAccuracyPct ?? 0;
    scenarioCode =
      accuracy >= settings.orderReadyAccuracyThreshold
        ? "ORDER_READY_HIGH_ACCURACY"
        : "ORDER_READY_LOW_ACCURACY";
  } else {
    scenarioCode = "NOT_ORDER_READY";
  }

  const scenario = scenarioMap.get(scenarioCode);
  if (!scenario?.isEnabled) return base;

  const compensationPct = round2(Math.min(100, Math.max(0, scenario.compensationPct)));
  const merchantKeepsAmount = round2((netOrderValue * compensationPct) / 100);
  const clawbackAmount = round2(netOrderValue - merchantKeepsAmount);

  return {
    engineEnabled: true,
    compensationPct,
    clawbackPct: round2(100 - compensationPct),
    scenarioCode,
    exclusionCode: null,
    netOrderValue,
    merchantKeepsAmount,
    clawbackAmount,
    orderReadyAccuracyPct,
    policyTitle: scenario.policyTitle,
    policyDescription: scenario.policyDescription,
  };
}

export function compensationToMerchantDebit(resolved: ResolvedMerchantCompensation): {
  mode: "no_debit" | "partial_debit" | "full_debit";
  partialAmount?: number;
} {
  if (!resolved.engineEnabled || resolved.compensationPct >= 100) return { mode: "no_debit" };
  if (resolved.clawbackAmount <= 0.009) return { mode: "no_debit" };
  if (resolved.compensationPct <= 0.009) return { mode: "full_debit" };
  return { mode: "partial_debit", partialAmount: resolved.clawbackAmount };
}

export async function resolveAutoMerchantCancellationDebit(
  sql: Sql,
  orderCoreId: number,
  explicitMerchantDebit?: string | null
): Promise<{
  merchantDebit: string | null;
  partialAmount?: number | null;
  resolved: ResolvedMerchantCompensation | null;
}> {
  if (explicitMerchantDebit?.trim()) {
    return { merchantDebit: explicitMerchantDebit.trim(), resolved: null };
  }

  const ready = await ensureMerchantCompensationEngineSchema(sql);
  if (!ready) {
    return { merchantDebit: null, resolved: null };
  }

  const payload = await loadEnginePayload(sql);
  if (!payload?.settings?.isEnabled) {
    return { merchantDebit: null, resolved: null };
  }

  const rows = await sql<
    {
      merchant_store_id: number | null;
      food_store_id: number | null;
      cancelled_by_type: string | null;
      created_at: string | null;
      cancelled_at: string | null;
      prepared_at: string | null;
      rider_picked_up_at: string | null;
      total_ctm: string | null;
      food_items_total_value: string | null;
    }[]
  >`
    SELECT
      c.merchant_store_id,
      f.merchant_store_id AS food_store_id,
      COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
      c.created_at::text,
      COALESCE(f.updated_at, c.updated_at)::text AS cancelled_at,
      f.prepared_at::text,
      f.rider_picked_up_at::text,
      c.total_ctm::text,
      f.food_items_total_value::text
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  const merchantStoreId = Number(row?.food_store_id ?? row?.merchant_store_id);
  if (!Number.isFinite(merchantStoreId) || merchantStoreId <= 0) {
    return { merchantDebit: null, resolved: null };
  }

  const totalCtm = num(row?.total_ctm);
  const foodItemsTotal = num(row?.food_items_total_value);
  const netOrderValue =
    totalCtm > 0 ? totalCtm : foodItemsTotal > 0 ? foodItemsTotal : 0;

  const ctx: MerchantCompensationOrderContext = {
    orderCoreId,
    merchantStoreId,
    cancelledByType: String(row?.cancelled_by_type ?? ""),
    orderCreatedAt: row?.created_at ?? null,
    cancelledAt: row?.cancelled_at ?? null,
    preparedAt: row?.prepared_at ?? null,
    riderPickedUpAt: row?.rider_picked_up_at ?? null,
    netOrderValue: Math.max(0, netOrderValue),
  };

  const accuracy = await computeMerchantOrderReadyAccuracyPct(sql, merchantStoreId);
  const resolved = resolveFromConfig(payload, ctx, accuracy);
  const debit = compensationToMerchantDebit(resolved);

  return {
    merchantDebit: debit.mode,
    partialAmount: debit.partialAmount ?? null,
    resolved,
  };
}
