import { getSql, sqlJsonbParam } from "../client";

/** Empty strings fail Postgres enum CHECK constraints — store NULL instead. */
function emptyToNull(v: unknown): string | number | boolean | Date | null {
  if (v === "" || v === undefined) return null;
  return v as string | number | boolean | Date;
}

type OrderStageRow = {
  code: string;
  label: string;
  source?: string;
  sort_order?: number;
};

/** gm_catalog_order_stages() unions several enums; same code can appear more than once. */
function dedupeOrderStages(rows: OrderStageRow[]): OrderStageRow[] {
  const byCode = new Map<string, OrderStageRow>();
  for (const row of rows) {
    const key = row.code.toUpperCase();
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, row);
      continue;
    }
    const existingSort = existing.sort_order ?? 9999;
    const rowSort = row.sort_order ?? 9999;
    if (rowSort < existingSort) byCode.set(key, row);
  }
  return [...byCode.values()].sort(
    (a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
  );
}

export async function isGmRuleEngineMigrated(): Promise<boolean> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'gm_rule_master'
      ) AS ok
    `;
    return Boolean((rows[0] as { ok?: boolean })?.ok);
  } catch {
    return false;
  }
}

export async function getGmRuleEngineCatalogs() {
  const sql = getSql();
  const [serviceTypes, orderStages, triggeredBy, cancellationReasons] = await Promise.all([
    sql`SELECT * FROM gm_catalog_service_types()`,
    sql`SELECT * FROM gm_catalog_order_stages()`,
    sql`SELECT * FROM gm_catalog_triggered_by()`,
    sql`
      SELECT id, attribute, label, reason_code, sort_order, is_active
      FROM order_cancellation_reason_catalog
      WHERE is_active = TRUE
      ORDER BY attribute, sort_order, label
    `.catch(() => []),
  ]);
  return {
    serviceTypes: serviceTypes as unknown as { code: string; label: string }[],
    orderStages: dedupeOrderStages(orderStages as unknown as OrderStageRow[]),
    triggeredBy: triggeredBy as unknown as { code: string; label: string }[],
    cancellationReasons: cancellationReasons as unknown as {
      id: number;
      label: string;
      attribute: string;
    }[],
    scenarioTypes: [
      "CANCELLATION",
      "POST_DELIVERY_CANCELLATION",
      "PARTIAL_REFUND",
      "RTO",
      "COD_FAILURE",
      "CHARGEBACK",
      "COMPENSATION",
      "DISPUTE_RESOLUTION",
    ],
    faultBuckets: [
      "CUSTOMER_FAULT",
      "RIDER_FAULT",
      "MERCHANT_FAULT",
      "SYSTEM_FAULT",
      "GATIMITRA_FAULT",
      "SHARED_FAULT",
      "NO_FAULT",
    ],
    refundRecipients: ["ORIGINAL_SOURCE", "WALLET", "BANK", "CREDITS", "SPLIT"],
    refundFundingSources: [
      "MERCHANT_WALLET",
      "RIDER_WALLET",
      "GATIMITRA_WALLET",
      "MERCHANT_SETTLEMENT",
      "RIDER_SETTLEMENT",
      "SHARED_LIABILITY_POOL",
    ],
    merchantPenaltyRecoverySources: [
      "MERCHANT_WALLET",
      "MERCHANT_SETTLEMENT",
      "MERCHANT_SECURITY_DEPOSIT",
      "FUTURE_SETTLEMENT",
      "EXTERNAL_RECOVERY",
    ],
    riderPenaltyRecoverySources: [
      "RIDER_WALLET",
      "RIDER_EARNINGS",
      "RIDER_SECURITY_DEPOSIT",
      "FUTURE_SETTLEMENT",
      "EXTERNAL_RECOVERY",
    ],
    customerPenaltyRecoverySources: [
      "CUSTOMER_WALLET",
      "STORED_CREDITS",
      "FUTURE_ORDERS",
      "EXTERNAL_RECOVERY",
    ],
    activeStatuses: ["ACTIVE", "INACTIVE", "ARCHIVED", "DRAFT"],
  };
}

export async function listGmRules(filters?: {
  scenarioType?: string;
  activeStatus?: string;
  includeDeleted?: boolean;
}) {
  const sql = getSql();
  const scenario = filters?.scenarioType ?? null;
  const status = filters?.activeStatus ?? null;
  const includeDeleted = filters?.includeDeleted ?? false;

  const rows = await sql`
    SELECT m.*,
      c.service_type, c.order_stage, c.cancellation_reason_id, c.triggered_by
    FROM gm_rule_master m
    LEFT JOIN gm_rule_conditions c ON c.rule_id = m.id
    WHERE (${includeDeleted} OR m.is_deleted = FALSE)
      AND (${scenario}::text IS NULL OR m.scenario_type::text = ${scenario})
      AND (${status}::text IS NULL OR m.active_status::text = ${status})
    ORDER BY m.priority ASC, m.scenario_type, m.rule_code, m.version_no DESC
  `;
  return rows as Record<string, unknown>[];
}

export async function getGmRuleById(id: number, opts?: { includeSnapshot?: boolean }) {
  const sql = getSql();
  const [row] = await sql`
    SELECT m.*,
      c.service_type, c.order_stage, c.cancellation_reason_id, c.triggered_by
    FROM gm_rule_master m
    LEFT JOIN gm_rule_conditions c ON c.rule_id = m.id
    WHERE m.id = ${id} AND m.is_deleted = FALSE
  `;
  if (!row) return undefined;

  if (opts?.includeSnapshot === false) {
    return row as Record<string, unknown>;
  }

  try {
    const [snapRow] = await sql`
      SELECT public.gm_build_rule_snapshot(${id}) AS snapshot
    `;
    return {
      ...(row as Record<string, unknown>),
      snapshot: (snapRow as { snapshot?: unknown })?.snapshot ?? null,
    };
  } catch {
    return { ...(row as Record<string, unknown>), snapshot: null };
  }
}

/** Fast edit prefetch — parallel child-table reads instead of gm_build_rule_snapshot(). */
export async function getGmRuleForEdit(id: number) {
  const sql = getSql();
  const [row] = await sql`
    SELECT m.*,
      c.service_type, c.order_stage, c.cancellation_reason_id, c.triggered_by
    FROM gm_rule_master m
    LEFT JOIN gm_rule_conditions c ON c.rule_id = m.id
    WHERE m.id = ${id} AND m.is_deleted = FALSE
  `;
  if (!row) return undefined;

  const master = row as Record<string, unknown>;
  const [
    faultRows,
    liabilityRows,
    refundRows,
    fundingRows,
    merchantRows,
    riderRows,
    penaltyRows,
    limitsRows,
    autoRows,
  ] = await Promise.all([
    sql`SELECT * FROM gm_rule_fault_allocation WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_platform_liability WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_refund_config WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_funding_config WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_merchant_settlement WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_rider_settlement WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_customer_penalty WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_financial_limits WHERE rule_id = ${id}`.catch(() => []),
    sql`SELECT * FROM gm_rule_auto_actions WHERE rule_id = ${id}`.catch(() => []),
  ]);

  const pick = (rows: unknown[]) => (rows[0] as Record<string, unknown> | undefined) ?? {};

  return {
    ...master,
    snapshot: {
      master,
      conditions: {
        service_type: master.service_type,
        order_stage: master.order_stage,
        cancellation_reason_id: master.cancellation_reason_id,
        triggered_by: master.triggered_by,
      },
      fault: pick(faultRows),
      liability: pick(liabilityRows),
      refund: pick(refundRows),
      funding: pick(fundingRows),
      merchant: pick(merchantRows),
      rider: pick(riderRows),
      customer_penalty: pick(penaltyRows),
      limits: pick(limitsRows),
      auto_actions: pick(autoRows),
    },
  } as Record<string, unknown>;
}

export type GmRuleUpsertPayload = {
  rule_code: string;
  rule_name: string;
  description?: string | null;
  scenario_type: string;
  priority?: number;
  active_status?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  change_reason?: string | null;
  conditions?: {
    service_type?: string | null;
    order_stage?: string | null;
    cancellation_reason_id?: number | null;
    triggered_by?: string | null;
  };
  fault?: Record<string, unknown>;
  liability?: Record<string, unknown>;
  refund?: Record<string, unknown>;
  merchant?: Record<string, unknown>;
  rider?: Record<string, unknown>;
  customer_penalty?: Record<string, unknown>;
  funding?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  auto_actions?: Record<string, unknown>;
  fraud?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  approvals?: Array<Record<string, unknown>>;
  advanced?: Record<string, unknown>;
};

const TABLE_ENUM_COLUMNS: Record<string, Record<string, string>> = {
  gm_rule_funding_config: {
    refund_funding_source: "gm_refund_funding_source",
    merchant_penalty_recovery_source: "gm_merchant_penalty_recovery_source",
    rider_penalty_recovery_source: "gm_rider_penalty_recovery_source",
    customer_penalty_recovery_source: "gm_customer_penalty_recovery_source",
  },
};

/** DB NOT NULL columns — null from UI maps to these before upsert. */
const UPSERT_NULL_DEFAULTS: Record<string, Record<string, unknown>> = {
  gm_rule_merchant_settlement: {
    merchant_receives_pct: 0,
    merchant_penalty_pct: 0,
    merchant_compensation_pct: 0,
    merchant_flat_penalty: 0,
    merchant_compensation_flat: 0,
    settlement_hold: false,
    settlement_hold_hours: 0,
    merchant_wallet_debit: false,
    merchant_wallet_credit: true,
  },
  gm_rule_rider_settlement: {
    rider_receives_pct: 0,
    rider_penalty_pct: 0,
    rider_compensation_pct: 0,
    rider_flat_penalty: 0,
    rider_compensation_flat: 0,
    min_rider_protection_amount: 0,
    settlement_hold: false,
    settlement_hold_hours: 0,
    rider_wallet_debit: false,
    rider_wallet_credit: false,
  },
  gm_rule_customer_penalty: {
    customer_penalty_pct: 0,
    customer_flat_penalty: 0,
    customer_compensation_pct: 0,
    customer_compensation_flat: 0,
    warning_increment: 0,
    customer_wallet_debit: false,
    customer_wallet_credit: false,
  },
  gm_rule_funding_config: {
    refund_fund_merchant_pct: 0,
    refund_fund_rider_pct: 0,
    refund_fund_platform_pct: 0,
    refund_fund_customer_pct: 0,
    platform_wallet_debit: false,
    platform_wallet_credit: false,
  },
};

function sanitizeUpsertValue(table: string, col: string, value: unknown): unknown {
  if (value === null || value === "") {
    const defaults = UPSERT_NULL_DEFAULTS[table];
    if (defaults && col in defaults) return defaults[col];
  }
  return value;
}

/** Columns added in later migrations — omitted if upsert fails (pre-0249 DB). */
const OPTIONAL_UPSERT_COLUMNS: Record<string, string[]> = {
  gm_rule_merchant_settlement: [
    "merchant_flat_penalty",
    "merchant_compensation_flat",
    "merchant_wallet_debit",
    "merchant_wallet_credit",
  ],
  gm_rule_rider_settlement: [
    "rider_flat_penalty",
    "rider_compensation_flat",
    "rider_wallet_debit",
    "rider_wallet_credit",
  ],
  gm_rule_customer_penalty: [
    "customer_compensation_pct",
    "customer_compensation_flat",
    "customer_wallet_debit",
    "customer_wallet_credit",
  ],
  gm_rule_platform_liability: [
    "platform_compensation_flat",
    "platform_absorbed_loss_pct",
    "platform_settlement_impact_pct",
  ],
};

async function upsertChild(
  sql: ReturnType<typeof getSql>,
  table: string,
  ruleId: number,
  data: Record<string, unknown> | undefined,
  columns: string[]
) {
  if (!data) return;

  const write = async (cols: string[]) => {
    const payload = cols.reduce<Record<string, unknown>>((acc, col) => {
      if (data[col] === undefined) return acc;
      acc[col] = sanitizeUpsertValue(table, col, data[col]);
      return acc;
    }, {});
    if (Object.keys(payload).length === 0) return;

    const enumCols = TABLE_ENUM_COLUMNS[table] ?? {};
    const keys = Object.keys(payload);
    const allCols = ["rule_id", ...keys];
    const vals = [ruleId, ...keys.map((k) => payload[k])];
    const placeholders = allCols.map((col, i) => {
      const cast = enumCols[col];
      return cast ? `$${i + 1}::${cast}` : `$${i + 1}`;
    });

    await sql.unsafe(
      `INSERT INTO ${table} (${allCols.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (rule_id) DO UPDATE SET ${keys
         .map((c) => `${c} = EXCLUDED.${c}`)
         .join(", ")}`,
      vals as (string | number | boolean | Date | null)[]
    );
  };

  try {
    await write(columns);
  } catch (error) {
    const optional = OPTIONAL_UPSERT_COLUMNS[table] ?? [];
    const fallbackCols = columns.filter((c) => !optional.includes(c));
    if (fallbackCols.length === columns.length) throw error;
    await write(fallbackCols);
  }
}

export async function createGmRule(
  payload: GmRuleUpsertPayload,
  actorId?: number | null
) {
  const sql = getSql();
  const [master] = await sql`
    INSERT INTO gm_rule_master (
      rule_code, rule_name, description, scenario_type, priority, active_status,
      effective_from, effective_to, change_reason, created_by, updated_by
    ) VALUES (
      ${payload.rule_code},
      ${payload.rule_name},
      ${payload.description ?? null},
      ${payload.scenario_type}::gm_rule_scenario_type,
      ${payload.priority ?? 100},
      ${(payload.active_status ?? "DRAFT")}::gm_rule_active_status,
      ${payload.effective_from ? new Date(payload.effective_from) : sql`NOW()`},
      ${payload.effective_to ? new Date(payload.effective_to) : null},
      ${payload.change_reason ?? null},
      ${actorId ?? null},
      ${actorId ?? null}
    )
    RETURNING *
  `;
  const ruleId = Number((master as { id: number }).id);

  const c = payload.conditions ?? {};
  await sql`
    INSERT INTO gm_rule_conditions (rule_id, service_type, order_stage, cancellation_reason_id, triggered_by)
    VALUES (
      ${ruleId},
      ${emptyToNull(c.service_type ?? null)},
      ${emptyToNull(c.order_stage ?? null)},
      ${c.cancellation_reason_id ?? null},
      ${emptyToNull(c.triggered_by ?? null)}
    )
    ON CONFLICT (rule_id) DO UPDATE SET
      service_type = EXCLUDED.service_type,
      order_stage = EXCLUDED.order_stage,
      cancellation_reason_id = EXCLUDED.cancellation_reason_id,
      triggered_by = EXCLUDED.triggered_by
  `;

  if (payload.fault) {
    const f = payload.fault;
    await sql`
      INSERT INTO gm_rule_fault_allocation (
        rule_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct
      ) VALUES (
        ${ruleId},
        ${String(f.fault_bucket ?? "NO_FAULT")}::gm_fault_bucket,
        ${Number(f.customer_pct ?? 0)},
        ${Number(f.merchant_pct ?? 0)},
        ${Number(f.rider_pct ?? 0)},
        ${Number(f.platform_pct ?? 0)},
        ${Number(f.gatimitra_pct ?? 0)}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        fault_bucket = EXCLUDED.fault_bucket,
        customer_pct = EXCLUDED.customer_pct,
        merchant_pct = EXCLUDED.merchant_pct,
        rider_pct = EXCLUDED.rider_pct,
        platform_pct = EXCLUDED.platform_pct,
        gatimitra_pct = EXCLUDED.gatimitra_pct
    `;
  } else {
    await sql`
      INSERT INTO gm_rule_fault_allocation (rule_id, fault_bucket)
      VALUES (${ruleId}, 'NO_FAULT')
      ON CONFLICT (rule_id) DO NOTHING
    `;
  }

  if (payload.liability) {
    const l = payload.liability;
    await sql`
      INSERT INTO gm_rule_platform_liability (
        rule_id, platform_bears_loss, liability_pct, customer_liability_pct,
        merchant_liability_pct, rider_liability_pct, gatimitra_liability_pct, internal_notes,
        platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
      ) VALUES (
        ${ruleId},
        ${Boolean(l.platform_bears_loss ?? false)},
        ${Number(l.liability_pct ?? 0)},
        ${Number(l.customer_liability_pct ?? 0)},
        ${Number(l.merchant_liability_pct ?? 0)},
        ${Number(l.rider_liability_pct ?? 0)},
        ${Number(l.gatimitra_liability_pct ?? 100)},
        ${l.internal_notes ? String(l.internal_notes) : null},
        ${l.platform_compensation_flat != null ? Number(l.platform_compensation_flat) : 0},
        ${Number(l.platform_absorbed_loss_pct ?? 0)},
        ${Number(l.platform_settlement_impact_pct ?? 0)}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        platform_bears_loss = EXCLUDED.platform_bears_loss,
        liability_pct = EXCLUDED.liability_pct,
        customer_liability_pct = EXCLUDED.customer_liability_pct,
        merchant_liability_pct = EXCLUDED.merchant_liability_pct,
        rider_liability_pct = EXCLUDED.rider_liability_pct,
        gatimitra_liability_pct = EXCLUDED.gatimitra_liability_pct,
        internal_notes = EXCLUDED.internal_notes,
        platform_compensation_flat = EXCLUDED.platform_compensation_flat,
        platform_absorbed_loss_pct = EXCLUDED.platform_absorbed_loss_pct,
        platform_settlement_impact_pct = EXCLUDED.platform_settlement_impact_pct
    `;
  } else {
    await sql`
      INSERT INTO gm_rule_platform_liability (rule_id, gatimitra_liability_pct)
      VALUES (${ruleId}, 100)
      ON CONFLICT (rule_id) DO NOTHING
    `;
  }

  if (payload.refund) {
    const r = payload.refund;
    await sql`
      INSERT INTO gm_rule_refund_config (
        rule_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount,
        platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct,
        tip_refund_pct, tax_refund_pct, coupon_restore, item_level_refund, order_level_refund,
        auto_refund, refund_approval_required, min_refund_amount, max_refund_amount
      ) VALUES (
        ${ruleId},
        ${Boolean(r.refund_allowed ?? true)},
        ${String(r.refund_recipient ?? "ORIGINAL_SOURCE")}::gm_refund_recipient,
        ${sqlJsonbParam(r.refund_priority ?? ["ORIGINAL_SOURCE", "WALLET", "BANK"])}::jsonb,
        ${r.refund_pct != null ? Number(r.refund_pct) : null},
        ${r.refund_flat_amount != null ? Number(r.refund_flat_amount) : null},
        ${Number(r.platform_fee_refund_pct ?? 0)},
        ${Number(r.delivery_fee_refund_pct ?? 0)},
        ${Number(r.convenience_fee_refund_pct ?? 0)},
        ${Number(r.tip_refund_pct ?? 0)},
        ${Number(r.tax_refund_pct ?? 0)},
        ${Boolean(r.coupon_restore ?? false)},
        ${Boolean(r.item_level_refund ?? false)},
        ${Boolean(r.order_level_refund ?? true)},
        ${Boolean(r.auto_refund ?? false)},
        ${Boolean(r.refund_approval_required ?? false)},
        ${r.min_refund_amount != null ? Number(r.min_refund_amount) : null},
        ${r.max_refund_amount != null ? Number(r.max_refund_amount) : null}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        refund_allowed = EXCLUDED.refund_allowed,
        refund_recipient = EXCLUDED.refund_recipient,
        refund_priority = EXCLUDED.refund_priority,
        refund_pct = EXCLUDED.refund_pct,
        refund_flat_amount = EXCLUDED.refund_flat_amount,
        platform_fee_refund_pct = EXCLUDED.platform_fee_refund_pct,
        delivery_fee_refund_pct = EXCLUDED.delivery_fee_refund_pct,
        convenience_fee_refund_pct = EXCLUDED.convenience_fee_refund_pct,
        tip_refund_pct = EXCLUDED.tip_refund_pct,
        tax_refund_pct = EXCLUDED.tax_refund_pct,
        coupon_restore = EXCLUDED.coupon_restore,
        item_level_refund = EXCLUDED.item_level_refund,
        order_level_refund = EXCLUDED.order_level_refund,
        auto_refund = EXCLUDED.auto_refund,
        refund_approval_required = EXCLUDED.refund_approval_required,
        min_refund_amount = EXCLUDED.min_refund_amount,
        max_refund_amount = EXCLUDED.max_refund_amount
    `;
  }

  await upsertChild(sql, "gm_rule_merchant_settlement", ruleId, payload.merchant, [
    "merchant_receives_pct",
    "merchant_penalty_pct",
    "merchant_compensation_pct",
    "merchant_flat_penalty",
    "merchant_compensation_flat",
    "settlement_hold",
    "settlement_hold_hours",
    "settlement_notes",
    "merchant_wallet_debit",
    "merchant_wallet_credit",
  ]);
  await upsertChild(sql, "gm_rule_rider_settlement", ruleId, payload.rider, [
    "rider_receives_pct",
    "rider_penalty_pct",
    "rider_compensation_pct",
    "rider_flat_penalty",
    "rider_compensation_flat",
    "min_rider_protection_amount",
    "settlement_hold",
    "settlement_hold_hours",
    "rider_wallet_debit",
    "rider_wallet_credit",
  ]);
  await upsertChild(sql, "gm_rule_customer_penalty", ruleId, payload.customer_penalty, [
    "customer_penalty_pct",
    "customer_flat_penalty",
    "customer_compensation_pct",
    "customer_compensation_flat",
    "customer_wallet_debit",
    "customer_wallet_credit",
    "warning_increment",
    "account_restriction",
    "temporary_block_hours",
  ]);
  try {
    await upsertChild(sql, "gm_rule_funding_config", ruleId, payload.funding, [
      "refund_funding_source",
      "refund_fund_merchant_pct",
      "refund_fund_rider_pct",
      "refund_fund_platform_pct",
      "refund_fund_customer_pct",
      "merchant_penalty_recovery_source",
      "rider_penalty_recovery_source",
      "customer_penalty_recovery_source",
      "platform_wallet_debit",
      "platform_wallet_credit",
    ]);
  } catch {
    /* gm_rule_funding_config requires migration 0250 */
  }
  if (!payload.funding) {
    try {
      await sql`
        INSERT INTO gm_rule_funding_config (
          rule_id, refund_funding_source,
          refund_fund_merchant_pct, refund_fund_rider_pct, refund_fund_platform_pct, refund_fund_customer_pct
        ) VALUES (${ruleId}, 'SHARED_LIABILITY_POOL', 0, 0, 100, 0)
        ON CONFLICT (rule_id) DO NOTHING
      `;
    } catch {
      /* funding table may not exist until migration 0250 */
    }
  }
  await upsertChild(sql, "gm_rule_financial_limits", ruleId, payload.limits, [
    "max_refund_amount",
    "min_refund_amount",
    "max_penalty_amount",
    "max_compensation_amount",
  ]);
  await upsertChild(sql, "gm_rule_auto_actions", ruleId, payload.auto_actions, [
    "auto_cancel",
    "auto_refund",
    "auto_settlement_recalc",
    "auto_notification",
    "auto_ticket_creation",
    "auto_wallet_adjustment",
    "auto_fraud_review",
  ]);
  await upsertChild(sql, "gm_rule_fraud_config", ruleId, payload.fraud, [
    "mark_fraud",
    "manual_review_required",
    "blacklist_customer",
    "blacklist_merchant",
    "blacklist_rider",
    "freeze_wallet",
    "freeze_settlement",
    "create_investigation_ticket",
  ]);
  await upsertChild(sql, "gm_rule_evidence_config", ruleId, payload.evidence, [
    "require_customer_evidence",
    "require_rider_evidence",
    "require_merchant_evidence",
    "require_photo",
    "require_video",
    "require_admin_approval",
    "require_support_approval",
  ]);

  if (payload.advanced) {
    await sql`
      INSERT INTO gm_rule_advanced_config (rule_id, config)
      VALUES (${ruleId}, ${sqlJsonbParam(payload.advanced)}::jsonb)
      ON CONFLICT (rule_id) DO UPDATE SET config = EXCLUDED.config
    `;
  }

  if (payload.approvals?.length) {
    await sql`DELETE FROM gm_rule_approval_thresholds WHERE rule_id = ${ruleId}`;
    for (const a of payload.approvals) {
      await sql`
        INSERT INTO gm_rule_approval_thresholds (rule_id, threshold_amount, required_role_codes, approval_sequence)
        VALUES (
          ${ruleId},
          ${Number(a.threshold_amount)},
          ${a.required_role_codes as string[]},
          ${Number(a.approval_sequence ?? 1)}
        )
      `;
    }
  }

  return getGmRuleById(ruleId, { includeSnapshot: false });
}

export async function updateGmRule(
  id: number,
  payload: Partial<GmRuleUpsertPayload>,
  actorId?: number | null
) {
  const existing = await getGmRuleById(id, { includeSnapshot: false });
  if (!existing) throw new Error("Rule not found");
  const ex = existing as {
    rule_name: string;
    description: string | null;
    scenario_type: string;
    priority: number;
    active_status: string;
    effective_from: Date;
    effective_to: Date | null;
    change_reason: string | null;
    service_type: string | null;
    order_stage: string | null;
    cancellation_reason_id: number | null;
    triggered_by: string | null;
  };

  const sql = getSql();
  await sql`
    UPDATE gm_rule_master SET
      rule_name = ${payload.rule_name ?? ex.rule_name},
      description = ${payload.description !== undefined ? payload.description : ex.description},
      scenario_type = ${(payload.scenario_type ?? ex.scenario_type)}::gm_rule_scenario_type,
      priority = ${Number(payload.priority ?? ex.priority ?? 100)},
      active_status = ${(payload.active_status ?? ex.active_status)}::gm_rule_active_status,
      effective_from = ${payload.effective_from ? new Date(payload.effective_from) : ex.effective_from},
      effective_to = ${payload.effective_to !== undefined ? (payload.effective_to ? new Date(payload.effective_to) : null) : ex.effective_to},
      change_reason = ${payload.change_reason ?? ex.change_reason},
      version_no = version_no + 1,
      updated_by = ${actorId ?? null},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  if (payload.conditions) {
    const c = payload.conditions;
    await sql`
      INSERT INTO gm_rule_conditions (rule_id, service_type, order_stage, cancellation_reason_id, triggered_by)
      VALUES (
        ${id},
        ${emptyToNull(c.service_type !== undefined ? c.service_type : ex.service_type)},
        ${emptyToNull(c.order_stage !== undefined ? c.order_stage : ex.order_stage)},
        ${c.cancellation_reason_id !== undefined ? c.cancellation_reason_id : ex.cancellation_reason_id},
        ${emptyToNull(c.triggered_by !== undefined ? c.triggered_by : ex.triggered_by)}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        service_type = EXCLUDED.service_type,
        order_stage = EXCLUDED.order_stage,
        cancellation_reason_id = EXCLUDED.cancellation_reason_id,
        triggered_by = EXCLUDED.triggered_by
    `;
  }

  if (payload.fault) {
    const f = payload.fault;
    await sql`
      INSERT INTO gm_rule_fault_allocation (
        rule_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct
      ) VALUES (
        ${id},
        ${String(f.fault_bucket ?? "NO_FAULT")}::gm_fault_bucket,
        ${Number(f.customer_pct ?? 0)},
        ${Number(f.merchant_pct ?? 0)},
        ${Number(f.rider_pct ?? 0)},
        ${Number(f.platform_pct ?? 0)},
        ${Number(f.gatimitra_pct ?? 0)}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        fault_bucket = EXCLUDED.fault_bucket,
        customer_pct = EXCLUDED.customer_pct,
        merchant_pct = EXCLUDED.merchant_pct,
        rider_pct = EXCLUDED.rider_pct,
        platform_pct = EXCLUDED.platform_pct,
        gatimitra_pct = EXCLUDED.gatimitra_pct
    `;
  }

  if (payload.refund) {
    const r = payload.refund;
    await sql`
      INSERT INTO gm_rule_refund_config (
        rule_id, refund_allowed, refund_recipient, refund_pct, refund_flat_amount,
        auto_refund, refund_approval_required, item_level_refund, order_level_refund,
        max_refund_amount, min_refund_amount
      ) VALUES (
        ${id},
        ${Boolean(r.refund_allowed ?? true)},
        ${String(r.refund_recipient ?? "ORIGINAL_SOURCE")}::gm_refund_recipient,
        ${r.refund_pct != null ? Number(r.refund_pct) : null},
        ${r.refund_flat_amount != null ? Number(r.refund_flat_amount) : null},
        ${Boolean(r.auto_refund ?? false)},
        ${Boolean(r.refund_approval_required ?? false)},
        ${Boolean(r.item_level_refund ?? false)},
        ${Boolean(r.order_level_refund ?? true)},
        ${r.max_refund_amount != null ? Number(r.max_refund_amount) : null},
        ${r.min_refund_amount != null ? Number(r.min_refund_amount) : null}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        refund_allowed = EXCLUDED.refund_allowed,
        refund_recipient = EXCLUDED.refund_recipient,
        refund_pct = EXCLUDED.refund_pct,
        refund_flat_amount = EXCLUDED.refund_flat_amount,
        auto_refund = EXCLUDED.auto_refund,
        refund_approval_required = EXCLUDED.refund_approval_required,
        item_level_refund = EXCLUDED.item_level_refund,
        order_level_refund = EXCLUDED.order_level_refund,
        max_refund_amount = EXCLUDED.max_refund_amount,
        min_refund_amount = EXCLUDED.min_refund_amount
    `;
  }

  if (payload.liability) {
    const l = payload.liability;
    await sql`
      INSERT INTO gm_rule_platform_liability (
        rule_id, platform_bears_loss, liability_pct, customer_liability_pct,
        merchant_liability_pct, rider_liability_pct, gatimitra_liability_pct,
        platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
      ) VALUES (
        ${id},
        ${Boolean(l.platform_bears_loss ?? false)},
        ${Number(l.liability_pct ?? 0)},
        ${Number(l.customer_liability_pct ?? 0)},
        ${Number(l.merchant_liability_pct ?? 0)},
        ${Number(l.rider_liability_pct ?? 0)},
        ${Number(l.gatimitra_liability_pct ?? 100)},
        ${l.platform_compensation_flat != null ? Number(l.platform_compensation_flat) : 0},
        ${Number(l.platform_absorbed_loss_pct ?? 0)},
        ${Number(l.platform_settlement_impact_pct ?? 0)}
      )
      ON CONFLICT (rule_id) DO UPDATE SET
        platform_bears_loss = EXCLUDED.platform_bears_loss,
        liability_pct = EXCLUDED.liability_pct,
        customer_liability_pct = EXCLUDED.customer_liability_pct,
        merchant_liability_pct = EXCLUDED.merchant_liability_pct,
        rider_liability_pct = EXCLUDED.rider_liability_pct,
        gatimitra_liability_pct = EXCLUDED.gatimitra_liability_pct,
        platform_compensation_flat = EXCLUDED.platform_compensation_flat,
        platform_absorbed_loss_pct = EXCLUDED.platform_absorbed_loss_pct,
        platform_settlement_impact_pct = EXCLUDED.platform_settlement_impact_pct
    `;
  }

  await upsertChild(sql, "gm_rule_merchant_settlement", id, payload.merchant, [
    "merchant_receives_pct",
    "merchant_penalty_pct",
    "merchant_compensation_pct",
    "merchant_flat_penalty",
    "merchant_compensation_flat",
    "settlement_hold",
    "settlement_hold_hours",
    "settlement_notes",
    "merchant_wallet_debit",
    "merchant_wallet_credit",
  ]);
  await upsertChild(sql, "gm_rule_rider_settlement", id, payload.rider, [
    "rider_receives_pct",
    "rider_penalty_pct",
    "rider_compensation_pct",
    "rider_flat_penalty",
    "rider_compensation_flat",
    "min_rider_protection_amount",
    "settlement_hold",
    "settlement_hold_hours",
    "rider_wallet_debit",
    "rider_wallet_credit",
  ]);
  await upsertChild(sql, "gm_rule_customer_penalty", id, payload.customer_penalty, [
    "customer_penalty_pct",
    "customer_flat_penalty",
    "customer_compensation_pct",
    "customer_compensation_flat",
    "customer_wallet_debit",
    "customer_wallet_credit",
    "warning_increment",
    "account_restriction",
    "temporary_block_hours",
  ]);
  try {
    await upsertChild(sql, "gm_rule_funding_config", id, payload.funding, [
      "refund_funding_source",
      "refund_fund_merchant_pct",
      "refund_fund_rider_pct",
      "refund_fund_platform_pct",
      "refund_fund_customer_pct",
      "merchant_penalty_recovery_source",
      "rider_penalty_recovery_source",
      "customer_penalty_recovery_source",
      "platform_wallet_debit",
      "platform_wallet_credit",
    ]);
  } catch {
    /* gm_rule_funding_config requires migration 0250 */
  }
  await upsertChild(sql, "gm_rule_financial_limits", id, payload.limits, [
    "max_refund_amount",
    "min_refund_amount",
    "max_penalty_amount",
    "max_compensation_amount",
  ]);
  await upsertChild(sql, "gm_rule_auto_actions", id, payload.auto_actions, [
    "auto_cancel",
    "auto_refund",
    "auto_settlement_recalc",
    "auto_notification",
    "auto_ticket_creation",
    "auto_wallet_adjustment",
    "auto_fraud_review",
  ]);

  return getGmRuleById(id, { includeSnapshot: false });
}

export async function setGmRuleStatus(
  ids: number[],
  activeStatus: string,
  actorId?: number | null,
  changeReason?: string
) {
  const sql = getSql();
  await sql`
    UPDATE gm_rule_master SET
      active_status = ${activeStatus}::gm_rule_active_status,
      updated_by = ${actorId ?? null},
      change_reason = ${changeReason ?? `Bulk ${activeStatus}`},
      updated_at = NOW()
    WHERE id = ANY(${ids}::bigint[]) AND is_deleted = FALSE
  `;
}

export async function archiveGmRules(ids: number[], actorId?: number | null) {
  const sql = getSql();
  await sql`
    UPDATE gm_rule_master SET
      active_status = 'ARCHIVED'::gm_rule_active_status,
      is_deleted = TRUE,
      deleted_at = NOW(),
      deleted_by = ${actorId ?? null},
      updated_by = ${actorId ?? null},
      change_reason = 'Archived',
      updated_at = NOW()
    WHERE id = ANY(${ids}::bigint[])
  `;
}

export async function cloneGmRule(
  sourceId: number,
  newRuleCode: string,
  actorId?: number | null
) {
  const sql = getSql();
  const rows = await sql`
    SELECT gm_clone_rule(${sourceId}, ${newRuleCode}, ${actorId ?? null}, 'Cloned from admin') AS id
  `;
  const newId = Number((rows[0] as { id?: number })?.id);
  return getGmRuleById(newId);
}

export async function simulateGmRule(input: {
  scenario_type: string;
  service_type: string;
  order_stage: string;
  cancellation_reason_id?: number | null;
  triggered_by?: string | null;
  order_gross?: number;
  actor_system_user_id?: number | null;
}) {
  const sql = getSql();
  const rows = await sql`
    SELECT gm_simulate_rule(
      ${input.scenario_type}::gm_rule_scenario_type,
      ${input.service_type},
      ${input.order_stage},
      ${input.cancellation_reason_id ?? null},
      ${input.triggered_by ?? null},
      ${input.order_gross ?? 0},
      ${input.actor_system_user_id ?? null}
    )::jsonb AS result
  `;
  return (rows[0] as { result?: Record<string, unknown> })?.result;
}

export async function listGmRuleExecutions(orderId?: number, limit = 50) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM gm_rule_execution_log
    WHERE (${orderId ?? null}::bigint IS NULL OR order_id = ${orderId ?? null})
    ORDER BY executed_at DESC
    LIMIT ${limit}
  `;
  return rows;
}
