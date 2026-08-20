/**
 * Admin Order Details → send a customer-only push for the opened order.
 *
 * POST /v1/admin/orders/:orderId/notifications/send
 * GET  /v1/admin/orders/notification-templates
 * GET  /v1/admin/orders/:orderId/notifications  (history from dispatch logs + agent table)
 *
 * Auth: X-Internal-Secret (dashboard BFF) or admin JWT.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import { send, previewTemplate, listTemplates } from "../notifications/notificationService.js";
import { readSetting } from "../notifications/db.js";
import type { TemplateVariables } from "../notifications/types.js";

function isAdminLikeRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

/** Lifecycle events sent automatically — blocked from Order Details manual send. */
const AUTO_ONLY_ADMIN_CX_CODES = new Set([
  "ADMIN_CX_DELIVERY_OTP",
  "ADMIN_CX_PICKUP_OTP",
  "ADMIN_CX_ORDER_DELIVERED",
  "ADMIN_CX_PICKUP_COMPLETED",
  "ADMIN_CX_REFUND_COMPLETED",
  "ADMIN_CX_REFUND_INITIATED",
  "ADMIN_CX_RIDER_ASSIGNED",
  "ADMIN_CX_RIDER_REASSIGNED",
  "ADMIN_CX_RIDER_NEAR_DELIVERY",
  "ADMIN_CX_RIDER_NEAR_PICKUP",
  "ADMIN_CX_SUPPORT_WORKING",
]);

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  const header = req.headers["x-internal-secret"];
  return typeof header === "string" && header === secret;
}

type OrderCxContext = {
  ordersCorePk: number;
  orderIdText: string;
  customerUserId: string;
  customerName: string | null;
  merchantName: string | null;
  riderName: string | null;
  pickupOtp: string | null;
  deliveryOtp: string | null;
};

async function resolveOrderCxContext(orderIdParam: string): Promise<OrderCxContext | null> {
  const sql = getSql();
  const raw = String(orderIdParam ?? "").trim();
  if (!raw) return null;

  const isNumeric = /^\d+$/.test(raw);
  const rows = (await sql`
    SELECT
      oc.id AS orders_core_pk,
      COALESCE(NULLIF(TRIM(oc.formatted_order_id), ''), oc.order_id) AS order_id_text,
      c.customer_id AS customer_user_id,
      NULLIF(TRIM(c.full_name), '') AS customer_name,
      NULLIF(TRIM(oc.pickup_otp), '') AS pickup_otp,
      NULLIF(TRIM(oc.delivery_otp), '') AS delivery_otp,
      ofood.merchant_store_id AS merchant_store_id,
      ofood.rider_id AS food_rider_id,
      NULLIF(TRIM(ofood.rider_name), '') AS food_rider_name
    FROM public.orders_core oc
    LEFT JOIN public.customers c ON c.id = oc.customer_id
    LEFT JOIN public.orders_food ofood ON ofood.order_id = oc.id
    WHERE ${isNumeric ? sql`oc.id = ${Number(raw)}` : sql`(oc.order_id = ${raw} OR oc.formatted_order_id = ${raw})`}
    LIMIT 1
  `) as unknown as Array<{
    orders_core_pk: number;
    order_id_text: string;
    customer_user_id: string | null;
    customer_name: string | null;
    pickup_otp: string | null;
    delivery_otp: string | null;
    merchant_store_id: number | null;
    food_rider_id: number | null;
    food_rider_name: string | null;
  }>;

  const row = rows[0];
  if (!row?.customer_user_id) return null;

  let merchantName: string | null = null;
  if (row.merchant_store_id) {
    try {
      const stores = (await sql`
        SELECT NULLIF(TRIM(store_name), '') AS store_label
        FROM public.merchant_stores
        WHERE id = ${row.merchant_store_id}
        LIMIT 1
      `) as unknown as Array<{ store_label: string | null }>;
      merchantName = stores[0]?.store_label ?? null;
    } catch {
      merchantName = null;
    }
  }

  let riderName = row.food_rider_name;
  try {
    const assign = (await sql`
      SELECT NULLIF(TRIM(rider_name), '') AS rider_name, rider_id
      FROM public.order_rider_assignments
      WHERE (order_core_id = ${row.orders_core_pk} OR order_id = ${row.orders_core_pk})
        AND cancelled_at IS NULL
        AND unassigned_at IS NULL
      ORDER BY is_active DESC NULLS LAST, assigned_at DESC NULLS LAST
      LIMIT 1
    `) as unknown as Array<{ rider_name: string | null; rider_id: number | null }>;
    if (assign[0]?.rider_name) riderName = assign[0].rider_name;
    const riderId = assign[0]?.rider_id ?? row.food_rider_id;
    if (!riderName && riderId) {
      const r = (await sql`
        SELECT NULLIF(TRIM(name), '') AS name FROM public.riders WHERE id = ${riderId} LIMIT 1
      `) as unknown as Array<{ name: string | null }>;
      riderName = r[0]?.name ?? null;
    }
  } catch {
    /* optional */
  }

  return {
    ordersCorePk: Number(row.orders_core_pk),
    orderIdText: String(row.order_id_text),
    customerUserId: String(row.customer_user_id),
    customerName: row.customer_name,
    merchantName,
    riderName,
    pickupOtp: row.pickup_otp,
    deliveryOtp: row.delivery_otp,
  };
}

function buildVariables(
  ctx: OrderCxContext,
  extras?: { title?: string; body?: string },
): TemplateVariables {
  return {
    orderId: ctx.orderIdText,
    orderShortId: ctx.orderIdText,
    customerName: ctx.customerName ?? "Customer",
    merchantName: ctx.merchantName ?? "the restaurant",
    riderName: ctx.riderName ?? "Your delivery partner",
    pickupOtp: ctx.pickupOtp ?? "",
    deliveryOtp: ctx.deliveryOtp ?? "",
    title: extras?.title ?? "",
    body: extras?.body ?? "",
  };
}

async function recordAgentHistory(opts: {
  ordersCorePk: number;
  message: string;
  title?: string | null;
  body?: string | null;
  templateCode: string;
  notificationIds: string[];
  sentByEmail?: string | null;
  sentByName?: string | null;
  sentByRole?: string | null;
}): Promise<number | null> {
  const sql = getSql();
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS order_cx_agent_notifications (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        sent_by_email TEXT,
        sent_by_name TEXT,
        sent_by_role TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notification_metadata JSONB DEFAULT '{}'::jsonb
      )
    `;
  } catch {
    /* table may already exist with FK */
  }
  const metadata = JSON.stringify({
    channel: "dashboard_manual_push",
    template_code: opts.templateCode,
    title: opts.title ?? null,
    body: opts.body ?? null,
    notification_ids: opts.notificationIds,
    backend_driven: true,
  });
  const rows = (await sql`
    INSERT INTO order_cx_agent_notifications (
      order_id, message, sent_by_email, sent_by_name, sent_by_role, notification_metadata
    ) VALUES (
      ${opts.ordersCorePk},
      ${opts.message},
      ${opts.sentByEmail ?? null},
      ${opts.sentByName ?? null},
      ${opts.sentByRole ?? "AGENT"},
      ${metadata}::text::jsonb
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

export const orderCxNotificationAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(auth, { required: false });
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (internalSecretGrantsAdmin(req)) return;
    const role = req.auth?.role ?? "";
    if (!req.auth?.sub || !isAdminLikeRole(role)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/notification-templates", async () => {
    const all = await listTemplates({ role: "customer", enabled: true });
    const adminCx = all.filter(
      (t) =>
        String(t.code).startsWith("ADMIN_CX_") &&
        !AUTO_ONLY_ADMIN_CX_CODES.has(String(t.code))
    );
    const labels =
      (await readSetting<Record<string, string>>("admin_cx_template_labels")) ?? {};
    const items = adminCx.map((t) => ({
      code: t.code,
      label: labels[t.code] ?? t.code.replace(/^ADMIN_CX_/, "").replace(/_/g, " "),
      title_template: t.title_template,
      body_template: t.body_template,
      deep_link: t.deep_link,
      priority: t.priority,
      category: t.category,
      allow_edit: true,
      is_custom: t.code === "ADMIN_CX_CUSTOM",
    }));
    // Stable PRD order via labels map insertion is not guaranteed — sort by label.
    items.sort((a, b) => {
      if (a.is_custom) return 1;
      if (b.is_custom) return -1;
      return a.label.localeCompare(b.label);
    });
    return { items };
  });

  app.get<{ Params: { orderId: string } }>("/:orderId/notifications", async (req, reply) => {
    const ctx = await resolveOrderCxContext(req.params.orderId);
    if (!ctx) return reply.code(404).send({ error: "order_or_customer_not_found" });
    const sql = getSql();
    let agentRows: unknown[] = [];
    try {
      agentRows = (await sql`
        SELECT id, message, sent_by_email, sent_by_name, sent_by_role, sent_at, notification_metadata
        FROM order_cx_agent_notifications
        WHERE order_id = ${ctx.ordersCorePk}
        ORDER BY sent_at DESC
        LIMIT 100
      `) as unknown as unknown[];
    } catch {
      agentRows = [];
    }
    const dispatch = (await sql`
      SELECT notification_id, template_code, title, body, status,
             queued_at, sent_at, delivered_at, clicked_at, failed_at,
             error_code, error_message, retry_attempts
      FROM public.notification_dispatch_logs
      WHERE recipient_user_id = ${ctx.customerUserId}
        AND metadata @> ${JSON.stringify({ order_id: ctx.orderIdText, admin_cx: true })}::text::jsonb
      ORDER BY queued_at DESC
      LIMIT 50
    `) as unknown as unknown[];
    return {
      order_id: ctx.orderIdText,
      customer_id: ctx.customerUserId,
      agent_history: agentRows,
      dispatch_logs: dispatch,
    };
  });

  app.post<{
    Params: { orderId: string };
    Body: {
      templateCode?: string;
      overrideTitle?: string | null;
      overrideBody?: string | null;
      customMessage?: string | null;
      sentByEmail?: string | null;
      sentByName?: string | null;
      sentByRole?: string | null;
      previewOnly?: boolean;
    };
  }>("/:orderId/notifications/send", async (req, reply) => {
    const ctx = await resolveOrderCxContext(req.params.orderId);
    if (!ctx) {
      return reply.code(404).send({
        error: "order_or_customer_not_found",
        message: "Could not resolve the customer for this order.",
      });
    }

    const b = req.body ?? {};
    let templateCode = String(b.templateCode ?? "").trim();
    const customMessage = (b.customMessage ?? "").toString().trim();
    let overrideTitle = b.overrideTitle != null ? String(b.overrideTitle).trim() : "";
    let overrideBody = b.overrideBody != null ? String(b.overrideBody).trim() : "";

    if (!templateCode && customMessage) {
      templateCode = "ADMIN_CX_CUSTOM";
      if (!overrideBody) overrideBody = customMessage;
      if (!overrideTitle) overrideTitle = "Order Update";
    }
    if (!templateCode) {
      return reply.code(400).send({ error: "template_code_required" });
    }
    if (!templateCode.startsWith("ADMIN_CX_")) {
      return reply.code(400).send({
        error: "invalid_template",
        message: "Only ADMIN_CX_* templates can be sent from Order Details.",
      });
    }
    if (AUTO_ONLY_ADMIN_CX_CODES.has(templateCode)) {
      return reply.code(400).send({
        error: "auto_only_template",
        message:
          "This notification is sent automatically by the system and cannot be pushed manually.",
      });
    }
    if (templateCode === "ADMIN_CX_CUSTOM" && !overrideBody && !customMessage) {
      return reply.code(400).send({
        error: "custom_message_required",
        message: "Custom template requires a message body.",
      });
    }

    const variables = buildVariables(ctx, {
      title: overrideTitle || "Order Update",
      body: overrideBody || customMessage,
    });

    if (b.previewOnly === true) {
      const preview = await previewTemplate(templateCode, variables);
      if (!preview) return reply.code(404).send({ error: "template_not_found" });
      const rendered = {
        title: overrideTitle || preview.rendered.title,
        body: overrideBody || preview.rendered.body,
        deepLink: preview.rendered.deepLink,
      };
      return { ok: true, preview: rendered, template: preview.template, variables };
    }

    const result = await send({
      templateCode,
      variables,
      target: { user_id: ctx.customerUserId },
      priority: "high",
      bypassQuietHours: true,
      overrides: {
        title: overrideTitle || null,
        body: overrideBody || customMessage || null,
        deepLink: `/orders/${ctx.orderIdText}`,
      },
      metadata: {
        admin_cx: true,
        order_id: ctx.orderIdText,
        orders_core_pk: ctx.ordersCorePk,
        sent_by_email: b.sentByEmail ?? null,
        sent_by_name: b.sentByName ?? null,
      },
      idempotencyKey: undefined, // agents may re-send same template intentionally
    });

    const preview = await previewTemplate(templateCode, variables);
    const finalTitle = overrideTitle || preview?.rendered.title || "Notification";
    const finalBody = overrideBody || customMessage || preview?.rendered.body || "";
    const historyMessage = `${finalTitle}: ${finalBody}`.slice(0, 2000);

    const historyId = await recordAgentHistory({
      ordersCorePk: ctx.ordersCorePk,
      message: historyMessage,
      title: finalTitle,
      body: finalBody,
      templateCode,
      notificationIds: result.notificationIds,
      sentByEmail: b.sentByEmail ?? null,
      sentByName: b.sentByName ?? null,
      sentByRole: b.sentByRole ?? "AGENT",
    });

    if (result.queued === 0 && result.failedSync > 0) {
      return reply.code(502).send({
        ok: false,
        error: "send_failed",
        message: result.skipReason ?? "Notification could not be queued.",
        ...result,
        history_id: historyId,
        customer_id: ctx.customerUserId,
        order_id: ctx.orderIdText,
      });
    }

    return {
      ok: true,
      queued: result.queued,
      skipped: result.skipped,
      notification_ids: result.notificationIds,
      warning: result.warning ?? null,
      skip_reason: result.skipReason ?? null,
      history_id: historyId,
      customer_id: ctx.customerUserId,
      order_id: ctx.orderIdText,
      title: finalTitle,
      body: finalBody,
    };
  });
};
