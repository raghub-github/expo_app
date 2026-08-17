/**
 * Rider support — unified_tickets (same queue as customer / merchant / dashboard).
 *
 * GET  /v1/rider-support/help-groups
 * GET  /v1/rider-support/help-sections
 * GET  /v1/rider-support/recent-orders
 * POST /v1/rider-support/tickets
 * GET  /v1/rider-support/tickets
 * GET  /v1/rider-support/tickets/:ticketId/messages
 * POST /v1/rider-support/tickets/:ticketId/messages
 * POST /v1/rider-support/tickets/:ticketId/upload
 * POST /v1/rider-support/tickets/:ticketId/rating
 * POST /v1/rider-support/tickets/:ticketId/reopen
 */

import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { getSql } from "../../db/client.js";
import { getDb } from "../../db/client.js";
import { eq } from "drizzle-orm";
import { riders } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { resolveTicketTitleForUnifiedTicketsInsert } from "../merchant-partner/unified-ticket-title-for-insert.js";
import { normalizeTicketAttachmentsForDb } from "../../lib/ticket-attachments-for-db.js";
import { attachmentsProxyUrlFromKeyForApi } from "../../utils/attachments-proxy-url.js";

const UNIFIED_CATEGORY_ENUM = new Set([
  "ORDER", "PAYMENT", "DELIVERY", "REFUND", "ACCOUNT",
  "TECHNICAL", "EARNINGS", "VERIFICATION", "COMPLAINT", "FEEDBACK", "OTHER",
]);
const UNIFIED_PRIORITY_ENUM = new Set(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]);
const UNIFIED_SERVICE_ENUM = new Set(["FOOD", "PARCEL", "RIDE", "GENERAL"]);

const INTAKE_CATEGORY_TO_ENUM: Record<string, string> = {
  PROFILE_ISSUE: "TECHNICAL",
  PROFILE: "TECHNICAL",
};

function normCategory(raw: unknown): string {
  const k = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (UNIFIED_CATEGORY_ENUM.has(k)) return k;
  const mapped = INTAKE_CATEGORY_TO_ENUM[k];
  if (mapped && UNIFIED_CATEGORY_ENUM.has(mapped)) return mapped;
  return "OTHER";
}
function normPriority(raw: unknown): string {
  const k = String(raw ?? "").trim().toUpperCase();
  return UNIFIED_PRIORITY_ENUM.has(k) ? k : "MEDIUM";
}
function normServiceType(raw: unknown): string {
  const k = String(raw ?? "").trim().toUpperCase();
  return UNIFIED_SERVICE_ENUM.has(k) ? k : "GENERAL";
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseRiderIdFromAuth(sub: string): number | null {
  const trimmed = sub.trim();
  const m = trimmed.match(/^usr_(\d+)$/i);
  if (m) return Number(m[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

function mapRiderTicketRow(t: Record<string, unknown>) {
  return {
    id: Number(t.id),
    ticket_id: String(t.ticket_id ?? ""),
    status: String(t.status ?? ""),
    priority: String(t.priority ?? ""),
    ticket_title: t.ticket_title != null ? String(t.ticket_title) : null,
    ticket_category: t.ticket_category != null ? String(t.ticket_category) : null,
    subject: t.subject ?? null,
    description: t.description ?? null,
    order_id: t.order_id != null ? Number(t.order_id) : null,
    created_at: toIsoOrNull(t.created_at) ?? new Date().toISOString(),
    updated_at: toIsoOrNull(t.updated_at),
    resolved_at: toIsoOrNull(t.resolved_at),
    last_response_at: toIsoOrNull(t.last_response_at),
    last_response_by_type:
      t.last_response_by_type != null ? String(t.last_response_by_type) : null,
    satisfaction_rating:
      t.satisfaction_rating != null && !Number.isNaN(Number(t.satisfaction_rating))
        ? Number(t.satisfaction_rating)
        : null,
    satisfaction_feedback:
      t.satisfaction_feedback != null ? String(t.satisfaction_feedback) : null,
    satisfaction_collected_at: toIsoOrNull(t.satisfaction_collected_at),
  };
}

async function resolveRider(sub: string) {
  const riderId = parseRiderIdFromAuth(sub);
  if (!riderId || riderId <= 0) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: riders.id, name: riders.name, mobile: riders.mobile })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name?.trim() || "Rider",
    mobile: row.mobile?.trim() || null,
  };
}

const PRE_LOGIN_TAG = "Pre_login";

function isPreLoginRequest(body: Record<string, unknown>): boolean {
  return body.pre_login === true || String(body.pre_login ?? "").trim().toLowerCase() === "true";
}

function normRaisedByName(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 200) return null;
  return s;
}

function normRaisedByMobile(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function normRaisedByEmail(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function buildTagsArrayLiteral(tagList: string[] | null): string | null {
  if (tagList == null || tagList.length === 0) return null;
  return `{${tagList
    .map((s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

async function loadPreLoginRiderTicket(sql: ReturnType<typeof getSql>, ticketIdNum: number) {
  const rows = await sql`
    SELECT id, raised_by_name, created_at
    FROM unified_tickets
    WHERE id = ${ticketIdNum}
      AND rider_id IS NULL
      AND raised_by_id IS NULL
      AND raised_by_type = 'RIDER'::unified_ticket_source
      AND ticket_source = 'RIDER'::unified_ticket_source
      AND ${PRE_LOGIN_TAG} = ANY(COALESCE(tags, ARRAY[]::text[]))
      AND created_at >= (NOW() - INTERVAL '3 hours')
    LIMIT 1
  `;
  return (rows as Array<Record<string, unknown>>)[0] ?? null;
}

type RiderTitleRow = {
  id: number;
  group_id: number | null;
  group_code: string | null;
  group_name: string | null;
  customer_section_id: string | null;
  title_text: string | null;
  title_code: string | null;
  subtext: string | null;
  parent_title_id: number | null;
  display_order: number | null;
  intake_ticket_type: string | null;
  intake_unified_title: string | null;
  intake_unified_category: string | null;
  intake_unified_priority: string | null;
  intake_unified_service_type: string | null;
  applicable_order_statuses: string[] | null;
  tag_codes: string[] | null;
};

function mapHelpSectionRow(r: Record<string, unknown>) {
  return {
    ticket_title_id: Number(r.ticket_title_id),
    title_code: r.title_code != null ? String(r.title_code) : null,
    title_text: r.title_text != null ? String(r.title_text) : null,
    subtext: r.subtext != null ? String(r.subtext) : null,
    section_id: r.section_id != null ? String(r.section_id) : null,
    display_order: r.display_order != null ? Number(r.display_order) : null,
    group_id: r.group_id != null ? Number(r.group_id) : null,
    group_code: r.group_code != null ? String(r.group_code) : null,
    group_name: r.group_name != null ? String(r.group_name) : null,
    parent_title_id: r.parent_title_id != null ? Number(r.parent_title_id) : null,
    intake_ticket_type: r.intake_ticket_type != null ? String(r.intake_ticket_type) : null,
    requires_order: String(r.intake_ticket_type ?? "").trim().toLowerCase() === "order_related",
    has_children: Boolean(r.has_children),
    applicable_order_statuses: Array.isArray(r.applicable_order_statuses)
      ? (r.applicable_order_statuses as string[])
      : null,
  };
}

async function loadRiderTitleRow(
  sql: ReturnType<typeof getSql>,
  opts: { ticketTitleId?: number | null; titleCode?: string },
): Promise<RiderTitleRow | null> {
  const { ticketTitleId, titleCode } = opts;
  if (ticketTitleId == null && !titleCode?.trim()) return null;

  const rows =
    ticketTitleId != null
      ? await sql`
          SELECT
            tt.id,
            tt.group_id,
            tg.group_code,
            tg.group_name,
            tt.customer_section_id,
            tt.title_text,
            tt.title_code,
            tt.subtext,
            tt.parent_title_id,
            tt.display_order,
            tt.intake_ticket_type,
            tt.intake_unified_title,
            tt.intake_unified_category,
            tt.intake_unified_priority,
            tt.intake_unified_service_type,
            tt.applicable_order_statuses,
            COALESCE(
              (
                SELECT array_agg(UPPER(TRIM(tg2.tag_code)) ORDER BY tg2.id)
                FROM ticket_title_tags ttm
                INNER JOIN ticket_tags tg2 ON tg2.id = ttm.tag_id
                WHERE ttm.ticket_title_id = tt.id
              ),
              CASE
                WHEN tt.tag_id IS NOT NULL THEN (
                  SELECT ARRAY[UPPER(TRIM(tg3.tag_code))]
                  FROM ticket_tags tg3 WHERE tg3.id = tt.tag_id LIMIT 1
                )
                ELSE NULL
              END
            ) AS tag_codes
          FROM ticket_titles tt
          LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
          WHERE tt.id = ${ticketTitleId}
            AND tt.is_active = TRUE
            AND tt.ticket_section::text = 'rider'
          LIMIT 1
        `
      : await sql`
          SELECT
            tt.id,
            tt.group_id,
            tg.group_code,
            tg.group_name,
            tt.customer_section_id,
            tt.title_text,
            tt.title_code,
            tt.subtext,
            tt.parent_title_id,
            tt.display_order,
            tt.intake_ticket_type,
            tt.intake_unified_title,
            tt.intake_unified_category,
            tt.intake_unified_priority,
            tt.intake_unified_service_type,
            tt.applicable_order_statuses,
            COALESCE(
              (
                SELECT array_agg(UPPER(TRIM(tg2.tag_code)) ORDER BY tg2.id)
                FROM ticket_title_tags ttm
                INNER JOIN ticket_tags tg2 ON tg2.id = ttm.tag_id
                WHERE ttm.ticket_title_id = tt.id
              ),
              CASE
                WHEN tt.tag_id IS NOT NULL THEN (
                  SELECT ARRAY[UPPER(TRIM(tg3.tag_code))]
                  FROM ticket_tags tg3 WHERE tg3.id = tt.tag_id LIMIT 1
                )
                ELSE NULL
              END
            ) AS tag_codes
          FROM ticket_titles tt
          LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
          WHERE UPPER(TRIM(tt.title_code)) = UPPER(TRIM(${titleCode!.trim()}))
            AND tt.is_active = TRUE
            AND tt.ticket_section::text = 'rider'
          LIMIT 1
        `;

  const r = (rows as Array<Record<string, unknown>>)[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    group_id: r.group_id != null ? Number(r.group_id) : null,
    group_code: r.group_code != null ? String(r.group_code) : null,
    group_name: r.group_name != null ? String(r.group_name) : null,
    customer_section_id: r.customer_section_id != null ? String(r.customer_section_id) : null,
    title_text: r.title_text != null ? String(r.title_text) : null,
    title_code: r.title_code != null ? String(r.title_code) : null,
    subtext: r.subtext != null ? String(r.subtext) : null,
    parent_title_id: r.parent_title_id != null ? Number(r.parent_title_id) : null,
    display_order: r.display_order != null ? Number(r.display_order) : null,
    intake_ticket_type: r.intake_ticket_type != null ? String(r.intake_ticket_type) : null,
    intake_unified_title: r.intake_unified_title != null ? String(r.intake_unified_title) : null,
    intake_unified_category: r.intake_unified_category != null ? String(r.intake_unified_category) : null,
    intake_unified_priority: r.intake_unified_priority != null ? String(r.intake_unified_priority) : null,
    intake_unified_service_type: r.intake_unified_service_type != null ? String(r.intake_unified_service_type) : null,
    applicable_order_statuses: Array.isArray(r.applicable_order_statuses)
      ? (r.applicable_order_statuses as string[])
      : null,
    tag_codes: Array.isArray(r.tag_codes) ? (r.tag_codes as string[]) : null,
  };
}

export async function riderSupportRoutes(app: FastifyInstance) {
  await app.register(auth, { required: false });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  /** Active rider help groups (dashboard Help topics tree roots). Public read for pre-login help. */
  app.get("/help-groups", async (req, reply) => {
    const sql = getSql();
    try {
      const rows = await sql`
        SELECT
          tg.id AS group_id,
          tg.group_code,
          tg.group_name,
          tg.group_description,
          tg.display_order,
          tg.ticket_category::text AS ticket_category
        FROM ticket_groups tg
        WHERE tg.is_active = TRUE
          AND tg.ticket_section::text = 'rider'
        ORDER BY tg.display_order ASC NULLS LAST, tg.group_name ASC
      `;
      const groups = (rows as Array<Record<string, unknown>>).map((r) => ({
        group_id: Number(r.group_id),
        group_code: String(r.group_code ?? ""),
        group_name: String(r.group_name ?? ""),
        group_description: r.group_description != null ? String(r.group_description) : null,
        display_order: r.display_order != null ? Number(r.display_order) : null,
        ticket_category: r.ticket_category != null ? String(r.ticket_category) : null,
      }));

      return reply.send({ ok: true, groups });
    } catch (e) {
      req.log.error({ err: e }, "rider help-groups failed");
      return reply.code(500).send({ error: "help_groups_failed" });
    }
  });

  /**
   * GET /help-sections — rider ticket_titles catalog (groups, tags, intake fields).
   * Query: group_code, section, parent_title_id (empty|root|<id>), order_status
   */
  /** Rider ticket_titles catalog. Public read for pre-login help topic browsing. */
  app.get("/help-sections", async (req, reply) => {
    const q = req.query as {
      section?: string;
      group_code?: string;
      parent_title_id?: string;
      order_status?: string;
      intake_only?: string;
      /** When true with group_code, return all titles in the group tree (any depth). */
      all_in_group?: string;
    };
    const section = String(q.section ?? "").trim().toLowerCase();
    const groupCode = String(q.group_code ?? "").trim();
    const parentRaw = String(q.parent_title_id ?? "").trim().toLowerCase();
    const orderStatus = String(q.order_status ?? "").trim();
    const intakeOnly = String(q.intake_only ?? "").trim().toLowerCase() === "true";
    const allInGroup = String(q.all_in_group ?? "").trim().toLowerCase() === "true";
    const sql = getSql();

    const parentIsRoot = parentRaw === "" || parentRaw === "root" || parentRaw === "null";
    const parentId =
      !parentIsRoot && /^\d+$/.test(parentRaw) ? Number(parentRaw) : null;

    try {
      const rows = await sql`
        SELECT
          tt.id AS ticket_title_id,
          tt.title_code,
          tt.title_text,
          tt.subtext,
          COALESCE(
            NULLIF(TRIM(tt.customer_section_id::text), ''),
            NULLIF(TRIM(tg.group_code::text), '')
          ) AS section_id,
          tt.display_order,
          tt.group_id,
          tg.group_code,
          tg.group_name,
          tt.parent_title_id,
          tt.intake_ticket_type,
          tt.applicable_order_statuses,
          EXISTS (
            SELECT 1
            FROM ticket_titles child
            WHERE child.parent_title_id = tt.id
              AND child.is_active = TRUE
              AND child.ticket_section::text = 'rider'
          ) AS has_children
        FROM ticket_titles tt
        LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
        WHERE tt.is_active = TRUE
          AND tt.ticket_section::text = 'rider'
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
          AND (
            ${section} = ''
            OR LOWER(TRIM(COALESCE(tt.customer_section_id::text, ''))) = ${section}
            OR LOWER(TRIM(COALESCE(tg.group_code::text, ''))) = ${section}
          )
          AND (
            ${groupCode} = ''
            OR tg.group_code = ${groupCode}
            OR EXISTS (
              WITH RECURSIVE title_ancestors AS (
                SELECT id, parent_title_id, group_id
                FROM ticket_titles
                WHERE id = tt.id
                UNION ALL
                SELECT p.id, p.parent_title_id, p.group_id
                FROM ticket_titles p
                INNER JOIN title_ancestors a ON p.id = a.parent_title_id
                WHERE a.parent_title_id IS NOT NULL
              )
              SELECT 1
              FROM title_ancestors a
              INNER JOIN ticket_groups g ON g.id = a.group_id
              WHERE g.group_code = ${groupCode}
                AND g.is_active = TRUE
              LIMIT 1
            )
            OR EXISTS (
              WITH RECURSIVE title_descendants AS (
                SELECT t.id, t.parent_title_id, t.group_id
                FROM ticket_titles t
                INNER JOIN ticket_groups g ON g.id = t.group_id AND g.group_code = ${groupCode}
                WHERE t.ticket_section::text = 'rider'
                  AND t.is_active = TRUE
                  AND g.is_active = TRUE
                UNION ALL
                SELECT c.id, c.parent_title_id, c.group_id
                FROM ticket_titles c
                INNER JOIN title_descendants d ON c.parent_title_id = d.id
                WHERE c.ticket_section::text = 'rider'
                  AND c.is_active = TRUE
              )
              SELECT 1 FROM title_descendants d WHERE d.id = tt.id LIMIT 1
            )
          )
          AND (
            ${allInGroup} = TRUE
            OR (${parentIsRoot} AND ${parentId == null} AND tt.parent_title_id IS NULL)
            OR (tt.parent_title_id = ${parentId ?? -1} AND ${parentId != null})
          )
          AND (
            ${orderStatus} = ''
            OR tt.applicable_order_statuses IS NULL
            OR ${orderStatus} = ANY(tt.applicable_order_statuses)
          )
          AND (
            ${intakeOnly} = FALSE
            OR NOT EXISTS (
              SELECT 1
              FROM ticket_titles child
              WHERE child.parent_title_id = tt.id
                AND child.is_active = TRUE
                AND child.ticket_section::text = 'rider'
            )
          )
        ORDER BY tt.display_order ASC NULLS LAST, tt.title_text ASC, tt.id ASC
        LIMIT 120
      `;

      const sections = (rows as Array<Record<string, unknown>>).map(mapHelpSectionRow);
      return reply.send({ ok: true, sections });
    } catch (e) {
      req.log.error({ err: e }, "rider help-sections failed");
      return reply.code(500).send({ error: "help_sections_failed" });
    }
  });

  app.get("/recent-orders", async (req, reply) => {
    if (req.auth?.role !== "rider" || !req.auth?.sub) {
      return reply.code(401).send({ error: "rider_required" });
    }
    const me = await resolveRider(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "rider_not_found" });

    const limit = Math.min(50, Math.max(1, Number((req.query as { limit?: string }).limit) || 10));
    const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);
    const scope = String((req.query as { scope?: string }).scope ?? "all")
      .trim()
      .toLowerCase();
    const sql = getSql();

    const activeStatuses = [
      "assigned",
      "accepted",
      "reached_store",
      "reached_user",
      "picked_up",
      "in_transit",
    ];

    const rows =
      scope === "active"
        ? await sql`
            SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.status::text AS status, oc.current_status,
                   oc.grand_total, oc.placed_at, oc.actual_delivery_time AS delivered_at,
                   oc.merchant_store_id,
                   ms.store_name AS merchant_store_name
            FROM orders_core oc
            LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
            WHERE oc.rider_id = ${me.id}
              AND oc.status::text = ANY(${activeStatuses})
            ORDER BY oc.placed_at DESC NULLS LAST, oc.id DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : scope === "completed"
          ? await sql`
              SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.status::text AS status, oc.current_status,
                     oc.grand_total, oc.placed_at, oc.actual_delivery_time AS delivered_at,
                     oc.merchant_store_id,
                     ms.store_name AS merchant_store_name
              FROM orders_core oc
              LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
              WHERE oc.rider_id = ${me.id}
                AND oc.status::text = 'delivered'
              ORDER BY oc.actual_delivery_time DESC NULLS LAST, oc.placed_at DESC NULLS LAST, oc.id DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          : await sql`
              SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.status::text AS status, oc.current_status,
                     oc.grand_total, oc.placed_at, oc.actual_delivery_time AS delivered_at,
                     oc.merchant_store_id,
                     ms.store_name AS merchant_store_name
              FROM orders_core oc
              LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
              WHERE oc.rider_id = ${me.id}
              ORDER BY oc.placed_at DESC NULLS LAST, oc.id DESC
              LIMIT ${limit} OFFSET ${offset}
            `;

    const orders = (rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      order_id: r.order_id != null ? String(r.order_id) : null,
      formatted_order_id: r.formatted_order_id != null ? String(r.formatted_order_id) : null,
      status: r.status != null ? String(r.status) : "assigned",
      current_status: r.current_status != null ? String(r.current_status) : null,
      grand_total: r.grand_total != null ? Number(r.grand_total) : null,
      placed_at: toIsoOrNull(r.placed_at),
      delivered_at: toIsoOrNull(r.delivered_at),
      merchant_store_name: r.merchant_store_name != null ? String(r.merchant_store_name) : null,
    }));

    return reply.send({ ok: true, orders, hasMore: orders.length === limit });
  });

  app.post("/tickets", async (req, reply) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const preLogin = isPreLoginRequest(body);

    let me: Awaited<ReturnType<typeof resolveRider>> | null = null;
    if (preLogin) {
      if (req.auth?.role === "rider" && req.auth?.sub) {
        me = await resolveRider(req.auth.sub);
      }
    } else {
      if (req.auth?.role !== "rider" || !req.auth?.sub) {
        return reply.code(401).send({ error: "rider_required" });
      }
      me = await resolveRider(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "rider_not_found" });
    }

    const subjectRaw = typeof body.subject === "string" ? body.subject.trim() : "";
    const descriptionRaw = typeof body.description === "string" ? body.description.trim() : "";
    if (!subjectRaw || subjectRaw.length > 500) {
      return reply.code(400).send({ error: "invalid_subject" });
    }
    if (!descriptionRaw || descriptionRaw.length > 10000) {
      return reply.code(400).send({ error: "invalid_description" });
    }

    let raisedByName: string | null = null;
    let raisedByMobile: string | null = null;
    let raisedByEmail: string | null = null;

    if (preLogin) {
      raisedByName = normRaisedByName(body.raised_by_name);
      raisedByMobile = normRaisedByMobile(body.raised_by_mobile);
      raisedByEmail = normRaisedByEmail(body.raised_by_email);
      if (!raisedByName) return reply.code(400).send({ error: "invalid_name" });
      if (!raisedByMobile && !raisedByEmail) {
        return reply.code(400).send({ error: "contact_required" });
      }
    }

    const rawTid = body.ticket_title_id;
    let ticketTitleId =
      typeof rawTid === "number" && Number.isInteger(rawTid) && rawTid > 0
        ? rawTid
        : typeof rawTid === "string" && /^\d+$/.test(rawTid.trim())
          ? Number(rawTid.trim())
          : null;

    const sectionCode =
      typeof body.section_code === "string" ? body.section_code.trim().toLowerCase() : "";
    const titleCodeFallback =
      typeof body.title_code === "string" ? body.title_code.trim() : "";

    const sql = getSql();

    let titleRow = await loadRiderTitleRow(sql, {
      ticketTitleId,
      titleCode: ticketTitleId == null ? titleCodeFallback : undefined,
    });

    if (!titleRow && ticketTitleId != null) {
      return reply.code(400).send({ error: "invalid_ticket_title_id" });
    }

    if (!titleRow && titleCodeFallback) {
      titleRow = await loadRiderTitleRow(sql, { titleCode: titleCodeFallback });
    }

    if (titleRow) ticketTitleId = titleRow.id;

    const rawOrderId = body.order_id;
    let orderIdNum: number | null =
      typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
        ? rawOrderId
        : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
          ? Number(rawOrderId.trim())
          : null;

    let merchantStoreId: number | null = null;
    let merchantParentId: number | null = null;
    let customerId: number | null = null;

    if (orderIdNum != null) {
      if (preLogin || !me) {
        return reply.code(400).send({ error: "order_not_allowed_pre_login" });
      }
      const ordRows = await sql`
        SELECT id, merchant_store_id, merchant_parent_id, customer_id
        FROM orders_core
        WHERE id = ${orderIdNum} AND rider_id = ${me.id}
        LIMIT 1
      `;
      const ord = (ordRows as Array<Record<string, unknown>>)[0];
      if (!ord) return reply.code(404).send({ error: "order_not_found" });
      orderIdNum = Number(ord.id);
      merchantStoreId = ord.merchant_store_id != null ? Number(ord.merchant_store_id) : null;
      merchantParentId = ord.merchant_parent_id != null ? Number(ord.merchant_parent_id) : null;
      customerId = ord.customer_id != null ? Number(ord.customer_id) : null;
    }

    const intakeType = String(titleRow?.intake_ticket_type ?? "").trim().toLowerCase();
    const ticketType =
      orderIdNum != null || intakeType === "order_related"
        ? "ORDER_RELATED"
        : "NON_ORDER_RELATED";

    const rawIntakeTitle =
      titleRow?.intake_unified_title?.trim() ||
      titleRow?.title_code?.trim() ||
      titleCodeFallback ||
      "RIDER_SUPPORT_QUERY";
    const ticketTitleForInsert = await resolveTicketTitleForUnifiedTicketsInsert(sql, rawIntakeTitle);

    const ticketCategory = normCategory(
      titleRow?.intake_unified_category ||
        (orderIdNum != null ? "ORDER" : intakeType === "order_related" ? "ORDER" : "OTHER"),
    );
    let priority = normPriority(titleRow?.intake_unified_priority || "MEDIUM");
    if (orderIdNum != null) priority = "HIGH";
    const serviceType = normServiceType(
      orderIdNum != null
        ? titleRow?.intake_unified_service_type || "FOOD"
        : titleRow?.intake_unified_service_type || "GENERAL",
    );

    const groupId = titleRow?.group_id ?? null;
    const tagCodes =
      titleRow?.tag_codes && titleRow.tag_codes.length > 0
        ? titleRow.tag_codes.map((c) => String(c).trim()).filter(Boolean)
        : [];
    const tagList = Array.from(
      new Set(preLogin ? [...tagCodes, PRE_LOGIN_TAG] : tagCodes),
    );
    const tagsArrayLiteral = buildTagsArrayLiteral(tagList.length > 0 ? tagList : null);

    const photoUris = Array.isArray(body.photo_uris)
      ? (body.photo_uris as unknown[])
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim())
          .slice(0, 5)
      : [];

    const metadataJson = JSON.stringify({
      rider_help: {
        section_id: (titleRow?.customer_section_id ?? sectionCode) || null,
        group_code: titleRow?.group_code ?? null,
        ticket_title_id: ticketTitleId,
        title_code: (titleRow?.title_code ?? titleCodeFallback) || null,
        source_platform: "RIDER_APP",
        pre_login: preLogin,
        attachment_uris: photoUris.length > 0 ? photoUris : null,
      },
    });

    const riderIdVal = preLogin ? null : me!.id;
    const raisedByIdVal = preLogin ? null : me!.id;
    const raisedNameVal = preLogin ? raisedByName : me!.name;
    const raisedMobileVal = preLogin ? raisedByMobile : me!.mobile;
    const raisedEmailVal = preLogin ? raisedByEmail : null;

    const insertRows = await sql`
      INSERT INTO unified_tickets (
        ticket_type, ticket_source, service_type, ticket_title, ticket_category,
        order_id, customer_id, rider_id, merchant_store_id, merchant_parent_id,
        raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
        subject, description, priority, status, auto_generated,
        group_id, tags, metadata
      ) VALUES (
        ${ticketType}::unified_ticket_type,
        'RIDER'::unified_ticket_source,
        ${serviceType}::unified_ticket_service_type,
        ${ticketTitleForInsert},
        ${ticketCategory}::unified_ticket_category,
        ${orderIdNum},
        ${customerId},
        ${riderIdVal},
        ${merchantStoreId},
        ${merchantParentId},
        'RIDER'::unified_ticket_source,
        ${raisedByIdVal},
        ${raisedNameVal},
        ${raisedMobileVal},
        ${raisedEmailVal},
        ${subjectRaw},
        ${descriptionRaw},
        ${priority}::unified_ticket_priority,
        'OPEN'::unified_ticket_status,
        FALSE,
        ${groupId},
        ${tagsArrayLiteral}::text[],
        ${metadataJson}::text::jsonb
      )
      RETURNING id, ticket_id, status, priority, subject, description, created_at
    `;

    const row = (insertRows as Array<Record<string, unknown>>)[0];
    if (!row) return reply.code(500).send({ error: "ticket_create_failed" });

    return reply.send({
      ok: true,
      ticket: {
        id: Number(row.id),
        ticket_id: String(row.ticket_id ?? ""),
        status: String(row.status ?? "OPEN"),
        priority: String(row.priority ?? "MEDIUM"),
        subject: row.subject ?? null,
        description: row.description ?? null,
        created_at: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
      },
    });
  });

  app.get("/tickets", async (req, reply) => {
    if (req.auth?.role !== "rider" || !req.auth?.sub) {
      return reply.code(401).send({ error: "rider_required" });
    }
    const me = await resolveRider(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "rider_not_found" });

    const limit = Math.min(100, Math.max(1, Number((req.query as { limit?: string }).limit) || 50));
    const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);
    const sql = getSql();

    const rows = await sql`
      SELECT id, ticket_id, status, priority, ticket_title, ticket_category,
             subject, description, created_at, updated_at, order_id,
             resolved_at, last_response_at, last_response_by_type
      FROM unified_tickets
      WHERE rider_id = ${me.id}
        AND raised_by_type = 'RIDER'::unified_ticket_source
        AND ticket_source = 'RIDER'::unified_ticket_source
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const tickets = (rows as Array<Record<string, unknown>>).map((t) => ({
      id: Number(t.id),
      ticket_id: String(t.ticket_id ?? ""),
      status: String(t.status ?? ""),
      priority: String(t.priority ?? ""),
      ticket_title: t.ticket_title != null ? String(t.ticket_title) : null,
      ticket_category: t.ticket_category != null ? String(t.ticket_category) : null,
      subject: t.subject ?? null,
      description: t.description ?? null,
      order_id: t.order_id != null ? Number(t.order_id) : null,
      created_at: toIsoOrNull(t.created_at) ?? new Date().toISOString(),
      updated_at: toIsoOrNull(t.updated_at),
      resolved_at: toIsoOrNull(t.resolved_at),
      last_response_at: toIsoOrNull(t.last_response_at),
      last_response_by_type: t.last_response_by_type != null ? String(t.last_response_by_type) : null,
    }));

    return reply.send({ ok: true, tickets });
  });

  app.get<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/messages",
    async (req, reply) => {
      if (req.auth?.role !== "rider" || !req.auth?.sub) {
        return reply.code(401).send({ error: "rider_required" });
      }
      const me = await resolveRider(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "rider_not_found" });

      const ticketIdNum = Number(req.params.ticketId);
      if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
        return reply.code(400).send({ error: "invalid_ticket_id" });
      }
      const sql = getSql();

      const ticketRows = await sql`
        SELECT id, ticket_id, status, priority, ticket_title, ticket_category,
               subject, description, order_id, created_at, updated_at,
               resolved_at, last_response_at, last_response_by_type,
               satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
        FROM unified_tickets
        WHERE id = ${ticketIdNum}
          AND rider_id = ${me.id}
          AND raised_by_type = 'RIDER'::unified_ticket_source
          AND ticket_source = 'RIDER'::unified_ticket_source
        LIMIT 1
      `;
      const tr = (ticketRows as Array<Record<string, unknown>>)[0];
      if (!tr) return reply.code(404).send({ error: "ticket_not_found" });

      const ticket = mapRiderTicketRow(tr);

      const msgRows = await sql`
        SELECT id, message_text, message_type, sender_type, sender_id, sender_name,
               attachments, created_at, is_internal_note
        FROM unified_ticket_messages
        WHERE ticket_id = ${ticketIdNum}
          AND COALESCE(is_internal_note, FALSE) = FALSE
        ORDER BY created_at ASC, id ASC
      `;
      const messages = (msgRows as Array<Record<string, unknown>>).map((m) => ({
        id: Number(m.id),
        message_text: m.message_text != null ? String(m.message_text) : "",
        message_type: m.message_type != null ? String(m.message_type) : "TEXT",
        sender_type: m.sender_type != null ? String(m.sender_type) : null,
        sender_id: m.sender_id != null ? Number(m.sender_id) : null,
        sender_name: m.sender_name != null ? String(m.sender_name) : null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        created_at: toIsoOrNull(m.created_at) ?? new Date().toISOString(),
      }));

      return reply.send({ ok: true, ticket, messages });
    },
  );

  app.post<{
    Params: { ticketId: string };
    Body: { message_text?: string; attachments?: unknown };
  }>("/tickets/:ticketId/messages", async (req, reply) => {
    const ticketIdNum = Number(req.params.ticketId);
    if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
      return reply.code(400).send({ error: "invalid_ticket_id" });
    }

    const sql = getSql();
    let me: Awaited<ReturnType<typeof resolveRider>> | null = null;
    let preLoginTicket: Record<string, unknown> | null = null;

    if (req.auth?.role === "rider" && req.auth?.sub) {
      me = await resolveRider(req.auth.sub);
    }
    if (!me) {
      preLoginTicket = await loadPreLoginRiderTicket(sql, ticketIdNum);
      if (!preLoginTicket) {
        return reply.code(401).send({ error: "rider_required" });
      }
    }

    const body = (req.body || {}) as { message_text?: string; attachments?: unknown };
    const text = (body.message_text || "").toString().trim();
    const attachments = normalizeTicketAttachmentsForDb(body.attachments);
    if (!text && attachments.length === 0) {
      return reply.code(400).send({
        error: "invalid_body",
        message: "message_text or attachments required",
      });
    }
    const messageText =
      text || (attachments.length > 1 ? "Shared attachments" : "Shared an attachment");

    if (me) {
      const ticketRows = await sql`
        SELECT id, status FROM unified_tickets
        WHERE id = ${ticketIdNum}
          AND rider_id = ${me.id}
          AND raised_by_type = 'RIDER'::unified_ticket_source
          AND ticket_source = 'RIDER'::unified_ticket_source
        LIMIT 1
      `;
      if ((ticketRows as Array<unknown>).length === 0) {
        return reply.code(404).send({ error: "ticket_not_found" });
      }
    }

    const senderId = me?.id ?? null;
    const senderName = me?.name ?? String(preLoginTicket?.raised_by_name ?? "Rider");

    const dup = await sql`
      SELECT id, created_at FROM unified_ticket_messages
      WHERE ticket_id = ${ticketIdNum}
        AND sender_type = 'RIDER'::unified_ticket_source
        AND (
          (${senderId}::bigint IS NOT NULL AND sender_id = ${senderId})
          OR (${senderId}::bigint IS NULL AND sender_id IS NULL)
        )
        AND COALESCE(is_internal_note, FALSE) = FALSE
        AND BTRIM(COALESCE(message_text, '')) = ${messageText}
        AND created_at >= (NOW() - INTERVAL '20 seconds')
      ORDER BY id DESC
      LIMIT 1
    `;
    if ((dup as Array<unknown>).length > 0) {
      const d = (dup as Array<Record<string, unknown>>)[0];
      return reply.send({
        ok: true,
        deduped_existing_message: true,
        message: {
          id: Number(d.id),
          message_text: messageText,
          sender_type: "RIDER",
          sender_id: senderId,
          created_at: toIsoOrNull(d.created_at) ?? new Date().toISOString(),
        },
      });
    }

    const rows = await sql`
      INSERT INTO unified_ticket_messages (
        ticket_id, message_text, message_type,
        sender_type, sender_id, sender_name,
        attachments, is_internal_note
      ) VALUES (
        ${ticketIdNum}, ${messageText}, 'TEXT',
        'RIDER'::unified_ticket_source, ${senderId}, ${senderName},
        ${attachments}::text[], FALSE
      )
      RETURNING id, created_at
    `;
    const row = (rows as Array<Record<string, unknown>>)[0];

    try {
      await sql`
        UPDATE unified_tickets
        SET last_response_at = NOW(),
            last_response_by_type = 'RIDER'::unified_ticket_source,
            last_response_by_id = ${senderId},
            updated_at = NOW(),
            status = CASE
              WHEN status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
                THEN 'REOPENED'::unified_ticket_status
              ELSE status
            END
        WHERE id = ${ticketIdNum}
      `;
    } catch (e) {
      req.log.warn({ err: e }, "rider reply: last_response_at update skipped");
    }

    return reply.send({
      ok: true,
      message: {
        id: Number(row?.id),
        message_text: messageText,
        sender_type: "RIDER",
        sender_id: senderId,
        created_at: toIsoOrNull(row?.created_at) ?? new Date().toISOString(),
      },
    });
  });

  app.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/upload",
    async (req, reply) => {
      const ticketIdNum = Number(req.params.ticketId);
      if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
        return reply.code(400).send({ error: "invalid_ticket_id" });
      }
      const sql = getSql();

      let me: Awaited<ReturnType<typeof resolveRider>> | null = null;
      if (req.auth?.role === "rider" && req.auth?.sub) {
        me = await resolveRider(req.auth.sub);
      }

      if (me) {
        const owns = await sql`
          SELECT id FROM unified_tickets
          WHERE id = ${ticketIdNum}
            AND rider_id = ${me.id}
            AND raised_by_type = 'RIDER'::unified_ticket_source
            AND ticket_source = 'RIDER'::unified_ticket_source
          LIMIT 1
        `;
        if ((owns as Array<unknown>).length === 0) {
          return reply.code(404).send({ error: "ticket_not_found" });
        }
      } else {
        const preLoginTicket = await loadPreLoginRiderTicket(sql, ticketIdNum);
        if (!preLoginTicket) {
          return reply.code(401).send({ error: "rider_required" });
        }
      }

      const filePart = await (req as unknown as { file?: () => Promise<{
        filename?: string;
        mimetype?: string;
        toBuffer: () => Promise<Buffer>;
      } | undefined> }).file?.();
      if (!filePart) return reply.code(400).send({ error: "no_file" });
      const buffer = await filePart.toBuffer();
      if (!buffer || buffer.length === 0) return reply.code(400).send({ error: "empty_file" });
      if (buffer.length > 25 * 1024 * 1024) return reply.code(400).send({ error: "file_too_large" });

      const originalName = String(filePart.filename || "file");
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
      const mime = String(filePart.mimetype || "application/octet-stream");
      const allowed = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i;
      if (!allowed.test(mime)) {
        return reply.code(400).send({
          error: "unsupported_mime_type",
          message: "Only images and PDFs allowed.",
        });
      }
      const { randomUUID } = await import("crypto");
      const r2Key = `tickets/images/${ticketIdNum}/${randomUUID()}-${safeName}`;

      try {
        const { uploadToR2 } = await import("../../services/r2/r2Service.js");
        const uploaded = await uploadToR2(buffer, r2Key, mime);
        return reply.code(201).send({
          ok: true,
          attachment: {
            storageKey: uploaded.key,
            url: attachmentsProxyUrlFromKeyForApi(uploaded.key),
            name: originalName,
            mimeType: mime,
          },
        });
      } catch (e) {
        req.log.error({ err: e }, "rider ticket upload failed");
        return reply.code(500).send({ error: "upload_failed" });
      }
    },
  );

  app.post<{
    Params: { ticketId: string };
    Body: { rating?: number; feedback?: string };
  }>("/tickets/:ticketId/rating", async (req, reply) => {
    if (req.auth?.role !== "rider" || !req.auth?.sub) {
      return reply.code(401).send({ error: "rider_required" });
    }
    const me = await resolveRider(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "rider_not_found" });

    const ticketIdNum = Number(req.params.ticketId);
    if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
      return reply.code(400).send({ error: "invalid_ticket_id" });
    }
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return reply.code(400).send({ error: "invalid_rating" });
    }
    const feedback =
      typeof req.body?.feedback === "string" && req.body.feedback.trim()
        ? req.body.feedback.trim().slice(0, 2000)
        : null;

    const sql = getSql();
    const rows = await sql`
      UPDATE unified_tickets
      SET satisfaction_rating = ${rating},
          satisfaction_feedback = ${feedback},
          satisfaction_collected_at = NOW(),
          updated_at = NOW()
      WHERE id = ${ticketIdNum}
        AND rider_id = ${me.id}
        AND raised_by_type = 'RIDER'::unified_ticket_source
        AND ticket_source = 'RIDER'::unified_ticket_source
        AND status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
      RETURNING id, ticket_id, status, priority, ticket_title, ticket_category,
                subject, description, order_id, created_at, updated_at,
                resolved_at, last_response_at, last_response_by_type,
                satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
    `;
    if ((rows as Array<unknown>).length === 0) {
      return reply.code(400).send({
        error: "rating_not_allowed",
        message: "Ticket must be resolved or closed.",
      });
    }
    const tr = (rows as Array<Record<string, unknown>>)[0];
    return reply.send({ ok: true, ticket: mapRiderTicketRow(tr) });
  });

  app.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/reopen",
    async (req, reply) => {
      if (req.auth?.role !== "rider" || !req.auth?.sub) {
        return reply.code(401).send({ error: "rider_required" });
      }
      const me = await resolveRider(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "rider_not_found" });

      const ticketIdNum = Number(req.params.ticketId);
      if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
        return reply.code(400).send({ error: "invalid_ticket_id" });
      }

      const sql = getSql();
      const rows = await sql`
        UPDATE unified_tickets
        SET status = 'REOPENED'::unified_ticket_status,
            resolved_at = NULL,
            updated_at = NOW(),
            reopen_count = COALESCE(reopen_count, 0) + 1
        WHERE id = ${ticketIdNum}
          AND rider_id = ${me.id}
          AND raised_by_type = 'RIDER'::unified_ticket_source
          AND ticket_source = 'RIDER'::unified_ticket_source
          AND status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
        RETURNING id, ticket_id, status, priority, ticket_title, ticket_category,
                  subject, description, order_id, created_at, updated_at,
                  resolved_at, last_response_at, last_response_by_type,
                  satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
      `;
      if ((rows as Array<unknown>).length === 0) {
        return reply.code(400).send({
          error: "reopen_not_allowed",
          message: "Only resolved or closed tickets can be reopened.",
        });
      }
      const tr = (rows as Array<Record<string, unknown>>)[0];
      return reply.send({ ok: true, ticket: mapRiderTicketRow(tr) });
    },
  );
}
