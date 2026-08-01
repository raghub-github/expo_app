/**
 * Unified Referral Engine — event-driven rules → async reward queue.
 */

import { getSql } from "../../db/client.js";
import { getReferralSettings } from "./referral.config.service.js";
import { isOrderQualifyingForReferral } from "./referral.fraud.js";
import { evaluateRules } from "./referral.rule-engine.js";
import { enqueueRewardJobs } from "./referral.queue.js";
import { recordLifecycleEvent } from "./referral.lifecycle.service.js";

async function queueMatchedRewards(opts: {
  userType: "customer" | "rider";
  relationshipId: number;
  referrerId: number;
  referredUserId: number;
  referralCode?: string | null;
  campaignId?: number | null;
  completedOrders: number;
  orderAmount?: number;
  kycApproved?: boolean;
  eventType: "FIRST_ORDER_DELIVERED" | "ORDER_DELIVERED_COUNT" | "KYC_APPROVED";
  cityId?: number | null;
}): Promise<void> {
  const matched = await evaluateRules({
    userType: opts.userType,
    eventType: opts.eventType,
    relationshipId: opts.relationshipId,
    referrerId: opts.referrerId,
    referredUserId: opts.referredUserId,
    completedOrders: opts.completedOrders,
    orderAmount: opts.orderAmount,
    kycApproved: opts.kycApproved,
    cityId: opts.cityId,
    campaignId: opts.campaignId,
  });

  if (matched.length === 0) return;

  const sql = getSql();
  await recordLifecycleEvent({
    relationshipId: opts.relationshipId,
    fromState: "ORDER_DELIVERED",
    toState: "REWARD_ELIGIBLE",
    eventName: "rules_matched",
    userType: opts.userType,
    metadata: { ruleIds: matched.map((m) => m.id) },
    force: true,
  });

  for (const rule of matched) {
    const [already] = await sql<Array<{ id: string }>>`
      SELECT id::text FROM referral_reward_jobs
      WHERE referral_relationship_id = ${opts.relationshipId}
        AND reward_rule_id = ${rule.id}
        AND status IN ('queued','processing','retrying','succeeded','skipped')
      LIMIT 1
    `.catch(() => [] as Array<{ id: string }>);
    if (already) continue;

    await enqueueRewardJobs({
      relationshipId: opts.relationshipId,
      rule,
      userType: opts.userType,
      referrerId: opts.referrerId,
      referredUserId: opts.referredUserId,
      campaignId: opts.campaignId ?? rule.campaign_id,
      referralCode: opts.referralCode,
    });
  }
}

export async function evaluateCustomerReferralOnOrderDelivered(opts: {
  customerPk: number;
  ordersCoreId: number;
}): Promise<void> {
  try {
    const settings = await getReferralSettings();
    const sql = getSql();
    const [rel] = await sql<Array<{
      id: string;
      referrer_id: string;
      referred_user_id: string;
      status: string;
      auto_applied: boolean;
      referral_code: string;
      campaign_id: string | null;
      lifecycle_state: string | null;
      expires_at: string | null;
      city_id: string | null;
    }>>`
      SELECT id::text, referrer_id::text, referred_user_id::text, status::text,
             auto_applied, referral_code, campaign_id::text, lifecycle_state::text,
             expires_at::text, city_id::text
      FROM referral_relationships
      WHERE user_type = 'customer'::referral_user_type
        AND referred_user_id = ${opts.customerPk}
        AND status IN ('pending', 'attributed', 'first_order_pending', 'cap_reached')
      LIMIT 1
    `;
    if (!rel) return;
    if (rel.expires_at && new Date(rel.expires_at) < new Date()) {
      await recordLifecycleEvent({
        relationshipId: Number(rel.id),
        fromState: (rel.lifecycle_state as never) ?? "REFERRAL_APPLIED",
        toState: "EXPIRED",
        eventName: "expired",
        userType: "customer",
        force: true,
      });
      return;
    }
    if (!rel.auto_applied && settings.auto_apply_enabled) return;

    const qual = await isOrderQualifyingForReferral({
      checks: settings.fraud_checks,
      orderCoreId: opts.ordersCoreId,
      minAmount: settings.min_order_amount,
      eligibleServices: settings.eligible_services,
    });
    if (!qual.ok) return;

    await sql`
      UPDATE referral_relationships
      SET completed_orders = GREATEST(completed_orders, 1),
          qualifying_order_id = ${opts.ordersCoreId},
          qualifying_order_amount = ${qual.amount},
          updated_at = NOW()
      WHERE id = ${Number(rel.id)}
    `;

    await recordLifecycleEvent({
      relationshipId: Number(rel.id),
      fromState: "REFERRAL_APPLIED",
      toState: "FIRST_ORDER_PLACED",
      eventName: "first_order_placed",
      userType: "customer",
      force: true,
    });
    await recordLifecycleEvent({
      relationshipId: Number(rel.id),
      fromState: "FIRST_ORDER_PLACED",
      toState: "ORDER_DELIVERED",
      eventName: "order_delivered",
      userType: "customer",
      metadata: { ordersCoreId: opts.ordersCoreId, amount: qual.amount },
      force: true,
    });

    await queueMatchedRewards({
      userType: "customer",
      relationshipId: Number(rel.id),
      referrerId: Number(rel.referrer_id),
      referredUserId: Number(rel.referred_user_id),
      referralCode: rel.referral_code,
      campaignId: rel.campaign_id ? Number(rel.campaign_id) : null,
      completedOrders: 1,
      orderAmount: qual.amount,
      eventType: "FIRST_ORDER_DELIVERED",
      cityId: rel.city_id ? Number(rel.city_id) : null,
    });
  } catch (err) {
    console.warn("[referral] customer evaluate failed (tolerated)", (err as Error).message);
  }
}

export async function evaluateRiderReferralOnOrderDelivered(opts: {
  riderId: number;
  ordersCoreId: number;
  orderType?: string;
}): Promise<void> {
  try {
    const settings = await getReferralSettings();
    const sql = getSql();

    const [rel] = await sql<Array<{
      id: string;
      referrer_id: string;
      referred_user_id: string;
      completed_orders: number;
      kyc_approved: boolean;
      auto_applied: boolean;
      status: string;
      metadata: unknown;
      referral_code: string;
      campaign_id: string | null;
      lifecycle_state: string | null;
      city_id: string | null;
    }>>`
      SELECT
        id::text, referrer_id::text, referred_user_id::text,
        completed_orders, kyc_approved, auto_applied, status::text, metadata,
        referral_code, campaign_id::text, lifecycle_state::text, city_id::text
      FROM referral_relationships
      WHERE user_type = 'rider'::referral_user_type
        AND referred_user_id = ${opts.riderId}
        AND status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')
      LIMIT 1
    `;
    if (!rel) return;
    if (!rel.auto_applied && settings.auto_apply_enabled) return;

    const meta =
      rel.metadata && typeof rel.metadata === "object" && !Array.isArray(rel.metadata)
        ? (rel.metadata as Record<string, unknown>)
        : {};
    const counted = Array.isArray(meta.counted_order_ids)
      ? (meta.counted_order_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n))
      : [];
    const alreadyCounted = counted.includes(opts.ordersCoreId);
    const nextCount = alreadyCounted
      ? Number(rel.completed_orders ?? 0)
      : Number(rel.completed_orders ?? 0) + 1;
    const nextCounted = alreadyCounted
      ? counted
      : [...counted, opts.ordersCoreId].slice(-500);

    await sql`
      UPDATE referral_relationships
      SET completed_orders = ${nextCount},
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            counted_order_ids: nextCounted,
          })}::jsonb,
          status = CASE
            WHEN status = 'reward_credited' THEN status
            ELSE 'milestone_pending'::referral_relationship_status
          END,
          updated_at = NOW()
      WHERE id = ${Number(rel.id)}
    `;

    if (!alreadyCounted) {
      await recordLifecycleEvent({
        relationshipId: Number(rel.id),
        fromState: "REFERRAL_APPLIED",
        toState: "ORDER_DELIVERED",
        eventName: "order_delivered",
        userType: "rider",
        metadata: { ordersCoreId: opts.ordersCoreId, completedOrders: nextCount },
        force: true,
      });
    }

    let kycOk = Boolean(rel.kyc_approved);
    if (!kycOk) {
      const [rider] = await sql<Array<{ kyc: string | null }>>`
        SELECT kyc_status::text AS kyc FROM riders WHERE id = ${opts.riderId} LIMIT 1
      `;
      kycOk = String(rider?.kyc ?? "").toUpperCase() === "APPROVED";
      if (kycOk) {
        await sql`
          UPDATE referral_relationships
          SET kyc_approved = true, updated_at = NOW()
          WHERE id = ${Number(rel.id)}
        `;
      }
    }

    await queueMatchedRewards({
      userType: "rider",
      relationshipId: Number(rel.id),
      referrerId: Number(rel.referrer_id),
      referredUserId: Number(rel.referred_user_id),
      referralCode: rel.referral_code,
      campaignId: rel.campaign_id ? Number(rel.campaign_id) : null,
      completedOrders: nextCount,
      kycApproved: kycOk,
      eventType: "ORDER_DELIVERED_COUNT",
      cityId: rel.city_id ? Number(rel.city_id) : null,
    });
  } catch (err) {
    console.warn("[referral] rider evaluate failed (tolerated)", (err as Error).message);
  }
}

export async function evaluateRiderReferralOnKycApproved(opts: {
  riderId: number;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      UPDATE referral_relationships
      SET kyc_approved = true, updated_at = NOW()
      WHERE user_type = 'rider'::referral_user_type
        AND referred_user_id = ${opts.riderId}
    `;

    const [rel] = await sql<Array<{
      id: string;
      referrer_id: string;
      referred_user_id: string;
      completed_orders: number;
      auto_applied: boolean;
      referral_code: string;
      campaign_id: string | null;
      city_id: string | null;
    }>>`
      SELECT id::text, referrer_id::text, referred_user_id::text, completed_orders,
             auto_applied, referral_code, campaign_id::text, city_id::text
      FROM referral_relationships
      WHERE user_type = 'rider'::referral_user_type
        AND referred_user_id = ${opts.riderId}
      LIMIT 1
    `;
    if (!rel) return;

    const settings = await getReferralSettings();
    if (!rel.auto_applied && settings.auto_apply_enabled) return;

    await queueMatchedRewards({
      userType: "rider",
      relationshipId: Number(rel.id),
      referrerId: Number(rel.referrer_id),
      referredUserId: Number(rel.referred_user_id),
      referralCode: rel.referral_code,
      campaignId: rel.campaign_id ? Number(rel.campaign_id) : null,
      completedOrders: Number(rel.completed_orders ?? 0),
      kycApproved: true,
      eventType: "KYC_APPROVED",
      cityId: rel.city_id ? Number(rel.city_id) : null,
    });

    // Also re-check order-count milestones now that KYC is unlocked
    await queueMatchedRewards({
      userType: "rider",
      relationshipId: Number(rel.id),
      referrerId: Number(rel.referrer_id),
      referredUserId: Number(rel.referred_user_id),
      referralCode: rel.referral_code,
      campaignId: rel.campaign_id ? Number(rel.campaign_id) : null,
      completedOrders: Number(rel.completed_orders ?? 0),
      kycApproved: true,
      eventType: "ORDER_DELIVERED_COUNT",
      cityId: rel.city_id ? Number(rel.city_id) : null,
    });
  } catch (err) {
    console.warn("[referral] kyc evaluate failed (tolerated)", (err as Error).message);
  }
}
