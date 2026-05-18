/**
 * Commission admin DB operations — raw SQL because these tables (post-0226..0229)
 * are not yet in the dashboard's Drizzle schema. Centralising the queries here
 * lets the API routes stay thin and lets the same operations be reused by the
 * commission audit / reporting screens.
 *
 * Mutation paths also write a row to commission_audit_log so the merchant
 * rate-history endpoint and admin compliance dashboards have a single
 * append-only source of truth.
 */

import { getSql } from "../client";

export type CommissionSourceKind = "DEFAULT" | "STORE_OVERRIDE" | "SUBSCRIPTION" | "PROMOTIONAL";

export type CommissionRuleRow = {
  id: number;
  storeId: number | null;
  parentId: number | null;
  serviceType: string;
  commissionType: string;
  commissionValue: string;
  minOrderValue: string | null;
  maxOrderValue: string | null;
  applicableCities: string[] | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  priority: number;
  sourceKind: "MANUAL_OVERRIDE" | "PROMOTIONAL" | "SUBSCRIPTION_BENEFIT";
  approvedBy: number | null;
  reason: string | null;
  createdBy: number | null;
  createdAt: string;
};

export type ActiveCommissionTrace = {
  percent: number;
  sourceKind: CommissionSourceKind;
  sourceLabel: string;
  sourceRuleId: number | null;
  sourcePlanId: number | null;
  sourceSubscriptionId: number | null;
  validUntil: string | null;
};

export type CommissionAuditRow = {
  id: number;
  storeId: number | null;
  planId: number | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: number | null;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
};

export type StoreLookupResult = {
  id: number;
  storeId: string;
  storeName: string;
  storeDisplayName: string | null;
  city: string | null;
  approvalStatus: string | null;
  parentId: number | null;
};

/**
 * Look up a store by either the numeric primary key or the public `GMMC….`
 * identifier. Returns null if not found — the API route surfaces a clean 404
 * so the admin UI can show "store not found" instead of an empty card.
 */
export async function lookupStore(idOrCode: string | number): Promise<StoreLookupResult | null> {
  const sql = getSql();
  const isNumeric = typeof idOrCode === "number" || /^\d+$/.test(String(idOrCode));
  const rows = isNumeric
    ? await sql<Array<Record<string, unknown>>>`
        SELECT id, store_id, store_name, store_display_name, city, approval_status, parent_id
        FROM merchant_stores
        WHERE id = ${Number(idOrCode)}
        LIMIT 1
      `
    : await sql<Array<Record<string, unknown>>>`
        SELECT id, store_id, store_name, store_display_name, city, approval_status, parent_id
        FROM merchant_stores
        WHERE store_id = ${String(idOrCode).trim()}
        LIMIT 1
      `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    storeId: String(r.store_id),
    storeName: String(r.store_name ?? ""),
    storeDisplayName: r.store_display_name == null ? null : String(r.store_display_name),
    city: r.city == null ? null : String(r.city),
    approvalStatus: r.approval_status == null ? null : String(r.approval_status),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
  };
}

export async function getGlobalDefaultPercent(): Promise<number> {
  const sql = getSql();
  const rows = await sql<Array<{ pct: string | null }>>`
    SELECT base_service_fee_percent::text AS pct
    FROM store_onboarding_commission_config
    WHERE id = 1
    LIMIT 1
  `;
  const pct = rows[0]?.pct;
  return pct == null ? 15 : Number(pct);
}

export async function setGlobalDefaultPercent(
  newPercent: number,
  actorId: number | null,
  reason: string | null,
): Promise<{ oldPercent: number; newPercent: number }> {
  if (newPercent < 0 || newPercent >= 100) {
    throw new Error("Percent must be 0..<100");
  }
  const sql = getSql();
  const oldPercent = await getGlobalDefaultPercent();
  await sql.begin(async (tx) => {
    const q = tx as unknown as ReturnType<typeof getSql>;
    await q`
      UPDATE store_onboarding_commission_config
      SET base_service_fee_percent = ${newPercent.toFixed(2)},
          updated_at = NOW()
      WHERE id = 1
    `;
    await q`
      INSERT INTO commission_audit_log (action, old_value, new_value, actor_id, actor_role, reason)
      VALUES (
        'DEFAULT_CHANGED',
        ${JSON.stringify({ base_service_fee_percent: oldPercent })}::jsonb,
        ${JSON.stringify({ base_service_fee_percent: newPercent })}::jsonb,
        ${actorId},
        'super_admin',
        ${reason}
      )
    `;
  });
  return { oldPercent, newPercent };
}

/** Replays the resolver logic in SQL. Used to display the "current rate + source" trace in the admin UI. */
export async function getActiveCommissionForStore(storeId: number): Promise<ActiveCommissionTrace> {
  const sql = getSql();

  const manual = await sql<Array<{ id: number; commission_value: string; effective_to: string | null }>>`
    SELECT id, commission_value::text AS commission_value, effective_to::text AS effective_to
    FROM merchant_store_commission_rules
    WHERE store_id = ${storeId}
      AND is_active = TRUE
      AND source_kind = 'MANUAL_OVERRIDE'
      AND commission_type = 'PERCENTAGE'
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY priority DESC, effective_from DESC
    LIMIT 1
  `;
  if (manual.length > 0) {
    const r = manual[0]!;
    return {
      percent: Number(r.commission_value),
      sourceKind: "STORE_OVERRIDE",
      sourceLabel: "Store-specific override",
      sourceRuleId: Number(r.id),
      sourcePlanId: null,
      sourceSubscriptionId: null,
      validUntil: r.effective_to ?? null,
    };
  }

  const sub = await sql<
    Array<{ sub_id: number; plan_id: number; plan_name: string; commission_percent_override: string; expiry_date: string | null }>
  >`
    SELECT
      ms.id AS sub_id,
      mp.id AS plan_id,
      mp.plan_name,
      mp.commission_percent_override::text AS commission_percent_override,
      ms.expiry_date::text AS expiry_date
    FROM merchant_subscriptions ms
    JOIN merchant_plans mp ON mp.id = ms.plan_id
    WHERE ms.store_id = ${storeId}
      AND ms.is_active = TRUE
      AND ms.subscription_status = 'ACTIVE'
      AND (ms.expiry_date IS NULL OR ms.expiry_date > NOW())
      AND mp.commission_benefit_active = TRUE
      AND mp.commission_percent_override IS NOT NULL
    ORDER BY ms.start_date DESC
    LIMIT 1
  `;
  if (sub.length > 0) {
    const r = sub[0]!;
    return {
      percent: Number(r.commission_percent_override),
      sourceKind: "SUBSCRIPTION",
      sourceLabel: `${r.plan_name} subscription`,
      sourceRuleId: null,
      sourcePlanId: Number(r.plan_id),
      sourceSubscriptionId: Number(r.sub_id),
      validUntil: r.expiry_date ?? null,
    };
  }

  const promo = await sql<Array<{ id: number; commission_value: string; effective_to: string | null }>>`
    SELECT id, commission_value::text AS commission_value, effective_to::text AS effective_to
    FROM merchant_store_commission_rules
    WHERE store_id = ${storeId}
      AND is_active = TRUE
      AND source_kind = 'PROMOTIONAL'
      AND commission_type = 'PERCENTAGE'
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY priority DESC, effective_from DESC
    LIMIT 1
  `;
  if (promo.length > 0) {
    const r = promo[0]!;
    return {
      percent: Number(r.commission_value),
      sourceKind: "PROMOTIONAL",
      sourceLabel: "Promotional rate",
      sourceRuleId: Number(r.id),
      sourcePlanId: null,
      sourceSubscriptionId: null,
      validUntil: r.effective_to ?? null,
    };
  }

  const defaultPercent = await getGlobalDefaultPercent();
  return {
    percent: defaultPercent,
    sourceKind: "DEFAULT",
    sourceLabel: "Platform default",
    sourceRuleId: null,
    sourcePlanId: null,
    sourceSubscriptionId: null,
    validUntil: null,
  };
}

export async function listStoreCommissionRules(storeId: number): Promise<CommissionRuleRow[]> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT
      id,
      store_id,
      parent_id,
      service_type::text AS service_type,
      commission_type,
      commission_value::text AS commission_value,
      min_order_value::text AS min_order_value,
      max_order_value::text AS max_order_value,
      applicable_cities,
      effective_from::text AS effective_from,
      effective_to::text AS effective_to,
      is_active,
      priority,
      source_kind,
      approved_by,
      reason,
      created_by,
      created_at::text AS created_at
    FROM merchant_store_commission_rules
    WHERE store_id = ${storeId}
    ORDER BY is_active DESC, priority DESC, effective_from DESC
  `;
  return rows.map(rowToRule);
}

function rowToRule(r: Record<string, unknown>): CommissionRuleRow {
  return {
    id: Number(r.id),
    storeId: r.store_id == null ? null : Number(r.store_id),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    serviceType: String(r.service_type),
    commissionType: String(r.commission_type),
    commissionValue: String(r.commission_value),
    minOrderValue: r.min_order_value == null ? null : String(r.min_order_value),
    maxOrderValue: r.max_order_value == null ? null : String(r.max_order_value),
    applicableCities: Array.isArray(r.applicable_cities) ? (r.applicable_cities as string[]) : null,
    effectiveFrom: String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    isActive: Boolean(r.is_active),
    priority: Number(r.priority),
    sourceKind: r.source_kind as CommissionRuleRow["sourceKind"],
    approvedBy: r.approved_by == null ? null : Number(r.approved_by),
    reason: r.reason == null ? null : String(r.reason),
    createdBy: r.created_by == null ? null : Number(r.created_by),
    createdAt: String(r.created_at),
  };
}

export type CreateRuleInput = {
  storeId: number;
  serviceType: string;
  commissionPercent: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceKind: "MANUAL_OVERRIDE" | "PROMOTIONAL";
  priority?: number;
  reason: string | null;
  actorId: number | null;
};

export async function createStoreRule(input: CreateRuleInput): Promise<CommissionRuleRow> {
  if (input.commissionPercent < 0 || input.commissionPercent >= 100) {
    throw new Error("Percent must be 0..<100");
  }
  const sql = getSql();
  return await sql.begin(async (tx) => {
    const q = tx as unknown as ReturnType<typeof getSql>;
    const rows = await q<Array<Record<string, unknown>>>`
      INSERT INTO merchant_store_commission_rules (
        store_id, service_type, commission_type, commission_value,
        effective_from, effective_to, is_active, priority, source_kind,
        approved_by, reason, created_by
      ) VALUES (
        ${input.storeId},
        ${input.serviceType}::service_type,
        'PERCENTAGE',
        ${input.commissionPercent.toFixed(2)},
        ${input.effectiveFrom},
        ${input.effectiveTo},
        TRUE,
        ${input.priority ?? 100},
        ${input.sourceKind},
        ${input.actorId},
        ${input.reason},
        ${input.actorId}
      )
      RETURNING
        id, store_id, parent_id, service_type::text AS service_type, commission_type,
        commission_value::text AS commission_value,
        min_order_value::text AS min_order_value,
        max_order_value::text AS max_order_value,
        applicable_cities,
        effective_from::text AS effective_from,
        effective_to::text AS effective_to,
        is_active, priority, source_kind, approved_by, reason, created_by,
        created_at::text AS created_at
    `;
    const inserted = rowToRule(rows[0]!);
    await q`
      INSERT INTO commission_audit_log (store_id, action, new_value, actor_id, actor_role, reason)
      VALUES (
        ${input.storeId},
        'RULE_CREATED',
        ${JSON.stringify(inserted)}::jsonb,
        ${input.actorId},
        'super_admin',
        ${input.reason}
      )
    `;
    return inserted;
  });
}

export async function deactivateStoreRule(
  ruleId: number,
  actorId: number | null,
  reason: string | null,
): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const q = tx as unknown as ReturnType<typeof getSql>;
    const before = await q<Array<{ store_id: number | null; commission_value: string }>>`
      SELECT store_id, commission_value::text AS commission_value
      FROM merchant_store_commission_rules
      WHERE id = ${ruleId}
      LIMIT 1
    `;
    if (before.length === 0) throw new Error("Rule not found");
    await q`
      UPDATE merchant_store_commission_rules
      SET is_active = FALSE
      WHERE id = ${ruleId}
    `;
    await q`
      INSERT INTO commission_audit_log (store_id, action, old_value, actor_id, actor_role, reason)
      VALUES (
        ${before[0]!.store_id},
        'RULE_DEACTIVATED',
        ${JSON.stringify({ rule_id: ruleId, was_value: before[0]!.commission_value })}::jsonb,
        ${actorId},
        'super_admin',
        ${reason}
      )
    `;
  });
}

export type UpdatePlanBenefitInput = {
  planId: number;
  commissionPercentOverride: number | null;
  benefitActive: boolean;
  actorId: number | null;
  reason: string | null;
};

export async function updatePlanBenefit(input: UpdatePlanBenefitInput): Promise<void> {
  if (
    input.commissionPercentOverride != null &&
    (input.commissionPercentOverride < 0 || input.commissionPercentOverride >= 100)
  ) {
    throw new Error("Percent must be 0..<100");
  }
  const sql = getSql();
  await sql.begin(async (tx) => {
    const q = tx as unknown as ReturnType<typeof getSql>;
    const before = await q<Array<{ commission_percent_override: string | null; commission_benefit_active: boolean }>>`
      SELECT
        commission_percent_override::text AS commission_percent_override,
        commission_benefit_active
      FROM merchant_plans
      WHERE id = ${input.planId}
      LIMIT 1
    `;
    if (before.length === 0) throw new Error("Plan not found");
    await q`
      UPDATE merchant_plans
      SET commission_percent_override = ${
        input.commissionPercentOverride == null ? null : input.commissionPercentOverride.toFixed(2)
      },
          commission_benefit_active = ${input.benefitActive},
          updated_at = NOW()
      WHERE id = ${input.planId}
    `;
    await q`
      INSERT INTO commission_audit_log (plan_id, action, old_value, new_value, actor_id, actor_role, reason)
      VALUES (
        ${input.planId},
        'PLAN_BENEFIT_UPDATED',
        ${JSON.stringify(before[0])}::jsonb,
        ${JSON.stringify({
          commission_percent_override: input.commissionPercentOverride,
          commission_benefit_active: input.benefitActive,
        })}::jsonb,
        ${input.actorId},
        'super_admin',
        ${input.reason}
      )
    `;
  });
}

export async function listAuditForStore(storeId: number, limit = 100): Promise<CommissionAuditRow[]> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT
      id, store_id, plan_id, action, old_value, new_value,
      actor_id, actor_role, reason, created_at::text AS created_at
    FROM commission_audit_log
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToAudit);
}

export async function listGlobalAudit(limit = 100): Promise<CommissionAuditRow[]> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT
      id, store_id, plan_id, action, old_value, new_value,
      actor_id, actor_role, reason, created_at::text AS created_at
    FROM commission_audit_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToAudit);
}

function rowToAudit(r: Record<string, unknown>): CommissionAuditRow {
  return {
    id: Number(r.id),
    storeId: r.store_id == null ? null : Number(r.store_id),
    planId: r.plan_id == null ? null : Number(r.plan_id),
    action: String(r.action),
    oldValue: r.old_value ?? null,
    newValue: r.new_value ?? null,
    actorId: r.actor_id == null ? null : Number(r.actor_id),
    actorRole: r.actor_role == null ? null : String(r.actor_role),
    reason: r.reason == null ? null : String(r.reason),
    createdAt: String(r.created_at),
  };
}

export type PlanBenefitSummary = {
  id: number;
  planName: string;
  planCode: string;
  commissionPercentOverride: string | null;
  commissionBenefitActive: boolean;
};

export async function listPlansForBenefitEditor(): Promise<PlanBenefitSummary[]> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT
      id, plan_name, plan_code,
      commission_percent_override::text AS commission_percent_override,
      commission_benefit_active
    FROM merchant_plans
    WHERE is_active = TRUE
    ORDER BY display_order NULLS LAST, plan_name
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    planName: String(r.plan_name),
    planCode: String(r.plan_code),
    commissionPercentOverride: r.commission_percent_override == null ? null : String(r.commission_percent_override),
    commissionBenefitActive: Boolean(r.commission_benefit_active),
  }));
}
