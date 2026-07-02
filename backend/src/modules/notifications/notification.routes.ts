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
  schedule,
  loadTemplate,
  listTemplates,
  previewTemplate,
  markClicked,
  sendToUser,
} from "./notificationService.js";
import { subscribeToTopic, unsubscribeFromTopic } from "./fcmProvider.js";
import { createCampaign } from "./db.js";
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

      // Immediate send path
      if (b.status === "running") {
        const tmpl = await loadTemplate(b.templateCode, "en");
        if (!tmpl) return reply.code(404).send({ error: "template_not_found" });
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
        const result = await send({
          templateCode: b.templateCode,
          variables: b.variables,
          target: b.target,
          campaignId: campaign.id,
        });
        return reply.send({ campaignId: campaign.id, ...result });
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
          SELECT id, name, description, template_code, status,
                 sent_count, delivered_count, clicked_count, failed_count,
                 scheduled_at, started_at, finished_at, created_at, created_by
          FROM public.notification_campaigns
          WHERE 1=1
            ${q.status ? sql`AND status = ${q.status}` : sql``}
          ORDER BY COALESCE(scheduled_at, created_at) DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        return { items: rows };
      },
    );

    // --- campaigns: cancel ---
    admin.post<{ Params: { id: string } }>("/campaigns/:id/cancel", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "invalid_id" });
      await cancel(id, req.auth?.sub);
      return reply.code(204).send();
    });

    // --- topics ---
    admin.post<{ Body: { tokens: string[]; topic: string } }>(
      "/topics/subscribe",
      async (req, reply) => {
        const b = req.body ?? ({} as any);
        if (!Array.isArray(b.tokens) || !b.topic) {
          return reply.code(400).send({ error: "tokens_and_topic_required" });
        }
        return reply.send(await subscribeToTopic(b.tokens, b.topic));
      },
    );
    admin.post<{ Body: { tokens: string[]; topic: string } }>(
      "/topics/unsubscribe",
      async (req, reply) => {
        const b = req.body ?? ({} as any);
        if (!Array.isArray(b.tokens) || !b.topic) {
          return reply.code(400).send({ error: "tokens_and_topic_required" });
        }
        return reply.send(await unsubscribeFromTopic(b.tokens, b.topic));
      },
    );

    // --- analytics summary (Dashboard tile data) ---
    admin.get("/analytics/summary", async () => {
      const sql = getSql();
      const today = (await sql`
        SELECT
          COUNT(*)                                          AS total,
          SUM(CASE WHEN status='sent'      THEN 1 ELSE 0 END) AS sent,
          SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status='clicked'   THEN 1 ELSE 0 END) AS clicked,
          SUM(CASE WHEN status='failed'    THEN 1 ELSE 0 END) AS failed
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
        const rows = await sql`
          SELECT id, user_id, role, device_type, expo_push_token,
                 created_at, updated_at
          FROM public.expo_push_tokens
          WHERE user_id = ${uid}
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 50
        `;
        return { items: rows };
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

    // Paged inbox
    user.get<{ Querystring: { limit?: string; offset?: string } }>("/inbox", async (req) => {
      const q = req.query ?? {};
      const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
      const offset = Math.max(0, Number(q.offset ?? 0));
      const sql = getSql();
      const rows = await sql`
        SELECT notification_id, template_code, title, body, image_url, deep_link,
               priority, status, queued_at, delivered_at, clicked_at, metadata
        FROM public.notification_dispatch_logs
        WHERE recipient_user_id = ${req.auth!.sub}
          AND channel IN ('push','in_app')
        ORDER BY queued_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const unread = await sql`
        SELECT COUNT(*) AS n
        FROM public.notification_dispatch_logs
        WHERE recipient_user_id = ${req.auth!.sub}
          AND clicked_at IS NULL
          AND channel IN ('push','in_app')
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
