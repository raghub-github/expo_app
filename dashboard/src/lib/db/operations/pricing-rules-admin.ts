import { getSql } from "../client";

export type PricingRuleType =
  | "customer_delivery_fee"
  | "rider_payout"
  | "surge_pricing"
  | "discount"
  | "commission";

export type PricingRuleRow = {
  id: string;
  rule_type: string;
  service_type: string;
  level: string;
  ref_id: string;
  conditions: unknown;
  actions: unknown;
  priority: number;
  is_active: boolean;
  override: boolean;
  created_at: string;
  updated_at: string;
};

export async function listPricingRules(params: {
  level: string;
  refId: string;
  ruleType?: PricingRuleType;
  limit?: number;
  offset?: number;
}): Promise<PricingRuleRow[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(params.limit ?? 80, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  if (params.ruleType) {
    return sql<PricingRuleRow[]>`
      SELECT
        id::text AS id,
        rule_type::text AS rule_type,
        service_type::text AS service_type,
        level::text AS level,
        ref_id::text AS ref_id,
        conditions,
        actions,
        priority,
        is_active,
        override,
        created_at::text AS created_at,
        updated_at::text AS updated_at
      FROM pricing_rules
      WHERE level = ${params.level}::geo_pricing_level
        AND ref_id = ${params.refId}::uuid
        AND rule_type = ${params.ruleType}::pricing_rule_type
      ORDER BY priority DESC, updated_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }
  return sql<PricingRuleRow[]>`
    SELECT
      id::text AS id,
      rule_type::text AS rule_type,
      service_type::text AS service_type,
      level::text AS level,
      ref_id::text AS ref_id,
      conditions,
      actions,
      priority,
      is_active,
      override,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM pricing_rules
    WHERE level = ${params.level}::geo_pricing_level
      AND ref_id = ${params.refId}::uuid
    ORDER BY rule_type ASC, priority DESC, updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

export async function insertPricingRule(row: {
  ruleType: PricingRuleType;
  serviceType: "food" | "parcel" | "ride";
  level: string;
  refId: string;
  conditions: unknown;
  actions: unknown;
  priority?: number;
  isActive?: boolean;
  override?: boolean;
}): Promise<PricingRuleRow> {
  const sql = getSql();
  const [created] = await sql<PricingRuleRow[]>`
    INSERT INTO pricing_rules (
      rule_type, service_type, level, ref_id, conditions, actions, priority, is_active, override
    ) VALUES (
      ${row.ruleType}::pricing_rule_type,
      ${row.serviceType}::geo_service,
      ${row.level}::geo_pricing_level,
      ${row.refId}::uuid,
      ${JSON.stringify(row.conditions ?? {})}::jsonb,
      ${JSON.stringify(row.actions ?? {})}::jsonb,
      ${row.priority ?? 0},
      ${row.isActive ?? true},
      ${row.override ?? false}
    )
    RETURNING
      id::text AS id,
      rule_type::text AS rule_type,
      service_type::text AS service_type,
      level::text AS level,
      ref_id::text AS ref_id,
      conditions,
      actions,
      priority,
      is_active,
      override,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `;
  if (!created) throw new Error("insert_pricing_rule_failed");
  return created;
}

export async function resolvePricingRulesDb(params: {
  pincode: string;
  service: "food" | "parcel" | "ride";
  ruleType: PricingRuleType;
  context: Record<string, unknown>;
}): Promise<unknown> {
  const sql = getSql();
  const [row] = await sql<[{ pricing_rules_resolve: unknown }]>`
    SELECT pricing_rules_resolve(
      ${params.pincode.trim()},
      ${params.service}::geo_service,
      ${params.ruleType}::pricing_rule_type,
      ${JSON.stringify(params.context ?? {})}::jsonb
    ) AS pricing_rules_resolve
  `;
  return row?.pricing_rules_resolve ?? null;
}

export async function resolvePricingTotalsDb(params: {
  pincode: string;
  service: "food" | "parcel" | "ride";
  ruleType: PricingRuleType;
  context: Record<string, unknown>;
}): Promise<unknown> {
  const sql = getSql();
  const [row] = await sql<[{ pricing_rules_resolve_totals: unknown }]>`
    SELECT pricing_rules_resolve_totals(
      ${params.pincode.trim()},
      ${params.service}::geo_service,
      ${params.ruleType}::pricing_rule_type,
      ${JSON.stringify(params.context ?? {})}::jsonb
    ) AS pricing_rules_resolve_totals
  `;
  return row?.pricing_rules_resolve_totals ?? null;
}
