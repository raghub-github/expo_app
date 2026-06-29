import type { Sql } from "postgres";
import type {
  MerchantCompensationEnginePayload,
  MerchantCompensationExclusionCode,
  MerchantCompensationScenarioCode,
  ResolvedMerchantCompensation,
} from "@/lib/merchant-cancellation-compensation-engine.types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

function isPickedUp(ctx: MerchantCompensationOrderContext): boolean {
  return Boolean(ctx.riderPickedUpAt?.trim());
}

function isOrderReady(ctx: MerchantCompensationOrderContext): boolean {
  return Boolean(ctx.preparedAt?.trim());
}

function isCustomerCancelWithinGrace(
  ctx: MerchantCompensationOrderContext,
  graceSeconds: number
): boolean {
  if (String(ctx.cancelledByType).toLowerCase() !== "customer") return false;
  const created = ctx.orderCreatedAt ? new Date(ctx.orderCreatedAt).getTime() : NaN;
  const cancelled = ctx.cancelledAt ? new Date(ctx.cancelledAt).getTime() : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(cancelled)) return false;
  return cancelled - created <= graceSeconds * 1000;
}

function isMerchantAcceptedCancel(ctx: MerchantCompensationOrderContext): boolean {
  if (ctx.merchantAcceptedCancel) return true;
  const t = String(ctx.cancelledByType).toLowerCase();
  return t === "store" || t === "merchant";
}

/** Previous calendar week (Mon–Sun) in Asia/Kolkata. */
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

export async function computeMerchantOrderReadyAccuracyPct(
  sql: Sql,
  merchantStoreId: number,
  referenceDate = new Date()
): Promise<number | null> {
  const { start, end } = previousWeekIstRange(referenceDate);
  const rows = await sql.unsafe<
    { total_ready: string; accurate_ready: string }[]
  >(
    `
      SELECT
        COUNT(*)::text AS total_ready,
        COUNT(*) FILTER (
          WHERE prepared_at <= prep_ready_by_at
        )::text AS accurate_ready
      FROM orders_food
      WHERE merchant_store_id = $1
        AND prepared_at IS NOT NULL
        AND prep_ready_by_at IS NOT NULL
        AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date
        AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date
    `,
    [merchantStoreId, start, end]
  );
  const total = num(rows[0]?.total_ready);
  if (total <= 0) return null;
  const accurate = num(rows[0]?.accurate_ready);
  return round2((accurate / total) * 100);
}

export function resolveMerchantCompensationFromConfig(
  payload: MerchantCompensationEnginePayload,
  ctx: MerchantCompensationOrderContext,
  orderReadyAccuracyPct: number | null
): ResolvedMerchantCompensation {
  const netOrderValue = round2(Math.max(0, ctx.netOrderValue));
  const settings = payload.settings;
  const scenarioMap = new Map(
    payload.scenarios.map((s) => [s.scenarioCode, s])
  );
  const exclusionMap = new Map(
    payload.exclusions.map((e) => [e.exclusionCode, e])
  );

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
    isCustomerCancelWithinGrace(ctx, settings.customerCancelGraceSeconds)
  ) {
    return {
      ...base,
      exclusionCode: "CUSTOMER_CANCEL_WITHIN_GRACE",
      policyTitle: graceRule.policyTitle,
      policyDescription: graceRule.policyDescription,
    };
  }

  const merchantRule = exclusionMap.get("MERCHANT_ACCEPTED_CANCEL");
  if (merchantRule?.isEnabled && isMerchantAcceptedCancel(ctx)) {
    return {
      ...base,
      exclusionCode: "MERCHANT_ACCEPTED_CANCEL",
      policyTitle: merchantRule.policyTitle,
      policyDescription: merchantRule.policyDescription,
    };
  }

  let scenarioCode: MerchantCompensationScenarioCode;
  if (isPickedUp(ctx)) {
    scenarioCode = "ORDER_PICKED_UP";
  } else if (isOrderReady(ctx)) {
    const threshold = settings.orderReadyAccuracyThreshold;
    const accuracy = orderReadyAccuracyPct ?? 0;
    scenarioCode =
      accuracy >= threshold ? "ORDER_READY_HIGH_ACCURACY" : "ORDER_READY_LOW_ACCURACY";
  } else {
    scenarioCode = "NOT_ORDER_READY";
  }

  const scenario = scenarioMap.get(scenarioCode);
  if (!scenario?.isEnabled) return base;

  const compensationPct = round2(Math.min(100, Math.max(0, scenario.compensationPct)));
  const clawbackPct = round2(100 - compensationPct);
  const merchantKeepsAmount = round2((netOrderValue * compensationPct) / 100);
  const clawbackAmount = round2(netOrderValue - merchantKeepsAmount);

  return {
    engineEnabled: true,
    compensationPct,
    clawbackPct,
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

export async function resolveMerchantCancellationCompensation(
  sql: Sql,
  ctx: MerchantCompensationOrderContext,
  payload: MerchantCompensationEnginePayload
): Promise<ResolvedMerchantCompensation> {
  const accuracy = await computeMerchantOrderReadyAccuracyPct(sql, ctx.merchantStoreId);
  return resolveMerchantCompensationFromConfig(payload, ctx, accuracy);
}

export function compensationToMerchantDebit(
  resolved: ResolvedMerchantCompensation
): { mode: "no_debit" | "partial_debit" | "full_debit"; partialAmount?: number } {
  if (!resolved.engineEnabled) return { mode: "no_debit" };
  if (resolved.exclusionCode || resolved.compensationPct <= 0.009) {
    return resolved.clawbackAmount > 0.009
      ? { mode: "full_debit" }
      : { mode: "no_debit" };
  }
  if (resolved.compensationPct >= 100) return { mode: "no_debit" };
  if (resolved.clawbackAmount <= 0.009) return { mode: "no_debit" };
  return { mode: "partial_debit", partialAmount: resolved.clawbackAmount };
}

export const SCENARIO_LABELS: Record<MerchantCompensationScenarioCode, string> = {
  ORDER_PICKED_UP: "Order picked up",
  ORDER_READY_HIGH_ACCURACY: "Order ready (high accuracy)",
  ORDER_READY_LOW_ACCURACY: "Order ready (low accuracy)",
  NOT_ORDER_READY: "Not order ready",
};

export const EXCLUSION_LABELS: Record<MerchantCompensationExclusionCode, string> = {
  CUSTOMER_CANCEL_WITHIN_GRACE: "Customer grace cancel",
  MERCHANT_ACCEPTED_CANCEL: "Merchant accepted cancel",
};
