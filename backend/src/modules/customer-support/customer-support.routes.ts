/**
 * Customer support tickets – mirrors /v1/merchant-partner/stores/.../tickets/*
 * but for the customer actor. Writes to the SAME `unified_tickets` and
 * `unified_ticket_messages` tables the agent dashboard reads from, so customer
 * tickets land in the agent queue automatically — no parallel data plane.
 *
 * Surface:
 *   GET  /v1/customer-support/help-sections
 *   POST /v1/customer-support/tickets
 *   GET  /v1/customer-support/tickets
 *   GET  /v1/customer-support/tickets/:ticketId/messages
 *   POST /v1/customer-support/tickets/:ticketId/messages
 *   POST /v1/customer-support/tickets/:ticketId/upload
 *   POST /v1/customer-support/tickets/:ticketId/rating
 *   POST /v1/customer-support/tickets/:ticketId/reopen
 *
 * Auth: requires customer JWT (`req.auth.role === "customer"`, `req.auth.sub`
 * is the `customers.customer_id` text uuid). Ownership is enforced on every
 * read/write by joining through `customers.id` ↔ `unified_tickets.customer_id`.
 *
 * Internal notes are never returned to customers.
 */

import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";
import { getDb } from "../../db/client.js";
import { eq } from "drizzle-orm";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

const UNIFIED_CATEGORY_ENUM = new Set([
  "ORDER", "PAYMENT", "DELIVERY", "REFUND", "ACCOUNT",
  "TECHNICAL", "EARNINGS", "VERIFICATION", "COMPLAINT", "FEEDBACK", "OTHER",
]);
const UNIFIED_PRIORITY_ENUM = new Set(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]);
const UNIFIED_SERVICE_ENUM = new Set(["FOOD", "PARCEL", "RIDE", "GENERAL"]);

function normCategory(raw: unknown): string {
  const k = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  return UNIFIED_CATEGORY_ENUM.has(k) ? k : "OTHER";
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
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Resolve JWT sub (customer_id text uuid) to numeric customers.id. */
async function resolveCustomerInternalId(sub: string): Promise<{
  id: number;
  name: string | null;
  email: string | null;
  mobile: string | null;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: customers.id,
      name: customers.fullName,
      email: customers.email,
      mobile: customers.primaryMobile,
    })
    .from(customers)
    .where(eq(customers.customerId, sub))
    .limit(1);
  const row = rows[0];
  if (!row || !Number.isFinite(Number(row.id))) return null;
  return {
    id: Number(row.id),
    name: row.name?.toString().trim() || null,
    email: row.email?.toString().trim() || null,
    mobile: row.mobile?.toString().trim() || null,
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */

export async function customerSupportRoutes(app: FastifyInstance) {
  // Public health probe? None. Everything below requires auth.
  await app.register(auth, { required: true });

  /**
   * GET /help-sections — Title catalog filtered to customer-facing intake.
   * Group by `customer_section_id` (admin-curated) so the app can render a
   * sectioned picker: General / Orders / Account / Payments / etc.
   */
  app.get("/help-sections", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const sql = getSql();
    try {
      const rows = await sql`
        SELECT
          tt.id            AS ticket_title_id,
          tt.title_code    AS title_code,
          tt.title_text    AS title_text,
          tt.customer_section_id AS section_id,
          tt.display_order AS display_order,
          tt.group_id      AS group_id,
          tg.group_name    AS group_name,
          tt.intake_unified_title    AS intake_title,
          tt.intake_unified_category AS intake_category,
          tt.intake_unified_priority AS intake_priority,
          tt.intake_unified_service_type AS intake_service_type
        FROM ticket_titles tt
        LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
        WHERE tt.is_active = TRUE
          AND tt.ticket_section::text = 'customer'
          AND tt.customer_section_id IS NOT NULL
          AND TRIM(tt.customer_section_id::text) <> ''
        ORDER BY tt.customer_section_id ASC, tt.display_order ASC NULLS LAST, tt.id ASC
      `;
      const sections = (rows as Array<Record<string, unknown>>).map((r) => ({
        ticket_title_id: Number(r.ticket_title_id),
        title_code: r.title_code != null ? String(r.title_code) : null,
        title_text: r.title_text != null ? String(r.title_text) : null,
        section_id: r.section_id != null ? String(r.section_id) : null,
        display_order: r.display_order != null ? Number(r.display_order) : null,
        group_id: r.group_id != null ? Number(r.group_id) : null,
        group_name: r.group_name != null ? String(r.group_name) : null,
      }));
      return reply.send({ ok: true, sections });
    } catch (e) {
      req.log.error({ err: e }, "customer help-sections failed");
      return reply.code(500).send({ error: "help_sections_failed" });
    }
  });

  /**
   * POST /tickets — raise a new customer ticket.
   * Body: { ticket_title_id?, section_code?, subject, description, order_id? }
   * If ticket_title_id is set, group_id / priority / category / tags are
   * pulled from the catalog row. order_id (when present) flips ticket_type
   * to ORDER_RELATED and resolves merchant_store_id/merchant_parent_id from
   * orders_core so the order shows up in the agent dashboard sidebar.
   */
  app.post<{
    Body: {
      ticket_title_id?: number | string | null;
      section_code?: string;
      subject?: string;
      description?: string;
      order_id?: number | string | null;
    };
  }>("/tickets", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const body = (req.body || {}) as Record<string, unknown>;
    const rawTid = body.ticket_title_id;
    const ticketTitleId =
      typeof rawTid === "number" && Number.isInteger(rawTid) && rawTid > 0
        ? rawTid
        : typeof rawTid === "string" && /^\d+$/.test(rawTid.trim())
          ? Number(rawTid.trim())
          : null;

    const subjectRaw = typeof body.subject === "string" ? body.subject.trim() : "";
    const descriptionRaw = typeof body.description === "string" ? body.description.trim() : "";
    if (!subjectRaw || subjectRaw.length > 500) {
      return reply.code(400).send({ error: "invalid_subject" });
    }
    if (!descriptionRaw || descriptionRaw.length > 10000) {
      return reply.code(400).send({ error: "invalid_description" });
    }

    const sql = getSql();

    // Look up the title row (catalog) to derive routing + classification.
    type TitleRow = {
      id: number;
      group_id: number | null;
      customer_section_id: string | null;
      title_text: string | null;
      intake_unified_title: string | null;
      intake_unified_category: string | null;
      intake_unified_priority: string | null;
      intake_unified_service_type: string | null;
      tag_codes: string[] | null;
    };
    let titleRow: TitleRow | null = null;
    if (ticketTitleId != null) {
      const tr = await sql`
        SELECT
          tt.id, tt.group_id, tt.customer_section_id, tt.title_text,
          tt.intake_unified_title, tt.intake_unified_category,
          tt.intake_unified_priority, tt.intake_unified_service_type,
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
        WHERE tt.id = ${ticketTitleId}
          AND tt.is_active = TRUE
          AND tt.ticket_section::text = 'customer'
        LIMIT 1
      `;
      const r = (tr as Array<Record<string, unknown>>)[0];
      if (!r) return reply.code(400).send({ error: "invalid_ticket_title_id" });
      titleRow = {
        id: Number(r.id),
        group_id: r.group_id != null ? Number(r.group_id) : null,
        customer_section_id: r.customer_section_id != null ? String(r.customer_section_id) : null,
        title_text: r.title_text != null ? String(r.title_text) : null,
        intake_unified_title: r.intake_unified_title != null ? String(r.intake_unified_title) : null,
        intake_unified_category: r.intake_unified_category != null ? String(r.intake_unified_category) : null,
        intake_unified_priority: r.intake_unified_priority != null ? String(r.intake_unified_priority) : null,
        intake_unified_service_type: r.intake_unified_service_type != null ? String(r.intake_unified_service_type) : null,
        tag_codes: Array.isArray(r.tag_codes) ? (r.tag_codes as string[]) : null,
      };
    }

    // Resolve order context if order_id is provided.
    const rawOrderId = body.order_id;
    const orderIdNum =
      typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
        ? rawOrderId
        : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
          ? Number(rawOrderId.trim())
          : null;
    let orderContext: {
      orderInternalId: number;
      merchantStoreId: number | null;
      merchantParentId: number | null;
      riderId: number | null;
    } | null = null;
    if (orderIdNum != null) {
      const ordRows = await sql`
        SELECT id, merchant_store_id, merchant_parent_id, rider_id
        FROM orders_core
        WHERE id = ${orderIdNum} AND customer_id = ${me.id}
        LIMIT 1
      `;
      const ord = (ordRows as Array<Record<string, unknown>>)[0];
      if (!ord) return reply.code(404).send({ error: "order_not_found" });
      orderContext = {
        orderInternalId: Number(ord.id),
        merchantStoreId: ord.merchant_store_id != null ? Number(ord.merchant_store_id) : null,
        merchantParentId: ord.merchant_parent_id != null ? Number(ord.merchant_parent_id) : null,
        riderId: ord.rider_id != null ? Number(ord.rider_id) : null,
      };
    }

    const ticketType = orderContext ? "ORDER_RELATED" : "NON_ORDER_RELATED";
    const ticketTitle =
      (titleRow?.intake_unified_title && titleRow.intake_unified_title.trim()) ||
      titleRow?.title_text?.trim() ||
      "CUSTOMER_GENERAL_QUERY";
    const ticketCategory = normCategory(
      titleRow?.intake_unified_category || (orderContext ? "ORDER" : "OTHER")
    );
    const priority = normPriority(titleRow?.intake_unified_priority || "MEDIUM");
    const serviceType = normServiceType(titleRow?.intake_unified_service_type || "GENERAL");
    const groupId = titleRow?.group_id ?? null;

    const tagList =
      titleRow?.tag_codes && titleRow.tag_codes.length > 0
        ? Array.from(new Set(titleRow.tag_codes.map((c) => String(c).trim()).filter(Boolean)))
        : null;
    const tagsArrayLiteral =
      tagList == null
        ? null
        : `{${tagList
            .map((s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
            .join(",")}}`;

    const metadataJson = JSON.stringify({
      customer_help: {
        section_id: titleRow?.customer_section_id ?? body.section_code ?? null,
        ticket_title_id: titleRow?.id ?? null,
        source_platform: "CUSTOMER_APP",
        order_id_app: orderIdNum,
      },
    });

    const insertRows = await sql`
      INSERT INTO unified_tickets (
        ticket_type, ticket_source, service_type, ticket_title, ticket_category,
        order_id, customer_id, rider_id, merchant_store_id, merchant_parent_id,
        raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
        subject, description, priority, status, auto_generated,
        group_id, tags, metadata
      ) VALUES (
        ${ticketType}::unified_ticket_type,
        'CUSTOMER'::unified_ticket_source,
        ${serviceType}::unified_ticket_service_type,
        ${ticketTitle},
        ${ticketCategory}::unified_ticket_category,
        ${orderContext?.orderInternalId ?? null},
        ${me.id},
        ${orderContext?.riderId ?? null},
        ${orderContext?.merchantStoreId ?? null},
        ${orderContext?.merchantParentId ?? null},
        'CUSTOMER'::unified_ticket_source,
        ${me.id},
        ${me.name},
        ${me.mobile},
        ${me.email},
        ${subjectRaw},
        ${descriptionRaw},
        ${priority}::unified_ticket_priority,
        'OPEN'::unified_ticket_status,
        FALSE,
        ${groupId},
        ${tagsArrayLiteral}::text[],
        ${metadataJson}::jsonb
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

  /**
   * GET /tickets — list this customer's tickets.
   */
  app.get<{
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/tickets", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const statusFilter = (req.query.status || "").toString().trim().toUpperCase();

    const sql = getSql();
    const rows =
      statusFilter && /^[A-Z_]+$/.test(statusFilter)
        ? await sql`
            SELECT id, ticket_id, status, priority, ticket_title, ticket_category,
                   subject, description, created_at, updated_at, order_id,
                   resolved_at, last_response_at, last_response_by_type
            FROM unified_tickets
            WHERE customer_id = ${me.id}
              AND ticket_source = 'CUSTOMER'::unified_ticket_source
              AND status = ${statusFilter}::unified_ticket_status
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT id, ticket_id, status, priority, ticket_title, ticket_category,
                   subject, description, created_at, updated_at, order_id,
                   resolved_at, last_response_at, last_response_by_type
            FROM unified_tickets
            WHERE customer_id = ${me.id}
              AND ticket_source = 'CUSTOMER'::unified_ticket_source
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

  /**
   * GET /tickets/:ticketId/messages — get the ticket + its message history.
   * Customer never sees internal notes.
   */
  app.get<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/messages",
    async (req, reply) => {
      if (req.auth?.role !== "customer" || !req.auth?.sub) {
        return reply.code(401).send({ error: "customer_required" });
      }
      const me = await resolveCustomerInternalId(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "customer_not_found" });

      const ticketIdNum = Number(req.params.ticketId);
      if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
        return reply.code(400).send({ error: "invalid_ticket_id" });
      }
      const sql = getSql();

      // Wake stale-snoozed ticket if its snooze window has passed (same UX as merchant route).
      try {
        await sql`
          UPDATE unified_tickets
          SET status = 'OPEN'::unified_ticket_status,
              snoozed_until = NULL, snooze_reason = NULL, updated_at = NOW()
          WHERE id = ${ticketIdNum}
            AND customer_id = ${me.id}
            AND status = 'SNOOZED'::unified_ticket_status
            AND snoozed_until IS NOT NULL
            AND snoozed_until <= NOW()
        `;
      } catch (e) {
        req.log.warn({ err: e }, "customer ticket snooze wake skipped");
      }

      const ticketRows = await sql`
        SELECT id, ticket_id, status, priority, ticket_title, ticket_category,
               subject, description, order_id, created_at, updated_at,
               resolved_at, first_response_at, sla_due_at,
               satisfaction_rating, satisfaction_feedback, satisfaction_collected_at,
               snoozed_until, snooze_reason
        FROM unified_tickets
        WHERE id = ${ticketIdNum} AND customer_id = ${me.id}
        LIMIT 1
      `;
      const tr = (ticketRows as Array<Record<string, unknown>>)[0];
      if (!tr) return reply.code(404).send({ error: "ticket_not_found" });

      const ticket = {
        id: Number(tr.id),
        ticket_id: String(tr.ticket_id ?? ""),
        status: String(tr.status ?? ""),
        priority: String(tr.priority ?? ""),
        ticket_title: tr.ticket_title != null ? String(tr.ticket_title) : null,
        ticket_category: tr.ticket_category != null ? String(tr.ticket_category) : null,
        subject: tr.subject ?? null,
        description: tr.description ?? null,
        order_id: tr.order_id != null ? Number(tr.order_id) : null,
        created_at: toIsoOrNull(tr.created_at) ?? new Date().toISOString(),
        updated_at: toIsoOrNull(tr.updated_at),
        resolved_at: toIsoOrNull(tr.resolved_at),
        first_response_at: toIsoOrNull(tr.first_response_at),
        sla_due_at: toIsoOrNull(tr.sla_due_at),
        satisfaction_rating: tr.satisfaction_rating ?? null,
        satisfaction_feedback: tr.satisfaction_feedback ?? null,
        satisfaction_collected_at: toIsoOrNull(tr.satisfaction_collected_at),
        snoozed_until: toIsoOrNull(tr.snoozed_until),
        snooze_reason:
          typeof tr.snooze_reason === "string" && tr.snooze_reason.trim()
            ? tr.snooze_reason.trim()
            : null,
      };

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
    }
  );

  /**
   * POST /tickets/:ticketId/messages — customer reply in the chat.
   * Idempotency window: 20s on (ticket, sender=CUSTOMER:me, text-equal).
   */
  app.post<{
    Params: { ticketId: string };
    Body: { message_text?: string; attachments?: unknown };
  }>("/tickets/:ticketId/messages", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const ticketIdNum = Number(req.params.ticketId);
    if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
      return reply.code(400).send({ error: "invalid_ticket_id" });
    }
    const body = (req.body || {}) as { message_text?: string; attachments?: unknown };
    const text = (body.message_text || "").toString().trim();
    if (!text) return reply.code(400).send({ error: "invalid_body", message: "message_text required" });

    const attachments = Array.isArray(body.attachments)
      ? body.attachments
          .map((a) => (typeof a === "string" ? a : null))
          .filter((a): a is string => !!a)
      : [];

    const sql = getSql();
    // Ownership check
    const ticketRows = await sql`
      SELECT id, status FROM unified_tickets
      WHERE id = ${ticketIdNum} AND customer_id = ${me.id}
      LIMIT 1
    `;
    if ((ticketRows as Array<unknown>).length === 0) {
      return reply.code(404).send({ error: "ticket_not_found" });
    }

    // Idempotency: prevent double-post on flaky network / double-tap.
    const dup = await sql`
      SELECT id, created_at FROM unified_ticket_messages
      WHERE ticket_id = ${ticketIdNum}
        AND sender_type = 'CUSTOMER'::unified_ticket_source
        AND sender_id = ${me.id}
        AND COALESCE(is_internal_note, FALSE) = FALSE
        AND BTRIM(COALESCE(message_text, '')) = ${text}
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
          message_text: text,
          attachments,
          sender_type: "CUSTOMER",
          sender_id: me.id,
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
        ${ticketIdNum}, ${text}, 'TEXT',
        'CUSTOMER'::unified_ticket_source, ${me.id}, ${me.name},
        ${attachments}::text[], FALSE
      )
      RETURNING id, created_at
    `;
    const row = (rows as Array<Record<string, unknown>>)[0];

    // Bump ticket last_response_* so agent UI shows fresh activity.
    try {
      await sql`
        UPDATE unified_tickets
        SET last_response_at = NOW(),
            last_response_by_type = 'CUSTOMER'::unified_ticket_source,
            last_response_by_id = ${me.id},
            updated_at = NOW(),
            -- if ticket was RESOLVED and customer replied, reopen it
            status = CASE
              WHEN status IN ('RESOLVED','CLOSED')::unified_ticket_status[]
                THEN 'REOPENED'::unified_ticket_status
              ELSE status
            END
        WHERE id = ${ticketIdNum}
      `;
    } catch (e) {
      req.log.warn({ err: e }, "customer reply: last_response_at update skipped");
    }

    return reply.send({
      ok: true,
      message: {
        id: Number(row?.id),
        message_text: text,
        attachments,
        sender_type: "CUSTOMER",
        sender_id: me.id,
        created_at: toIsoOrNull(row?.created_at) ?? new Date().toISOString(),
      },
    });
  });

  /**
   * POST /tickets/:ticketId/upload — multipart attachment upload. Mirrors
   * merchant-partner upload exactly (same R2 bucket, same key family, same
   * proxy URL pattern) so the agent dashboard reads attachments uniformly.
   */
  app.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/upload",
    async (req, reply) => {
      if (req.auth?.role !== "customer" || !req.auth?.sub) {
        return reply.code(401).send({ error: "customer_required" });
      }
      const me = await resolveCustomerInternalId(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "customer_not_found" });

      const ticketIdNum = Number(req.params.ticketId);
      if (!Number.isInteger(ticketIdNum) || ticketIdNum < 1) {
        return reply.code(400).send({ error: "invalid_ticket_id" });
      }
      const sql = getSql();
      const owns = await sql`
        SELECT id FROM unified_tickets
        WHERE id = ${ticketIdNum} AND customer_id = ${me.id}
        LIMIT 1
      `;
      if ((owns as Array<unknown>).length === 0) {
        return reply.code(404).send({ error: "ticket_not_found" });
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
        return reply.code(400).send({ error: "unsupported_mime_type", message: "Only images and PDFs allowed." });
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
            url: `/v1/attachments/proxy?key=${encodeURIComponent(uploaded.key)}`,
            name: originalName,
            mimeType: mime,
          },
        });
      } catch (e) {
        req.log.error({ err: e }, "customer ticket upload failed");
        return reply.code(500).send({ error: "upload_failed" });
      }
    }
  );

  /**
   * POST /tickets/:ticketId/rating — CSAT 1-5 with optional feedback.
   * Only for RESOLVED / CLOSED tickets.
   */
  app.post<{
    Params: { ticketId: string };
    Body: { rating?: number; feedback?: string };
  }>("/tickets/:ticketId/rating", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

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
        AND customer_id = ${me.id}
        AND status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
      RETURNING id, satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
    `;
    if ((rows as Array<unknown>).length === 0) {
      return reply.code(400).send({ error: "rating_not_allowed", message: "Ticket must be resolved or closed." });
    }
    const r = (rows as Array<Record<string, unknown>>)[0];
    return reply.send({
      ok: true,
      rating: {
        rating: Number(r.satisfaction_rating),
        feedback: r.satisfaction_feedback ?? null,
        collected_at: toIsoOrNull(r.satisfaction_collected_at),
      },
    });
  });

  /**
   * POST /tickets/:ticketId/reopen — customer reopens a RESOLVED ticket
   * (CLOSED cannot be reopened — has to be a fresh one).
   */
  app.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/reopen",
    async (req, reply) => {
      if (req.auth?.role !== "customer" || !req.auth?.sub) {
        return reply.code(401).send({ error: "customer_required" });
      }
      const me = await resolveCustomerInternalId(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "customer_not_found" });

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
          AND customer_id = ${me.id}
          AND status = 'RESOLVED'::unified_ticket_status
        RETURNING id, status
      `;
      if ((rows as Array<unknown>).length === 0) {
        return reply.code(400).send({ error: "reopen_not_allowed", message: "Only RESOLVED tickets can be reopened." });
      }
      return reply.send({ ok: true });
    }
  );
}
