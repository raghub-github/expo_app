import { getSql } from "../client";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";
export type RiderPayoutServiceType = "food" | "parcel" | "ride";

/**
 * Rider Fare Engine v3.0: percentage-of-customer-fare payout rule, geo-inherited.
 * Intentionally minimal — no guardrails. Pickup/drop split is always pure
 * distance ratio; nothing here can force a fixed split.
 */
export type ServicePayoutRuleRow = {
  id: number;
  serviceType: RiderPayoutServiceType;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  riderPercentage: number;
  platformPercentage: number;
  waitingChargePerMin: number | null;
  waitingFreeMinutes: number;
  waitingMaxCharge: number | null;
  waitingFundingMode: "CUSTOMER_100" | "COMPANY_100" | "SHARED";
  waitingCustomerSharePct: number;
  waitingCompanySharePct: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRule(r: Record<string, unknown>): ServicePayoutRuleRow {
  const fundingRaw = String(r.waiting_funding_mode ?? "CUSTOMER_100").toUpperCase();
  const fundingMode =
    fundingRaw === "COMPANY_100" || fundingRaw === "SHARED"
      ? (fundingRaw as ServicePayoutRuleRow["waitingFundingMode"])
      : "CUSTOMER_100";
  return {
    id: Number(r.id),
    serviceType: String(r.service_type) as RiderPayoutServiceType,
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    riderPercentage: Number(r.rider_percentage),
    platformPercentage: Number(r.platform_percentage),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    waitingFreeMinutes: Number(r.waiting_free_minutes ?? 2),
    waitingMaxCharge: r.waiting_max_charge == null ? null : Number(r.waiting_max_charge),
    waitingFundingMode: fundingMode,
    waitingCustomerSharePct: Number(r.waiting_customer_share_pct ?? 100),
    waitingCompanySharePct: Number(r.waiting_company_share_pct ?? 0),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

async function findEffectiveNode(
  level: GeoHierarchyLevel,
  refId: string,
  existsSql: (stepLevel: string, stepId: string) => Promise<boolean>
): Promise<{ level: string; refId: string } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    if (await existsSql(step.step_level, step.step_id)) return { level: step.step_level, refId: step.step_id };
  }
  return null;
}

/** Rules defined directly at this exact geo node (no inheritance) — for the admin list/editor. */
export async function listServicePayoutRules(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
}): Promise<ServicePayoutRuleRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM service_payout_rules
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND service_type = ${args.service} AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRule(r as Record<string, unknown>));
}

export async function getServicePayoutRuleById(id: number): Promise<ServicePayoutRuleRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM service_payout_rules WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRule(row) : null;
}

/** Nearest-ancestor effective rule (active + within effective window), matching runtime resolution. */
export async function getEffectiveServicePayoutRule(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
}): Promise<{ applied: { level: string; refId: string } | null; rule: ServicePayoutRuleRow | null }> {
  const sql = getSql();
  const applied = await findEffectiveNode(args.level, args.refId, async (l, id) => {
    const rows = await sql`
      SELECT 1 FROM service_payout_rules
      WHERE geo_level = ${l}::geo_pricing_level AND geo_ref_id = ${id}::uuid
        AND service_type = ${args.service} AND is_active = true AND deleted_at IS NULL
        AND (effective_from IS NULL OR effective_from <= now())
        AND (effective_to IS NULL OR effective_to >= now())
      LIMIT 1
    `;
    return (Array.isArray(rows) ? rows : []).length > 0;
  });
  if (!applied) return { applied: null, rule: null };
  const rows = await sql`
    SELECT * FROM service_payout_rules
    WHERE geo_level = ${applied.level}::geo_pricing_level AND geo_ref_id = ${applied.refId}::uuid
      AND service_type = ${args.service} AND is_active = true AND deleted_at IS NULL
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to >= now())
    ORDER BY priority DESC, id ASC
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return { applied, rule: row ? mapRule(row) : null };
}

export type ServicePayoutRuleInput = {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  riderPercentage: number;
  platformPercentage: number;
  waitingChargePerMin: number | null;
  waitingFreeMinutes: number;
  waitingMaxCharge?: number | null;
  waitingFundingMode?: "CUSTOMER_100" | "COMPANY_100" | "SHARED";
  waitingCustomerSharePct?: number;
  waitingCompanySharePct?: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export async function insertServicePayoutRule(args: ServicePayoutRuleInput): Promise<ServicePayoutRuleRow> {
  const sql = getSql();
  const funding = args.waitingFundingMode ?? "CUSTOMER_100";
  const rows = await sql`
    INSERT INTO service_payout_rules (
      service_type, geo_level, geo_ref_id, rider_percentage, platform_percentage,
      waiting_charge_per_min, waiting_free_minutes,
      waiting_max_charge, waiting_funding_mode,
      waiting_customer_share_pct, waiting_company_share_pct,
      priority, is_active, effective_from, effective_to
    ) VALUES (
      ${args.service}, ${args.level}::geo_pricing_level, ${args.refId}::uuid,
      ${args.riderPercentage}, ${args.platformPercentage},
      ${args.waitingChargePerMin}, ${args.waitingFreeMinutes},
      ${args.waitingMaxCharge ?? null}, ${funding},
      ${args.waitingCustomerSharePct ?? 100}, ${args.waitingCompanySharePct ?? 0},
      ${args.priority}, ${args.isActive}, ${args.effectiveFrom}, ${args.effectiveTo}
    ) RETURNING *
  `;
  return mapRule((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

export async function updateServicePayoutRule(
  id: number,
  patch: Omit<ServicePayoutRuleInput, "level" | "refId" | "service">
): Promise<ServicePayoutRuleRow | null> {
  const sql = getSql();
  const funding = patch.waitingFundingMode ?? "CUSTOMER_100";
  const rows = await sql`
    UPDATE service_payout_rules SET
      rider_percentage = ${patch.riderPercentage},
      platform_percentage = ${patch.platformPercentage},
      waiting_charge_per_min = ${patch.waitingChargePerMin},
      waiting_free_minutes = ${patch.waitingFreeMinutes},
      waiting_max_charge = ${patch.waitingMaxCharge ?? null},
      waiting_funding_mode = ${funding},
      waiting_customer_share_pct = ${patch.waitingCustomerSharePct ?? 100},
      waiting_company_share_pct = ${patch.waitingCompanySharePct ?? 0},
      priority = ${patch.priority},
      is_active = ${patch.isActive},
      effective_from = ${patch.effectiveFrom},
      effective_to = ${patch.effectiveTo},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRule(row) : null;
}

export async function softDeleteServicePayoutRule(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE service_payout_rules SET deleted_at = now(), updated_at = now(), is_active = false
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
