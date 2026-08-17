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
 *   POST /v1/customer-support/support-chat/sessions
 *   GET  /v1/customer-support/support-chat/sessions/:sessionId
 *   PATCH /v1/customer-support/support-chat/sessions/:sessionId
 *   POST /v1/customer-support/support-chat/sessions/:sessionId/messages
 *
 * Auth: requires customer JWT (`req.auth.role === "customer"`, `req.auth.sub`
 * is the `customers.customer_id` text uuid). Ownership is enforced on every
 * read/write by joining through `customers.id` ↔ `unified_tickets.customer_id`.
 *
 * Internal notes are never returned to customers.
 */

import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { getSql } from "../../db/client.js";
import { getDb } from "../../db/client.js";
import { eq } from "drizzle-orm";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import {
  buildFraudReportTicketCopy,
  normalizeFraudReportTarget,
  type FraudReportTargetType,
} from "../../lib/customer-order-fraud-report.js";
import { normalizeTicketAttachmentsForDb } from "../../lib/ticket-attachments-for-db.js";

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

type ResolvedCustomerOrder = {
  id: number;
  order_id: string | null;
  formatted_order_id: string | null;
  order_type: string | null;
  status: string;
  current_status: string | null;
  grand_total: number | null;
  placed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  merchant_store_id: number | null;
  merchant_store_name: string | null;
  customer_name: string | null;
  item_preview: string | null;
};

function extractItemPreviewFromItemsJson(raw: unknown, max = 2): string | null {
  if (!Array.isArray(raw)) return null;
  const names = raw
    .slice(0, max)
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const r = row as Record<string, unknown>;
      return String(r.item_name ?? r.name ?? "").trim();
    })
    .filter(Boolean);
  if (!names.length) return null;
  const extra = raw.length > max ? ` +${raw.length - max} more` : "";
  return names.join(", ") + extra;
}

function mapResolvedOrder(r: Record<string, unknown>): ResolvedCustomerOrder {
  const itemPreview =
    r.item_preview != null && String(r.item_preview).trim()
      ? String(r.item_preview).trim()
      : extractItemPreviewFromItemsJson(r.items);
  return {
    id: Number(r.id),
    order_id: r.order_id != null ? String(r.order_id) : null,
    formatted_order_id: r.formatted_order_id != null ? String(r.formatted_order_id) : null,
    order_type: r.order_type != null ? String(r.order_type) : null,
    status: r.status != null ? String(r.status) : "assigned",
    current_status: r.current_status != null ? String(r.current_status) : null,
    grand_total: r.grand_total != null ? Number(r.grand_total) : null,
    placed_at: toIsoOrNull(r.placed_at),
    delivered_at: toIsoOrNull(r.delivered_at),
    cancelled_at: toIsoOrNull(r.cancelled_at),
    merchant_store_id: r.merchant_store_id != null ? Number(r.merchant_store_id) : null,
    merchant_store_name: r.merchant_store_name != null ? String(r.merchant_store_name) : null,
    customer_name: r.customer_name != null ? String(r.customer_name) : null,
    item_preview: itemPreview,
  };
}

/** Lowercase status codes for applicable_order_statuses matching. */
function normalizeHelpOrderStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Map query param to ticket_titles.service_type enum value. */
function normalizeHelpServiceType(raw: unknown): string | null {
  const k = String(raw ?? "").trim().toLowerCase();
  if (!k) return null;
  if (k === "ride" || k === "person_ride" || k === "rides") return "person_ride";
  if (k === "food") return "food";
  if (k === "parcel") return "parcel";
  if (k === "other" || k === "general") return "other";
  return null;
}

/** Match orders_core.id | order_id (GM…) | formatted_order_id (GMF…) for this customer. */
async function resolveCustomerOrderRef(
  sql: ReturnType<typeof getSql>,
  customerPk: number,
  ref: string
): Promise<ResolvedCustomerOrder | null> {
  const trimmed = ref.replace(/^#/, "").trim();
  if (!trimmed) return null;
  const rows = await sql`
    SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.order_type::text AS order_type,
           oc.status::text AS status, oc.current_status,
           oc.grand_total, oc.placed_at, oc.actual_delivery_time AS delivered_at,
           oc.cancelled_at,
           oc.merchant_store_id,
           oc.items,
           ms.store_name AS merchant_store_name,
           of.customer_name
    FROM orders_core oc
    LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
    LEFT JOIN orders_food of ON of.core_order_id = oc.order_id
    WHERE oc.customer_id = ${customerPk}
      AND (
        oc.order_id = ${trimmed}
        OR oc.formatted_order_id = ${trimmed}
        OR UPPER(TRIM(COALESCE(oc.formatted_order_id, ''))) = UPPER(${trimmed})
        OR oc.id::text = ${trimmed}
      )
    LIMIT 1
  `;
  const row = (rows as Array<Record<string, unknown>>)[0];
  return row ? mapResolvedOrder(row) : null;
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

type ChatSessionRow = {
  id: number;
  order_id: number | null;
  ticket_id: number | null;
  ticket_title_id: number | null;
  selected_issue_label: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

function mapChatSessionRow(r: Record<string, unknown>): ChatSessionRow {
  return {
    id: Number(r.id),
    order_id: r.order_id != null ? Number(r.order_id) : null,
    ticket_id: r.ticket_id != null ? Number(r.ticket_id) : null,
    ticket_title_id: r.ticket_title_id != null ? Number(r.ticket_title_id) : null,
    selected_issue_label: r.selected_issue_label != null ? String(r.selected_issue_label) : null,
    status: String(r.status ?? "active"),
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_at: toIsoOrNull(r.created_at),
    updated_at: toIsoOrNull(r.updated_at),
  };
}

function mapChatMessageRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    client_message_id: r.client_message_id != null ? String(r.client_message_id) : null,
    role: String(r.role ?? "bot") as "bot" | "user",
    message_text: String(r.message_text ?? ""),
    menu_level: r.menu_level != null ? String(r.menu_level) : null,
    payload:
      r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {},
    display_order: r.display_order != null ? Number(r.display_order) : 0,
    created_at: toIsoOrNull(r.created_at) ?? new Date().toISOString(),
  };
}

async function fetchChatSessionMessages(
  sql: ReturnType<typeof getSql>,
  sessionId: number
) {
  const rows = await sql`
    SELECT id, client_message_id, role, message_text, menu_level, payload, display_order, created_at
    FROM customer_support_chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY display_order ASC, id ASC
  `;
  return (rows as Array<Record<string, unknown>>).map(mapChatMessageRow);
}

async function assertOwnedChatSession(
  sql: ReturnType<typeof getSql>,
  customerId: number,
  sessionId: number
): Promise<ChatSessionRow | null> {
  const rows = await sql`
    SELECT id, order_id, ticket_id, ticket_title_id, selected_issue_label, status, metadata, created_at, updated_at
    FROM customer_support_chat_sessions
    WHERE id = ${sessionId} AND customer_id = ${customerId}
    LIMIT 1
  `;
  const row = (rows as Array<Record<string, unknown>>)[0];
  return row ? mapChatSessionRow(row) : null;
}

type CustomerTitleRow = {
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

function mapCustomerTitleRow(r: Record<string, unknown>): CustomerTitleRow {
  return {
    id: Number(r.id),
    group_id: r.group_id != null ? Number(r.group_id) : null,
    customer_section_id: r.customer_section_id != null ? String(r.customer_section_id) : null,
    title_text: r.title_text != null ? String(r.title_text) : null,
    intake_unified_title:
      r.intake_unified_title != null ? String(r.intake_unified_title).trim() || null : null,
    intake_unified_category:
      r.intake_unified_category != null ? String(r.intake_unified_category) : null,
    intake_unified_priority:
      r.intake_unified_priority != null ? String(r.intake_unified_priority) : null,
    intake_unified_service_type:
      r.intake_unified_service_type != null ? String(r.intake_unified_service_type) : null,
    tag_codes: Array.isArray(r.tag_codes) ? (r.tag_codes as string[]) : null,
  };
}

async function fetchCustomerTitleRowById(
  sql: ReturnType<typeof getSql>,
  ticketTitleId: number
): Promise<CustomerTitleRow | null> {
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
  return r ? mapCustomerTitleRow(r) : null;
}

async function fetchCustomerTitleRowByIssueLabel(
  sql: ReturnType<typeof getSql>,
  issueLabel: string
): Promise<CustomerTitleRow | null> {
  const label = issueLabel.trim();
  if (!label) return null;
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
    WHERE tt.is_active = TRUE
      AND tt.ticket_section::text = 'customer'
      AND tt.intake_unified_title IS NOT NULL
      AND TRIM(tt.intake_unified_title) <> ''
      AND LOWER(TRIM(tt.title_text)) = LOWER(${label})
    ORDER BY tt.display_order ASC NULLS LAST, tt.id ASC
    LIMIT 1
  `;
  const r = (tr as Array<Record<string, unknown>>)[0];
  return r ? mapCustomerTitleRow(r) : null;
}

/** Never use human-readable title_text on unified_tickets.ticket_title — enum/text code only. */
async function resolveCustomerTicketTitleRow(
  sql: ReturnType<typeof getSql>,
  ticketTitleId: number | null,
  selectedIssueLabel: string | null | undefined
): Promise<CustomerTitleRow | null> {
  let row: CustomerTitleRow | null = null;
  if (ticketTitleId != null) {
    row = await fetchCustomerTitleRowById(sql, ticketTitleId);
  }
  if (row?.intake_unified_title) return row;

  const label = selectedIssueLabel?.trim();
  if (label) {
    const byLabel = await fetchCustomerTitleRowByIssueLabel(sql, label);
    if (byLabel) return byLabel;
  }

  return row;
}

function buildTicketSubmittedChatMessage(ticketDisplayId: string): string {
  const ref = ticketDisplayId.trim();
  const ticketLabel = ref.startsWith("#") ? ref : `#${ref}`;
  return `Your query has been recorded. Your ticket ID is ${ticketLabel}. GatiMitra team will look into your concern and revert within 24 working hours.`;
}

async function linkChatSessionToTicket(
  sql: ReturnType<typeof getSql>,
  customerId: number,
  chatSessionId: number,
  ticketId: number,
  patch?: { selected_issue_label?: string | null; ticket_title_id?: number | null }
): Promise<void> {
  const ticketRows = await sql`
    SELECT ticket_id
    FROM unified_tickets
    WHERE id = ${ticketId}
    LIMIT 1
  `;
  const ticketDisplayId = String((ticketRows as Array<Record<string, unknown>>)[0]?.ticket_id ?? ticketId);
  const confirmationText = buildTicketSubmittedChatMessage(ticketDisplayId);
  const confirmationPayload = JSON.stringify({
    ticket_id: ticketDisplayId,
    ticket_numeric_id: ticketId,
    kind: "ticket_submitted",
  });

  await sql`
    UPDATE customer_support_chat_sessions
    SET ticket_id = ${ticketId},
        status = 'submitted',
        selected_issue_label = COALESCE(${patch?.selected_issue_label ?? null}, selected_issue_label),
        ticket_title_id = COALESCE(${patch?.ticket_title_id ?? null}, ticket_title_id),
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          ticket_display_id: ticketDisplayId,
          ticket_numeric_id: ticketId,
        })}::text::jsonb,
        updated_at = NOW()
    WHERE id = ${chatSessionId}
      AND customer_id = ${customerId}
  `;
  await sql`
    INSERT INTO customer_support_chat_messages (
      session_id, role, message_text, menu_level, payload, display_order
    )
    SELECT
      ${chatSessionId},
      'bot',
      ${confirmationText},
      NULL,
      ${confirmationPayload}::text::jsonb,
      COALESCE((SELECT MAX(display_order) FROM customer_support_chat_messages WHERE session_id = ${chatSessionId}), 0) + 1
  `;
}

/* ─────────────────────────────────────────────────────────────────────────── */

export async function customerSupportRoutes(app: FastifyInstance) {
  // Public health probe? None. Everything below requires auth.
  await app.register(auth, { required: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  /**
   * GET /help-sections — Title catalog filtered to customer-facing intake.
   *
   * Optional query:
   *   `?order_status=<code>` — titles whose `applicable_order_statuses`
   *      includes that status (lowercase) or is NULL (always show).
   *   `?service_type=food|person_ride|parcel` — limit catalog to that service
   *      (food orders also include `other` titles; rides only person_ride).
   *   `?group_code=` / `?group_name=` — limit to one ticket group (post-delivery chat).
   *   `?parent_title_id=root` — only top-level titles (no parent row).
   *   `?intake_only=true` — only leaf titles (no active children) for chat/ticket intake.
   *   `?folder_title=` — children of a parent title row (e.g. "Customer - Post Delivery").
   *   `?title_code=` — fetch one catalog row by title_code (post-delivery chat parent).
   * Pass `NO_ORDER` for the not-about-an-order flow. Omit order_status for
   * the full catalog (section picker before an order is chosen).
   */
  app.get<{
    Querystring: {
      order_status?: string;
      service_type?: string;
      group_code?: string;
      group_name?: string;
      parent_title_id?: string;
      intake_only?: string;
      folder_title?: string;
      title_code?: string;
    };
  }>(
    "/help-sections",
    async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const filter = normalizeHelpOrderStatus(req.query.order_status);
    const serviceType = normalizeHelpServiceType(req.query.service_type);
    const groupCode = String(req.query.group_code ?? "").trim();
    const groupName = String(req.query.group_name ?? "").trim();
    const folderTitle = String(req.query.folder_title ?? "").trim();
    const titleCode = String(req.query.title_code ?? "").trim();
    const hasGroupFilter = groupCode.length > 0 || groupName.length > 0;
    const hasFolderFilter = folderTitle.length > 0;
    const hasTitleCodeFilter = titleCode.length > 0;
    const parentRaw = String(req.query.parent_title_id ?? "").trim().toLowerCase();
    const parentRootOnly =
      parentRaw === "" || parentRaw === "root" || parentRaw === "null";
    const parentId =
      !parentRootOnly && /^\d+$/.test(parentRaw) ? Number(parentRaw) : null;
    const intakeOnly = String(req.query.intake_only ?? "").trim().toLowerCase() === "true";
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
          tg.group_code    AS group_code,
          tg.group_name    AS group_name,
          tt.applicable_order_statuses AS applicable_order_statuses,
          tt.default_quick_options AS default_quick_options
        FROM ticket_titles tt
        LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
        WHERE tt.is_active = TRUE
          AND tt.ticket_section::text = 'customer'
          AND (tt.group_id IS NULL OR tg.is_active = TRUE)
          AND (
            ${hasGroupFilter}
            OR ${hasFolderFilter}
            OR ${hasTitleCodeFilter}
            OR (
              tt.customer_section_id IS NOT NULL
              AND TRIM(tt.customer_section_id::text) <> ''
            )
          )
          AND (
            ${titleCode} = ''
            OR tt.title_code = ${titleCode}
          )
          AND (
            ${serviceType}::text IS NULL
            OR tt.service_type::text = 'all'
            OR (
              ${serviceType} = 'person_ride'
              AND tt.service_type::text = 'person_ride'
            )
            OR (
              ${serviceType} = 'food'
              AND tt.service_type::text IN ('food', 'other')
            )
            OR (
              ${serviceType} NOT IN ('person_ride', 'food')
              AND tt.service_type::text = ${serviceType}
            )
          )
          AND (
            ${filter}::text IS NULL
            OR ${filter} = ''
            OR tt.applicable_order_statuses IS NULL
            OR ${filter} = ANY(tt.applicable_order_statuses)
          )
          AND (
            (${groupCode} = '' AND ${groupName} = '')
            OR (
              (${groupCode} <> '' AND tg.group_code = ${groupCode})
              OR (${groupName} <> '' AND LOWER(TRIM(tg.group_name)) = LOWER(TRIM(${groupName})))
              OR EXISTS (
                SELECT 1
                FROM ticket_titles parent
                LEFT JOIN ticket_groups pg ON pg.id = parent.group_id
                WHERE parent.id = tt.parent_title_id
                  AND parent.is_active = TRUE
                  AND (
                    (${groupCode} <> '' AND pg.group_code = ${groupCode})
                    OR (${groupName} <> '' AND LOWER(TRIM(pg.group_name)) = LOWER(TRIM(${groupName})))
                  )
              )
            )
          )
          AND (
            ${intakeOnly}
            OR NOT EXISTS (
              SELECT 1
              FROM ticket_titles child
              WHERE child.parent_title_id = tt.id
                AND child.is_active = TRUE
                AND child.ticket_section::text = 'customer'
            )
          )
          AND (
            NOT ${hasGroupFilter}
            OR ${intakeOnly}
            OR NOT ${parentRootOnly}
            OR ${parentId != null}
            OR tt.parent_title_id IS NULL
          )
          AND (
            ${parentId == null}
            OR tt.parent_title_id = ${parentId ?? -1}
          )
          AND (
            ${folderTitle} = ''
            OR tt.parent_title_id IN (
              SELECT p.id
              FROM ticket_titles p
              WHERE p.is_active = TRUE
                AND p.ticket_section::text = 'customer'
                AND LOWER(TRIM(p.title_text)) = LOWER(TRIM(${folderTitle}))
            )
          )
        ORDER BY tt.display_order ASC NULLS LAST, tt.customer_section_id ASC NULLS LAST, tt.id ASC
      `;
      const sections = (rows as Array<Record<string, unknown>>).map((r) => ({
        ticket_title_id: Number(r.ticket_title_id),
        title_code: r.title_code != null ? String(r.title_code) : null,
        title_text: r.title_text != null ? String(r.title_text) : null,
        section_id: r.section_id != null ? String(r.section_id) : null,
        display_order: r.display_order != null ? Number(r.display_order) : null,
        group_id: r.group_id != null ? Number(r.group_id) : null,
        group_code: r.group_code != null ? String(r.group_code) : null,
        group_name: r.group_name != null ? String(r.group_name) : null,
        applicable_order_statuses: Array.isArray(r.applicable_order_statuses)
          ? (r.applicable_order_statuses as string[])
          : null,
        default_quick_options: Array.isArray(r.default_quick_options)
          ? (r.default_quick_options as unknown[])
              .map((x) => String(x).trim())
              .filter(Boolean)
          : null,
      }));
      return reply.send({ ok: true, sections });
    } catch (e) {
      req.log.error({ err: e }, "customer help-sections failed");
      return reply.code(500).send({ error: "help_sections_failed" });
    }
  });

  /**
   * GET /orders/resolve?ref= — resolve any order reference for ticket linking.
   * Accepts orders_core.id, order_id (GM…), or formatted_order_id (GMF…).
   */
  app.get<{ Querystring: { ref?: string } }>("/orders/resolve", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const ref = (req.query.ref ?? "").toString().trim();
    if (!ref) return reply.code(400).send({ error: "ref_required" });

    try {
      const sql = getSql();
      const order = await resolveCustomerOrderRef(sql, me.id, ref);
      if (!order) return reply.code(404).send({ error: "order_not_found" });
      return reply.send({ ok: true, order });
    } catch (e) {
      req.log.error({ err: e, ref }, "customer order resolve failed");
      return reply.code(500).send({ error: "order_resolve_failed" });
    }
  });

  /**
   * GET /recent-orders — paginated list of this customer's recent orders.
   * Used by the raise-ticket wizard to let the customer pick which order
   * the ticket is about. Returns 3 at a time by default.
   */
  app.get<{ Querystring: { limit?: string; offset?: string } }>("/recent-orders", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 3));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const sql = getSql();
    const rows = await sql`
      SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.order_type::text AS order_type,
             oc.status::text AS status, oc.current_status,
             oc.grand_total, oc.placed_at, oc.actual_delivery_time AS delivered_at,
             oc.cancelled_at,
             oc.merchant_store_id,
             oc.items,
             ms.store_name AS merchant_store_name,
             of.customer_name
      FROM orders_core oc
      LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
      LEFT JOIN orders_food of ON of.core_order_id = oc.order_id
      WHERE oc.customer_id = ${me.id}
      ORDER BY oc.placed_at DESC NULLS LAST, oc.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const orders = (rows as Array<Record<string, unknown>>).map((r) => mapResolvedOrder(r));
    return reply.send({ ok: true, orders, hasMore: orders.length === limit });
  });

  /**
   * POST /support-chat/sessions — create or resume an active chat for an order.
   */
  app.post<{
    Body: { order_id?: number | string | null; metadata?: Record<string, unknown> };
  }>("/support-chat/sessions", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const body = (req.body || {}) as Record<string, unknown>;
    const rawOrderId = body.order_id;
    let orderIdNum: number | null =
      typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
        ? rawOrderId
        : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
          ? Number(rawOrderId.trim())
          : null;

    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const metadataJson = JSON.stringify(metadata);

    const sql = getSql();

    if (orderIdNum != null) {
      const ordRows = await sql`
        SELECT id FROM orders_core
        WHERE id = ${orderIdNum} AND customer_id = ${me.id}
        LIMIT 1
      `;
      if ((ordRows as Array<unknown>).length === 0) {
        return reply.code(404).send({ error: "order_not_found" });
      }
    }

    const existingRows = orderIdNum != null
      ? await sql`
          SELECT id, order_id, ticket_id, ticket_title_id, selected_issue_label, status, metadata, created_at, updated_at
          FROM customer_support_chat_sessions
          WHERE customer_id = ${me.id}
            AND order_id = ${orderIdNum}
            AND status IN ('active', 'submitted')
          ORDER BY updated_at DESC
          LIMIT 1
        `
      : await sql`
          SELECT id, order_id, ticket_id, ticket_title_id, selected_issue_label, status, metadata, created_at, updated_at
          FROM customer_support_chat_sessions
          WHERE customer_id = ${me.id}
            AND order_id IS NULL
            AND status IN ('active', 'submitted')
          ORDER BY updated_at DESC
          LIMIT 1
        `;

    const existing = (existingRows as Array<Record<string, unknown>>)[0];
    if (existing) {
      const session = mapChatSessionRow(existing);
      const messages = await fetchChatSessionMessages(sql, session.id);
      return reply.send({ ok: true, session, messages, resumed: true });
    }

    const insertRows = await sql`
      INSERT INTO customer_support_chat_sessions (customer_id, order_id, metadata)
      VALUES (${me.id}, ${orderIdNum}, ${metadataJson}::text::jsonb)
      RETURNING id, order_id, ticket_id, ticket_title_id, selected_issue_label, status, metadata, created_at, updated_at
    `;
    const row = (insertRows as Array<Record<string, unknown>>)[0];
    if (!row) return reply.code(500).send({ error: "chat_session_create_failed" });
    return reply.code(201).send({
      ok: true,
      session: mapChatSessionRow(row),
      messages: [],
      resumed: false,
    });
  });

  /**
   * GET /support-chat/sessions/:sessionId — load session + full message history.
   */
  app.get<{ Params: { sessionId: string } }>(
    "/support-chat/sessions/:sessionId",
    async (req, reply) => {
      if (req.auth?.role !== "customer" || !req.auth?.sub) {
        return reply.code(401).send({ error: "customer_required" });
      }
      const me = await resolveCustomerInternalId(req.auth.sub);
      if (!me) return reply.code(404).send({ error: "customer_not_found" });

      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId < 1) {
        return reply.code(400).send({ error: "invalid_session_id" });
      }
      const sql = getSql();
      const session = await assertOwnedChatSession(sql, me.id, sessionId);
      if (!session) return reply.code(404).send({ error: "session_not_found" });
      const messages = await fetchChatSessionMessages(sql, sessionId);
      return reply.send({ ok: true, session, messages });
    }
  );

  /**
   * PATCH /support-chat/sessions/:sessionId — update linked order, selected issue, or end chat.
   */
  app.patch<{
    Params: { sessionId: string };
    Body: {
      order_id?: number | string | null;
      ticket_title_id?: number | string | null;
      selected_issue_label?: string | null;
      ticket_id?: number | string | null;
      status?: string | null;
    };
  }>("/support-chat/sessions/:sessionId", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return reply.code(400).send({ error: "invalid_session_id" });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const sql = getSql();
    const owned = await assertOwnedChatSession(sql, me.id, sessionId);
    if (!owned) return reply.code(404).send({ error: "session_not_found" });

    let orderIdNum: number | null | undefined;
    if (body.order_id !== undefined) {
      const rawOrderId = body.order_id;
      orderIdNum =
        rawOrderId == null
          ? null
          : typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
            ? rawOrderId
            : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
              ? Number(rawOrderId.trim())
              : null;
      if (orderIdNum != null) {
        const ordRows = await sql`
          SELECT id FROM orders_core
          WHERE id = ${orderIdNum} AND customer_id = ${me.id}
          LIMIT 1
        `;
        if ((ordRows as Array<unknown>).length === 0) {
          return reply.code(404).send({ error: "order_not_found" });
        }
      }
    }

    let ticketTitleId: number | null | undefined;
    if (body.ticket_title_id !== undefined) {
      const raw = body.ticket_title_id;
      ticketTitleId =
        raw == null
          ? null
          : typeof raw === "number" && Number.isInteger(raw) && raw > 0
            ? raw
            : typeof raw === "string" && /^\d+$/.test(raw.trim())
              ? Number(raw.trim())
              : null;
    }

    let ticketIdNum: number | null | undefined;
    if (body.ticket_id !== undefined) {
      const raw = body.ticket_id;
      ticketIdNum =
        raw == null
          ? null
          : typeof raw === "number" && Number.isInteger(raw) && raw > 0
            ? raw
            : typeof raw === "string" && /^\d+$/.test(raw.trim())
              ? Number(raw.trim())
              : null;
    }

    const selectedIssueLabel =
      typeof body.selected_issue_label === "string" && body.selected_issue_label.trim()
        ? body.selected_issue_label.trim().slice(0, 500)
        : body.selected_issue_label === null
          ? null
          : undefined;

    const statusRaw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    const nextStatus =
      statusRaw === "active" || statusRaw === "submitted" || statusRaw === "ended"
        ? statusRaw
        : undefined;

    const rows = await sql`
      UPDATE customer_support_chat_sessions
      SET
        order_id = COALESCE(${orderIdNum ?? null}, order_id),
        ticket_title_id = COALESCE(${ticketTitleId ?? null}, ticket_title_id),
        selected_issue_label = COALESCE(${selectedIssueLabel ?? null}, selected_issue_label),
        ticket_id = COALESCE(${ticketIdNum ?? null}, ticket_id),
        status = COALESCE(${nextStatus ?? null}, status),
        updated_at = NOW()
      WHERE id = ${sessionId} AND customer_id = ${me.id}
      RETURNING id, order_id, ticket_id, ticket_title_id, selected_issue_label, status, metadata, created_at, updated_at
    `;
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) return reply.code(404).send({ error: "session_not_found" });
    return reply.send({ ok: true, session: mapChatSessionRow(row) });
  });

  /**
   * POST /support-chat/sessions/:sessionId/messages — append a chat bubble.
   */
  app.post<{
    Params: { sessionId: string };
    Body: {
      client_message_id?: string | null;
      role?: string;
      message_text?: string;
      menu_level?: string | null;
      payload?: Record<string, unknown> | null;
    };
  }>("/support-chat/sessions/:sessionId/messages", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return reply.code(400).send({ error: "invalid_session_id" });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const roleRaw = String(body.role ?? "").trim().toLowerCase();
    if (roleRaw !== "bot" && roleRaw !== "user") {
      return reply.code(400).send({ error: "invalid_role" });
    }
    const messageText =
      typeof body.message_text === "string" ? body.message_text.trim().slice(0, 10000) : "";
    const clientMessageId =
      typeof body.client_message_id === "string" && body.client_message_id.trim()
        ? body.client_message_id.trim().slice(0, 120)
        : null;
    const menuLevel =
      typeof body.menu_level === "string" && body.menu_level.trim()
        ? body.menu_level.trim().slice(0, 40)
        : null;
    const payload =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};
    const payloadJson = JSON.stringify(payload);

    const sql = getSql();
    const owned = await assertOwnedChatSession(sql, me.id, sessionId);
    if (!owned) return reply.code(404).send({ error: "session_not_found" });
    if (owned.status !== "active") {
      return reply.code(400).send({ error: "session_not_active" });
    }

    if (clientMessageId) {
      const dupRows = await sql`
        SELECT id, client_message_id, role, message_text, menu_level, payload, display_order, created_at
        FROM customer_support_chat_messages
        WHERE session_id = ${sessionId} AND client_message_id = ${clientMessageId}
        LIMIT 1
      `;
      const dup = (dupRows as Array<Record<string, unknown>>)[0];
      if (dup) {
        return reply.send({ ok: true, message: mapChatMessageRow(dup), duplicate: true });
      }
    }

    // Content dedupe: identical consecutive user/bot text (e.g. same issue title tapped twice).
    if (messageText) {
      const lastRows = await sql`
        SELECT id, client_message_id, role, message_text, menu_level, payload, display_order, created_at
        FROM customer_support_chat_messages
        WHERE session_id = ${sessionId}
        ORDER BY display_order DESC, id DESC
        LIMIT 1
      `;
      const last = (lastRows as Array<Record<string, unknown>>)[0];
      if (
        last &&
        String(last.role ?? "").toLowerCase() === roleRaw &&
        String(last.message_text ?? "").trim() === messageText
      ) {
        return reply.send({ ok: true, message: mapChatMessageRow(last), duplicate: true });
      }
    }

    const orderRows = await sql`
      SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
      FROM customer_support_chat_messages
      WHERE session_id = ${sessionId}
    `;
    const displayOrder = Number((orderRows as Array<Record<string, unknown>>)[0]?.next_order ?? 1);

    const insertRows = await sql`
      INSERT INTO customer_support_chat_messages (
        session_id, client_message_id, role, message_text, menu_level, payload, display_order
      ) VALUES (
        ${sessionId},
        ${clientMessageId},
        ${roleRaw},
        ${messageText},
        ${menuLevel},
        ${payloadJson}::text::jsonb,
        ${displayOrder}
      )
      RETURNING id, client_message_id, role, message_text, menu_level, payload, display_order, created_at
    `;
    const row = (insertRows as Array<Record<string, unknown>>)[0];
    if (!row) return reply.code(500).send({ error: "message_create_failed" });

    await sql`
      UPDATE customer_support_chat_sessions
      SET updated_at = NOW()
      WHERE id = ${sessionId} AND customer_id = ${me.id}
    `;

    return reply.code(201).send({ ok: true, message: mapChatMessageRow(row) });
  });

  /**
   * GET /fraud-report-options?target=merchant|rider
   * Options for the order help fraud bottom sheet.
   */
  app.get<{ Querystring: { target?: string } }>("/fraud-report-options", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const targetType = normalizeFraudReportTarget(req.query.target);
    if (!targetType) return reply.code(400).send({ error: "invalid_target" });

    const sql = getSql();
    try {
      const rows = await sql`
        SELECT option_code, option_text, display_order, requires_details
        FROM customer_order_fraud_report_options
        WHERE target_type = ${targetType}
          AND is_active = TRUE
        ORDER BY display_order ASC, id ASC
      `;
      const options = (rows as Array<Record<string, unknown>>).map((r) => ({
        option_code: String(r.option_code),
        option_text: String(r.option_text),
        display_order: Number(r.display_order ?? 0),
        requires_details: r.requires_details === true,
      }));
      return reply.send({ ok: true, target_type: targetType, options });
    } catch (e) {
      req.log.error({ err: e }, "fraud-report-options failed");
      return reply.code(500).send({ error: "fraud_report_options_failed" });
    }
  });

  /**
   * POST /fraud-reports — structured fraud report + unified support ticket.
   * Body: { order_id, target_type, option_codes[], custom_details? }
   */
  app.post<{
    Body: {
      order_id?: number | string | null;
      target_type?: string;
      option_codes?: string[];
      custom_details?: string | null;
    };
  }>("/fraud-reports", async (req, reply) => {
    if (req.auth?.role !== "customer" || !req.auth?.sub) {
      return reply.code(401).send({ error: "customer_required" });
    }
    const me = await resolveCustomerInternalId(req.auth.sub);
    if (!me) return reply.code(404).send({ error: "customer_not_found" });

    const body = (req.body || {}) as Record<string, unknown>;
    const targetType = normalizeFraudReportTarget(body.target_type);
    if (!targetType) return reply.code(400).send({ error: "invalid_target" });

    const rawCodes = body.option_codes;
    const optionCodes = Array.isArray(rawCodes)
      ? Array.from(
          new Set(
            rawCodes
              .map((c) => String(c ?? "").trim())
              .filter(Boolean)
          )
        )
      : [];
    if (optionCodes.length === 0) {
      return reply.code(400).send({ error: "option_codes_required" });
    }

    const customDetails =
      typeof body.custom_details === "string" ? body.custom_details.trim() : "";

    const rawOrderId = body.order_id;
    let orderIdNum: number | null =
      typeof rawOrderId === "number" && Number.isInteger(rawOrderId) && rawOrderId > 0
        ? rawOrderId
        : typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId.trim())
          ? Number(rawOrderId.trim())
          : null;

    const sql = getSql();

    let orderContext: {
      orderInternalId: number;
      displayOrderId: string;
      merchantStoreId: number | null;
      merchantParentId: number | null;
      riderId: number | null;
    } | null = null;

    if (orderIdNum != null) {
      const ordRows = await sql`
        SELECT id, order_id, formatted_order_id, merchant_store_id, merchant_parent_id, rider_id
        FROM orders_core
        WHERE id = ${orderIdNum} AND customer_id = ${me.id}
        LIMIT 1
      `;
      const ord = (ordRows as Array<Record<string, unknown>>)[0];
      if (!ord) return reply.code(404).send({ error: "order_not_found" });
      orderContext = {
        orderInternalId: Number(ord.id),
        displayOrderId:
          String(ord.formatted_order_id ?? ord.order_id ?? ord.id).trim() || String(ord.id),
        merchantStoreId: ord.merchant_store_id != null ? Number(ord.merchant_store_id) : null,
        merchantParentId: ord.merchant_parent_id != null ? Number(ord.merchant_parent_id) : null,
        riderId: ord.rider_id != null ? Number(ord.rider_id) : null,
      };
    } else if (typeof rawOrderId === "string" && rawOrderId.trim()) {
      const resolved = await resolveCustomerOrderRef(sql, me.id, rawOrderId.trim());
      if (!resolved) return reply.code(404).send({ error: "order_not_found" });
      const ordRows = await sql`
        SELECT id, order_id, formatted_order_id, merchant_store_id, merchant_parent_id, rider_id
        FROM orders_core
        WHERE id = ${resolved.id} AND customer_id = ${me.id}
        LIMIT 1
      `;
      const ord = (ordRows as Array<Record<string, unknown>>)[0];
      if (!ord) return reply.code(404).send({ error: "order_not_found" });
      orderContext = {
        orderInternalId: Number(ord.id),
        displayOrderId:
          String(ord.formatted_order_id ?? ord.order_id ?? ord.id).trim() || String(ord.id),
        merchantStoreId: ord.merchant_store_id != null ? Number(ord.merchant_store_id) : null,
        merchantParentId: ord.merchant_parent_id != null ? Number(ord.merchant_parent_id) : null,
        riderId: ord.rider_id != null ? Number(ord.rider_id) : null,
      };
    }

    if (!orderContext) return reply.code(400).send({ error: "order_id_required" });

    try {
      const optionRows = await sql`
        SELECT option_code, option_text, requires_details
        FROM customer_order_fraud_report_options
        WHERE target_type = ${targetType}
          AND is_active = TRUE
          AND option_code = ANY(${optionCodes}::text[])
      `;
      const selectedOptions = (optionRows as Array<Record<string, unknown>>).map((r) => ({
        option_code: String(r.option_code),
        option_text: String(r.option_text),
        requires_details: r.requires_details === true,
      }));

      if (selectedOptions.length !== optionCodes.length) {
        return reply.code(400).send({ error: "invalid_option_codes" });
      }

      const needsDetails = selectedOptions.some((o) => o.requires_details);
      if (needsDetails && customDetails.length < 10) {
        return reply.code(400).send({
          error: "custom_details_required",
          message: "Please share more details about your concern.",
        });
      }

      const { subject, description } = buildFraudReportTicketCopy({
        targetType,
        displayOrderId: orderContext.displayOrderId,
        selectedOptions,
        customDetails: customDetails || null,
      });

      const ticketTitle =
        targetType === "merchant" ? "CUSTOMER_MERCHANT_FRAUD" : "CUSTOMER_RIDER_FRAUD";
      const metadataJson = JSON.stringify({
        customer_help: {
          fraud_report: true,
          target_type: targetType,
          option_codes: optionCodes,
          source_platform: "CUSTOMER_APP",
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
          'ORDER_RELATED'::unified_ticket_type,
          'CUSTOMER'::unified_ticket_source,
          'FOOD'::unified_ticket_service_type,
          ${ticketTitle},
          'COMPLAINT'::unified_ticket_category,
          ${orderContext.orderInternalId},
          ${me.id},
          ${orderContext.riderId},
          ${orderContext.merchantStoreId},
          ${orderContext.merchantParentId},
          'CUSTOMER'::unified_ticket_source,
          ${me.id},
          ${me.name},
          ${me.mobile},
          ${me.email},
          ${subject},
          ${description},
          'HIGH'::unified_ticket_priority,
          'OPEN'::unified_ticket_status,
          FALSE,
          NULL,
          ${targetType === "merchant" ? "{MERCHANT_FRAUD}" : "{RIDER_FRAUD}"}::text[],
          ${metadataJson}::text::jsonb
        )
        RETURNING id, ticket_id, status, priority, subject, description, created_at
      `;
      const ticketRow = (insertRows as Array<Record<string, unknown>>)[0];
      if (!ticketRow) return reply.code(500).send({ error: "ticket_create_failed" });

      const reportRows = await sql`
        INSERT INTO customer_order_fraud_reports (
          order_core_id,
          customer_id,
          target_type,
          selected_option_codes,
          custom_details,
          unified_ticket_id
        ) VALUES (
          ${orderContext.orderInternalId},
          ${me.id},
          ${targetType},
          ${optionCodes}::text[],
          ${customDetails || null},
          ${Number(ticketRow.id)}
        )
        RETURNING id, created_at
      `;
      const reportRow = (reportRows as Array<Record<string, unknown>>)[0];

      return reply.send({
        ok: true,
        report: {
          id: Number(reportRow?.id ?? 0),
          target_type: targetType as FraudReportTargetType,
          created_at: toIsoOrNull(reportRow?.created_at) ?? new Date().toISOString(),
        },
        ticket: {
          id: Number(ticketRow.id),
          ticket_id: String(ticketRow.ticket_id ?? ""),
          status: String(ticketRow.status ?? "OPEN"),
          priority: String(ticketRow.priority ?? "HIGH"),
          subject: ticketRow.subject ?? null,
          description: ticketRow.description ?? null,
          created_at: toIsoOrNull(ticketRow.created_at) ?? new Date().toISOString(),
        },
      });
    } catch (e) {
      req.log.error({ err: e }, "fraud-report create failed");
      return reply.code(500).send({ error: "fraud_report_failed" });
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

    const selectedIssueLabel =
      typeof body.selected_issue_label === "string" && body.selected_issue_label.trim()
        ? body.selected_issue_label.trim().slice(0, 500)
        : null;

    const titleRow = await resolveCustomerTicketTitleRow(sql, ticketTitleId, selectedIssueLabel);
    if (ticketTitleId != null && !titleRow) {
      return reply.code(400).send({ error: "invalid_ticket_title_id" });
    }

    // Resolve order context if order_id is provided (numeric id, GM…, or GMF…).
    const rawOrderId = body.order_id;
    let orderIdNum: number | null =
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
    } else if (typeof rawOrderId === "string" && rawOrderId.trim()) {
      const resolved = await resolveCustomerOrderRef(sql, me.id, rawOrderId.trim());
      if (!resolved) return reply.code(404).send({ error: "order_not_found" });
      const ordRows = await sql`
        SELECT id, merchant_store_id, merchant_parent_id, rider_id
        FROM orders_core
        WHERE id = ${resolved.id} AND customer_id = ${me.id}
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
    const ticketTitle = titleRow?.intake_unified_title?.trim() || "CUSTOMER_GENERAL_QUERY";
    const effectiveTicketTitleId = titleRow?.id ?? ticketTitleId;
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
        ticket_title_id: effectiveTicketTitleId ?? null,
        source_platform: "CUSTOMER_APP",
        order_id_app: orderIdNum,
        formatted_order_id:
          typeof body.display_order_id === "string" && body.display_order_id.trim()
            ? body.display_order_id.trim().slice(0, 64)
            : null,
        selected_issue_label: selectedIssueLabel,
      },
    });

    let insertRows: Array<Record<string, unknown>>;
    try {
      insertRows = (await sql`
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
        ${metadataJson}::text::jsonb
      )
      RETURNING id, ticket_id, status, priority, subject, description, created_at
    `) as Array<Record<string, unknown>>;
    } catch (e) {
      req.log.error({ err: e, ticketTitle, ticketTitleId, selectedIssueLabel }, "customer ticket insert failed");
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("unified_ticket_title") || msg.includes("invalid input value for enum")) {
        return reply.code(400).send({
          error: "invalid_ticket_title",
          message: "Could not classify this issue. Please pick a topic again or contact support.",
        });
      }
      return reply.code(500).send({ error: "ticket_create_failed" });
    }
    const row = (insertRows as Array<Record<string, unknown>>)[0];
    if (!row) return reply.code(500).send({ error: "ticket_create_failed" });

    const rawChatSessionId = body.chat_session_id;
    const chatSessionId =
      typeof rawChatSessionId === "number" && Number.isInteger(rawChatSessionId) && rawChatSessionId > 0
        ? rawChatSessionId
        : typeof rawChatSessionId === "string" && /^\d+$/.test(rawChatSessionId.trim())
          ? Number(rawChatSessionId.trim())
          : null;
    if (chatSessionId != null) {
      try {
        await linkChatSessionToTicket(sql, me.id, chatSessionId, Number(row.id), {
          ticket_title_id: effectiveTicketTitleId,
        });
      } catch (e) {
        req.log.warn({ err: e, chatSessionId }, "chat session ticket link failed");
      }
    }

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
    const attachments = normalizeTicketAttachmentsForDb(body.attachments);
    if (!text && attachments.length === 0) {
      return reply.code(400).send({
        error: "invalid_body",
        message: "message_text or attachments required",
      });
    }
    const messageText =
      text || (attachments.length > 1 ? "Shared attachments" : "Shared an attachment");

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
        ${ticketIdNum}, ${messageText}, 'TEXT',
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
              WHEN status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
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
        message_text: messageText,
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
