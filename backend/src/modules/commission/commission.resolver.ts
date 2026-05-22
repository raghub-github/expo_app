/**
 * Commission resolver — single source of truth for "what % does this store pay?"
 *
 * Priority chain (first match wins):
 *   1. Active MANUAL_OVERRIDE in merchant_store_commission_rules (highest priority wins on tie)
 *   2. Active subscription with merchant_plans.commission_benefit_active = true
 *      AND merchant_plans.commission_percent_override IS NOT NULL
 *   3. Active PROMOTIONAL rule in merchant_store_commission_rules
 *   4. Global default from store_onboarding_commission_config (singleton)
 *
 * Every caller — menu read, billing pipeline, order placement snapshot — must
 * go through this so the percent and the audit source agree across the system.
 */

import { getSql } from "../../db/client.js";
import { getCached, setCached, invalidateStore } from "./commission.cache.js";

export type CommissionSourceKind =
  | "DEFAULT"
  | "STORE_OVERRIDE"
  | "SUBSCRIPTION"
  | "PROMOTIONAL";

export type ResolvedCommission = {
  percent: number;
  sourceKind: CommissionSourceKind;
  sourceLabel: string;
  sourceRuleId: number | null;
  sourcePlanId: number | null;
  sourceSubscriptionId: number | null;
  validUntil: string | null;
  resolvedAt: string;
};

const DEFAULT_FALLBACK_PERCENT = 15;

type Opts = {
  /** Skip cache (used by admin preview / audit re-resolution). */
  bypassCache?: boolean;
};

/**
 * 42P01 = undefined_table, 42703 = undefined_column. Either means migration
 * 0226 / 0227 / 0228 hasn't been applied yet. We treat those errors as "no
 * rule found" so the resolver gracefully falls back to the global default
 * instead of 500-ing every customer menu read.
 */
function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "42P01" || code === "42703";
}

export async function resolveStoreCommission(
  storeId: number,
  opts: Opts = {},
): Promise<ResolvedCommission> {
  if (!storeId || !Number.isFinite(storeId)) {
    throw new Error(`resolveStoreCommission: invalid storeId ${storeId}`);
  }

  if (!opts.bypassCache) {
    const cached = await getCached(storeId);
    if (cached) return cached;
  }

  const sql = getSql();
  const now = new Date();
  // postgres.js Bind path on this stack rejects raw Date instances when the
  // prepared-statement metadata is inferred. Using NOW() server-side avoids
  // round-tripping the timestamp and keeps the comparison authoritative
  // against the DB clock anyway.

  // 1. MANUAL_OVERRIDE — admin-set, beats everything else.
  let manualRows: Array<{ id: number; commission_value: string; effective_to: Date | null }> = [];
  try {
    manualRows = await sql<
      Array<{ id: number; commission_value: string; effective_to: Date | null }>
    >`
      SELECT id, commission_value, effective_to
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
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    // Migration 0226 not applied — log once, skip to next priority.
    console.warn(
      "[commission] merchant_store_commission_rules missing source_kind/priority — apply 0226_commission_engine_core.sql",
    );
  }
  if (manualRows.length > 0) {
    const r = manualRows[0]!;
    const result: ResolvedCommission = {
      percent: Number(r.commission_value),
      sourceKind: "STORE_OVERRIDE",
      sourceLabel: "Store-specific override",
      sourceRuleId: Number(r.id),
      sourcePlanId: null,
      sourceSubscriptionId: null,
      validUntil: r.effective_to ? r.effective_to.toISOString() : null,
      resolvedAt: now.toISOString(),
    };
    void setCached(storeId, result);
    return result;
  }

  // 2. SUBSCRIPTION benefit — find the store's active subscription whose plan
  //    carries a commission benefit.
  let subRows: Array<{
    sub_id: number;
    plan_id: number;
    plan_name: string;
    commission_percent_override: string;
    expiry_date: Date | null;
  }> = [];
  try {
    subRows = await sql<
      Array<{
        sub_id: number;
        plan_id: number;
        plan_name: string;
        commission_percent_override: string;
        expiry_date: Date | null;
      }>
    >`
      SELECT
        ms.id   AS sub_id,
        mp.id   AS plan_id,
        mp.plan_name,
        mp.commission_percent_override,
        ms.expiry_date
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
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    console.warn(
      "[commission] merchant_plans missing commission_percent_override/commission_benefit_active — apply 0226_commission_engine_core.sql",
    );
  }
  if (subRows.length > 0) {
    const r = subRows[0]!;
    const result: ResolvedCommission = {
      percent: Number(r.commission_percent_override),
      sourceKind: "SUBSCRIPTION",
      sourceLabel: `${r.plan_name} subscription`,
      sourceRuleId: null,
      sourcePlanId: Number(r.plan_id),
      sourceSubscriptionId: Number(r.sub_id),
      validUntil: r.expiry_date ? r.expiry_date.toISOString() : null,
      resolvedAt: now.toISOString(),
    };
    void setCached(storeId, result);
    return result;
  }

  // 3. PROMOTIONAL rule — admin-applied for marketing campaigns.
  let promoRows: Array<{ id: number; commission_value: string; effective_to: Date | null }> = [];
  try {
    promoRows = await sql<
      Array<{ id: number; commission_value: string; effective_to: Date | null }>
    >`
      SELECT id, commission_value, effective_to
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
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    // Already logged above; silent here.
  }
  if (promoRows.length > 0) {
    const r = promoRows[0]!;
    const result: ResolvedCommission = {
      percent: Number(r.commission_value),
      sourceKind: "PROMOTIONAL",
      sourceLabel: "Promotional rate",
      sourceRuleId: Number(r.id),
      sourcePlanId: null,
      sourceSubscriptionId: null,
      validUntil: r.effective_to ? r.effective_to.toISOString() : null,
      resolvedAt: now.toISOString(),
    };
    void setCached(storeId, result);
    return result;
  }

  // 4. Global default — singleton row.
  const defaultPercent = await getGlobalDefaultPercent();
  const result: ResolvedCommission = {
    percent: defaultPercent,
    sourceKind: "DEFAULT",
    sourceLabel: "Platform default",
    sourceRuleId: null,
    sourcePlanId: null,
    sourceSubscriptionId: null,
    validUntil: null,
    resolvedAt: now.toISOString(),
  };
  void setCached(storeId, result);
  return result;
}

/**
 * Reads the singleton; falls back to a hard-coded constant if the row is
 * missing OR the table itself doesn't exist yet (dashboard migration 0189
 * not applied — the system should still boot and respond, just with the
 * compile-time default).
 */
export async function getGlobalDefaultPercent(): Promise<number> {
  const sql = getSql();
  try {
    const rows = await sql<Array<{ pct: string | null }>>`
      SELECT base_service_fee_percent::text AS pct
      FROM store_onboarding_commission_config
      WHERE id = 1
      LIMIT 1
    `;
    const pct = rows[0]?.pct;
    if (pct == null) return DEFAULT_FALLBACK_PERCENT;
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n >= 100) return DEFAULT_FALLBACK_PERCENT;
    return n;
  } catch (err: unknown) {
    // 42P01 = undefined_table. Anything else gets surfaced.
    if ((err as { code?: string })?.code === "42P01") return DEFAULT_FALLBACK_PERCENT;
    throw err;
  }
}

/** Wrapper so cache eviction goes through a single named export. */
export function invalidateStoreCommission(storeId: number): void {
  void invalidateStore(storeId);
}
