export type GmRuleFormState = {
  rule_code: string;
  rule_name: string;
  description: string;
  scenario_type: string;
  priority: number;
  active_status: string;
  change_reason: string;
  conditions: {
    service_type: string;
    order_stage: string;
    triggered_by: string | null;
    cancellation_reason_id: number | null;
  };
  fault: {
    fault_bucket: string;
    customer_pct: number;
    merchant_pct: number;
    rider_pct: number;
    platform_pct: number;
    gatimitra_pct: number;
  };
  liability: {
    platform_bears_loss: boolean;
    liability_pct: number;
    customer_liability_pct: number;
    merchant_liability_pct: number;
    rider_liability_pct: number;
    gatimitra_liability_pct: number;
    platform_compensation_flat: number | null;
    platform_absorbed_loss_pct: number;
    platform_settlement_impact_pct: number;
  };
  refund: {
    refund_allowed: boolean;
    refund_pct: number | null;
    refund_flat_amount: number | null;
    refund_recipient: string;
    auto_refund: boolean;
    refund_approval_required: boolean;
    item_level_refund: boolean;
    order_level_refund: boolean;
  };
  merchant: {
    merchant_receives_pct: number | null;
    merchant_penalty_pct: number | null;
    merchant_compensation_pct: number | null;
    merchant_flat_penalty: number | null;
    merchant_compensation_flat: number | null;
    settlement_hold: boolean;
    settlement_hold_hours: number;
    merchant_wallet_debit: boolean;
    merchant_wallet_credit: boolean;
  };
  rider: {
    rider_receives_pct: number | null;
    rider_penalty_pct: number | null;
    rider_compensation_pct: number | null;
    rider_flat_penalty: number | null;
    rider_compensation_flat: number | null;
    settlement_hold: boolean;
    settlement_hold_hours: number;
    rider_wallet_debit: boolean;
    rider_wallet_credit: boolean;
  };
  customer_penalty: {
    customer_penalty_pct: number | null;
    customer_flat_penalty: number | null;
    customer_compensation_pct: number | null;
    customer_compensation_flat: number | null;
    customer_wallet_debit: boolean;
    customer_wallet_credit: boolean;
  };
  funding: {
    refund_funding_source: string;
    refund_fund_merchant_pct: number;
    refund_fund_rider_pct: number;
    refund_fund_platform_pct: number;
    refund_fund_customer_pct: number;
    merchant_penalty_recovery_source: string;
    rider_penalty_recovery_source: string;
    customer_penalty_recovery_source: string;
    platform_wallet_debit: boolean;
    platform_wallet_credit: boolean;
  };
  auto_actions: {
    auto_notification: boolean;
    auto_ticket_creation: boolean;
    auto_wallet_adjustment: boolean;
    auto_fraud_review: boolean;
    auto_settlement_recalc: boolean;
  };
  limits: {
    max_refund_amount: number | null;
    min_refund_amount: number | null;
    max_penalty_amount: number | null;
    max_compensation_amount: number | null;
  };
};

export const defaultGmRuleForm = (): GmRuleFormState => ({
  rule_code: "",
  rule_name: "",
  description: "",
  scenario_type: "CANCELLATION",
  priority: 100,
  active_status: "DRAFT",
  change_reason: "",
  conditions: {
    service_type: "FOOD",
    order_stage: "PRE_PICKUP_CANCELLED",
    triggered_by: "MERCHANT",
    cancellation_reason_id: null,
  },
  fault: {
    fault_bucket: "MERCHANT_FAULT",
    customer_pct: 0,
    merchant_pct: 100,
    rider_pct: 0,
    platform_pct: 0,
    gatimitra_pct: 0,
  },
  liability: {
    platform_bears_loss: false,
    liability_pct: 0,
    customer_liability_pct: 0,
    merchant_liability_pct: 100,
    rider_liability_pct: 0,
    gatimitra_liability_pct: 0,
    platform_compensation_flat: null,
    platform_absorbed_loss_pct: 0,
    platform_settlement_impact_pct: 0,
  },
  refund: {
    refund_allowed: true,
    refund_pct: 100,
    refund_flat_amount: null,
    refund_recipient: "ORIGINAL_SOURCE",
    auto_refund: false,
    refund_approval_required: false,
    item_level_refund: false,
    order_level_refund: true,
  },
  merchant: {
    merchant_receives_pct: 0,
    merchant_penalty_pct: 10,
    merchant_compensation_pct: 0,
    merchant_flat_penalty: 0,
    merchant_compensation_flat: 0,
    settlement_hold: false,
    settlement_hold_hours: 0,
    merchant_wallet_debit: true,
    merchant_wallet_credit: false,
  },
  rider: {
    rider_receives_pct: 0,
    rider_penalty_pct: 0,
    rider_compensation_pct: 0,
    rider_flat_penalty: 0,
    rider_compensation_flat: 0,
    settlement_hold: false,
    settlement_hold_hours: 0,
    rider_wallet_debit: false,
    rider_wallet_credit: false,
  },
  customer_penalty: {
    customer_penalty_pct: 0,
    customer_flat_penalty: 0,
    customer_compensation_pct: 0,
    customer_compensation_flat: 0,
    customer_wallet_debit: false,
    customer_wallet_credit: false,
  },
  funding: {
    refund_funding_source: "MERCHANT_WALLET",
    refund_fund_merchant_pct: 100,
    refund_fund_rider_pct: 0,
    refund_fund_platform_pct: 0,
    refund_fund_customer_pct: 0,
    merchant_penalty_recovery_source: "MERCHANT_WALLET",
    rider_penalty_recovery_source: "RIDER_WALLET",
    customer_penalty_recovery_source: "CUSTOMER_WALLET",
    platform_wallet_debit: false,
    platform_wallet_credit: false,
  },
  auto_actions: {
    auto_notification: true,
    auto_ticket_creation: false,
    auto_wallet_adjustment: true,
    auto_fraud_review: false,
    auto_settlement_recalc: true,
  },
  limits: {
    max_refund_amount: null,
    min_refund_amount: null,
    max_penalty_amount: null,
    max_compensation_amount: null,
  },
});

function numOrNull(v: unknown): number | null {
  return v != null && v !== "" ? Number(v) : null;
}

function numOrZero(v: unknown): number {
  return v != null && v !== "" ? Number(v) : 0;
}

function strOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function snapshotToForm(row: Record<string, unknown>): GmRuleFormState {
  const snapRoot = (row.snapshot ?? row) as Record<string, unknown>;
  const master = (snapRoot.master ?? snapRoot) as Record<string, unknown>;
  const snap = snapRoot;
  const cond = (snap.conditions ?? {}) as Record<string, unknown>;
  const fault = (snap.fault ?? {}) as Record<string, unknown>;
  const liability = (snap.liability ?? {}) as Record<string, unknown>;
  const refund = (snap.refund ?? {}) as Record<string, unknown>;
  const merchant = (snap.merchant ?? {}) as Record<string, unknown>;
  const rider = (snap.rider ?? {}) as Record<string, unknown>;
  const penalty = (snap.customer_penalty ?? {}) as Record<string, unknown>;
  const funding = (snap.funding ?? {}) as Record<string, unknown>;
  const auto = (snap.auto_actions ?? {}) as Record<string, unknown>;
  const limits = (snap.limits ?? {}) as Record<string, unknown>;

  return {
    rule_code: String(row.rule_code ?? master.rule_code ?? ""),
    rule_name: String(row.rule_name ?? master.rule_name ?? ""),
    description: String(row.description ?? master.description ?? ""),
    scenario_type: String(row.scenario_type ?? master.scenario_type ?? "CANCELLATION"),
    priority: Number(row.priority ?? master.priority ?? 100),
    active_status: String(row.active_status ?? master.active_status ?? "DRAFT"),
    change_reason: "",
    conditions: {
      service_type: strOrNull(cond.service_type ?? row.service_type) ?? "FOOD",
      order_stage: strOrNull(cond.order_stage ?? row.order_stage) ?? "PRE_PICKUP_CANCELLED",
      triggered_by: strOrNull(cond.triggered_by ?? row.triggered_by),
      cancellation_reason_id:
        cond.cancellation_reason_id != null ? Number(cond.cancellation_reason_id) : null,
    },
    fault: {
      fault_bucket: String(fault.fault_bucket ?? "NO_FAULT"),
      customer_pct: Number(fault.customer_pct ?? 0),
      merchant_pct: Number(fault.merchant_pct ?? 0),
      rider_pct: Number(fault.rider_pct ?? 0),
      platform_pct: Number(fault.platform_pct ?? 0),
      gatimitra_pct: Number(fault.gatimitra_pct ?? 0),
    },
    liability: {
      platform_bears_loss: Boolean(liability.platform_bears_loss ?? false),
      liability_pct: Number(liability.liability_pct ?? 0),
      customer_liability_pct: Number(liability.customer_liability_pct ?? 0),
      merchant_liability_pct: Number(liability.merchant_liability_pct ?? 0),
      rider_liability_pct: Number(liability.rider_liability_pct ?? 0),
      gatimitra_liability_pct: Number(liability.gatimitra_liability_pct ?? 100),
      platform_compensation_flat: numOrZero(liability.platform_compensation_flat),
      platform_absorbed_loss_pct: Number(liability.platform_absorbed_loss_pct ?? 0),
      platform_settlement_impact_pct: Number(liability.platform_settlement_impact_pct ?? 0),
    },
    refund: {
      refund_allowed: Boolean(refund.refund_allowed ?? true),
      refund_pct: numOrNull(refund.refund_pct),
      refund_flat_amount: numOrNull(refund.refund_flat_amount),
      refund_recipient: String(refund.refund_recipient ?? "ORIGINAL_SOURCE"),
      auto_refund: Boolean(refund.auto_refund ?? false),
      refund_approval_required: Boolean(refund.refund_approval_required ?? false),
      item_level_refund: Boolean(refund.item_level_refund ?? false),
      order_level_refund: Boolean(refund.order_level_refund ?? true),
    },
    merchant: {
      merchant_receives_pct: numOrZero(merchant.merchant_receives_pct),
      merchant_penalty_pct: numOrZero(merchant.merchant_penalty_pct),
      merchant_compensation_pct: numOrZero(merchant.merchant_compensation_pct),
      merchant_flat_penalty: numOrZero(merchant.merchant_flat_penalty),
      merchant_compensation_flat: numOrZero(merchant.merchant_compensation_flat),
      settlement_hold: Boolean(merchant.settlement_hold ?? false),
      settlement_hold_hours: Number(merchant.settlement_hold_hours ?? 0),
      merchant_wallet_debit: Boolean(merchant.merchant_wallet_debit ?? false),
      merchant_wallet_credit: Boolean(merchant.merchant_wallet_credit ?? true),
    },
    rider: {
      rider_receives_pct: numOrZero(rider.rider_receives_pct),
      rider_penalty_pct: numOrZero(rider.rider_penalty_pct),
      rider_compensation_pct: numOrZero(rider.rider_compensation_pct),
      rider_flat_penalty: numOrZero(rider.rider_flat_penalty),
      rider_compensation_flat: numOrZero(rider.rider_compensation_flat),
      settlement_hold: Boolean(rider.settlement_hold ?? false),
      settlement_hold_hours: Number(rider.settlement_hold_hours ?? 0),
      rider_wallet_debit: Boolean(rider.rider_wallet_debit ?? false),
      rider_wallet_credit: Boolean(rider.rider_wallet_credit ?? false),
    },
    customer_penalty: {
      customer_penalty_pct: numOrZero(penalty.customer_penalty_pct),
      customer_flat_penalty: numOrZero(penalty.customer_flat_penalty),
      customer_compensation_pct: numOrZero(penalty.customer_compensation_pct),
      customer_compensation_flat: numOrZero(penalty.customer_compensation_flat),
      customer_wallet_debit: Boolean(penalty.customer_wallet_debit ?? false),
      customer_wallet_credit: Boolean(penalty.customer_wallet_credit ?? false),
    },
    funding: {
      refund_funding_source: String(funding.refund_funding_source ?? "SHARED_LIABILITY_POOL"),
      refund_fund_merchant_pct: Number(funding.refund_fund_merchant_pct ?? 0),
      refund_fund_rider_pct: Number(funding.refund_fund_rider_pct ?? 0),
      refund_fund_platform_pct: Number(funding.refund_fund_platform_pct ?? 100),
      refund_fund_customer_pct: Number(funding.refund_fund_customer_pct ?? 0),
      merchant_penalty_recovery_source: String(
        funding.merchant_penalty_recovery_source ?? "MERCHANT_WALLET"
      ),
      rider_penalty_recovery_source: String(funding.rider_penalty_recovery_source ?? "RIDER_WALLET"),
      customer_penalty_recovery_source: String(
        funding.customer_penalty_recovery_source ?? "CUSTOMER_WALLET"
      ),
      platform_wallet_debit: Boolean(funding.platform_wallet_debit ?? false),
      platform_wallet_credit: Boolean(funding.platform_wallet_credit ?? false),
    },
    auto_actions: {
      auto_notification: Boolean(auto.auto_notification ?? true),
      auto_ticket_creation: Boolean(auto.auto_ticket_creation ?? false),
      auto_wallet_adjustment: Boolean(auto.auto_wallet_adjustment ?? true),
      auto_fraud_review: Boolean(auto.auto_fraud_review ?? false),
      auto_settlement_recalc: Boolean(auto.auto_settlement_recalc ?? false),
    },
    limits: {
      max_refund_amount: numOrNull(limits.max_refund_amount),
      min_refund_amount: numOrNull(limits.min_refund_amount),
      max_penalty_amount: numOrNull(limits.max_penalty_amount),
      max_compensation_amount: numOrNull(limits.max_compensation_amount),
    },
  };
}

/** API payload for create/update — excludes client-only fields. */
export function formToApiPayload(form: GmRuleFormState, isEdit: boolean) {
  const payload = {
    rule_code: form.rule_code.trim(),
    rule_name: form.rule_name.trim(),
    description: form.description.trim() || null,
    scenario_type: form.scenario_type,
    priority: form.priority,
    active_status: form.active_status,
    change_reason:
      form.change_reason.trim() ||
      (isEdit ? "Updated via rule editor" : "Created via rule editor"),
    conditions: {
      service_type: strOrNull(form.conditions.service_type),
      order_stage: strOrNull(form.conditions.order_stage),
      triggered_by: strOrNull(form.conditions.triggered_by),
      cancellation_reason_id: form.conditions.cancellation_reason_id,
    },
    fault: { ...form.fault },
    liability: { ...form.liability },
    refund: { ...form.refund },
    merchant: { ...form.merchant },
    rider: { ...form.rider },
    customer_penalty: { ...form.customer_penalty },
    funding: normalizeFundingPayload({ ...form.funding }),
    limits: { ...form.limits },
    auto_actions: { ...form.auto_actions },
  };

  if (isEdit) {
    const { rule_code: _code, ...updatePayload } = payload;
    return updatePayload;
  }

  return payload;
}

function normalizeFundingPayload(funding: GmRuleFormState["funding"]) {
  const split = {
    refund_fund_merchant_pct: numOrZero(funding.refund_fund_merchant_pct),
    refund_fund_rider_pct: numOrZero(funding.refund_fund_rider_pct),
    refund_fund_platform_pct: numOrZero(funding.refund_fund_platform_pct),
    refund_fund_customer_pct: numOrZero(funding.refund_fund_customer_pct),
  };
  const splitSum =
    split.refund_fund_merchant_pct +
    split.refund_fund_rider_pct +
    split.refund_fund_platform_pct +
    split.refund_fund_customer_pct;

  if (funding.refund_funding_source === "SHARED_LIABILITY_POOL" && Math.round(splitSum) !== 100) {
    return {
      ...funding,
      ...split,
      refund_fund_platform_pct: Math.max(0, 100 - split.refund_fund_merchant_pct - split.refund_fund_rider_pct - split.refund_fund_customer_pct),
    };
  }

  if (funding.refund_funding_source === "MERCHANT_WALLET") {
    return { ...funding, refund_fund_merchant_pct: 100, refund_fund_rider_pct: 0, refund_fund_platform_pct: 0, refund_fund_customer_pct: 0 };
  }
  if (funding.refund_funding_source === "RIDER_WALLET") {
    return { ...funding, refund_fund_merchant_pct: 0, refund_fund_rider_pct: 100, refund_fund_platform_pct: 0, refund_fund_customer_pct: 0 };
  }
  if (funding.refund_funding_source === "GATIMITRA_WALLET") {
    return { ...funding, refund_fund_merchant_pct: 0, refund_fund_rider_pct: 0, refund_fund_platform_pct: 100, refund_fund_customer_pct: 0 };
  }

  return { ...funding, ...split };
}
