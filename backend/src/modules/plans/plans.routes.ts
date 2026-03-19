/**
 * GET /v1/plans — list active merchant plans for Partner app (plan cards).
 * GET /v1/subscription?store_id= — active subscription for a store (store_id se plan active hai vo).
 * No auth required; public listing.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";

const subscriptionQuerySchema = z.object({
  store_id: z.string().optional(),
});

const subscriptionResponseSchema = z.object({
  active: z.boolean(),
  plan: z
    .object({
      plan_id: z.number(),
      plan_code: z.string(),
      plan_name: z.string(),
      expiry_date: z.string().nullable(),
      subscription_status: z.string(),
      active_from: z.string(),
    })
    .nullable(),
});

const planSchema = z.object({
  id: z.number(),
  plan_name: z.string(),
  plan_code: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  billing_cycle: z.string(),
  max_menu_items: z.number().nullable(),
  max_cuisines: z.number().nullable(),
  max_menu_categories: z.number().nullable(),
  image_upload_allowed: z.boolean(),
  max_image_uploads: z.number().nullable(),
  analytics_access: z.boolean(),
  advanced_analytics: z.boolean(),
  priority_support: z.boolean(),
  marketing_automation: z.boolean(),
  custom_api_integrations: z.boolean(),
  dedicated_account_manager: z.boolean(),
  display_order: z.number().nullable(),
  is_popular: z.boolean(),
});

const responseSchema = z.object({
  plans: z.array(planSchema),
});

export async function plansRoutes(app: FastifyInstance) {
  app.get(
    "/subscription",
    {
      schema: {
        querystring: subscriptionQuerySchema,
        response: {
          200: subscriptionResponseSchema,
          500: subscriptionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { store_id: storeIdParam } = subscriptionQuerySchema.parse(request.query || {});
      if (storeIdParam == null || storeIdParam === "") {
        return reply.code(200).send({ active: false, plan: null });
      }
      const storeId = Number(storeIdParam);
      if (Number.isNaN(storeId) || storeId < 1) {
        return reply.code(200).send({ active: false, plan: null });
      }
      const sql = getSql();
      try {
        const rows = await sql`
          SELECT
            s.plan_id,
            p.plan_name,
            p.plan_code,
            COALESCE(s.billing_start_at, s.start_date) AS active_from,
            COALESCE(s.billing_end_at, s.expiry_date) AS active_until,
            s.subscription_status
          FROM merchant_subscriptions s
          JOIN merchant_plans p ON p.id = s.plan_id
          WHERE s.store_id = ${storeId}
            AND s.subscription_status = 'ACTIVE'
            AND (s.is_active IS NULL OR s.is_active = true)
            AND COALESCE(s.billing_start_at, s.start_date) <= now()
            AND (
              COALESCE(s.billing_end_at, s.expiry_date) IS NULL
              OR COALESCE(s.billing_end_at, s.expiry_date) >= now()
            )
          ORDER BY COALESCE(s.billing_start_at, s.start_date) DESC
          LIMIT 1
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
          return reply.code(200).send({ active: false, plan: null });
        }
        const r = row as Record<string, unknown>;
        const activeFrom = r.active_from;
        const expiryDate = r.active_until;
        return reply.code(200).send({
          active: true,
          plan: {
            plan_id: Number(r.plan_id),
            plan_code: String(r.plan_code ?? ""),
            plan_name: String(r.plan_name ?? ""),
            active_from:
              activeFrom instanceof Date ? activeFrom.toISOString() : String(activeFrom ?? ""),
            expiry_date:
              expiryDate != null
                ? expiryDate instanceof Date
                  ? (expiryDate as Date).toISOString()
                  : String(expiryDate)
                : null,
            subscription_status: String(r.subscription_status ?? "ACTIVE"),
          },
        });
      } catch (err: unknown) {
        if (
          (err as { code?: string })?.code === "42P01" ||
          (err as Error)?.message?.includes("does not exist")
        ) {
          return reply.code(200).send({ active: false, plan: null });
        }
        request.log?.error?.({ err }, "GET /subscription failed");
        return reply.code(500).send({ active: false, plan: null });
      }
    }
  );

  app.get(
    "/plans",
    {
      schema: {
        response: {
          200: responseSchema,
          500: responseSchema,
        },
      },
    },
    async (request, reply) => {
      const sql = getSql();
      let rows: Record<string, unknown>[];
      try {
        rows = await sql`
          SELECT id, plan_name, plan_code, description, price, billing_cycle,
                 max_menu_items, max_cuisines, max_menu_categories,
                 image_upload_allowed, max_image_uploads,
                 analytics_access, advanced_analytics, priority_support,
                 marketing_automation, custom_api_integrations, dedicated_account_manager,
                 display_order, is_popular
          FROM merchant_plans
          WHERE is_active = true
          ORDER BY display_order ASC NULLS LAST, id ASC
        `;
      } catch (err: any) {
        if (err?.code === "42P01" || err?.message?.includes("does not exist")) {
          return reply.code(200).send({ plans: [] });
        }
        request.log?.error?.({ err }, "GET /plans failed");
        return reply.code(500).send({ plans: [] });
      }

      const plans = rows.map((r) => ({
        id: Number(r.id),
        plan_name: String(r.plan_name ?? ""),
        plan_code: String(r.plan_code ?? ""),
        description: r.description != null ? String(r.description) : null,
        price: Number(r.price ?? 0),
        billing_cycle: String(r.billing_cycle ?? "MONTHLY"),
        max_menu_items: r.max_menu_items != null ? Number(r.max_menu_items) : null,
        max_cuisines: r.max_cuisines != null ? Number(r.max_cuisines) : null,
        max_menu_categories: r.max_menu_categories != null ? Number(r.max_menu_categories) : null,
        image_upload_allowed: Boolean(r.image_upload_allowed),
        max_image_uploads: r.max_image_uploads != null ? Number(r.max_image_uploads) : null,
        analytics_access: Boolean(r.analytics_access),
        advanced_analytics: Boolean(r.advanced_analytics),
        priority_support: Boolean(r.priority_support),
        marketing_automation: Boolean(r.marketing_automation),
        custom_api_integrations: Boolean(r.custom_api_integrations),
        dedicated_account_manager: Boolean(r.dedicated_account_manager),
        display_order: r.display_order != null ? Number(r.display_order) : null,
        is_popular: Boolean(r.is_popular),
      }));

      return { plans };
    }
  );
}
