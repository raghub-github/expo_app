/**
 * Merchant cancellation compensation — display formatting for merchant app & partnersite.
 * Keep in sync with backend/src/lib/merchant-cancellation-compensation-display.ts
 */
import type postgres from "postgres";
import { planMerchantCancellationLedger } from "@/lib/merchant-cancellation-compensation-service";
import type { ResolvedMerchantCompensation } from "@/lib/merchant-cancellation-compensation";

export type MerchantCancellationCompensationDisplay = {
  engine_enabled: boolean;
  admin_override?: boolean;
  compensation_pct: number;
  merchant_keeps_amount: number;
  net_order_value: number;
  cancelled_by_brand: string;
  reason_detail: string;
  eligible_message: string;
  show_policy_link: boolean;
  policy_modal_title: string;
  scenario_code: string;
  exclusion_code: string | null;
  applied_policy_title: string;
  applied_policy_description: string;
};

export type MerchantCompensationPolicyDisplay = {
  policy_modal_title: string;
  order_ready_accuracy_threshold: number;
  customer_cancel_grace_seconds: number;
  scenarios: Array<{
    scenario_code: string;
    compensation_pct: number;
    policy_title: string;
    policy_description: string;
    is_enabled: boolean;
  }>;
  exclusions: Array<{
    exclusion_code: string;
    policy_title: string;
    policy_description: string;
    is_enabled: boolean;
  }>;
};

const GATIMITRA_BRAND = "GatiMitra";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPct(pct: number): string {
  const n = round2(pct);
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

export function resolveCancelledByBrand(
  cancelledByType: string | null | undefined,
  cancelledByLabel: string | null | undefined
): string {
  const t = String(cancelledByType ?? "").trim().toLowerCase();
  const label = String(cancelledByLabel ?? "").trim();
  const lower = label.toLowerCase();

  if (t === "store" || t === "merchant" || lower.includes("restaurant")) {
    return "Restaurant";
  }
  if (t === "customer" && lower.includes("customer")) {
    return "Customer";
  }
  if (t === "rider" || lower.includes("rider") || lower.includes("delivery")) {
    return "Delivery partner";
  }
  if (t === "system" || /^auto cancel/i.test(lower)) {
    return "__AUTO__";
  }
  if (lower.includes("gatimitra")) {
    return GATIMITRA_BRAND;
  }
  return GATIMITRA_BRAND;
}

export function buildEligibleCompensationMessage(args: {
  cancelledByBrand: string;
  reasonDetail: string;
  compensationPct: number;
}): string {
  const reason = args.reasonDetail.trim() || "Order cancelled";
  const brand = args.cancelledByBrand.trim() || GATIMITRA_BRAND;

  if (brand === "__AUTO__" || /^auto cancel/i.test(reason)) {
    const prefix = "Auto Cancelled by System";
    if (args.compensationPct <= 0.009) {
      return `${prefix}. As per policy, you will not receive compensation for this cancellation.`;
    }
    if (args.compensationPct >= 99.99) {
      return `${prefix}. As per policy, you will receive ${formatPct(args.compensationPct)}% of net order value as compensation.`;
    }
    return `${prefix}. As per policy, you will get ${formatPct(args.compensationPct)}% of net order value as compensation.`;
  }

  const prefix = `Cancelled by ${brand}: ${reason}`;

  if (args.compensationPct <= 0.009) {
    return `${prefix}. As per policy, you will not receive compensation for this cancellation.`;
  }
  if (args.compensationPct >= 99.99) {
    return `${prefix}. As per policy, you will receive ${formatPct(args.compensationPct)}% of net order value as compensation.`;
  }
  return `${prefix}. As per policy, you will get ${formatPct(args.compensationPct)}% of net order value as compensation.`;
}

/** Wallet ledger row text when cancellation does not credit/debit the balance. */
export function buildCancellationInfoLedgerDescription(args: {
  formattedOrderId: string;
  balanceImpact: "none" | "debit";
  compensationMeta?: Record<string, unknown> | null;
}): string {
  const orderId = args.formattedOrderId.trim() || "Order";

  if (args.balanceImpact === "debit") {
    const mode = String(args.compensationMeta?.merchant_debit_mode ?? "").trim().toLowerCase();
    if (mode === "partial_debit") {
      return `Order ${orderId} cancelled — partial cancellation charges deducted from wallet`;
    }
    return `Order ${orderId} cancelled — cancellation charges deducted from wallet`;
  }

  const meta = args.compensationMeta ?? {};
  const eligible = String(meta.eligible_message ?? "").trim();
  if (eligible) {
    return `Order ${orderId} — ${eligible}`;
  }

  const policyTitle = String(meta.applied_policy_title ?? "").trim();
  const policyDesc = String(meta.applied_policy_description ?? "").trim();
  const pct = Number(meta.compensation_pct ?? 0);
  const reason = String(meta.reason_detail ?? meta.rejected_reason ?? "").trim();
  const brand = String(meta.cancelled_by_brand ?? GATIMITRA_BRAND).trim() || GATIMITRA_BRAND;
  const reasonPart = reason
    ? `Cancelled by ${brand}: ${reason}`
    : `Cancelled by ${brand}`;

  if (Number.isFinite(pct) && pct <= 0.009) {
    const why = policyTitle
      ? `No compensation — ${policyTitle}${policyDesc ? `. ${policyDesc}` : ""}`
      : "No compensation as per cancellation policy";
    return `Order ${orderId} · ${reasonPart}. ${why}`;
  }

  if (policyTitle && Number.isFinite(pct)) {
    return `Order ${orderId} · ${reasonPart}. ${policyTitle} (${formatPct(pct)}% of net order value credited).`;
  }

  if (policyTitle) {
    return `Order ${orderId} · ${reasonPart}. ${policyTitle}.`;
  }

  return `Order ${orderId} · ${reasonPart}. No compensation as per cancellation policy.`;
}

export function buildCompensationDisplayFromResolved(args: {
  resolved: ResolvedMerchantCompensation;
  cancelledByType: string | null;
  cancelledByLabel: string | null;
  rejectedReason: string | null;
  policyModalTitle: string;
}): MerchantCancellationCompensationDisplay {
  const brand = resolveCancelledByBrand(args.cancelledByType, args.cancelledByLabel);
  const reasonDetail = (args.rejectedReason ?? "").trim() || "Order cancelled";

  const eligibleMessage = buildEligibleCompensationMessage({
    cancelledByBrand: brand,
    reasonDetail,
    compensationPct: args.resolved.compensationPct,
  });

  return {
    engine_enabled: args.resolved.engineEnabled,
    compensation_pct: args.resolved.compensationPct,
    merchant_keeps_amount: args.resolved.merchantKeepsAmount,
    net_order_value: args.resolved.netOrderValue,
    cancelled_by_brand: brand,
    reason_detail: reasonDetail,
    eligible_message: eligibleMessage,
    show_policy_link: args.resolved.engineEnabled,
    policy_modal_title: args.policyModalTitle || "Compensation Policy",
    scenario_code: args.resolved.scenarioCode,
    exclusion_code: args.resolved.exclusionCode,
    applied_policy_title: args.resolved.policyTitle.trim() || "No compensation",
    applied_policy_description: args.resolved.policyDescription.trim() || "",
  };
}

export async function loadMerchantCompensationPolicyDisplay(
  sql: postgres.Sql
): Promise<MerchantCompensationPolicyDisplay | null> {
  try {
    const settingsRows = await sql<
      {
        policy_modal_title: string;
        order_ready_accuracy_threshold: string;
        customer_cancel_grace_seconds: number;
        is_enabled: boolean;
      }[]
    >`
      SELECT policy_modal_title, order_ready_accuracy_threshold::text, customer_cancel_grace_seconds, is_enabled
      FROM gm_merchant_compensation_engine_settings
      WHERE id = 1
      LIMIT 1
    `;
    const settings = settingsRows[0];
    if (!settings?.is_enabled) return null;

    const scenarios = await sql<
      {
        scenario_code: string;
        compensation_pct: string;
        policy_title: string;
        policy_description: string;
        is_enabled: boolean;
      }[]
    >`
      SELECT scenario_code, compensation_pct::text, policy_title, policy_description, is_enabled
      FROM gm_merchant_compensation_scenario_config
      WHERE is_enabled = TRUE
      ORDER BY sort_order, scenario_code
    `;

    const exclusions = await sql<
      {
        exclusion_code: string;
        policy_title: string;
        policy_description: string;
        is_enabled: boolean;
      }[]
    >`
      SELECT exclusion_code, policy_title, policy_description, is_enabled
      FROM gm_merchant_compensation_exclusion_rules
      WHERE is_enabled = TRUE
      ORDER BY exclusion_code
    `;

    return {
      policy_modal_title: settings.policy_modal_title || "Compensation Policy",
      order_ready_accuracy_threshold: Number(settings.order_ready_accuracy_threshold) || 80,
      customer_cancel_grace_seconds: Number(settings.customer_cancel_grace_seconds) || 60,
      scenarios: scenarios.map((s) => ({
        scenario_code: s.scenario_code,
        compensation_pct: Number(s.compensation_pct) || 0,
        policy_title: s.policy_title,
        policy_description: s.policy_description,
        is_enabled: s.is_enabled,
      })),
      exclusions: exclusions.map((e) => ({
        exclusion_code: e.exclusion_code,
        policy_title: e.policy_title,
        policy_description: e.policy_description,
        is_enabled: e.is_enabled,
      })),
    };
  } catch {
    return null;
  }
}

export async function resolveOrderCancellationCompensationDisplay(
  sql: postgres.Sql,
  args: {
    orderCoreId: number;
    merchantStoreId: number;
    cancelledByType: string | null;
    cancelledByLabel: string | null;
    rejectedReason: string | null;
    orderCreatedAt: string | null;
    cancelledAt: string | null;
    preparedAt: string | null;
    riderPickedUpAt: string | null;
    netOrderValue: number;
  }
): Promise<MerchantCancellationCompensationDisplay | null> {
  try {
    const overrideDisplay = await loadAdminOverrideCompensationDisplay(sql, args.orderCoreId, {
      cancelledByType: args.cancelledByType,
      cancelledByLabel: args.cancelledByLabel,
      rejectedReason: args.rejectedReason,
      netOrderValue: args.netOrderValue,
    });
    if (overrideDisplay) return overrideDisplay;

    const plan = await planMerchantCancellationLedger(sql, args.orderCoreId, null, {
      cancelledByType: args.cancelledByType,
      cancelledByLabel: args.cancelledByLabel,
      rejectedReason: args.rejectedReason,
    });
    return plan.display;
  } catch {
    return null;
  }
}

async function loadAdminOverrideCompensationDisplay(
  sql: postgres.Sql,
  orderCoreId: number,
  args: {
    cancelledByType: string | null;
    cancelledByLabel: string | null;
    rejectedReason: string | null;
    netOrderValue: number;
  },
): Promise<MerchantCancellationCompensationDisplay | null> {
  try {
    const rows = await sql<
      { metadata: Record<string, unknown> | null; amount: string | number; direction: string }[]
    >`
      SELECT metadata, amount, direction
      FROM merchant_wallet_ledger
      WHERE (metadata->>'orders_core_id')::bigint = ${orderCoreId}
        AND COALESCE(metadata->>'entry_type', '') = 'order_cancellation'
        AND (metadata->>'admin_override')::boolean IS TRUE
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const row = rows.find((r) => r.metadata?.admin_override === true) ?? rows[0];
    if (!row?.metadata || row.metadata.admin_override !== true) return null;

    const meta = row.metadata;
    const pct = round2(Number(meta.compensation_pct ?? 0));
    const keepsRaw = Number(meta.merchant_keeps_amount ?? 0);
    const keeps =
      keepsRaw > 0
        ? round2(keepsRaw)
        : row.direction === "CREDIT"
          ? round2(Number(row.amount ?? 0))
          : 0;
    const brand = resolveCancelledByBrand(args.cancelledByType, args.cancelledByLabel);
    const reasonDetail = (args.rejectedReason ?? "").trim() || "Order cancelled";

    return {
      engine_enabled: false,
      admin_override: true,
      compensation_pct: pct,
      merchant_keeps_amount: keeps,
      net_order_value: round2(Number(meta.net_order_value ?? args.netOrderValue)),
      cancelled_by_brand: brand,
      reason_detail: reasonDetail,
      eligible_message: "",
      show_policy_link: false,
      policy_modal_title: "",
      scenario_code: "ADMIN_OVERRIDE",
      exclusion_code: null,
      applied_policy_title: "Admin adjustment",
      applied_policy_description: String(meta.reason ?? "").trim(),
    };
  } catch {
    return null;
  }
}
