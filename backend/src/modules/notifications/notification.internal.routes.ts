/**
 * Internal server-to-server notification endpoints.
 *
 * Gated by X-Internal-Secret == BACKEND_SCHEDULE_TICK_SECRET (same secret
 * already used by dashboard + partnersite proxies).
 *
 * Endpoints:
 *   POST /v1/internal/notifications/report-dead-tokens
 *   POST /v1/internal/notifications/delivery-status
 *   POST /v1/internal/notifications/smoke-test
 *   GET  /v1/internal/notifications/health
 */
import type { FastifyPluginAsync } from "fastify";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import { send } from "./notificationService.js";
import { updateLogStatus, syncCampaignCountsFromLogs } from "./db.js";
import type { NotificationStatus } from "./types.js";

function checkSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const env = getEnv();
  const s = env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!s) return false;
  const h = headers["x-internal-secret"];
  return typeof h === "string" && h === s;
}

const ALLOWED_STATUSES = new Set<NotificationStatus>([
  "sent",
  "delivered",
  "failed",
  "clicked",
  "expired",
]);

export const notificationInternalRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { tokens: string[] } }>(
    "/notifications/report-dead-tokens",
    async (req, reply) => {
      if (!checkSecret(req.headers)) return reply.code(401).send({ error: "unauthorized" });
      const tokens = (req.body?.tokens ?? []).filter((t): t is string => typeof t === "string" && t.length > 0);
      if (tokens.length === 0) return reply.send({ deleted: 0 });
      const sql = getSql();
      const a = (await sql`
        DELETE FROM public.expo_push_tokens
        WHERE expo_push_token = ANY(${tokens}::text[])
        RETURNING 1
      `) as unknown as Array<unknown>;
      const b = (await sql`
        DELETE FROM public.merchant_store_push_tokens
        WHERE token = ANY(${tokens}::text[])
        RETURNING 1
      `) as unknown as Array<unknown>;
      const c = (await sql`
        DELETE FROM public.native_device_push_tokens
        WHERE native_token = ANY(${tokens}::text[])
        RETURNING 1
      `) as unknown as Array<unknown>;
      req.log.info(
        {
          deleted_expo: a.length,
          deleted_merchant: b.length,
          deleted_native: c.length,
          reported: tokens.length,
        },
        "notification_dead_tokens_purged",
      );
      return reply.send({
        deleted: a.length + b.length + c.length,
        deleted_expo: a.length,
        deleted_merchant: b.length,
        deleted_native: c.length,
      });
    },
  );

  app.post<{
    Body: {
      updates?: Array<{
        notificationId: string;
        status: NotificationStatus;
        errorCode?: string;
        errorMessage?: string;
      }>;
    };
  }>("/notifications/delivery-status", async (req, reply) => {
    if (!checkSecret(req.headers)) return reply.code(401).send({ error: "unauthorized" });
    const updates = (req.body?.updates ?? []).filter(
      (u) =>
        u &&
        typeof u.notificationId === "string" &&
        /^[0-9a-f-]{36}$/i.test(u.notificationId) &&
        ALLOWED_STATUSES.has(u.status),
    );
    if (updates.length === 0) return reply.send({ updated: 0 });

    const campaignIds = new Set<number>();
    const sql = getSql();
    let updated = 0;
    for (const u of updates) {
      await updateLogStatus(u.notificationId, u.status, {
        errorCode: u.errorCode,
        errorMessage: u.errorMessage,
      });
      updated++;
      const rows = (await sql`
        SELECT campaign_id FROM public.notification_dispatch_logs
        WHERE notification_id = ${u.notificationId}::uuid
        LIMIT 1
      `) as unknown as Array<{ campaign_id: number | null }>;
      const cid = rows[0]?.campaign_id;
      if (cid) campaignIds.add(cid);
    }
    for (const cid of campaignIds) {
      await syncCampaignCountsFromLogs(cid);
    }
    return reply.send({ updated, campaigns: campaignIds.size });
  });

  app.post<{
    Body: {
      userId?: string;
      templateCode?: string;
      deviceToken?: string;
      variables?: Record<string, string | number | boolean | null | undefined>;
    };
  }>("/notifications/smoke-test", async (req, reply) => {
    if (!checkSecret(req.headers)) return reply.code(401).send({ error: "unauthorized" });
    const b = req.body ?? {};
    const templateCode = b.templateCode ?? "CUSTOMER_ANNOUNCEMENT";
    const vars = {
      title: "Smoke test",
      body: `pipe test @ ${new Date().toISOString()}`,
      deepLink: "/home",
      ...(b.variables ?? {}),
    };

    if (b.deviceToken) {
      const result = await send({
        templateCode,
        variables: vars,
        target: { device_token: b.deviceToken },
      });
      return reply.send({ mode: "device_token", ...result });
    }
    if (b.userId) {
      const result = await send({
        templateCode,
        variables: vars,
        target: { user_id: b.userId },
      });
      return reply.send({ mode: "user_id", ...result });
    }
    return reply.code(400).send({ error: "userId_or_deviceToken_required" });
  });

  app.get("/notifications/health", async (req, reply) => {
    if (!checkSecret(req.headers)) return reply.code(401).send({ error: "unauthorized" });
    const sql = getSql();
    const [tCount] = (await sql`SELECT COUNT(*)::int AS n FROM public.notification_templates WHERE enabled = TRUE`) as unknown as Array<{ n: number }>;
    const [lCount] = (await sql`SELECT COUNT(*)::int AS n FROM public.notification_dispatch_logs WHERE queued_at >= now() - interval '1 hour'`) as unknown as Array<{ n: number }>;
    const [fCount] = (await sql`SELECT COUNT(*)::int AS n FROM public.notification_dispatch_logs WHERE status = 'failed' AND queued_at >= now() - interval '1 hour'`) as unknown as Array<{ n: number }>;
    const [cCount] = (await sql`SELECT COUNT(*)::int AS n FROM public.notification_campaigns WHERE status IN ('scheduled','running')`) as unknown as Array<{ n: number }>;
    return reply.send({
      templates_enabled: tCount.n,
      logs_last_hour: lCount.n,
      failed_last_hour: fCount.n,
      active_campaigns: cCount.n,
    });
  });
};
