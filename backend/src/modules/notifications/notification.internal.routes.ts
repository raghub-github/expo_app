/**
 * Internal server-to-server notification endpoints.
 *
 * Gated by X-Internal-Secret == BACKEND_SCHEDULE_TICK_SECRET (same secret
 * already used by dashboard + partnersite proxies).
 *
 * Endpoints:
 *   POST /v1/internal/notifications/report-dead-tokens
 *     Body: { tokens: string[] }
 *     Purges the given Expo tokens from both expo_push_tokens and
 *     merchant_store_push_tokens. Called by notification-worker whenever
 *     Expo returns DeviceNotRegistered / InvalidCredentials.
 *
 *   POST /v1/internal/notifications/smoke-test
 *     Body: { userId?: string; templateCode?: string; deviceToken?: string }
 *     Sends one test notification and returns the full log row so operators
 *     can verify the pipeline end-to-end without going through the UI.
 */
import type { FastifyPluginAsync } from "fastify";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import { send } from "./notificationService.js";

function checkSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const env = getEnv();
  const s = env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!s) return false;
  const h = headers["x-internal-secret"];
  return typeof h === "string" && h === s;
}

export const notificationInternalRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { tokens: string[] } }>(
    "/notifications/report-dead-tokens",
    async (req, reply) => {
      if (!checkSecret(req.headers)) return reply.code(401).send({ error: "unauthorized" });
      const tokens = (req.body?.tokens ?? []).filter((t): t is string => typeof t === "string" && t.length > 0);
      if (tokens.length === 0) return reply.send({ deleted: 0 });
      const sql = getSql();
      // Delete from both token tables so a re-register from the mobile app
      // starts clean.
      const a = (await sql`
        DELETE FROM public.expo_push_tokens
        WHERE token = ANY(${tokens}::text[])
        RETURNING 1
      `) as unknown as Array<unknown>;
      const b = (await sql`
        DELETE FROM public.merchant_store_push_tokens
        WHERE token = ANY(${tokens}::text[])
        RETURNING 1
      `) as unknown as Array<unknown>;
      req.log.info(
        { deleted_expo: a.length, deleted_merchant: b.length, reported: tokens.length },
        "notification_dead_tokens_purged",
      );
      return reply.send({ deleted: a.length + b.length, deleted_expo: a.length, deleted_merchant: b.length });
    },
  );

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
