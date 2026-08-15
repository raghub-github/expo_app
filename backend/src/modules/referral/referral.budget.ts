/**
 * Campaign budget enforcement.
 *
 * Budget is Super Admin `referral_settings.campaign_budget` (nullable = unlimited).
 * It applies to the COMBINED payout of referrer + referred wallet/GatiCash credits
 * recorded in `referral_reward_transactions` with status = 'credited'.
 *
 * Enforcement is server-side with a session advisory lock so concurrent
 * credits cannot overshoot the configured cap.
 */

import { getSql } from "../../db/client.js";

/** Stable lock id for campaign-budget serialization (not a secret). */
export const REFERRAL_CAMPAIGN_BUDGET_LOCK = 87200147;

export function campaignBudgetWouldExceed(opts: {
  budget: number | null | undefined;
  consumed: number;
  nextAmount: number;
}): boolean {
  if (opts.budget == null || !Number.isFinite(opts.budget) || opts.budget < 0) {
    return false;
  }
  const next = Number.isFinite(opts.nextAmount) ? Math.max(0, opts.nextAmount) : 0;
  const consumed = Number.isFinite(opts.consumed) ? Math.max(0, opts.consumed) : 0;
  return consumed + next > opts.budget + 1e-9;
}

export function campaignBudgetRemaining(opts: {
  budget: number | null | undefined;
  consumed: number;
}): number | null {
  if (opts.budget == null || !Number.isFinite(opts.budget)) return null;
  return Math.max(0, opts.budget - Math.max(0, opts.consumed));
}

export async function withCampaignBudgetLock<T>(fn: () => Promise<T>): Promise<T> {
  const sql = getSql();
  await sql`SELECT pg_advisory_lock(${REFERRAL_CAMPAIGN_BUDGET_LOCK})`;
  try {
    return await fn();
  } finally {
    await sql`SELECT pg_advisory_unlock(${REFERRAL_CAMPAIGN_BUDGET_LOCK})`.catch(() => undefined);
  }
}

export async function assertCampaignBudgetAvailable(
  amount: number,
): Promise<{ ok: true } | { ok: false; skipped: "campaign_budget_exhausted"; consumed: number; budget: number }> {
  const sql = getSql();
  const [settings] = await sql<Array<{ campaign_budget: string | null }>>`
    SELECT campaign_budget::text
    FROM referral_settings
    ORDER BY id ASC
    LIMIT 1
  `.catch(() => [] as Array<{ campaign_budget: string | null }>);

  const budget =
    settings?.campaign_budget != null && settings.campaign_budget !== ""
      ? Number(settings.campaign_budget)
      : null;
  if (budget == null || !Number.isFinite(budget)) {
    return { ok: true };
  }

  const [sum] = await sql<Array<{ consumed: string }>>`
    SELECT COALESCE(SUM(reward_amount), 0)::text AS consumed
    FROM referral_reward_transactions
    WHERE status = 'credited'
  `;
  const consumed = Number(sum?.consumed ?? 0);
  if (campaignBudgetWouldExceed({ budget, consumed, nextAmount: amount })) {
    return { ok: false, skipped: "campaign_budget_exhausted", consumed, budget };
  }
  return { ok: true };
}

export async function getCampaignBudgetSnapshot(): Promise<{
  budget: number | null;
  consumed: number;
  remaining: number | null;
  exhausted: boolean;
}> {
  const sql = getSql();
  const [settings] = await sql<Array<{ campaign_budget: string | null }>>`
    SELECT campaign_budget::text FROM referral_settings ORDER BY id ASC LIMIT 1
  `.catch(() => [] as Array<{ campaign_budget: string | null }>);
  const [sum] = await sql<Array<{ consumed: string }>>`
    SELECT COALESCE(SUM(reward_amount), 0)::text AS consumed
    FROM referral_reward_transactions
    WHERE status = 'credited'
  `.catch(() => [{ consumed: "0" }]);
  const budget =
    settings?.campaign_budget != null && settings.campaign_budget !== ""
      ? Number(settings.campaign_budget)
      : null;
  const consumed = Number(sum?.consumed ?? 0);
  const remaining = campaignBudgetRemaining({ budget, consumed });
  return {
    budget: budget != null && Number.isFinite(budget) ? budget : null,
    consumed,
    remaining,
    exhausted: remaining != null && remaining <= 0,
  };
}
