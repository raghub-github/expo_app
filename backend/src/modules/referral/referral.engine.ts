/**
 * Unified Referral Engine — event-driven rules → async reward queue.
 */

import { getSql } from "../../db/client.js";
import { getReferralSettings } from "./referral.config.service.js";
import { isOrderQualifyingForReferral } from "./referral.fraud.js";
import { evaluateRules } from "./referral.rule-engine.js";
import { enqueueRewardJobs } from "./referral.queue.js";
import { recordLifecycleEvent } from "./referral.lifecycle.service.js";
import type { ReferralUserType } from "./referral.config.service.js";
import type { RuleEventType } from "./referral.rule-engine.js";
import { resolveMerchantWalletStoreId } from "./referral.eligibility.js";

async function queueMatchedRewards(opts: {
  userType: ReferralUserType;
  relationshipId: number;
  referrerId: number;
  referredUserId: number;
  referralCode?: string | null;
  campaignId?: number | null;
  completedOrders: number;
  orderAmount?: number;
  kycApproved?: boolean;
  eventType: RuleEventType;
  cityId?: number | null;
  merchantStoreId?: number | null;
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
    // Per-party job_key uniqueness + ON CONFLICT DO NOTHING. Do not skip the
    // other party just because one job already exists for this rule.
    await enqueueRewardJobs({
      relationshipId: opts.relationshipId,
      rule,
      userType: opts.userType,
      referrerId: opts.referrerId,
      referredUserId: opts.referredUserId,
      campaignId: opts.campaignId ?? rule.campaign_id,
      referralCode: opts.referralCode,
      merchantStoreId: opts.merchantStoreId ?? null,
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
        AND ${
          settings.first_order_only !== false
            ? sql`status IN ('pending', 'attributed', 'first_order_pending', 'cap_reached')`
            : sql`status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')`
        }
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

    const firstOrderOnly = settings.first_order_only !== false;
    const [relFull] = await sql<Array<{ qualifying_order_id: string | null }>>`
      SELECT qualifying_order_id::text
      FROM referral_relationships
      WHERE id = ${Number(rel.id)}
      LIMIT 1
    `;
    if (
      firstOrderOnly &&
      relFull?.qualifying_order_id &&
      Number(relFull.qualifying_order_id) !== opts.ordersCoreId
    ) {
      return;
    }

    const qual = await isOrderQualifyingForReferral({
      checks: settings.fraud_checks,
      orderCoreId: opts.ordersCoreId,
      minAmount: settings.min_order_amount,
      eligibleServices: settings.eligible_services,
    });
    if (!qual.ok) return;

    if (firstOrderOnly) {
      await sql`
        UPDATE referral_relationships
        SET completed_orders = GREATEST(completed_orders, 1),
            qualifying_order_id = ${opts.ordersCoreId},
            qualifying_order_amount = ${qual.amount},
            updated_at = NOW()
        WHERE id = ${Number(rel.id)}
      `;
    } else {
      await sql`
        UPDATE referral_relationships
        SET completed_orders = completed_orders + 1,
            qualifying_order_id = COALESCE(qualifying_order_id, ${opts.ordersCoreId}),
            qualifying_order_amount = ${qual.amount},
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{counted_order_ids}',
              COALESCE(metadata->'counted_order_ids', '[]'::jsonb) || to_jsonb(${opts.ordersCoreId}::bigint)
            ),
            updated_at = NOW()
        WHERE id = ${Number(rel.id)}
          AND NOT (
            COALESCE(metadata->'counted_order_ids', '[]'::jsonb) @> to_jsonb(${opts.ordersCoreId}::bigint)
          )
      `;
    }

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
      expires_at: string | null;
    }>>`
      SELECT
        id::text, referrer_id::text, referred_user_id::text,
        completed_orders, kyc_approved, auto_applied, status::text, metadata,
        referral_code, campaign_id::text, lifecycle_state::text, city_id::text,
        expires_at::text
      FROM referral_relationships
      WHERE user_type = 'rider'::referral_user_type
        AND referred_user_id = ${opts.riderId}
        AND status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')
      LIMIT 1
    `;
    if (!rel) return;
    if (rel.expires_at && new Date(rel.expires_at) < new Date()) return;
    if (!rel.auto_applied && settings.auto_apply_enabled) return;

    const meta =
      rel.metadata && typeof rel.metadata === "object" && !Array.isArray(rel.metadata)
        ? (rel.metadata as Record<string, unknown>)
        : {};
    const counted = Array.isArray(meta.counted_order_ids)
      ? (meta.counted_order_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n))
      : [];
    const alreadyCounted = counted.includes(opts.ordersCoreId);

    const [bumped] = alreadyCounted
      ? [{ completed_orders: String(rel.completed_orders ?? 0) }]
      : await sql<Array<{ completed_orders: string }>>`
          UPDATE referral_relationships
          SET completed_orders = completed_orders + 1,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{counted_order_ids}',
                COALESCE(metadata->'counted_order_ids', '[]'::jsonb) || to_jsonb(${opts.ordersCoreId}::bigint)
              ),
              status = CASE
                WHEN status = 'reward_credited' THEN status
                ELSE 'milestone_pending'::referral_relationship_status
              END,
              updated_at = NOW()
          WHERE id = ${Number(rel.id)}
            AND NOT (
              COALESCE(metadata->'counted_order_ids', '[]'::jsonb) @> to_jsonb(${opts.ordersCoreId}::bigint)
            )
          RETURNING completed_orders::text
        `;
    const nextCount = alreadyCounted
      ? Number(rel.completed_orders ?? 0)
      : Number(bumped?.completed_orders ?? Number(rel.completed_orders ?? 0) + 1);

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

/**
 * Generic merchant evaluator. `referredUserId` is merchant_parents.id.
 * Qualifying events (registration, store approved, first/Nth delivered order)
 * are matched from DB rules — amounts never hardcoded here.
 */
export async function evaluateMerchantReferralOnEvent(opts: {
  merchantParentId: number;
  eventType: RuleEventType;
  ordersCoreId?: number;
  merchantStoreId?: number | null;
  incrementOrder?: boolean;
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
      referral_code: string;
      campaign_id: string | null;
      lifecycle_state: string | null;
      city_id: string | null;
      expires_at: string | null;
      metadata: unknown;
    }>>`
      SELECT
        id::text, referrer_id::text, referred_user_id::text,
        completed_orders, kyc_approved, auto_applied, referral_code,
        campaign_id::text, lifecycle_state::text, city_id::text, expires_at::text, metadata
      FROM referral_relationships
      WHERE user_type = 'merchant'::referral_user_type
        AND referred_user_id = ${opts.merchantParentId}
        AND status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')
      LIMIT 1
    `;
    if (!rel) return;
    if (rel.expires_at && new Date(rel.expires_at) < new Date()) return;
    if (!rel.auto_applied && settings.auto_apply_enabled) return;

    const scope = settings.merchant_qualification_scope ?? "ALL_CHILD_STORES";
    const selectedStoreIds = (settings.merchant_qualification_store_ids ?? []).map(Number);
    const storeId =
      opts.merchantStoreId != null && Number.isFinite(opts.merchantStoreId) && opts.merchantStoreId > 0
        ? opts.merchantStoreId
        : null;

    const storeAllowed = (id: number | null): boolean => {
      if (scope === "ALL_CHILD_STORES") return true;
      if (id == null) return false;
      if (scope === "SELECTED_STORES") return selectedStoreIds.includes(id);
      if (scope === "SINGLE_STORE") return true;
      return true;
    };

    let nextCount = Number(rel.completed_orders ?? 0);
    if (opts.incrementOrder && opts.ordersCoreId) {
      const meta =
        rel.metadata && typeof rel.metadata === "object" && !Array.isArray(rel.metadata)
          ? (rel.metadata as Record<string, unknown>)
          : {};
      const counted = Array.isArray(meta.counted_order_ids)
        ? (meta.counted_order_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n))
        : [];
      const alreadyCounted = counted.includes(opts.ordersCoreId);
      const storeCountsRaw =
        meta.store_order_counts && typeof meta.store_order_counts === "object"
          ? (meta.store_order_counts as Record<string, unknown>)
          : {};
      const storeCounts: Record<string, number> = {};
      for (const [k, v] of Object.entries(storeCountsRaw)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) storeCounts[k] = n;
      }

      if (!alreadyCounted && storeAllowed(storeId)) {
        if (storeId != null) {
          const key = String(storeId);
          storeCounts[key] = (storeCounts[key] ?? 0) + 1;
        }
        if (scope === "SINGLE_STORE") {
          nextCount = Object.values(storeCounts).reduce((max, n) => Math.max(max, n), 0);
        } else {
          nextCount = nextCount + 1;
        }
        const nextCounted = [...counted, opts.ordersCoreId].slice(-500);
        await sql`
          UPDATE referral_relationships
          SET completed_orders = ${nextCount},
              metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
                counted_order_ids: nextCounted,
                store_order_counts: storeCounts,
                qualification_scope: scope,
                last_qualifying_store_id: storeId,
              })}::text::jsonb,
              status = CASE
                WHEN status = 'reward_credited' THEN status
                ELSE 'milestone_pending'::referral_relationship_status
              END,
              updated_at = NOW()
          WHERE id = ${Number(rel.id)}
            AND NOT (
              COALESCE(metadata->'counted_order_ids', '[]'::jsonb) @> to_jsonb(${opts.ordersCoreId}::bigint)
            )
        `;
      }
    }

    let kycOk = Boolean(rel.kyc_approved);
    if (!kycOk) {
      const [store] = await sql<Array<{ ok: string }>>`
        SELECT 1::text AS ok
        FROM merchant_stores
        WHERE parent_id = ${opts.merchantParentId}
          AND approval_status::text = 'APPROVED'
          AND deleted_at IS NULL
        LIMIT 1
      `;
      kycOk = Boolean(store);
      if (kycOk) {
        await sql`
          UPDATE referral_relationships
          SET kyc_approved = true, updated_at = NOW()
          WHERE id = ${Number(rel.id)}
        `;
      }
    }

    await queueMatchedRewards({
      userType: "merchant",
      relationshipId: Number(rel.id),
      referrerId: Number(rel.referrer_id),
      referredUserId: Number(rel.referred_user_id),
      referralCode: rel.referral_code,
      campaignId: rel.campaign_id ? Number(rel.campaign_id) : null,
      completedOrders: nextCount,
      kycApproved: kycOk,
      eventType: opts.eventType,
      cityId: rel.city_id ? Number(rel.city_id) : null,
      merchantStoreId: resolveMerchantWalletStoreId({
        scope,
        triggeringStoreId: storeId,
        selectedStoreIds,
        storeOrderCounts:
          rel.metadata && typeof rel.metadata === "object" && !Array.isArray(rel.metadata)
            ? ((rel.metadata as Record<string, unknown>).store_order_counts as Record<string, number>) ??
              {}
            : {},
      }),
    });
  } catch (err) {
    console.warn("[referral] merchant evaluate failed (tolerated)", (err as Error).message);
  }
}

