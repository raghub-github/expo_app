/**
 * Event-driven referral rule engine.
 * Rules declare event_type + conditions; engine matches without hardcoding first-order/milestone branches.
 */

import { getSql } from "../../db/client.js";
import {
  getReferralSettings,
  type ReferralRewardRule,
  type ReferralUserType,
} from "./referral.config.service.js";

export type RuleEventType =
  | "FIRST_ORDER_DELIVERED"
  | "ORDER_DELIVERED_COUNT"
  | "KYC_APPROVED"
  | "SIGNUP"
  | "REGISTRATION_COMPLETED"
  | "STORE_APPROVED"
  | "MENU_COMPLETED"
  | "ACTIVE_DAYS"
  | "CUSTOM";

export type RuleEvaluationContext = {
  userType: ReferralUserType;
  eventType: RuleEventType;
  relationshipId: number;
  referrerId: number;
  referredUserId: number;
  completedOrders: number;
  orderAmount?: number;
  kycApproved?: boolean;
  cityId?: number | null;
  campaignId?: number | null;
  now?: Date;
};

export type MatchedRule = ReferralRewardRule & {
  event_type?: RuleEventType;
  campaign_id?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  monthly_cap_override?: number | null;
  city_ids?: number[];
};

function inWindow(rule: MatchedRule, now: Date): boolean {
  if (rule.starts_at && new Date(rule.starts_at) > now) return false;
  if (rule.ends_at && new Date(rule.ends_at) < now) return false;
  return true;
}

function cityOk(rule: MatchedRule, cityId?: number | null): boolean {
  const ids = rule.city_ids ?? [];
  if (!ids.length) return true;
  if (cityId == null) return true;
  return ids.map(Number).includes(Number(cityId));
}

function matchesEvent(rule: MatchedRule, ctx: RuleEvaluationContext): boolean {
  const et = (rule.event_type ??
    (rule.user_type === "customer"
      ? "FIRST_ORDER_DELIVERED"
      : rule.user_type === "merchant"
        ? "STORE_APPROVED"
        : "ORDER_DELIVERED_COUNT")) as RuleEventType;

  if (et !== ctx.eventType && et !== "CUSTOM") return false;

  if (ctx.eventType === "FIRST_ORDER_DELIVERED") {
    return ctx.completedOrders >= Math.max(1, rule.milestone_orders || 1);
  }
  if (ctx.eventType === "ORDER_DELIVERED_COUNT" || ctx.eventType === "ACTIVE_DAYS") {
    return ctx.completedOrders >= rule.milestone_orders;
  }
  if (
    ctx.eventType === "KYC_APPROVED" ||
    ctx.eventType === "STORE_APPROVED" ||
    ctx.eventType === "MENU_COMPLETED" ||
    ctx.eventType === "SIGNUP" ||
    ctx.eventType === "REGISTRATION_COMPLETED"
  ) {
    return true;
  }
  return true;
}

export async function loadActiveCampaignRules(
  userType: ReferralUserType,
): Promise<MatchedRule[]> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT r.*,
      r.event_type::text AS event_type,
      r.campaign_id,
      r.starts_at,
      r.ends_at,
      r.monthly_cap_override,
      r.city_ids
    FROM referral_reward_rules r
    LEFT JOIN referral_campaigns c ON c.id = r.campaign_id
    WHERE r.user_type = ${userType}::referral_user_type
      AND r.active = true
      AND (r.campaign_id IS NULL OR (c.enabled = true
        AND (c.starts_at IS NULL OR c.starts_at <= NOW())
        AND (c.ends_at IS NULL OR c.ends_at >= NOW())))
    ORDER BY r.priority ASC, r.milestone_orders ASC, r.id ASC
  `.catch(async () => {
    // Pre-0471 fallback
    const fallback = await sql<Array<Record<string, unknown>>>`
      SELECT * FROM referral_reward_rules
      WHERE user_type = ${userType}::referral_user_type AND active = true
      ORDER BY priority ASC, milestone_orders ASC, id ASC
    `;
    return fallback;
  });

  return rows.map((row) => ({
    id: Number(row.id),
    user_type: row.user_type as ReferralUserType,
    rule_code: String(row.rule_code),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    milestone_orders: Number(row.milestone_orders ?? 1),
    reward_amount: Number(row.reward_amount ?? 0),
    reward_type: row.reward_type as "GATICASH" | "WALLET_CREDIT",
    reward_party: (row.reward_party as "referrer" | "referred") ?? "referrer",
    also_credit_referred: Boolean(row.also_credit_referred),
    referred_reward_amount:
      row.referred_reward_amount != null ? Number(row.referred_reward_amount) : null,
    require_kyc: row.require_kyc == null ? null : Boolean(row.require_kyc),
    min_order_amount: row.min_order_amount != null ? Number(row.min_order_amount) : null,
    active: Boolean(row.active),
    priority: Number(row.priority ?? 100),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    event_type: (row.event_type as RuleEventType) ?? undefined,
    campaign_id: row.campaign_id != null ? Number(row.campaign_id) : null,
    starts_at: row.starts_at ? String(row.starts_at) : null,
    ends_at: row.ends_at ? String(row.ends_at) : null,
    monthly_cap_override:
      row.monthly_cap_override != null ? Number(row.monthly_cap_override) : null,
    city_ids: Array.isArray(row.city_ids) ? (row.city_ids as number[]) : [],
    reward_mode:
      row.reward_mode === "highest_only" || row.reward_mode === "incremental"
        ? (row.reward_mode as "incremental" | "highest_only")
        : null,
  }));
}

export async function evaluateRules(ctx: RuleEvaluationContext): Promise<MatchedRule[]> {
  const settings = await getReferralSettings();
  const now = ctx.now ?? new Date();
  const rules = await loadActiveCampaignRules(ctx.userType);

  const matched = rules.filter((rule) => {
    if (!inWindow(rule, now)) return false;
    if (!cityOk(rule, ctx.cityId)) return false;
    if (ctx.campaignId != null && rule.campaign_id != null && rule.campaign_id !== ctx.campaignId) {
      return false;
    }
    if (!matchesEvent(rule, ctx)) return false;

    const requireKyc = rule.require_kyc ?? settings.require_kyc;
    if (requireKyc && (ctx.userType === "rider" || ctx.userType === "merchant") && !ctx.kycApproved) {
      return false;
    }

    const minOrder = rule.min_order_amount ?? settings.min_order_amount;
    if (
      (ctx.eventType === "FIRST_ORDER_DELIVERED" || ctx.eventType === "ORDER_DELIVERED_COUNT") &&
      ctx.orderAmount != null &&
      ctx.orderAmount < minOrder &&
      ctx.userType === "customer"
    ) {
      return false;
    }

    return true;
  });

  const countEvents = ctx.eventType === "ORDER_DELIVERED_COUNT" || ctx.eventType === "ACTIVE_DAYS";
  if (countEvents && matched.length > 1) {
    const highestOnly = matched.filter((rule) => {
      const mode = rule.reward_mode ?? settings.reward_mode ?? "incremental";
      return mode === "highest_only";
    });
    if (highestOnly.length === matched.length) {
      const top = [...matched].sort((a, b) => b.milestone_orders - a.milestone_orders)[0];
      return top ? [top] : [];
    }
  }

  return matched;
}
