/**
 * Notification REST API.
 *
 * Three groups of endpoints:
 *
 *   1. Admin (super-admin / manager / support) — full control
 *      POST   /v1/notifications/send                     — one-off send
 *      POST   /v1/notifications/preview                  — render without sending
 *      GET    /v1/notifications/templates                — list (with filters)
 *      POST   /v1/notifications/templates                — create
 *      PATCH  /v1/notifications/templates/:id            — edit
 *      DELETE /v1/notifications/templates/:id            — disable (soft)
 *      POST   /v1/notifications/campaigns                — create draft / schedule / immediate
 *      GET    /v1/notifications/campaigns                — list
 *      POST   /v1/notifications/campaigns/:id/cancel     — cancel scheduled/running
 *      POST   /v1/notifications/campaigns/:id/resend     — resend stored campaign
 *      POST   /v1/notifications/topics/subscribe         — add tokens to topic
 *      POST   /v1/notifications/topics/unsubscribe       — remove tokens
 *      GET    /v1/notifications/analytics/summary        — dashboard counts
 *      GET    /v1/notifications/logs                     — paged history
 *
 *   2. End-user (customer / merchant / rider) — opt-outs + click tracking
 *      GET    /v1/notifications/inbox                    — paged in_app feed
 *      POST   /v1/notifications/:notificationId/click    — mark click (deep link tap)
 *      POST   /v1/notifications/:notificationId/read     — mark read
 *      POST   /v1/notifications/read-all                 — mark all read
 *      GET    /v1/notifications/preferences              — list user prefs
 *      PUT    /v1/notifications/preferences/:type        — set per-type prefs
 *
 *   3. Internal (worker / server-to-server with X-Internal-Secret)
 *      POST   /v1/internal/notifications/delivery-status — worker reports delivered/failed
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import {
  send,
  cancel,
  resendCampaign,
  schedule,
  loadTemplate,
  listTemplates,
  previewTemplate,
  markClicked,
  sendToUser,
} from "./notificationService.js";
import { subscribeToTopic, unsubscribeFromTopic } from "./fcmProvider.js";
import { createCampaign, finalizeCampaignSend, markCampaignStarted, getCampaignById } from "./db.js";
import { resolveTarget } from "./targetResolver.js";
import {
  expectedRoleFromTarget,
  templateRoleMatchesTarget,
} from "./campaignTarget.js";
import type { NotificationRole, TargetFilter, TemplateVariables } from "./types.js";

function isAdminLikeRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

/**
 * Server-to-server bypass: if the request carries the BACKEND_SCHEDULE_TICK_SECRET
 * in the X-Internal-Secret header (same secret already used by partnersite +
 * dashboard for the store-schedule-tick endpoint), grant admin access without
 * a Supabase JWT. The dashboard proxies use this so they don't need to forward
 * the user's JWT — they vouch for the user via their own Supabase session check
 * (requireSuperAdminApi) before calling the backend.
 */
function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const env = getEnv();
  const secret = env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  const header = req.headers["x-internal-secret"];
  return typeof header === "string" && header === secret;
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // ===========================================================================
  // ADMIN ENDPOINTS — protected, role gated
  //
  // Accepts either:
  //   • A Supabase JWT (Authorization: Bearer …) with role in {admin,super_admin,manager,support}
  //   • OR an X-Internal-Secret matching BACKEND_SCHEDULE_TICK_SECRET (server-to-server;
  //     the dashboard proxy uses this after verifying the super-admin session itself)
  // ===========================================================================
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin role required" });
      }
    });

    // --- one-off send (admin from User page / Order page) ---
    admin.post<{
      Body: {
        templateCode: string;
        variables?: TemplateVariables;
        target: TargetFilter;
        priority?: "low" | "normal" | "high" | "critical";
        locale?: string;
        metadata?: Record<string, unknown>;
      };
    }>("/send", async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.templateCode || !b.target) {
        return reply.code(400).send({ error: "templateCode_and_target_required" });
      }
      const result = await send({
        templateCode: b.templateCode,
        variables: b.variables,
        target: b.target,
        priority: b.priority,
        locale: b.locale,
        metadata: b.metadata,
      });
      return reply.send(result);
    });

    // --- preview without sending ---
    admin.post<{ Body: { templateCode: string; variables?: TemplateVariables; locale?: string } }>(
      "/preview",
      async (req, reply) => {
        const b = req.body ?? ({} as any);
        if (!b.templateCode) return reply.code(400).send({ error: "templateCode_required" });
        const result = await previewTemplate(b.templateCode, b.variables ?? {}, b.locale);
        if (!result) return reply.code(404).send({ error: "template_not_found" });
        return reply.send(result);
      },
    );

    // --- templates: list ---
    admin.get<{ Querystring: { category?: string; role?: string; enabled?: string } }>(
      "/templates",
      async (req) => {
        const q = req.query ?? {};
        return {
          items: await listTemplates({
            category: q.category,
            role: q.role,
            enabled: q.enabled === undefined ? undefined : q.enabled === "true",
          }),
        };
      },
    );

    // --- templates: create ---
    admin.post<{
      Body: {
        code: string;
        category: string;
        role: NotificationRole;
        channel?: string;
        title_template: string;
        body_template: string;
        image_url?: string;
        deep_link?: string;
        priority?: string;
        locale?: string;
        variables_schema?: Record<string, string>;
        buttons?: Array<{ label: string; action: string; deepLink?: string }>;
        retry_count?: number;
        expiry_seconds?: number;
      };
    }>("/templates", async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.code || !b.title_template || !b.body_template || !b.category || !b.role) {
        return reply.code(400).send({ error: "missing_required_fields" });
      }
      const sql = getSql();
      // Send jsonb as text + ::jsonb cast — `sql.json(...)` crashes over the
      // Supabase pooler.
      const variablesSchemaStr = JSON.stringify(b.variables_schema ?? {});
      const buttonsStr = b.buttons ? JSON.stringify(b.buttons) : null;
      const rows = (await sql`
        INSERT INTO public.notification_templates (
          code, category, role, channel, title_template, body_template,
          image_url, deep_link, priority, locale, variables_schema, buttons,
          retry_count, expiry_seconds, updated_by
        )
        VALUES (
          ${b.code}, ${b.category}, ${b.role}, ${b.channel ?? "push"},
          ${b.title_template}, ${b.body_template},
          ${b.image_url ?? null}, ${b.deep_link ?? null},
          ${b.priority ?? "normal"}, ${b.locale ?? "en"},
          ${variablesSchemaStr}::jsonb,
          ${buttonsStr === null ? null : sql`${buttonsStr}::jsonb`},
          ${b.retry_count ?? 3}, ${b.expiry_seconds ?? 86400},
          ${req.auth?.sub ?? null}
        )
        ON CONFLICT (code, locale) DO UPDATE SET
          title_template = EXCLUDED.title_template,
          body_template  = EXCLUDED.body_template,
          image_url      = EXCLUDED.image_url,
          deep_link      = EXCLUDED.deep_link,
          version        = notification_templates.version + 1,
          updated_at     = now(),
          updated_by     = EXCLUDED.updated_by
        RETURNING id
      `) as unknown as Array<{ id: number }>;
      return reply.send({ id: rows[0]!.id, code: b.code });
    });

    // --- templates: edit ---
    admin.patch<{
      Params: { id: string };
      Body: Partial<{
        title_template: string;
        body_template: string;
        image_url: string | null;
        deep_link: string | null;
        priority: string;
        enabled: boolean;
        retry_count: number;
        expiry_seconds: number;
      }>;
    }>("/templates/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      const b = req.body ?? {};
      const sql = getSql();
      const rows = (await sql`
        UPDATE public.notification_templates SET
          title_template = COALESCE(${b.title_template ?? null}, title_template),
          body_template  = COALESCE(${b.body_template ?? null}, body_template),
          image_url      = COALESCE(${b.image_url ?? null}, image_url),
          deep_link      = COALESCE(${b.deep_link ?? null}, deep_link),
          priority       = COALESCE(${b.priority ?? null}, priority),
          enabled        = COALESCE(${b.enabled ?? null}, enabled),
          retry_count    = COALESCE(${b.retry_count ?? null}, retry_count),
          expiry_seconds = COALESCE(${b.expiry_seconds ?? null}, expiry_seconds),
          version        = version + 1,
          updated_by     = ${req.auth?.sub ?? null}
        WHERE id = ${id}
        RETURNING id, code, version
      `) as unknown as Array<{ id: number; code: string; version: number }>;
      if (rows.length === 0) return reply.code(404).send({ error: "not_found" });
      return reply.send(rows[0]);
    });

    // --- templates: disable (soft delete) ---
    admin.delete<{ Params: { id: string } }>("/templates/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      const sql = getSql();
      await sql`UPDATE public.notification_templates SET enabled = FALSE, updated_by = ${req.auth?.sub ?? null} WHERE id = ${id}`;
      return reply.code(204).send();
    });

    // --- campaigns: create ---
    admin.post<{
      Body: {
        name: string;
        description?: string;
        templateCode: string;
        target: TargetFilter;
        variables?: TemplateVariables;
        scheduledAt?: string;
        status?: "draft" | "scheduled" | "running";
        overrideTitle?: string;
        overrideBody?: string;
        overrideImage?: string;
        overrideDeepLink?: string;
      };
    }>("/campaigns", async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.name || !b.templateCode || !b.target) {
        return reply.code(400).send({ error: "missing_required_fields" });
      }

      const tmplCheck = await loadTemplate(b.templateCode, "en");
      if (!tmplCheck) return reply.code(404).send({ error: "template_not_found" });
      const expectedRole = expectedRoleFromTarget(b.target as Record<string, unknown>);
      if (!templateRoleMatchesTarget(String(tmplCheck.role), expectedRole)) {
        return reply.code(400).send({
          error: "role_mismatch",
          message: `Template ${b.templateCode} is for role "${tmplCheck.role}" but target is "${expectedRole}". Pick ${expectedRole === "customer" ? "CUSTOMER_ANNOUNCEMENT" : expectedRole === "merchant" ? "MERCHANT_ANNOUNCEMENT" : expectedRole === "rider" ? "RIDER_ANNOUNCEMENT" : "a matching"} template.`,
          templateRole: tmplCheck.role,
          targetRole: expectedRole,
        });
      }

      // Immediate send path — create as running, send synchronously, then finalize status.
      if (b.status === "running") {
        const tmpl = tmplCheck;
        const campaign = await createCampaign({
          name: b.name,
          description: b.description ?? null,
          templateCode: b.templateCode,
          overrideTitle: b.overrideTitle ?? null,
          overrideBody: b.overrideBody ?? null,
          overrideImage: b.overrideImage ?? null,
          overrideDeepLink: b.overrideDeepLink ?? null,
          targetFilter: b.target as unknown as Record<string, unknown>,
          variables: b.variables as Record<string, unknown> | undefined,
          status: "running",
          createdBy: req.auth?.sub ?? null,
        });
        await markCampaignStarted(campaign.id);
        try {
          const roleDefaultDeepLink =
            String(tmpl.role).toLowerCase() === "merchant"
              ? "/notifications"
              : String(tmpl.role).toLowerCase() === "rider"
                ? "/notifications"
                : "/notifications";
          const result = await send({
            templateCode: b.templateCode,
            variables: b.variables,
            target: b.target,
            campaignId: campaign.id,
            overrides: {
              title: b.overrideTitle ?? null,
              body: b.overrideBody ?? null,
              imageUrl: b.overrideImage ?? null,
              deepLink: b.overrideDeepLink?.trim() || roleDefaultDeepLink,
            },
            metadata: {
              gmType: b.templateCode,
              campaign: true,
            },
          });
          // Missing push tokens / quiet hours are soft outcomes — never 400.
          // Campaign stays completed; dashboard shows a warning, not an error.
          if (result.skipReason === "no_recipients" || result.skipReason === "quiet_hours") {
            await finalizeCampaignSend(campaign.id, "completed");
            req.log.warn(
              {
                campaignId: campaign.id,
                skipReason: result.skipReason,
                templateCode: b.templateCode,
              },
              "Push token unavailable or quiet hours — campaign completed with 0 push deliveries",
            );
            return reply.send({
              campaignId: campaign.id,
              status: "completed",
              warning:
                result.skipReason === "quiet_hours"
                  ? "Quiet hours active — push skipped. Campaign recorded."
                  : "Push token unavailable. Skipping notification — no registered devices for this target (common in Expo Go). Campaign recorded.",
              ...result,
            });
          }
          if (result.skipReason) {
            await finalizeCampaignSend(campaign.id, "failed");
            return reply.code(400).send({
              error: result.skipReason,
              campaignId: campaign.id,
              message: result.skipReason,
              ...result,
            });
          }
          await finalizeCampaignSend(campaign.id, "completed");
          return reply.send({ campaignId: campaign.id, status: "completed", ...result });
        } catch (e) {
          req.log.error({ err: e, campaignId: campaign.id }, "notification_campaign_send_failed");
          await finalizeCampaignSend(campaign.id, "failed");
          return reply.code(500).send({
            error: "send_failed",
            campaignId: campaign.id,
            message: (e as Error).message,
          });
        }
      }

      // Scheduled send path
      if (b.scheduledAt) {
        const scheduled = await schedule({
          name: b.name,
          templateCode: b.templateCode,
          target: b.target,
          variables: b.variables,
          scheduledAt: new Date(b.scheduledAt),
          createdBy: req.auth?.sub ?? null,
          overrideTitle: b.overrideTitle ?? null,
          overrideBody: b.overrideBody ?? null,
          overrideImage: b.overrideImage ?? null,
          overrideDeepLink: b.overrideDeepLink ?? null,
        });
        return reply.send(scheduled);
      }

      // Otherwise draft
      const campaign = await createCampaign({
        name: b.name,
        description: b.description ?? null,
        templateCode: b.templateCode,
        overrideTitle: b.overrideTitle ?? null,
        overrideBody: b.overrideBody ?? null,
        overrideImage: b.overrideImage ?? null,
        overrideDeepLink: b.overrideDeepLink ?? null,
        targetFilter: b.target as unknown as Record<string, unknown>,
        variables: b.variables as Record<string, unknown> | undefined,
        status: "draft",
        createdBy: req.auth?.sub ?? null,
      });
      return reply.send({ campaignId: campaign.id, status: "draft" });
    });

    // --- campaigns: list ---
    admin.get<{ Querystring: { status?: string; limit?: string; offset?: string } }>(
      "/campaigns",
      async (req) => {
        const q = req.query ?? {};
        const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
        const offset = Math.max(0, Number(q.offset ?? 0));
        const sql = getSql();
        const rows = await sql`
          SELECT
            c.id,
            c.name,
            c.description,
            c.template_code,
            c.status,
            COALESCE(stats.sent_count, 0)::int      AS sent_count,
            COALESCE(stats.delivered_count, 0)::int AS delivered_count,
            COALESCE(stats.clicked_count, 0)::int   AS clicked_count,
            COALESCE(stats.failed_count, 0)::int    AS failed_count,
            c.scheduled_at,
            c.started_at,
            c.finished_at,
            c.created_at,
            c.created_by
          FROM public.notification_campaigns c
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (
                WHERE l.status IN ('sent', 'delivered', 'clicked')
              )::int AS sent_count,
              COUNT(*) FILTER (
                WHERE l.status IN ('delivered', 'clicked')
              )::int AS delivered_count,
              COUNT(*) FILTER (WHERE l.status = 'clicked')::int AS clicked_count,
              COUNT(*) FILTER (WHERE l.status = 'failed')::int AS failed_count
            FROM public.notification_dispatch_logs l
            WHERE l.campaign_id = c.id
          ) stats ON true
          WHERE 1=1
            ${q.status ? sql`AND c.status = ${q.status}` : sql``}
          ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        return { items: rows };
      },
    );

    admin.get<{ Params: { id: string } }>("/campaigns/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      const campaign = await getCampaignById(id);
      if (!campaign) return reply.code(404).send({ error: "not_found" });
      const recipients = await resolveTarget(campaign.target_filter as TargetFilter);
      const sql = getSql();
      const [tokenStats] = (await sql`
        SELECT
          (SELECT COUNT(*)::int FROM public.expo_push_tokens) AS expo_tokens,
          (SELECT COUNT(*)::int FROM public.merchant_store_push_tokens) AS merchant_store_tokens,
          (SELECT COUNT(*)::int FROM public.native_device_push_tokens WHERE token_type = 'fcm') AS native_fcm_tokens
      `) as unknown as Array<{
        expo_tokens: number;
        merchant_store_tokens: number;
        native_fcm_tokens: number;
      }>;
      return reply.send({
        ...campaign,
        recipient_estimate: recipients.length,
        token_stats: tokenStats ?? {
          expo_tokens: 0,
          merchant_store_tokens: 0,
          native_fcm_tokens: 0,
        },
      });
    });

    // --- campaigns: cancel ---
    admin.post<{ Params: { id: string } }>("/campaigns/:id/cancel", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      const ok = await cancel(id, req.auth?.sub);
      if (!ok) return reply.code(409).send({ error: "not_cancellable", message: "Campaign is not scheduled or running." });
      return reply.send({ ok: true, campaignId: id, status: "cancelled" });
    });

    // --- campaigns: resend (same template / target / variables) ---
    admin.post<{ Params: { id: string } }>("/campaigns/:id/resend", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      try {
        const result = await resendCampaign(id);
        return reply.send(result);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const code = err.statusCode ?? 500;
        if (code === 404) {
          return reply.code(404).send({ error: err.message, message: "Campaign not found." });
        }
        if (code === 409) {
          return reply.code(409).send({
            error: "campaign_busy",
            message: "Cancel or wait for the campaign to finish before resending.",
          });
        }
        if (code === 400) {
          return reply.code(400).send({ error: err.message, message: "Campaign has no template." });
        }
        req.log.error({ err: e, campaignId: id }, "notification_campaign_resend_failed");
        return reply.code(500).send({
          error: "resend_failed",
          message: err.message ?? "Resend failed.",
        });
      }
    });

    // --- topics ---
    admin.post<{ Body: { tokens: string[]; topic: string } }>(
      "/topics/subscribe",
      async (req, reply) => {
        const b = req.body ?? ({} as any);
        if (!Array.isArray(b.tokens) || !b.topic) {
          return reply.code(400).send({ error: "tokens_and_topic_required" });
        }
        const { isExpoPushTokenString } = await import("@gatimitra/contracts");
        const tokens = b.tokens.filter(
          (t: unknown): t is string => typeof t === "string" && t.length > 0 && !isExpoPushTokenString(t)
        );
        if (tokens.length === 0) {
          return reply.code(400).send({
            error: "no_valid_fcm_tokens",
            message: "Expo push tokens cannot be subscribed to FCM topics.",
          });
        }
        return reply.send(await subscribeToTopic(tokens, b.topic));
      },
    );
    admin.post<{ Body: { tokens: string[]; topic: string } }>(
      "/topics/unsubscribe",
      async (req, reply) => {
        const b = req.body ?? ({} as any);
        if (!Array.isArray(b.tokens) || !b.topic) {
          return reply.code(400).send({ error: "tokens_and_topic_required" });
        }
        const { isExpoPushTokenString } = await import("@gatimitra/contracts");
        const tokens = b.tokens.filter(
          (t: unknown): t is string => typeof t === "string" && t.length > 0 && !isExpoPushTokenString(t)
        );
        if (tokens.length === 0) {
          return reply.code(400).send({
            error: "no_valid_fcm_tokens",
            message: "Expo push tokens cannot be unsubscribed from FCM topics.",
          });
        }
        return reply.send(await unsubscribeFromTopic(tokens, b.topic));
      },
    );

    // --- analytics summary (Dashboard tile data) ---
    admin.get("/analytics/summary", async () => {
      const sql = getSql();
      const today = (await sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('sent','delivered','clicked') THEN 1 ELSE 0 END) AS sent,
          SUM(CASE WHEN status IN ('delivered','clicked') THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status='clicked' THEN 1 ELSE 0 END) AS clicked,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
        FROM public.notification_dispatch_logs
        WHERE queued_at >= date_trunc('day', now())
      `) as unknown as Array<{ total: string; sent: string; delivered: string; clicked: string; failed: string }>;

      const top = (await sql`
        SELECT template_code, COUNT(*) AS n
        FROM public.notification_dispatch_logs
        WHERE queued_at >= now() - interval '7 days' AND template_code IS NOT NULL
        GROUP BY template_code
        ORDER BY n DESC
        LIMIT 5
      `) as unknown as Array<{ template_code: string; n: string }>;

      const topCampaigns = (await sql`
        SELECT id, name, clicked_count, sent_count
        FROM public.notification_campaigns
        WHERE created_at >= now() - interval '30 days'
        ORDER BY clicked_count DESC
        LIMIT 5
      `);

      const t = today[0]!;
      const sentNum = Number(t.sent ?? 0);
      const deliveredNum = Number(t.delivered ?? 0);
      const clickedNum = Number(t.clicked ?? 0);
      return {
        today: {
          total: Number(t.total ?? 0),
          sent: sentNum,
          delivered: deliveredNum,
          clicked: clickedNum,
          failed: Number(t.failed ?? 0),
          read_rate: sentNum > 0 ? deliveredNum / sentNum : 0,
          ctr: sentNum > 0 ? clickedNum / sentNum : 0,
        },
        top_templates_7d: top,
        top_campaigns_30d: topCampaigns,
      };
    });

    // --- browser / web FCM token registration (partnersite + dashboard) ---
    admin.post<{
      Body: {
        token?: string;
        platform?: string;
        user_id?: string;
        role?: string;
        store_id?: number;
        source?: string;
      };
    }>("/browser-tokens", async (req, reply) => {
      const b = req.body ?? {};
      const token = String(b.token ?? "").trim();
      const userId = String(b.user_id ?? req.auth?.sub ?? "").trim();
      if (!token || token.length < 8) {
        return reply.code(400).send({ error: "token_required" });
      }
      if (!userId) {
        return reply.code(400).send({ error: "user_id_required" });
      }
      const { isExpoPushTokenString } = await import("@gatimitra/contracts");
      if (isExpoPushTokenString(token)) {
        return reply.code(400).send({
          error: "expo_token_not_allowed",
          message: "Browser endpoint accepts native FCM web tokens only.",
        });
      }
      const roleRaw = String(b.role ?? req.auth?.role ?? "merchant").toLowerCase();
      const role =
        roleRaw === "customer" || roleRaw === "rider" || roleRaw === "admin" || roleRaw === "merchant"
          ? roleRaw
          : "merchant";
      const sourceRaw = String(b.source ?? "browser").toLowerCase();
      const source = ["app", "partnersite", "dashboard", "browser"].includes(sourceRaw)
        ? sourceRaw
        : "browser";
      const storeId =
        typeof b.store_id === "number" && Number.isFinite(b.store_id) && b.store_id > 0
          ? b.store_id
          : null;
      const sql = getSql();
      try {
        await sql`
          INSERT INTO public.native_device_push_tokens (
            user_id, role, platform, token_type, native_token, store_id,
            subscribed_topics, source, created_at, updated_at, last_seen_at
          ) VALUES (
            ${userId}, ${role}, ${"web"}, ${"fcm"}, ${token}, ${storeId},
            ${JSON.stringify([])}::jsonb, ${source}, NOW(), NOW(), NOW()
          )
          ON CONFLICT (native_token) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            role = EXCLUDED.role,
            platform = EXCLUDED.platform,
            store_id = COALESCE(EXCLUDED.store_id, public.native_device_push_tokens.store_id),
            source = EXCLUDED.source,
            updated_at = NOW(),
            last_seen_at = NOW()
        `;
      } catch (e) {
        req.log.error({ err: e }, "browser_token_register_failed");
        return reply.code(500).send({
          error: "native_token_table_unavailable",
          message: "Apply migration 0436_native_device_push_tokens.sql then retry.",
        });
      }
      return reply.send({ ok: true });
    });

    // --- devices: list registered push tokens for a user_id ---
    // Powers the "Devices" super-admin page. Returns tokens across roles
    // (customer / merchant / rider) so support can confirm which apps a user
    // is signed into and see when each device last checked in.
    admin.get<{ Querystring: { user_id?: string } }>(
      "/devices",
      async (req, reply) => {
        const uid = (req.query?.user_id ?? "").trim();
        if (!uid) return reply.code(400).send({ error: "user_id_required" });
        const sql = getSql();
        const expo = await sql`
          SELECT id, user_id, role, device_type AS platform, expo_push_token AS token,
                 'expo'::text AS token_kind, created_at, updated_at AS last_seen_at
          FROM public.expo_push_tokens
          WHERE user_id = ${uid}
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 50
        `;
        let native: unknown[] = [];
        try {
          native = [
            ...(await sql`
              SELECT id, user_id, role, platform, native_token AS token,
                     token_type AS token_kind, source, created_at, last_seen_at
              FROM public.native_device_push_tokens
              WHERE user_id = ${uid}
              ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
              LIMIT 50
            `),
          ];
        } catch {
          native = [];
        }
        return { items: [...(expo as unknown[]), ...native] };
      },
    );

    // --- logs (paged) ---
    admin.get<{ Querystring: { user_id?: string; status?: string; template?: string; campaign?: string; limit?: string; offset?: string } }>(
      "/logs",
      async (req) => {
        const q = req.query ?? {};
        const limit = Math.min(500, Math.max(1, Number(q.limit ?? 100)));
        const offset = Math.max(0, Number(q.offset ?? 0));
        const sql = getSql();
        const rows = await sql`
          SELECT id, notification_id, campaign_id, template_code,
                 recipient_user_id, recipient_role, platform, channel,
                 title, body, deep_link, status, error_code, error_message,
                 queued_at, sent_at, delivered_at, clicked_at
          FROM public.notification_dispatch_logs
          WHERE 1=1
            ${q.user_id ? sql`AND recipient_user_id = ${q.user_id}` : sql``}
            ${q.status ? sql`AND status = ${q.status}` : sql``}
            ${q.template ? sql`AND template_code = ${q.template}` : sql``}
            ${q.campaign ? sql`AND campaign_id = ${Number(q.campaign)}` : sql``}
          ORDER BY queued_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        return { items: rows };
      },
    );
  }, { prefix: "/v1/notifications" });

  // ===========================================================================
  // END-USER ENDPOINTS — authenticated as the recipient
  // ===========================================================================
  await app.register(async (user) => {
    await user.register(auth, { required: true });

    // Paged inbox — prefer in_app rows; include push-only rows that have no in_app twin
    // (avoids showing duplicate cards when channel=all wrote both push + in_app).
    user.get<{ Querystring: { limit?: string; offset?: string } }>("/inbox", async (req) => {
      const q = req.query ?? {};
      const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
      const offset = Math.max(0, Number(q.offset ?? 0));
      const sql = getSql();
      const rows = await sql`
        SELECT notification_id, template_code, title, body, image_url, deep_link,
               priority, status, queued_at, delivered_at, clicked_at, metadata
        FROM public.notification_dispatch_logs d
        WHERE recipient_user_id = ${req.auth!.sub}
          AND (
            channel = 'in_app'
            OR (
              channel = 'push'
              AND NOT EXISTS (
                SELECT 1
                FROM public.notification_dispatch_logs i
                WHERE i.recipient_user_id = d.recipient_user_id
                  AND i.channel = 'in_app'
                  AND i.title IS NOT DISTINCT FROM d.title
                  AND i.body IS NOT DISTINCT FROM d.body
                  AND abs(extract(epoch from (i.queued_at - d.queued_at))) < 30
              )
            )
          )
        ORDER BY queued_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const unread = await sql`
        SELECT COUNT(*) AS n
        FROM public.notification_dispatch_logs d
        WHERE recipient_user_id = ${req.auth!.sub}
          AND clicked_at IS NULL
          AND (
            channel = 'in_app'
            OR (
              channel = 'push'
              AND NOT EXISTS (
                SELECT 1
                FROM public.notification_dispatch_logs i
                WHERE i.recipient_user_id = d.recipient_user_id
                  AND i.channel = 'in_app'
                  AND i.title IS NOT DISTINCT FROM d.title
                  AND i.body IS NOT DISTINCT FROM d.body
                  AND abs(extract(epoch from (i.queued_at - d.queued_at))) < 30
              )
            )
          )
      `;
      return { items: rows, unread: Number((unread[0] as { n: string }).n ?? 0) };
    });

    // Mark click (called when the user taps the deep link)
    user.post<{ Params: { notificationId: string } }>("/:notificationId/click", async (req, reply) => {
      const nid = req.params.notificationId;
      if (!/^[0-9a-f-]{36}$/i.test(nid)) return reply.code(400).send({ error: "invalid_id" });
      await markClicked(nid);
      return reply.code(204).send();
    });

    // Mark read (no clicked_at set; just status change so the inbox dot clears)
    user.post<{ Params: { notificationId: string } }>("/:notificationId/read", async (req, reply) => {
      const nid = req.params.notificationId;
      if (!/^[0-9a-f-]{36}$/i.test(nid)) return reply.code(400).send({ error: "invalid_id" });
      const sql = getSql();
      await sql`
        UPDATE public.notification_dispatch_logs
        SET status = CASE WHEN status IN ('queued','sent') THEN 'delivered' ELSE status END
        WHERE notification_id = ${nid}::uuid AND recipient_user_id = ${req.auth!.sub}
      `;
      return reply.code(204).send();
    });

    user.post("/read-all", async (req, reply) => {
      const sql = getSql();
      await sql`
        UPDATE public.notification_dispatch_logs
        SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
        WHERE recipient_user_id = ${req.auth!.sub} AND status IN ('queued','sent')
      `;
      return reply.code(204).send();
    });

    // Get / set user preferences
    user.get("/preferences", async (req) => {
      const sql = getSql();
      const rows = await sql`
        SELECT type, push, in_app, browser, email
        FROM public.notification_user_prefs
        WHERE user_id = ${req.auth!.sub}
      `;
      return { items: rows };
    });
    user.put<{
      Params: { type: string };
      Body: { push?: boolean; in_app?: boolean; browser?: boolean; email?: boolean };
    }>("/preferences/:type", async (req, reply) => {
      const type = req.params.type;
      const b = req.body ?? {};
      const sql = getSql();
      await sql`
        INSERT INTO public.notification_user_prefs (user_id, type, push, in_app, browser, email)
        VALUES (
          ${req.auth!.sub}, ${type},
          ${b.push ?? true}, ${b.in_app ?? true}, ${b.browser ?? true}, ${b.email ?? false}
        )
        ON CONFLICT (user_id, type) DO UPDATE SET
          push = EXCLUDED.push, in_app = EXCLUDED.in_app,
          browser = EXCLUDED.browser, email = EXCLUDED.email
      `;
      return reply.code(204).send();
    });
  }, { prefix: "/v1/notifications" });

  // ===========================================================================
  // ADMIN UTILITY — send to single user by id (used from User detail page)
  // ===========================================================================
  await app.register(async (adminUser) => {
    await adminUser.register(auth, { required: false });
    adminUser.addHook("preHandler", async (req, reply) => {
      if (internalSecretGrantsAdmin(req)) return;
      if (!isAdminLikeRole(req.auth?.role ?? "")) {
        return reply.code(403).send({ error: "forbidden" });
      }
    });
    adminUser.post<{
      Params: { userId: string };
      Body: { templateCode: string; variables?: TemplateVariables; priority?: "low" | "normal" | "high" | "critical" };
    }>("/users/:userId/send", async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.templateCode) return reply.code(400).send({ error: "templateCode_required" });
      const result = await sendToUser(req.params.userId, b.templateCode, b.variables, {
        priority: b.priority,
      });
      return reply.send(result);
    });
  }, { prefix: "/v1/notifications/admin" });
};
