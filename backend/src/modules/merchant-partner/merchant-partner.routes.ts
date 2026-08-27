import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { SignJWT } from "jose";
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { logStoreActivity } from "../../lib/store-activity-feed.js";
import { syncedGeneratedOfferTitle } from "../../lib/merchant-offer-title.js";
import { auth } from "../../plugins/auth.js";
import { send as sendNotification } from "../notifications/notificationService.js";
import {
  isWithinOperatingHours,
  isBeforeFirstSlotToday,
  getNextOpenClose,
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isLikelyLegacyEndOfDayIstClose,
  nowInStoreTz,
  runStoreScheduleTickForStore,
  emitStoreStatusChanged,
  syncMerchantStoresOnlineTriple,
  normalizeClosedDays,
} from "./store-schedule-engine.js";
import {
  computeSurfaceLiveStatus,
  effectiveOperationalFromStoreRow,
} from "../../lib/store-surface-online.js";
import { resolveTicketTitleForUnifiedTicketsInsert } from "./unified-ticket-title-for-insert.js";
import { buildGrowthBusinessInsights } from "./growth-business-insights.js";
import { buildLivePreviewInsights } from "./live-preview-insights.js";
import { buildGrowthQuickInsights } from "./growth-quick-insights.js";
import { buildGrowthKitchenInsights } from "./growth-kitchen-insights.js";
import {
  countMerchantDeliveredOrdersIst,
  sumMerchantLedgerEarningsIst,
} from "../../lib/merchant-growth-metrics.js";
import { loadMerchantOfferInsights } from "./merchant-offer-insights.service.js";
import { loadMerchantMarketInsights } from "../../lib/merchant-store-competitors.js";
import { registerMerchantSubscriptionRoutes } from "./merchant-subscription.routes.js";
import { invalidateOfferPricing } from "../pricing/offer-invalidation.js";
import {
  ONBOARDING_BENEFITS_TASK_KEY,
  completeOnboardingTask,
  ensureOnboardingTaskStarted,
  getOnboardingTask,
  patchOnboardingTaskMetadata,
  toOnboardingTaskDto,
} from "../../lib/merchant-onboarding-tasks.js";

type AuditContext = {
  performedBy: string;
  performedById: number | null;
  performedByName: string | null;
  performedByEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
};

function auditSectionForField(field: string | null): string {
  const f = String(field ?? "").toLowerCase();
  if (
    [
      "full_address",
      "landmark",
      "city",
      "state",
      "postal_code",
      "country",
      "latitude",
      "longitude",
    ].includes(f)
  ) {
    return "address";
  }
  if (["cuisine_types", "food_categories"].includes(f)) return "cuisines";
  if (["store_name", "store_display_name", "store_description", "store_email", "store_phones"].includes(f)) {
    return "store_info";
  }
  if (["banner_url", "logo_url", "parent_logo_url"].includes(f)) return "media";
  if (["pickup_instruction"].includes(f)) return "pickup";
  return "store";
}

/** Resolve parent id from JWT; return null if not merchant or not found. */
async function getPartnerParentId(sql: ReturnType<typeof getSql>, parentMerchantId: string): Promise<number | null> {
  const rows = await sql`
    SELECT id FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
  `;
  const row = rows[0] as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  // Expo push endpoint accepts an array of messages.
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: "high",
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch {
    // best-effort; in-app notification still exists
  }
}

function isMissingFoodCategoriesColumnError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === "42703" &&
    String(err.message ?? "")
      .toLowerCase()
      .includes("food_categories")
  );
}

/** Ensure store belongs to partner; return store row with parent store_logo (parent_logo_url) and child banner_url. Logo for UI = parent only; banner = child only. */
async function getStoreForPartner(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  parentId: number
): Promise<any | null> {
  try {
    const rows = await sql`
      SELECT ms.id, ms.store_id, ms.store_name, ms.store_display_name, ms.store_description,
             ms.store_email, ms.store_phones, ms.full_address, ms.landmark, ms.city, ms.state,
             ms.postal_code, ms.country, ms.latitude, ms.longitude,
             ms.banner_url, ms.cuisine_types, ms.food_categories,
             ms.min_order_amount, ms.delivery_radius_km, ms.avg_preparation_time_minutes,
             ms.is_pure_veg, ms.accepts_online_payment, ms.accepts_cash,
             mp.store_logo AS parent_logo_url
      FROM merchant_stores ms
      LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
      WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch (e) {
    if (!isMissingFoodCategoriesColumnError(e)) throw e;
    const rows = await sql`
      SELECT ms.id, ms.store_id, ms.store_name, ms.store_display_name, ms.store_description,
             ms.store_email, ms.store_phones, ms.full_address, ms.landmark, ms.city, ms.state,
             ms.postal_code, ms.country, ms.latitude, ms.longitude,
             ms.banner_url, ms.cuisine_types,
             ARRAY[]::text[] AS food_categories,
             ms.min_order_amount, ms.delivery_radius_km, ms.avg_preparation_time_minutes,
             ms.is_pure_veg, ms.accepts_online_payment, ms.accepts_cash,
             mp.store_logo AS parent_logo_url
      FROM merchant_stores ms
      LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
      WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

/** Get parent row for audit (name, email). */
async function getParentForAudit(
  sql: ReturnType<typeof getSql>,
  parentId: number
): Promise<{ parent_name: string | null; owner_name: string | null; owner_email: string | null } | null> {
  const rows = await sql`
    SELECT parent_name, owner_name, owner_email FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}

function getAuditContext(
  req: FastifyRequest,
  parentRow: { parent_name?: string | null; owner_name?: string | null; owner_email?: string | null } | null,
  parentId: number
): AuditContext {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? (req.ip ?? null);
  const userAgent = (req.headers["user-agent"] as string) ?? null;
  const requestId = String((req as any).id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return {
    performedBy: "merchant",
    performedById: parentId,
    performedByName: parentRow?.owner_name ?? parentRow?.parent_name ?? null,
    performedByEmail: parentRow?.owner_email ?? null,
    ipAddress: ip,
    userAgent,
    requestId,
  };
}

/** Insert one row into merchant_audit_logs. Values for old_value/new_value are sent as JSON-serializable; driver will handle JSONB. */
async function insertAuditLog(
  sql: ReturnType<typeof getSql>,
  entityType: string,
  entityId: number,
  action: string,
  ctx: AuditContext,
  actionField: string | null,
  oldValue: unknown,
  newValue: unknown,
  auditMetadata?: Record<string, unknown>
): Promise<void> {
  const oldJson = oldValue !== undefined && oldValue !== null ? JSON.stringify(oldValue) : null;
  const newJson = newValue !== undefined && newValue !== null ? JSON.stringify(newValue) : null;
  const metaJson = JSON.stringify({ ...(auditMetadata ?? {}), request_id: ctx.requestId });
  await sql`
    INSERT INTO merchant_audit_logs (
      entity_type, entity_id, action, action_field, old_value, new_value,
      performed_by, performed_by_id, performed_by_name, performed_by_email,
      ip_address, user_agent, audit_metadata
    ) VALUES (
      ${entityType}, ${entityId}, ${action}, ${actionField},
      ${oldJson}::text::jsonb, ${newJson}::text::jsonb,
      ${ctx.performedBy}, ${ctx.performedById}, ${ctx.performedByName}, ${ctx.performedByEmail},
      ${ctx.ipAddress}, ${ctx.userAgent}, ${metaJson}::text::jsonb
    )
  `;
}

export async function merchantPartnerRoutes(app: FastifyInstance) {
  await app.register(
    async (protectedApp) => {
      await protectedApp.register(auth, { required: true });
      await protectedApp.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

      protectedApp.get("/me", async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const parentMerchantId = req.auth.sub;
          const sql = getSql();
          const parentRows = await sql`
            SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone,
                   store_logo
          FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
          `;
          const parentRow = parentRows[0];
        if (!parentRow) return reply.code(404).send({ error: "partner_not_found" });
          const parentId = Number(parentRow.id);
          const parentLogoUrl =
            parentRow.store_logo != null && String(parentRow.store_logo).trim()
              ? String(parentRow.store_logo).trim()
              : null;
          const storeRows = await sql`
            SELECT ms.id, ms.store_id, ms.store_name, ms.full_address, ms.city, ms.approval_status,
                   ms.banner_url,
                   msrp.current_step, msrp.total_steps, msrp.registration_status
            FROM merchant_stores ms
            LEFT JOIN merchant_store_registration_progress msrp ON msrp.store_id = ms.id AND msrp.parent_id = ${parentId}
          WHERE ms.parent_id = ${parentId} ORDER BY ms.created_at ASC
        `;
        // Onboarding payment status from merchant_onboarding_payments: latest row per store for this parent.
        const paymentRows = (await sql`
          SELECT DISTINCT ON (merchant_store_id)
                 merchant_store_id,
                 status
          FROM merchant_onboarding_payments
          WHERE merchant_parent_id = ${parentId} AND merchant_store_id IS NOT NULL
          ORDER BY merchant_store_id, created_at DESC
        `) as Array<{ merchant_store_id: number | null; status: string | null }>;
        const paymentByStore = new Map<number, string>();
        for (const row of paymentRows) {
          if (row?.merchant_store_id != null) paymentByStore.set(Number(row.merchant_store_id), String(row?.status ?? "pending"));
        }
          const childStores = (storeRows as any[]).map((s) => {
            const step = s?.current_step != null ? Number(s.current_step) : 1;
            const total = s?.total_steps != null ? Number(s.total_steps) : 9;
          const rawStatus = s?.id != null ? paymentByStore.get(Number(s.id)) ?? "pending" : "pending";
          const paidStatuses = new Set(["captured", "refunded", "partially_refunded"]);
          const paymentStatus = paidStatuses.has(rawStatus) ? "Completed" : "Pending";
            return {
              id: s?.id,
              store_id: s?.store_id,
              store_name: s?.store_name,
              full_address: s?.full_address ?? "",
              city: s?.city != null ? String(s.city).trim() : "",
              approval_status: s?.approval_status ?? "DRAFT",
              banner_url: s?.banner_url ?? null,
              parent_logo_url: parentLogoUrl,
              current_step: step,
              total_steps: total,
              payment_status: paymentStatus,
              registration_status: s?.registration_status ?? "IN_PROGRESS",
            };
          });
        // Count active user sessions for this merchant user (all stores).
        let activeDevices = 0;
        try {
          const merchantId = req.auth?.sub ?? "";
          if (merchantId) {
            const sessionRows = await sql`
              SELECT COUNT(*)::int AS c
              FROM user_device_sessions
              WHERE user_id = ${merchantId} AND is_active = TRUE
            `;
            activeDevices = Number((sessionRows[0] as any)?.c ?? 0);
          }
        } catch {}

        return {
          parent: {
            id: parentId,
            parent_merchant_id: String(parentRow.parent_merchant_id),
            parent_name: parentRow.parent_name,
            owner_name: parentRow.owner_name,
            owner_email: parentRow.owner_email ?? "",
            brand_name: parentRow.brand_name ?? "",
            registered_phone: parentRow.registered_phone,
            store_logo: parentLogoUrl,
          },
          childStores,
          activeDevices,
        };
      });

      // User device sessions (account-level across all stores).
      protectedApp.get("/user-sessions", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const sql = getSql();
        try {
          const rows = await sql`
            SELECT id,
                   user_id,
                   parent_store_id,
                   child_store_id,
                   device_type,
                   device_name,
                   os,
                   ip_address,
                   location,
                   login_method,
                   login_time,
                   last_active,
                   is_active,
                   device_id
            FROM user_device_sessions
            WHERE user_id = ${req.auth.sub} AND is_active = TRUE
            ORDER BY last_active DESC, login_time DESC
          `;
          return rows;
        } catch {
          return [];
        }
      });

      const logoutSessionsBody = z.object({
        session_ids: z.array(z.union([z.number(), z.string()])).min(1),
      });

      protectedApp.post<{ Body: z.infer<typeof logoutSessionsBody> }>(
        "/user-sessions/logout",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const sql = getSql();
          const body = logoutSessionsBody.parse(req.body);
          const ids: number[] = body.session_ids
            .map((v) => (typeof v === "string" ? Number(v) : v))
            .filter((v): v is number => Number.isFinite(v) && v > 0);
          if (ids.length === 0) {
            return reply.code(400).send({ error: "invalid_session_ids" });
          }
          try {
            // Use postgres.js tuple expansion for a safe IN (...) clause.
            await sql`
              UPDATE user_device_sessions
              SET is_active = FALSE, last_active = now()
              WHERE user_id = ${req.auth.sub} AND id IN ${sql(ids)}
            `;
            return { ok: true };
          } catch {
            return reply.code(500).send({ error: "logout_failed" });
          }
        }
      );

      const logoutAllBody = z
        .object({
          includeCurrent: z.boolean().optional(),
        })
        .optional();

      protectedApp.post<{ Body: z.infer<NonNullable<typeof logoutAllBody>> }>(
        "/user-sessions/logout-all",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const sql = getSql();
          const body = logoutAllBody.parse(req.body);
          const includeCurrent = body?.includeCurrent ?? false;
          const currentDeviceId = req.auth.device_id;
          try {
            if (!includeCurrent && currentDeviceId) {
              await sql`
                UPDATE user_device_sessions
                SET is_active = FALSE, last_active = now()
                WHERE user_id = ${req.auth.sub} AND device_id IS DISTINCT FROM ${currentDeviceId}
              `;
            } else {
              await sql`
                UPDATE user_device_sessions
                SET is_active = FALSE, last_active = now()
                WHERE user_id = ${req.auth.sub}
              `;
            }
            return { ok: true };
          } catch {
            return reply.code(500).send({ error: "logout_all_failed" });
          }
        }
      );

      /** GET /merchant-partner/merchant-help-sections — Contact Us / help hub rows from ticket_titles. */
      protectedApp.get("/merchant-help-sections", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const sql = getSql();
        try {
          // Hide titles in inactive groups; hide if any ancestor title is inactive (nested help tree).
          const rows = await sql.unsafe(`
            SELECT
              tt.id AS ticket_title_id,
              tt.merchant_section_id AS section_id,
              tt.title_text AS title,
              tt.subtext AS subtitle,
              tt.default_quick_options AS quick_options,
              tt.display_order,
              tt.merchant_help_icon_name AS help_hub_icon
            FROM ticket_titles tt
            LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
            WHERE tt.merchant_section_id IS NOT NULL
              AND TRIM(tt.merchant_section_id::text) <> ''
              AND tt.is_active = TRUE
              AND tt.ticket_section::text = 'merchant'
              AND (tt.group_id IS NULL OR tg.is_active = TRUE)
              AND NOT EXISTS (
                WITH RECURSIVE title_ancestors AS (
                  SELECT id, parent_title_id, is_active
                  FROM ticket_titles
                  WHERE id = tt.parent_title_id
                  UNION ALL
                  SELECT p.id, p.parent_title_id, p.is_active
                  FROM ticket_titles p
                  INNER JOIN title_ancestors a ON p.id = a.parent_title_id
                  WHERE a.parent_title_id IS NOT NULL
                )
                SELECT 1 FROM title_ancestors WHERE is_active = FALSE LIMIT 1
              )
            ORDER BY tt.display_order ASC NULLS LAST, tt.title_text ASC
          `);
          return reply.send({ ok: true, sections: rows });
        } catch {
          return reply.send({ ok: true, sections: [] });
        }
      });

      /** GET /merchant-partner/live-order-support-topics — order-issue topics for live order support sheet (GRP_MERCHANT_ORDER). */
      protectedApp.get("/live-order-support-topics", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const sql = getSql();
        try {
          const rows = await sql.unsafe(`
            SELECT
              tt.id AS ticket_title_id,
              tt.merchant_section_id AS section_id,
              tt.title_text AS title,
              tt.subtext AS subtitle,
              tt.default_quick_options AS quick_options,
              tt.display_order,
              tt.merchant_help_icon_name AS help_hub_icon
            FROM ticket_titles tt
            INNER JOIN ticket_groups tg ON tg.id = tt.group_id
            WHERE tg.group_code = 'GRP_MERCHANT_ORDER'
              AND tg.is_active = TRUE
              AND tt.is_active = TRUE
              AND tt.ticket_section::text = 'merchant'
              AND tt.merchant_section_id IS NOT NULL
              AND TRIM(tt.merchant_section_id::text) <> ''
              AND NOT EXISTS (
                WITH RECURSIVE title_ancestors AS (
                  SELECT id, parent_title_id, is_active
                  FROM ticket_titles
                  WHERE id = tt.parent_title_id
                  UNION ALL
                  SELECT p.id, p.parent_title_id, p.is_active
                  FROM ticket_titles p
                  INNER JOIN title_ancestors a ON p.id = a.parent_title_id
                  WHERE a.parent_title_id IS NOT NULL
                )
                SELECT 1 FROM title_ancestors WHERE is_active = FALSE LIMIT 1
              )
            ORDER BY tt.display_order ASC NULLS LAST, tt.title_text ASC
          `);
          return reply.send({ ok: true, topics: rows });
        } catch {
          return reply.send({ ok: true, topics: [] });
        }
      });

      /** GET /merchant-partner/stores/:storeId — outlet info for partner app. */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const store = await getStoreForPartner(sql, storeId, parentId);
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        const pickupRows = await sql`
          SELECT instruction_text
          FROM pickup_instructions
          WHERE store_id = ${storeId}
            AND is_active = true
          LIMIT 1
        `;
        const pickupInstruction = pickupRows[0]?.instruction_text != null ? String(pickupRows[0].instruction_text) : null;

        return {
          id: store.id,
          store_id: store.store_id,
          store_name: store.store_name,
          store_display_name: store.store_display_name ?? null,
          store_description: store.store_description ?? null,
          store_email: store.store_email ?? null,
          store_phones: store.store_phones ?? [],
          full_address: store.full_address,
          landmark: store.landmark ?? null,
          city: store.city,
          state: store.state,
          postal_code: store.postal_code,
          country: store.country ?? "IN",
          latitude: store.latitude != null ? Number(store.latitude) : null,
          longitude: store.longitude != null ? Number(store.longitude) : null,
          logo_url: store.parent_logo_url ?? null,
          banner_url: store.banner_url ?? null,
          parent_logo_url: store.parent_logo_url ?? null,
          cuisine_types: store.cuisine_types ?? [],
          food_categories: store.food_categories ?? [],
          pickup_instruction: pickupInstruction,
          min_order_amount: store.min_order_amount ?? 0,
          delivery_radius_km: store.delivery_radius_km ?? null,
          avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? 30,
          is_pure_veg: store.is_pure_veg === true,
          accepts_online_payment: store.accepts_online_payment !== false,
          accepts_cash: store.accepts_cash !== false,
        };
      });

      /** GET /merchant-partner/stores/:storeId/bank-account — primary payout account for this store (if any). */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/bank-account",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT
              id,
              store_id,
              account_holder_name,
              account_number,
              ifsc_code,
              bank_name,
              branch_name,
              account_type,
              is_verified,
              verification_status,
              upi_id,
              upi_verified,
              is_primary,
              is_active,
              is_disabled,
              payout_method,
              beneficiary_name,
              created_at,
              updated_at
            FROM merchant_store_bank_accounts
            WHERE store_id = ${storeId}
              AND is_primary = TRUE
              AND is_active = TRUE
              AND (is_disabled IS NULL OR is_disabled = FALSE)
            ORDER BY id DESC
            LIMIT 1
          `;
          if (rows.length === 0) {
            return reply.send(null);
          }
          const r = rows[0] as {
            id: number;
            store_id: number;
            account_holder_name: string;
            account_number: string;
            ifsc_code: string;
            bank_name: string;
            branch_name: string | null;
            account_type: string | null;
            is_verified: boolean | null;
            verification_status: string | null;
            upi_id: string | null;
            upi_verified: boolean | null;
            is_primary: boolean | null;
            is_active: boolean | null;
            is_disabled: boolean | null;
            payout_method: string | null;
            beneficiary_name: string | null;
            created_at: Date;
            updated_at: Date;
          };

          return reply.send({
            id: r.id,
            store_id: r.store_id,
            account_holder_name: r.account_holder_name,
            account_number: r.account_number,
            ifsc_code: r.ifsc_code,
            bank_name: r.bank_name,
            branch_name: r.branch_name,
            account_type: r.account_type,
            is_verified: r.is_verified === true,
            verification_status: r.verification_status ?? null,
            upi_id: r.upi_id ?? null,
            upi_verified: r.upi_verified === true,
            is_primary: r.is_primary !== false,
            is_active: r.is_active !== false,
            is_disabled: r.is_disabled === true,
            payout_method: r.payout_method ?? null,
            beneficiary_name: r.beneficiary_name ?? null,
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
            updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId — update outlet info. */
      protectedApp.patch<{ Params: { storeId: string }; Body: any }>("/stores/:storeId", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const existing = await getStoreForPartner(sql, storeId, parentId);
        if (!existing) return reply.code(404).send({ error: "store_not_found" });
        const b = (req.body || {}) as Record<string, unknown>;
        const updates: Record<string, any> = {};
        if (typeof b.store_name === "string") updates.store_name = b.store_name;
        if (typeof b.store_display_name === "string" || b.store_display_name === null) updates.store_display_name = b.store_display_name;
        if (typeof b.store_description === "string" || b.store_description === null) updates.store_description = b.store_description;
        if (typeof b.store_email === "string" || b.store_email === null) updates.store_email = b.store_email;
        if (Array.isArray(b.store_phones)) updates.store_phones = b.store_phones;
        if (typeof b.full_address === "string") updates.full_address = b.full_address;
        if (typeof b.landmark === "string" || b.landmark === null) updates.landmark = b.landmark;
        if (typeof b.city === "string") updates.city = b.city;
        if (typeof b.state === "string") updates.state = b.state;
        if (typeof b.postal_code === "string") updates.postal_code = b.postal_code;
        if (typeof b.country === "string" || b.country === null) updates.country = b.country ?? "IN";
        if (b.latitude !== undefined) updates.latitude = b.latitude == null ? null : Number(b.latitude);
        if (b.longitude !== undefined) updates.longitude = b.longitude == null ? null : Number(b.longitude);
        // merchant_stores.logo_url removed (banner_url + parent store_logo only); ignore client logo_url.
        if (typeof b.banner_url === "string" || b.banner_url === null) updates.banner_url = b.banner_url;
        if (Array.isArray(b.cuisine_types)) updates.cuisine_types = b.cuisine_types;
        if (Array.isArray(b.food_categories)) updates.food_categories = b.food_categories;
        if (b.min_order_amount !== undefined) {
          const v = Number(b.min_order_amount);
          if (!Number.isFinite(v) || v < 0) {
            return reply.code(400).send({ error: "invalid_min_order_amount" });
          }
          updates.min_order_amount = v;
        }
        if (b.delivery_radius_km !== undefined) {
          const v = Number(b.delivery_radius_km);
          if (!Number.isFinite(v) || v < 1 || v > 50) {
            return reply
              .code(400)
              .send({ error: "invalid_delivery_radius", message: "delivery_radius_km must be between 1 and 50 km" });
          }
          updates.delivery_radius_km = v;
        }
        if (b.avg_preparation_time_minutes !== undefined) {
          const v = Number(b.avg_preparation_time_minutes);
          if (!Number.isInteger(v) || v <= 0) {
            return reply
              .code(400)
              .send({ error: "invalid_prep_time", message: "avg_preparation_time_minutes must be a positive integer" });
          }
          updates.avg_preparation_time_minutes = v;
        }
        if (typeof b.is_pure_veg === "boolean") updates.is_pure_veg = b.is_pure_veg;
        if (typeof b.accepts_online_payment === "boolean") updates.accepts_online_payment = b.accepts_online_payment;
        if (typeof b.accepts_cash === "boolean") updates.accepts_cash = b.accepts_cash;
        if (Object.keys(updates).length === 0) {
          return reply.send({ ok: true, message: "no_updates" });
        }
        updates.updated_at = new Date().toISOString();
        const runStoreUpdate = async (u: Record<string, any>) => {
          const setClause = Object.keys(u)
            .map((k, i) => `${k} = $${i + 1}`)
            .join(", ");
          const values = Object.values(u);
          await sql.unsafe(
            `UPDATE merchant_stores SET ${setClause} WHERE id = $${values.length + 1} AND parent_id = $${values.length + 2}`,
            [...values, storeId, parentId]
          );
        };
        try {
          await runStoreUpdate(updates);
        } catch (e) {
          if (isMissingFoodCategoriesColumnError(e) && "food_categories" in updates) {
            delete updates.food_categories;
            const dataKeys = Object.keys(updates).filter((k) => k !== "updated_at");
            if (dataKeys.length === 0) {
              return reply.send({ ok: true, message: "no_updates" });
            }
            await runStoreUpdate(updates);
          } else {
            throw e;
          }
        }
        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        for (const key of Object.keys(updates)) {
          if (key === "updated_at") continue;
          const oldVal = (existing as any)[key];
          const newVal = updates[key];
          await insertAuditLog(sql, "STORE", storeId, "UPDATE", auditCtx, key, oldVal, newVal, {
            section: auditSectionForField(key),
            route: "PATCH /merchant-partner/stores/:storeId",
          });
        }
        return reply.send({ ok: true });
      });

      /** PUT /merchant-partner/stores/:storeId/pickup-instruction — set or clear pickup instruction for the store. */
      protectedApp.put<{ Params: { storeId: string }; Body: { instruction_text?: string | null } }>(
        "/stores/:storeId/pickup-instruction",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const store = await getStoreForPartner(sql, storeId, parentId);
          if (!store) return reply.code(404).send({ error: "store_not_found" });

          const instructionText = typeof req.body?.instruction_text === "string" ? req.body.instruction_text.trim() : null;
          const hasText = instructionText != null && instructionText.length > 0;

          const existing = await sql`
            SELECT id, instruction_text FROM pickup_instructions WHERE store_id = ${storeId} LIMIT 1
          `;
          const row = existing[0] as { id: number; instruction_text: string | null } | undefined;
          const oldInstruction = row?.instruction_text ?? null;

          if (row) {
            await sql`
              UPDATE pickup_instructions
              SET instruction_text = ${hasText ? instructionText : ""},
                  is_active = ${hasText},
                  updated_at = NOW()
              WHERE id = ${row.id}
            `;
          } else if (hasText) {
            await sql`
              INSERT INTO pickup_instructions (store_id, instruction_text, is_active)
              VALUES (${storeId}, ${instructionText}, true)
            `;
          }
          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "pickup_instruction",
            oldInstruction != null ? { text: oldInstruction } : null,
            hasText ? { text: instructionText } : null,
            { section: "pickup", route: "PUT /merchant-partner/stores/:storeId/pickup-instruction" }
          );
          return reply.send({ ok: true });
        }
      );

      /** GET /merchant-partner/stores/:storeId/audit-logs — list audit records for this store (edited by, last changes at, old/new data). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>("/stores/:storeId/audit-logs", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const limit = Math.min(Number(req.query?.limit) || 50, 200);
        const rows = await sql`
          SELECT id, entity_type, entity_id, action, action_field, old_value, new_value,
                 performed_by, performed_by_id, performed_by_name, performed_by_email,
                 audit_metadata, created_at
          FROM merchant_audit_logs
          WHERE entity_type = 'STORE' AND entity_id = ${storeId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        const list = (rows as any[]).map((r) => ({
          id: r.id,
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          action: r.action,
          action_field: r.action_field,
          old_value: r.old_value,
          new_value: r.new_value,
          performed_by: r.performed_by,
          performed_by_id: r.performed_by_id,
          performed_by_name: r.performed_by_name,
          performed_by_email: r.performed_by_email,
          audit_metadata: r.audit_metadata ?? {},
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        }));
        return reply.send(list);
      });

      /** GET /merchant-partner/stores/:storeId/rush — current rush-in-kitchen window, if any. */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId/rush", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const now = new Date();
        const rushRows = await sql`
          SELECT id, duration_minutes, started_at, ends_at, is_active, marked_from
          FROM merchant_store_rush_windows
          WHERE store_id = ${storeId}
            AND is_active = TRUE
            AND ends_at > NOW()
          ORDER BY started_at DESC
          LIMIT 1
        `;
        const row = rushRows[0] as
          | {
              id: number;
              duration_minutes: number;
              started_at: Date | string;
              ends_at: Date | string;
              is_active: boolean;
              marked_from: string | null;
            }
          | undefined;
        if (!row) {
          return reply.send({
            store_id: storeId,
            is_active: false,
            duration_minutes: null,
            started_at: null,
            ends_at: null,
            remaining_minutes: 0,
            marked_from: null,
          });
        }
        const endsAtMs = new Date(String(row.ends_at)).getTime();
        const remainingMs = Math.max(0, endsAtMs - now.getTime());
        const remainingMinutes = Math.floor(remainingMs / 60000);
        return reply.send({
          store_id: storeId,
          is_active: true,
          duration_minutes: Number(row.duration_minutes),
          started_at: new Date(String(row.started_at)).toISOString(),
          ends_at: new Date(String(row.ends_at)).toISOString(),
          remaining_minutes: remainingMinutes,
          marked_from: row.marked_from != null ? String(row.marked_from) : null,
        });
      });

      /** POST /merchant-partner/stores/:storeId/rush — start a rush-in-kitchen window. */
      protectedApp.post<{ Params: { storeId: string }; Body: { duration_minutes?: number } }>(
        "/stores/:storeId/rush",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const durationRaw = req.body?.duration_minutes;
          const duration = typeof durationRaw === "number" ? Math.floor(durationRaw) : NaN;
          if (!Number.isInteger(duration) || duration <= 0 || duration > 240) {
            return reply
              .code(400)
              .send({ error: "invalid_duration", message: "duration_minutes must be between 1 and 240." });
          }

          const now = new Date();
          const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const endsAt = new Date(now.getTime() + duration * 60000);

          const existingActive = await sql`
            SELECT id, duration_minutes, started_at, ends_at, is_active
            FROM merchant_store_rush_windows
            WHERE store_id = ${storeId} AND is_active = TRUE
            ORDER BY started_at DESC
            LIMIT 1
          `;
          const oldRow = existingActive[0] as
            | { id: number; duration_minutes: number; started_at: Date; ends_at: Date; is_active: boolean }
            | undefined;

          if (oldRow) {
            await sql`
              UPDATE merchant_store_rush_windows
              SET is_active = FALSE
              WHERE id = ${oldRow.id}
            `;
          }

          const inserted = await sql`
            INSERT INTO merchant_store_rush_windows (store_id, duration_minutes, started_at, ends_at, is_active, created_by, marked_from)
            VALUES (${storeId}, ${duration}, ${now.toISOString()}, ${endsAt.toISOString()}, TRUE, NULL, 'merchant_app')
            RETURNING id, duration_minutes, started_at, ends_at, is_active
          `;
          const newRow = inserted[0] as {
            id: number;
            duration_minutes: number;
            started_at: Date | string;
            ends_at: Date | string;
            is_active: boolean;
          };

          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          const oldValue = oldRow
            ? {
                id: oldRow.id,
                duration_minutes: Number(oldRow.duration_minutes),
                started_at:
                  oldRow.started_at instanceof Date
                    ? oldRow.started_at.toISOString()
                    : String(oldRow.started_at),
                ends_at:
                  oldRow.ends_at instanceof Date
                    ? oldRow.ends_at.toISOString()
                    : String(oldRow.ends_at),
                is_active: oldRow.is_active,
              }
            : null;
          const newValue = {
            id: newRow.id,
            duration_minutes: Number(newRow.duration_minutes),
            started_at:
              newRow.started_at instanceof Date
                ? newRow.started_at.toISOString()
                : String(newRow.started_at),
            ends_at:
              newRow.ends_at instanceof Date
                ? newRow.ends_at.toISOString()
                : String(newRow.ends_at),
            is_active: newRow.is_active,
          };

          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            oldRow ? "UPDATE" : "CREATE",
            auditCtx,
            "rush_window",
            oldValue,
            newValue,
            { section: "operations", route: "POST /merchant-partner/stores/:storeId/rush" }
          );

          const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
          const remainingMinutes = Math.floor(remainingMs / 60000);

          return reply.send({
            ok: true,
            store_id: storeId,
            is_active: true,
            duration_minutes: duration,
            started_at: now.toISOString(),
            ends_at: endsAt.toISOString(),
            remaining_minutes: remainingMinutes,
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/rush — manually stop current rush window. */
      protectedApp.patch<{ Params: { storeId: string }; Body: { is_active?: boolean } }>(
        "/stores/:storeId/rush",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const body = req.body || {};
          if (body.is_active !== false) {
            return reply.code(400).send({ error: "invalid_body", message: "Only is_active=false is supported." });
          }

          const existingRows = await sql`
            SELECT id, duration_minutes, started_at, ends_at, is_active
            FROM merchant_store_rush_windows
            WHERE store_id = ${storeId} AND is_active = TRUE
            ORDER BY started_at DESC
            LIMIT 1
          `;
          const row = existingRows[0] as
            | {
                id: number;
                duration_minutes: number;
                started_at: Date | string;
                ends_at: Date | string;
                is_active: boolean;
              }
            | undefined;

          if (!row) {
            return reply.send({
              ok: true,
              store_id: storeId,
              is_active: false,
              duration_minutes: null,
              started_at: null,
              ends_at: null,
              remaining_minutes: 0,
            });
          }

          const now = new Date();

          await sql`
            UPDATE merchant_store_rush_windows
            SET is_active = FALSE,
                ends_at = ${now.toISOString()}
            WHERE id = ${row.id}
          `;

          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          const oldValue = {
            id: row.id,
            duration_minutes: Number(row.duration_minutes),
            started_at:
              row.started_at instanceof Date
                ? row.started_at.toISOString()
                : String(row.started_at),
            ends_at:
              row.ends_at instanceof Date
                ? row.ends_at.toISOString()
                : String(row.ends_at),
            is_active: row.is_active,
          };
          const newValue = {
            id: row.id,
            duration_minutes: Number(row.duration_minutes),
            started_at:
              row.started_at instanceof Date
                ? row.started_at.toISOString()
                : String(row.started_at),
            ends_at: now.toISOString(),
            is_active: false,
          };

          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "rush_window",
            oldValue,
            newValue,
            { section: "operations", route: "PATCH /merchant-partner/stores/:storeId/rush" }
          );

          return reply.send({
            ok: true,
            store_id: storeId,
            is_active: false,
            duration_minutes: null,
            started_at: null,
            ends_at: null,
            remaining_minutes: 0,
          });
        }
      );

      /** GET /merchant-partner/stores/:storeId/operating-hours */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId/operating-hours", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const hoursRows = await sql`
          SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
        `;
        const row = hoursRows[0] as any;
        if (!row) {
          return reply.send(null);
        }
        const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
        const out: any = { id: row.id, store_id: row.store_id, is_24_hours: row.is_24_hours, same_for_all_days: row.same_for_all_days, closed_days: normalizeClosedDays(row.closed_days) };
        for (const d of dayKeys) {
          out[d] = {
            open: row[`${d}_open`],
            slot1_start: row[`${d}_slot1_start`],
            slot1_end: row[`${d}_slot1_end`],
            slot2_start: row[`${d}_slot2_start`],
            slot2_end: row[`${d}_slot2_end`],
          };
        }
        return reply.send(out);
      });

      /** PATCH /merchant-partner/stores/:storeId/operating-hours — upsert. */
      protectedApp.patch<{ Params: { storeId: string }; Body: any }>("/stores/:storeId/operating-hours", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const b = (req.body || {}) as Record<string, unknown>;
        const is24 = b.is_24_hours === true;
        const sameForAll = b.same_for_all_days === true;
        const closedDaysRaw = is24 ? [] : Array.isArray(b.closed_days) ? b.closed_days : [];
        const closedDays = closedDaysRaw.filter((x): x is string => typeof x === "string");
        const existingRows = await sql`SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1`;
        const existing = existingRows as any[];
        const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
        const dayPayload = (b.days || {}) as Record<string, Record<string, unknown>>;

        const normalizeTime = (v: unknown): string | null => {
          if (v == null || v === "") return null;
          const s = String(v).trim();
          if (!s) return null;
          const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
          if (match) {
            const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
            const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
            const sec = match[3] != null ? Math.min(59, Math.max(0, Number(match[3]) || 0)) : 0;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
          }
          return null;
        };

        const buildSlots = (day: string) => {
          if (is24) {
            return {
              open: true,
              slot1_start: "00:00:00",
              slot1_end: "23:59:00",
              slot2_start: null as string | null,
              slot2_end: null as string | null,
            };
          }
          const d = dayPayload[day] || {};
          return {
            open: d.open === true,
            slot1_start: normalizeTime(d.slot1_start),
            slot1_end: normalizeTime(d.slot1_end),
            slot2_start: normalizeTime(d.slot2_start),
            slot2_end: normalizeTime(d.slot2_end),
          };
        };

        try {
          if (existing.length > 0) {
            const id = (existing[0] as any).id;
            const updateParams = [
              is24,
              sameForAll,
              closedDays.length > 0 ? closedDays : null,
              ...dayKeys.flatMap((d) => {
                const s = buildSlots(d);
                return [s.open, s.slot1_start, s.slot1_end, s.slot2_start, s.slot2_end];
              }),
              id,
            ];
            await sql.unsafe(
              `UPDATE merchant_store_operating_hours SET
                is_24_hours = $1, same_for_all_days = $2, closed_days = $3,
                monday_open = $4, monday_slot1_start = $5, monday_slot1_end = $6, monday_slot2_start = $7, monday_slot2_end = $8,
                tuesday_open = $9, tuesday_slot1_start = $10, tuesday_slot1_end = $11, tuesday_slot2_start = $12, tuesday_slot2_end = $13,
                wednesday_open = $14, wednesday_slot1_start = $15, wednesday_slot1_end = $16, wednesday_slot2_start = $17, wednesday_slot2_end = $18,
                thursday_open = $19, thursday_slot1_start = $20, thursday_slot1_end = $21, thursday_slot2_start = $22, thursday_slot2_end = $23,
                friday_open = $24, friday_slot1_start = $25, friday_slot1_end = $26, friday_slot2_start = $27, friday_slot2_end = $28,
                saturday_open = $29, saturday_slot1_start = $30, saturday_slot1_end = $31, saturday_slot2_start = $32, saturday_slot2_end = $33,
                sunday_open = $34, sunday_slot1_start = $35, sunday_slot1_end = $36, sunday_slot2_start = $37, sunday_slot2_end = $38,
                updated_at = NOW() WHERE id = $39`,
              updateParams
            );
          } else {
            const slots = dayKeys.flatMap((d) => {
              const s = buildSlots(d);
              return [s.open, s.slot1_start, s.slot1_end, s.slot2_start, s.slot2_end];
            });
            const placeholders = Array.from({ length: 39 }, (_, i) => `$${i + 1}`).join(", ");
            await sql.unsafe(
              `INSERT INTO merchant_store_operating_hours (store_id, is_24_hours, same_for_all_days, closed_days,
                monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
                tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
                wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
                thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
                friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
                saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
                sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end)
                VALUES (${placeholders})`,
              [storeId, is24, sameForAll, closedDays.length > 0 ? closedDays : null, ...slots]
            );
          }
        } catch (err: unknown) {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message?: string }).message)
              : "Database error";
          const detail =
            err && typeof err === "object" && "detail" in err
              ? String((err as { detail?: string }).detail)
              : "";
          const errorMessage = detail ? `${msg} — ${detail}` : msg;
          return reply.code(500).send({ error: errorMessage });
        }

        const afterRows = await sql`SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1`;
        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          existing.length > 0 ? "UPDATE" : "CREATE",
          auditCtx,
          "operating_hours",
          existing[0] ?? null,
          (afterRows[0] as any) ?? null,
          { section: "operating_hours", route: "PATCH /merchant-partner/stores/:storeId/operating-hours" }
        );
        // Overwriting the schedule is an explicit re-intent: drop any lingering
        // TRANSIENT manual close (temp close / "closed until reopened") so the fresh
        // hours take effect immediately and the tick below can auto-open when we are
        // now within a slot. Deliberate controls are preserved: the "Manual activation
        // lock" (block_auto_open) and an active vacation/forced-lock closure are left
        // untouched so a locked or on-vacation store stays closed.
        await sql`
          UPDATE merchant_store_availability
          SET
            manual_close_until = NULL,
            is_manual_override = FALSE,
            manual_override_at = NULL,
            schedule_end_prompted_at = NULL,
            schedule_end_prompt_expires_at = NULL,
            unavailable_reason = CASE
              WHEN unavailable_reason IN ('manual_indefinite', 'manual_close') THEN NULL
              ELSE unavailable_reason
            END,
            close_reason = CASE
              WHEN unavailable_reason IN ('manual_indefinite', 'manual_close') THEN NULL
              ELSE close_reason
            END,
            updated_at = NOW()
          WHERE store_id = ${storeId}
            AND block_auto_open IS NOT TRUE
            AND (unavailable_reason IS NULL OR unavailable_reason NOT IN ('vacation', 'forced_lock'))
        `;
        await runStoreScheduleTickForStore(storeId, req.log);
        return reply.send({ ok: true });
      });

      /** STAFF MANAGEMENT */

      /** GET /merchant-partner/stores/:storeId/staff — list active staff for this store. */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId/staff", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const rows = await sql`
          SELECT id, store_id, name, phone_number, role, status, created_at, updated_at
          FROM store_staff
          WHERE store_id = ${storeId} AND status = TRUE
          ORDER BY created_at ASC
        `;
        return reply.send(rows);
      });

      /** POST /merchant-partner/stores/:storeId/staff — add staff member. */
      protectedApp.post<{ Params: { storeId: string }; Body: { name?: string; phone_number?: string; role?: string } }>(
        "/stores/:storeId/staff",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const { name, phone_number, role } = req.body || {};
          if (!name || !phone_number || !role) {
            return reply.code(400).send({ error: "missing_fields" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const inserted = await sql`
            INSERT INTO store_staff (store_id, name, phone_number, role)
            VALUES (${storeId}, ${name}, ${phone_number}, ${role})
            RETURNING id, store_id, name, phone_number, role, status, created_at, updated_at
          `;
          const staff = inserted[0] as any;
          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "CREATE",
            auditCtx,
            "staff",
            null,
            staff,
            { section: "staff", route: "POST /merchant-partner/stores/:storeId/staff" }
          );
          return reply.code(201).send(staff);
        }
      );

      /** SELF-DELIVERY RIDERS */

      /** GET /merchant-partner/stores/:storeId/self-delivery-riders — list self-delivery riders for this store. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { active_only?: string } }>(
        "/stores/:storeId/self-delivery-riders",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const activeOnly = req.query?.active_only !== "false";
          const rows = activeOnly
            ? await sql`
                SELECT id,
                       store_id,
                       rider_name,
                       rider_mobile,
                       rider_email,
                       vehicle_number,
                       is_primary,
                       is_active,
                       created_at,
                       updated_at
                FROM merchant_store_self_delivery_riders
                WHERE store_id = ${storeId} AND is_active = TRUE
                ORDER BY is_primary DESC NULLS LAST, rider_name ASC
              `
            : await sql`
                SELECT id,
                       store_id,
                       rider_name,
                       rider_mobile,
                       rider_email,
                       vehicle_number,
                       is_primary,
                       is_active,
                       created_at,
                       updated_at
                FROM merchant_store_self_delivery_riders
                WHERE store_id = ${storeId}
                ORDER BY is_primary DESC NULLS LAST, rider_name ASC
              `;

          return reply.send(
            (rows as any[]).map((r) => ({
              id: r.id,
              store_id: r.store_id,
              rider_name: r.rider_name,
              rider_mobile: r.rider_mobile,
              rider_email: r.rider_email ?? null,
              vehicle_number: r.vehicle_number ?? null,
              is_primary: r.is_primary === true,
              is_active: r.is_active !== false,
              created_at: r.created_at,
              updated_at: r.updated_at,
            }))
          );
        }
      );

      /** POST /merchant-partner/stores/:storeId/self-delivery-riders — add a new self-delivery rider. */
      protectedApp.post<{
        Params: { storeId: string };
        Body: { rider_name?: string; rider_mobile?: string; rider_email?: string | null; vehicle_number?: string | null; is_primary?: boolean };
      }>("/stores/:storeId/self-delivery-riders", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const { rider_name, rider_mobile, rider_email, vehicle_number, is_primary } = req.body || {};
        if (!rider_name || !rider_mobile) {
          return reply.code(400).send({ error: "missing_fields", message: "rider_name and rider_mobile are required" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        // If this rider is marked as primary, unset existing primary riders for this store.
        if (is_primary === true) {
          await sql`
            UPDATE merchant_store_self_delivery_riders
            SET is_primary = FALSE, updated_at = NOW()
            WHERE store_id = ${storeId} AND is_primary = TRUE
          `;
        }

        const inserted = await sql`
          INSERT INTO merchant_store_self_delivery_riders (
            store_id,
            rider_name,
            rider_mobile,
            rider_email,
            vehicle_number,
            is_primary
          )
          VALUES (
            ${storeId},
            ${rider_name},
            ${rider_mobile},
            ${rider_email ?? null},
            ${vehicle_number ?? null},
            ${is_primary === true}
          )
          RETURNING id,
                    store_id,
                    rider_name,
                    rider_mobile,
                    rider_email,
                    vehicle_number,
                    is_primary,
                    is_active,
                    created_at,
                    updated_at
        `;
        const rider = inserted[0] as any;

        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          "CREATE",
          auditCtx,
          "self_delivery_rider",
          null,
          rider,
          { section: "delivery_settings", route: "POST /merchant-partner/stores/:storeId/self-delivery-riders" }
        );

        return reply.code(201).send(rider);
      });

      /** PATCH /merchant-partner/stores/:storeId/self-delivery-riders/:riderId — edit rider or toggle active/primary. */
      protectedApp.patch<{
        Params: { storeId: string; riderId: string };
        Body: {
          rider_name?: string;
          rider_mobile?: string;
          rider_email?: string | null;
          vehicle_number?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
        };
      }>("/stores/:storeId/self-delivery-riders/:riderId", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const riderId = Number(req.params.riderId);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(riderId) || riderId < 1) {
          return reply.code(400).send({ error: "invalid_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const riderRows = await sql`
          SELECT *
          FROM merchant_store_self_delivery_riders
          WHERE id = ${riderId} AND store_id = ${storeId}
          LIMIT 1
        `;
        const existing = riderRows[0] as any;
        if (!existing) return reply.code(404).send({ error: "rider_not_found" });

        const body = req.body || {};
        const updates: Record<string, any> = {};
        if (typeof body.rider_name === "string") updates.rider_name = body.rider_name;
        if (typeof body.rider_mobile === "string") updates.rider_mobile = body.rider_mobile;
        if (body.rider_email !== undefined) updates.rider_email = body.rider_email;
        if (body.vehicle_number !== undefined) updates.vehicle_number = body.vehicle_number;
        if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
        const setPrimary = body.is_primary === true;

        if (Object.keys(updates).length === 0 && !setPrimary && body.is_primary !== false) {
          return reply.send(existing);
        }

        // If becoming primary, clear previous primaries.
        if (setPrimary) {
          await sql`
            UPDATE merchant_store_self_delivery_riders
            SET is_primary = FALSE, updated_at = NOW()
            WHERE store_id = ${storeId} AND is_primary = TRUE AND id <> ${riderId}
          `;
          updates.is_primary = true;
        } else if (body.is_primary === false) {
          updates.is_primary = false;
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const setClause = Object.keys(updates)
            .map((k, i) => `${k} = $${i + 1}`)
            .join(", ");
          const values = Object.values(updates);
          await (sql as any).unsafe?.(
            `UPDATE merchant_store_self_delivery_riders SET ${setClause} WHERE id = $${values.length + 1} AND store_id = $${values.length + 2}`,
            [...values, riderId, storeId]
          ) ??
            (await sql`
              UPDATE merchant_store_self_delivery_riders
              SET ${sql([setClause])}
              WHERE id = ${riderId} AND store_id = ${storeId}
            `);
        }

        const updatedRows = await sql`
          SELECT *
          FROM merchant_store_self_delivery_riders
          WHERE id = ${riderId} AND store_id = ${storeId}
          LIMIT 1
        `;
        const updated = updatedRows[0] as any;

        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          "UPDATE",
          auditCtx,
          "self_delivery_rider",
          existing,
          updated,
          { section: "delivery_settings", route: "PATCH /merchant-partner/stores/:storeId/self-delivery-riders/:riderId" }
        );

        return reply.send(updated);
      });

      /** DELETE /merchant-partner/stores/:storeId/self-delivery-riders/:riderId — soft delete rider (mark inactive). */
      protectedApp.delete<{ Params: { storeId: string; riderId: string } }>(
        "/stores/:storeId/self-delivery-riders/:riderId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const riderId = Number(req.params.riderId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(riderId) || riderId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const riderRows = await sql`
            SELECT *
            FROM merchant_store_self_delivery_riders
            WHERE id = ${riderId} AND store_id = ${storeId}
            LIMIT 1
          `;
          const existing = riderRows[0] as any;
          if (!existing) return reply.code(404).send({ error: "rider_not_found" });

          await sql`
            UPDATE merchant_store_self_delivery_riders
            SET is_active = FALSE, updated_at = NOW()
            WHERE id = ${riderId} AND store_id = ${storeId}
          `;

          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "self_delivery_rider",
            existing,
            { ...existing, is_active: false },
            { section: "delivery_settings", route: "DELETE /merchant-partner/stores/:storeId/self-delivery-riders/:riderId" }
          );

          return reply.send({ ok: true });
        }
      );

      /** GET /merchant-partner/stores/:storeId/delivery-charges — packaging + per-km delivery charges with edit windows. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/delivery-charges",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const rows = await sql`
            SELECT packaging_charge_amount,
                   packaging_charge_last_updated_at,
                   delivery_charge_per_km,
                   delivery_charge_per_km_last_updated_at
            FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (rows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const r = rows[0] as {
            packaging_charge_amount: number | null;
            packaging_charge_last_updated_at: Date | string | null;
            delivery_charge_per_km: number | null;
            delivery_charge_per_km_last_updated_at: Date | string | null;
          };
          const now = Date.now();
          const windowMs = 30 * 24 * 60 * 60 * 1000;

          function computeLock(last: Date | string | null) {
            if (!last) {
              return {
                locked: false,
                next_edit_at: null as string | null,
                seconds_until_edit: 0,
              };
            }
            const lastTime =
              last instanceof Date ? last.getTime() : new Date(String(last)).getTime();
            if (!Number.isFinite(lastTime)) {
              return {
                locked: false,
                next_edit_at: null,
                seconds_until_edit: 0,
              };
            }
            const next = lastTime + windowMs;
            if (next <= now) {
              return {
                locked: false,
                next_edit_at: new Date(next).toISOString(),
                seconds_until_edit: 0,
              };
            }
            const diffSec = Math.floor((next - now) / 1000);
            return {
              locked: true,
              next_edit_at: new Date(next).toISOString(),
              seconds_until_edit: diffSec,
            };
          }

          const packLock = computeLock(r.packaging_charge_last_updated_at);
          const delivLock = computeLock(r.delivery_charge_per_km_last_updated_at);

          return reply.send({
            store_id: storeId,
            packaging_charge_amount:
              r.packaging_charge_amount != null ? Number(r.packaging_charge_amount) : null,
            packaging_charge_last_updated_at:
              r.packaging_charge_last_updated_at instanceof Date
                ? r.packaging_charge_last_updated_at.toISOString()
                : r.packaging_charge_last_updated_at != null
                  ? String(r.packaging_charge_last_updated_at)
                  : null,
            packaging_charge_locked: packLock.locked,
            packaging_charge_next_edit_at: packLock.next_edit_at,
            packaging_charge_seconds_until_edit: packLock.seconds_until_edit,
            delivery_charge_per_km:
              r.delivery_charge_per_km != null ? Number(r.delivery_charge_per_km) : null,
            delivery_charge_per_km_last_updated_at:
              r.delivery_charge_per_km_last_updated_at instanceof Date
                ? r.delivery_charge_per_km_last_updated_at.toISOString()
                : r.delivery_charge_per_km_last_updated_at != null
                  ? String(r.delivery_charge_per_km_last_updated_at)
                  : null,
            delivery_charge_locked: delivLock.locked,
            delivery_charge_next_edit_at: delivLock.next_edit_at,
            delivery_charge_seconds_until_edit: delivLock.seconds_until_edit,
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/delivery-charges — update packaging or per-km delivery charges (30-day window). */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: { packaging_charge_amount?: number | null; delivery_charge_per_km?: number | null };
      }>("/stores/:storeId/delivery-charges", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const body = (req.body || {}) as {
          packaging_charge_amount?: number | null;
          delivery_charge_per_km?: number | null;
        };
        const hasPackaging = body.packaging_charge_amount != null;
        const hasDelivery = body.delivery_charge_per_km != null;
        if (!hasPackaging && !hasDelivery) {
          return reply.code(400).send({ error: "invalid_body", message: "At least one charge field required" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        const storeRows = await sql`
          SELECT id,
                 packaging_charge_amount,
                 packaging_charge_last_updated_at,
                 delivery_charge_per_km,
                 delivery_charge_per_km_last_updated_at
          FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const existing = storeRows[0] as {
          id: number;
          packaging_charge_amount: number | null;
          packaging_charge_last_updated_at: Date | string | null;
          delivery_charge_per_km: number | null;
          delivery_charge_per_km_last_updated_at: Date | string | null;
        };

        const now = Date.now();
        const windowMs = 30 * 24 * 60 * 60 * 1000;

        function locked(last: Date | string | null): boolean {
          if (!last) return false;
          const t =
            last instanceof Date ? last.getTime() : new Date(String(last)).getTime();
          if (!Number.isFinite(t)) return false;
          return t + windowMs > now;
        }

        // Validate ranges and lock windows.
        if (hasPackaging) {
          const v = Number(body.packaging_charge_amount);
          if (!Number.isFinite(v) || v < 6 || v > 15) {
            return reply
              .code(400)
              .send({ error: "invalid_packaging_charge", message: "Packaging charge must be between 6 and 15." });
          }
          if (locked(existing.packaging_charge_last_updated_at)) {
            return reply
              .code(400)
              .send({ error: "packaging_locked", message: "Packaging charge can only be edited once every 30 days." });
          }
        }
        if (hasDelivery) {
          const v = Number(body.delivery_charge_per_km);
          if (!Number.isFinite(v) || v < 7 || v > 15) {
            return reply
              .code(400)
              .send({ error: "invalid_delivery_charge", message: "Delivery charge per km must be between 7 and 15." });
          }
          if (locked(existing.delivery_charge_per_km_last_updated_at)) {
            return reply
              .code(400)
              .send({ error: "delivery_locked", message: "Delivery charge per km can only be edited once every 30 days." });
          }
        }

        const updates: string[] = [];
        const vals: any[] = [];

        if (hasPackaging) {
          updates.push(`packaging_charge_amount = $${updates.length + 1}`);
          vals.push(Number(body.packaging_charge_amount));
          updates.push(
            `packaging_charge_last_updated_at = $${updates.length + 1}`
          );
          vals.push(new Date().toISOString());
        }
        if (hasDelivery) {
          updates.push(`delivery_charge_per_km = $${updates.length + 1}`);
          vals.push(Number(body.delivery_charge_per_km));
          updates.push(
            `delivery_charge_per_km_last_updated_at = $${updates.length + 1}`
          );
          vals.push(new Date().toISOString());
        }
        updates.push(`updated_at = $${updates.length + 1}`);
        vals.push(new Date().toISOString());

        const setClause = updates.join(", ");
        await (sql as any).unsafe?.(
          `UPDATE merchant_stores SET ${setClause} WHERE id = $${
            vals.length + 1
          } AND parent_id = $${vals.length + 2}`,
          [...vals, storeId, parentId]
        ) ??
          (await sql`
            UPDATE merchant_stores
            SET ${sql([setClause])}
            WHERE id = ${storeId} AND parent_id = ${parentId}
          `);

        const afterRows = await sql`
          SELECT packaging_charge_amount,
                 packaging_charge_last_updated_at,
                 delivery_charge_per_km,
                 delivery_charge_per_km_last_updated_at
          FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        const after = afterRows[0] as typeof existing;

        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          "UPDATE",
          auditCtx,
          "delivery_charges",
          {
            packaging_charge_amount: existing.packaging_charge_amount,
            packaging_charge_last_updated_at: existing.packaging_charge_last_updated_at,
            delivery_charge_per_km: existing.delivery_charge_per_km,
            delivery_charge_per_km_last_updated_at:
              existing.delivery_charge_per_km_last_updated_at,
          },
          {
            packaging_charge_amount: after.packaging_charge_amount,
            packaging_charge_last_updated_at: after.packaging_charge_last_updated_at,
            delivery_charge_per_km: after.delivery_charge_per_km,
            delivery_charge_per_km_last_updated_at:
              after.delivery_charge_per_km_last_updated_at,
          },
          { section: "delivery_settings", route: "PATCH /merchant-partner/stores/:storeId/delivery-charges" }
        );

        const now2 = Date.now();
        function computeLock2(last: Date | string | null) {
          if (!last) {
            return {
              locked: false,
              next_edit_at: null as string | null,
              seconds_until_edit: 0,
            };
          }
          const lastTime =
            last instanceof Date ? last.getTime() : new Date(String(last)).getTime();
          if (!Number.isFinite(lastTime)) {
            return {
              locked: false,
              next_edit_at: null,
              seconds_until_edit: 0,
            };
          }
          const next = lastTime + windowMs;
          if (next <= now2) {
            return {
              locked: false,
              next_edit_at: new Date(next).toISOString(),
              seconds_until_edit: 0,
            };
          }
          const diffSec = Math.floor((next - now2) / 1000);
          return {
            locked: true,
            next_edit_at: new Date(next).toISOString(),
            seconds_until_edit: diffSec,
          };
        }

        const packLock2 = computeLock2(after.packaging_charge_last_updated_at);
        const delivLock2 = computeLock2(after.delivery_charge_per_km_last_updated_at);

        return reply.send({
          store_id: storeId,
          packaging_charge_amount:
            after.packaging_charge_amount != null ? Number(after.packaging_charge_amount) : null,
          packaging_charge_last_updated_at:
            after.packaging_charge_last_updated_at instanceof Date
              ? after.packaging_charge_last_updated_at.toISOString()
              : after.packaging_charge_last_updated_at != null
                ? String(after.packaging_charge_last_updated_at)
                : null,
          packaging_charge_locked: packLock2.locked,
          packaging_charge_next_edit_at: packLock2.next_edit_at,
          packaging_charge_seconds_until_edit: packLock2.seconds_until_edit,
          delivery_charge_per_km:
            after.delivery_charge_per_km != null ? Number(after.delivery_charge_per_km) : null,
          delivery_charge_per_km_last_updated_at:
            after.delivery_charge_per_km_last_updated_at instanceof Date
              ? after.delivery_charge_per_km_last_updated_at.toISOString()
              : after.delivery_charge_per_km_last_updated_at != null
                ? String(after.delivery_charge_per_km_last_updated_at)
                : null,
          delivery_charge_locked: delivLock2.locked,
          delivery_charge_next_edit_at: delivLock2.next_edit_at,
          delivery_charge_seconds_until_edit: delivLock2.seconds_until_edit,
        });
      });

      /** GET /merchant-partner/stores/:storeId/communication-settings — notification & report preferences for this store. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/communication-settings",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT settings_metadata
            FROM merchant_store_settings
            WHERE store_id = ${storeId}
            LIMIT 1
          `;
          const meta = (rows[0] as { settings_metadata?: any } | undefined)?.settings_metadata ?? {};
          const prefs = (meta.notification_preferences as any) ?? {};

          const response = {
            store_id: storeId,
            whatsapp_notifications: prefs.whatsapp_notifications === true,
            reports: {
              daily_whatsapp: prefs.reports?.daily_whatsapp === true,
              daily_email: prefs.reports?.daily_email === true,
              weekly_whatsapp: prefs.reports?.weekly_whatsapp === true,
              weekly_email: prefs.reports?.weekly_email === true,
            },
            order_notifications: {
              enabled: prefs.order_notifications?.enabled !== false,
              ring_volume:
                typeof prefs.order_notifications?.ring_volume === "number"
                  ? Math.min(Math.max(prefs.order_notifications.ring_volume, 0), 1)
                  : 0.7,
              ring_in_silent: prefs.order_notifications?.ring_in_silent === true,
            },
            live_complaint_notifications: prefs.live_complaint_notifications !== false,
            rider_notifications: prefs.rider_notifications !== false,
          };

          return reply.send(response);
        }
      );

      async function requireOwnedPartnerStore(
        sql: ReturnType<typeof getSql>,
        parentMerchantId: string,
        storeId: number
      ) {
        const parentId = await getPartnerParentId(sql, parentMerchantId);
        if (parentId == null) return { error: "partner_not_found" as const, status: 404 as const };
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return { error: "store_not_found" as const, status: 404 as const };
        return { storeId };
      }

      /**
       * GET /merchant-partner/stores/:storeId/onboarding/tasks
       * Authoritative DB state for Home onboarding card visibility.
       */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/onboarding/tasks",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isFinite(storeId) || storeId <= 0) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const owned = await requireOwnedPartnerStore(sql, req.auth.sub, storeId);
          if ("error" in owned) return reply.code(owned.status ?? 403).send({ error: owned.error });
          const row = await getOnboardingTask(sql, storeId, ONBOARDING_BENEFITS_TASK_KEY);
          const task = toOnboardingTaskDto(row, ONBOARDING_BENEFITS_TASK_KEY);
          return reply.send({ storeId, tasks: [task], task });
        }
      );

      /** POST /merchant-partner/stores/:storeId/onboarding/tasks/:taskKey/start */
      protectedApp.post<{ Params: { storeId: string; taskKey: string } }>(
        "/stores/:storeId/onboarding/tasks/:taskKey/start",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const taskKey = String(req.params.taskKey || "").trim() || ONBOARDING_BENEFITS_TASK_KEY;
          if (!Number.isFinite(storeId) || storeId <= 0) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          if (taskKey !== ONBOARDING_BENEFITS_TASK_KEY) {
            return reply.code(400).send({ error: "unknown_task_key" });
          }
          const sql = getSql();
          const owned = await requireOwnedPartnerStore(sql, req.auth.sub, storeId);
          if ("error" in owned) return reply.code(owned.status ?? 403).send({ error: owned.error });
          const row = await ensureOnboardingTaskStarted(sql, storeId, taskKey);
          return reply.send(toOnboardingTaskDto(row, taskKey));
        }
      );

      /** POST /merchant-partner/stores/:storeId/onboarding/tasks/:taskKey/complete — idempotent. */
      protectedApp.post<{ Params: { storeId: string; taskKey: string } }>(
        "/stores/:storeId/onboarding/tasks/:taskKey/complete",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const taskKey = String(req.params.taskKey || "").trim() || ONBOARDING_BENEFITS_TASK_KEY;
          if (!Number.isFinite(storeId) || storeId <= 0) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          if (taskKey !== ONBOARDING_BENEFITS_TASK_KEY) {
            return reply.code(400).send({ error: "unknown_task_key" });
          }
          const sql = getSql();
          const owned = await requireOwnedPartnerStore(sql, req.auth.sub, storeId);
          if ("error" in owned) return reply.code(owned.status ?? 403).send({ error: owned.error });
          const row = await completeOnboardingTask(sql, storeId, {
            taskKey,
            completedBy: req.auth.sub,
          });
          return reply.send(toOnboardingTaskDto(row, taskKey));
        }
      );

      /**
       * GET /merchant-partner/stores/:storeId/onboarding-benefits
       * Compatibility wrapper over merchant_onboarding_tasks.
       */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/onboarding-benefits",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isFinite(storeId) || storeId <= 0) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const owned = await requireOwnedPartnerStore(sql, req.auth.sub, storeId);
          if ("error" in owned) return reply.code(owned.status ?? 403).send({ error: owned.error });
          const dto = toOnboardingTaskDto(
            await getOnboardingTask(sql, storeId, ONBOARDING_BENEFITS_TASK_KEY)
          );
          return reply.send({
            store_id: storeId,
            task_key: dto.taskKey,
            status: dto.status,
            started_at: dto.startedAt,
            packaging_tips_completed_at: dto.packagingTipsCompletedAt,
            dismissed_at: null,
            completed_at: dto.completedAt,
            expires_at: dto.expiresAt,
            is_expired: dto.isExpired,
            visible: dto.visible,
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/onboarding-benefits */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: {
          started_at?: string | null;
          packaging_tips_completed_at?: string | null;
          dismissed_at?: string | null;
          completed_at?: string | null;
        };
      }>("/stores/:storeId/onboarding-benefits", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isFinite(storeId) || storeId <= 0) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const owned = await requireOwnedPartnerStore(sql, req.auth.sub, storeId);
        if ("error" in owned) return reply.code(owned.status ?? 403).send({ error: owned.error });
        const body = req.body ?? {};
        let row = await getOnboardingTask(sql, storeId, ONBOARDING_BENEFITS_TASK_KEY);
        if (body.started_at !== undefined || !row) {
          row = await ensureOnboardingTaskStarted(sql, storeId, ONBOARDING_BENEFITS_TASK_KEY);
        }
        const metaPatch: Record<string, unknown> = {};
        if (body.packaging_tips_completed_at !== undefined) {
          metaPatch.packaging_tips_completed_at = body.packaging_tips_completed_at;
        }
        if (body.dismissed_at !== undefined) {
          metaPatch.dismissed_at = body.dismissed_at;
        }
        if (Object.keys(metaPatch).length > 0) {
          row = await patchOnboardingTaskMetadata(sql, storeId, metaPatch);
        }
        // completed_at may be set, never cleared. Idempotent complete.
        if (body.completed_at) {
          row = await completeOnboardingTask(sql, storeId, {
            taskKey: ONBOARDING_BENEFITS_TASK_KEY,
            completedBy: req.auth.sub,
          });
        }
        const dto = toOnboardingTaskDto(row);
        return reply.send({
          store_id: storeId,
          task_key: dto.taskKey,
          status: dto.status,
          started_at: dto.startedAt,
          packaging_tips_completed_at: dto.packagingTipsCompletedAt,
          dismissed_at: typeof body.dismissed_at === "string" ? body.dismissed_at : null,
          completed_at: dto.completedAt,
          expires_at: dto.expiresAt,
          is_expired: dto.isExpired,
          visible: dto.visible,
        });
      });

      /** PATCH /merchant-partner/stores/:storeId/communication-settings — update notification & report preferences. */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: {
          settings?: {
            whatsapp_notifications?: boolean;
            reports?: {
              daily_whatsapp?: boolean;
              daily_email?: boolean;
              weekly_whatsapp?: boolean;
              weekly_email?: boolean;
            };
            order_notifications?: {
              enabled?: boolean;
              ring_volume?: number;
              ring_in_silent?: boolean;
            };
            live_complaint_notifications?: boolean;
            rider_notifications?: boolean;
          };
        };
      }>("/stores/:storeId/communication-settings", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const body = (req.body || {}) as {
          settings?: {
            whatsapp_notifications?: boolean;
            reports?: {
              daily_whatsapp?: boolean;
              daily_email?: boolean;
              weekly_whatsapp?: boolean;
              weekly_email?: boolean;
            };
            order_notifications?: {
              enabled?: boolean;
              ring_volume?: number;
              ring_in_silent?: boolean;
            };
            live_complaint_notifications?: boolean;
            rider_notifications?: boolean;
          };
        };
        if (!body.settings || typeof body.settings !== "object") {
          return reply.code(400).send({ error: "invalid_body", message: "settings object required" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const rows = await sql`
          SELECT id, settings_metadata
          FROM merchant_store_settings
          WHERE store_id = ${storeId}
          LIMIT 1
        `;
        const existingRow = rows[0] as { id: number; settings_metadata: any } | undefined;
        const existingMeta = existingRow?.settings_metadata ?? {};
        const existingPrefs = (existingMeta.notification_preferences as any) ?? {};

        const mergedPrefs = {
          ...existingPrefs,
          ...body.settings,
          reports: {
            ...(existingPrefs.reports ?? {}),
            ...(body.settings.reports ?? {}),
          },
          order_notifications: {
            ...(existingPrefs.order_notifications ?? {}),
            ...(body.settings.order_notifications ?? {}),
          },
        };

        const nextMeta = {
          ...existingMeta,
          notification_preferences: mergedPrefs,
        };

        const metaJson = JSON.stringify(nextMeta);

        if (!existingRow) {
          await sql`
            INSERT INTO merchant_store_settings (store_id, settings_metadata)
            VALUES (${storeId}, ${metaJson}::text::jsonb)
          `;
        } else {
          await sql`
            UPDATE merchant_store_settings
            SET settings_metadata = ${metaJson}::text::jsonb,
                updated_at = NOW()
            WHERE id = ${existingRow.id}
          `;
        }

        const parentRow = await getParentForAudit(sql, parentId);
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          existingRow ? "UPDATE" : "CREATE",
          auditCtx,
          "notification_preferences",
          existingPrefs ?? null,
          mergedPrefs,
          { section: "store_settings", route: "PATCH /merchant-partner/stores/:storeId/communication-settings" }
        );

        return reply.send({ ok: true });
      });

      /** PATCH /merchant-partner/stores/:storeId/bank-account — upsert primary payout account for this store. */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: {
          account_holder_name?: string;
          account_number?: string;
          ifsc_code?: string;
          bank_name?: string;
          branch_name?: string | null;
          account_type?: string | null;
          upi_id?: string | null;
          payout_method?: string | null;
          beneficiary_name?: string | null;
        };
      }>("/stores/:storeId/bank-account", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const body = (req.body || {}) as {
          account_holder_name?: string;
          account_number?: string;
          ifsc_code?: string;
          bank_name?: string;
          branch_name?: string | null;
          account_type?: string | null;
          upi_id?: string | null;
          payout_method?: string | null;
          beneficiary_name?: string | null;
        };

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const hasCoreFields =
          typeof body.account_holder_name === "string" ||
          typeof body.account_number === "string" ||
          typeof body.ifsc_code === "string" ||
          typeof body.bank_name === "string";

        const hasOnlyPayoutToggle =
          !hasCoreFields &&
          typeof body.payout_method === "string" &&
          body.branch_name === undefined &&
          body.account_type === undefined &&
          body.upi_id === undefined &&
          body.beneficiary_name === undefined;

        const existingRows = await sql`
          SELECT id,
                 account_holder_name,
                 account_number,
                 ifsc_code,
                 bank_name,
                 branch_name,
                 account_type,
                 upi_id,
                 is_verified,
                 verification_status,
                 is_primary,
                 is_active,
                 is_disabled,
                 payout_method,
                 beneficiary_name
          FROM merchant_store_bank_accounts
          WHERE store_id = ${storeId}
            AND is_primary = TRUE
          ORDER BY id DESC
          LIMIT 1
        `;
        const existing = existingRows[0] as
          | {
              id: number;
              account_holder_name: string;
              account_number: string;
              ifsc_code: string;
              bank_name: string;
              branch_name: string | null;
              account_type: string | null;
              upi_id: string | null;
              is_verified: boolean | null;
              verification_status: string | null;
              is_primary: boolean | null;
              is_active: boolean | null;
              is_disabled: boolean | null;
              payout_method: string | null;
              beneficiary_name: string | null;
            }
          | undefined;

        if (!hasOnlyPayoutToggle) {
          const requiredCreateOrUpdate =
            typeof body.account_holder_name === "string" &&
            typeof body.account_number === "string" &&
            typeof body.ifsc_code === "string" &&
            typeof body.bank_name === "string";
          if (!requiredCreateOrUpdate) {
            return reply.code(400).send({
              error: "invalid_body",
              message: "account_holder_name, account_number, ifsc_code and bank_name are required",
            });
          }
        } else if (!existing) {
          return reply.code(400).send({
            error: "invalid_body",
            message: "Cannot toggle payout method before adding bank details",
          });
        }

        const next = {
          account_holder_name:
            body.account_holder_name != null
              ? String(body.account_holder_name).trim()
              : existing?.account_holder_name ?? "",
          account_number:
            body.account_number != null
              ? String(body.account_number).trim()
              : existing?.account_number ?? "",
          ifsc_code:
            body.ifsc_code != null
              ? String(body.ifsc_code).trim().toUpperCase()
              : existing?.ifsc_code ?? "",
          bank_name:
            body.bank_name != null
              ? String(body.bank_name).trim()
              : existing?.bank_name ?? "",
          branch_name:
            body.branch_name !== undefined
              ? body.branch_name != null && String(body.branch_name).trim()
                ? String(body.branch_name).trim()
                : null
              : existing?.branch_name ?? null,
          account_type:
            body.account_type !== undefined
              ? body.account_type != null && String(body.account_type).trim()
                ? String(body.account_type).trim().toUpperCase()
                : null
              : existing?.account_type ?? null,
          upi_id:
            body.upi_id !== undefined
              ? body.upi_id != null && String(body.upi_id).trim()
                ? String(body.upi_id).trim()
                : null
              : existing?.upi_id ?? null,
          payout_method:
            body.payout_method != null && String(body.payout_method).trim()
              ? String(body.payout_method).trim().toUpperCase()
              : existing?.payout_method ?? null,
          beneficiary_name:
            body.beneficiary_name !== undefined
              ? body.beneficiary_name != null && String(body.beneficiary_name).trim()
                ? String(body.beneficiary_name).trim()
                : null
              : existing?.beneficiary_name ?? null,
        };

        const now = new Date();

        if (!existing) {
          const rows = await sql`
            INSERT INTO merchant_store_bank_accounts (
              store_id,
              account_holder_name,
              account_number,
              ifsc_code,
              bank_name,
              branch_name,
              account_type,
              upi_id,
              is_verified,
              verification_status,
              is_primary,
              is_active,
              is_disabled,
              payout_method,
              beneficiary_name,
              attempt_count,
              last_attempt_at
            ) VALUES (
              ${storeId},
              ${next.account_holder_name},
              ${next.account_number},
              ${next.ifsc_code},
              ${next.bank_name},
              ${next.branch_name},
              ${next.account_type},
              ${next.upi_id},
              FALSE,
              'pending',
              TRUE,
              TRUE,
              FALSE,
              ${next.payout_method},
              ${next.beneficiary_name},
              0,
              NULL
            )
            RETURNING id
          `;
          const row = rows[0] as { id: number };
          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "CREATE",
            auditCtx,
            "bank_account",
            null,
            { id: row.id, ...next },
            { section: "bank_account", route: "PATCH /merchant-partner/stores/:storeId/bank-account" }
          );
        } else {
          const oldSnapshot = {
            account_holder_name: existing.account_holder_name,
            account_number: existing.account_number,
            ifsc_code: existing.ifsc_code,
            bank_name: existing.bank_name,
            branch_name: existing.branch_name,
            account_type: existing.account_type,
            upi_id: existing.upi_id,
            payout_method: existing.payout_method,
            beneficiary_name: existing.beneficiary_name,
            is_verified: existing.is_verified,
            verification_status: existing.verification_status,
          };
          await sql`
            UPDATE merchant_store_bank_accounts
            SET
              account_holder_name = ${next.account_holder_name},
              account_number = ${next.account_number},
              ifsc_code = ${next.ifsc_code},
              bank_name = ${next.bank_name},
              branch_name = ${next.branch_name},
              account_type = ${next.account_type},
              upi_id = ${next.upi_id},
              payout_method = ${next.payout_method},
              beneficiary_name = ${next.beneficiary_name},
              is_primary = TRUE,
              is_active = TRUE,
              is_disabled = FALSE,
              is_verified = FALSE,
              verification_status = 'pending',
              attempt_count = 0,
              last_attempt_at = NULL,
              updated_at = ${now}
            WHERE id = ${existing.id}
          `;

          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "bank_account",
            oldSnapshot,
            next,
            { section: "bank_account", route: "PATCH /merchant-partner/stores/:storeId/bank-account" }
          );
        }

        return reply.send({ ok: true });
      });

      /** GET /merchant-partner/verification-modes — Policy Center modes for merchant_store docs. */
      protectedApp.get("/verification-modes", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        try {
          const { resolveEffectivePolicy } = await import("../verification/policy/engine.js");
          const kinds = ["bank_account", "upi_penny_drop", "pan", "gstin"] as const;
          const modes: Record<string, string> = {};
          for (const documentKind of kinds) {
            const policy = await resolveEffectivePolicy({
              subjectType: "merchant_store",
              documentKind,
            });
            modes[documentKind] = policy.mode;
          }
          if (modes.bank_account) modes.bank = modes.bank_account;
          return reply.send({ success: true, modes });
        } catch {
          return reply.send({ success: true, modes: {} });
        }
      });

      /**
       * POST /merchant-partner/stores/:storeId/bank-accounts/electronic-verify
       * Cashfree pennyless verify before adding an account (hybrid/auto flow).
       */
      protectedApp.post<{
        Params: { storeId: string };
        Body: {
          account_number: string;
          ifsc_code: string;
          account_holder_name?: string;
        };
      }>("/stores/:storeId/bank-accounts/electronic-verify", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id, store_phones, store_name FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const body = (req.body || {}) as Record<string, unknown>;
        const bankAccount = String(body.account_number || "").replace(/\D/g, "");
        const ifsc = String(body.ifsc_code || "").trim().toUpperCase();
        const holderFallback = String(body.account_holder_name || "").trim();
        if (!/^\d{6,20}$/.test(bankAccount) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
          return reply.code(400).send({
            error: "invalid_bank_details",
            message: "Enter a valid account number and IFSC code.",
          });
        }

        const storePhones = (storeRows[0] as { store_phones?: unknown })?.store_phones;
        const phone =
          (Array.isArray(storePhones) ? String(storePhones[0] || "") : typeof storePhones === "string" ? storePhones : "")
            .replace(/\D/g, "")
            .slice(-10) || undefined;
        const storeName = String((storeRows[0] as { store_name?: string })?.store_name || "").trim();

        try {
          const { submitBankAccount } = await import("../verification/service.js");
          const outcome = await submitBankAccount({
            subjectType: "merchant_store",
            subjectId: storeId,
            bankAccount,
            ifsc,
            name: holderFallback || storeName || undefined,
            phone,
          });

          if (outcome.kind === "manual") {
            return reply.send({
              success: true,
              verified: false,
              status: "processing",
              message:
                "We could not verify instantly. Enter full details and upload bank proof to continue.",
            });
          }

          const status = String(outcome.result.status || "").toLowerCase();
          if (status === "verified") {
            const nameAtBank =
              typeof outcome.result.verifiedData?.name_at_bank === "string"
                ? outcome.result.verifiedData.name_at_bank
                : typeof outcome.result.verifiedData?.account_name === "string"
                  ? outcome.result.verifiedData.account_name
                  : null;
            const bankName =
              typeof outcome.result.verifiedData?.bank_name === "string"
                ? outcome.result.verifiedData.bank_name
                : ifsc.slice(0, 4);
            return reply.send({
              success: true,
              verified: true,
              status: "verified",
              message: "Account verified — confirm account type and save.",
              name_at_bank: nameAtBank,
              bank_name: bankName,
            });
          }

          return reply.send({
            success: true,
            verified: false,
            status: "failed",
            message:
              outcome.result.statusReason ||
              "Account could not be verified instantly. Try manual verification with bank proof.",
          });
        } catch (e: any) {
          req.log.error(e, "electronic_bank_verify_failed");
          return reply.code(500).send({
            success: false,
            verified: false,
            error: e?.message || "Verification failed",
          });
        }
      });

      /** POST /merchant-partner/stores/:storeId/bank-proof/upload — bank proof document for manual/hybrid fallback. */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/bank-proof/upload",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`
            SELECT ms.id, ms.store_id AS store_code, mp.parent_merchant_id AS parent_code
            FROM merchant_stores ms
            LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
            WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
            LIMIT 1
          `;
          if ((storeCheck as any[]).length === 0) return reply.code(404).send({ error: "store_not_found" });

          const data = await (req as any).file?.();
          if (!data) return reply.code(400).send({ error: "no_file" });
          const buffer = await data.toBuffer();
          if (buffer.length > 10 * 1024 * 1024) return reply.code(400).send({ error: "file_too_large" });

          const filename = String(data.filename || "");
          const extMatch = /\.(webp|jpe?g|png|pdf)$/i.exec(filename);
          const ext = extMatch?.[1]?.toLowerCase() || "jpg";
          const safeExt = ext === "jpeg" ? "jpg" : ext;
          const mime = data.mimetype || (safeExt === "pdf" ? "application/pdf" : "image/jpeg");

          const storeCode = String((storeCheck[0] as any).store_code ?? storeId);
          const parentCode = String((storeCheck[0] as any).parent_code ?? parentId);
          const key = `docs/merchants/${parentCode}/stores/${storeCode}/onboarding/bank_proof/proof_${Date.now()}.${safeExt}`;

          const { uploadToR2 } = await import("../../services/r2/r2Service.js");
          try {
            const result = await uploadToR2(buffer, key, mime);
            const fileUrl = `/v1/attachments/proxy?key=${encodeURIComponent(result.key)}`;
            return reply.code(201).send({
              success: true,
              file_url: fileUrl,
              r2_key: result.key,
            });
          } catch (e: any) {
            req.log.error(e, "bank_proof_upload_failed");
            return reply.code(500).send({ error: "upload_failed", message: e?.message });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/bank-accounts — list ALL bank/UPI accounts (including disabled). */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/bank-accounts",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT id, store_id, account_holder_name, account_number, ifsc_code, bank_name,
                   branch_name, account_type, is_verified, verification_status, upi_id, upi_verified,
                   is_primary, is_active, is_disabled, payout_method, beneficiary_name, created_at, updated_at
            FROM merchant_store_bank_accounts
            WHERE store_id = ${storeId}
            ORDER BY is_primary DESC NULLS LAST, created_at DESC
          `;
          const accounts = (rows as any[]).map((r) => ({
            id: r.id,
            store_id: r.store_id,
            account_holder_name: r.account_holder_name,
            account_number: r.account_number,
            account_number_masked: r.account_number ? `****${String(r.account_number).slice(-4)}` : null,
            ifsc_code: r.ifsc_code,
            bank_name: r.bank_name,
            branch_name: r.branch_name,
            account_type: r.account_type,
            is_verified: r.is_verified === true,
            verification_status: r.verification_status ?? null,
            upi_id: r.upi_id ?? null,
            is_primary: r.is_primary === true,
            is_active: r.is_active !== false,
            is_disabled: r.is_disabled === true,
            payout_method: r.payout_method ?? null,
            beneficiary_name: r.beneficiary_name ?? null,
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
            updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
          }));
          return reply.send({ success: true, accounts });
        }
      );

      /** POST /merchant-partner/stores/:storeId/bank-accounts — add a new bank/UPI account. */
      protectedApp.post<{
        Params: { storeId: string };
        Body: {
          payout_method?: string;
          account_holder_name: string;
          account_number: string;
          ifsc_code?: string;
          bank_name?: string;
          branch_name?: string | null;
          account_type?: string | null;
          upi_id?: string | null;
          beneficiary_name?: string | null;
          bank_proof_type?: string | null;
          bank_proof_file_url?: string | null;
        };
      }>("/stores/:storeId/bank-accounts", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const body = (req.body || {}) as Record<string, unknown>;
        const payoutMethod = String(body.payout_method || "bank").toLowerCase();
        // Merchant app / partner self-serve: bank only (UPI add remains on admin portal).
        if (payoutMethod === "upi") {
          return reply.code(400).send({
            error: "upi_add_disabled",
            message: "Adding UPI is temporarily disabled. Please add a bank account.",
          });
        }
        if (payoutMethod !== "bank") {
          return reply.code(400).send({ error: "payout_method must be bank" });
        }
        const holderName = String(body.account_holder_name || "").trim();
        const accNum = String(body.account_number || "").trim();
        if (!holderName || !accNum) {
          return reply.code(400).send({ error: "account_holder_name and account_number are required" });
        }
        const ifsc = String(body.ifsc_code || "").trim();
        const bankName = String(body.bank_name || "").trim();
        if (!ifsc || !bankName) {
          return reply.code(400).send({ error: "ifsc_code and bank_name required for bank" });
        }

        const countRows = await sql`
          SELECT COUNT(*)::int AS cnt FROM merchant_store_bank_accounts WHERE store_id = ${storeId}
        `;
        const isFirst = ((countRows[0] as any)?.cnt ?? 0) === 0;

        const [row] = await sql`
          INSERT INTO merchant_store_bank_accounts (
            store_id, payout_method, account_holder_name, account_number,
            ifsc_code, bank_name, branch_name, account_type,
            upi_id, beneficiary_name,
            bank_proof_type, bank_proof_file_url,
            is_primary, is_active, is_disabled, verification_status
          ) VALUES (
            ${storeId}, ${payoutMethod}, ${holderName}, ${accNum},
            ${ifsc.toUpperCase()},
            ${bankName},
            ${body.branch_name ? String(body.branch_name).trim() : null},
            ${body.account_type ? String(body.account_type).trim() : null},
            ${null},
            ${body.beneficiary_name ? String(body.beneficiary_name).trim() : holderName},
            ${body.bank_proof_type ? String(body.bank_proof_type).trim() : null},
            ${body.bank_proof_file_url ? String(body.bank_proof_file_url).trim() : null},
            ${isFirst}, true, false, 'pending'
          ) RETURNING id, account_holder_name, is_primary, payout_method, created_at
        `;
        await logStoreActivity({
          storeId, section: "bank_account", action: "create",
          entityId: (row as any)?.id ?? null,
          entityName: holderName,
          summary: `Added BANK account "${holderName}"`,
          diff: { payout_method: payoutMethod, is_primary: isFirst },
          actorType: "merchant", source: "merchant_app",
        });
        return reply.code(201).send({ success: true, account: row });
      });

      /**
       * POST /merchant-partner/stores/:storeId/bank-accounts/:accountId/verify
       * Cashfree pennyless bank account verification (BAV). Marks the row verified on success.
       */
      protectedApp.post<{ Params: { storeId: string; accountId: string } }>(
        "/stores/:storeId/bank-accounts/:accountId/verify",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const accountId = Number(req.params.accountId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(accountId) || accountId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id, store_phones FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const accRows = await sql`
            SELECT id, store_id, account_holder_name, account_number, ifsc_code, bank_name,
                   payout_method, upi_id, is_verified, verification_status
            FROM merchant_store_bank_accounts
            WHERE id = ${accountId} AND store_id = ${storeId}
            LIMIT 1
          `;
          if (accRows.length === 0) return reply.code(404).send({ error: "account_not_found" });
          const acc = accRows[0] as {
            id: number;
            account_holder_name: string;
            account_number: string;
            ifsc_code: string;
            bank_name: string;
            payout_method: string | null;
            upi_id: string | null;
            is_verified: boolean;
          };

          if (acc.is_verified) {
            return reply.send({
              success: true,
              verified: true,
              status: "verified",
              message: "Account is already verified.",
            });
          }

          const method = String(acc.payout_method || "bank").toLowerCase();
          if (method === "upi") {
            return reply.code(400).send({
              error: "upi_verify_disabled",
              message: "UPI verification is not available here. Please use a bank account.",
            });
          }

          const bankAccount = String(acc.account_number || "").replace(/\D/g, "");
          const ifsc = String(acc.ifsc_code || "").trim().toUpperCase();
          if (!/^\d{6,20}$/.test(bankAccount) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
            return reply.code(400).send({
              error: "invalid_bank_details",
              message: "Account number or IFSC is incomplete. Update the account and try again.",
            });
          }

          const storePhones = (storeRows[0] as { store_phones?: unknown })?.store_phones;
          const phone =
            (Array.isArray(storePhones) ? String(storePhones[0] || "") : typeof storePhones === "string" ? storePhones : "")
              .replace(/\D/g, "")
              .slice(-10) || undefined;

          try {
            const { submitBankAccount } = await import("../verification/service.js");
            const outcome = await submitBankAccount({
              subjectType: "merchant_store",
              subjectId: storeId,
              bankAccount,
              ifsc,
              name: String(acc.account_holder_name || "").trim() || undefined,
              phone,
            });

            if (outcome.kind === "manual") {
              await sql`
                UPDATE merchant_store_bank_accounts
                SET verification_status = 'pending', updated_at = NOW()
                WHERE id = ${accountId}
              `;
              return reply.send({
                success: true,
                verified: false,
                status: "processing",
                message:
                  "We could not verify instantly. Your details are saved and our team will verify them manually.",
              });
            }

            const status = String(outcome.result.status || "").toLowerCase();
            if (status === "verified") {
              const nameAtBank =
                typeof outcome.result.verifiedData?.name_at_bank === "string"
                  ? outcome.result.verifiedData.name_at_bank
                  : typeof outcome.result.verifiedData?.account_name === "string"
                    ? outcome.result.verifiedData.account_name
                    : null;
              await sql`
                UPDATE merchant_store_bank_accounts SET
                  is_verified = true,
                  verified_at = NOW(),
                  verification_method = 'CASHFREE_BAV',
                  verification_status = 'verified',
                  beneficiary_name = COALESCE(${nameAtBank}, beneficiary_name, account_holder_name),
                  updated_at = NOW()
                WHERE id = ${accountId}
              `;
              await logStoreActivity({
                storeId,
                section: "bank_account",
                action: "verify",
                entityId: accountId,
                summary: `Cashfree verified bank account #${accountId}`,
                actorType: "merchant",
                source: "merchant_app",
              });
              return reply.send({
                success: true,
                verified: true,
                status: "verified",
                message: "Bank account verified successfully with Cashfree.",
                name_at_bank: nameAtBank,
              });
            }

            await sql`
              UPDATE merchant_store_bank_accounts
              SET verification_status = 'failed', updated_at = NOW()
              WHERE id = ${accountId}
            `;
            return reply.code(400).send({
              success: false,
              verified: false,
              status: "failed",
              error: outcome.result.statusReason || "Account could not be verified. Check the details and try again.",
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Verification failed";
            return reply.code(500).send({ success: false, error: msg });
          }
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/bank-accounts/:accountId — set default, disable, or enable. */
      protectedApp.patch<{
        Params: { storeId: string; accountId: string };
        Body: { set_default?: boolean; set_disabled?: boolean };
      }>("/stores/:storeId/bank-accounts/:accountId", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const accountId = Number(req.params.accountId);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(accountId) || accountId < 1) {
          return reply.code(400).send({ error: "invalid_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const accRows = await sql`
          SELECT id, store_id FROM merchant_store_bank_accounts WHERE id = ${accountId} AND store_id = ${storeId}
        `;
        if (accRows.length === 0) return reply.code(404).send({ error: "account_not_found" });

        const body = (req.body || {}) as Record<string, unknown>;

        if (body.set_default === true) {
          await sql`UPDATE merchant_store_bank_accounts SET is_primary = false, updated_at = NOW() WHERE store_id = ${storeId} AND id != ${accountId}`;
          await sql`UPDATE merchant_store_bank_accounts SET is_primary = true, is_active = true, is_disabled = false, updated_at = NOW() WHERE id = ${accountId}`;
          await logStoreActivity({
            storeId, section: "bank_account", action: "set_default",
            entityId: accountId, summary: `Set bank account #${accountId} as default`,
            actorType: "merchant", source: "merchant_app",
          });
          return reply.send({ success: true });
        }

        if (body.set_disabled === true) {
          await sql`UPDATE merchant_store_bank_accounts SET is_active = false, is_disabled = true, is_primary = false, updated_at = NOW() WHERE id = ${accountId}`;
          await logStoreActivity({
            storeId, section: "bank_account", action: "disable",
            entityId: accountId, summary: `Disabled bank account #${accountId}`,
            actorType: "merchant", source: "merchant_app",
          });
          return reply.send({ success: true });
        }

        if (body.set_disabled === false) {
          await sql`UPDATE merchant_store_bank_accounts SET is_active = true, is_disabled = false, updated_at = NOW() WHERE id = ${accountId}`;
          await logStoreActivity({
            storeId, section: "bank_account", action: "enable",
            entityId: accountId, summary: `Enabled bank account #${accountId}`,
            actorType: "merchant", source: "merchant_app",
          });
          return reply.send({ success: true });
        }

        return reply.code(400).send({ error: "No valid action (set_default or set_disabled)" });
      });

      function shapeMerchantPartnerOfferTimeColumn(value: unknown): string | null {
        if (value == null || value === "") return null;
        const s = String(value).trim();
        const m = s.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return s;
        return `${m[1].padStart(2, "0")}:${m[2]}`;
      }

      function shapeMerchantPartnerOfferIso(value: unknown): string {
        if (value == null || value === "") return "";
        const d = value instanceof Date ? value : new Date(String(value));
        return Number.isNaN(d.getTime()) ? "" : d.toISOString();
      }

      function canonicalizeOfferMenuItemIds(
        ids: string[],
        itemIdByPk?: Map<number, string>
      ): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const raw of ids) {
          const s = String(raw ?? "").trim();
          if (!s) continue;
          let canon = s;
          if (itemIdByPk && /^\d+$/.test(s)) {
            const mapped = itemIdByPk.get(Number(s));
            if (mapped) canon = mapped;
          }
          if (seen.has(canon)) continue;
          seen.add(canon);
          out.push(canon);
        }
        return out;
      }

      /** Align offer JSON with partner site / dashboard (ISO dates + schedule fields). */
      function shapeMerchantPartnerOfferRow(
        row: Record<string, unknown>,
        applicabilityIds?: string[] | null,
        itemIdByPk?: Map<number, string>
      ) {
        const meta = (row.offer_metadata as Record<string, unknown>) ?? {};
        const fromMeta = Array.isArray(meta.menu_item_ids)
          ? (meta.menu_item_ids as unknown[]).map((v) => String(v).trim()).filter(Boolean)
          : [];
        const fromApp = Array.isArray(applicabilityIds)
          ? applicabilityIds.map((v) => String(v).trim()).filter(Boolean)
          : [];
        const mergedIds = canonicalizeOfferMenuItemIds([...fromMeta, ...fromApp], itemIdByPk);
        return {
          ...row,
          offer_title: syncedGeneratedOfferTitle(row as never),
          menu_item_ids: mergedIds.length > 0 ? mergedIds : null,
          offer_metadata: {
            ...meta,
            ...(mergedIds.length > 0 ? { menu_item_ids: mergedIds } : { menu_item_ids: [] }),
          },
          combo_ids: (meta.combo_ids as number[] | null) ?? null,
          applicable_time_start: shapeMerchantPartnerOfferTimeColumn(row.applicable_time_start),
          applicable_time_end: shapeMerchantPartnerOfferTimeColumn(row.applicable_time_end),
          applicable_on_days: Array.isArray(row.applicable_on_days) ? row.applicable_on_days : null,
          valid_from: shapeMerchantPartnerOfferIso(row.valid_from),
          valid_till: shapeMerchantPartnerOfferIso(row.valid_till),
          created_at: shapeMerchantPartnerOfferIso(row.created_at) || new Date().toISOString(),
          updated_at:
            shapeMerchantPartnerOfferIso(row.updated_at) ||
            shapeMerchantPartnerOfferIso(row.created_at) ||
            new Date().toISOString(),
        };
      }

      /** Helper: validate offer item mappings for a store before create/update. */
      async function validateOfferItemMappings(params: {
        sql: ReturnType<typeof getSql>;
        storeId: number;
        offerType: string;
        menuItemIds: unknown;
        excludeOfferId?: string | null;
      }): Promise<{ ok: true } | { ok: false; error: string }> {
        const { sql, storeId, offerType, menuItemIds, excludeOfferId } = params;
        // Currently we only enforce item-freeze rule for FLAT offers.
        if (offerType !== "FLAT") {
          return { ok: true };
        }
        if (!Array.isArray(menuItemIds) || menuItemIds.length === 0) {
          return { ok: true };
        }
        const itemIds = menuItemIds.map((v) => String(v));
        // Load all existing offers for this store and detect any that already map these items.
        const rows = await sql`
          SELECT offer_id, offer_title, offer_metadata
          FROM merchant_offers
          WHERE store_id = ${storeId}
        `;
        const conflicts: { offer_id: string; offer_title: string | null; item_id: string }[] = [];
        for (const r of rows as any[]) {
          const existingOfferId = String(r.offer_id ?? "");
          if (excludeOfferId && existingOfferId === excludeOfferId) continue;
          const meta = (r.offer_metadata as Record<string, unknown>) ?? {};
          const existingItems = Array.isArray(meta.menu_item_ids) ? meta.menu_item_ids.map((v) => String(v)) : [];
          if (!existingItems.length) continue;
          for (const id of itemIds) {
            if (existingItems.includes(id)) {
              conflicts.push({
                offer_id: existingOfferId,
                offer_title: (r.offer_title as string) ?? null,
                item_id: id,
              });
            }
          }
        }
        if (!conflicts.length) {
          return { ok: true };
        }
        // Build a compact, human-readable error message listing the first few conflicting items/offers.
        const samples = conflicts.slice(0, 5).map((c) => {
          const title = c.offer_title ? `"${c.offer_title}"` : c.offer_id;
          return `item ${c.item_id} (already mapped in offer ${title})`;
        });
        const suffix = conflicts.length > samples.length ? `, and ${conflicts.length - samples.length} more` : "";
        return {
          ok: false,
          error: `Some items are already mapped to other offers and cannot be reused for this flat discount: ${samples.join(
            "; "
          )}${suffix}.`,
        };
      }

      /** GET /merchant-partner/stores/:storeId/offers — list all offers for this store. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/offers",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT id, offer_id, store_id, offer_title, offer_description, offer_type, offer_sub_type,
                   discount_value, discount_percentage, max_discount_amount,
                   min_order_amount, max_order_amount, min_items,
                   buy_quantity, get_quantity, coupon_code,
                   offer_image_url, valid_from, valid_till,
                   applicable_on_days, applicable_time_start, applicable_time_end,
                   is_active, is_featured, auto_apply, is_stackable, priority,
                   per_order_limit, first_order_only, new_user_only,
                   max_uses_total, max_uses_per_user, current_uses,
                   offer_metadata, created_at, updated_at, created_by_name, updated_by_name,
                   created_source_platform, updated_source_platform
            FROM merchant_offers
            WHERE store_id = ${storeId}
            ORDER BY created_at DESC
          `;
          const offerPks = (rows as any[])
            .map((r) => Number(r.id))
            .filter((id) => Number.isFinite(id) && id > 0);
          const idsByOfferPk = new Map<number, string[]>();
          const itemIdByPk = new Map<number, string>();
          try {
            const menuRows = await sql`
              SELECT id, item_id FROM merchant_menu_items
              WHERE store_id = ${storeId} AND item_id IS NOT NULL
            `;
            for (const m of menuRows as unknown as Array<{ id: number; item_id: string | null }>) {
              if (m.item_id) itemIdByPk.set(Number(m.id), String(m.item_id).trim());
            }
          } catch {
            /* ignore */
          }
          if (offerPks.length > 0) {
            try {
              const appRows = await sql`
                SELECT a.offer_id, a.menu_item_id, m.item_id
                FROM merchant_offer_applicability a
                LEFT JOIN merchant_menu_items m ON m.id = a.menu_item_id
                WHERE a.offer_id = ANY(${offerPks})
                  AND a.menu_item_id IS NOT NULL
              `;
              for (const row of appRows as unknown as Array<{
                offer_id: number | string;
                menu_item_id: number | string | null;
                item_id: string | null;
              }>) {
                const oid = Number(row.offer_id);
                if (!Number.isFinite(oid)) continue;
                const publicId = row.item_id
                  ? String(row.item_id).trim()
                  : row.menu_item_id != null
                    ? itemIdByPk.get(Number(row.menu_item_id))
                    : null;
                if (!publicId) continue;
                const list = idsByOfferPk.get(oid) ?? [];
                list.push(publicId);
                idsByOfferPk.set(oid, list);
              }
            } catch {
              /* applicability table may be missing on older DBs */
            }
          }
          const offers = (rows as any[]).map((r) =>
            shapeMerchantPartnerOfferRow(r, idsByOfferPk.get(Number(r.id)) ?? null, itemIdByPk)
          );

          try {
            const {
              loadMerchantOfferTrackStats,
              mergeOfferTrackStatsIntoMetadata,
            } = await import("./merchant-offer-track-stats.service.js");
            const stats = await loadMerchantOfferTrackStats(
              sql as unknown as Parameters<typeof loadMerchantOfferTrackStats>[0],
              storeId,
              offerPks
            );
            for (const offer of offers as Array<Record<string, unknown>>) {
              const pk = Number(offer.id);
              const stat = stats.get(pk) ?? {
                offerPk: pk,
                orders: 0,
                gross: 0,
                discount: 0,
                effectiveDiscountPct: 0,
              };
              const meta = (offer.offer_metadata as Record<string, unknown>) ?? {};
              offer.offer_title = syncedGeneratedOfferTitle(offer as never);
              offer.offer_metadata = mergeOfferTrackStatsIntoMetadata(meta, stat);
              offer.current_uses = stat.orders;
            }
          } catch (e) {
            req.log?.warn?.({ err: e, storeId }, "offer track stats enrichment failed");
          }

          return reply.send({ success: true, offers });
        }
      );

      /** GET /merchant-partner/stores/:storeId/offers/insights — real offer performance (orders + applications). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { start?: string; end?: string } }>(
        "/stores/:storeId/offers/insights",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const startRaw = String(req.query?.start ?? "").trim();
          const endRaw = String(req.query?.end ?? "").trim();
          const endMs = endRaw ? new Date(endRaw).getTime() : Date.now();
          const startMs = startRaw
            ? new Date(startRaw).getTime()
            : (() => {
                const d = new Date(endMs);
                d.setMonth(d.getMonth() - 5);
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
              })();

          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
            return reply.code(400).send({ error: "invalid_date_range" });
          }

          const insights = await loadMerchantOfferInsights(sql as unknown as Parameters<typeof loadMerchantOfferInsights>[0], storeId, startMs, endMs);
          return reply.send({ success: true, insights });
        }
      );

      /** POST /merchant-partner/stores/:storeId/offers — create an offer. */
      protectedApp.post<{ Params: { storeId: string }; Body: Record<string, unknown> }>(
        "/stores/:storeId/offers",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const body = (req.body || {}) as Record<string, unknown>;
          const title = String(body.offer_title || "").trim();
          if (!title) return reply.code(400).send({ error: "offer_title required" });
          if (!body.valid_from || !body.valid_till) return reply.code(400).send({ error: "valid_from and valid_till required" });

          const validFromDate = new Date(String(body.valid_from));
          const validTillDate = new Date(String(body.valid_till));
          if (Number.isNaN(validFromDate.getTime()) || Number.isNaN(validTillDate.getTime())) {
            return reply.code(400).send({ error: "invalid_valid_from_or_valid_till" });
          }
          if (validTillDate.getTime() < validFromDate.getTime()) {
            return reply.code(400).send({ error: "valid_till_must_be_on_or_after_valid_from" });
          }

          const offerType = String(body.offer_type || "PERCENTAGE");
          const offerId = `OFF-${storeId}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

          const bodyMeta =
            body.offer_metadata && typeof body.offer_metadata === "object"
              ? (body.offer_metadata as Record<string, unknown>)
              : {};
          const baseMeta: Record<string, unknown> = { ...bodyMeta };
          if (Array.isArray(body.menu_item_ids)) baseMeta.menu_item_ids = body.menu_item_ids;
          if (Array.isArray(body.combo_ids)) baseMeta.combo_ids = body.combo_ids;

          const isBogo =
            offerType === "BUY_X_GET_Y" || offerType === "BUY_N_GET_M" || offerType === "BOGO";
          if (isBogo) {
            delete baseMeta.conditions_mode;
            if (!baseMeta.create_path) baseMeta.create_path = "bogo";
          } else {
            const modeRaw = String(baseMeta.conditions_mode ?? "").toLowerCase().trim();
            if (modeRaw === "boost" || modeRaw === "precision") {
              baseMeta.conditions_mode = modeRaw;
              if (!baseMeta.create_path) baseMeta.create_path = modeRaw;
            }
            if (modeRaw === "precision") {
              baseMeta.menu_item_ids = [];
              body.offer_sub_type = "ALL_ORDERS";
            }
          }

          const applicableTimeStart =
            body.applicable_time_start !== undefined
              ? shapeMerchantPartnerOfferTimeColumn(body.applicable_time_start)
              : bodyMeta.applicable_time_start !== undefined
                ? shapeMerchantPartnerOfferTimeColumn(bodyMeta.applicable_time_start)
                : null;
          const applicableTimeEnd =
            body.applicable_time_end !== undefined
              ? shapeMerchantPartnerOfferTimeColumn(body.applicable_time_end)
              : bodyMeta.applicable_time_end !== undefined
                ? shapeMerchantPartnerOfferTimeColumn(bodyMeta.applicable_time_end)
                : null;
          if (applicableTimeStart) baseMeta.applicable_time_start = applicableTimeStart;
          if (applicableTimeEnd) baseMeta.applicable_time_end = applicableTimeEnd;

          const applicableOnDays = Array.isArray(body.applicable_on_days)
            ? (body.applicable_on_days as string[])
            : null;

          // Enforce item-freeze rule for flat offers in backend: an item already mapped to any offer
          // cannot be re-used in a new FLAT offer.
          const validation = await validateOfferItemMappings({
            sql,
            storeId,
            offerType,
            menuItemIds: baseMeta.menu_item_ids ?? [],
          });
          if (!validation.ok) {
            return reply.code(400).send({ error: validation.error });
          }

          const sourcePlatform = String(req.headers["x-source-platform"] ?? "MERCHANT_APP");
          const VALID_SOURCE_PLATFORMS = ["MERCHANT_APP", "MERCHANT_PORTAL", "ADMIN_DASHBOARD", "AGENT_DASHBOARD", "SYSTEM"];
          const createdSourcePlatform = VALID_SOURCE_PLATFORMS.includes(sourcePlatform) ? sourcePlatform : "MERCHANT_APP";

          const sqlAny = sql as any;
          const [row] = await sqlAny`
            INSERT INTO merchant_offers (
              offer_id, store_id, offer_title, offer_description, offer_type, offer_sub_type,
              discount_value, discount_percentage, max_discount_amount,
              min_order_amount, max_order_amount, min_items,
              buy_quantity, get_quantity, coupon_code,
              offer_image_url, valid_from, valid_till,
              applicable_time_start, applicable_time_end, applicable_on_days,
              is_active, auto_apply, is_stackable, priority,
              per_order_limit, first_order_only, new_user_only,
              max_uses_total, max_uses_per_user,
              offer_metadata,
              created_source_platform, created_by_role, approval_status,
              created_by_user_id, created_by_org_id
            ) VALUES (
              ${offerId}, ${storeId}, ${title}, ${body.offer_description ?? null}, ${offerType}, ${body.offer_sub_type ?? "ALL_ORDERS"},
              ${body.discount_value ?? null}, ${body.discount_percentage ?? null}, ${body.max_discount_amount ?? null},
              ${body.min_order_amount ?? null}, ${body.max_order_amount ?? null}, ${body.min_items ?? null},
              ${body.buy_quantity ?? null}, ${body.get_quantity ?? null}, ${body.coupon_code ?? null},
              ${body.offer_image_url ?? null}, ${validFromDate.toISOString()}, ${validTillDate.toISOString()},
              ${applicableTimeStart}, ${applicableTimeEnd}, ${applicableOnDays},
              ${body.is_active ?? true}, ${body.auto_apply ?? true}, ${body.is_stackable ?? false}, ${body.priority ?? 0},
              ${body.per_order_limit ?? 1}, ${body.first_order_only ?? false}, ${body.new_user_only ?? false},
              ${body.max_uses_total ?? null}, ${body.max_uses_per_user ?? null},
              ${Object.keys(baseMeta).length ? JSON.stringify(baseMeta) : null},
              ${createdSourcePlatform}, ${'MERCHANT'}, ${'AUTO_APPROVED'},
              ${parentId}, ${parentId}
            ) RETURNING *
          `;
          await logStoreActivity({
            storeId, section: "offer", action: "create",
            entityId: (row as any)?.id ?? null,
            entityName: title,
            summary: `Created offer "${title}" (${offerType})`,
            diff: { offer_type: offerType, menu_item_ids: baseMeta.menu_item_ids ?? null, combo_ids: baseMeta.combo_ids ?? null },
            actorType: "merchant", source: "merchant_app",
          });
          try {
            const pk = Number((row as any)?.id);
            if (Number.isFinite(pk) && pk > 0) {
              await sql`SELECT public.sync_offer_applicability_from_metadata(${pk})`;
            }
          } catch {
            /* best-effort */
          }
          try {
            await invalidateOfferPricing(storeId, "offer_created", {
              offerId: offerId,
            });
          } catch {
            /* best-effort */
          }
          return reply.code(201).send({
            success: true,
            offer: shapeMerchantPartnerOfferRow(row as Record<string, unknown>),
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/offers/:offerId — update offer fields. */
      protectedApp.patch<{ Params: { storeId: string; offerId: string }; Body: Record<string, unknown> }>(
        "/stores/:storeId/offers/:offerId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const offerIdParam = req.params.offerId;
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const existing = await sql`SELECT id, offer_type, offer_metadata FROM merchant_offers WHERE offer_id = ${offerIdParam} AND store_id = ${storeId}`;
          if (existing.length === 0) return reply.code(404).send({ error: "offer_not_found" });

          const body = (req.body || {}) as Record<string, unknown>;

          const existingMeta = ((existing[0] as any).offer_metadata as Record<string, unknown>) ?? {};
          const existingOfferType = String((existing[0] as any).offer_type ?? "");
          if (body.menu_item_ids !== undefined) {
            existingMeta.menu_item_ids = Array.isArray(body.menu_item_ids) ? body.menu_item_ids : [];
          }
          if (body.offer_metadata && typeof body.offer_metadata === "object") {
            const incoming = body.offer_metadata as Record<string, unknown>;
            Object.assign(existingMeta, incoming);
            // Never let a partial metadata patch wipe mapped items unless explicitly sent.
            if (!("menu_item_ids" in incoming) && body.menu_item_ids === undefined) {
              const prevIds = ((existing[0] as any).offer_metadata as Record<string, unknown> | null)
                ?.menu_item_ids;
              if (Array.isArray(prevIds)) existingMeta.menu_item_ids = prevIds;
            } else if (body.menu_item_ids !== undefined) {
              existingMeta.menu_item_ids = Array.isArray(body.menu_item_ids) ? body.menu_item_ids : [];
            }
          }

          const effectiveType = String(body.offer_type ?? existingOfferType).toUpperCase();
          const isBogo =
            effectiveType === "BOGO" ||
            effectiveType === "BUY_X_GET_Y" ||
            effectiveType === "BUY_N_GET_M";
          if (isBogo) {
            delete existingMeta.conditions_mode;
            existingMeta.create_path = "bogo";
          } else {
            const modeRaw = String(existingMeta.conditions_mode ?? "").toLowerCase().trim();
            if (modeRaw === "boost" || modeRaw === "precision") {
              existingMeta.conditions_mode = modeRaw;
              if (!existingMeta.create_path) existingMeta.create_path = modeRaw;
            }
            if (modeRaw === "precision") {
              existingMeta.menu_item_ids = [];
              if (body.offer_sub_type === undefined) body.offer_sub_type = "ALL_ORDERS";
              else body.offer_sub_type = "ALL_ORDERS";
            }
          }

          // Determine effective offer type and menu_item_ids after this update,
          // then re-run the same backend validation used on create.
          const effectiveOfferType = String(body.offer_type ?? (existing[0] as any).offer_type ?? "PERCENTAGE");
          const effectiveMenuItems = existingMeta.menu_item_ids ?? [];
          const validation = await validateOfferItemMappings({
            sql,
            storeId,
            offerType: effectiveOfferType,
            menuItemIds: effectiveMenuItems,
            excludeOfferId: offerIdParam,
          });
          if (!validation.ok) {
            return reply.code(400).send({ error: validation.error });
          }
          if (body.combo_ids !== undefined) {
            existingMeta.combo_ids = Array.isArray(body.combo_ids) ? body.combo_ids : null;
          }
          const bodyMeta =
            body.offer_metadata && typeof body.offer_metadata === "object"
              ? (body.offer_metadata as Record<string, unknown>)
              : null;
          if (bodyMeta) {
            if (bodyMeta.applicable_time_start !== undefined) {
              existingMeta.applicable_time_start = bodyMeta.applicable_time_start;
            }
            if (bodyMeta.applicable_time_end !== undefined) {
              existingMeta.applicable_time_end = bodyMeta.applicable_time_end;
            }
          }
          const patchApplicableTimeStart =
            body.applicable_time_start !== undefined
              ? shapeMerchantPartnerOfferTimeColumn(body.applicable_time_start)
              : bodyMeta?.applicable_time_start !== undefined
                ? shapeMerchantPartnerOfferTimeColumn(bodyMeta.applicable_time_start)
                : undefined;
          const patchApplicableTimeEnd =
            body.applicable_time_end !== undefined
              ? shapeMerchantPartnerOfferTimeColumn(body.applicable_time_end)
              : bodyMeta?.applicable_time_end !== undefined
                ? shapeMerchantPartnerOfferTimeColumn(bodyMeta.applicable_time_end)
                : undefined;

          const updateSourcePlatform = String(req.headers["x-source-platform"] ?? "MERCHANT_APP");
          const VALID_UPDATE_PLATFORMS = ["MERCHANT_APP", "MERCHANT_PORTAL", "ADMIN_DASHBOARD", "AGENT_DASHBOARD", "SYSTEM"];
          const updatedSourcePlatform = VALID_UPDATE_PLATFORMS.includes(updateSourcePlatform) ? updateSourcePlatform : "MERCHANT_APP";

          const sqlAny = sql as any;
          const [updated] = await sqlAny`
            UPDATE merchant_offers SET
              offer_title = COALESCE(${body.offer_title ?? null}, offer_title),
              offer_description = COALESCE(${body.offer_description ?? null}, offer_description),
              offer_type = COALESCE(${body.offer_type ?? null}, offer_type),
              offer_sub_type = COALESCE(${body.offer_sub_type ?? null}, offer_sub_type),
              discount_value = COALESCE(${body.discount_value ?? null}, discount_value),
              discount_percentage = COALESCE(${body.discount_percentage ?? null}, discount_percentage),
              max_discount_amount = COALESCE(${body.max_discount_amount ?? null}, max_discount_amount),
              min_order_amount = COALESCE(${body.min_order_amount ?? null}, min_order_amount),
              max_order_amount = COALESCE(${body.max_order_amount ?? null}, max_order_amount),
              buy_quantity = COALESCE(${body.buy_quantity ?? null}, buy_quantity),
              get_quantity = COALESCE(${body.get_quantity ?? null}, get_quantity),
              coupon_code = COALESCE(${body.coupon_code ?? null}, coupon_code),
              valid_from = COALESCE(${body.valid_from ? new Date(String(body.valid_from)).toISOString() : null}, valid_from),
              valid_till = COALESCE(${body.valid_till ? new Date(String(body.valid_till)).toISOString() : null}, valid_till),
              applicable_time_start = COALESCE(${patchApplicableTimeStart ?? null}, applicable_time_start),
              applicable_time_end = COALESCE(${patchApplicableTimeEnd ?? null}, applicable_time_end),
              is_active = COALESCE(${body.is_active ?? null}, is_active),
              auto_apply = COALESCE(${body.auto_apply ?? null}, auto_apply),
              is_stackable = COALESCE(${body.is_stackable ?? null}, is_stackable),
              priority = COALESCE(${body.priority ?? null}, priority),
              first_order_only = COALESCE(${body.first_order_only ?? null}, first_order_only),
              new_user_only = COALESCE(${body.new_user_only ?? null}, new_user_only),
              max_uses_total = COALESCE(${body.max_uses_total ?? null}, max_uses_total),
              max_uses_per_user = COALESCE(${body.max_uses_per_user ?? null}, max_uses_per_user),
              offer_metadata = ${JSON.stringify(existingMeta)},
              updated_source_platform = ${updatedSourcePlatform},
              updated_by_role = ${'MERCHANT'},
              updated_by_user_id = ${parentId},
              updated_at = NOW()
            WHERE offer_id = ${offerIdParam} AND store_id = ${storeId}
            RETURNING *
          `;
          await logStoreActivity({
            storeId, section: "offer", action: "update",
            entityId: (existing[0] as any)?.id ?? null,
            entityName: (updated as any)?.offer_title ?? offerIdParam,
            summary: `Updated offer "${(updated as any)?.offer_title ?? offerIdParam}"`,
            diff: { fields_updated: Object.keys(body).filter(k => !["id", "offer_id", "store_id", "created_at"].includes(k)) },
            actorType: "merchant", source: "merchant_app",
          });
          try {
            const pk = Number((existing[0] as any)?.id ?? (updated as any)?.id);
            if (Number.isFinite(pk) && pk > 0) {
              await sql`SELECT public.sync_offer_applicability_from_metadata(${pk})`;
            }
          } catch {
            /* best-effort */
          }
          try {
            const event =
              body.is_active === false
                ? ("offer_disabled" as const)
                : body.is_active === true
                  ? ("offer_published" as const)
                  : ("offer_updated" as const);
            await invalidateOfferPricing(storeId, event, {
              offerId: offerIdParam,
            });
          } catch {
            /* best-effort */
          }
          return reply.send({
            success: true,
            offer: shapeMerchantPartnerOfferRow(updated as Record<string, unknown>),
          });
        }
      );

      /**
       * POST /merchant-partner/stores/:storeId/offers/:offerId/upload-image
       * Multipart: file
       *
       * Stores one image per offer at:
       *   docs/merchants/{parent_code}/stores/{store_code}/offers/{offerId}.{ext}
       *
       * Returns a host-agnostic, non-expiring URL:
       *   /v1/attachments/proxy?key=<r2_key>
       */
      protectedApp.post<{ Params: { storeId: string; offerId: string } }>(
        "/stores/:storeId/offers/:offerId/upload-image",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const offerIdParam = String(req.params.offerId || "").trim();
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          if (!offerIdParam) return reply.code(400).send({ error: "offer_id_required" });

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`
            SELECT ms.id, ms.store_id AS store_code, mp.parent_merchant_id AS parent_code
            FROM merchant_stores ms
            LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
            WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
            LIMIT 1
          `;
          if ((storeCheck as any[]).length === 0) return reply.code(404).send({ error: "store_not_found" });

          const offerRows = await sql`
            SELECT id, offer_title, offer_image_url
            FROM merchant_offers
            WHERE offer_id = ${offerIdParam} AND store_id = ${storeId}
            LIMIT 1
          `;
          if ((offerRows as any[]).length === 0) return reply.code(404).send({ error: "offer_not_found" });

          const data = await (req as any).file?.();
          if (!data) return reply.code(400).send({ error: "no_file" });
          const buffer = await data.toBuffer();
          if (buffer.length > 10 * 1024 * 1024) return reply.code(400).send({ error: "file_too_large" });

          const filename = String(data.filename || "");
          const ext = (filename && /\.(webp|jpe?g|png)$/i.exec(filename)?.[1]) || "jpg";
          const safeExt = ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase();

          const storeCode = String((storeCheck[0] as any).store_code ?? storeId);
          const parentCode = String((storeCheck[0] as any).parent_code ?? parentId);
          const key = `docs/merchants/${parentCode}/stores/${storeCode}/offers/${offerIdParam}.${safeExt}`;

          // Upload to R2
          const { uploadToR2, deleteFromR2 } = await import("../../services/r2/r2Service.js");
          let uploadedKey: string | null = null;
          try {
            const result = await uploadToR2(buffer, key, data.mimetype || "image/jpeg");
            uploadedKey = result.key;
          } catch (e: any) {
            req.log.error(e, "offer image upload failed");
            return reply.code(500).send({ error: "upload_failed", message: e?.message });
          }

          const imageUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploadedKey)}`;

          // Best-effort delete previous image if it was stored as proxy URL with key
          try {
            const prevUrl = String((offerRows[0] as any).offer_image_url || "");
            const m = /key=([^&]+)/.exec(prevUrl);
            const prevKey = m?.[1] ? decodeURIComponent(m[1]) : null;
            if (prevKey && prevKey !== uploadedKey) {
              deleteFromR2(prevKey).catch(() => undefined);
            }
          } catch {
            // ignore
          }

          await sql`
            UPDATE merchant_offers
            SET offer_image_url = ${imageUrl}, updated_at = NOW()
            WHERE offer_id = ${offerIdParam} AND store_id = ${storeId}
          `;

          try {
            await logStoreActivity({
              storeId,
              section: "offer",
              action: "image_update",
              entityId: (offerRows[0] as any)?.id ?? null,
              entityName: (offerRows[0] as any)?.offer_title ?? offerIdParam,
              summary: `Updated offer image "${(offerRows[0] as any)?.offer_title ?? offerIdParam}"`,
              diff: { offer_image_url: imageUrl, r2_key: uploadedKey },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}

          return reply.code(201).send({ success: true, image_url: imageUrl, r2_key: uploadedKey });
        }
      );

      /**
       * POST /merchant-partner/stores/:storeId/upload-store-logo
       * Multipart: file — updates merchant_parents.store_logo (shared brand logo).
       */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/upload-store-logo",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`
            SELECT ms.id, ms.store_id AS store_code, mp.parent_merchant_id AS parent_code
            FROM merchant_stores ms
            LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
            WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
            LIMIT 1
          `;
          if ((storeCheck as any[]).length === 0) return reply.code(404).send({ error: "store_not_found" });

          const data = await (req as any).file?.();
          if (!data) return reply.code(400).send({ error: "no_file" });
          const buffer = await data.toBuffer();
          if (buffer.length > 10 * 1024 * 1024) return reply.code(400).send({ error: "file_too_large" });

          const filename = String(data.filename || "");
          const ext = (filename && /\.(webp|jpe?g|png)$/i.exec(filename)?.[1]) || "jpg";
          const safeExt = ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase();

          const storeCode = String((storeCheck[0] as any).store_code ?? storeId);
          const parentCode = String((storeCheck[0] as any).parent_code ?? parentId);
          const key = `docs/merchants/${parentCode}/stores/${storeCode}/onboarding/assets/logo/logo_${Date.now()}.${safeExt}`;

          const { uploadToR2, deleteFromR2 } = await import("../../services/r2/r2Service.js");
          let uploadedKey: string | null = null;
          try {
            const result = await uploadToR2(buffer, key, data.mimetype || "image/jpeg");
            uploadedKey = result.key;
          } catch (e: any) {
            req.log.error(e, "store_logo_upload_failed");
            return reply.code(500).send({ error: "upload_failed", message: e?.message });
          }

          const imageUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploadedKey)}`;

          try {
            const prevRows = await sql`
              SELECT store_logo FROM merchant_parents WHERE id = ${parentId} LIMIT 1
            `;
            const prevUrl = String((prevRows[0] as any)?.store_logo || "");
            const m = /key=([^&]+)/.exec(prevUrl);
            const prevKey = m?.[1] ? decodeURIComponent(m[1]) : null;
            if (prevKey && prevKey !== uploadedKey) {
              deleteFromR2(prevKey).catch(() => undefined);
            }
          } catch {
            /* ignore */
          }

          await sql`
            UPDATE merchant_parents
            SET store_logo = ${imageUrl}, updated_at = NOW()
            WHERE id = ${parentId}
          `;

          try {
            await logStoreActivity({
              storeId,
              section: "profile",
              action: "logo_update",
              summary: "Updated store brand logo",
              diff: { parent_logo_url: imageUrl, r2_key: uploadedKey },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}

          return reply.code(201).send({
            success: true,
            parent_logo_url: imageUrl,
            logo_url: imageUrl,
            r2_key: uploadedKey,
          });
        },
      );

      /** DELETE /merchant-partner/stores/:storeId/store-logo — clear parent brand logo. */
      protectedApp.delete<{ Params: { storeId: string } }>(
        "/stores/:storeId/store-logo",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if ((storeCheck as any[]).length === 0) return reply.code(404).send({ error: "store_not_found" });

          try {
            const prevRows = await sql`
              SELECT store_logo FROM merchant_parents WHERE id = ${parentId} LIMIT 1
            `;
            const prevUrl = String((prevRows[0] as any)?.store_logo || "");
            const m = /key=([^&]+)/.exec(prevUrl);
            const prevKey = m?.[1] ? decodeURIComponent(m[1]) : null;
            if (prevKey) {
              const { deleteFromR2 } = await import("../../services/r2/r2Service.js");
              deleteFromR2(prevKey).catch(() => undefined);
            }
          } catch {
            /* ignore */
          }

          await sql`
            UPDATE merchant_parents
            SET store_logo = NULL, updated_at = NOW()
            WHERE id = ${parentId}
          `;

          try {
            await logStoreActivity({
              storeId,
              section: "profile",
              action: "logo_remove",
              summary: "Removed store brand logo",
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}

          return reply.send({ success: true, parent_logo_url: null });
        },
      );

      /** DELETE /merchant-partner/stores/:storeId/offers/:offerId — soft-delete (set is_active=false). */
      protectedApp.delete<{ Params: { storeId: string; offerId: string } }>(
        "/stores/:storeId/offers/:offerId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const offerIdParam = req.params.offerId;
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          await sql`UPDATE merchant_offers SET is_active = false, updated_at = NOW() WHERE offer_id = ${offerIdParam} AND store_id = ${storeId}`;
          await logStoreActivity({
            storeId, section: "offer", action: "delete",
            entityName: offerIdParam,
            summary: `Deactivated offer "${offerIdParam}"`,
            actorType: "merchant", source: "merchant_app",
          });
          try {
            await invalidateOfferPricing(storeId, "offer_deleted", {
              offerId: offerIdParam,
            });
          } catch {
            /* best-effort */
          }
          return reply.send({ success: true });
        }
      );

      /** GET /merchant-partner/stores/:storeId/wallet — wallet summary (Partner Site parity). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { reconcile?: string; lite?: string } }>(
        "/stores/:storeId/wallet",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { getWalletSummary } = await import("../../lib/merchant-wallet-engine.js");
          // Default lite=0 for App so pending/in-process payouts match Partner payments page (lite=0).
          const lite = req.query.lite === "1";
          const reconcile = req.query.reconcile === "1";
          const summary = await getWalletSummary(storeId, { lite, reconcile });
          return reply.send({ success: true, ...summary });
        }
      );

      /** GET /merchant-partner/stores/:storeId/wallet/freeze — cheap freeze poll for live Withdraw UI. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/wallet/freeze",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const { getMerchantWalletFreezeStatus } = await import("../../lib/merchant-wallet-engine.js");
          const freeze = await getMerchantWalletFreezeStatus(storeId);
          return reply.send({ success: true, ...freeze });
        }
      );

      /** GET /merchant-partner/stores/:storeId/wallet/ledger — paginated ledger. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string; offset?: string; from?: string; to?: string; direction?: string; category?: string; search?: string } }>(
        "/stores/:storeId/wallet/ledger",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { queryLedger } = await import("../../lib/merchant-wallet-engine.js");
          const result = await queryLedger(storeId, {
            limit: Number(req.query.limit) || 50,
            offset: Number(req.query.offset) || 0,
            from: req.query.from || undefined,
            to: req.query.to || undefined,
            direction: (req.query.direction === "CREDIT" || req.query.direction === "DEBIT") ? req.query.direction : undefined,
            category: req.query.category || undefined,
            search: req.query.search || undefined,
          });
          return reply.send({ success: true, ...result });
        }
      );

      /** GET /merchant-partner/stores/:storeId/payout-requests — Partner Site payout list parity. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>(
        "/stores/:storeId/payout-requests",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { listPayoutRequests } = await import("../../lib/merchant-wallet-engine.js");
          const result = await listPayoutRequests(storeId, Number(req.query.limit) || 5);
          return reply.send({ success: true, ...result });
        }
      );

      /** GET /merchant-partner/stores/:storeId/wallet/payout-settlement — ledger SSOT summary for a period/cycle. */
      protectedApp.get<{
        Params: { storeId: string };
        Querystring: { from?: string; to?: string; cycleId?: string };
      }>(
        "/stores/:storeId/wallet/payout-settlement",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const cycleIdRaw = req.query.cycleId ? Number(req.query.cycleId) : null;
          const cycleId =
            cycleIdRaw != null && Number.isInteger(cycleIdRaw) && cycleIdRaw > 0 ? cycleIdRaw : null;
          const periodStart = req.query.from ? new Date(req.query.from) : null;
          const periodEnd = req.query.to ? new Date(req.query.to) : null;
          if (
            !cycleId &&
            (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()))
          ) {
            return reply.code(400).send({ error: "from_and_to_required" });
          }

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          try {
            const { getPayoutSettlement } = await import("../../lib/merchant-payout-settlement.js");
            const settlement = await getPayoutSettlement(
              storeId,
              periodStart ?? new Date(0),
              periodEnd ?? new Date(),
              { cycleId },
            );
            return reply.send({ success: true, settlement });
          } catch (e) {
            req.log.error({ err: e, storeId }, "payout-settlement failed");
            return reply.code(500).send({ error: "settlement_failed" });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/wallet/payout-cycles — open + closed payout cycles. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>(
        "/stores/:storeId/wallet/payout-cycles",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          try {
            const { listPayoutCycles } = await import("../../lib/merchant-payout-settlement.js");
            const cycles = await listPayoutCycles(storeId, Number(req.query.limit) || 50);
            return reply.send({ success: true, cycles });
          } catch (e) {
            req.log.error({ err: e, storeId }, "payout-cycles failed");
            return reply.code(500).send({ error: "payout_cycles_failed" });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/payout-quote — withdrawal breakdown. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { amount: string } }>(
        "/stores/:storeId/payout-quote",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          const amount = parseFloat(req.query.amount);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          if (isNaN(amount) || amount < 100) return reply.code(400).send({ error: "amount must be >= 100" });

          const { getPayoutQuote } = await import("../../lib/merchant-wallet-engine.js");
          const quote = await getPayoutQuote(storeId, amount);
          return reply.send({ success: true, ...quote });
        }
      );

      /** POST /merchant-partner/stores/:storeId/payout-request — create withdrawal. */
      protectedApp.post<{ Params: { storeId: string }; Body: { amount: number; bank_account_id: number } }>(
        "/stores/:storeId/payout-request",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) return reply.code(401).send({ error: "merchant_required" });
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) return reply.code(400).send({ error: "invalid_store_id" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const sc = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (sc.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const body = (req.body || {}) as Record<string, unknown>;
          const amount = Number(body.amount);
          const bankAccountId = Number(body.bank_account_id);
          if (isNaN(amount) || amount < 100) return reply.code(400).send({ error: "amount must be >= 100" });
          if (!Number.isFinite(bankAccountId) || bankAccountId < 1) return reply.code(400).send({ error: "bank_account_id required" });
          const clientKey = typeof body.idempotency_key === "string" ? body.idempotency_key : undefined;

          try {
            const { createWithdrawalRequest } = await import("../../lib/merchant-wallet-engine.js");
            const result = await createWithdrawalRequest(storeId, amount, bankAccountId, "merchant_app", clientKey);
            return reply.code(201).send({ success: true, ...result });
          } catch (e) {
            const { isWalletFrozenError, walletFrozenHttpBody } = await import("../../lib/wallet-freeze.js");
            if (isWalletFrozenError(e)) {
              return reply.code(403).send({ success: false, ...walletFrozenHttpBody(e) });
            }
            return reply.code(400).send({ error: e instanceof Error ? e.message : "Withdrawal failed" });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/activity-feed — recent activity for this store with filters. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string; section?: string; source?: string; actor_type?: string; action?: string; since?: string } }>(
        "/stores/:storeId/activity-feed",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeCheck = await sql`SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1`;
          if (storeCheck.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const limit = Math.min(Number(req.query.limit) || 50, 200);
          const section = req.query.section || null;
          const source = req.query.source || null;
          const actorType = req.query.actor_type || null;
          const action = req.query.action || null;
          const sinceRaw = (req.query as { since?: string }).since;
          const since =
            typeof sinceRaw === "string" && sinceRaw.trim()
              ? new Date(sinceRaw.trim())
              : null;
          const sinceValid =
            since != null && !Number.isNaN(since.getTime()) ? since : null;

          const rows = await sql`
            SELECT * FROM store_activity_feed
            WHERE store_id = ${storeId}
              AND (${section}::text IS NULL OR section = ${section})
              AND (${source}::text IS NULL OR source = ${source})
              AND (${actorType}::text IS NULL OR actor_type = ${actorType})
              AND (${action}::text IS NULL OR action = ${action})
              AND (${sinceValid}::timestamptz IS NULL OR created_at >= ${sinceValid})
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;

          const activities = (Array.isArray(rows) ? rows : [rows]).map((r: Record<string, unknown>) => ({
            ...r,
            created_at:
              r.created_at instanceof Date
                ? r.created_at.toISOString()
                : r.created_at != null
                  ? String(r.created_at)
                  : null,
          }));

          return reply.send({ success: true, activities });
        }
      );

      /** GET /merchant-partner/stores/:storeId/status — real-time store open/closed status + availability metadata for partner app. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/status",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          await runStoreScheduleTickForStore(storeId, req.log);
          const rows = await sql`
            SELECT ms.id,
                   ms.operational_status,
                   ms.is_accepting_orders,
                   ms.is_active,
                   ms.is_available AS store_is_available,
                   ms.approval_status,
                   ms.delisted_at,
                   msa.is_available,
                   msa.is_accepting_orders AS avail_accepting,
                   msa.auto_open_from_schedule,
                   msa.block_auto_open,
                   msa.manual_close_until,
                   msa.is_manual_override,
                   msa.schedule_end_prompt_expires_at,
                   msa.close_reason,
                   msa.unavailable_reason,
                   msa.auto_available_at,
                   msa.restriction_type,
                   msa.last_toggle_type,
                   msa.last_toggled_at,
                   msa.last_toggled_by_email,
                   msa.last_toggled_by_name,
                   msa.last_toggled_by_id
            FROM merchant_stores ms
            LEFT JOIN merchant_store_availability msa ON msa.store_id = ms.id
            WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
            LIMIT 1
          `;
          if (rows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const row = rows[0] as {
            operational_status?: string | null;
            is_accepting_orders: boolean | null;
            is_active: boolean | null;
            is_available: boolean | null;
            store_is_available?: boolean | null;
            approval_status?: string | null;
            delisted_at?: Date | string | null;
            avail_accepting: boolean | null;
            auto_open_from_schedule?: boolean | null;
            block_auto_open?: boolean | null;
            manual_close_until?: Date | string | null;
            is_manual_override?: boolean | null;
            schedule_end_prompt_expires_at?: Date | string | null;
            close_reason?: string | null;
            unavailable_reason?: string | null;
            restriction_type?: string | null;
            last_toggle_type?: string | null;
            last_toggled_at?: Date | string | null;
            last_toggled_by_email?: string | null;
            last_toggled_by_name?: string | null;
            last_toggled_by_id?: string | null;
          };
          const autoOpenFromSchedule = row.auto_open_from_schedule !== false;
          const blockAutoOpen = row.block_auto_open === true;
          const normalizeInstantStr = (v: string): string => {
            let s = v.trim().replace(" ", "T");
            if (s && !/[zZ]$/.test(s)) {
              s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
              s = s.replace(/([+-]\d{2})$/, "$1:00");
            }
            return s;
          };
          let manualCloseUntil: string | null = null;
          if (row.manual_close_until != null) {
            const raw = row.manual_close_until instanceof Date
              ? row.manual_close_until
              : new Date(normalizeInstantStr(String(row.manual_close_until)));
            manualCloseUntil = Number.isNaN(raw.getTime()) ? null : raw.toISOString();
          }
          let restrictionType = row.restriction_type != null ? String(row.restriction_type) : null;
          const manualCloseReason =
            row.close_reason != null && String(row.close_reason).trim() !== ""
              ? String(row.close_reason).trim()
              : null;
          const lastToggleType =
            row.last_toggle_type != null && String(row.last_toggle_type).trim() !== ""
              ? String(row.last_toggle_type).trim()
              : null;
          let manualCloseStartAt: string | null = null;
          if (row.last_toggled_at != null) {
            const raw = row.last_toggled_at instanceof Date
              ? row.last_toggled_at
              : new Date(normalizeInstantStr(String(row.last_toggled_at)));
            manualCloseStartAt = Number.isNaN(raw.getTime()) ? null : raw.toISOString();
          }
          const lastToggledAt = manualCloseStartAt;
          const closedBy = row.last_toggled_by_name != null && String(row.last_toggled_by_name).trim() !== "" ? String(row.last_toggled_by_name).trim() : null;
          const closedById = row.last_toggled_by_id != null && String(row.last_toggled_by_id).trim() !== "" ? String(row.last_toggled_by_id).trim() : null;
          const lastToggledByEmail =
            (row as any).last_toggled_by_email != null && String((row as any).last_toggled_by_email).trim() !== ""
              ? String((row as any).last_toggled_by_email).trim()
              : null;

          const now = new Date();
          const nowMs = now.getTime();
          let scheduleEndPromptExpiresAt: string | null = null;
          if ((row as any).schedule_end_prompt_expires_at != null) {
            const raw =
              (row as any).schedule_end_prompt_expires_at instanceof Date
                ? (row as any).schedule_end_prompt_expires_at
                : new Date(normalizeInstantStr(String((row as any).schedule_end_prompt_expires_at)));
            scheduleEndPromptExpiresAt = Number.isNaN(raw.getTime()) ? null : raw.toISOString();
          }
          const scheduleEndPromptActive =
            scheduleEndPromptExpiresAt != null ? nowMs < new Date(scheduleEndPromptExpiresAt).getTime() : false;
          let untilMs = manualCloseUntil != null ? new Date(manualCloseUntil).getTime() : 0;
          let isInScheduledClosure = manualCloseUntil != null && nowMs < untilMs;

          // Scheduled closures (future schedule): activates only when starts_at is reached.
          // Support multiple entries: pick the earliest ACTIVE window and earliest UPCOMING one.
          const rawSchedRows = await sql`
            SELECT id, reason, starts_at, ends_at, status, reminder_sent_at, marked_from
            FROM merchant_store_scheduled_closures
            WHERE store_id = ${storeId} AND status IN ('scheduled', 'active')
            ORDER BY starts_at ASC
            LIMIT 20
          `;
          type SchedRow = {
            id: number;
            reason: string;
            starts_at: Date | string;
            ends_at: Date | string;
            status: string;
            reminder_sent_at: Date | string | null;
            marked_from: string | null;
          };
          let activeSched: (SchedRow & { startsAt: Date; endsAt: Date }) | null = null;
          let upcomingSched: (SchedRow & { startsAt: Date; endsAt: Date }) | null = null;

          for (const rowRaw of rawSchedRows as unknown as SchedRow[]) {
            const startsAt = new Date(
              rowRaw.starts_at instanceof Date ? rowRaw.starts_at.toISOString() : String(rowRaw.starts_at)
            );
            const endsAt = new Date(
              rowRaw.ends_at instanceof Date ? rowRaw.ends_at.toISOString() : String(rowRaw.ends_at)
            );
            if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;

            const startsMs = startsAt.getTime();
            const endsMs = endsAt.getTime();

            // Reminder 1 hour before start (only once, while still scheduled)
            const reminderAtMs = startsMs - 60 * 60 * 1000;
            const reminderSent = rowRaw.reminder_sent_at != null;
            if (rowRaw.status === "scheduled" && !reminderSent && nowMs >= reminderAtMs && nowMs < startsMs) {
              await sql`
                UPDATE merchant_store_scheduled_closures
                SET reminder_sent_at = NOW(), updated_at = NOW()
                WHERE id = ${rowRaw.id}
              `;
              const reminderTitle = "Scheduled closure reminder";
              const reminderBody =
                "Reminder: Your scheduled store closure will start in 1 hour. If you want to cancel or modify it, you can do so from the Scheduled Off settings.";
              await sql`
                INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
                VALUES (${storeId}, 'store', ${reminderTitle}, ${reminderBody}, FALSE, '/(tabs)/profile/vacation')
              `;
              const tokenRows = await sql`
                SELECT token FROM merchant_store_push_tokens WHERE store_id = ${storeId}
              `;
              const tokens = (tokenRows as unknown as Array<{ token: string }>).map((t) => t.token).filter(Boolean);
              if (tokens.length > 0) {
                await sendNotification({
                  templateCode: "MERCHANT_SCHEDULED_OFF_REMINDER",
                  variables: { closeTime: "1 hour", reason: "your scheduled closure" },
                  target: { device_tokens: tokens },
                  priority: "high",
                  idempotencyKey: `SCHEDULED_OFF_REMINDER:${storeId}:${Math.floor(Date.now()/3600000)}`,
                  metadata: { url: "/(tabs)/profile/vacation", screen: "scheduled_off" },
                }).catch((e) => console.warn("[scheduled-off reminder] v2 send failed", (e as Error).message));
              }
            }

            const inWindow = nowMs >= startsMs && nowMs < endsMs;
            const upcoming = nowMs < startsMs;

            // Mark active when starts_at reached
            if (rowRaw.status === "scheduled" && inWindow) {
              await sql`
                UPDATE merchant_store_scheduled_closures
                SET status = 'active', updated_at = NOW()
                WHERE id = ${rowRaw.id}
              `;
            }

            // Mark completed when ended
            if (nowMs >= endsMs && (rowRaw.status === "scheduled" || rowRaw.status === "active")) {
              await sql`
                UPDATE merchant_store_scheduled_closures
                SET status = 'completed', updated_at = NOW()
                WHERE id = ${rowRaw.id}
              `;
              await sql`
                INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
                VALUES (
                  ${storeId},
                  'store',
                  'Scheduled closure ended',
                  'Your scheduled store closure has ended. Your store can now accept orders.',
                  FALSE,
                  '/(tabs)/profile/vacation'
                )
              `;
              continue;
            }

            if (inWindow) {
              if (!activeSched || startsMs < activeSched.startsAt.getTime()) {
                activeSched = { ...rowRaw, startsAt, endsAt };
              }
            } else if (upcoming) {
              if (!upcomingSched || startsMs < upcomingSched.startsAt.getTime()) {
                upcomingSched = { ...rowRaw, startsAt, endsAt };
              }
            }
          }

          const isActiveSchedule = !!activeSched;
          const isUpcomingSchedule = !!upcomingSched;

          // When availability has no manual_close_until, derive from *today's* active merchant_store_holidays window.
          // This must NOT close the store on future holidays; only when current time is inside today's [closed_from, closed_till] in IST.
          let resolvedManualCloseUntil = manualCloseUntil;
          if (!isInScheduledClosure && manualCloseUntil == null) {
            const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const todayStr = istDateFormatter.format(now); // YYYY-MM-DD in IST
            const holidayRows = await sql`
              SELECT holiday_date, closed_from, closed_till, closure_reason, holiday_type
              FROM merchant_store_holidays
              WHERE store_id = ${storeId}
                AND holiday_date = ${todayStr}
              ORDER BY closed_till DESC NULLS LAST
              LIMIT 10
            `;
            for (const h of holidayRows as Array<{ holiday_date?: string | Date; closed_from?: string | null; closed_till?: string | null; closure_reason?: string | null; holiday_type?: string | null }>) {
              const dateStr = h.holiday_date instanceof Date ? h.holiday_date.toISOString().slice(0, 10) : String(h.holiday_date ?? "").slice(0, 10);
              if (!dateStr) continue;
              // Only consider holidays for *today*; derive full [from,to] window and close store only if now is inside.
              const fromTimeRaw =
                h.closed_from != null && String(h.closed_from).trim() !== ""
                  ? String(h.closed_from).trim().slice(0, 8)
                  : "00:00:00";
              const tillTimeRaw =
                h.closed_till != null && String(h.closed_till).trim() !== ""
                  ? String(h.closed_till).trim().slice(0, 8)
                  : "23:59:59";
              const fromIso = `${dateStr}T${fromTimeRaw}.000Z`;
              const untilIso = `${dateStr}T${tillTimeRaw}.000Z`;
              const fromDate = new Date(fromIso);
              const untilDate = new Date(untilIso);
              const fromMs = Number.isNaN(fromDate.getTime()) ? 0 : fromDate.getTime();
              const untilRowMs = Number.isNaN(untilDate.getTime()) ? 0 : untilDate.getTime();
              if (fromMs <= nowMs && nowMs < untilRowMs) {
                resolvedManualCloseUntil = untilDate.toISOString();
                untilMs = untilRowMs;
                isInScheduledClosure = true;
                if (restrictionType == null && h.holiday_type != null) restrictionType = String(h.holiday_type);
                break;
              }
            }
          }

          let reopenedThisRequest = false;
          let baseAcceptingOverride: boolean | null = null;
          let availAcceptingOverride: boolean | null = null;
          let statusReasonOverride: string | null = null;
          let unavailableReasonOverride: string | null = null;
          let restrictionTypeOverride: string | null = null;
          if (!isInScheduledClosure && manualCloseUntil != null && nowMs >= untilMs) {
            const reopenIso = new Date().toISOString();
            const hoursRowsExpiry = await sql`
              SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
            `;
            const hoursRowExpiry = hoursRowsExpiry[0] as Record<string, unknown> | undefined;
            const { dayOfWeek: dow, minutesSinceMidnight: msm } = nowInStoreTz();
            const withinHours =
              hoursRowExpiry != null && hoursRowExpiry
                ? isWithinOperatingHours(hoursRowExpiry, dow, msm)
                : false;
            const shouldOpen = autoOpenFromSchedule && withinHours;

            if (shouldOpen) {
              const reopenResult = await sql`
                UPDATE merchant_store_availability
                SET is_available = TRUE, is_accepting_orders = TRUE,
                    unavailable_reason = NULL, close_reason = NULL, restriction_type = NULL,
                    auto_available_at = ${reopenIso}, manual_close_until = NULL,
                    last_toggle_type = 'AUTO_REOPEN', last_toggled_at = ${reopenIso}, updated_at = NOW()
                WHERE store_id = ${storeId}
                  AND (manual_close_until IS NULL OR manual_close_until <= NOW())
                RETURNING id
              `;
              const didReopen = Array.isArray(reopenResult) && reopenResult.length > 0;
              reopenedThisRequest = didReopen;
              if (didReopen) {
                baseAcceptingOverride = true;
                availAcceptingOverride = true;
                await syncMerchantStoresOnlineTriple(sql, storeId, true, { parentId });
                resolvedManualCloseUntil = null;
              }
            } else {
              await sql`
                UPDATE merchant_store_availability
                SET manual_close_until = NULL, is_available = FALSE, is_accepting_orders = FALSE,
                    unavailable_reason = 'schedule_closed', close_reason = 'Outside operating hours',
                    restriction_type = 'schedule', auto_available_at = NULL,
                    last_toggle_type = 'AUTO_CLOSE', last_toggled_at = ${reopenIso}, updated_at = NOW()
                WHERE store_id = ${storeId}
              `;
              await syncMerchantStoresOnlineTriple(sql, storeId, false, { parentId });
              resolvedManualCloseUntil = null;
              statusReasonOverride = "schedule_closed";
              unavailableReasonOverride = "schedule_closed";
              restrictionTypeOverride = "schedule";
            }
            if (reopenedThisRequest) {
              const tokenRows = await sql`
                SELECT token FROM merchant_store_push_tokens WHERE store_id = ${storeId}
              `;
              const tokens = (tokenRows as unknown as Array<{ token: string }>).map((t) => t.token).filter(Boolean);
              if (tokens.length > 0) {
                const notifTitle = "Your store can now reopen";
                const notifBody = "Business hours are active and your scheduled closure has ended.";
                await sql`
                  INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
                  VALUES (${storeId}, 'store', ${notifTitle}, ${notifBody}, FALSE, '/(tabs)/profile/status')
                `;
                if (tokens.length > 0) {
                  await sendNotification({
                    templateCode: "MERCHANT_REOPEN_PROMPT",
                    variables: { endTime: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) },
                    target: { device_tokens: tokens },
                    priority: "high",
                    idempotencyKey: `REOPEN_PROMPT:${storeId}:${Math.floor(Date.now()/60000)}`,
                    metadata: { url: "/(tabs)/profile/status", screen: "store_status", action: "reopen_prompt" },
                  }).catch(() => undefined);
                }
              }
            }
          }

          const baseAccepting =
            baseAcceptingOverride !== null ? baseAcceptingOverride : row.is_accepting_orders === true;
          const availAccepting =
            availAcceptingOverride !== null ? availAcceptingOverride : row.avail_accepting !== false;
          let available = row.is_available !== false;
          const active = row.is_active !== false;
          if (isActiveSchedule) {
            available = false;
          } else if (isInScheduledClosure) {
            available = false;
          } else if (reopenedThisRequest) {
            available = true;
          }
          const isOpen = baseAccepting && availAccepting && available && active;

          const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
          let statusReason: string | null = null;
          let nextOpenTime: string | null = null;
          let nextCloseTime: string | null = null;
          let nextOpenIso: string | null = null;
          /** Hoisted for `within_hours_but_restricted` (Partner / dashboard parity). */
          let withinHoursComputed = false;
          const hoursRowsForStatus = await sql`
            SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
          `;
          const hoursRowForStatus = hoursRowsForStatus[0] as Record<string, unknown> | undefined;
          if (hoursRowForStatus) {
            const withinHours = isWithinOperatingHours(hoursRowForStatus, dayOfWeek, minutesSinceMidnight);
            withinHoursComputed = withinHours;
            const next = getNextOpenClose(hoursRowForStatus, dayOfWeek, minutesSinceMidnight);
            nextOpenTime = next.next_open_time;
            nextCloseTime = next.next_close_time;
            if (!isOpen) {
              if (blockAutoOpen) statusReason = "manual_lock";
              else if (isInScheduledClosure) statusReason = "manual_close";
              else if (row.auto_open_from_schedule !== false && !withinHours) {
                const nextOpenMin =
                  nextOpenTime != null && nextOpenTime.trim() !== ""
                    ? (() => {
                        const [hStr, mStr] = nextOpenTime.trim().split(":");
                        return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
                      })()
                    : null;
                statusReason =
                  nextOpenMin != null && nextOpenMin > minutesSinceMidnight
                    ? "outside_operating_hours"
                    : "schedule_closed";
              }
            }
            if (!isOpen) {
              const nowRef = new Date();
              const manualStr =
                resolvedManualCloseUntil != null && String(resolvedManualCloseUntil).trim() !== ""
                  ? String(resolvedManualCloseUntil).trim()
                  : null;
              const scheduleNext = getNextOpenIso(hoursRowForStatus, dayOfWeek, minutesSinceMidnight, nowRef);
              const nextAfterToday = getNextOpenIsoAfterIstCalendarDay(hoursRowForStatus, dayOfWeek, nowRef);
              const nextDayStart = getNextOpenDayStartIso(hoursRowForStatus, dayOfWeek, nowRef);
              // A "close for today" that fires before today's own slot has started must not skip
              // today: today hasn't happened yet, so the countdown should target today's slot, not
              // jump past it to a future calendar day (see isBeforeFirstSlotToday).
              const beforeFirstSlotToday = isBeforeFirstSlotToday(hoursRowForStatus, dayOfWeek, minutesSinceMidnight);

              if (manualStr) {
                nextOpenIso = isLikelyLegacyEndOfDayIstClose(manualStr, nowRef)
                  ? beforeFirstSlotToday
                    ? (scheduleNext ?? nextAfterToday ?? manualStr)
                    : (nextAfterToday ?? scheduleNext ?? manualStr)
                  : manualStr;
              } else {
                nextOpenIso = scheduleNext;
                if (nextOpenIso == null && nextOpenTime != null && nextOpenTime.trim() !== "") {
                  const [hStr, mStr] = nextOpenTime.split(":");
                  const nextOpenMin = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
                  const dateParts = new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Kolkata",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).formatToParts(nowRef);
                  const y = dateParts.find((p) => p.type === "year")?.value ?? "0";
                  const mo = dateParts.find((p) => p.type === "month")?.value ?? "01";
                  const d = dateParts.find((p) => p.type === "day")?.value ?? "01";
                  let dateStr = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
                  if (nextOpenMin <= minutesSinceMidnight) {
                    const tomorrow = new Date(nowRef);
                    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                    const tp = new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Kolkata",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).formatToParts(tomorrow);
                    const ty = tp.find((p) => p.type === "year")?.value ?? y;
                    const tmo = tp.find((p) => p.type === "month")?.value ?? "01";
                    const td = tp.find((p) => p.type === "day")?.value ?? "01";
                    dateStr = `${ty}-${String(tmo).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
                  }
                  const isoInIst = `${dateStr}T${nextOpenTime.trim()}:00+05:30`;
                  const nextOpenDate = new Date(isoInIst);
                  nextOpenIso = Number.isNaN(nextOpenDate.getTime()) ? null : nextOpenDate.toISOString();
                }
                if (nextOpenIso == null) {
                  if (nextDayStart != null) {
                    nextOpenIso = nextDayStart;
                  } else {
                    const tomorrow = new Date(nowRef);
                    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                    const tp = new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Kolkata",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).formatToParts(tomorrow);
                    const ty = tp.find((p) => p.type === "year")?.value ?? "0";
                    const tmo = tp.find((p) => p.type === "month")?.value ?? "01";
                    const td = tp.find((p) => p.type === "day")?.value ?? "01";
                    const tomorrowStart = new Date(
                      `${ty}-${String(tmo).padStart(2, "0")}-${String(td).padStart(2, "0")}T00:00:00+05:30`
                    );
                    nextOpenIso = Number.isNaN(tomorrowStart.getTime()) ? null : tomorrowStart.toISOString();
                  }
                }
              }
            }
            if (statusReasonOverride != null) statusReason = statusReasonOverride;
          }

          // This flag is used by UIs to decide whether to show a schedule "Opens in …" countdown.
          // It must be TRUE only when the store is within hours but held OFF with no countdown target
          // (manual lock / manual indefinite). TEMP close (manual_close_until in future) should still show countdown.
          const unavailableReasonNormForRestrict =
            row.unavailable_reason != null && String(row.unavailable_reason).trim() !== ""
              ? String(row.unavailable_reason).trim().toLowerCase()
              : "";
          const isManualIndefinite = unavailableReasonNormForRestrict === "manual_indefinite";
          const withinHoursButRestricted =
            withinHoursComputed && !isOpen && (blockAutoOpen || isManualIndefinite);

          // Active scheduled vacation/off: countdown should match end of that window (dashboard / Partner parity).
          if (!isOpen && isActiveSchedule && activeSched) {
            const endsMs = activeSched.endsAt.getTime();
            if (Number.isFinite(endsMs) && endsMs > nowMs) {
              nextOpenIso = activeSched.endsAt.toISOString();
            }
          }

          // No automatic reopen time: do not send a schedule slot countdown (merchant app / Partner parity).
          const unavailableReasonNorm =
            row.unavailable_reason != null && String(row.unavailable_reason).trim() !== ""
              ? String(row.unavailable_reason).trim().toLowerCase()
              : "";
          if (!isOpen) {
            const manualStrForNull =
              resolvedManualCloseUntil != null && String(resolvedManualCloseUntil).trim() !== ""
                ? String(resolvedManualCloseUntil).trim()
                : null;
            if (blockAutoOpen) {
              nextOpenIso = null;
            } else if (
              manualStrForNull == null &&
              unavailableReasonNorm === "manual_indefinite" &&
              !(isActiveSchedule && activeSched)
            ) {
              nextOpenIso = null;
            }
          }

          let scheduledClosure: { from: string; to: string; reason: string; marked_from: string | null } | null = null;
          if (isActiveSchedule && activeSched) {
            scheduledClosure = {
              from: activeSched.startsAt.toISOString(),
              to: activeSched.endsAt.toISOString(),
              reason: String(activeSched.reason || "Scheduled off"),
              marked_from:
                activeSched.marked_from != null && String(activeSched.marked_from).trim() !== ""
                  ? String(activeSched.marked_from).trim()
                  : null,
            };
          } else if (isInScheduledClosure && resolvedManualCloseUntil) {
            const holidayRows = await sql`
              SELECT holiday_date, closed_from, closed_till, closure_reason
              FROM merchant_store_holidays
              WHERE store_id = ${storeId}
              ORDER BY created_at DESC
              LIMIT 1
            `;
            const h = holidayRows[0] as { holiday_date?: string | Date; closed_from?: string | null; closed_till?: string | null; closure_reason?: string | null } | undefined;
            const reason = (h?.closure_reason != null && String(h.closure_reason).trim() !== "") ? String(h.closure_reason).trim() : "Scheduled off";
            if (h?.holiday_date != null) {
              const dateStr = h.holiday_date instanceof Date ? h.holiday_date.toISOString().slice(0, 10) : String(h.holiday_date).slice(0, 10);
              const fromTime = (h.closed_from != null && String(h.closed_from).trim() !== "") ? String(h.closed_from).trim().slice(0, 8) : "00:00:00";
              const fromIso = `${dateStr}T${fromTime}.000Z`;
              const fromDate = new Date(fromIso);
              scheduledClosure = {
                from: Number.isNaN(fromDate.getTime()) ? `${dateStr}T00:00:00.000Z` : fromDate.toISOString(),
                to: resolvedManualCloseUntil,
                reason,
                marked_from: null,
              };
            } else {
              scheduledClosure = {
                from: resolvedManualCloseUntil,
                to: resolvedManualCloseUntil,
                reason,
                marked_from: null,
              };
            }
          }

          const { isStoreDelistedRow } = await import("../../lib/store-delist.js");
          const approvalStatus = String((row as { approval_status?: string | null }).approval_status ?? "").toUpperCase();
          const isDelisted = isStoreDelistedRow({
            approval_status: row.approval_status,
            delisted_at: (row as { delisted_at?: Date | string | null }).delisted_at,
          });
          const operationalStatus =
            row.operational_status != null ? String(row.operational_status).trim().toUpperCase() : "";
          const effectiveOp = effectiveOperationalFromStoreRow({
            operational_status: operationalStatus,
            is_active: row.is_active,
            is_accepting_orders: row.is_accepting_orders,
            is_available: (row as { store_is_available?: boolean | null }).store_is_available,
            approval_status: (row as { approval_status?: string | null }).approval_status,
            delisted_at: (row as { delisted_at?: Date | string | null }).delisted_at,
          });
          const surfaceOnline = computeSurfaceLiveStatus(effectiveOp, withinHoursComputed) === "OPEN";

          const delistedAtRaw = (row as { delisted_at?: Date | string | null }).delisted_at;
          const delistedAtIso =
            delistedAtRaw == null
              ? null
              : delistedAtRaw instanceof Date
                ? delistedAtRaw.toISOString()
                : new Date(String(delistedAtRaw)).toISOString();

          return reply.send({
            store_id: storeId,
            is_open: surfaceOnline && !isDelisted,
            is_delisted: isDelisted,
            delisted_at: delistedAtIso && !Number.isNaN(Date.parse(delistedAtIso)) ? delistedAtIso : null,
            approval_status: approvalStatus || null,
            operational_status: effectiveOp,
            within_operating_hours: withinHoursComputed,
            is_accepting_orders: baseAccepting,
            is_available: available,
            auto_open_from_schedule: autoOpenFromSchedule,
            block_auto_open: blockAutoOpen,
            is_manual_override: row.is_manual_override === true,
            schedule_end_prompt_expires_at: scheduleEndPromptExpiresAt,
            schedule_end_prompt_active: scheduleEndPromptActive,
            manual_close_until: resolvedManualCloseUntil,
            manual_close_reason: manualCloseReason,
            manual_close_start_at: resolvedManualCloseUntil != null ? manualCloseStartAt : null,
            closed_by: resolvedManualCloseUntil != null ? closedBy : null,
            closed_by_id: resolvedManualCloseUntil != null ? closedById : null,
            last_toggle_type: lastToggleType,
            last_toggled_at: lastToggledAt,
            last_toggled_by_email: lastToggledByEmail,
            last_toggled_by_name: closedBy,
            last_toggled_by_id: closedById,
            restriction_type: restrictionTypeOverride ?? (resolvedManualCloseUntil != null ? restrictionType : null),
            scheduled_closure: scheduledClosure,
            scheduled_closure_upcoming: isUpcomingSchedule && upcomingSched ? {
              from: upcomingSched.startsAt.toISOString(),
              to: upcomingSched.endsAt.toISOString(),
              reason: String(upcomingSched.reason || "Scheduled off"),
              marked_from:
                upcomingSched.marked_from != null && String(upcomingSched.marked_from).trim() !== ""
                  ? String(upcomingSched.marked_from).trim()
                  : null,
            } : null,
            active_rush: await (async () => {
              const rushRows = await sql`
                SELECT duration_minutes, started_at, ends_at, marked_from
                FROM merchant_store_rush_windows
                WHERE store_id = ${storeId}
                  AND is_active = TRUE
                  AND ends_at > NOW()
                ORDER BY started_at DESC
                LIMIT 1
              `;
              const rw = rushRows[0] as
                | {
                    duration_minutes: number;
                    started_at: Date | string;
                    ends_at: Date | string;
                    marked_from: string | null;
                  }
                | undefined;
              if (!rw) return null;
              const endsAtMs = new Date(String(rw.ends_at)).getTime();
              const remainingMinutes = Math.max(0, Math.floor((endsAtMs - Date.now()) / 60000));
              if (remainingMinutes <= 0) return null;
              return {
                is_active: true,
                duration_minutes: Number(rw.duration_minutes),
                started_at: new Date(String(rw.started_at)).toISOString(),
                ends_at: new Date(String(rw.ends_at)).toISOString(),
                remaining_minutes: remainingMinutes,
                marked_from:
                  rw.marked_from != null && String(rw.marked_from).trim() !== ""
                    ? String(rw.marked_from).trim()
                    : null,
              };
            })(),
            status_reason: statusReason,
            next_open_time: nextOpenTime,
            next_close_time: nextCloseTime,
            next_open_iso: nextOpenIso,
            within_hours_but_restricted: withinHoursButRestricted,
            unavailable_reason: unavailableReasonOverride ?? (row as any).unavailable_reason ?? null,
            auto_available_at: (row as any).auto_available_at != null
              ? (typeof (row as any).auto_available_at === "string"
                ? (row as any).auto_available_at
                : (row as any).auto_available_at instanceof Date
                  ? (row as any).auto_available_at.toISOString()
                  : null)
              : null,
          });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/status — toggle store open/closed and update availability flags for partner app. */
      /** POST /merchant-partner/stores/:storeId/status/schedule-end-response — resolve schedule-end prompt ("stay online" vs "go offline"). */
      protectedApp.post<{
        Params: { storeId: string };
        Body: { action: "stay_online" | "go_offline" };
      }>("/stores/:storeId/status/schedule-end-response", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const actionRaw = String((req.body as any)?.action ?? "");
        const action = actionRaw === "stay_online" || actionRaw === "go_offline" ? actionRaw : null;
        if (!action) return reply.code(400).send({ error: "invalid_action" });

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        const storeRows = await sql`
          SELECT ms.id
          FROM merchant_stores ms
          WHERE ms.id = ${storeId} AND ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const nowIso = new Date().toISOString();
        if (action === "stay_online") {
          await sql`
            UPDATE merchant_store_availability
            SET
              is_manual_override = TRUE,
              manual_override_at = ${nowIso},
              schedule_end_prompted_at = NULL,
              schedule_end_prompt_expires_at = NULL,
              updated_at = NOW()
            WHERE store_id = ${storeId}
          `;
          return reply.send({ ok: true, action: "stay_online" });
        }

        // go_offline
        await syncMerchantStoresOnlineTriple(sql, storeId, false, { parentId });
        await sql`
          UPDATE merchant_store_availability
          SET
            is_available = FALSE,
            is_accepting_orders = FALSE,
            unavailable_reason = 'manual_close',
            close_reason = 'Closed after schedule end',
            auto_unavailable_at = ${nowIso},
            auto_available_at = NULL,
            manual_close_until = NULL,
            is_manual_override = FALSE,
            manual_override_at = NULL,
            schedule_end_prompted_at = NULL,
            schedule_end_prompt_expires_at = NULL,
            last_toggle_type = 'MANUAL_CLOSE',
            restriction_type = 'manual',
            updated_at = NOW()
          WHERE store_id = ${storeId}
        `;
        return reply.send({ ok: true, action: "go_offline" });
      });

      protectedApp.patch<{
        Params: { storeId: string };
        Body: {
          is_open?: boolean;
          auto_open_from_schedule?: boolean;
          block_auto_open?: boolean;
          manual_close_until?: string | null;
          manual_close_reason?: string | null;
          /** When "today", backend computes manual_close_until authoritatively (ignores manual_close_until). */
          closure_type?: "today" | "temporary" | "manual_hold";
        };
      }>("/stores/:storeId/status", async (req, reply) => {
        try {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const body = (req.body || {}) as {
          is_open?: boolean;
          auto_open_from_schedule?: boolean;
          block_auto_open?: boolean;
          manual_close_until?: string | null;
          manual_close_reason?: string | null;
          closure_type?: "today" | "temporary" | "manual_hold";
        };
        const hasIsOpen = typeof body.is_open === "boolean";
        const hasAutoOpen = typeof body.auto_open_from_schedule === "boolean";
        const hasBlockAutoOpen = typeof body.block_auto_open === "boolean";
        if (!hasIsOpen && !hasAutoOpen && !hasBlockAutoOpen) {
          return reply.code(400).send({
            error: "invalid_body",
            message: "At least one of is_open, auto_open_from_schedule or block_auto_open is required",
          });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id, is_accepting_orders, is_active, approval_status, delisted_at
          FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const storeRow = storeRows[0] as {
          id: number;
          is_accepting_orders: boolean | null;
          is_active: boolean | null;
          approval_status?: string | null;
          delisted_at?: Date | string | null;
        };

        const openingStore = hasIsOpen && body.is_open === true;
        if (openingStore) {
          const { isStoreDelistedRow, storeDelistedHttpBody } = await import("../../lib/store-delist.js");
          if (isStoreDelistedRow(storeRow)) {
            return reply.code(403).send(storeDelistedHttpBody());
          }
        }

        const parentRow = await getParentForAudit(sql, parentId);
        const availRows = await sql`
          SELECT id,
                 is_available,
                 is_accepting_orders,
                 auto_open_from_schedule,
                 block_auto_open,
                 manual_close_until,
                 close_reason,
                 restriction_type,
                 last_toggled_at,
                 last_toggled_by_name
          FROM merchant_store_availability
          WHERE store_id = ${storeId}
          LIMIT 1
        `;
        const availRow = availRows[0] as
          | {
              id: number;
              is_available: boolean | null;
              is_accepting_orders: boolean | null;
              auto_open_from_schedule?: boolean | null;
              block_auto_open?: boolean | null;
              manual_close_until?: Date | string | null;
              close_reason?: string | null;
              restriction_type?: string | null;
              last_toggled_at?: Date | string | null;
              last_toggled_by_name?: string | null;
            }
          | undefined;

        const nextAccepting = hasIsOpen ? body.is_open === true : undefined;
        const nextAvailable = hasIsOpen ? body.is_open === true : undefined;
        const nextAutoOpen = hasAutoOpen ? body.auto_open_from_schedule === true : undefined;
        const nextBlockAutoOpen = hasBlockAutoOpen ? body.block_auto_open === true : undefined;

        // When merchant manually opens store (is_open true), clear scheduled off so store can go online.
        const closingStore = hasIsOpen && body.is_open === false;
        const currentManualCloseUntil = availRow?.manual_close_until ?? null;
        const currentRestrictionType = availRow?.restriction_type ?? null;
        const hadScheduledClosure = currentManualCloseUntil != null;

        // Vacation mode: if a scheduled closure is currently active, manual open is not allowed.
        if (openingStore) {
          const activeSchedRows = await sql`
            SELECT 1
            FROM merchant_store_scheduled_closures
            WHERE store_id = ${storeId}
              AND status IN ('scheduled', 'active')
              AND starts_at <= NOW()
              AND ends_at > NOW()
            LIMIT 1
          `;
          if (activeSchedRows.length > 0) {
            return reply
              .code(409)
              .send({ error: "vacation_mode_active", message: "Vacation mode is active. Disable Scheduled Off to go online." });
          }
        }

        // Manual open only inside configured operating hours (or 24h). Outside hours → reject.
        if (openingStore) {
          const hoursRows = await sql`SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1`;
          const hoursRow = hoursRows[0] as Record<string, unknown> | undefined;
          if (!hoursRow) {
            return reply.code(409).send({
              error: "outside_operating_hours",
              message:
                "Your store cannot be turned ON because it is currently outside its scheduled operating hours. To open your store now, please update your Store Schedule first.",
            });
          }
          const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
          const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
          const dayKey = dayNames[dayOfWeek];
          const closedDays = normalizeClosedDays(hoursRow.closed_days);
          const isTodayScheduledClosed =
            closedDays.some((d) => String(d).trim().toLowerCase() === dayKey) ||
            hoursRow[`${dayKey}_open`] !== true;
          if (isTodayScheduledClosed) {
            return reply.code(409).send({
              error: "scheduled_off_day",
              message:
                "Cannot open: today is marked as a scheduled off day. Update your Store Schedule to mark today as open.",
            });
          }
          if (!isWithinOperatingHours(hoursRow, dayOfWeek, minutesSinceMidnight)) {
            return reply.code(409).send({
              error: "outside_operating_hours",
              message:
                "Your store cannot be turned ON because it is currently outside its scheduled operating hours. To open your store now, please update your Store Schedule first.",
            });
          }
        }

        let mergedManualCloseUntil: string | null = null;
        if (openingStore) {
          mergedManualCloseUntil = null;
        } else if (closingStore && body.closure_type === "today") {
          // Backend is authoritative for "close for today": compute the reopen instant from the
          // current schedule server-side instead of trusting a client-precomputed value. Clients
          // (merchant app, partner site) have independently shipped this wrong before by always
          // skipping to a future calendar day, even when today's own slot hadn't started yet.
          const hoursRowsForClose = await sql`
            SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
          `;
          const hoursRowForClose = hoursRowsForClose[0] as Record<string, unknown> | undefined;
          if (hoursRowForClose) {
            const nowRefForClose = new Date();
            const { dayOfWeek: closeDayOfWeek, minutesSinceMidnight: closeMinutesSinceMidnight } = nowInStoreTz();
            const next = isBeforeFirstSlotToday(hoursRowForClose, closeDayOfWeek, closeMinutesSinceMidnight)
              ? getNextOpenIso(hoursRowForClose, closeDayOfWeek, closeMinutesSinceMidnight, nowRefForClose)
              : getNextOpenIsoAfterIstCalendarDay(hoursRowForClose, closeDayOfWeek, nowRefForClose);
            mergedManualCloseUntil = next ?? getNextOpenDayStartIso(hoursRowForClose, closeDayOfWeek, nowRefForClose);
          } else {
            mergedManualCloseUntil = null;
          }
        } else if (closingStore && body.manual_close_until != null && String(body.manual_close_until).trim() !== "") {
          const raw = String(body.manual_close_until).trim();
          const normalized = raw.replace(" ", "T");
          // Bare datetimes are IST wall time (parity with Partner Site + dashboard portal).
          const parsed =
            !/[zZ]$/.test(normalized) &&
            !/[+-]\d{2}:?\d{2}$/.test(normalized) &&
            /^\d{4}-\d{2}-\d{2}T/.test(normalized)
              ? new Date(`${normalized}+05:30`)
              : new Date(normalized);
          mergedManualCloseUntil = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
        } else if (
          closingStore &&
          Object.prototype.hasOwnProperty.call(body, "manual_close_until") &&
          (body.manual_close_until == null || String(body.manual_close_until).trim() === "")
        ) {
          // Explicit indefinite / "until I turn ON" — do not invent next-open until.
          mergedManualCloseUntil = null;
        } else if (closingStore && String((body as { closure_type?: string }).closure_type || "") === "manual_hold") {
          mergedManualCloseUntil = null;
        } else if (availRow?.manual_close_until != null) {
          const raw = availRow.manual_close_until instanceof Date ? availRow.manual_close_until.toISOString() : String(availRow.manual_close_until).trim();
          mergedManualCloseUntil = raw || null;
        } else if (closingStore) {
          // Plain manual OFF (no explicit `manual_close_until`, not "close for today"):
          // treat it as a TEMPORARY close and reopen at the next scheduled slot start, so
          // the store keeps following its schedule. A close that must NOT auto-reopen is
          // expressed separately via the "Manual activation lock" (block_auto_open), which
          // the schedule engine honours before this. Only when there is no computable next
          // opening (24h store / no slots) does this stay null → "closed until reopened".
          const hoursRowsForClose = await sql`
            SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
          `;
          const hoursRowForClose = hoursRowsForClose[0] as Record<string, unknown> | undefined;
          if (hoursRowForClose) {
            const nowRefForClose = new Date();
            const { dayOfWeek: closeDayOfWeek, minutesSinceMidnight: closeMinutesSinceMidnight } = nowInStoreTz();
            mergedManualCloseUntil =
              getNextOpenIso(hoursRowForClose, closeDayOfWeek, closeMinutesSinceMidnight, nowRefForClose) ??
              getNextOpenDayStartIso(hoursRowForClose, closeDayOfWeek, nowRefForClose);
          }
        }
        const mergedCloseReason =
          openingStore ? null
          : closingStore && body.manual_close_reason != null && String(body.manual_close_reason).trim() !== ""
            ? String(body.manual_close_reason).trim()
            : (availRow?.close_reason != null && String(availRow.close_reason).trim() !== "" ? String(availRow.close_reason).trim() : null);
        const mergedRestrictionType = openingStore ? null : (availRow?.restriction_type ?? null);

        let lastToggledAt: Date | null = null;
        let lastToggledAtIso: string | null = null;
        let lastToggledByName: string | null = null;
        if (closingStore) {
          lastToggledAt = new Date();
          lastToggledAtIso = lastToggledAt.toISOString();
          lastToggledByName = parentRow?.owner_name ?? parentRow?.parent_name ?? "Store owner";
        } else if (availRow && (availRow as any).last_toggled_at != null) {
          const raw = (availRow as any).last_toggled_at;
          lastToggledAt = raw instanceof Date ? raw : new Date(String(raw).trim().replace(" ", "T"));
          lastToggledAtIso = Number.isNaN(lastToggledAt.getTime()) ? null : lastToggledAt.toISOString();
          lastToggledByName = (availRow as any).last_toggled_by_name != null ? String((availRow as any).last_toggled_by_name) : null;
        }

        // Update merchant_stores when is_open was provided — keep is_active, is_accepting_orders, is_available in sync.
        if (hasIsOpen) {
          const accepting = body.is_open === true;
          await syncMerchantStoresOnlineTriple(sql, storeId, accepting, { parentId });
        }

        // IMPORTANT: Vacation / scheduled-closure mode must not be bypassed by manual open.
        // Merchants should cancel scheduled off via the dedicated endpoint, not by toggling online.

        // Upsert merchant_store_availability with merged values (including clearing manual_close_until when opening).
        const currentAvailable = availRow?.is_available ?? true;
        const currentAvailAccepting = availRow?.is_accepting_orders ?? true;
        const currentAutoOpen = availRow?.auto_open_from_schedule ?? true;
        const currentBlockAutoOpen = availRow?.block_auto_open ?? false;

        const mergedAvailable = nextAvailable ?? currentAvailable;
        const mergedAvailAccepting = nextAccepting ?? currentAvailAccepting;
        // When only closing (no auto_open_from_schedule in body), never turn off automation toggle.
        const mergedAutoOpen =
          closingStore && !hasAutoOpen ? currentAutoOpen : (nextAutoOpen ?? currentAutoOpen);
        const explicitIndefiniteClose =
          closingStore &&
          !mergedManualCloseUntil &&
          (Object.prototype.hasOwnProperty.call(body, "manual_close_until") ||
            String((body as { closure_type?: string }).closure_type || "") === "manual_hold");
        // Partner Site "Until I manually turn it ON" sets block_auto_open; merchant app MANUAL close
        // sends manual_close_until: null — same hold semantics.
        const mergedBlockAutoOpen = openingStore
          ? false
          : (nextBlockAutoOpen ?? (explicitIndefiniteClose ? true : currentBlockAutoOpen));

        const nowIso = new Date().toISOString();
        const updatedBy = (parentRow?.owner_email ?? "Store owner") as string;
        const updatedById = parentId;
        const lastToggledById = String(parentId);

        if (availRow) {
          if (hasIsOpen) {
            if (openingStore) {
              await sql`
                UPDATE merchant_store_availability
                SET is_available = TRUE, is_accepting_orders = TRUE,
                    unavailable_reason = NULL, close_reason = NULL, auto_unavailable_at = NULL, auto_available_at = ${nowIso},
                    manual_close_until = NULL,
                    block_auto_open = FALSE,
                    is_manual_override = FALSE,
                    manual_override_at = NULL,
                    schedule_end_prompted_at = NULL,
                    schedule_end_prompt_expires_at = NULL,
                    auto_off_reason = NULL,
                    last_auto_action_at = NULL,
                    last_toggle_type = 'MANUAL_OPEN', restriction_type = NULL,
                    updated_by = ${updatedBy}, updated_by_id = ${updatedById},
                    last_toggled_by_name = ${parentRow?.owner_name ?? parentRow?.parent_name ?? "Store owner"},
                    last_toggled_by_email = ${parentRow?.owner_email ?? null}, last_toggled_by_id = ${lastToggledById},
                    last_toggled_at = ${nowIso}, updated_at = NOW()
                WHERE store_id = ${storeId}
              `;
            } else {
              // Prefer the merchant-chosen reason; only fall back when none was provided.
              const closeReasonText =
                mergedCloseReason ||
                (mergedManualCloseUntil ? "Temporarily closed" : "Closed until manually reopened");
              const unavailReason = mergedManualCloseUntil ? "manual_close" : "manual_indefinite";
              await sql`
                UPDATE merchant_store_availability
                SET is_available = FALSE, is_accepting_orders = FALSE,
                    unavailable_reason = ${unavailReason}, close_reason = ${closeReasonText},
                    auto_unavailable_at = ${nowIso}, auto_available_at = NULL,
                    manual_close_until = ${mergedManualCloseUntil}, last_toggle_type = 'MANUAL_CLOSE', restriction_type = 'manual',
                    block_auto_open = ${mergedBlockAutoOpen},
                    is_manual_override = FALSE, manual_override_at = NULL,
                    schedule_end_prompted_at = NULL, schedule_end_prompt_expires_at = NULL,
                    auto_off_reason = NULL, last_auto_action_at = NULL,
                    updated_by = ${updatedBy}, updated_by_id = ${updatedById},
                    last_toggled_by_name = ${lastToggledByName}, last_toggled_by_email = ${parentRow?.owner_email ?? null},
                    last_toggled_by_id = ${lastToggledById}, last_toggled_at = ${lastToggledAtIso}, updated_at = NOW()
                WHERE store_id = ${storeId}
              `;
            }
          } else {
            await sql`
              UPDATE merchant_store_availability
              SET auto_open_from_schedule = ${mergedAutoOpen}, block_auto_open = ${mergedBlockAutoOpen}, updated_at = NOW()
              WHERE store_id = ${storeId}
            `;
          }
        } else {
          const closeReasonText = closingStore
            ? mergedCloseReason ||
              (mergedManualCloseUntil ? "Temporarily closed" : "Closed until manually reopened")
            : null;
          const unavailReason = closingStore ? (mergedManualCloseUntil ? "manual_close" : "manual_indefinite") : null;
          await sql`
            INSERT INTO merchant_store_availability (
              store_id, is_available, is_accepting_orders, auto_open_from_schedule, block_auto_open,
              manual_close_until, close_reason, restriction_type,
              unavailable_reason, auto_unavailable_at, auto_available_at, last_toggle_type,
              is_manual_override, manual_override_at, schedule_end_prompted_at, schedule_end_prompt_expires_at,
              auto_off_reason, last_auto_action_at,
              updated_by, updated_by_id, last_toggled_by_name, last_toggled_by_email, last_toggled_by_id, last_toggled_at, updated_at
            )
            VALUES (
              ${storeId}, ${mergedAvailable}, ${mergedAvailAccepting}, ${mergedAutoOpen}, ${mergedBlockAutoOpen},
              ${mergedManualCloseUntil}, ${closeReasonText}, ${mergedRestrictionType},
              ${unavailReason}, ${closingStore ? nowIso : null}, ${openingStore ? nowIso : null},
              ${openingStore ? "MANUAL_OPEN" : closingStore ? "MANUAL_CLOSE" : null},
              ${false},
              ${null},
              ${null},
              ${null},
              ${null},
              ${null},
              ${updatedBy}, ${updatedById},
              ${openingStore ? (parentRow?.owner_name ?? parentRow?.parent_name ?? "Store owner") : (closingStore ? lastToggledByName : null)},
              ${parentRow?.owner_email ?? null}, ${lastToggledById},
              ${closingStore ? lastToggledAtIso : (openingStore ? nowIso : null)}, NOW()
            )
            ON CONFLICT (store_id) DO UPDATE SET
              is_available = EXCLUDED.is_available,
              is_accepting_orders = EXCLUDED.is_accepting_orders,
              auto_open_from_schedule = EXCLUDED.auto_open_from_schedule,
              block_auto_open = EXCLUDED.block_auto_open,
              manual_close_until = EXCLUDED.manual_close_until,
              close_reason = EXCLUDED.close_reason,
              restriction_type = EXCLUDED.restriction_type,
              unavailable_reason = EXCLUDED.unavailable_reason,
              auto_unavailable_at = EXCLUDED.auto_unavailable_at,
              auto_available_at = EXCLUDED.auto_available_at,
              last_toggle_type = EXCLUDED.last_toggle_type,
              is_manual_override = EXCLUDED.is_manual_override,
              manual_override_at = EXCLUDED.manual_override_at,
              schedule_end_prompted_at = EXCLUDED.schedule_end_prompted_at,
              schedule_end_prompt_expires_at = EXCLUDED.schedule_end_prompt_expires_at,
              auto_off_reason = EXCLUDED.auto_off_reason,
              last_auto_action_at = EXCLUDED.last_auto_action_at,
              updated_by = EXCLUDED.updated_by,
              updated_by_id = EXCLUDED.updated_by_id,
              last_toggled_by_name = EXCLUDED.last_toggled_by_name,
              last_toggled_by_email = EXCLUDED.last_toggled_by_email,
              last_toggled_by_id = EXCLUDED.last_toggled_by_id,
              last_toggled_at = EXCLUDED.last_toggled_at,
              updated_at = NOW()
          `;
        }

        // Note: scheduled off is not cleared by manual open (vacation mode cannot be bypassed).

        if (hasIsOpen) {
          const statusAction = body.is_open === true ? "manual_open" : "manual_close";
          const performedName = closingStore ? lastToggledByName : (parentRow?.owner_name ?? parentRow?.parent_name ?? "Store owner");
          await sql`
            INSERT INTO merchant_store_status_log (store_id, action, restriction_type, performed_by_id, performed_by_email, performed_by_name, close_reason)
            VALUES (${storeId}, ${statusAction}, ${mergedRestrictionType}, ${String(parentId)}, ${parentRow?.owner_email ?? null}, ${performedName}, ${closingStore ? mergedCloseReason : null})
          `;
          const newStatus = body.is_open === true ? "OPEN" : "CLOSED";
          const previousStatus = body.is_open === true ? "CLOSED" : "OPEN";
          const reason = body.is_open === true ? "manual_open" : (mergedManualCloseUntil ? "manual_close" : "manual_indefinite");
          await emitStoreStatusChanged(sql, storeId, previousStatus, newStatus, reason, "MANUAL", req.log);
          try {
            const {
              ensureWaitingForOrderInbox,
              deleteWaitingForOrderInbox,
            } = await import("../../lib/merchant-waiting-for-order.js");
            if (body.is_open === true) {
              await ensureWaitingForOrderInbox(storeId);
            } else {
              await deleteWaitingForOrderInbox(storeId);
            }
          } catch (e) {
            req.log.warn({ err: e, storeId }, "waiting_for_order_inbox_sync_failed");
          }
          try {
            await runStoreScheduleTickForStore(storeId, req.log);
          } catch (e) {
            req.log.warn({ err: e, storeId }, "store_schedule_tick_after_status_patch_failed");
          }
        }
        const auditCtx = getAuditContext(req, parentRow, parentId);
        await insertAuditLog(
          sql,
          "STORE",
          storeId,
          "UPDATE",
          auditCtx,
          "store_status",
          {
            is_accepting_orders: storeRow.is_accepting_orders === true,
            is_available: currentAvailable,
            auto_open_from_schedule: currentAutoOpen,
            block_auto_open: currentBlockAutoOpen,
            manual_close_until: currentManualCloseUntil,
            restriction_type: currentRestrictionType,
          },
          {
            is_accepting_orders: mergedAvailAccepting,
            is_available: mergedAvailable,
            auto_open_from_schedule: mergedAutoOpen,
            block_auto_open: mergedBlockAutoOpen,
            manual_close_until: mergedManualCloseUntil,
            restriction_type: mergedRestrictionType,
          },
          { section: "store_operations", route: "PATCH /merchant-partner/stores/:storeId/status" }
        );

        const rawClosedAt = closingStore ? lastToggledAt : (availRow as any)?.last_toggled_at;
        const closedAtIso =
          mergedManualCloseUntil != null && rawClosedAt != null
            ? (rawClosedAt instanceof Date ? rawClosedAt : new Date(rawClosedAt)).toISOString()
            : null;
        const closedByLabel =
          mergedManualCloseUntil != null ? (closingStore ? lastToggledByName : (availRow as any)?.last_toggled_by_name ?? null) : null;

        const freshStoreRows = await sql`
          SELECT operational_status, is_active, is_accepting_orders, is_available, approval_status, delisted_at
          FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        const hoursRowsPatch = await sql`
          SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
        `;
        const { dayOfWeek: patchDow, minutesSinceMidnight: patchMin } = nowInStoreTz();
        const hoursRowPatch = hoursRowsPatch[0] as Record<string, unknown> | undefined;
        const withinHoursPatch = hoursRowPatch
          ? isWithinOperatingHours(hoursRowPatch, patchDow, patchMin)
          : false;
        const freshStore = freshStoreRows[0] as {
          operational_status?: string | null;
          is_active?: boolean | null;
          is_accepting_orders?: boolean | null;
          is_available?: boolean | null;
          approval_status?: string | null;
          delisted_at?: Date | string | null;
        } | undefined;
        const patchEffectiveOp = effectiveOperationalFromStoreRow(freshStore);
        const patchSurfaceOnline = computeSurfaceLiveStatus(patchEffectiveOp, withinHoursPatch) === "OPEN";

        return reply.send({
          store_id: storeId,
          is_open: patchSurfaceOnline,
          is_accepting_orders: mergedAvailAccepting,
          is_available: mergedAvailable,
          auto_open_from_schedule: mergedAutoOpen,
          block_auto_open: mergedBlockAutoOpen,
          manual_close_until: mergedManualCloseUntil,
          manual_close_reason: mergedCloseReason,
          manual_close_start_at: closedAtIso,
          closed_by: closedByLabel,
          restriction_type: mergedRestrictionType,
        });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not update store status";
          const storeIdForLog = Number((req.params as { storeId?: string })?.storeId) || 0;
          req.log.error({ err, storeId: storeIdForLog }, "PATCH store status failed");
          return reply.code(500).send({ error: "server_error", message: msg });
        }
      });

      /** GET /merchant-partner/stores/:storeId/status/weekly — last 7 days orders per day for weekly graph. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/status/weekly",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata')::text AS day,
                   COUNT(*)::int AS orders_count
            FROM orders_food
            WHERE merchant_store_id = ${storeId}
              AND created_at >= (CURRENT_DATE - INTERVAL '6 days')::timestamptz
              AND created_at < (CURRENT_DATE + INTERVAL '1 day')::timestamptz
            GROUP BY DATE(created_at AT TIME ZONE 'Asia/Kolkata')
            ORDER BY day ASC
          `;
          const countByDay = new Map<string, number>();
          for (const r of rows as unknown as Array<{ day: string; orders_count: number }>) {
            if (r?.day) countByDay.set(r.day, Number(r.orders_count) || 0);
          }
          const days: Array<{ date: string; label: string; orders_count: number }> = [];
          const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const dateStr = `${y}-${m}-${day}`;
            const dayName = dayLabels[d.getDay()];
            const shortDate = `${d.getDate()} ${m}`;
            days.push({
              date: dateStr,
              label: `${dayName} ${shortDate}`,
              orders_count: countByDay.get(dateStr) ?? 0,
            });
          }
          return reply.send({ days });
        }
      );

      /** GET /merchant-partner/stores/:storeId/growth/summary — KPIs + chart buckets for period=today|yesterday|week|month|alltime (IST). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { period?: string } }>(
        "/stores/:storeId/growth/summary",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const raw = String(req.query?.period ?? "today").toLowerCase();
          const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";

          type B = { key: string; label: string; orders_count: number };

          const slotLabels8 = ["12–3am", "3–6am", "6–9am", "9–12pm", "12–3pm", "3–6pm", "6–9pm", "9–12am"];

          const istDates = await sql`
            SELECT
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today,
              ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')::date AS yesterday,
              date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date AS week_start,
              date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date AS month_start
          `;
          const ist = istDates[0] as {
            today: string | Date;
            yesterday: string | Date;
            week_start: string | Date;
            month_start: string | Date;
          };
          const ymd = (v: string | Date) => String(v).slice(0, 10);
          const todayYmd = ymd(ist.today);
          const yesterdayYmd = ymd(ist.yesterday);
          const weekStartYmd = ymd(ist.week_start);
          const monthStartYmd = ymd(ist.month_start);

          let rangeStart = todayYmd;
          let rangeEnd = todayYmd;
          if (period === "yesterday") {
            rangeStart = yesterdayYmd;
            rangeEnd = yesterdayYmd;
          } else if (period === "week") {
            rangeStart = weekStartYmd;
          } else if (period === "month") {
            rangeStart = monthStartYmd;
          } else if (period === "alltime") {
            rangeStart = "1970-01-01";
          }

          const totals = {
            total_orders: await countMerchantDeliveredOrdersIst(sql, storeId, rangeStart, rangeEnd),
            total_sales: await sumMerchantLedgerEarningsIst(sql, storeId, rangeStart, rangeEnd),
          };

          let buckets: B[] = [];

          if (period === "today") {
            const br = await sql`
              SELECT (FLOOR(EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata')) / 3))::int AS slot,
                     COUNT(*)::int AS orders_count
              FROM orders_food
              WHERE merchant_store_id = ${storeId}
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date =
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
              GROUP BY 1 ORDER BY 1
            `;
            const byS = new Map(
              (br as unknown as Array<{ slot: number; orders_count: number }>).map((r) => [
                Number(r.slot),
                Number(r.orders_count) || 0,
              ])
            );
            for (let s = 0; s < 8; s++) {
              buckets.push({ key: `t-${s}`, label: slotLabels8[s] ?? String(s), orders_count: byS.get(s) ?? 0 });
            }
          } else if (period === "yesterday") {
            const br = await sql`
              SELECT (FLOOR(EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata')) / 3))::int AS slot,
                     COUNT(*)::int AS orders_count
              FROM orders_food
              WHERE merchant_store_id = ${storeId}
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date =
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day'
              GROUP BY 1 ORDER BY 1
            `;
            const byS = new Map(
              (br as unknown as Array<{ slot: number; orders_count: number }>).map((r) => [
                Number(r.slot),
                Number(r.orders_count) || 0,
              ])
            );
            for (let s = 0; s < 8; s++) {
              buckets.push({ key: `y-${s}`, label: slotLabels8[s] ?? String(s), orders_count: byS.get(s) ?? 0 });
            }
          } else if (period === "week") {
            const br = await sql`
              SELECT gs::date AS d,
                     trim(to_char(gs::date, 'Dy')) AS label,
                     COALESCE(o.c, 0)::int AS orders_count
              FROM generate_series(
                date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date,
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
                INTERVAL '1 day'
              ) AS gs
              LEFT JOIN (
                SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*)::int AS c
                FROM orders_food
                WHERE merchant_store_id = ${storeId}
                  AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >=
                      date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date
                  AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <=
                      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                GROUP BY 1
              ) o ON o.d = gs::date
              ORDER BY gs
            `;
            const rows = br as unknown as Array<{ d: string | Date; label: string; orders_count: number }>;
            for (const r of rows) {
              buckets.push({
                key: String(r.d),
                label: String(r.label || "—").replace(/\.$/, ""),
                orders_count: Number(r.orders_count) || 0,
              });
            }
          } else if (period === "month") {
            const br = await sql`
              SELECT gs::date AS d,
                     (EXTRACT(DAY FROM gs::date))::int::text AS label,
                     COALESCE(o.c, 0)::int AS orders_count
              FROM generate_series(
                date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date,
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
                INTERVAL '1 day'
              ) AS gs
              LEFT JOIN (
                SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*)::int AS c
                FROM orders_food
                WHERE merchant_store_id = ${storeId}
                  AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >=
                      date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date
                  AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <=
                      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                GROUP BY 1
              ) o ON o.d = gs::date
              ORDER BY gs
            `;
            const rows = br as unknown as Array<{ d: string | Date; label: string; orders_count: number }>;
            for (const r of rows) {
              buckets.push({
                key: String(r.d),
                label: String(r.label || "—"),
                orders_count: Number(r.orders_count) || 0,
              });
            }
          } else {
            const br = await sql`
              SELECT gs::date AS m, COALESCE(o.c, 0)::int AS orders_count
              FROM generate_series(
                (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp) - INTERVAL '11 months')::date,
                date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::date,
                INTERVAL '1 month'
              ) AS gs
              LEFT JOIN (
                SELECT date_trunc('month', (created_at AT TIME ZONE 'Asia/Kolkata'))::date AS m,
                       COUNT(*)::int AS c
                FROM orders_food
                WHERE merchant_store_id = ${storeId}
                GROUP BY 1
              ) o ON o.m = gs::date
              ORDER BY gs
            `;
            const rows = br as unknown as Array<{ m: string | Date; orders_count: number }>;
            const fmt = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
            for (const r of rows) {
              const dt = typeof r.m === "string" ? new Date(r.m + "T12:00:00Z") : r.m;
              const label = Number.isFinite(dt.getTime()) ? fmt.format(dt) : "—";
              buckets.push({
                key: String(r.m),
                label,
                orders_count: Number(r.orders_count) || 0,
              });
            }
          }

          /** Rolling last 7 calendar days (IST), for the weekly activity chart (independent of period). */
          const wk = await sql`
            SELECT gs::date AS d,
                   trim(to_char(gs::date, 'Dy')) AS label,
                   COALESCE(o.c, 0)::int AS orders_count
            FROM generate_series(
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '6 days',
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
              INTERVAL '1 day'
            ) AS gs
            LEFT JOIN (
              SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*)::int AS c
              FROM orders_food
              WHERE merchant_store_id = ${storeId}
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >=
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '6 days'
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <=
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
              GROUP BY 1
            ) o ON o.d = gs::date
            ORDER BY gs
          `;
          const weeklyBuckets: B[] = (
            wk as unknown as Array<{ d: string | Date; label: string; orders_count: number }>
          ).map((r) => ({
            key: String(r.d),
            label: String(r.label || "—").replace(/\.$/, ""),
            orders_count: Number(r.orders_count) || 0,
          }));

          return reply.send({
            period,
            total_orders: totals.total_orders,
            total_sales: totals.total_sales,
            buckets,
            weekly_buckets: weeklyBuckets,
          });
        }
      );

      /** GET /merchant-partner/stores/:storeId/growth/business-insights — KPIs + compare + dual series for Business tab (IST). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { period?: string } }>(
        "/stores/:storeId/growth/business-insights",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const raw = String(req.query?.period ?? "today").toLowerCase();
          const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";
          const body = await buildGrowthBusinessInsights(sql, storeId, period);
          return reply.send(body);
        }
      );

      /** GET /merchant-partner/stores/:storeId/growth/live-preview — full Live preview dashboard metrics (IST). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { period?: string } }>(
        "/stores/:storeId/growth/live-preview",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const raw = String(req.query?.period ?? "today").toLowerCase();
          const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";
          const body = await buildLivePreviewInsights(sql, storeId, period);
          return reply.send(body);
        }
      );

      /** GET /merchant-partner/stores/:storeId/growth/quick-insights — at-a-glance KPIs for Quick tab (IST). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { period?: string } }>(
        "/stores/:storeId/growth/quick-insights",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const raw = String(req.query?.period ?? "today").toLowerCase();
          const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";
          const body = await buildGrowthQuickInsights(sql, storeId, period);
          return reply.send(body);
        }
      );

      /** GET /merchant-partner/stores/:storeId/growth/kitchen-insights — prep performance for Kitchen tab (IST). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { period?: string } }>(
        "/stores/:storeId/growth/kitchen-insights",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const raw = String(req.query?.period ?? "today").toLowerCase();
          const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";
          const body = await buildGrowthKitchenInsights(sql, storeId, period);
          return reply.send(body);
        }
      );

      /** GET /merchant-partner/stores/:storeId/market/insights — locality + competitor affinity (orders_core). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { scope?: string; limit?: string } }>(
        "/stores/:storeId/market/insights",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const limitRaw = parseInt(req.query?.limit ?? "10", 10);
          const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 20) : 10;
          const body = await loadMerchantMarketInsights(sql, storeId, req.query?.scope, limit);
          if (!body) return reply.code(404).send({ error: "store_not_found" });
          return reply.send(body);
        }
      );

      /** GET /merchant-partner/stores/:storeId/status/history — recent status log (open/close/scheduled). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>(
        "/stores/:storeId/status/history",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const limit = Math.min(Number(req.query?.limit) || 20, 50);
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const rows = await sql`
            SELECT id, action, restriction_type, performed_by_name, close_reason, created_at
            FROM merchant_store_status_log
            WHERE store_id = ${storeId}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
          const history = (rows as unknown as Array<{
            id: number;
            action: string;
            restriction_type: string | null;
            performed_by_name: string | null;
            close_reason: string | null;
            created_at: Date | string | null;
          }>).map((r) => {
            const raw = r.created_at;
            let at: string;
            if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
              at = raw.toISOString();
            } else if (raw != null && typeof raw === "string" && raw.trim() !== "") {
              const d = new Date(raw.trim());
              at = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            } else if (typeof raw === "number" && Number.isFinite(raw)) {
              at = raw > 1e12 ? new Date(raw).toISOString() : new Date(raw * 1000).toISOString();
            } else {
              at = new Date().toISOString();
            }
            return {
              id: r.id,
              action: r.action ?? "status_change",
              restriction_type: r.restriction_type ?? null,
              performed_by: r.performed_by_name ?? null,
              reason: r.close_reason ?? null,
              at,
            };
          });
          return reply.send({ history });
        }
      );

      /** GET /merchant-partner/stores/:storeId/ratings/complaints — list low-rated reviews (complaints) for this store. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/ratings/complaints",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          // Complaints = ratings 1–3 for this merchant store.
          const rows = await sql`
            SELECT id,
                   store_id,
                   order_id,
                   customer_id,
                   rating,
                   review_title,
                   review_text,
                   merchant_response,
                   merchant_responded_at,
                   is_flagged,
                   created_at
            FROM merchant_store_ratings
            WHERE store_id = ${storeId}
              AND rating <= 3
            ORDER BY created_at DESC
            LIMIT 200
          `;

          const data = (rows as unknown as Array<{
            id: number;
            store_id: number;
            order_id: number | null;
            customer_id: number | null;
            rating: number;
            review_title: string | null;
            review_text: string | null;
            merchant_response: string | null;
            merchant_responded_at: Date | string | null;
            is_flagged: boolean | null;
            created_at: Date | string;
          }>).map((r) => ({
            id: r.id,
            overallRating: r.rating,
            reviewTitle: r.review_title,
            reviewText: r.review_text,
            replyText: r.merchant_response,
            repliedAt:
              r.merchant_responded_at instanceof Date
                ? r.merchant_responded_at.toISOString()
                : r.merchant_responded_at
                ? String(r.merchant_responded_at)
                : null,
            isFlagged: r.is_flagged === true,
            createdAt:
              r.created_at instanceof Date
                ? r.created_at.toISOString()
                : String(r.created_at),
          }));

          return reply.send({ success: true, data });
        }
      );

      /** GET /merchant-partner/stores/:storeId/ratings/reviews — list reviews with optional date & rating filters. */
      protectedApp.get<{
        Params: { storeId: string };
        Querystring: { from?: string; to?: string; minRating?: string; orderId?: string };
      }>("/stores/:storeId/ratings/reviews", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const minRating = req.query.minRating ? Number(req.query.minRating) : null;
        const orderIdFilter = req.query.orderId ? Number(req.query.orderId) : null;
        const from =
          req.query.from && !Number.isNaN(Date.parse(req.query.from))
            ? new Date(req.query.from)
            : null;
        const to =
          req.query.to && !Number.isNaN(Date.parse(req.query.to))
            ? new Date(req.query.to)
            : null;

        const rows = await sql`
          SELECT msr.id,
                 msr.store_id,
                 msr.order_id,
                 msr.customer_id,
                 msr.rating,
                 msr.review_title,
                 msr.review_text,
                 msr.merchant_response,
                 msr.merchant_responded_at,
                 msr.created_at,
                 c.full_name AS customer_name,
                 oc.formatted_order_id
          FROM merchant_store_ratings msr
          LEFT JOIN customers c ON c.id = msr.customer_id
          LEFT JOIN orders_core oc ON oc.id = msr.order_id
          WHERE msr.store_id = ${storeId}
          ORDER BY msr.created_at DESC
          LIMIT 200
        `;

        const typedRows = rows as unknown as Array<{
          id: number;
          store_id: number;
          order_id: number | null;
          customer_id: number | null;
          rating: number;
          review_title: string | null;
          review_text: string | null;
          merchant_response: string | null;
          merchant_responded_at: Date | string | null;
          created_at: Date | string;
          customer_name: string | null;
          formatted_order_id: string | null;
        }>;

        const filteredRows = typedRows.filter((r) => {
          if (
            orderIdFilter != null &&
            Number.isFinite(orderIdFilter) &&
            Number(r.order_id) !== orderIdFilter
          ) {
            return false;
          }
          const created =
            r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at));
          if (Number.isNaN(created.getTime())) return false;

          if (!orderIdFilter) {
            if (from && created < from) return false;
            if (to && created > to) return false;
          }
          if (minRating != null && Number.isFinite(minRating) && r.rating < minRating) {
            return false;
          }
          return true;
        });

        const data = filteredRows.map((r) => ({
          id: r.id,
          orderId: r.order_id,
          overallRating: r.rating,
          reviewTitle: r.review_title,
          reviewText: r.review_text,
          replyText: r.merchant_response,
          repliedAt:
            r.merchant_responded_at instanceof Date
              ? r.merchant_responded_at.toISOString()
              : r.merchant_responded_at ? String(r.merchant_responded_at) : null,
          createdAt:
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
          customerName: r.customer_name != null ? String(r.customer_name).trim() || null : null,
          formattedOrderId: r.formatted_order_id != null ? String(r.formatted_order_id).trim() || null : null,
        }));

        return reply.send({ success: true, data });
      });

      /** POST /merchant-partner/stores/:storeId/ratings/reviews/:reviewId/reply — save merchant reply to a review. */
      protectedApp.post<{
        Params: { storeId: string; reviewId: string };
        Body: { replyText: string };
      }>("/stores/:storeId/ratings/reviews/:reviewId/reply", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const reviewId = Number(req.params.reviewId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        if (!Number.isInteger(reviewId) || reviewId < 1) {
          return reply.code(400).send({ error: "invalid_review_id" });
        }
        const replyText = (req.body?.replyText ?? "").trim();
        if (!replyText) {
          return reply.code(400).send({ error: "empty_reply" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const result = await sql`
          UPDATE merchant_store_ratings
          SET merchant_response = ${replyText},
              merchant_responded_at = now(),
              updated_at = now()
          WHERE id = ${reviewId} AND store_id = ${storeId}
          RETURNING id
        `;
        if (result.length === 0) {
          return reply.code(404).send({ error: "review_not_found" });
        }

        return reply.send({ success: true });
      });

      /** DELETE /merchant-partner/stores/:storeId/ratings/reviews/:reviewId/reply — delete merchant reply for a review. */
      protectedApp.delete<{
        Params: { storeId: string; reviewId: string };
      }>("/stores/:storeId/ratings/reviews/:reviewId/reply", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const reviewId = Number(req.params.reviewId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        if (!Number.isInteger(reviewId) || reviewId < 1) {
          return reply.code(400).send({ error: "invalid_review_id" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const result = await sql`
          UPDATE merchant_store_ratings
          SET merchant_response = NULL,
              merchant_responded_at = NULL,
              updated_at = now()
          WHERE id = ${reviewId} AND store_id = ${storeId}
          RETURNING id
        `;
        if (result.length === 0) {
          return reply.code(404).send({ error: "review_not_found" });
        }

        return reply.send({ success: true });
      });

      /** GET /merchant-partner/stores/:storeId/notifications — list in-app notifications for the store. */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>(
        "/stores/:storeId/notifications",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
          const { getPartnerNotificationsClearedAt } = await import("../../lib/merchant-waiting-for-order.js");
          const clearedAt = await getPartnerNotificationsClearedAt(storeId);
          const rows = clearedAt
            ? await sql`
                SELECT id, store_id, type, title, body, read, order_id, action_url, created_at
                FROM merchant_store_notifications
                WHERE store_id = ${storeId}
                  AND created_at > ${clearedAt}::timestamptz
                ORDER BY created_at DESC
                LIMIT ${limit}
              `
            : await sql`
                SELECT id, store_id, type, title, body, read, order_id, action_url, created_at
                FROM merchant_store_notifications
                WHERE store_id = ${storeId}
                ORDER BY created_at DESC
                LIMIT ${limit}
              `;
          const typedRows = rows as unknown as Array<{
            id: number;
            store_id: number;
            type: string;
            title: string;
            body: string;
            read: boolean;
            order_id: number | null;
            action_url?: string | null;
            created_at: Date | string;
          }>;

          // Heal leftover order inbox rows after accept / deliver / cancel.
          try {
            const candidates = typedRows.filter(
              (r) =>
                String(r.type).toLowerCase() === "order" &&
                r.order_id != null &&
                Number(r.order_id) > 0
            );
            if (candidates.length > 0) {
              const { shouldPurgeOrderNotificationOnList } = await import(
                "../../lib/clear-merchant-order-notifications.js"
              );
              const foodIds = [
                ...new Set(candidates.map((r) => Number(r.order_id)).filter((n) => n > 0)),
              ];
              const foodRows = (await sql`
                SELECT id, order_status FROM orders_food WHERE id = ANY(${foodIds}::bigint[])
              `) as Array<{ id: number; order_status: string | null }>;
              const statusById = new Map(
                foodRows.map((f) => [Number(f.id), String(f.order_status ?? "").trim().toUpperCase()])
              );
              const staleIds = candidates
                .filter((c) =>
                  shouldPurgeOrderNotificationOnList(
                    c.title,
                    statusById.get(Number(c.order_id)) ?? null
                  )
                )
                .map((c) => Number(c.id));
              if (staleIds.length > 0) {
                await sql`
                  DELETE FROM merchant_store_notifications
                  WHERE store_id = ${storeId} AND id = ANY(${staleIds}::bigint[])
                `;
                for (let i = typedRows.length - 1; i >= 0; i--) {
                  if (staleIds.includes(Number(typedRows[i].id))) typedRows.splice(i, 1);
                }
              }
            }
          } catch {
            /* list still returns; purge is best-effort */
          }

          const notifications = typedRows.map((r) => ({
            id: String(r.id),
            store_id: r.store_id,
            type: r.type,
            title: r.title,
            body: r.body,
            read: r.read === true,
            order_id: r.order_id ?? undefined,
            action_url: r.action_url ?? undefined,
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
          }));
          return reply.send({ notifications });
        }
      );

      const WAITING_FOR_ORDER_TITLE = "🟢 Your restaurant is online";

      /** POST …/waiting-for-order/ensure — kept for compat; primary create is on store open. */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/notifications/waiting-for-order/ensure",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { ensureWaitingForOrderInbox } = await import("../../lib/merchant-waiting-for-order.js");
          const result = await ensureWaitingForOrderInbox(storeId);
          if (result.suppressed) return reply.send({ created: false, suppressed: true });
          return reply.send({ id: result.id, created: result.created });
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/notifications/waiting-for-order — remove all waiting-for-order rows (e.g. pipeline no longer idle). */
      protectedApp.delete<{ Params: { storeId: string } }>(
        "/stores/:storeId/notifications/waiting-for-order",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { deleteWaitingForOrderInbox } = await import("../../lib/merchant-waiting-for-order.js");
          const deleted = await deleteWaitingForOrderInbox(storeId);
          return reply.send({ deleted });
        }
      );

      /** GET /merchant-partner/stores/:storeId/holidays — list holidays (default: upcoming scheduled_off days). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { type?: string; from?: string } }>(
        "/stores/:storeId/holidays",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const fromDateStr =
            typeof req.query.from === "string" && req.query.from.trim() !== ""
              ? req.query.from.trim().slice(0, 10)
              : istDateFormatter.format(new Date());
          const typeFilter = typeof req.query.type === "string" && req.query.type.trim() !== "" ? req.query.type.trim() : "scheduled_off";

          const rows = await sql`
            SELECT id,
                   store_id,
                   holiday_name,
                   holiday_type,
                   holiday_date,
                   is_full_day,
                   closed_from,
                   closed_till,
                   closure_reason,
                   created_at
            FROM merchant_store_holidays
            WHERE store_id = ${storeId}
              AND holiday_type = ${typeFilter}
              AND holiday_date >= ${fromDateStr}
            ORDER BY holiday_date ASC, closed_from ASC NULLS FIRST
          `;

          const holidays = (rows as unknown as Array<{
            id: number;
            store_id: number;
            holiday_name: string;
            holiday_type: string | null;
            holiday_date: string | Date;
            is_full_day: boolean | null;
            closed_from: string | null;
            closed_till: string | null;
            closure_reason: string | null;
            created_at: Date | string;
          }>).map((h) => ({
            id: String(h.id),
            store_id: h.store_id,
            holiday_name: h.holiday_name,
            holiday_type: h.holiday_type,
            holiday_date:
              h.holiday_date instanceof Date ? h.holiday_date.toISOString().slice(0, 10) : String(h.holiday_date).slice(0, 10),
            is_full_day: h.is_full_day === true,
            closed_from: h.closed_from,
            closed_till: h.closed_till,
            closure_reason: h.closure_reason,
            created_at: h.created_at instanceof Date ? h.created_at.toISOString() : String(h.created_at),
          }));

          return reply.send({ holidays });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/notifications/:notificationId/read — mark one as read. */
      protectedApp.patch<{ Params: { storeId: string; notificationId: string } }>(
        "/stores/:storeId/notifications/:notificationId/read",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const notificationId = Number(req.params.notificationId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(notificationId) || notificationId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            UPDATE merchant_store_notifications
            SET read = TRUE
            WHERE id = ${notificationId} AND store_id = ${storeId}
          `;
          return reply.send({ ok: true });
        }
      );

      /** POST /merchant-partner/stores/:storeId/notifications/read-all — mark every in-app notification as read for this store. */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/notifications/read-all",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            UPDATE merchant_store_notifications
            SET read = TRUE
            WHERE store_id = ${storeId}
          `;
          return reply.send({ ok: true });
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/notifications — clear every in-app notification for this store. */
      protectedApp.delete<{ Params: { storeId: string } }>(
        "/stores/:storeId/notifications",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const deleted = await sql`
            DELETE FROM merchant_store_notifications
            WHERE store_id = ${storeId}
            RETURNING id
          `;
          try {
            const { markPartnerNotificationsCleared, revokeMerchantInAppNotifications } = await import(
              "../../lib/merchant-waiting-for-order.js"
            );
            await markPartnerNotificationsCleared(storeId);
            await revokeMerchantInAppNotifications(req.auth.sub);
          } catch {
            /* persist-clear is best-effort; rows are already deleted */
          }
          return reply.send({ ok: true, deleted: deleted.length });
        }
      );

      /** POST /merchant-partner/stores/:storeId/push-token — register an Expo push token for background reminders. */
      protectedApp.post<{ Params: { storeId: string }; Body: { token: string; platform?: string } }>(
        "/stores/:storeId/push-token",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const token = String(req.body?.token ?? "").trim();
          if (!token) return reply.code(400).send({ error: "invalid_body", message: "token is required" });
          const platform = req.body?.platform != null ? String(req.body.platform) : null;
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            INSERT INTO merchant_store_push_tokens (store_id, token, platform)
            VALUES (${storeId}, ${token}, ${platform})
            ON CONFLICT (store_id, token) DO UPDATE SET updated_at = NOW()
          `;
          return reply.send({ ok: true });
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/push-token — remove Expo token for this store. */
      protectedApp.delete<{ Params: { storeId: string }; Body: { token?: string } }>(
        "/stores/:storeId/push-token",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const token = String(req.body?.token ?? "").trim();
          if (!token) return reply.code(400).send({ error: "invalid_body", message: "token is required" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            DELETE FROM merchant_store_push_tokens
            WHERE store_id = ${storeId} AND token = ${token}
          `;
          return reply.send({ ok: true });
        }
      );

      /** POST /merchant-partner/push-token/unregister-all — drop token from every mapped store. */
      protectedApp.post<{ Body: { token?: string } }>(
        "/push-token/unregister-all",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const token = String(req.body?.token ?? "").trim();
          if (!token) return reply.code(400).send({ error: "invalid_body", message: "token is required" });
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          await sql`
            DELETE FROM merchant_store_push_tokens mspt
            USING merchant_stores ms
            WHERE mspt.store_id = ms.id
              AND ms.parent_id = ${parentId}
              AND ms.deleted_at IS NULL
              AND mspt.token = ${token}
          `;
          return reply.send({ ok: true });
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/notifications/:notificationId — delete a notification. */
      protectedApp.delete<{ Params: { storeId: string; notificationId: string } }>(
        "/stores/:storeId/notifications/:notificationId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const notificationId = Number(req.params.notificationId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(notificationId) || notificationId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            DELETE FROM merchant_store_notifications
            WHERE id = ${notificationId} AND store_id = ${storeId}
          `;
          return reply.send({ ok: true });
        }
      );

      /**
       * POST /merchant-partner/stores/:storeId/schedule-off
       *
       * Schedule a manual time-off / vacation for the store.
       * Backend owns all logic: it updates merchant_store_availability, inserts a row into
       * merchant_store_status_log, and (optionally) creates a merchant_store_holidays entry.
       *
       * The mobile app only passes the human-readable reason selected by the merchant.
       */
      protectedApp.post<{ Params: { storeId: string }; Body: { reason: string; close_until?: string; permanent?: boolean } }>(
        "/stores/:storeId/schedule-off",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const reason = (req.body?.reason ?? "").trim();
          if (!reason) {
            return reply.code(400).send({ error: "invalid_body", message: "reason is required" });
          }
          const closeUntilRaw = typeof req.body?.close_until === "string" ? req.body.close_until : undefined;
          const startsAtRaw = typeof (req.body as any)?.starts_at === "string" ? String((req.body as any).starts_at) : undefined;
          const endsAtRaw = typeof (req.body as any)?.ends_at === "string" ? String((req.body as any).ends_at) : undefined;
          const permanent = req.body?.permanent === true;

          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

          // Ensure store belongs to this partner
          const storeRows = await sql`
            SELECT id
            FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          // Permanent shutdown: keep existing behavior.
          if (permanent) {
            const restrictionType = "PERMANENT_SHUT";
            await sql`
              UPDATE merchant_store_availability
              SET is_available = FALSE, is_accepting_orders = FALSE,
                  manual_close_until = NULL, restriction_type = ${restrictionType}, updated_at = NOW()
              WHERE store_id = ${storeId}
            `;
            await syncMerchantStoresOnlineTriple(sql, storeId, false);
            await sql`
              INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
              VALUES (
                ${storeId},
                'store',
                'Store marked permanently closed',
                'Your store has been marked as permanently closed.',
                FALSE,
                '/(tabs)/profile/vacation'
              )
            `;
            return reply.send({
              store_id: storeId,
              manual_close_until: null,
              restriction_type: restrictionType,
              reason,
              permanent,
            });
          }

          // Scheduled closure: create a future schedule (does not close store until starts_at).
          const now = new Date();
          const startsAt = startsAtRaw ? new Date(startsAtRaw) : now;
          const endsAt = endsAtRaw
            ? new Date(endsAtRaw)
            : closeUntilRaw
              ? new Date(closeUntilRaw)
              : new Date(now.getTime() + 2 * 60 * 60 * 1000); // default 2h

          if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
            return reply.code(400).send({ error: "invalid_body", message: "starts_at/ends_at are invalid" });
          }

          // Cancel existing open schedule (if any) then insert new one.
          await sql`
            UPDATE merchant_store_scheduled_closures
            SET status = 'cancelled', updated_at = NOW()
            WHERE store_id = ${storeId} AND status IN ('scheduled', 'active')
          `;
          const schedRows = await sql`
            INSERT INTO merchant_store_scheduled_closures (store_id, reason, starts_at, ends_at, status, marked_from)
            VALUES (${storeId}, ${reason}, ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'scheduled', 'merchant_app')
            RETURNING id
          `;
          const schedId = Number((schedRows[0] as any)?.id ?? 0) || null;

          // Create a holiday entry so scheduled off appears in holidays table too.
          // Use Asia/Kolkata calendar date for the holiday_date to match what merchants select.
          const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const startDateStr = istDateFormatter.format(startsAt); // YYYY-MM-DD in IST
          const startTimeStr = startsAt.toISOString().slice(11, 19);
          const endTimeStr = endsAt.toISOString().slice(11, 19);
          const isFullDay = startTimeStr === "00:00:00" && endTimeStr >= "23:59:00";
          await sql`
            INSERT INTO merchant_store_holidays (
              store_id,
              holiday_name,
              holiday_type,
              holiday_date,
              is_full_day,
              closed_from,
              closed_till,
              closure_reason
            )
            VALUES (
              ${storeId},
              'Scheduled off',
              'scheduled_off',
              ${startDateStr},
              ${isFullDay},
              ${startTimeStr},
              ${endTimeStr},
              ${reason}
            )
          `;

          await sql`
            INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
            VALUES (
              ${storeId},
              'store',
              'Scheduled store closure set',
              'Your store closure schedule has been set successfully.',
              FALSE,
              '/(tabs)/profile/vacation'
            )
          `;

          const tokenRows = await sql`
            SELECT token FROM merchant_store_push_tokens WHERE store_id = ${storeId}
          `;
          const tokens = (tokenRows as unknown as Array<{ token: string }>).map((t) => t.token).filter(Boolean);
          if (tokens.length > 0) {
            await sendNotification({
              templateCode: "MERCHANT_SCHEDULED_CLOSURE_SET",
              variables: {
                startTime: new Date().toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                endTime: "later",
              },
              target: { device_tokens: tokens },
              idempotencyKey: `SCHEDULED_CLOSURE_SET:${storeId}:${schedId}`,
              metadata: { url: "/(tabs)/profile/vacation", scheduledClosureId: schedId },
            }).catch(() => undefined);
          }

          // Log the action in merchant_store_status_log for analytics and audit.
          const parentRow = await getParentForAudit(sql, parentId);
          const performedByEmail = parentRow?.owner_email ?? null;
          const performedByName = parentRow?.owner_name ?? null;
          const performedById = String(parentId);
          const statusAction = "scheduled_close";

          await sql`
            INSERT INTO merchant_store_status_log (
              store_id,
              action,
              restriction_type,
              performed_by_id,
              performed_by_email,
              performed_by_name,
              close_reason
            )
            VALUES (
              ${storeId},
              ${statusAction},
              'SCHEDULED',
              ${performedById},
              ${performedByEmail},
              ${performedByName},
              ${reason}
            )
          `;

          return reply.send({
            store_id: storeId,
            manual_close_until: null,
            restriction_type: "SCHEDULED",
            reason,
            permanent,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          });
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/schedule-off — cancel upcoming/active scheduled closure. */
      protectedApp.delete<{ Params: { storeId: string } }>(
        "/stores/:storeId/schedule-off",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores
            WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
            LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          // Remove schedule rows entirely when merchant inactivates (requested behavior).
          await sql`
            DELETE FROM merchant_store_scheduled_closures
            WHERE store_id = ${storeId} AND status IN ('scheduled', 'active')
          `;
          await sql`
            DELETE FROM merchant_store_holidays
            WHERE store_id = ${storeId}
              AND holiday_type = 'scheduled_off'
              AND holiday_date >= CURRENT_DATE
          `;
          await sql`
            INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
            VALUES (
              ${storeId},
              'store',
              'Scheduled closure cancelled',
              'Your scheduled store closure has been cancelled.',
              FALSE,
              '/(tabs)/profile/vacation'
            )
          `;
          return reply.send({ ok: true });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/staff/:staffId — update staff member. */
      protectedApp.patch<{ Params: { storeId: string; staffId: string }; Body: { name?: string; phone_number?: string; role?: string; status?: boolean } }>(
        "/stores/:storeId/staff/:staffId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const staffId = Number(req.params.staffId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(staffId) || staffId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const existingRows = await sql`
            SELECT * FROM store_staff WHERE id = ${staffId} AND store_id = ${storeId} LIMIT 1
          `;
          const existing = existingRows[0] as any;
          if (!existing) return reply.code(404).send({ error: "staff_not_found" });
          const updates: Record<string, any> = {};
          if (typeof req.body.name === "string") updates.name = req.body.name;
          if (typeof req.body.phone_number === "string") updates.phone_number = req.body.phone_number;
          if (typeof req.body.role === "string") updates.role = req.body.role;
          if (typeof req.body.status === "boolean") updates.status = req.body.status;
          if (Object.keys(updates).length === 0) return reply.send(existing);
          updates.updated_at = new Date().toISOString();
          const setClause = Object.keys(updates)
            .map((k, i) => `${k} = $${i + 1}`)
            .join(", ");
          const values = Object.values(updates);
          await sql.unsafe(
            `UPDATE store_staff SET ${setClause} WHERE id = $${values.length + 1} AND store_id = $${values.length + 2}`,
            [...values, staffId, storeId]
          );
          const afterRows = await sql`
            SELECT id, store_id, name, phone_number, role, status, created_at, updated_at
            FROM store_staff WHERE id = ${staffId} AND store_id = ${storeId} LIMIT 1
          `;
          const updated = afterRows[0] as any;
          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "staff",
            existing,
            updated,
            { section: "staff", route: "PATCH /merchant-partner/stores/:storeId/staff/:staffId" }
          );
          return reply.send(updated);
        }
      );

      /** DELETE /merchant-partner/stores/:storeId/staff/:staffId — soft-delete staff. */
      protectedApp.delete<{ Params: { storeId: string; staffId: string } }>(
        "/stores/:storeId/staff/:staffId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const staffId = Number(req.params.staffId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(staffId) || staffId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          const existingRows = await sql`
            SELECT * FROM store_staff WHERE id = ${staffId} AND store_id = ${storeId} LIMIT 1
          `;
          const existing = existingRows[0] as any;
          if (!existing) return reply.code(404).send({ error: "staff_not_found" });
          await sql`
            UPDATE store_staff
            SET status = FALSE, updated_at = NOW()
            WHERE id = ${staffId} AND store_id = ${storeId}
          `;
          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            "UPDATE",
            auditCtx,
            "staff",
            existing,
            { ...existing, status: false },
            { section: "staff", route: "DELETE /merchant-partner/stores/:storeId/staff/:staffId" }
          );
          return reply.send({ ok: true });
        }
      );

      /** GET /merchant-partner/stores/:storeId/sessions — active + recent device sessions. */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId/sessions", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
        const rows = await sql`
          SELECT id, store_id, staff_id, device_type, device_name, ip_address, location,
                 login_time, last_active, is_active
          FROM store_sessions
          WHERE store_id = ${storeId}
          ORDER BY is_active DESC, last_active DESC
          LIMIT 50
        `;
        return reply.send(rows);
      });

      /** POST /merchant-partner/stores/:storeId/sessions/:sessionId/logout — logout specific device. */
      protectedApp.post<{ Params: { storeId: string; sessionId: string } }>(
        "/stores/:storeId/sessions/:sessionId/logout",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const sessionId = Number(req.params.sessionId);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(sessionId) || sessionId < 1) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            UPDATE store_sessions
            SET is_active = FALSE, last_active = NOW()
            WHERE id = ${sessionId} AND store_id = ${storeId}
          `;
          return reply.send({ ok: true });
        }
      );

      /** POST /merchant-partner/stores/:storeId/sessions/logout-all — logout all devices for this store. */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/sessions/logout-all",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });
          await sql`
            UPDATE store_sessions
            SET is_active = FALSE, last_active = NOW()
            WHERE store_id = ${storeId} AND is_active = TRUE
          `;
          return reply.send({ ok: true });
        }
      );

      /** GET /merchant-partner/stores/:storeId/tickets — list tickets for this store (merchant view). */
      protectedApp.get<{
        Params: { storeId: string };
      }>("/stores/:storeId/tickets", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const rows = await sql`
          SELECT id,
                 ticket_id,
                 status,
                 priority,
                 ticket_title,
                 ticket_category,
                 created_at,
                 to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') AS created_at_ist
          FROM unified_tickets
          WHERE merchant_store_id = ${storeId}
            AND merchant_parent_id = ${parentId}
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `;

        const tickets = (rows as any[]).map((t) => ({
          id: t.id as number,
          ticket_id: String(t.ticket_id),
          status: String(t.status),
          priority: String(t.priority),
          ticket_title: String(t.ticket_title),
          ticket_category: String(t.ticket_category),
          created_at:
            t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
          created_at_display: t.created_at_ist ? String(t.created_at_ist) : undefined,
        }));

        return reply.send({ tickets });
      });

      /** POST /merchant-partner/stores/:storeId/tickets — create a unified ticket for this store (merchant-raised). */
      protectedApp.post<{
        Params: { storeId: string };
        Body: {
          section_code?: string;
          ticket_title_id?: number | string | null;
          subject?: string;
          description?: string;
          order_id?: number | null;
          orders_food_id?: number | null;
          formatted_order_id?: string | null;
        };
      }>("/stores/:storeId/tickets", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        req.log.info(
          { storeId, requestId: (req as { id?: string }).id },
          "merchant_partner_create_ticket_start"
        );
        const body = (req.body || {}) as {
          section_code?: string;
          ticket_title_id?: number | string | null;
          subject?: string;
          description?: string;
          order_id?: number | null;
          orders_food_id?: number | null;
          formatted_order_id?: string | null;
        };
        const rawTid = body.ticket_title_id;
        const ticketTitleIdFromBody =
          typeof rawTid === "number" && Number.isInteger(rawTid) && rawTid > 0
            ? rawTid
            : typeof rawTid === "string" && /^\d+$/.test(rawTid.trim())
              ? Number(rawTid.trim())
              : null;
        let sectionCode = String(body.section_code ?? "")
          .trim()
          .toLowerCase();

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id, parent_id
          FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        type MappedConfig = {
          title: string;
          category: string;
          priority: string;
        };
        const mapSection = (code: string): MappedConfig => {
          switch (code) {
            case "orders":
              return { title: "MERCHANT_ORDER_NOT_RECEIVED", category: "ORDER", priority: "HIGH" };
            case "order_timing":
              return { title: "ORDER_DELAYED", category: "DELIVERY", priority: "HIGH" };
            case "payments":
              return { title: "PAYOUT_NOT_RECEIVED", category: "EARNINGS", priority: "URGENT" };
            case "payout_delayed":
              return { title: "PAYOUT_DELAYED", category: "EARNINGS", priority: "URGENT" };
            case "restaurant":
              return { title: "MERCHANT_APP_TECHNICAL_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
            case "address":
              return { title: "STORE_STATUS_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
            case "menu":
              return { title: "MENU_UPDATE_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
            case "taxes":
              return { title: "VERIFICATION_ISSUE", category: "VERIFICATION", priority: "MEDIUM" };
            case "ads":
              return { title: "OTHER", category: "OTHER", priority: "LOW" };
            case "branding":
              return { title: "OTHER", category: "OTHER", priority: "LOW" };
            case "reports":
              return { title: "OTHER", category: "OTHER", priority: "LOW" };
            case "hygiene_audit":
              return { title: "COMPLAINT", category: "COMPLAINT", priority: "MEDIUM" };
            case "outlet_status":
              return { title: "STORE_STATUS_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
            case "other":
            default:
              return { title: "COMPLAINT", category: "COMPLAINT", priority: "MEDIUM" };
          }
        };

        const UNIFIED_CATEGORY_ENUM = new Set([
          "ORDER",
          "PAYMENT",
          "DELIVERY",
          "REFUND",
          "ACCOUNT",
          "TECHNICAL",
          "EARNINGS",
          "VERIFICATION",
          "COMPLAINT",
          "FEEDBACK",
          "OTHER",
        ]);
        /** ticket_titles.intake_unified_category is free text; PG unified_ticket_category is a fixed enum. */
        const INTAKE_CATEGORY_TO_ENUM: Record<string, string> = {
          PROFILE_ISSUE: "TECHNICAL",
          PROFILE: "TECHNICAL",
          STORE_PROFILE: "TECHNICAL",
          RESTAURANT_PROFILE: "TECHNICAL",
          MENU_ISSUE: "TECHNICAL",
        };
        const normalizeUnifiedCategory = (raw: string): string => {
          const key = String(raw ?? "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "_")
            .replace(/[^A-Z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
          if (UNIFIED_CATEGORY_ENUM.has(key)) return key;
          const mapped = INTAKE_CATEGORY_TO_ENUM[key];
          if (mapped && UNIFIED_CATEGORY_ENUM.has(mapped)) return mapped;
          return "OTHER";
        };
        const UNIFIED_PRIORITY_ENUM = new Set(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]);
        const normalizeUnifiedPriority = (raw: string): string => {
          const key = String(raw ?? "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "_");
          if (UNIFIED_PRIORITY_ENUM.has(key)) return key;
          return "MEDIUM";
        };
        const UNIFIED_SERVICE_ENUM = new Set(["FOOD", "PARCEL", "RIDE", "GENERAL"]);
        const normalizeUnifiedServiceType = (raw: string): string => {
          const key = String(raw ?? "").trim().toUpperCase();
          if (UNIFIED_SERVICE_ENUM.has(key)) return key;
          return "GENERAL";
        };

        type HelpTitleRow = {
          id: number;
          group_id: number | null;
          merchant_section_id: string | null;
          intake_unified_title: string | null;
          intake_unified_category: string | null;
          intake_unified_priority: string | null;
          intake_unified_service_type: string | null;
          title_text: string | null;
          /** Tag codes from ticket_title_tags (and legacy tag_id). */
          tag_codes: string[] | null;
        };

        const rowToHelp = (r: Record<string, unknown> | undefined): HelpTitleRow | null => {
          if (!r) return null;
          const rawId = r.id;
          const idNum =
            typeof rawId === "number" && Number.isFinite(rawId)
              ? rawId
              : typeof rawId === "string" && /^\d+$/.test(rawId.trim())
                ? Number(rawId.trim())
                : typeof rawId === "bigint"
                  ? Number(rawId)
                  : NaN;
          if (!Number.isInteger(idNum) || idNum < 1) return null;
          let tag_codes: string[] | null = null;
          const rawCodes = r.help_tag_codes;
          if (Array.isArray(rawCodes) && rawCodes.length > 0) {
            tag_codes = rawCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
          }
          return {
            id: idNum,
            group_id: r.group_id != null ? Number(r.group_id) : null,
            merchant_section_id: r.merchant_section_id != null ? String(r.merchant_section_id).trim() : null,
            intake_unified_title: r.intake_unified_title != null ? String(r.intake_unified_title) : null,
            intake_unified_category: r.intake_unified_category != null ? String(r.intake_unified_category) : null,
            intake_unified_priority: r.intake_unified_priority != null ? String(r.intake_unified_priority) : null,
            intake_unified_service_type: r.intake_unified_service_type != null ? String(r.intake_unified_service_type) : null,
            title_text: r.title_text != null ? String(r.title_text) : null,
            tag_codes: tag_codes?.length ? tag_codes : null,
          };
        };

        let helpRow: HelpTitleRow | null = null;
        if (ticketTitleIdFromBody != null) {
          try {
            const hr = await sql`
              SELECT
                tt.id,
                tt.group_id,
                tt.merchant_section_id,
                tt.intake_unified_title,
                tt.intake_unified_category,
                tt.intake_unified_priority,
                tt.intake_unified_service_type,
                tt.title_text,
                COALESCE(
                  (
                    SELECT array_agg(UPPER(TRIM(tg2.tag_code)) ORDER BY tg2.id)
                    FROM ticket_title_tags ttm
                    INNER JOIN ticket_tags tg2 ON tg2.id = ttm.tag_id
                    WHERE ttm.ticket_title_id = tt.id
                  ),
                  CASE
                    WHEN tt.tag_id IS NOT NULL THEN
                      (SELECT ARRAY[UPPER(TRIM(tg3.tag_code))] FROM ticket_tags tg3 WHERE tg3.id = tt.tag_id LIMIT 1)
                    ELSE NULL
                  END
                ) AS help_tag_codes
              FROM ticket_titles tt
              WHERE tt.id = ${ticketTitleIdFromBody}
                AND tt.is_active = TRUE
                AND tt.ticket_section::text = 'merchant'
                AND tt.merchant_section_id IS NOT NULL
                AND TRIM(tt.merchant_section_id::text) <> ''
              LIMIT 1
            `;
            helpRow = rowToHelp(hr[0] as Record<string, unknown> | undefined);
            if (!helpRow) {
              return reply.code(400).send({ error: "invalid_ticket_title_id" });
            }
            sectionCode = (helpRow.merchant_section_id || "").trim().toLowerCase();
          } catch {
            return reply.code(400).send({ error: "invalid_ticket_title_id" });
          }
        } else if (sectionCode) {
          try {
            const hr = await sql`
              SELECT
                tt.id,
                tt.group_id,
                tt.merchant_section_id,
                tt.intake_unified_title,
                tt.intake_unified_category,
                tt.intake_unified_priority,
                tt.intake_unified_service_type,
                tt.title_text,
                COALESCE(
                  (
                    SELECT array_agg(UPPER(TRIM(tg2.tag_code)) ORDER BY tg2.id)
                    FROM ticket_title_tags ttm
                    INNER JOIN ticket_tags tg2 ON tg2.id = ttm.tag_id
                    WHERE ttm.ticket_title_id = tt.id
                  ),
                  CASE
                    WHEN tt.tag_id IS NOT NULL THEN
                      (SELECT ARRAY[UPPER(TRIM(tg3.tag_code))] FROM ticket_tags tg3 WHERE tg3.id = tt.tag_id LIMIT 1)
                    ELSE NULL
                  END
                ) AS help_tag_codes
              FROM ticket_titles tt
              WHERE LOWER(TRIM(tt.merchant_section_id)) = LOWER(TRIM(${sectionCode}))
                AND tt.is_active = TRUE
                AND tt.ticket_section::text = 'merchant'
              LIMIT 1
            `;
            helpRow = rowToHelp(hr[0] as Record<string, unknown> | undefined);
          } catch {
            helpRow = null;
          }
        }

        const mapped = mapSection(sectionCode);

        const rawOrderId = body.order_id as unknown;
        const orderIdForInsert =
          rawOrderId == null
            ? null
            : typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
              ? rawOrderId
              : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
                ? Number(rawOrderId.trim())
                : null;

        /** unified_tickets.ticket_title is text (migration 0201); use catalog intake or section default. */
        const rawIntakeTitle = String(helpRow?.intake_unified_title ?? "").trim();
        const ticketTitle = rawIntakeTitle || mapped.title;
        const ticketTitleForInsert = await resolveTicketTitleForUnifiedTicketsInsert(sql, ticketTitle);
        const ticketCategory = normalizeUnifiedCategory(String(helpRow?.intake_unified_category || mapped.category));
        let priority = normalizeUnifiedPriority(String(helpRow?.intake_unified_priority || mapped.priority));
        if (orderIdForInsert != null) {
          priority = "HIGH";
        }
        const serviceType = normalizeUnifiedServiceType(
          orderIdForInsert != null
            ? String(helpRow?.intake_unified_service_type || "FOOD")
            : String(helpRow?.intake_unified_service_type || "GENERAL")
        );

        const ticketType = orderIdForInsert != null ? "ORDER_RELATED" : "NON_ORDER_RELATED";

        const titleForSubjectFallback = ticketTitle;
        const subject =
          body.subject && String(body.subject).trim()
            ? String(body.subject).trim()
            : helpRow?.title_text && String(helpRow.title_text).trim()
              ? String(helpRow.title_text).trim()
              : titleForSubjectFallback
                  .toLowerCase()
                  .split("_")
                  .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                  .join(" ");
        const description =
          body.description && String(body.description).trim()
            ? String(body.description).trim()
            : "Merchant has raised a support request from contact centre.";

        const rawAuthName = (req.auth as any)?.name;
        const raisedName =
          rawAuthName == null
            ? null
            : typeof rawAuthName === "string"
              ? rawAuthName.trim() || null
              : typeof rawAuthName === "number" || typeof rawAuthName === "boolean"
                ? String(rawAuthName)
                : null;

        const groupId = helpRow?.group_id != null && Number.isFinite(helpRow.group_id) ? helpRow.group_id : null;
        const tagList =
          helpRow?.tag_codes && helpRow.tag_codes.length > 0
            ? [...new Set(helpRow.tag_codes.map((c) => String(c).trim()).filter(Boolean))]
            : null;
        const metadataPayload = {
          merchant_help: {
            section_code: sectionCode || null,
            ticket_title_id: helpRow?.id ?? null,
            ticket_title_row_code: helpRow ? ticketTitle : null,
          },
          ...(orderIdForInsert != null
            ? {
                live_order_support: true,
                formatted_order_id:
                  body.formatted_order_id != null && String(body.formatted_order_id).trim()
                    ? String(body.formatted_order_id).trim()
                    : null,
                orders_food_id:
                  body.orders_food_id != null &&
                  Number.isInteger(Number(body.orders_food_id)) &&
                  Number(body.orders_food_id) > 0
                    ? Number(body.orders_food_id)
                    : null,
              }
            : {}),
        };
        /** Avoid sql.json / sql.array here: some postgres.js paths pass internal Objects into Buffer.byteLength (ERR_INVALID_ARG_TYPE). */
        const metadataJson = JSON.stringify(metadataPayload);
        const tagsArrayLiteral =
          tagList == null
            ? null
            : `{${tagList
                .map((s) => {
                  const t = String(s);
                  return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
                })
                .join(",")}}`;

        const slugHeaderRaw = req.headers["x-merchant-app-slug"];
        const slugHeader = Array.isArray(slugHeaderRaw) ? slugHeaderRaw[0] : slugHeaderRaw;
        const merchantAppSlug =
          typeof slugHeader === "string" ? slugHeader.trim().toLowerCase() : "";
        const buyerNpName = merchantAppSlug === "gatimitra" ? "GatiMitra" : null;

        const rows = await sql`
          INSERT INTO unified_tickets (
            ticket_type,
            ticket_source,
            service_type,
            ticket_title,
            ticket_category,
            order_id,
            customer_id,
            rider_id,
            merchant_store_id,
            merchant_parent_id,
            raised_by_type,
            raised_by_id,
            raised_by_name,
            subject,
            description,
            priority,
            status,
            auto_generated,
            group_id,
            tags,
            metadata,
            buyer_np_name
          ) VALUES (
            ${ticketType}::unified_ticket_type,
            'MERCHANT'::unified_ticket_source,
            ${serviceType}::unified_ticket_service_type,
            ${ticketTitleForInsert},
            ${ticketCategory}::unified_ticket_category,
            ${orderIdForInsert},
            NULL,
            NULL,
            ${storeId},
            ${parentId},
            'MERCHANT'::unified_ticket_source,
            ${storeId},
            ${raisedName},
            ${subject},
            ${description},
            ${priority}::unified_ticket_priority,
            'OPEN'::unified_ticket_status,
            FALSE,
            ${groupId},
            ${tagsArrayLiteral}::text[],
            ${metadataJson}::text::jsonb,
            ${buyerNpName}
          )
          RETURNING id,
                    ticket_id,
                    status,
                    priority,
                    subject,
                    description,
                    created_at,
                    to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') AS created_at_ist
        `;
        const row = rows[0] as {
          id: number | string | bigint;
          ticket_id: string;
          status: string;
          priority: string;
          subject?: string | null;
          description?: string | null;
          created_at: Date;
          created_at_ist?: string | null;
        };

        const numericId =
          typeof row.id === "bigint"
            ? Number(row.id)
            : typeof row.id === "string"
              ? Number(row.id.trim())
              : Number(row.id);
        if (!Number.isInteger(numericId) || numericId < 1) {
          req.log.error({ rowId: row.id }, "merchant_create_ticket_invalid_id");
          return reply.code(500).send({ error: "ticket_create_failed", message: "Invalid ticket id from database" });
        }

        req.log.info(
          { storeId, unifiedTicketId: numericId, ticketId: row.ticket_id },
          "merchant_partner_create_ticket_ok"
        );

        return reply.send({
          ok: true,
          ticket: {
            id: numericId,
            ticket_id: row.ticket_id,
            status: row.status,
            priority: row.priority,
            subject: row.subject ?? null,
            description: row.description ?? null,
            order_id: orderIdForInsert,
            formatted_order_id:
              body.formatted_order_id != null && String(body.formatted_order_id).trim()
                ? String(body.formatted_order_id).trim()
                : null,
            created_at:
              row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
            created_at_display: row.created_at_ist ?? undefined,
          },
        });
      });

      /** GET /merchant-partner/stores/:storeId/tickets/:ticketId/messages — list conversation messages for a ticket. */
      protectedApp.post<{
        Params: { storeId: string; ticketId: string };
      }>("/stores/:storeId/tickets/:ticketId/upload", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const ticketIdNum = Number(req.params.ticketId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
          return reply.code(400).send({ error: "invalid_ticket_id" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const ticketRows = await sql`
          SELECT id
          FROM unified_tickets
          WHERE id = ${ticketIdNum}
            AND merchant_store_id = ${storeId}
            AND merchant_parent_id = ${parentId}
          LIMIT 1
        `;
        if (ticketRows.length === 0) return reply.code(404).send({ error: "ticket_not_found" });

        const filePart = await (req as any).file?.();
        if (!filePart) return reply.code(400).send({ error: "no_file" });
        const buffer = await filePart.toBuffer();
        if (!buffer || buffer.length === 0) return reply.code(400).send({ error: "empty_file" });
        if (buffer.length > 50 * 1024 * 1024) return reply.code(400).send({ error: "file_too_large" });

        const originalName = String(filePart.filename || "file");
        const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
        const mime = String(filePart.mimetype || "application/octet-stream");
        const { randomUUID } = await import("crypto");
        // Keep same R2 directory family as dashboard ticket reply uploads.
        const r2Key = `tickets/images/${ticketIdNum}/${randomUUID()}-${safeName}`;

        try {
          const { uploadToR2 } = await import("../../services/r2/r2Service.js");
          const uploaded = await uploadToR2(buffer, r2Key, mime);
          const proxyUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploaded.key)}`;
          return reply.code(201).send({
            success: true,
            attachment: {
              storageKey: uploaded.key,
              url: proxyUrl,
              name: originalName,
              mimeType: mime,
            },
          });
        } catch (e: any) {
          req.log.error(e, "ticket attachment upload failed");
          return reply.code(500).send({ error: "upload_failed", message: e?.message || "Upload failed" });
        }
      });

      /** GET /merchant-partner/stores/:storeId/tickets/:ticketId/messages — list conversation messages for a ticket. */
      protectedApp.get<{
        Params: { storeId: string; ticketId: string };
      }>("/stores/:storeId/tickets/:ticketId/messages", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const ticketIdNum = Number(req.params.ticketId);
        if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
          return reply.code(400).send({ error: "invalid_ticket_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        // Same as dashboard GET /api/tickets/[id]: resume snooze as soon as merchant loads chat after snooze end.
        try {
          await sql`
            UPDATE unified_tickets
            SET status = 'OPEN'::unified_ticket_status,
                snoozed_until = NULL,
                snooze_reason = NULL,
                updated_at = NOW()
            WHERE id = ${ticketIdNum}
              AND merchant_store_id = ${storeId}
              AND merchant_parent_id = ${parentId}
              AND status = 'SNOOZED'::unified_ticket_status
              AND snoozed_until IS NOT NULL
              AND snoozed_until <= NOW()
          `;
        } catch (wakeErr: unknown) {
          req.log.warn({ err: wakeErr }, "merchant ticket snooze wake skipped");
        }

        const ticketRows = await sql`
          SELECT ut.id,
                 ut.ticket_id,
                 ut.status,
                 ut.priority,
                 ut.subject,
                 ut.description,
                 ut.created_at,
                 ut.order_id,
                 ut.metadata,
                 oc.formatted_order_id AS core_formatted_order_id,
                 ut.satisfaction_rating,
                 ut.satisfaction_feedback,
                 ut.satisfaction_collected_at,
                 ut.snoozed_until,
                 ut.snooze_reason
          FROM unified_tickets ut
          LEFT JOIN orders_core oc ON oc.id = ut.order_id
          WHERE ut.id = ${ticketIdNum}
            AND ut.merchant_store_id = ${storeId}
            AND ut.merchant_parent_id = ${parentId}
          LIMIT 1
        `;
        if (ticketRows.length === 0) return reply.code(404).send({ error: "ticket_not_found" });

        const rawTicket = ticketRows[0] as Record<string, unknown>;
        const toIsoOrNull = (v: unknown): string | null => {
          if (v == null) return null;
          if (v instanceof Date) {
            return Number.isFinite(v.getTime()) ? v.toISOString() : null;
          }
          const s = String(v).trim();
          if (!s) return null;
          const d = new Date(s);
          return Number.isFinite(d.getTime()) ? d.toISOString() : null;
        };
        const extractFormattedOrderIdFromMetadata = (metadata: unknown): string | null => {
          if (metadata == null) return null;
          let obj: Record<string, unknown>;
          if (typeof metadata === "string") {
            try {
              obj = JSON.parse(metadata) as Record<string, unknown>;
            } catch {
              return null;
            }
          } else if (typeof metadata === "object") {
            obj = metadata as Record<string, unknown>;
          } else {
            return null;
          }
          const liveOrder = obj.live_order_support;
          if (liveOrder != null && typeof liveOrder === "object") {
            const fid = (liveOrder as Record<string, unknown>).formatted_order_id;
            if (typeof fid === "string" && fid.trim()) return fid.trim();
          }
          return null;
        };
        const orderIdRaw = rawTicket.order_id;
        const orderIdNum =
          orderIdRaw != null && orderIdRaw !== "" && Number.isInteger(Number(orderIdRaw)) && Number(orderIdRaw) > 0
            ? Number(orderIdRaw)
            : null;
        const formattedOrderId =
          typeof rawTicket.core_formatted_order_id === "string" && rawTicket.core_formatted_order_id.trim()
            ? rawTicket.core_formatted_order_id.trim()
            : extractFormattedOrderIdFromMetadata(rawTicket.metadata);
        const ticketPayload = {
          id: Number(rawTicket.id),
          ticket_id: String(rawTicket.ticket_id ?? ""),
          status: String(rawTicket.status ?? ""),
          priority: String(rawTicket.priority ?? ""),
          subject: rawTicket.subject ?? null,
          description: rawTicket.description ?? null,
          created_at: toIsoOrNull(rawTicket.created_at) ?? new Date().toISOString(),
          order_id: orderIdNum,
          formatted_order_id: formattedOrderId,
          satisfaction_rating: rawTicket.satisfaction_rating ?? null,
          satisfaction_feedback: rawTicket.satisfaction_feedback ?? null,
          satisfaction_collected_at: toIsoOrNull(rawTicket.satisfaction_collected_at),
          snoozed_until: toIsoOrNull(rawTicket.snoozed_until),
          snooze_reason:
            typeof rawTicket.snooze_reason === "string" && rawTicket.snooze_reason.trim()
              ? rawTicket.snooze_reason.trim()
              : null,
        };

        const msgRows = await sql`
          SELECT id,
                 message_text,
                 message_type,
                 sender_type,
                 sender_id,
                 sender_name,
                 attachments,
                 created_at,
                 is_internal_note
          FROM unified_ticket_messages
          WHERE ticket_id = ${ticketIdNum}
          ORDER BY created_at ASC, id ASC
        `;

        const messages = (msgRows as any[]).map((m) => ({
          id: m.id,
          message_text: m.message_text,
          message_type: m.message_type,
          sender_type: m.sender_type,
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          attachments: m.attachments ?? [],
          is_internal_note: m.is_internal_note ?? false,
          created_at:
            m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
        }));

        return reply.send({
          ticket: ticketPayload,
          messages,
        });
      });

      /** POST /merchant-partner/stores/:storeId/tickets/:ticketId/messages — add a message to a ticket (merchant chat). */
      protectedApp.post<{
        Params: { storeId: string; ticketId: string };
        Body: { message_text?: string; attachments?: string[] };
      }>("/stores/:storeId/tickets/:ticketId/messages", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const ticketIdNum = Number(req.params.ticketId);
        if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
          return reply.code(400).send({ error: "invalid_ticket_id" });
        }
        const body = (req.body || {}) as { message_text?: string; attachments?: string[] };
        const text = (body.message_text || "").trim();
        if (!text) {
          return reply.code(400).send({ error: "invalid_body", message: "message_text required" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        const ticketRows = await sql`
          SELECT id
          FROM unified_tickets
          WHERE id = ${ticketIdNum}
            AND merchant_store_id = ${storeId}
            AND merchant_parent_id = ${parentId}
          LIMIT 1
        `;
        if (ticketRows.length === 0) return reply.code(404).send({ error: "ticket_not_found" });

        const senderName = (req.auth as any)?.name ?? null;
        const normalizedText = text.replace(/\r\n/g, "\n").trim();

        // Idempotency guard: if the same merchant sends the exact same message within
        // a short window, return the existing row instead of inserting duplicate.
        const duplicateRows = await sql`
          SELECT id, created_at
          FROM unified_ticket_messages
          WHERE ticket_id = ${ticketIdNum}
            AND sender_type = 'MERCHANT'::unified_ticket_source
            AND sender_id = ${storeId}
            AND COALESCE(is_internal_note, false) = FALSE
            AND UPPER(COALESCE(message_type, 'TEXT')) = 'TEXT'
            AND BTRIM(COALESCE(message_text, '')) = ${normalizedText}
            AND created_at >= (NOW() - INTERVAL '20 seconds')
          ORDER BY id DESC
          LIMIT 1
        `;
        if (duplicateRows.length > 0) {
          const dupe = duplicateRows[0] as { id: number; created_at: Date | string };
          return reply.send({
            ok: true,
            deduped_existing_message: true,
            message: {
              id: dupe.id,
              message_text: text,
              created_at:
                dupe.created_at instanceof Date ? dupe.created_at.toISOString() : String(dupe.created_at),
            },
          });
        }

        const rows = await sql`
          INSERT INTO unified_ticket_messages (
            ticket_id,
            message_text,
            message_type,
            sender_type,
            sender_id,
            sender_name,
            attachments,
            is_internal_note
          ) VALUES (
            ${ticketIdNum},
            ${text},
            'TEXT',
            'MERCHANT'::unified_ticket_source,
            ${storeId},
            ${senderName},
            ${Array.isArray(body.attachments) ? body.attachments : []}::text[],
            FALSE
          )
          RETURNING id, created_at
        `;
        const row = rows[0] as { id: number; created_at: Date };

        return reply.send({
          ok: true,
          message: {
            id: row.id,
            message_text: text,
            created_at:
              row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          },
        });
      });

      /** POST /merchant-partner/stores/:storeId/tickets/:ticketId/rating — merchant satisfaction rating for a ticket. */
      protectedApp.post<{
        Params: { storeId: string; ticketId: string };
        Body: { rating?: number; feedback?: string };
      }>("/stores/:storeId/tickets/:ticketId/rating", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const ticketIdNum = Number(req.params.ticketId);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
          return reply.code(400).send({ error: "invalid_id" });
        }
        const body = (req.body || {}) as { rating?: number; feedback?: string };
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return reply.code(400).send({ error: "invalid_rating" });
        }

        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        const rows = await sql`
          UPDATE unified_tickets
          SET satisfaction_rating = ${rating},
              satisfaction_feedback = ${body.feedback ?? null},
              satisfaction_collected_at = NOW()
          WHERE id = ${ticketIdNum}
            AND merchant_store_id = ${storeId}
            AND merchant_parent_id = ${parentId}
          RETURNING id, ticket_id, status, priority, created_at, satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
        `;
        if (rows.length === 0) return reply.code(404).send({ error: "ticket_not_found" });

        const row = rows[0] as any;
        return reply.send({
          ok: true,
          ticket: {
            id: row.id,
            ticket_id: row.ticket_id,
            status: row.status,
            priority: row.priority,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
            satisfaction_rating: row.satisfaction_rating,
            satisfaction_feedback: row.satisfaction_feedback,
            satisfaction_collected_at: row.satisfaction_collected_at,
          },
        });
      });

      /** POST /merchant-partner/stores/:storeId/tickets/:ticketId/reopen — reopen a closed/resolved ticket from merchant side. */
      protectedApp.post<{
        Params: { storeId: string; ticketId: string };
      }>("/stores/:storeId/tickets/:ticketId/reopen", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const ticketIdNum = Number(req.params.ticketId);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
          return reply.code(400).send({ error: "invalid_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });

        const rows = await sql`
          UPDATE unified_tickets
          SET status = 'REOPENED'::unified_ticket_status,
              updated_at = NOW()
          WHERE id = ${ticketIdNum}
            AND merchant_store_id = ${storeId}
            AND merchant_parent_id = ${parentId}
          RETURNING id,
                    ticket_id,
                    status,
                    priority,
                    created_at,
                    satisfaction_rating,
                    satisfaction_feedback,
                    satisfaction_collected_at
        `;
        if (rows.length === 0) return reply.code(404).send({ error: "ticket_not_found" });

        const row = rows[0] as any;
        return reply.send({
          ok: true,
          ticket: {
            id: row.id,
            ticket_id: row.ticket_id,
            status: row.status,
            priority: row.priority,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
            satisfaction_rating: row.satisfaction_rating,
            satisfaction_feedback: row.satisfaction_feedback,
            satisfaction_collected_at: row.satisfaction_collected_at,
          },
        });
      });

      /** GET /merchant-partner/stores/:storeId/settings — lightweight store settings for partner app (preferences + delivery mode). */
      protectedApp.get<{ Params: { storeId: string } }>("/stores/:storeId/settings", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        if (!Number.isInteger(storeId) || storeId < 1) {
          return reply.code(400).send({ error: "invalid_store_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const settingsRows = await sql`
          SELECT show_floating_orders, platform_delivery, self_delivery, thermal_printer_width_mm
          FROM merchant_store_settings
          WHERE store_id = ${storeId}
          LIMIT 1
        `;
        const row =
          (settingsRows[0] as
            | {
                show_floating_orders?: boolean;
                platform_delivery?: boolean;
                self_delivery?: boolean;
                thermal_printer_width_mm?: number | null;
              }
            | undefined) ?? null;
        const showFloating = row?.show_floating_orders !== false;
        const platformDelivery = row?.platform_delivery !== false;
        const selfDelivery = row?.self_delivery === true;
        const thermalPrinterWidthMm = row?.thermal_printer_width_mm === 58 ? 58 : 80;

        return reply.send({
          store_id: storeId,
          show_floating_orders: showFloating,
          platform_delivery: platformDelivery,
          self_delivery: selfDelivery,
          thermal_printer_width_mm: thermalPrinterWidthMm,
        });
      });

      /** PATCH /merchant-partner/stores/:storeId/settings — update store settings (floating orders + delivery mode). */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: {
          show_floating_orders?: boolean;
          platform_delivery?: boolean;
          self_delivery?: boolean;
          thermal_printer_width_mm?: 58 | 80;
        };
      }>(
        "/stores/:storeId/settings",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const body = (req.body || {}) as {
            show_floating_orders?: boolean;
            platform_delivery?: boolean;
            self_delivery?: boolean;
            thermal_printer_width_mm?: 58 | 80;
          };
          const hasFloating = typeof body.show_floating_orders === "boolean";
          const hasPlatform = typeof body.platform_delivery === "boolean";
          const hasSelf = typeof body.self_delivery === "boolean";
          const hasThermal =
            body.thermal_printer_width_mm === 58 || body.thermal_printer_width_mm === 80;
          if (!hasFloating && !hasPlatform && !hasSelf && !hasThermal) {
            return reply.code(400).send({
              error: "invalid_body",
              message:
                "At least one of show_floating_orders, platform_delivery, self_delivery or thermal_printer_width_mm is required",
            });
          }

          const existingRows = await sql`
            SELECT id, show_floating_orders, platform_delivery, self_delivery, thermal_printer_width_mm
            FROM merchant_store_settings
            WHERE store_id = ${storeId}
            LIMIT 1
          `;
          const existing = existingRows[0] as
            | {
                id: number;
                show_floating_orders: boolean | null;
                platform_delivery: boolean | null;
                self_delivery: boolean | null;
                thermal_printer_width_mm: number | null;
              }
            | undefined;

          const oldShowFloating =
            existing == null ? true : existing.show_floating_orders !== false;
          const oldPlatform = existing?.platform_delivery !== false;
          const oldSelf = existing?.self_delivery === true;
          const oldThermal = existing?.thermal_printer_width_mm === 58 ? 58 : 80;

          const nextShowFloating = hasFloating ? body.show_floating_orders === true : oldShowFloating;
          const nextPlatform = hasPlatform ? body.platform_delivery === true : oldPlatform;
          const nextSelf = hasSelf ? body.self_delivery === true : oldSelf;
          const nextThermal = hasThermal ? body.thermal_printer_width_mm! : oldThermal;

          if (!existing) {
            await sql`
              INSERT INTO merchant_store_settings (
                store_id,
                show_floating_orders,
                platform_delivery,
                self_delivery,
                thermal_printer_width_mm
              )
              VALUES (${storeId}, ${nextShowFloating}, ${nextPlatform}, ${nextSelf}, ${nextThermal})
            `;
          } else {
            await sql`
              UPDATE merchant_store_settings
              SET
                show_floating_orders = ${nextShowFloating},
                platform_delivery = ${nextPlatform},
                self_delivery = ${nextSelf},
                thermal_printer_width_mm = ${nextThermal},
                updated_at = NOW()
              WHERE id = ${existing.id}
            `;
          }

          const parentRow = await getParentForAudit(sql, parentId);
          const auditCtx = getAuditContext(req, parentRow, parentId);
          await insertAuditLog(
            sql,
            "STORE",
            storeId,
            existing ? "UPDATE" : "CREATE",
            auditCtx,
            "store_settings",
            {
              show_floating_orders: oldShowFloating,
              platform_delivery: oldPlatform,
              self_delivery: oldSelf,
              thermal_printer_width_mm: oldThermal,
            },
            {
              show_floating_orders: nextShowFloating,
              platform_delivery: nextPlatform,
              self_delivery: nextSelf,
              thermal_printer_width_mm: nextThermal,
            },
            { section: "store_settings", route: "PATCH /merchant-partner/stores/:storeId/settings" }
          );

          return reply.send({
            ok: true,
            store_id: storeId,
            show_floating_orders: nextShowFloating,
            platform_delivery: nextPlatform,
            self_delivery: nextSelf,
            thermal_printer_width_mm: nextThermal,
          });
        }
      );

      /** GET /merchant-partner/stores/:storeId/order-acceptance-settings — alert sound + acceptance window. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/order-acceptance-settings",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { loadMerchantOrderAcceptanceSettings } = await import(
            "../../lib/merchant-order-acceptance-settings.js"
          );
          const settings = await loadMerchantOrderAcceptanceSettings(sql, storeId);
          return reply.send({ settings });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/order-acceptance-settings — pick alert sound slot (0–2). */
      protectedApp.patch<{
        Params: { storeId: string };
        Body: { platform_food_alert_sound_slot?: number };
      }>(
        "/stores/:storeId/order-acceptance-settings",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const slotRaw = (req.body as { platform_food_alert_sound_slot?: unknown })
            ?.platform_food_alert_sound_slot;
          const slot =
            typeof slotRaw === "number"
              ? slotRaw
              : typeof slotRaw === "string"
                ? parseInt(slotRaw, 10)
                : NaN;
          if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
            return reply.code(400).send({ error: "platform_food_alert_sound_slot must be 0, 1, or 2" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          try {
            const { patchMerchantOrderAcceptanceSoundSlot } = await import(
              "../../lib/merchant-order-acceptance-settings.js"
            );
            const out = await patchMerchantOrderAcceptanceSoundSlot(sql, storeId, slot);
            return reply.send(out);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "update_failed";
            if (msg === "empty_sound_slot") {
              return reply.code(400).send({ error: "That notification sound slot is empty." });
            }
            return reply.code(500).send({ error: msg });
          }
        }
      );

      /** POST /merchant-partner/stores/:storeId/sync-acceptance-timeout — cancel expired unaccepted orders on portal open. */
      protectedApp.post<{ Params: { storeId: string } }>(
        "/stores/:storeId/sync-acceptance-timeout",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { syncOrderAcceptanceTimeoutForStore } = await import(
            "../../services/order-acceptance-timeout.js"
          );
          const { cancelled } = await syncOrderAcceptanceTimeoutForStore(storeId, req.log);
          return reply.send({ cancelled, store_id: storeId });
        }
      );

      /** GET /merchant-partner/stores/:storeId/cancellation-compensation-policy */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/cancellation-compensation-policy",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { loadMerchantCompensationPolicyDisplay } = await import(
            "../../lib/merchant-cancellation-compensation-display.js"
          );
          const policy = await loadMerchantCompensationPolicyDisplay(sql);
          if (!policy) return reply.code(404).send({ error: "engine_not_configured" });
          return reply.send({ success: true, policy });
        }
      );

      /**
       * GET /merchant-partner/realtime-auth — mint a short-lived Supabase-compatible
       * JWT scoped to this merchant's owned stores (claim `store_ids`), signed with
       * SUPABASE_JWT_SECRET. The app calls supabase.realtime.setAuth(token) so its
       * Supabase client is authorized under RLS to receive orders_core/orders_food
       * postgres_changes for its own stores (and nothing else). Refresh before expiry.
       */
      protectedApp.get("/realtime-auth", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = (await sql`
          SELECT id FROM merchant_stores WHERE parent_id = ${parentId} AND deleted_at IS NULL
        `) as Array<{ id: number | string }>;
        const storeIds = storeRows
          .map((r) => Number(r.id))
          .filter((n) => Number.isFinite(n) && n > 0);
        const secret = getEnv().SUPABASE_JWT_SECRET;
        if (!secret) return reply.code(503).send({ error: "jwt_secret_missing" });
        const ttlSec = 60 * 55; // 55 min; client refreshes before expiry
        try {
          const token = await new SignJWT({ role: "authenticated", store_ids: storeIds })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(String(req.auth.sub))
            .setAudience("authenticated")
            .setIssuedAt()
            .setExpirationTime(`${ttlSec}s`)
            .sign(new TextEncoder().encode(secret));
          return reply.send({ token, expiresIn: ttlSec, storeIds });
        } catch (e) {
          req.log.error({ err: e }, "[realtime-auth] sign failed");
          return reply.code(500).send({ error: "realtime_auth_failed" });
        }
      });

      /** GET /merchant-partner/stores/:storeId/food-orders — partner food orders (same pipeline as Partner Site). */
      protectedApp.get<{ Params: { storeId: string }; Querystring: { limit?: string } }>(
        "/stores/:storeId/food-orders",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const limitRaw = parseInt(String(req.query?.limit ?? "50"), 10);
          // Merchant board does not need a deep history dump — keep the hot path small.
          const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 60);
          try {
            const { loadMerchantFoodOrders } = await import("./merchant-food-orders.service.js");
            const FOOD_ORDERS_DEADLINE_MS = 12_000;
            const started = Date.now();
            const orders = await Promise.race([
              loadMerchantFoodOrders(sql, storeId, { limit }),
              new Promise<never>((_, reject) => {
                setTimeout(
                  () => reject(new Error("food_orders_timeout")),
                  FOOD_ORDERS_DEADLINE_MS
                );
              }),
            ]);
            const ms = Date.now() - started;
            if (ms > 2_000) {
              req.log.warn({ storeId, ms, count: orders.length }, "[food-orders GET] slow");
            }
            return reply.send({ orders });
          } catch (e) {
            req.log.error({ err: e, storeId }, "[food-orders GET] failed");
            const msg = e instanceof Error ? e.message : "load_failed";
            if (msg === "food_orders_timeout") {
              return reply.code(504).send({ error: "orders_load_timeout" });
            }
            return reply.code(500).send({ error: msg });
          }
        }
      );

      /** POST /merchant-partner/stores/:storeId/food-orders/kot-print — Merchant App KOT audit. */
      protectedApp.post<{
        Params: { storeId: string };
        Body: {
          order_id?: number;
          kot_number?: string | null;
          printed_by?: string;
          print_channel?: string;
        };
      }>("/stores/:storeId/food-orders/kot-print", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const orderId = Number(req.body?.order_id);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(orderId) || orderId < 1) {
          return reply.code(400).send({ error: "invalid_request" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        try {
          const tokRows = await sql`
            SELECT id, kot_number, kot_print_count, kot_version
            FROM order_pickup_tokens
            WHERE order_id = ${orderId}
            LIMIT 1
          `;
          const tok = tokRows[0] as
            | {
                id: number;
                kot_number: string | null;
                kot_print_count: number | null;
                kot_version: number | null;
              }
            | undefined;
          if (tok?.id) {
            await sql`
              UPDATE order_pickup_tokens
              SET last_kot_printed_at = now(),
                  kot_print_count = COALESCE(kot_print_count, 0) + 1,
                  updated_at = now()
              WHERE id = ${tok.id}
            `;
            await sql`
              INSERT INTO order_kot_print_events (
                order_id, store_id, token_id, kot_number, printed_by, print_channel, kot_version
              )
              VALUES (
                ${orderId},
                ${storeId},
                ${tok.id},
                ${req.body?.kot_number ?? tok.kot_number ?? null},
                ${(req.body?.printed_by ?? "merchant_app").slice(0, 64)},
                ${(req.body?.print_channel ?? "expo_print").slice(0, 64)},
                ${Number(tok.kot_version ?? 1) || 1}
              )
            `;
          }
        } catch (err) {
          req.log.warn({ err, storeId, orderId }, "[kot-print] audit failed");
        }
        return reply.send({ ok: true });
      });

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/kot-fields — token + KOT number for print. */
      protectedApp.get<{
        Params: { storeId: string; orderId: string };
        Querystring: { by?: string };
      }>("/stores/:storeId/food-orders/:orderId/kot-fields", async (req, reply) => {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const storeId = Number(req.params.storeId);
        const orderId = parseInt(req.params.orderId, 10);
        if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(orderId) || orderId < 1) {
          return reply.code(400).send({ error: "invalid_id" });
        }
        const sql = getSql();
        const parentId = await getPartnerParentId(sql, req.auth.sub);
        if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
        const storeRows = await sql`
          SELECT id FROM merchant_stores
          WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

        const { ensureMerchantKotPrintFields } = await import("./merchant-food-orders.service.js");
        const byCore = String(req.query?.by ?? "").toLowerCase() === "core";
        const fields = await ensureMerchantKotPrintFields(
          sql,
          storeId,
          byCore ? { ordersCoreId: orderId } : { ordersFoodId: orderId }
        );
        return reply.send(fields);
      });

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId — single food order. */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { loadMerchantFoodOrders } = await import("./merchant-food-orders.service.js");
          const DETAIL_DEADLINE_MS = 10_000;
          let orders;
          try {
            orders = await Promise.race([
              loadMerchantFoodOrders(sql, storeId, { ordersFoodId, limit: 1 }),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("food_order_detail_timeout")), DETAIL_DEADLINE_MS);
              }),
            ]);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "load_failed";
            req.log.error({ err: e, storeId, ordersFoodId }, "[food-order GET] failed");
            if (msg === "food_order_detail_timeout") {
              return reply.code(504).send({ error: "orders_load_timeout" });
            }
            return reply.code(500).send({ error: msg });
          }
          const order = orders[0];
          if (!order) return reply.code(404).send({ error: "order_not_found" });
          return reply.send({ order });
        }
      );

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/nearby-dispatch-riders */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId/nearby-dispatch-riders",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          // Lite lookup only — never call loadMerchantFoodOrders (detail enrich was 10s+).
          type LiteRow = {
            food_id: number;
            core_id: number | null;
            rider_id: number | null;
          };
          let lite: LiteRow | null = null;
          try {
            const rows = await sql`
              SELECT
                of.id AS food_id,
                oc.id AS core_id,
                oc.rider_id AS rider_id
              FROM orders_food of
              LEFT JOIN orders_core oc
                ON oc.id = of.order_id
                OR (of.core_order_id IS NOT NULL AND oc.order_id = of.core_order_id)
              WHERE of.id = ${ordersFoodId}
                AND (
                  of.merchant_store_id = ${storeId}
                  OR oc.merchant_store_id = ${storeId}
                )
              LIMIT 1
            `;
            lite = (rows[0] as LiteRow | undefined) ?? null;
          } catch (err) {
            req.log.warn({ err, storeId, ordersFoodId }, "[nearby-dispatch] lite lookup failed");
            return reply.send({ ok: true, summary: null, riderAssigned: false });
          }
          if (!lite) return reply.code(404).send({ error: "order_not_found" });

          const ordersCoreId = Number(lite.core_id);
          if (!Number.isFinite(ordersCoreId) || ordersCoreId < 1) {
            return reply.send({ ok: true, summary: null, riderAssigned: false });
          }
          if (lite.rider_id != null) {
            return reply.send({ ok: true, summary: null, riderAssigned: true });
          }

          const { getNearbyDispatchRiderSummaryForOrderCoreId } = await import(
            "../../lib/merchant-nearby-dispatch-riders.js"
          );
          try {
            const summary = await Promise.race([
              getNearbyDispatchRiderSummaryForOrderCoreId(ordersCoreId),
              new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), 2_500);
              }),
            ]);
            return reply.send({ ok: true, summary, riderAssigned: false });
          } catch (err) {
            req.log.warn({ err, ordersCoreId }, "[nearby-dispatch] summary failed");
            return reply.send({ ok: true, summary: null, riderAssigned: false });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/timeline */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId/timeline",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { loadMerchantFoodOrderTimeline } = await import("./merchant-food-orders.service.js");
          const timeline = await loadMerchantFoodOrderTimeline(sql, storeId, ordersFoodId);
          return reply.send({ timeline });
        }
      );

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/riders-log */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId/riders-log",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { loadMerchantFoodOrderRidersLog } = await import("./merchant-food-orders.service.js");
          const riders = await loadMerchantFoodOrderRidersLog(sql, storeId, ordersFoodId);
          return reply.send({ riders });
        }
      );

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/rider-tracking */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId/rider-tracking",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const foodRows = await sql<{ order_id: number | null }[]>`
            SELECT order_id FROM orders_food
            WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
            LIMIT 1
          `;
          const coreOrderId = foodRows[0]?.order_id;
          if (coreOrderId == null || !Number.isFinite(Number(coreOrderId))) {
            return reply.code(404).send({ error: "order_not_found" });
          }

          try {
            const { getMerchantOrderRiderTracking } = await import(
              "../../lib/merchant-rider-tracking.js"
            );
            const payload = await getMerchantOrderRiderTracking(sql, Number(coreOrderId));
            return reply.send(payload);
          } catch (e) {
            req.log.error({ err: e, storeId, ordersFoodId }, "[rider-tracking GET] failed");
            return reply.code(500).send({ error: "rider_tracking_failed" });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/food-orders/:orderId/activity — merchant status actions for timeline. */
      protectedApp.get<{ Params: { storeId: string; orderId: string } }>(
        "/stores/:storeId/food-orders/:orderId/activity",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId)) {
            return reply.code(400).send({ error: "invalid_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const foodRows = await sql`
            SELECT id FROM orders_food
            WHERE id = ${ordersFoodId} AND merchant_store_id = ${storeId}
            LIMIT 1
          `;
          if (foodRows.length === 0) return reply.code(404).send({ error: "order_not_found" });

          const actionRows = await sql`
            SELECT id, from_status, to_status, action_source, actor_label, metadata, created_at
            FROM merchant_order_food_actions
            WHERE orders_food_id = ${ordersFoodId}
            ORDER BY created_at DESC
            LIMIT 30
          `;
          return reply.send({ actions: actionRows });
        }
      );

      /** PATCH /merchant-partner/stores/:storeId/food-orders/:orderId — status transition (Partner Site rules). */
      protectedApp.patch<{
        Params: { storeId: string; orderId: string };
        Body: {
          status?: string;
          rejected_reason?: string;
          action_source?: string;
          accept_mode?: string;
          cancel_mode?: string;
          preparation_time_minutes?: number;
        };
      }>(
        "/stores/:storeId/food-orders/:orderId",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          const newStatus = String(req.body?.status ?? "").toUpperCase();
          if (!Number.isInteger(storeId) || storeId < 1 || !Number.isFinite(ordersFoodId) || !newStatus) {
            return reply.code(400).send({ error: "invalid_request" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { patchMerchantFoodOrderStatus } = await import("./merchant-food-orders.service.js");
          try {
            const { normalizeActionMode, normalizeActionSource } = await import(
              "../../lib/merchant-order-food-action-labels.js"
            );
            const actionMode = normalizeActionMode(
              newStatus === "ACCEPTED"
                ? req.body?.accept_mode
                : newStatus === "CANCELLED"
                  ? req.body?.cancel_mode
                  : req.body?.cancel_mode ?? req.body?.accept_mode
            );
            const order = await patchMerchantFoodOrderStatus(
              sql,
              storeId,
              ordersFoodId,
              newStatus,
              req.body?.rejected_reason ?? null,
              {
                actionSource: normalizeActionSource(req.body?.action_source ?? "app"),
                actionMode,
                preparationTimeMinutes:
                  req.body?.preparation_time_minutes != null
                    ? Number(req.body.preparation_time_minutes)
                    : undefined,
              }
            );
            return reply.send({ order });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "update_failed";
            if (msg === "order_not_found") return reply.code(404).send({ error: msg });
            if (msg === "store_mismatch") return reply.code(403).send({ error: msg });
            if (msg.startsWith("invalid_transition:")) {
              return reply.code(400).send({ error: msg.replace("invalid_transition:", "Invalid transition: ") });
            }
            return reply.code(500).send({ error: msg });
          }
        }
      );

      /** POST /merchant-partner/stores/:storeId/food-orders/:orderId/prep-delay */
      protectedApp.post<{
        Params: { storeId: string; orderId: string };
        Body: { additional_minutes?: number };
      }>(
        "/stores/:storeId/food-orders/:orderId/prep-delay",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          const additionalMinutes = Number(req.body?.additional_minutes);
          if (
            !Number.isInteger(storeId) ||
            storeId < 1 ||
            !Number.isFinite(ordersFoodId) ||
            !Number.isFinite(additionalMinutes)
          ) {
            return reply.code(400).send({ error: "invalid_request" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { patchMerchantFoodOrderPrepDelay } = await import("./merchant-food-orders.service.js");
          try {
            const order = await patchMerchantFoodOrderPrepDelay(
              sql,
              storeId,
              ordersFoodId,
              additionalMinutes
            );
            return reply.send({
              order,
              prep_ready_by_at: order.prep_ready_by_at,
              prep_delay_minutes: order.prep_delay_minutes,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "update_failed";
            if (msg === "order_not_found") return reply.code(404).send({ error: msg });
            if (msg === "store_mismatch") return reply.code(403).send({ error: msg });
            if (
              msg === "invalid_prep_delay_minutes" ||
              msg === "prep_delay_not_allowed" ||
              msg === "prep_delay_limit_reached"
            ) {
              return reply.code(400).send({ error: msg });
            }
            return reply.code(500).send({ error: msg });
          }
        }
      );

      /** POST /merchant-partner/stores/:storeId/food-orders/:orderId/complete-self-pickup */
      protectedApp.post<{
        Params: { storeId: string; orderId: string };
        Body: { otp?: string };
      }>(
        "/stores/:storeId/food-orders/:orderId/complete-self-pickup",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          const ordersFoodId = parseInt(req.params.orderId, 10);
          const otp = String(req.body?.otp ?? "").trim();
          if (
            !Number.isInteger(storeId) ||
            storeId < 1 ||
            !Number.isFinite(ordersFoodId) ||
            !otp
          ) {
            return reply.code(400).send({ error: "invalid_request" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          const { completeMerchantSelfPickupWithOtp } = await import(
            "./merchant-food-orders.service.js"
          );
          try {
            const order = await completeMerchantSelfPickupWithOtp(
              sql,
              storeId,
              ordersFoodId,
              otp
            );
            return reply.send({ valid: true, completed: true, order });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "update_failed";
            if (msg === "order_not_found" || msg === "pickup_otp_not_found") {
              return reply.code(404).send({ error: msg, valid: false });
            }
            if (msg === "store_mismatch") {
              return reply.code(403).send({ error: msg, valid: false });
            }
            if (msg === "otp_locked") {
              return reply
                .code(429)
                .send({ error: "Too many attempts. Try again later.", valid: false });
            }
            if (
              msg === "invalid_otp" ||
              msg === "otp_required" ||
              msg === "not_self_pickup" ||
              msg.startsWith("invalid_status:")
            ) {
              return reply.code(400).send({
                error:
                  msg === "invalid_otp"
                    ? "Invalid OTP"
                    : msg === "not_self_pickup"
                      ? "Only self-pickup orders can be completed with customer OTP"
                      : msg.startsWith("invalid_status:")
                        ? `Order must be Ready (current: ${msg.replace("invalid_status:", "")})`
                        : "Enter the 4-digit Pickup OTP from the customer",
                valid: false,
              });
            }
            return reply.code(500).send({ error: msg, valid: false });
          }
        }
      );

      /** GET /merchant-partner/stores/:storeId/active-orders-count — live count of active orders for this store. */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/stores/:storeId/active-orders-count",
        async (req, reply) => {
          if (req.auth?.role !== "merchant" || !req.auth?.sub) {
            return reply.code(401).send({ error: "merchant_required" });
          }
          const storeId = Number(req.params.storeId);
          if (!Number.isInteger(storeId) || storeId < 1) {
            return reply.code(400).send({ error: "invalid_store_id" });
          }
          const sql = getSql();
          const parentId = await getPartnerParentId(sql, req.auth.sub);
          if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
          const storeRows = await sql`
            SELECT id FROM merchant_stores WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL LIMIT 1
          `;
          if (storeRows.length === 0) return reply.code(404).send({ error: "store_not_found" });

          // Pending deliveries for the merchant home KPI =
          //   CREATED food rows (awaiting accept) + kitchen/dispatch pipeline.
          // Do NOT use orders_core.status alone: new food orders are inserted with
          // status='assigned' while still CREATED for the merchant — that inflated
          // the KPI while New/Active food boards stayed empty when the list path failed.
          const rows = await sql`
            SELECT
              COUNT(*) FILTER (
                WHERE upper(COALESCE(f.order_status, '')) IN (
                  'CREATED', 'NEW', 'PLACED',
                  'ACCEPTED', 'PREPARING',
                  'READY_FOR_PICKUP', 'READY',
                  'OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DISPATCHED'
                )
              )::int AS active_orders,
              COUNT(*) FILTER (
                WHERE upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
              )::int AS pending_accept,
              COUNT(*) FILTER (
                WHERE upper(COALESCE(f.order_status, '')) IN ('ACCEPTED', 'PREPARING')
              )::int AS preparing,
              COUNT(*) FILTER (
                WHERE upper(COALESCE(f.order_status, '')) IN ('READY_FOR_PICKUP', 'READY')
              )::int AS ready,
              COUNT(*) FILTER (
                WHERE upper(COALESCE(f.order_status, '')) IN (
                  'OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DISPATCHED'
                )
              )::int AS out_for_delivery
            FROM orders_food f
            WHERE f.merchant_store_id = ${storeId}
          `;
          const countRow = rows[0] as {
            active_orders?: number;
            pending_accept?: number;
            preparing?: number;
            ready?: number;
            out_for_delivery?: number;
          } | undefined;
          const n = (v: unknown) => {
            const x = Number(v ?? 0);
            return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
          };
          const active = n(countRow?.active_orders);
          const pendingAccept = n(countRow?.pending_accept);
          const preparing = n(countRow?.preparing);
          const ready = n(countRow?.ready);
          const outForDelivery = n(countRow?.out_for_delivery);

          return reply.send({
            store_id: storeId,
            active_orders: active,
            pending_accept: pendingAccept,
            preparing,
            ready,
            out_for_delivery: outForDelivery,
          });
        }
      );

      registerMerchantSubscriptionRoutes(protectedApp);
    },
    { prefix: "/merchant-partner" }
  );
}
