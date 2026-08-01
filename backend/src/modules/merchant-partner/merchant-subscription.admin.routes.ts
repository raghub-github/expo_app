/**
 * Admin-only endpoints for merchant subscriptions.
 *
 * Registered in index.ts under prefix /v1/admin/merchant-subscriptions.
 *
 * Auth (two accepted paths — either satisfies the guard):
 *   1. JWT with admin / super_admin / manager / support role
 *      (used when a backend-authenticated admin calls directly)
 *   2. X-Internal-Secret header matching INTERNAL_API_TOKEN
 *      (used when the Control Dashboard's Next.js API proxies here — the
 *      dashboard authenticates its user via Supabase, then vouches for
 *      them via the shared secret; the dashboard's requireSuperAdminApi
 *      guard is the actual user gate)
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import {
  MERCHANT_SUBSCRIPTION_REFUND_WINDOW_DAYS,
  listMerchantSubscriptionHistory,
  listMerchantSubscriptionRefunds,
  refundMerchantSubscriptionPayment,
} from "./merchant-subscription.service.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const refundBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  storeId: z.coerce.number().int().positive().optional(),
  merchantId: z.coerce.number().int().positive().optional(),
  status: z
    .enum(["PAID", "REFUND_PENDING", "REFUNDED", "FAILED"])
    .optional(),
  gateway: z.enum(["WALLET", "RAZORPAY", "PRORATION_CREDIT"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(200).optional(),
});

export const merchantSubscriptionAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    /**
     * GET /v1/admin/merchant-subscriptions/payments
     *   Query: storeId? merchantId? status? gateway? search? limit=50 offset=0
     *
     * Returns paginated list of subscription_payments joined with plan + store
     * details. `refundable` is derived server-side (status=PAID + within window)
     * so the UI can render a disabled state without duplicating the rule.
     */
    admin.get(
      "/payments",
      async (req, reply) => {
        const q = listQuerySchema.parse(req.query ?? {});
        const sql = getSql();

        // Build WHERE dynamically. Using template literal arrays keeps postgres.js's
        // parameter binding safe (no manual string concat).
        const rows = await sql`
          SELECT
            sp.id                    AS id,
            sp.merchant_id           AS merchant_id,
            sp.store_id              AS store_id,
            sp.subscription_id       AS subscription_id,
            sp.plan_id               AS plan_id,
            sp.amount                AS amount,
            sp.total_paise           AS total_paise,
            sp.gst_percent_applied   AS gst_percent,
            sp.gst_amount_paise      AS gst_amount_paise,
            sp.payment_gateway       AS gateway,
            sp.payment_gateway_id    AS gateway_id,
            sp.payment_status        AS status,
            sp.payment_date          AS payment_date,
            sp.billing_period_start  AS billing_period_start,
            sp.billing_period_end    AS billing_period_end,
            sp.notes                 AS notes,
            COALESCE(sp.plan_name_snapshot, p.plan_name) AS plan_name,
            COALESCE(sp.plan_code_snapshot, p.plan_code) AS plan_code,
            COALESCE(sp.billing_cycle_snapshot, p.billing_cycle::text) AS billing_cycle,
            s.store_id               AS store_public_id,
            s.store_name             AS store_name,
            s.store_email            AS store_email,
            ms.subscription_status   AS subscription_status,
            ms.is_active             AS subscription_is_active,
            ms.expiry_date           AS subscription_expiry
          FROM subscription_payments sp
          LEFT JOIN merchant_plans p ON p.id = sp.plan_id
          LEFT JOIN merchant_stores s ON s.id = sp.store_id
          LEFT JOIN merchant_subscriptions ms ON ms.id = sp.subscription_id
          WHERE 1 = 1
            ${q.storeId != null ? sql`AND sp.store_id = ${q.storeId}` : sql``}
            ${q.merchantId != null ? sql`AND sp.merchant_id = ${q.merchantId}` : sql``}
            ${q.status ? sql`AND UPPER(sp.payment_status) = ${q.status}` : sql``}
            ${q.gateway ? sql`AND UPPER(sp.payment_gateway) = ${q.gateway}` : sql``}
            ${
              q.search && q.search.length > 0
                ? sql`AND (
                    s.store_name ILIKE ${"%" + q.search + "%"} OR
                    s.store_id ILIKE ${"%" + q.search + "%"} OR
                    sp.payment_gateway_id ILIKE ${"%" + q.search + "%"}
                  )`
                : sql``
            }
          ORDER BY sp.payment_date DESC NULLS LAST, sp.id DESC
          LIMIT ${q.limit}
          OFFSET ${q.offset}
        `;

        const countRows = await sql`
          SELECT COUNT(*)::int AS total
          FROM subscription_payments sp
          LEFT JOIN merchant_stores s ON s.id = sp.store_id
          WHERE 1 = 1
            ${q.storeId != null ? sql`AND sp.store_id = ${q.storeId}` : sql``}
            ${q.merchantId != null ? sql`AND sp.merchant_id = ${q.merchantId}` : sql``}
            ${q.status ? sql`AND UPPER(sp.payment_status) = ${q.status}` : sql``}
            ${q.gateway ? sql`AND UPPER(sp.payment_gateway) = ${q.gateway}` : sql``}
            ${
              q.search && q.search.length > 0
                ? sql`AND (
                    s.store_name ILIKE ${"%" + q.search + "%"} OR
                    s.store_id ILIKE ${"%" + q.search + "%"} OR
                    sp.payment_gateway_id ILIKE ${"%" + q.search + "%"}
                  )`
                : sql``
            }
        `;
        const total = Number((countRows[0] as { total?: number } | undefined)?.total ?? 0);

        const windowMs = MERCHANT_SUBSCRIPTION_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        const items = (rows as unknown as Array<Record<string, unknown>>).map((r) => {
          const paymentDate = r.payment_date ? new Date(String(r.payment_date)) : null;
          const status = String(r.status ?? "").toUpperCase();
          const gateway = String(r.gateway ?? "").toUpperCase();
          const refundDeadline =
            paymentDate ? new Date(paymentDate.getTime() + windowMs) : null;
          const withinWindow = refundDeadline ? Date.now() <= refundDeadline.getTime() : false;
          const refundable =
            status === "PAID" &&
            (gateway === "WALLET" || gateway === "RAZORPAY") &&
            withinWindow;
          const daysRemaining = refundDeadline
            ? Math.max(0, Math.ceil((refundDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
            : 0;

          return {
            id: Number(r.id),
            merchantId: Number(r.merchant_id),
            storeId: Number(r.store_id),
            storePublicId: r.store_public_id != null ? String(r.store_public_id) : null,
            storeName: r.store_name != null ? String(r.store_name) : null,
            storeEmail: r.store_email != null ? String(r.store_email) : null,
            subscriptionId: Number(r.subscription_id),
            subscriptionStatus: r.subscription_status != null ? String(r.subscription_status) : null,
            subscriptionIsActive: Boolean(r.subscription_is_active),
            subscriptionExpiry: r.subscription_expiry ? String(r.subscription_expiry) : null,
            planId: Number(r.plan_id),
            planName: r.plan_name != null ? String(r.plan_name) : null,
            planCode: r.plan_code != null ? String(r.plan_code) : null,
            billingCycle: r.billing_cycle != null ? String(r.billing_cycle) : null,
            amount: Number(r.amount ?? 0),
            totalPaise: Number(r.total_paise ?? 0),
            gstPercent: r.gst_percent != null ? Number(r.gst_percent) : 0,
            gstAmountPaise: r.gst_amount_paise != null ? Number(r.gst_amount_paise) : 0,
            gateway,
            gatewayId: r.gateway_id != null ? String(r.gateway_id) : null,
            status,
            paymentDate: paymentDate?.toISOString() ?? null,
            billingPeriodStart: r.billing_period_start ? String(r.billing_period_start) : null,
            billingPeriodEnd: r.billing_period_end ? String(r.billing_period_end) : null,
            notes: r.notes != null ? String(r.notes) : null,
            refundable,
            refundDeadline: refundDeadline?.toISOString() ?? null,
            daysRemaining,
          };
        });

        return reply.send({
          success: true,
          items,
          pagination: {
            total,
            limit: q.limit,
            offset: q.offset,
            hasMore: q.offset + items.length < total,
          },
          refundWindowDays: MERCHANT_SUBSCRIPTION_REFUND_WINDOW_DAYS,
        });
      }
    );

    /**
     * GET /v1/admin/merchant-subscriptions/refunds
     *   Query: storeId? merchantId? paymentId? limit=50 offset=0
     *
     * Full refund audit trail. Admin view — INCLUDES actor identity
     * (name, email, role, system_user_id). Filter by store, merchant, or
     * single-payment scope. At least one filter is recommended for large
     * datasets; unbounded queries are allowed for super-admin reports.
     */
    admin.get<{
      Querystring: { storeId?: string; merchantId?: string; paymentId?: string; limit?: string; offset?: string };
    }>("/refunds", async (req, reply) => {
      const q = req.query ?? {};
      const result = await listMerchantSubscriptionRefunds({
        storeId: q.storeId ? Number(q.storeId) : undefined,
        merchantId: q.merchantId ? Number(q.merchantId) : undefined,
        paymentId: q.paymentId ? Number(q.paymentId) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
        includeActor: true,
      });
      return reply.send({ success: true, ...result });
    });

    /**
     * GET /v1/admin/merchant-subscriptions/stores/:storeId/history
     *   Query: limit=50 offset=0
     *
     * Combined subscription lifecycle for a single store: every purchase
     * (subscription_payments) + every refund (merchant_subscription_refunds)
     * merged into a date-sorted event stream. Refund events INCLUDE actor
     * identity (agent name, email, role) — admin view.
     */
    admin.get<{
      Params: { storeId: string };
      Querystring: { limit?: string; offset?: string };
    }>("/stores/:storeId/history", async (req, reply) => {
      const storeId = Number(req.params.storeId);
      if (!Number.isInteger(storeId) || storeId < 1) {
        return reply.code(400).send({ success: false, error: "invalid_store_id" });
      }
      const result = await listMerchantSubscriptionHistory({
        storeId,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
        includeActor: true,
      });
      return reply.send({ success: true, ...result });
    });

    /**
     * POST /v1/admin/merchant-subscriptions/payments/:paymentId/refund
     * Body: { reason?: string }
     *
     * Fully refunds a merchant-subscription payment AND eagerly revokes the
     * associated subscription. Enforces the 7-day refund window server-side.
     *
     * When called via X-Internal-Secret (from the dashboard proxy), the actor
     * identity comes from headers set by the proxy — falls back to "admin_proxy"
     * if not provided.
     */
    admin.post<{ Params: { paymentId: string }; Body: unknown }>(
      "/payments/:paymentId/refund",
      async (req, reply) => {
        const paymentId = Number(req.params.paymentId);
        if (!Number.isInteger(paymentId) || paymentId < 1) {
          return reply.code(400).send({ success: false, error: "invalid_payment_id" });
        }
        const body = refundBodySchema.parse(req.body ?? {});

        // Actor identity — either from JWT (direct admin call) or from the
        // dashboard-proxy headers (X-Actor-Subject-Id + X-Actor-Role).
        const proxyActorId = String(req.headers["x-actor-subject-id"] ?? "");
        const proxyActorRole = String(req.headers["x-actor-role"] ?? "");
        const actorSubjectId = req.auth?.sub ?? proxyActorId ?? "admin_proxy";
        const actorRole =
          req.auth?.role ??
          (proxyActorRole && isAdminLikeRole(proxyActorRole) ? proxyActorRole : "admin");

        const result = await refundMerchantSubscriptionPayment({
          paymentId,
          actorSubjectId,
          actorRole,
          reason: body.reason,
        });

        if (!result.ok) {
          return reply.code(result.status).send({ success: false, error: result.error });
        }
        return reply.send({
          success: true,
          paymentId: result.paymentId,
          subscriptionId: result.subscriptionId,
          gateway: result.gateway,
          refundReference: result.refundReference,
          alreadyRefunded: result.alreadyRefunded,
          message:
            result.gateway === "WALLET"
              ? "Refunded to wallet. Subscription revoked."
              : result.alreadyRefunded
              ? "Refund already recorded."
              : "Razorpay refund initiated. Subscription revoked. Webhook will confirm the payout.",
        });
      }
    );
  });
};
