/**
 * Super Admin referral engine DB operations.
 */

import { getSql } from "../client";
import { getRedisClient } from "../../redis";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function publishReferralConfigUpdated(version: number): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis) return;
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    await redis.publish(
      "config:referral",
      JSON.stringify({
        type: "referral_config_updated",
        configVersion: version,
        at: new Date().toISOString(),
      }),
    );
  } catch {
    /* tolerated */
  }
}

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "bigint") out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

export async function isReferralEngineMigrated(): Promise<boolean> {
  const sql = getSql();
  try {
    const [row] = await sql<Array<{ ok: string }>>`
      SELECT 1::text AS ok FROM referral_settings WHERE id = 1 LIMIT 1
    `;
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function getReferralSettingsAdmin() {
  const sql = getSql();
  const [row] = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM referral_settings WHERE id = 1 LIMIT 1
  `;
  return row ? serialize(row) : null;
}

export function publicReferralFlagFromSettings(
  settings: Record<string, unknown> | null,
  userType: "customer" | "rider" | "merchant"
): { referralEnabled: boolean; configVersion: number } {
  if (!settings) return { referralEnabled: false, configVersion: 0 };
  const masterOn = settings.enabled === true;
  const configVersion = num(settings.config_version, 0);
  const audienceOn =
    userType === "customer"
      ? settings.customer_referral_enabled === true
      : userType === "rider"
        ? settings.rider_referral_enabled === true
        : settings.merchant_referral_enabled === true;
  return { referralEnabled: masterOn && audienceOn, configVersion };
}

export async function listReferralRewardRulesAdmin(userType?: "customer" | "rider" | "merchant") {
  const sql = getSql();
  if (userType) {
    const rows = await sql<Array<Record<string, unknown>>>`
      SELECT * FROM referral_reward_rules
      WHERE user_type = ${userType}::referral_user_type
      ORDER BY priority ASC, milestone_orders ASC, id ASC
    `;
    return rows.map(serialize);
  }
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM referral_reward_rules
    ORDER BY user_type ASC, priority ASC, milestone_orders ASC, id ASC
  `;
  return rows.map(serialize);
}

export type ReferralSettingsPatch = {
  enabled?: boolean;
  reward_enabled?: boolean;
  customer_referral_enabled?: boolean;
  rider_referral_enabled?: boolean;
  customer_reward_enabled?: boolean;
  rider_reward_enabled?: boolean;
  merchant_referral_enabled?: boolean;
  merchant_reward_enabled?: boolean;
  auto_apply_enabled?: boolean;
  require_kyc?: boolean;
  first_order_only?: boolean;
  min_order_amount?: number;
  monthly_reward_cap?: number;
  currency?: string;
  eligible_services?: string[];
  fraud_checks?: Record<string, unknown>;
  deep_link?: Record<string, unknown>;
  notification_templates?: Record<string, unknown>;
  /** Migration 0471 fields — ignored when columns are absent. */
  referral_validity_days?: number;
  reward_expiry_days?: number;
  reward_claim_window_days?: number;
  code_prefix_customer?: string;
  code_prefix_rider?: string;
  code_prefix_merchant?: string;
  reward_mode?: "incremental" | "highest_only";
  referral_expiry_enabled?: boolean;
  max_successful_referrals?: number | null;
  campaign_budget?: number | null;
  merchant_qualification_scope?: "ALL_CHILD_STORES" | "SINGLE_STORE" | "SELECTED_STORES";
  merchant_qualification_store_ids?: number[];
};

async function bumpConfigVersion(sql: ReturnType<typeof getSql>): Promise<number> {
  let version = 1;
  try {
    const [row] = await sql<Array<{ v: string }>>`
      SELECT public.bump_referral_config_version()::text AS v
    `;
    version = num(row?.v, 1);
  } catch {
    const [row] = await sql<Array<{ v: string }>>`
      UPDATE referral_settings
      SET config_version = config_version + 1, updated_at = NOW()
      WHERE id = 1
      RETURNING config_version::text AS v
    `;
    version = num(row?.v, 1);
  }
  await publishReferralConfigUpdated(version);
  return version;
}

export async function writeReferralAudit(opts: {
  adminId?: number | null;
  adminEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO referral_configuration_audit (
      admin_id, admin_email, action, entity_type, entity_id,
      old_value, new_value, reason, ip_address, user_agent
    ) VALUES (
      ${opts.adminId ?? null},
      ${opts.adminEmail ?? null},
      ${opts.action},
      ${opts.entityType},
      ${opts.entityId ?? null},
      ${JSON.stringify(opts.oldValue ?? null)}::jsonb,
      ${JSON.stringify(opts.newValue ?? null)}::jsonb,
      ${opts.reason ?? null},
      ${opts.ip ?? null},
      ${opts.userAgent ?? null}
    )
  `.catch(() => undefined);
}

export async function updateReferralSettingsAdmin(
  patch: ReferralSettingsPatch,
  audit?: {
    adminId?: number | null;
    adminEmail?: string | null;
    reason?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  const sql = getSql();
  const before = await getReferralSettingsAdmin();
  await sql`
    UPDATE referral_settings SET
      enabled = COALESCE(${patch.enabled ?? null}, enabled),
      reward_enabled = COALESCE(${patch.reward_enabled ?? null}, reward_enabled),
      customer_referral_enabled = COALESCE(${patch.customer_referral_enabled ?? null}, customer_referral_enabled),
      rider_referral_enabled = COALESCE(${patch.rider_referral_enabled ?? null}, rider_referral_enabled),
      customer_reward_enabled = COALESCE(${patch.customer_reward_enabled ?? null}, customer_reward_enabled),
      rider_reward_enabled = COALESCE(${patch.rider_reward_enabled ?? null}, rider_reward_enabled),
      auto_apply_enabled = COALESCE(${patch.auto_apply_enabled ?? null}, auto_apply_enabled),
      require_kyc = COALESCE(${patch.require_kyc ?? null}, require_kyc),
      first_order_only = COALESCE(${patch.first_order_only ?? null}, first_order_only),
      min_order_amount = COALESCE(${patch.min_order_amount ?? null}, min_order_amount),
      monthly_reward_cap = COALESCE(${patch.monthly_reward_cap ?? null}, monthly_reward_cap),
      currency = COALESCE(${patch.currency ?? null}, currency),
      eligible_services = COALESCE(${patch.eligible_services ?? null}, eligible_services),
      fraud_checks = COALESCE(${patch.fraud_checks ? JSON.stringify(patch.fraud_checks) : null}::jsonb, fraud_checks),
      deep_link = COALESCE(${patch.deep_link ? JSON.stringify(patch.deep_link) : null}::jsonb, deep_link),
      notification_templates = COALESCE(${
        patch.notification_templates ? JSON.stringify(patch.notification_templates) : null
      }::jsonb, notification_templates),
      updated_at = NOW()
    WHERE id = 1
  `;

  // 0471 hardening columns — best-effort so 0470-only DBs still save core settings.
  if (
    patch.referral_validity_days != null ||
    patch.reward_expiry_days != null ||
    patch.reward_claim_window_days != null ||
    patch.code_prefix_customer != null ||
    patch.code_prefix_rider != null
  ) {
    await sql`
      UPDATE referral_settings SET
        referral_validity_days = COALESCE(${patch.referral_validity_days ?? null}, referral_validity_days),
        reward_expiry_days = COALESCE(${patch.reward_expiry_days ?? null}, reward_expiry_days),
        reward_claim_window_days = COALESCE(${patch.reward_claim_window_days ?? null}, reward_claim_window_days),
        code_prefix_customer = COALESCE(${patch.code_prefix_customer ?? null}, code_prefix_customer),
        code_prefix_rider = COALESCE(${patch.code_prefix_rider ?? null}, code_prefix_rider),
        updated_at = NOW()
      WHERE id = 1
    `.catch(() => undefined);
  }

  // 0536 merchant + reward_mode — best-effort so pre-0536 DBs still save core settings.
  if (
    patch.merchant_referral_enabled != null ||
    patch.merchant_reward_enabled != null ||
    patch.code_prefix_merchant != null ||
    patch.reward_mode != null ||
    patch.referral_expiry_enabled != null ||
    patch.max_successful_referrals !== undefined ||
    patch.campaign_budget !== undefined
  ) {
    await sql`
      UPDATE referral_settings SET
        merchant_referral_enabled = COALESCE(${patch.merchant_referral_enabled ?? null}, merchant_referral_enabled),
        merchant_reward_enabled = COALESCE(${patch.merchant_reward_enabled ?? null}, merchant_reward_enabled),
        code_prefix_merchant = COALESCE(${patch.code_prefix_merchant ?? null}, code_prefix_merchant),
        reward_mode = COALESCE(${patch.reward_mode ?? null}, reward_mode),
        referral_expiry_enabled = COALESCE(${patch.referral_expiry_enabled ?? null}, referral_expiry_enabled),
        max_successful_referrals = ${
          patch.max_successful_referrals === undefined
            ? sql`max_successful_referrals`
            : patch.max_successful_referrals
        },
        campaign_budget = ${
          patch.campaign_budget === undefined ? sql`campaign_budget` : patch.campaign_budget
        },
        updated_at = NOW()
      WHERE id = 1
    `.catch(() => undefined);
  }

  if (
    patch.merchant_qualification_scope != null ||
    patch.merchant_qualification_store_ids !== undefined
  ) {
    const scope = patch.merchant_qualification_scope ?? null;
    if (patch.merchant_qualification_store_ids !== undefined) {
      const storeIds = patch.merchant_qualification_store_ids;
      await sql`
        UPDATE referral_settings SET
          merchant_qualification_scope = COALESCE(${scope}, merchant_qualification_scope),
          merchant_qualification_store_ids = ${storeIds}::bigint[],
          updated_at = NOW()
        WHERE id = 1
      `.catch(() => undefined);
    } else {
      await sql`
        UPDATE referral_settings SET
          merchant_qualification_scope = COALESCE(${scope}, merchant_qualification_scope),
          updated_at = NOW()
        WHERE id = 1
      `.catch(() => undefined);
    }
  }

  const version = await bumpConfigVersion(sql);
  const after = await getReferralSettingsAdmin();
  await writeReferralAudit({
    adminId: audit?.adminId,
    adminEmail: audit?.adminEmail,
    action: "settings.update",
    entityType: "referral_settings",
    entityId: "1",
    oldValue: before,
    newValue: after,
    reason: audit?.reason,
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });
  return { settings: after, configVersion: version };
}

export type RewardRuleInput = {
  user_type: "customer" | "rider" | "merchant";
  rule_code: string;
  name: string;
  description?: string | null;
  milestone_orders: number;
  reward_amount: number;
  reward_type: "GATICASH" | "WALLET_CREDIT";
  reward_party?: "referrer" | "referred";
  also_credit_referred?: boolean;
  referred_reward_amount?: number | null;
  require_kyc?: boolean | null;
  min_order_amount?: number | null;
  active?: boolean;
  priority?: number;
  event_type?: string | null;
  reward_mode?: "incremental" | "highest_only" | null;
};

export async function createReferralRewardRuleAdmin(
  input: RewardRuleInput,
  audit?: {
    adminId?: number | null;
    adminEmail?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  if (input.user_type === "customer" && input.reward_type !== "GATICASH") {
    throw new Error("Customer rewards must be GATICASH");
  }
  if ((input.user_type === "rider" || input.user_type === "merchant") && input.reward_type !== "WALLET_CREDIT") {
    throw new Error("Rider and merchant rewards must be WALLET_CREDIT");
  }
  const sql = getSql();
  const [row] = await sql<Array<Record<string, unknown>>>`
    INSERT INTO referral_reward_rules (
      user_type, rule_code, name, description, milestone_orders,
      reward_amount, reward_type, reward_party, also_credit_referred,
      referred_reward_amount, require_kyc, min_order_amount, active, priority
    ) VALUES (
      ${input.user_type}::referral_user_type,
      ${input.rule_code.trim().toUpperCase()},
      ${input.name},
      ${input.description ?? null},
      ${input.milestone_orders},
      ${input.reward_amount},
      ${input.reward_type}::referral_reward_type,
      ${(input.reward_party ?? "referrer")}::referral_reward_party,
      ${input.also_credit_referred ?? false},
      ${input.referred_reward_amount ?? null},
      ${input.require_kyc ?? null},
      ${input.min_order_amount ?? null},
      ${input.active ?? true},
      ${input.priority ?? 100}
    )
    RETURNING *
  `;
  // 0536 event_type / reward_mode — best-effort so pre-0536 DBs still create rules.
  if (row?.id && (input.event_type || input.reward_mode)) {
    await sql`
      UPDATE referral_reward_rules SET
        event_type = COALESCE(${input.event_type ?? null}::referral_rule_event_type, event_type),
        reward_mode = COALESCE(${input.reward_mode ?? null}, reward_mode),
        updated_at = NOW()
      WHERE id = ${Number(row.id)}
    `.catch(() => undefined);
  }
  const version = await bumpConfigVersion(sql);
  await writeReferralAudit({
    adminId: audit?.adminId,
    adminEmail: audit?.adminEmail,
    action: "rule.create",
    entityType: "referral_reward_rules",
    entityId: String(row.id),
    newValue: serialize(row),
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });
  return { rule: serialize(row), configVersion: version };
}

export async function updateReferralRewardRuleAdmin(
  id: number,
  input: Partial<RewardRuleInput> & { active?: boolean },
  audit?: {
    adminId?: number | null;
    adminEmail?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  const sql = getSql();
  const [before] = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM referral_reward_rules WHERE id = ${id} LIMIT 1
  `;
  if (!before) throw new Error("Rule not found");

  const userType = (input.user_type ?? before.user_type) as string;
  const rewardType = (input.reward_type ?? before.reward_type) as string;
  if (userType === "customer" && rewardType !== "GATICASH") {
    throw new Error("Customer rewards must be GATICASH");
  }
  if ((userType === "rider" || userType === "merchant") && rewardType !== "WALLET_CREDIT") {
    throw new Error("Rider and merchant rewards must be WALLET_CREDIT");
  }

  const [row] = await sql<Array<Record<string, unknown>>>`
    UPDATE referral_reward_rules SET
      name = COALESCE(${input.name ?? null}, name),
      description = COALESCE(${input.description ?? null}, description),
      milestone_orders = COALESCE(${input.milestone_orders ?? null}, milestone_orders),
      reward_amount = COALESCE(${input.reward_amount ?? null}, reward_amount),
      reward_type = COALESCE(${input.reward_type ?? null}::referral_reward_type, reward_type),
      reward_party = COALESCE(${input.reward_party ?? null}::referral_reward_party, reward_party),
      also_credit_referred = COALESCE(${input.also_credit_referred ?? null}, also_credit_referred),
      referred_reward_amount = COALESCE(${input.referred_reward_amount ?? null}, referred_reward_amount),
      require_kyc = COALESCE(${input.require_kyc ?? null}, require_kyc),
      min_order_amount = COALESCE(${input.min_order_amount ?? null}, min_order_amount),
      active = COALESCE(${input.active ?? null}, active),
      priority = COALESCE(${input.priority ?? null}, priority),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (input.event_type != null || input.reward_mode !== undefined) {
    await sql`
      UPDATE referral_reward_rules SET
        event_type = COALESCE(${input.event_type ?? null}::referral_rule_event_type, event_type),
        reward_mode = COALESCE(${input.reward_mode ?? null}, reward_mode),
        updated_at = NOW()
      WHERE id = ${id}
    `.catch(() => undefined);
  }
  const version = await bumpConfigVersion(sql);
  await writeReferralAudit({
    adminId: audit?.adminId,
    adminEmail: audit?.adminEmail,
    action: "rule.update",
    entityType: "referral_reward_rules",
    entityId: String(id),
    oldValue: serialize(before),
    newValue: serialize(row),
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });
  return { rule: serialize(row), configVersion: version };
}

export async function deleteReferralRewardRuleAdmin(
  id: number,
  audit?: {
    adminId?: number | null;
    adminEmail?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  const sql = getSql();
  const [before] = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM referral_reward_rules WHERE id = ${id} LIMIT 1
  `;
  if (!before) throw new Error("Rule not found");
  await sql`DELETE FROM referral_reward_rules WHERE id = ${id}`;
  const version = await bumpConfigVersion(sql);
  await writeReferralAudit({
    adminId: audit?.adminId,
    adminEmail: audit?.adminEmail,
    action: "rule.delete",
    entityType: "referral_reward_rules",
    entityId: String(id),
    oldValue: serialize(before),
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });
  return { configVersion: version };
}

export async function getReferralAnalyticsAdmin() {
  const sql = getSql();
  const [totals] = await sql<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)::int AS total_referrals,
      COUNT(*) FILTER (WHERE status = 'reward_credited' OR lifecycle_state IN ('REWARD_GRANTED','REWARD_NOTIFIED'))::int AS successful,
      COUNT(*) FILTER (WHERE status IN ('pending','first_order_pending','milestone_pending')
        OR lifecycle_state IN ('REFERRAL_APPLIED','FIRST_ORDER_PLACED','ORDER_DELIVERED','REWARD_ELIGIBLE'))::int AS pending,
      COUNT(*) FILTER (WHERE status IN ('fraud_blocked','cancelled')
        OR lifecycle_state IN ('FRAUD_BLOCKED','REWARD_FAILED','EXPIRED'))::int AS failed,
      COUNT(*) FILTER (WHERE user_type = 'customer')::int AS customer_referrals,
      COUNT(*) FILTER (WHERE user_type = 'rider')::int AS rider_referrals,
      COUNT(*) FILTER (WHERE user_type = 'merchant')::int AS merchant_referrals,
      COUNT(*) FILTER (WHERE status::text IN ('expired') OR lifecycle_state::text = 'EXPIRED')::int AS expired_referrals
    FROM referral_relationships
  `.catch((): Array<Record<string, unknown>> => [{}]);

  const [rewards] = await sql<Array<Record<string, unknown>>>`
    SELECT
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'credited'), 0)::float AS reward_distributed,
      COUNT(*) FILTER (WHERE status = 'credited')::int AS reward_count,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'credited' AND reward_party = 'referrer'), 0)::float AS referrer_reward_amount,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'credited' AND reward_party = 'referred'), 0)::float AS referred_reward_amount,
      COUNT(*) FILTER (WHERE status = 'credited' AND reward_party = 'referrer')::int AS referrer_reward_count,
      COUNT(*) FILTER (WHERE status = 'credited' AND reward_party = 'referred')::int AS referred_reward_count
    FROM referral_reward_transactions
  `.catch((): Array<Record<string, unknown>> => [{}]);

  const [funnel] = await sql<Array<Record<string, unknown>>>`
    SELECT
      COALESCE(SUM(links_shared),0)::int AS links_shared,
      COALESCE(SUM(link_clicks),0)::int AS link_clicks,
      COALESCE(SUM(play_store_opens),0)::int AS play_store_opens,
      COALESCE(SUM(installs),0)::int AS installs,
      COALESCE(SUM(first_app_opens),0)::int AS first_app_opens,
      COALESCE(SUM(referrals_applied),0)::int AS referrals_applied,
      COALESCE(SUM(first_orders),0)::int AS first_orders,
      COALESCE(SUM(delivered_orders),0)::int AS delivered_orders,
      COALESCE(SUM(rewards_granted),0)::int AS rewards_granted
    FROM referral_funnel_daily
    WHERE day >= CURRENT_DATE - INTERVAL '30 days'
  `.catch((): Array<Record<string, unknown>> => [{}]);

  const topReferrers = await sql<Array<Record<string, unknown>>>`
    SELECT referrer_id, user_type::text AS user_type, COUNT(*)::int AS referral_count,
      COUNT(*) FILTER (WHERE status = 'reward_credited')::int AS successful_count
    FROM referral_relationships
    GROUP BY referrer_id, user_type
    ORDER BY successful_count DESC, referral_count DESC
    LIMIT 10
  `.catch(() => []);

  const monthly = await sql<Array<Record<string, unknown>>>`
    SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*)::int AS referrals
    FROM referral_relationships
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY 1
    ORDER BY 1 ASC
  `.catch(() => []);

  const jobs = await sql<Array<Record<string, unknown>>>`
    SELECT id, job_key, status::text AS status, attempts, last_error, reward_amount, created_at
    FROM referral_reward_jobs
    WHERE status IN ('failed','retrying','dead','queued')
    ORDER BY updated_at DESC
    LIMIT 30
  `.catch(() => []);

  const merchantParents = await sql<Array<Record<string, unknown>>>`
    SELECT
      rr.id::text AS id,
      rr.status::text AS status,
      rr.reward_status,
      rr.completed_orders,
      COALESCE(ref.brand_name, ref.parent_name, ref.owner_name) AS referrer_parent,
      COALESCE(ree.brand_name, ree.parent_name, ree.owner_name) AS referred_parent,
      (
        SELECT COUNT(*)::int FROM merchant_stores ms
        WHERE ms.parent_id = rr.referred_user_id AND ms.deleted_at IS NULL
      ) AS child_store_count
    FROM referral_relationships rr
    LEFT JOIN merchant_parents ref ON ref.id = rr.referrer_id
    LEFT JOIN merchant_parents ree ON ree.id = rr.referred_user_id
    WHERE rr.user_type = 'merchant'::referral_user_type
    ORDER BY rr.updated_at DESC
    LIMIT 25
  `.catch(() => []);

  const total = num(totals?.total_referrals);
  const [budgetRow] = await sql<Array<{ campaign_budget: string | null }>>`
    SELECT campaign_budget::text FROM referral_settings ORDER BY id ASC LIMIT 1
  `.catch((): Array<{ campaign_budget: string | null }> => [{ campaign_budget: null }]);

  const successful = num(totals?.successful);
  const consumed = num(rewards?.reward_distributed);
  const campaignBudget =
    budgetRow?.campaign_budget != null && budgetRow.campaign_budget !== ""
      ? num(budgetRow.campaign_budget)
      : null;
  const remaining =
    campaignBudget != null ? Math.max(0, campaignBudget - consumed) : null;
  return {
    totals: {
      totalReferrals: total,
      successful,
      pending: num(totals?.pending),
      failed: num(totals?.failed),
      customerReferrals: num(totals?.customer_referrals),
      riderReferrals: num(totals?.rider_referrals),
      merchantReferrals: num(totals?.merchant_referrals),
      expiredReferrals: num(totals?.expired_referrals),
      rewardDistributed: consumed,
      rewardCount: num(rewards?.reward_count),
      referrerRewardAmount: num(rewards?.referrer_reward_amount),
      referredRewardAmount: num(rewards?.referred_reward_amount),
      referrerRewardCount: num(rewards?.referrer_reward_count),
      referredRewardCount: num(rewards?.referred_reward_count),
      conversionRate: total > 0 ? Math.round((successful / total) * 1000) / 10 : 0,
      campaignBudget,
      campaignBudgetConsumed: consumed,
      campaignBudgetRemaining: remaining,
      campaignBudgetExhausted: remaining != null && remaining <= 0,
    },
    funnel: serialize(funnel ?? {}),
    topReferrers: topReferrers.map(serialize),
    monthlyTrend: monthly.map(serialize),
    rewardJobs: jobs.map(serialize),
    merchantParents: merchantParents.map(serialize),
  };
}

export async function listReferralAuditAdmin(limit = 50) {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM referral_configuration_audit
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 200)}
  `.catch(() => []);
  return rows.map(serialize);
}

/** Enqueue merchant STORE_APPROVED reward jobs. Backend poller credits wallets. */
export async function triggerMerchantReferralOnStoreApproved(parentId: number): Promise<void> {
  if (!Number.isFinite(parentId) || parentId <= 0) return;
  const sql = getSql();
  try {
    const [rel] = await sql<Array<{
      id: string;
      referrer_id: string;
      referred_user_id: string;
      referral_code: string | null;
      campaign_id: string | null;
    }>>`
      SELECT id::text, referrer_id::text, referred_user_id::text, referral_code, campaign_id::text
      FROM referral_relationships
      WHERE user_type = 'merchant'::referral_user_type
        AND referred_user_id = ${parentId}
        AND status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')
      LIMIT 1
    `;
    if (!rel) return;

    await sql`
      UPDATE referral_relationships
      SET kyc_approved = true, updated_at = NOW()
      WHERE id = ${Number(rel.id)}
    `;

    const rules = await sql<Array<Record<string, unknown>>>`
      SELECT id, reward_amount, referred_reward_amount, also_credit_referred, reward_type, rule_code
      FROM referral_reward_rules
      WHERE user_type = 'merchant'::referral_user_type
        AND active = true
        AND event_type::text IN ('STORE_APPROVED', 'KYC_APPROVED')
    `;

    for (const rule of rules) {
      const ruleId = Number(rule.id);
      const referrerAmt = Number(rule.reward_amount ?? 0);
      const parties: Array<{ party: "referrer" | "referred"; amount: number; beneficiary: number }> = [
        { party: "referrer", amount: referrerAmt, beneficiary: Number(rel.referrer_id) },
      ];
      if (rule.also_credit_referred) {
        parties.push({
          party: "referred",
          amount: Number(rule.referred_reward_amount ?? rule.reward_amount ?? 0),
          beneficiary: Number(rel.referred_user_id),
        });
      }
      for (const p of parties) {
        if (!(p.amount > 0)) continue;
        const jobKey = `ref_job_${rel.id}_rule_${ruleId}_${p.party}`;
        await sql`
          INSERT INTO referral_reward_jobs (
            job_key, referral_relationship_id, reward_rule_id, campaign_id,
            user_type, beneficiary_user_id, reward_party, reward_amount, reward_type,
            status, metadata
          ) VALUES (
            ${jobKey},
            ${Number(rel.id)},
            ${ruleId},
            ${rel.campaign_id ? Number(rel.campaign_id) : null},
            'merchant'::referral_user_type,
            ${p.beneficiary},
            ${p.party}::referral_reward_party,
            ${p.amount},
            'WALLET_CREDIT'::referral_reward_type,
            'queued'::referral_reward_job_status,
            ${JSON.stringify({
              referralCode: rel.referral_code,
              referrerId: Number(rel.referrer_id),
              referredUserId: Number(rel.referred_user_id),
              ruleCode: String(rule.rule_code ?? ""),
              eventType: "STORE_APPROVED",
            })}::jsonb
          )
          ON CONFLICT (job_key) DO NOTHING
        `;
      }
    }
  } catch {
    /* pre-0536 DBs or missing tables — ignore */
  }
}

