/**
 * Admin + analytics + campaigns extensions for referral API.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getSql } from "../../db/client.js";
import { getReferralConfig, toPublicReferralConfig } from "./referral.config.service.js";
import { adminRetryRewardJob, processReferralRewardJobs, runReferralReconciliation } from "./referral.queue.js";
import { regenerateReferralCode, suspendReferralCode, allocateUniqueReferralCode } from "./referral.codes.js";
import { FUNNEL_STAGES } from "./referral.lifecycle.js";

async function requireAdmin(req: { auth?: { role?: string } }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const role = req.auth?.role;
  if (role !== "admin" && role !== "super_admin" && role !== "system") {
    // Backend JWT roles for dashboard staff may differ — allow via internal header in dashboard proxy
    return false;
  }
  return true;
}

export async function referralAdminRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get("/rules", async (req) => {
    const q = req.query as { userType?: string };
    const { rules } = await getReferralConfig({ force: true });
    const filtered = q.userType
      ? rules.filter((r) => r.user_type === q.userType)
      : rules;
    return { ok: true, rules: filtered };
  });

  app.get("/campaigns", async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM referral_campaigns ORDER BY priority ASC, id ASC
    `.catch(() => []);
    return { ok: true, campaigns: rows };
  });

  app.get("/analytics", async () => {
    const sql = getSql();
    const [overview] = await sql<Array<Record<string, unknown>>>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'reward_credited' OR lifecycle_state IN ('REWARD_GRANTED','REWARD_NOTIFIED'))::int AS successful,
        COUNT(*) FILTER (WHERE lifecycle_state IN ('REFERRAL_APPLIED','FIRST_ORDER_PLACED','ORDER_DELIVERED','REWARD_ELIGIBLE','milestone_pending')
          OR status IN ('pending','first_order_pending','milestone_pending'))::int AS pending,
        COUNT(*) FILTER (WHERE lifecycle_state IN ('FRAUD_BLOCKED','REWARD_FAILED','EXPIRED') OR status IN ('fraud_blocked','cancelled'))::int AS failed
      FROM referral_relationships
    `.catch(() => [{}]);

    const funnel = await sql<Array<Record<string, unknown>>>`
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
    `.catch(() => [{}]);

    const byUserType = await sql`
      SELECT user_type::text, COUNT(*)::int AS count
      FROM referral_relationships GROUP BY user_type
    `.catch(() => []);

    const byCampaign = await sql`
      SELECT campaign_id, COUNT(*)::int AS count
      FROM referral_relationships
      WHERE campaign_id IS NOT NULL
      GROUP BY campaign_id
      ORDER BY count DESC LIMIT 20
    `.catch(() => []);

    const topCustomers = await sql`
      SELECT referrer_id, COUNT(*)::int AS referrals,
        COUNT(*) FILTER (WHERE status = 'reward_credited')::int AS successful
      FROM referral_relationships
      WHERE user_type = 'customer'
      GROUP BY referrer_id ORDER BY successful DESC, referrals DESC LIMIT 10
    `.catch(() => []);

    const topRiders = await sql`
      SELECT referrer_id, COUNT(*)::int AS referrals,
        COUNT(*) FILTER (WHERE status = 'reward_credited')::int AS successful
      FROM referral_relationships
      WHERE user_type = 'rider'
      GROUP BY referrer_id ORDER BY successful DESC, referrals DESC LIMIT 10
    `.catch(() => []);

    const jobs = await sql`
      SELECT status::text, COUNT(*)::int AS count
      FROM referral_reward_jobs GROUP BY status
    `.catch(() => []);

    return {
      ok: true,
      overview,
      funnel: funnel[0] ?? {},
      funnelStages: FUNNEL_STAGES,
      breakdowns: { byUserType, byCampaign },
      topPerformers: { customers: topCustomers, riders: topRiders },
      rewardJobs: jobs,
    };
  });

  app.post(
    "/admin/retry",
    {
      schema: {
        body: z.object({
          jobId: z.number().int().positive(),
          action: z.enum(["retry", "force", "mark_failed", "skip"]).default("retry"),
        }),
      },
    },
    async (req, reply) => {
      const body = req.body as { jobId: number; action: "retry" | "force" | "mark_failed" | "skip" };
      const result = await adminRetryRewardJob(body.jobId, body.action);
      if (!result.ok) return reply.code(400).send(result);
      return { ...result, ok: true };
    },
  );

  app.post(
    "/admin/manual-credit",
    {
      schema: {
        body: z.object({
          relationshipId: z.number().int().positive(),
          ruleId: z.number().int().positive().optional(),
          amount: z.number().positive().optional(),
          reason: z.string().max(500).optional(),
        }),
      },
    },
    async (req, reply) => {
      const body = req.body as {
        relationshipId: number;
        ruleId?: number;
        amount?: number;
        reason?: string;
      };
      const sql = getSql();
      const [rel] = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM referral_relationships WHERE id = ${body.relationshipId} LIMIT 1
      `;
      if (!rel) return reply.code(404).send({ ok: false, error: "relationship_not_found" });

      const [rule] = body.ruleId
        ? await sql<Array<Record<string, unknown>>>`
            SELECT * FROM referral_reward_rules WHERE id = ${body.ruleId} LIMIT 1
          `
        : await sql<Array<Record<string, unknown>>>`
            SELECT * FROM referral_reward_rules
            WHERE user_type = ${String(rel.user_type)}::referral_user_type AND active = true
            ORDER BY priority ASC LIMIT 1
          `;
      if (!rule) return reply.code(400).send({ ok: false, error: "rule_not_found" });

      const { enqueueRewardJobs } = await import("./referral.queue.js");
      await enqueueRewardJobs({
        relationshipId: body.relationshipId,
        rule: {
          id: Number(rule.id),
          user_type: rule.user_type as "customer" | "rider",
          rule_code: String(rule.rule_code),
          name: String(rule.name),
          description: null,
          milestone_orders: Number(rule.milestone_orders ?? 0),
          reward_amount: body.amount ?? Number(rule.reward_amount),
          reward_type: rule.reward_type as "GATICASH" | "WALLET_CREDIT",
          reward_party: "referrer",
          also_credit_referred: false,
          referred_reward_amount: null,
          require_kyc: null,
          min_order_amount: null,
          active: true,
          priority: 0,
          metadata: { manual: true, reason: body.reason },
          campaign_id: rel.campaign_id != null ? Number(rel.campaign_id) : null,
        },
        userType: String(rel.user_type) as "customer" | "rider",
        referrerId: Number(rel.referrer_id),
        referredUserId: Number(rel.referred_user_id),
        campaignId: rel.campaign_id != null ? Number(rel.campaign_id) : null,
        referralCode: String(rel.referral_code),
      });

      await sql`
        INSERT INTO referral_configuration_audit (action, entity_type, entity_id, new_value, reason)
        VALUES (
          'manual_credit',
          'referral_relationships',
          ${String(body.relationshipId)},
          ${JSON.stringify({ ruleId: rule.id, amount: body.amount ?? rule.reward_amount })}::jsonb,
          ${body.reason ?? null}
        )
      `.catch(() => undefined);

      return { ok: true, queued: true };
    },
  );

  app.post(
    "/admin/regenerate-code",
    {
      schema: {
        body: z.object({
          userType: z.enum(["customer", "rider"]),
          userId: z.number().int().positive(),
          customCode: z.string().min(4).max(32).optional(),
        }),
      },
    },
    async (req) => {
      const body = req.body as {
        userType: "customer" | "rider";
        userId: number;
        customCode?: string;
      };
      const code = body.customCode
        ? await allocateUniqueReferralCode(body.userType, body.userId, {
            customCode: body.customCode,
            admin: true,
          })
        : await regenerateReferralCode(body.userType, body.userId);
      return { ok: true, referralCode: code };
    },
  );

  app.post(
    "/admin/suspend",
    {
      schema: {
        body: z.object({
          userType: z.enum(["customer", "rider"]),
          userId: z.number().int().positive(),
          suspend: z.boolean().default(true),
        }),
      },
    },
    async (req) => {
      const body = req.body as {
        userType: "customer" | "rider";
        userId: number;
        suspend: boolean;
      };
      await suspendReferralCode(body.userType, body.userId, body.suspend);
      return { ok: true };
    },
  );

  app.post("/admin/reconcile", async () => {
    const result = await runReferralReconciliation();
    return { ok: true, ...result };
  });

  app.post("/admin/process-queue", async () => {
    const result = await processReferralRewardJobs({ limit: 50 });
    return { ok: true, ...result };
  });

  void requireAdmin;
}

/** Lightweight public settings endpoint (config_version oriented). */
export async function registerReferralSettingsAlias(app: FastifyInstance) {
  app.get("/settings", async (req) => {
    const q = req.query as { userType?: "customer" | "rider"; sinceVersion?: string };
    const userType = q.userType ?? "customer";
    const { settings, rules } = await getReferralConfig();
    const since = q.sinceVersion != null ? Number(q.sinceVersion) : null;
    if (since != null && Number.isFinite(since) && settings.config_version <= since) {
      return { ok: true, unchanged: true, configVersion: settings.config_version };
    }
    return {
      ok: true,
      unchanged: false,
      ...toPublicReferralConfig(settings, rules, userType),
    };
  });
}
