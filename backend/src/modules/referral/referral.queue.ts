/**
 * Durable referral reward job queue.
 * Prefer BullMQ when Redis is up; always persist jobs in Postgres for admin retry / reconciliation.
 */

import { getSql } from "../../db/client.js";
import type { ReferralRewardParty, ReferralRewardType, ReferralUserType } from "./referral.config.service.js";
import { creditReferralReward } from "./referral.reward.service.js";
import { recordLifecycleEvent } from "./referral.lifecycle.service.js";
import type { MatchedRule } from "./referral.rule-engine.js";
import {
  deriveRelationshipRewardState,
  jobStatusToPartyState,
  relationshipIsFullyCredited,
  type PartyRewardState,
} from "./referral.relationship-state.js";

export type EnqueueRewardJobInput = {
  relationshipId: number;
  rule: MatchedRule;
  userType: ReferralUserType;
  referrerId: number;
  referredUserId: number;
  campaignId?: number | null;
  referralCode?: string | null;
  merchantStoreId?: number | null;
};

function backoffMs(attempts: number): number {
  // 1s, 2s, 4s, … capped at 1h
  return Math.min(3_600_000, 1000 * 2 ** Math.max(0, attempts));
}

async function syncRelationshipRewardState(opts: {
  relationshipId: number;
  ruleId: number;
  userType: ReferralUserType;
  alsoCreditReferred: boolean;
}): Promise<void> {
  const sql = getSql();
  const jobs = await sql<Array<{ reward_party: string; status: string }>>`
    SELECT reward_party::text, status::text
    FROM referral_reward_jobs
    WHERE referral_relationship_id = ${opts.relationshipId}
      AND reward_rule_id = ${opts.ruleId}
  `.catch(() => [] as Array<{ reward_party: string; status: string }>);

  const hasReferredJob = jobs.some((j) => String(j.reward_party).toLowerCase() === "referred");
  const alsoCreditReferred = opts.alsoCreditReferred || hasReferredJob;

  let referrer: PartyRewardState = "pending";
  let referred: PartyRewardState = alsoCreditReferred ? "pending" : "credited";
  for (const row of jobs) {
    const party = String(row.reward_party ?? "").toLowerCase();
    const state = jobStatusToPartyState(row.status);
    if (party === "referrer") referrer = state;
    if (party === "referred") referred = state;
  }
  const overall = deriveRelationshipRewardState({
    alsoCreditReferred,
    referrer,
    referred,
  });
  const fully = relationshipIsFullyCredited(overall);

  await sql`
    UPDATE referral_relationships
    SET
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        reward_parties: { referrer, referred },
        reward_state: overall,
      })}::text::jsonb,
      status = CASE
        WHEN ${fully} THEN 'reward_credited'::referral_relationship_status
        WHEN status = 'reward_credited' THEN 'milestone_pending'::referral_relationship_status
        ELSE status
      END,
      reward_status = ${fully ? "credited" : overall === "skipped_disabled" ? "skipped" : overall === "permanent_failure" ? "failed" : "pending"},
      updated_at = NOW()
    WHERE id = ${opts.relationshipId}
  `;

  if (fully) {
    await recordLifecycleEvent({
      relationshipId: opts.relationshipId,
      fromState: "REWARD_ELIGIBLE",
      toState: "REWARD_GRANTED",
      eventName: "reward_job_succeeded",
      userType: opts.userType,
      metadata: { ruleId: opts.ruleId, reward_state: overall },
      force: true,
    });
    await recordLifecycleEvent({
      relationshipId: opts.relationshipId,
      fromState: "REWARD_GRANTED",
      toState: "REWARD_NOTIFIED",
      eventName: "reward_notified",
      userType: opts.userType,
      force: true,
    });
  }
}

export async function enqueueRewardJobs(input: EnqueueRewardJobInput): Promise<string[]> {
  const sql = getSql();
  const keys: string[] = [];

  const parties: Array<{ party: ReferralRewardParty; amount: number; beneficiary: number }> = [
    {
      party: "referrer",
      amount: input.rule.reward_amount,
      beneficiary: input.referrerId,
    },
  ];
  if (input.rule.also_credit_referred) {
    parties.push({
      party: "referred",
      amount: input.rule.referred_reward_amount ?? input.rule.reward_amount,
      beneficiary: input.referredUserId,
    });
  }

  for (const p of parties) {
    const jobKey = `ref_job_${input.relationshipId}_rule_${input.rule.id}_${p.party}`;
    keys.push(jobKey);
    await sql`
      INSERT INTO referral_reward_jobs (
        job_key, referral_relationship_id, reward_rule_id, campaign_id,
        user_type, beneficiary_user_id, reward_party, reward_amount, reward_type,
        status, metadata
      ) VALUES (
        ${jobKey},
        ${input.relationshipId},
        ${input.rule.id},
        ${input.campaignId ?? input.rule.campaign_id ?? null},
        ${input.userType}::referral_user_type,
        ${p.beneficiary},
        ${p.party}::referral_reward_party,
        ${p.amount},
        ${input.rule.reward_type}::referral_reward_type,
        'queued'::referral_reward_job_status,
        ${JSON.stringify({
          referralCode: input.referralCode,
          referrerId: input.referrerId,
          referredUserId: input.referredUserId,
          ruleCode: input.rule.rule_code,
          alsoCreditReferred: Boolean(input.rule.also_credit_referred),
          merchantStoreId: input.merchantStoreId ?? null,
        })}::text::jsonb
      )
      ON CONFLICT (job_key) DO NOTHING
    `.catch((err) => {
      console.warn("[referral.queue] enqueue failed", (err as Error).message);
    });
  }

  // Kick async processor (non-blocking)
  setImmediate(() => {
    void processReferralRewardJobs({ limit: 10 }).catch((e) =>
      console.warn("[referral.queue] process kick failed", (e as Error).message),
    );
  });

  // Best-effort BullMQ fan-out
  try {
    const { enqueue, QUEUE_NAMES } = await import("@gatimitra/queue");
    await enqueue(
      QUEUE_NAMES.REFERRAL_REWARD,
      { relationshipId: input.relationshipId, jobKeys: keys },
      { jobId: `ref_rel_${input.relationshipId}_${input.rule.id}`, attempts: 5 },
    ).catch(() => undefined);
  } catch {
    /* queue package / redis may be unavailable — DB poller covers it */
  }

  return keys;
}

export async function processReferralRewardJobs(opts?: {
  limit?: number;
  jobId?: number;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  const sql = getSql();
  const limit = opts?.limit ?? 20;
  let rows: Array<Record<string, unknown>>;

  if (opts?.jobId) {
    rows = await sql<Array<Record<string, unknown>>>`
      SELECT * FROM referral_reward_jobs WHERE id = ${opts.jobId} LIMIT 1
    `;
  } else {
    rows = await sql<Array<Record<string, unknown>>>`
      SELECT * FROM referral_reward_jobs
      WHERE status IN ('queued', 'retrying', 'failed')
        AND attempts < max_attempts
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `.catch(() => [] as Array<Record<string, unknown>>);
  }

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const id = Number(row.id);
    await sql`
      UPDATE referral_reward_jobs
      SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${id}
    `;

    try {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const rule = {
        id: Number(row.reward_rule_id),
        user_type: row.user_type as ReferralUserType,
        rule_code: String(meta.ruleCode ?? `RULE_${row.reward_rule_id}`),
        name: String(meta.ruleCode ?? "rule"),
        description: null,
        milestone_orders: 0,
        reward_amount: Number(row.reward_amount),
        reward_type: row.reward_type as ReferralRewardType,
        reward_party: row.reward_party as ReferralRewardParty,
        also_credit_referred: row.reward_party === "referrer" ? false : false,
        referred_reward_amount: null,
        require_kyc: null,
        min_order_amount: null,
        active: true,
        priority: 0,
        metadata: {},
        campaign_id: row.campaign_id != null ? Number(row.campaign_id) : null,
      };

      // Credit only the party on this job
      const result = await creditReferralReward({
        userType: row.user_type as ReferralUserType,
        relationshipId: Number(row.referral_relationship_id),
        rule: {
          ...rule,
          also_credit_referred: false,
          reward_amount: Number(row.reward_amount),
          reward_party: row.reward_party as ReferralRewardParty,
        },
        referrerId: Number(meta.referrerId ?? row.beneficiary_user_id),
        referredUserId: Number(meta.referredUserId ?? row.beneficiary_user_id),
        partyOverride: row.reward_party as ReferralRewardParty,
        beneficiaryOverride: Number(row.beneficiary_user_id),
        campaignId: row.campaign_id != null ? Number(row.campaign_id) : null,
        referralCode: meta.referralCode != null ? String(meta.referralCode) : null,
        merchantStoreId:
          meta.merchantStoreId != null ? Number(meta.merchantStoreId) : null,
      });

      if (result.skipped) {
        await sql`
          UPDATE referral_reward_jobs
          SET status = 'skipped', last_error = ${result.skipped},
              completed_at = NOW(), updated_at = NOW()
          WHERE id = ${id}
        `;
        await syncRelationshipRewardState({
          relationshipId: Number(row.referral_relationship_id),
          ruleId: Number(row.reward_rule_id),
          userType: row.user_type as ReferralUserType,
          alsoCreditReferred: Boolean(meta.alsoCreditReferred),
        });
        succeeded += 1;
        continue;
      }

      await sql`
        UPDATE referral_reward_jobs
        SET status = 'succeeded', completed_at = NOW(), updated_at = NOW(), last_error = NULL
        WHERE id = ${id}
      `;
      await syncRelationshipRewardState({
        relationshipId: Number(row.referral_relationship_id),
        ruleId: Number(row.reward_rule_id),
        userType: row.user_type as ReferralUserType,
        alsoCreditReferred: Boolean(meta.alsoCreditReferred),
      });
      succeeded += 1;
    } catch (err) {
      const attempts = Number(row.attempts ?? 0) + 1;
      const max = Number(row.max_attempts ?? 8);
      const dead = attempts >= max;
      const next = new Date(Date.now() + backoffMs(attempts)).toISOString();
      await sql`
        UPDATE referral_reward_jobs
        SET status = ${dead ? "dead" : "retrying"}::referral_reward_job_status,
            last_error = ${(err as Error).message},
            next_attempt_at = ${next},
            updated_at = NOW()
        WHERE id = ${id}
      `;
      await recordLifecycleEvent({
        relationshipId: Number(row.referral_relationship_id),
        fromState: "REWARD_ELIGIBLE",
        toState: "REWARD_FAILED",
        eventName: "reward_job_failed",
        userType: row.user_type as ReferralUserType,
        metadata: { error: (err as Error).message },
        force: true,
      });
      failed += 1;
    }
  }

  return { processed: rows.length, succeeded, failed };
}

export async function adminRetryRewardJob(
  jobId: number,
  action: "retry" | "force" | "mark_failed" | "skip",
): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  if (action === "mark_failed") {
    await sql`
      UPDATE referral_reward_jobs
      SET status = 'dead', last_error = 'admin_mark_failed', updated_at = NOW(), completed_at = NOW()
      WHERE id = ${jobId}
    `;
    return { ok: true };
  }
  if (action === "skip") {
    await sql`
      UPDATE referral_reward_jobs
      SET status = 'skipped', last_error = 'admin_skip', updated_at = NOW(), completed_at = NOW()
      WHERE id = ${jobId}
    `;
    return { ok: true };
  }
  await sql`
    UPDATE referral_reward_jobs
    SET status = 'queued', next_attempt_at = NOW(),
        max_attempts = CASE WHEN ${action === "force"} THEN GREATEST(max_attempts, attempts + 3) ELSE max_attempts END,
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
  await processReferralRewardJobs({ jobId });
  return { ok: true };
}

/** Daily reconciliation — repair recoverable stuck states. */
export async function runReferralReconciliation(): Promise<{
  requeued: number;
  expired: number;
  missingNotified: number;
}> {
  const sql = getSql();
  let requeued = 0;
  let expired = 0;
  let missingNotified = 0;

  // Requeue failed jobs that still have attempts left
  const [rq] = await sql<Array<{ n: string }>>`
    WITH u AS (
      UPDATE referral_reward_jobs
      SET status = 'retrying', next_attempt_at = NOW(), updated_at = NOW()
      WHERE status IN ('failed', 'retrying')
        AND attempts < max_attempts
        AND next_attempt_at < NOW() - INTERVAL '5 minutes'
      RETURNING 1
    )
    SELECT COUNT(*)::text AS n FROM u
  `.catch(() => [{ n: "0" }]);
  requeued = Number(rq?.n ?? 0);

  // Expire relationships past expires_at
  const [ex] = await sql<Array<{ n: string }>>`
    WITH u AS (
      UPDATE referral_relationships
      SET lifecycle_state = 'EXPIRED'::referral_lifecycle_state,
          status = 'cancelled',
          updated_at = NOW()
      WHERE expires_at IS NOT NULL
        AND expires_at < NOW()
        AND lifecycle_state NOT IN ('REWARD_GRANTED', 'REWARD_NOTIFIED', 'EXPIRED', 'SKIPPED')
      RETURNING 1
    )
    SELECT COUNT(*)::text AS n FROM u
  `.catch(() => [{ n: "0" }]);
  expired = Number(ex?.n ?? 0);

  // Eligible delivered but no job — create jobs via engine re-eval is expensive;
  // mark for admin visibility
  await processReferralRewardJobs({ limit: 50 });

  // Jobs succeeded without REWARD_NOTIFIED lifecycle
  const stuck = await sql<Array<{ id: string }>>`
    SELECT rr.id::text
    FROM referral_relationships rr
    JOIN referral_reward_jobs j ON j.referral_relationship_id = rr.id AND j.status = 'succeeded'
    WHERE rr.lifecycle_state = 'REWARD_GRANTED'
    LIMIT 50
  `.catch(() => []);
  for (const s of stuck) {
    await recordLifecycleEvent({
      relationshipId: Number(s.id),
      fromState: "REWARD_GRANTED",
      toState: "REWARD_NOTIFIED",
      eventName: "reconcile_notify",
      force: true,
    });
    missingNotified += 1;
  }

  return { requeued, expired, missingNotified };
}
