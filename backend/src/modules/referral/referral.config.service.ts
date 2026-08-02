/**
 * Referral configuration service — DB-driven, cached, versioned.
 * Super Admin changes bump config_version and invalidate cache immediately.
 */

import { getSql } from "../../db/client.js";
import { publish } from "@gatimitra/redis";
import { buildReferralRewardSummary } from "./referral.reward-summary.js";

export type ReferralUserType = "customer" | "rider";
export type ReferralRewardType = "GATICASH" | "WALLET_CREDIT";
export type ReferralRewardParty = "referrer" | "referred";

export type ReferralFraudChecks = {
  block_self_referral: boolean;
  block_same_phone: boolean;
  block_same_device: boolean;
  block_duplicate_reward: boolean;
  require_delivered_status: boolean;
  block_cancelled: boolean;
  block_refunded: boolean;
  block_returned: boolean;
};

export type ReferralDeepLinkConfig = {
  customer_path_prefix: string;
  customer_invite_prefix: string;
  rider_path_prefix: string;
  play_store_customer_package: string;
  play_store_rider_package: string;
  referrer_prefix: string;
};

export type ReferralNotificationTemplates = {
  customer_reward: { title: string; body: string };
  customer_referrer: { title: string; body: string };
  rider_milestone: { title: string; body: string };
};

export type ReferralSettings = {
  id: number;
  enabled: boolean;
  reward_enabled: boolean;
  customer_referral_enabled: boolean;
  rider_referral_enabled: boolean;
  customer_reward_enabled: boolean;
  rider_reward_enabled: boolean;
  auto_apply_enabled: boolean;
  require_kyc: boolean;
  first_order_only: boolean;
  min_order_amount: number;
  monthly_reward_cap: number;
  currency: string;
  eligible_services: string[];
  fraud_checks: ReferralFraudChecks;
  deep_link: ReferralDeepLinkConfig;
  notification_templates: ReferralNotificationTemplates;
  /** Added by migration 0471; optional so pre-0471 databases still typecheck. */
  referral_validity_days?: number;
  reward_expiry_days?: number;
  reward_claim_window_days?: number;
  code_prefix_customer?: string;
  code_prefix_rider?: string;
  advanced_fraud?: Record<string, unknown>;
  config_version: number;
  updated_at: string;
};

export type ReferralRewardRule = {
  id: number;
  user_type: ReferralUserType;
  rule_code: string;
  name: string;
  description: string | null;
  milestone_orders: number;
  reward_amount: number;
  reward_type: ReferralRewardType;
  reward_party: ReferralRewardParty;
  also_credit_referred: boolean;
  referred_reward_amount: number | null;
  require_kyc: boolean | null;
  min_order_amount: number | null;
  active: boolean;
  priority: number;
  metadata: Record<string, unknown>;
};

type CacheEntry = { at: number; settings: ReferralSettings; rules: ReferralRewardRule[] };

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

const DEFAULT_FRAUD: ReferralFraudChecks = {
  block_self_referral: true,
  block_same_phone: true,
  block_same_device: true,
  block_duplicate_reward: true,
  require_delivered_status: true,
  block_cancelled: true,
  block_refunded: true,
  block_returned: true,
};

const DEFAULT_DEEP_LINK: ReferralDeepLinkConfig = {
  customer_path_prefix: "/ref",
  customer_invite_prefix: "/invite",
  rider_path_prefix: "/rider-ref",
  play_store_customer_package: "com.gatimitra.customer",
  // Must match apps/gatimitra-riderApp/app.config.js android.package, otherwise
  // the referral landing points at a Play listing that does not exist.
  play_store_rider_package: "com.raghubhunia.gatimitrariderapp",
  referrer_prefix: "ref_",
};

const DEFAULT_TEMPLATES: ReferralNotificationTemplates = {
  customer_reward: {
    title: "Referral Reward Received",
    body: "₹{{amount}} GatiCash has been credited to your GatiCash wallet. Use it on your next GatiMitra order.",
  },
  customer_referrer: {
    title: "Referral Successful",
    body: "Your friend completed their first order. ₹{{amount}} GatiCash has been credited.",
  },
  rider_milestone: {
    title: "Referral Milestone Achieved",
    body: "₹{{amount}} has been credited to your Rider Wallet. You can withdraw this amount with your next withdrawal request.",
  },
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function mapSettings(row: Record<string, unknown>): ReferralSettings {
  const fraud = { ...DEFAULT_FRAUD, ...asObject(row.fraud_checks) } as ReferralFraudChecks;
  const deep = { ...DEFAULT_DEEP_LINK, ...asObject(row.deep_link) } as ReferralDeepLinkConfig;
  const templatesRaw = asObject(row.notification_templates);
  const templates: ReferralNotificationTemplates = {
    customer_reward: {
      ...DEFAULT_TEMPLATES.customer_reward,
      ...(asObject(templatesRaw.customer_reward) as { title?: string; body?: string }),
    },
    customer_referrer: {
      ...DEFAULT_TEMPLATES.customer_referrer,
      ...(asObject(templatesRaw.customer_referrer) as { title?: string; body?: string }),
    },
    rider_milestone: {
      ...DEFAULT_TEMPLATES.rider_milestone,
      ...(asObject(templatesRaw.rider_milestone) as { title?: string; body?: string }),
    },
  };
  const services = Array.isArray(row.eligible_services)
    ? (row.eligible_services as string[])
    : ["food", "parcel", "grocery"];

  return {
    id: 1,
    enabled: Boolean(row.enabled),
    reward_enabled: Boolean(row.reward_enabled),
    customer_referral_enabled: Boolean(row.customer_referral_enabled),
    rider_referral_enabled: Boolean(row.rider_referral_enabled),
    customer_reward_enabled: Boolean(row.customer_reward_enabled),
    rider_reward_enabled: Boolean(row.rider_reward_enabled),
    auto_apply_enabled: Boolean(row.auto_apply_enabled),
    require_kyc: Boolean(row.require_kyc),
    first_order_only: Boolean(row.first_order_only),
    min_order_amount: num(row.min_order_amount, 249),
    monthly_reward_cap: num(row.monthly_reward_cap, 1000),
    currency: String(row.currency ?? "INR"),
    eligible_services: services,
    fraud_checks: fraud,
    deep_link: deep,
    notification_templates: templates,
    config_version: num(row.config_version, 1),
    updated_at: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
  };
}

function mapRule(row: Record<string, unknown>): ReferralRewardRule {
  return {
    id: num(row.id),
    user_type: row.user_type as ReferralUserType,
    rule_code: String(row.rule_code),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    milestone_orders: num(row.milestone_orders, 1),
    reward_amount: num(row.reward_amount),
    reward_type: row.reward_type as ReferralRewardType,
    reward_party: (row.reward_party as ReferralRewardParty) ?? "referrer",
    also_credit_referred: Boolean(row.also_credit_referred),
    referred_reward_amount:
      row.referred_reward_amount != null ? num(row.referred_reward_amount) : null,
    require_kyc: row.require_kyc == null ? null : Boolean(row.require_kyc),
    min_order_amount: row.min_order_amount != null ? num(row.min_order_amount) : null,
    active: Boolean(row.active),
    priority: num(row.priority, 100),
    metadata: asObject(row.metadata),
  };
}

export function invalidateReferralConfigCache(): void {
  cache = null;
}

async function loadFromDb(): Promise<{ settings: ReferralSettings; rules: ReferralRewardRule[] }> {
  const sql = getSql();
  const [settingsRow] = await sql<Array<Record<string, unknown>>>`
    SELECT *
    FROM referral_settings
    WHERE id = 1
    LIMIT 1
  `;
  if (!settingsRow) {
    throw new Error("referral_settings_missing");
  }
  const ruleRows = await sql<Array<Record<string, unknown>>>`
    SELECT *
    FROM referral_reward_rules
    ORDER BY user_type ASC, priority ASC, milestone_orders ASC, id ASC
  `;
  return {
    settings: mapSettings(settingsRow),
    rules: ruleRows.map(mapRule),
  };
}

export async function getReferralConfig(opts?: {
  force?: boolean;
}): Promise<{ settings: ReferralSettings; rules: ReferralRewardRule[] }> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { settings: cache.settings, rules: cache.rules };
  }
  const loaded = await loadFromDb();
  cache = { at: Date.now(), ...loaded };
  return loaded;
}

export async function getReferralSettings(force = false): Promise<ReferralSettings> {
  const { settings } = await getReferralConfig({ force });
  return settings;
}

export async function getActiveRewardRules(
  userType: ReferralUserType,
  force = false,
): Promise<ReferralRewardRule[]> {
  const { rules } = await getReferralConfig({ force });
  return rules.filter((r) => r.user_type === userType && r.active);
}

export async function publishReferralConfigUpdated(version: number): Promise<void> {
  try {
    await publish("config:referral", {
      type: "referral_config_updated",
      configVersion: version,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[referral] config publish failed (tolerated)", (err as Error).message);
  }
}

export async function bumpAndPublishReferralConfig(): Promise<number> {
  const sql = getSql();
  invalidateReferralConfigCache();
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
  invalidateReferralConfigCache();
  await publishReferralConfigUpdated(version);
  return version;
}

export function renderReferralTemplate(
  template: { title: string; body: string },
  vars: Record<string, string | number>,
): { title: string; body: string } {
  const replace = (s: string) =>
    Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
      s,
    );
  return { title: replace(template.title), body: replace(template.body) };
}

/** Public app-facing config (no admin-only fields). */
export function toPublicReferralConfig(
  settings: ReferralSettings,
  rules: ReferralRewardRule[],
  userType: ReferralUserType,
) {
  const trackingOn = settings.enabled;
  const rewardsOn =
    trackingOn &&
    settings.reward_enabled &&
    (userType === "customer"
      ? settings.customer_referral_enabled && settings.customer_reward_enabled
      : settings.rider_referral_enabled && settings.rider_reward_enabled);

  const rewardSummary = buildReferralRewardSummary(settings, rules, userType);

  return {
    configVersion: settings.config_version,
    updatedAt: settings.updated_at,
    enabled: trackingOn,
    rewardSummary,
    referralEnabled:
      trackingOn &&
      (userType === "customer"
        ? settings.customer_referral_enabled
        : settings.rider_referral_enabled),
    rewardEnabled: rewardsOn,
    autoApplyEnabled: settings.auto_apply_enabled,
    requireKyc: settings.require_kyc,
    firstOrderOnly: settings.first_order_only,
    minOrderAmount: Number(settings.min_order_amount) || 0,
    monthlyRewardCap: Number(settings.monthly_reward_cap) || 0,
    currency: settings.currency,
    eligibleServices: settings.eligible_services,
    deepLink: settings.deep_link,
    milestones: rules
      .filter((r) => r.user_type === userType && r.active)
      .map((r) => ({
        id: r.id,
        ruleCode: r.rule_code,
        name: r.name,
        description: r.description,
        milestoneOrders: Number(r.milestone_orders) || 0,
        rewardAmount: Number(r.reward_amount) || 0,
        rewardType: r.reward_type,
        alsoCreditReferred: Boolean(r.also_credit_referred),
        referredRewardAmount:
          r.referred_reward_amount == null ? null : Number(r.referred_reward_amount) || 0,
        requireKyc: r.require_kyc ?? settings.require_kyc,
        minOrderAmount: Number(r.min_order_amount ?? settings.min_order_amount) || 0,
        priority: Number(r.priority) || 0,
      })),
  };
}
