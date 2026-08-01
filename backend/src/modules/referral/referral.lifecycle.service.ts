/**
 * Persist lifecycle transitions + funnel daily counters.
 */

import { getSql } from "../../db/client.js";
import {
  assertTransition,
  type ReferralLifecycleState,
} from "./referral.lifecycle.js";
import type { ReferralUserType } from "./referral.config.service.js";

export async function recordLifecycleEvent(opts: {
  relationshipId?: number | null;
  clickToken?: string | null;
  referralCode?: string | null;
  userType?: ReferralUserType | null;
  fromState?: ReferralLifecycleState | null;
  toState: ReferralLifecycleState;
  eventName: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  force?: boolean;
}): Promise<void> {
  assertTransition(opts.fromState, opts.toState, opts.force);
  const sql = getSql();

  try {
    await sql`
      INSERT INTO referral_lifecycle_events (
        referral_relationship_id, click_token, referral_code, user_type,
        from_state, to_state, event_name, actor, metadata
      ) VALUES (
        ${opts.relationshipId ?? null},
        ${opts.clickToken ?? null},
        ${opts.referralCode ?? null},
        ${opts.userType ?? null},
        ${opts.fromState ?? null},
        ${opts.toState},
        ${opts.eventName},
        ${opts.actor ?? "system"},
        ${JSON.stringify(opts.metadata ?? {})}::jsonb
      )
    `;
  } catch (err) {
    // Cast enums explicitly when driver needs it
    try {
      await sql`
        INSERT INTO referral_lifecycle_events (
          referral_relationship_id, click_token, referral_code, user_type,
          from_state, to_state, event_name, actor, metadata
        ) VALUES (
          ${opts.relationshipId ?? null},
          ${opts.clickToken ?? null},
          ${opts.referralCode ?? null},
          ${opts.userType ?? null}::referral_user_type,
          ${opts.fromState ?? null}::referral_lifecycle_state,
          ${opts.toState}::referral_lifecycle_state,
          ${opts.eventName},
          ${opts.actor ?? "system"},
          ${JSON.stringify(opts.metadata ?? {})}::jsonb
        )
      `;
    } catch (e2) {
      console.warn("[referral.lifecycle] event insert failed", (e2 as Error).message);
    }
    void err;
  }

  if (opts.relationshipId) {
    await sql`
      UPDATE referral_relationships
      SET lifecycle_state = ${opts.toState}::referral_lifecycle_state,
          updated_at = NOW()
      WHERE id = ${opts.relationshipId}
    `.catch(() => undefined);
  }

  await bumpFunnelCounter(
    opts.toState,
    opts.userType ?? null,
    typeof opts.metadata?.campaignId === "number" ? opts.metadata.campaignId : undefined,
  );
}

const FUNNEL_COL: Partial<Record<ReferralLifecycleState, string>> = {
  LINK_SHARED: "links_shared",
  LINK_CLICKED: "link_clicks",
  PLAY_STORE_OPENED: "play_store_opens",
  APP_INSTALLED: "installs",
  FIRST_APP_OPEN: "first_app_opens",
  REFERRAL_APPLIED: "referrals_applied",
  FIRST_ORDER_PLACED: "first_orders",
  ORDER_DELIVERED: "delivered_orders",
  REWARD_GRANTED: "rewards_granted",
  FRAUD_BLOCKED: "fraud_blocked",
};

async function bumpFunnelCounter(
  state: ReferralLifecycleState,
  userType: ReferralUserType | null,
  campaignId?: number,
): Promise<void> {
  const col = FUNNEL_COL[state];
  if (!col) return;
  const sql = getSql();
  const day = new Date().toISOString().slice(0, 10);

  // Whitelisted column names only — never interpolate user input for identifiers.
  const statements: Record<string, string> = {
    links_shared: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, links_shared)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET links_shared = referral_funnel_daily.links_shared + 1`,
    link_clicks: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, link_clicks)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET link_clicks = referral_funnel_daily.link_clicks + 1`,
    play_store_opens: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, play_store_opens)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET play_store_opens = referral_funnel_daily.play_store_opens + 1`,
    installs: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, installs)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET installs = referral_funnel_daily.installs + 1`,
    first_app_opens: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, first_app_opens)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET first_app_opens = referral_funnel_daily.first_app_opens + 1`,
    referrals_applied: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, referrals_applied)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET referrals_applied = referral_funnel_daily.referrals_applied + 1`,
    first_orders: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, first_orders)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET first_orders = referral_funnel_daily.first_orders + 1`,
    delivered_orders: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, delivered_orders)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET delivered_orders = referral_funnel_daily.delivered_orders + 1`,
    rewards_granted: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, rewards_granted)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET rewards_granted = referral_funnel_daily.rewards_granted + 1`,
    fraud_blocked: `
      INSERT INTO referral_funnel_daily (day, user_type, campaign_id, fraud_blocked)
      VALUES ($1::date, $2::referral_user_type, $3, 1)
      ON CONFLICT (day, user_type, campaign_id) DO UPDATE
        SET fraud_blocked = referral_funnel_daily.fraud_blocked + 1`,
  };

  const q = statements[col];
  if (!q) return;
  await sql.unsafe(q, [day, userType, campaignId ?? null]).catch(() => undefined);
}
