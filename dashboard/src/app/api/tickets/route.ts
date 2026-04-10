/**
 * Tickets API Route
 * GET /api/tickets - List tickets with advanced filtering
 * POST /api/tickets - Create new ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { QUEUE_HOME_ACTIVE_STATUS_DB } from "@/lib/tickets/queue-ticket-filters";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";

export const runtime = "nodejs";

/** Drivers may return row keys as snake_case or camelCase (see reference-data route). */
function rowNum(row: Record<string, unknown>, snake: string, camel: string): number | null {
  const v = row[snake] !== undefined ? row[snake] : row[camel];
  if (v == null || v === "") return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowStr(row: Record<string, unknown>, snake: string, camel: string): string {
  const v = row[snake] !== undefined ? row[snake] : row[camel];
  if (v == null) return "";
  return String(v);
}

function normalizeSearchToken(input: string): string {
  return input.trim().toLowerCase();
}

function scoreText(value: string | null | undefined, token: string, exactBoost: number, containsBoost: number): number {
  if (!value) return 0;
  const normalized = value.toLowerCase();
  if (normalized === token) return exactBoost;
  if (normalized.includes(token)) return containsBoost;
  return 0;
}

function scoreTicketForSearch(
  ticket: {
    id: number;
    ticketNumber: string;
    subject: string;
    description: string;
    orderId: number | null;
    customerId?: number | null;
    riderId?: number | null;
    merchantStoreId?: number | null;
  },
  rawQuery: string
): number {
  const token = normalizeSearchToken(rawQuery);
  if (!token) return 0;

  const numeric = Number(token);
  const isNumeric = Number.isFinite(numeric) && String(numeric) === token;
  let score = 0;

  // Strongest: exact identifiers and keys.
  if (ticket.ticketNumber.toLowerCase() === token) score += 1200;
  else if (ticket.ticketNumber.toLowerCase().includes(token)) score += 700;
  if (isNumeric && ticket.id === numeric) score += 1100;
  if (isNumeric && ticket.orderId === numeric) score += 1000;
  if (isNumeric && ticket.customerId === numeric) score += 1000;
  if (isNumeric && ticket.riderId === numeric) score += 1000;
  if (isNumeric && ticket.merchantStoreId === numeric) score += 1000;

  // Content relevance.
  score += scoreText(ticket.subject, token, 650, 360);
  score += scoreText(ticket.description, token, 300, 140);

  return score;
}

/**
 * GET /api/tickets
 * List tickets from public.unified_tickets only. Response shape matches existing UI (Ticket type).
 */
export async function GET(request: NextRequest) {
  try {

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const [userIsSuperAdmin, hasTicketAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email!),
      hasDashboardAccessByAuth(user.id, user.email!, "TICKET"),
    ]);
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }


    const { searchParams } = new URL(request.url);

    const forExport =
      searchParams.get("forExport") === "1" || searchParams.get("forExport") === "true";
    const limit = forExport
      ? Math.min(10000, Math.max(1, parseInt(searchParams.get("limit") || "5000", 10) || 5000))
      : Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const serviceTypeParam = searchParams.get("serviceType") || searchParams.getAll("serviceType").join(",");
    const ticketSection = searchParams.get("ticketSection");
    const statusParam = searchParams.get("status") || searchParams.getAll("status").join(",");
    const priorityParam = searchParams.get("priority") || searchParams.getAll("priority").join(",");
    const ticketCategory = searchParams.get("ticketCategory");
    const assignedTo = searchParams.get("assignedTo");
    const assignedToIdsParam = searchParams.get("assignedToIds");
    /** Agent queue home: force assignee = session user + active statuses only (ignores assignee spoofing). */
    const queueScope = searchParams.get("queueScope") === "1";
    const sourceRoleParam = searchParams.get("sourceRole") || searchParams.getAll("sourceRole").join(",");
    const tagsParam = (searchParams.get("tags") || "").trim();
    const skillParam = (searchParams.get("skill") || "").trim();
    const companyParam = (searchParams.get("company") || "").trim();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const resolvedFrom = searchParams.get("resolvedFrom");
    const resolvedTo = searchParams.get("resolvedTo");
    const closedFrom = searchParams.get("closedFrom");
    const closedTo = searchParams.get("closedTo");
    const searchQuery = (searchParams.get("q") || "").trim();
    /** ISO-8601 timestamp: only tickets with updated_at strictly after this (same filter set). */
    const updatedAfterRaw = (searchParams.get("updatedAfter") || "").trim();
    /** ISO-8601 timestamp: only tickets with created_at strictly after this (same filter set). */
    const createdAfterRaw = (searchParams.get("createdAfter") || "").trim();
    /** ISO-8601: rows with created_at OR updated_at strictly after this (badge / activity poll; mutually exclusive with createdAfter/updatedAfter below). */
    const activityAfterRaw = (searchParams.get("activityAfter") || "").trim();
    const orderIdParam = searchParams.get("orderId");
    const orderIdFilter = orderIdParam != null && orderIdParam !== "" ? parseInt(orderIdParam, 10) : null;
    const sortByParam = (searchParams.get("sortBy") || "created_at").toLowerCase();
    const sortOrderParam = (searchParams.get("sortOrder") || "desc").toLowerCase();
    const includeSnoozed = searchParams.get("includeSnoozed") === "1" || searchParams.get("includeSnoozed") === "true";
    const snoozedOnly = searchParams.get("snoozedOnly") === "1" || searchParams.get("snoozedOnly") === "true";

    const allowedSortColumns = ["created_at", "updated_at", "sla_due_at", "priority", "status"];
    const sortBy = allowedSortColumns.includes(sortByParam) ? sortByParam : "created_at";
    const sortOrder = sortOrderParam === "asc" ? "ASC" : "DESC";
    const orderByClause =
      sortBy === "created_at" || sortBy === "updated_at"
        ? `ut.${sortBy} ${sortOrder}, ut.id ${sortOrder}`
        : sortBy === "sla_due_at"
          ? `ut.sla_due_at ${sortOrder} NULLS LAST, ut.id ${sortOrder}`
        : `ut.${sortBy} ${sortOrder}, ut.updated_at DESC, ut.id DESC`;

    const sqlClient = getSql();
    // Opportunistic wake-up: avoid stale "Resuming now" when cron has not run yet.
    try {
      const wokeRows = await sqlClient`
        WITH due AS (
          SELECT id
          FROM public.unified_tickets
          WHERE status = 'SNOOZED'
            AND snoozed_until IS NOT NULL
            AND snoozed_until <= NOW()
          FOR UPDATE SKIP LOCKED
        )
        UPDATE public.unified_tickets ut
        SET status = 'OPEN',
            snoozed_until = NULL,
            snooze_reason = NULL,
            updated_at = NOW()
        FROM due
        WHERE ut.id = due.id
        RETURNING ut.id
      ` as Record<string, unknown>[];
      const sqlAudit = sqlClient as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient;
      for (const row of wokeRows) {
        const id = Number(row.id);
        if (!Number.isFinite(id)) continue;
        await insertTicketActivityAudit(sqlAudit, {
          ticket_id: id,
          activity_type: "auto_unsnoozed",
          activity_category: "status_change",
          activity_description: "Ticket auto-resumed after snooze expiry",
          actor_user_id: null,
          actor_name: "System",
          actor_email: null,
          actor_type: "SYSTEM",
          old_status: "SNOOZED",
          new_status: "OPEN",
        });
      }
    } catch (wakeErr) {
      console.warn("[GET /api/tickets] opportunistic snooze wake skipped:", wakeErr);
    }
    // Keep SLA fields/tag in DB synced with real time:
    // 1) populate missing sla_due_at from priority SLA settings
    // 2) add/remove SLA_BREACHED tag when due crosses NOW()
    try {
      await sqlClient`
        WITH cfg AS (
          SELECT
            COALESCE(sla_minutes_low, 30) AS low_mins,
            COALESCE(sla_minutes_medium, 25) AS medium_mins,
            COALESCE(sla_minutes_high, 20) AS high_mins,
            COALESCE(sla_minutes_urgent, 15) AS urgent_mins,
            COALESCE(sla_minutes_critical, 10) AS critical_mins
          FROM public.ticket_queue_auto_assign_settings
          WHERE id = 1
          LIMIT 1
        )
        UPDATE public.unified_tickets ut
        SET
          sla_due_at = ut.created_at + make_interval(mins => (
            CASE upper(COALESCE(ut.priority::text, 'MEDIUM'))
              WHEN 'CRITICAL' THEN COALESCE((SELECT critical_mins FROM cfg), 10)
              WHEN 'URGENT' THEN COALESCE((SELECT urgent_mins FROM cfg), 15)
              WHEN 'HIGH' THEN COALESCE((SELECT high_mins FROM cfg), 20)
              WHEN 'LOW' THEN COALESCE((SELECT low_mins FROM cfg), 30)
              ELSE COALESCE((SELECT medium_mins FROM cfg), 25)
            END
          )),
          updated_at = NOW()
        WHERE ut.sla_due_at IS NULL
          AND ut.status::text NOT IN ('RESOLVED', 'CLOSED');
      `;

      await sqlClient`
        UPDATE public.unified_tickets ut
        SET
          tags = CASE
            WHEN ut.status::text IN ('RESOLVED', 'CLOSED')
              THEN CASE
                WHEN COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
                  THEN array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
                ELSE COALESCE(ut.tags, ARRAY[]::text[])
              END
            WHEN ut.sla_due_at IS NOT NULL AND ut.sla_due_at <= NOW()
              THEN CASE
                WHEN COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
                  THEN COALESCE(ut.tags, ARRAY[]::text[])
                ELSE array_append(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
              END
            ELSE CASE
              WHEN COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
                THEN array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
              ELSE COALESCE(ut.tags, ARRAY[]::text[])
            END
          END,
          updated_at = NOW()
        WHERE (
          ut.status::text IN ('RESOLVED', 'CLOSED')
          AND COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
        ) OR (
          ut.status::text NOT IN ('RESOLVED', 'CLOSED')
          AND ut.sla_due_at IS NOT NULL
          AND (
            (ut.sla_due_at <= NOW() AND NOT (COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]))
            OR
            (ut.sla_due_at > NOW() AND COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[])
          )
        );
      `;
    } catch (slaSyncErr) {
      console.warn("[GET /api/tickets] SLA sync skipped:", slaSyncErr);
    }
    /** Drain ticket_automation_jobs (e.g. ticket_created from DB trigger) before listing so assignments are visible immediately. */
    try {
      const { processPendingAutomationJobs } = await import("@/lib/tickets/ticket-automation/job-processor");
      if (queueScope) {
        // Queue list should return fast on reload; process jobs in background.
        void processPendingAutomationJobs(sqlClient, {
          limit: 10,
          workerId: "api-get-tickets-queue",
        }).catch((jobErr) => {
          console.error("[GET /api/tickets] processPendingAutomationJobs(queue):", jobErr);
        });
      } else {
        await processPendingAutomationJobs(sqlClient, {
          limit: 25,
          workerId: "api-get-tickets",
        });
      }
    } catch (jobErr) {
      console.error("[GET /api/tickets] processPendingAutomationJobs:", jobErr);
    }
    /** Filter facets; combined with AND (see filtersClause). */
    const whereConditions: unknown[] = [];
    /** Always-AND constraints (used for realtime cursors like createdAfter/updatedAfter). */
    const whereConstraints: unknown[] = [];

    const serviceTypes = serviceTypeParam ? serviceTypeParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (serviceTypes.length > 0) {
      // Service filter should be driven by order_type as requested.
      whereConditions.push(sqlClient`ut.order_type IS NOT NULL AND ut.order_type = ANY(${serviceTypes})`);
    }
    if (ticketSection && ticketSection !== "all") {
      whereConditions.push(sqlClient`ut.raised_by_type = ${ticketSection.toUpperCase()}`);
    }
    const rawStatuses = statusParam ? statusParam.split(",").map((s) => s.trim().toUpperCase().replace(/-/g, "_")).filter(Boolean) : [];
    const statusAliases: Record<string, string> = {
      ASSIGNED: "OPEN",
    };
    const validStatusValues = new Set([
      "OPEN",
      "IN_PROGRESS",
      "SNOOZED",
      "RESOLVED",
      "CLOSED",
      "REJECTED",
      "REOPENED",
      "PENDING",
      "WAITING_FOR_USER",
      "WAITING_FOR_MERCHANT",
      "WAITING_FOR_RIDER",
      "ESCALATED",
      "CANCELLED",
      "PROVISIONALLY_RESOLVED",
    ]);
    /** OPEN + no first response yet (distinct from all OPEN when combined with plain OPEN in multi-status OR). */
    const wantsOpenAwaitingFrt = rawStatuses.includes("OPEN_FRT");
    const statuses = rawStatuses
      .filter((s) => s !== "OPEN_FRT")
      .map((s) => statusAliases[s] ?? s)
      .filter((s) => validStatusValues.has(s));
    if (rawStatuses.length > 0) {
      const statusOrParts: unknown[] = [];
      if (wantsOpenAwaitingFrt) {
        statusOrParts.push(sqlClient`ut.status = 'OPEN' AND ut.first_response_at IS NULL`);
      }
      if (statuses.length > 0) {
        statusOrParts.push(sqlClient`ut.status = ANY(${statuses})`);
      }
      if (statusOrParts.length === 0) {
        whereConditions.push(sqlClient`FALSE`);
      } else if (statusOrParts.length === 1) {
        whereConditions.push(statusOrParts[0] as never);
      } else {
        const statusCombined = statusOrParts.reduce((acc, cond, idx) =>
          idx === 0 ? cond : sqlClient`(${acc as never}) OR (${cond as never})`
        );
        whereConditions.push(sqlClient`(${statusCombined as never})`);
      }
    }
    if (!queueScope) {
      if (snoozedOnly) {
        whereConditions.push(sqlClient`ut.status::text = 'SNOOZED'`);
      } else if (!includeSnoozed && !rawStatuses.includes("SNOOZED")) {
        whereConditions.push(sqlClient`ut.status::text <> 'SNOOZED'`);
      }
    }
    const priorities = priorityParam ? priorityParam.split(",").map((s) => s.trim().toUpperCase().replace(/-/g, "_")).filter(Boolean) : [];
    if (priorities.length > 0) {
      whereConditions.push(sqlClient`ut.priority = ANY(${priorities})`);
    }
    if (ticketCategory && ticketCategory !== "all") {
      // Type filter is driven by UI values but maps to DB ticket_type.
      const typeToken = String(ticketCategory).toLowerCase().trim();
      if (typeToken === "order_related" || typeToken === "order") {
        whereConditions.push(sqlClient`ut.ticket_type = 'ORDER_RELATED'::public.unified_ticket_type`);
      } else if (typeToken === "non_order" || typeToken === "non_order_related") {
        whereConditions.push(sqlClient`ut.ticket_type = 'NON_ORDER_RELATED'::public.unified_ticket_type`);
      } else if (typeToken === "other") {
        // "Other" in sidebar refers to ticket category OTHER, not all non-order tickets.
        whereConditions.push(sqlClient`ut.ticket_category = 'OTHER'::public.unified_ticket_category`);
      } else {
        // Fallback for any custom values: keep legacy behavior against ticket_category.
        whereConditions.push(sqlClient`ut.ticket_category = ${ticketCategory}`);
      }
    }
    const assignedToIds = assignedToIdsParam
      ? assignedToIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : assignedTo && assignedTo !== "all" ? [assignedTo] : [];
    if (queueScope) {
      whereConditions.push(sqlClient`ut.assigned_to_agent_id = ${systemUser.id}`);
      whereConditions.push(sqlClient`ut.assigned_to_agent_id IS NOT NULL`);
      if (snoozedOnly) {
        whereConditions.push(sqlClient`ut.status::text = 'SNOOZED'`);
      } else if (includeSnoozed) {
        whereConditions.push(
          sqlClient`ut.status::text = ANY(${[...QUEUE_HOME_ACTIVE_STATUS_DB, "SNOOZED"]})`
        );
      } else {
        whereConditions.push(
          sqlClient`ut.status::text = ANY(${[...QUEUE_HOME_ACTIVE_STATUS_DB]})`
        );
      }
    } else if (assignedToIds.length > 0) {
      const meIndex = assignedToIds.indexOf("me");
      const unassignedIndex = assignedToIds.indexOf("unassigned");
      const numericIds = assignedToIds.filter((id) => id !== "me" && id !== "unassigned").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
      const orParts: unknown[] = [];
      if (meIndex !== -1) orParts.push(sqlClient`ut.assigned_to_agent_id = ${systemUser.id}`);
      if (unassignedIndex !== -1) {
        orParts.push(sqlClient`
          (
            ut.assigned_to_agent_id IS NULL
            OR ut.assigned_to_agent_id = 0
            OR BTRIM(COALESCE(ut.assigned_to_agent_name, '')) = ''
            OR NOT EXISTS (
              SELECT 1 FROM public.system_users su
              WHERE su.id = ut.assigned_to_agent_id
                AND su.deleted_at IS NULL
            )
          )
        `);
      }
      if (numericIds.length > 0) orParts.push(sqlClient`ut.assigned_to_agent_id = ANY(${numericIds})`);
      if (orParts.length > 0) {
        const orCombined = orParts.reduce((acc, cond, idx) =>
          idx === 0 ? cond : sqlClient`${acc as never} OR ${cond as never}`
        );
        whereConditions.push(sqlClient`(${orCombined as never})`);
      }
    }
    const sourceRoles = sourceRoleParam ? sourceRoleParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (sourceRoles.length > 0) {
      const upperSourceRoles = sourceRoles.map((r) => r.toUpperCase());
      whereConditions.push(sqlClient`ut.raised_by_type = ANY(${upperSourceRoles})`);
    }
    if (dateFrom || dateTo) {
      // Created filter must be strict: only tickets created in selected period should render.
      whereConstraints.push(sqlClient`
        (${dateFrom ? sqlClient`ut.created_at >= ${dateFrom}::date` : sqlClient`TRUE`})
        AND
        (${dateTo ? sqlClient`ut.created_at < (${dateTo}::date + interval '1 day')` : sqlClient`TRUE`})
      `);
    }
    /** Resolved-at bucket (single filter expression): RESOLVED tickets in date range. */
    if (resolvedFrom || resolvedTo) {
      whereConditions.push(sqlClient`
        ut.status::text = 'RESOLVED'
        AND (${resolvedFrom ? sqlClient`COALESCE(ut.resolved_at, ut.updated_at) >= ${resolvedFrom}::date` : sqlClient`TRUE`})
        AND (${resolvedTo ? sqlClient`COALESCE(ut.resolved_at, ut.updated_at) < (${resolvedTo}::date + interval '1 day')` : sqlClient`TRUE`})
      `);
    }
    /** Closed-at bucket (single filter expression): CLOSED tickets in date range. */
    if (closedFrom || closedTo) {
      whereConditions.push(sqlClient`
        ut.status::text = 'CLOSED'
        AND (${closedFrom ? sqlClient`COALESCE(ut.closed_at, ut.updated_at) >= ${closedFrom}::date` : sqlClient`TRUE`})
        AND (${closedTo ? sqlClient`COALESCE(ut.closed_at, ut.updated_at) < (${closedTo}::date + interval '1 day')` : sqlClient`TRUE`})
      `);
    }
    if (orderIdFilter != null && !Number.isNaN(orderIdFilter)) {
      whereConditions.push(sqlClient`ut.order_id = ${orderIdFilter}`);
    }
    if (searchQuery) {
      const num = parseInt(searchQuery, 10);
      const isStrictNumber = !Number.isNaN(num) && String(num) === searchQuery;
      const searchPattern = `%${searchQuery}%`;
      const term = `%${searchQuery.replace(/%/g, "\\%")}%`;

      whereConditions.push(sqlClient`(
        ut.subject ILIKE ${term}
        OR ut.description ILIKE ${term}
        OR ut.ticket_id ILIKE ${term}
        OR ut.ticket_id LIKE ${searchPattern}
        ${isStrictNumber
          ? sqlClient`
            OR ut.id = ${num}
            OR ut.order_id = ${num}
            OR ut.customer_id = ${num}
            OR ut.rider_id = ${num}
            OR ut.merchant_store_id = ${num}
          `
          : sqlClient``}
        OR ut.order_id IN (
          SELECT oc.id
          FROM public.orders_core oc
          WHERE
            COALESCE(oc.formatted_order_id, '') ILIKE ${term}
            OR COALESCE(oc.external_ref, '') ILIKE ${term}
            OR CAST(oc.id AS text) ILIKE ${term}
        )
        OR ut.customer_id IN (
          SELECT c.id
          FROM public.customers c
          WHERE
            COALESCE(c.customer_id, '') ILIKE ${term}
            OR COALESCE(c.primary_mobile, '') ILIKE ${term}
            OR COALESCE(c.full_name, '') ILIKE ${term}
        )
        OR ut.rider_id IN (
          SELECT r.id
          FROM public.riders r
          WHERE
            COALESCE(r.mobile, '') ILIKE ${term}
            OR COALESCE(r.name, '') ILIKE ${term}
            ${isStrictNumber ? sqlClient`OR r.id = ${num}` : sqlClient``}
        )
        OR ut.merchant_store_id IN (
          SELECT ms.id
          FROM public.merchant_stores ms
          WHERE
            COALESCE(ms.store_id, '') ILIKE ${term}
            OR COALESCE(ms.store_name, '') ILIKE ${term}
            OR COALESCE(ms.store_display_name, '') ILIKE ${term}
        )
      )`);
    }
    if (tagsParam) {
      const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        whereConditions.push(sqlClient`ut.tags && ${tags}`);
      }
    }
    if (skillParam) {
      const skillLike = `%${skillParam.replace(/%/g, "\\%")}%`;
      whereConditions.push(
        sqlClient`(
          COALESCE(ut.metadata->>'skill', '') ILIKE ${skillLike}
          OR COALESCE(ut.metadata->>'skills', '') ILIKE ${skillLike}
          OR COALESCE(ut.metadata->>'required_skill', '') ILIKE ${skillLike}
          OR COALESCE(ut.metadata->>'agent_skill', '') ILIKE ${skillLike}
        )`
      );
    }
    if (companyParam) {
      const companyLike = `%${companyParam.replace(/%/g, "\\%")}%`;
      whereConditions.push(
        sqlClient`(
          COALESCE(ut.metadata->>'company', '') ILIKE ${companyLike}
          OR COALESCE(ut.metadata->>'company_name', '') ILIKE ${companyLike}
          OR COALESCE(ut.metadata->>'merchant_name', '') ILIKE ${companyLike}
          OR COALESCE(ut.metadata->>'organization', '') ILIKE ${companyLike}
          OR COALESCE(ut.raised_by_name, '') ILIKE ${companyLike}
        )`
      );
    }
    if (activityAfterRaw) {
      whereConstraints.push(
        sqlClient`(ut.created_at > ${activityAfterRaw}::timestamptz OR ut.updated_at > ${activityAfterRaw}::timestamptz)`
      );
    } else {
      if (updatedAfterRaw) {
        whereConstraints.push(sqlClient`ut.updated_at > ${updatedAfterRaw}::timestamptz`);
      }
      if (createdAfterRaw) {
        whereConstraints.push(sqlClient`ut.created_at > ${createdAfterRaw}::timestamptz`);
      }
    }

    const groupIdsParam = searchParams.get("groupIds");
    const dueFromParam = searchParams.get("dueFrom");
    const dueToParam = searchParams.get("dueTo");
    const slaBreachParam = searchParams.get("slaBreach");
    const isHighValueParam = searchParams.get("isHighValue");

    const groupTokens = groupIdsParam
      ? groupIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const groupUnassigned = groupTokens.some((t) => t.toLowerCase() === "unassigned");
    const groupIdsFiltered = groupTokens
      .filter((t) => t.toLowerCase() !== "unassigned")
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n));
    if (groupUnassigned && groupIdsFiltered.length > 0) {
      const orParts: unknown[] = [
        sqlClient`ut.group_id IS NULL`,
        sqlClient`ut.group_id = ANY(${groupIdsFiltered})`,
      ];
      const orCombined = orParts.reduce((acc, cond, idx) =>
        idx === 0 ? cond : sqlClient`${acc as never} OR ${cond as never}`
      );
      whereConditions.push(sqlClient`(${orCombined as never})`);
    } else if (groupUnassigned) {
      whereConditions.push(sqlClient`ut.group_id IS NULL`);
    } else if (groupIdsFiltered.length > 0) {
      whereConditions.push(sqlClient`ut.group_id IS NOT NULL AND ut.group_id = ANY(${groupIdsFiltered})`);
    }
    if (dueFromParam || dueToParam || slaBreachParam === "true") {
      whereConditions.push(sqlClient`
        (
          (
            (${dueFromParam ? sqlClient`ut.sla_due_at IS NOT NULL AND ut.sla_due_at >= ${dueFromParam}::date` : sqlClient`TRUE`})
            AND
            (${dueToParam ? sqlClient`ut.sla_due_at IS NOT NULL AND ut.sla_due_at < (${dueToParam}::date + interval '1 day')` : sqlClient`TRUE`})
          )
          OR
          (${slaBreachParam === "true"
            ? sqlClient`ut.sla_due_at IS NOT NULL AND ut.sla_due_at < NOW() AND ut.status::text NOT IN ('RESOLVED', 'CLOSED')`
            : sqlClient`FALSE`})
        )
      `);
    }
    if (isHighValueParam === "true") {
      whereConditions.push(sqlClient`COALESCE(ut.is_high_value_order, false) = true`);
    }

    /** Faceted filters (status, group, assignee, …) must combine with AND so multi-select URLs match the sidebar. */
    const filtersClause =
      whereConditions.length > 0
        ? whereConditions.reduce((acc, cond, idx) =>
            idx === 0 ? cond : sqlClient`${acc as never} AND ${cond as never}`
          )
        : null;
    const andClause =
      whereConstraints.length > 0
        ? whereConstraints.reduce((acc, cond, idx) =>
            idx === 0 ? cond : sqlClient`${acc as never} AND ${cond as never}`
          )
        : null;
    const whereClause =
      filtersClause && andClause
        ? sqlClient`(${filtersClause as never}) AND (${andClause as never})`
        : filtersClause ?? andClause ?? null;

    let countResult: { count: number }[];
    let ticketRows: Record<string, unknown>[];

    try {
      if (whereClause) {
        countResult = (await sqlClient`
          SELECT COUNT(*)::int as count FROM public.unified_tickets ut WHERE ${whereClause as never}        `) as unknown as { count: number }[];
        try {
          ticketRows = (await sqlClient`
            SELECT
              ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
              ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
              ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.assigned_at, ut.satisfaction_rating,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
              tg.group_code AS group_code, tg.group_name AS group_name,
              tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name,
              landed_match.lid AS rule_landed_group_id, landed_match.lcode AS rule_landed_group_code, landed_match.lname AS rule_landed_group_name
            FROM public.unified_tickets ut
            LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
            LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
              WHEN ut.metadata IS NOT NULL
                AND (ut.metadata->>'landed_group_id') IS NOT NULL
                AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
              THEN (ut.metadata->>'landed_group_id')::bigint
              ELSE NULL
            END
            LEFT JOIN LATERAL (
              SELECT tg2.id AS lid, tg2.group_code AS lcode, tg2.group_name AS lname
              FROM public.ticket_groups tg2
              WHERE tg2.is_active = true
                AND LOWER(TRIM(COALESCE(tg2.service_type::text, ''))) = LOWER(TRIM(COALESCE(ut.service_type::text, '')))
                AND LOWER(TRIM(COALESCE(tg2.ticket_section::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_source::text, '')))
                AND (
                  LOWER(TRIM(COALESCE(ut.ticket_category::text, ''))) = ''
                  OR LOWER(TRIM(COALESCE(tg2.ticket_category::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_category::text, '')))
                )
                AND LOWER(TRIM(COALESCE(tg2.source_role::text, ''))) = LOWER(TRIM(COALESCE(ut.raised_by_type::text, '')))
              ORDER BY tg2.display_order ASC NULLS LAST
              LIMIT 1
            ) landed_match ON true
            WHERE ${whereClause as never}
            ORDER BY ${sqlClient.unsafe(orderByClause)}
            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
        } catch {
          try {
            ticketRows = (await sqlClient`
              SELECT
                ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                ut.assigned_at, ut.satisfaction_rating,
                ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
                tg.group_code AS group_code, tg.group_name AS group_name,
                tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name,
                landed_match.lid AS rule_landed_group_id, landed_match.lcode AS rule_landed_group_code, landed_match.lname AS rule_landed_group_name
              FROM public.unified_tickets ut
              LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
              LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
                WHEN ut.metadata IS NOT NULL
                  AND (ut.metadata->>'landed_group_id') IS NOT NULL
                  AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
                THEN (ut.metadata->>'landed_group_id')::bigint
                ELSE NULL
              END
              LEFT JOIN LATERAL (
                SELECT tg2.id AS lid, tg2.group_code AS lcode, tg2.group_name AS lname
                FROM public.ticket_groups tg2
                WHERE tg2.is_active = true
                  AND LOWER(TRIM(COALESCE(tg2.service_type::text, ''))) = LOWER(TRIM(COALESCE(ut.service_type::text, '')))
                  AND LOWER(TRIM(COALESCE(tg2.ticket_section::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_source::text, '')))
                  AND LOWER(TRIM(COALESCE(tg2.source_role::text, ''))) = LOWER(TRIM(COALESCE(ut.raised_by_type::text, '')))
                ORDER BY tg2.display_order ASC NULLS LAST
                LIMIT 1
              ) landed_match ON true
              WHERE ${whereClause as never}
              ORDER BY ${sqlClient.unsafe(orderByClause)}
              LIMIT ${limit}
              OFFSET ${offset}
            `) as unknown as Record<string, unknown>[];
          } catch {
            try {
              ticketRows = (await sqlClient`
                SELECT
                  ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                  ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                  ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                  ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                  ut.assigned_at, ut.satisfaction_rating,
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
                  tg.group_code AS group_code, tg.group_name AS group_name,
                  tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name
                FROM public.unified_tickets ut
                LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
                LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
                  WHEN ut.metadata IS NOT NULL
                    AND (ut.metadata->>'landed_group_id') IS NOT NULL
                    AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
                  THEN (ut.metadata->>'landed_group_id')::bigint
                  ELSE NULL
                END
                WHERE ${whereClause as never}
                ORDER BY ${sqlClient.unsafe(orderByClause)}
                LIMIT ${limit}
                OFFSET ${offset}
              `) as unknown as Record<string, unknown>[];
            } catch {
              ticketRows = (await sqlClient`
                SELECT
                  ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                  ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                  ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                  ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                  ut.assigned_at, ut.satisfaction_rating,
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id,
                  tg.group_code AS group_code, tg.group_name AS group_name
                FROM public.unified_tickets ut
                LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
                WHERE ${whereClause as never}
                ORDER BY ${sqlClient.unsafe(orderByClause)}
                LIMIT ${limit}
                OFFSET ${offset}
              `) as unknown as Record<string, unknown>[];
            }
          }
        }
      } else {
        countResult = (await sqlClient`SELECT COUNT(*)::int as count FROM public.unified_tickets ut`) as unknown as {
          count: number;
        }[];
        try {
          ticketRows = (await sqlClient`
            SELECT
              ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
              ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
              ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.assigned_at, ut.satisfaction_rating,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
              tg.group_code AS group_code, tg.group_name AS group_name,
              tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name,
              landed_match.lid AS rule_landed_group_id, landed_match.lcode AS rule_landed_group_code, landed_match.lname AS rule_landed_group_name
            FROM public.unified_tickets ut
            LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
            LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
              WHEN ut.metadata IS NOT NULL
                AND (ut.metadata->>'landed_group_id') IS NOT NULL
                AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
              THEN (ut.metadata->>'landed_group_id')::bigint
              ELSE NULL
            END
            LEFT JOIN LATERAL (
              SELECT tg2.id AS lid, tg2.group_code AS lcode, tg2.group_name AS lname
              FROM public.ticket_groups tg2
              WHERE tg2.is_active = true
                AND LOWER(TRIM(COALESCE(tg2.service_type::text, ''))) = LOWER(TRIM(COALESCE(ut.service_type::text, '')))
                AND LOWER(TRIM(COALESCE(tg2.ticket_section::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_source::text, '')))
                AND (
                  LOWER(TRIM(COALESCE(ut.ticket_category::text, ''))) = ''
                  OR LOWER(TRIM(COALESCE(tg2.ticket_category::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_category::text, '')))
                )
                AND LOWER(TRIM(COALESCE(tg2.source_role::text, ''))) = LOWER(TRIM(COALESCE(ut.raised_by_type::text, '')))
              ORDER BY tg2.display_order ASC NULLS LAST
              LIMIT 1
            ) landed_match ON true
            ORDER BY ${sqlClient.unsafe(orderByClause)}
            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
        } catch {
          try {
            ticketRows = (await sqlClient`
              SELECT
                ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                ut.assigned_at, ut.satisfaction_rating,
                ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
                tg.group_code AS group_code, tg.group_name AS group_name,
                tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name,
                landed_match.lid AS rule_landed_group_id, landed_match.lcode AS rule_landed_group_code, landed_match.lname AS rule_landed_group_name
              FROM public.unified_tickets ut
              LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
              LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
                WHEN ut.metadata IS NOT NULL
                  AND (ut.metadata->>'landed_group_id') IS NOT NULL
                  AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
                THEN (ut.metadata->>'landed_group_id')::bigint
                ELSE NULL
              END
              LEFT JOIN LATERAL (
                SELECT tg2.id AS lid, tg2.group_code AS lcode, tg2.group_name AS lname
                FROM public.ticket_groups tg2
                WHERE tg2.is_active = true
                  AND LOWER(TRIM(COALESCE(tg2.service_type::text, ''))) = LOWER(TRIM(COALESCE(ut.service_type::text, '')))
                  AND LOWER(TRIM(COALESCE(tg2.ticket_section::text, ''))) = LOWER(TRIM(COALESCE(ut.ticket_source::text, '')))
                  AND LOWER(TRIM(COALESCE(tg2.source_role::text, ''))) = LOWER(TRIM(COALESCE(ut.raised_by_type::text, '')))
                ORDER BY tg2.display_order ASC NULLS LAST
                LIMIT 1
              ) landed_match ON true
              ORDER BY ${sqlClient.unsafe(orderByClause)}
              LIMIT ${limit}
              OFFSET ${offset}
            `) as unknown as Record<string, unknown>[];
          } catch {
            try {
              ticketRows = (await sqlClient`
                SELECT
                  ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                  ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                  ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                  ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                  ut.assigned_at, ut.satisfaction_rating,
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id, ut.metadata, ut.sla_due_at, ut.snoozed_until, ut.snooze_reason,
                  tg.group_code AS group_code, tg.group_name AS group_name,
                  tgl.id AS meta_landed_group_id, tgl.group_code AS meta_landed_group_code, tgl.group_name AS meta_landed_group_name
                FROM public.unified_tickets ut
                LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
                LEFT JOIN public.ticket_groups tgl ON tgl.id = CASE
                  WHEN ut.metadata IS NOT NULL
                    AND (ut.metadata->>'landed_group_id') IS NOT NULL
                    AND (ut.metadata->>'landed_group_id') ~ '^[0-9]+$'
                  THEN (ut.metadata->>'landed_group_id')::bigint
                  ELSE NULL
                END
                ORDER BY ${sqlClient.unsafe(orderByClause)}
                LIMIT ${limit}
                OFFSET ${offset}
              `) as unknown as Record<string, unknown>[];
            } catch {
              ticketRows = (await sqlClient`
                SELECT
                  ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
                  ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
                  ut.subject, ut.description, ut.priority, ut.status, ut.is_spam,
                  ut.assigned_to_agent_id, ut.assigned_to_agent_name,
                  ut.assigned_at, ut.satisfaction_rating,
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id,
                  tg.group_code AS group_code, tg.group_name AS group_name
                FROM public.unified_tickets ut
                LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
                ORDER BY ${sqlClient.unsafe(orderByClause)}
                LIMIT ${limit}
                OFFSET ${offset}
              `) as unknown as Record<string, unknown>[];
            }
          }
        }
      }
    } catch (queryError) {
      console.error("[GET /api/tickets] Query execution error:", queryError);
      console.error("[GET /api/tickets] Ensure public.unified_tickets table and enums exist.");
      throw queryError;
    }

    const enrichById = new Map<number, Record<string, unknown>>();
    if (forExport && ticketRows.length > 0) {
      const ids = ticketRows
        .map((r) => {
          const v = r.id;
          const n = typeof v === "bigint" ? Number(v) : Number(v);
          return Number.isFinite(n) ? n : NaN;
        })
        .filter((n) => !Number.isNaN(n));
      if (ids.length > 0) {
        try {
          const enrichRows = (await sqlClient`
            SELECT
              ut.id,
              ut.tags,
              ut.resolution,
              ut.metadata,
              ut.internal_notes AS ticket_internal_notes,
              ut.association_type AS ticket_association_type,
              ut.agent_interaction_count AS ticket_agent_icount,
              ut.customer_interaction_count AS ticket_customer_icount,
              su.full_name AS agent_system_full_name,
              su.email AS agent_email,
              su.mobile AS agent_mobile,
              su.alternate_mobile AS agent_alternate_mobile,
              c.full_name AS cust_full_name,
              c.customer_id AS cust_customer_id,
              c.email AS cust_email,
              c.primary_mobile AS cust_primary_mobile,
              c.alternate_mobile AS cust_alternate_mobile,
              c.preferred_language AS cust_language,
              c.work_phone AS cust_work_phone,
              c.facebook_id AS cust_facebook_id,
              c.twitter_id AS cust_twitter_id,
              c.time_zone AS cust_time_zone,
              c.contact_tags AS cust_contact_tags,
              c.job_title AS cust_job_title,
              c.unique_external_id AS cust_unique_external_id,
              c.twitter_verified AS cust_twitter_verified,
              c.twitter_follower_count AS cust_twitter_follower_count,
              ms.store_name AS store_name,
              ms.store_display_name AS store_display_name,
              COALESCE(mp.business_name, mp.parent_name, ms.store_name, '') AS export_company_name,
              mp.company_domains AS mp_company_domains
            FROM public.unified_tickets ut
            LEFT JOIN public.system_users su ON su.id = ut.assigned_to_agent_id AND su.deleted_at IS NULL
            LEFT JOIN public.customers c ON c.id = ut.customer_id AND c.deleted_at IS NULL
            LEFT JOIN public.merchant_stores ms ON ms.id = ut.merchant_store_id AND ms.deleted_at IS NULL
            LEFT JOIN public.merchant_parents mp ON mp.id = COALESCE(ut.merchant_parent_id, ms.parent_id)
            WHERE ut.id = ANY(${ids})
          `) as Record<string, unknown>[];
          for (const er of enrichRows) {
            const idRaw = er.id;
            const idNum = typeof idRaw === "bigint" ? Number(idRaw) : Number(idRaw);
            if (Number.isFinite(idNum)) enrichById.set(idNum, er);
          }
        } catch (enrichErr) {
          console.error("[GET /api/tickets] forExport enrich query failed:", enrichErr);
        }
      }
    }

    const total = countResult[0]?.count ?? 0;

    let tickets = ticketRows.map((t: Record<string, unknown>) => {
      const rawStatus = String(t.status ?? "").toUpperCase().replace(/-/g, "_");
      const rawPriority = String(t.priority ?? "").toUpperCase().replace(/-/g, "_");
      const groupId = rowNum(t, "group_id", "groupId");
      const groupName = rowStr(t, "group_name", "groupName");
      const groupCode = rowStr(t, "group_code", "groupCode");

      const metaLandedId = rowNum(t, "meta_landed_group_id", "metaLandedGroupId");
      const ruleLandedId = rowNum(t, "rule_landed_group_id", "ruleLandedGroupId");
      let landedGroup: { id: number; name: string; code: string } | null = null;
      const landedId = metaLandedId ?? (ruleLandedId != null && ruleLandedId > 0 ? ruleLandedId : null);
      if (landedId != null && landedId > 0) {
        const fromMeta = metaLandedId != null && metaLandedId === landedId;
        const n = fromMeta
          ? rowStr(t, "meta_landed_group_name", "metaLandedGroupName") ||
            rowStr(t, "meta_landed_group_code", "metaLandedGroupCode")
          : rowStr(t, "rule_landed_group_name", "ruleLandedGroupName") ||
            rowStr(t, "rule_landed_group_code", "ruleLandedGroupCode");
        const c = fromMeta
          ? rowStr(t, "meta_landed_group_code", "metaLandedGroupCode") ||
            rowStr(t, "meta_landed_group_name", "metaLandedGroupName")
          : rowStr(t, "rule_landed_group_code", "ruleLandedGroupCode") ||
            rowStr(t, "rule_landed_group_name", "ruleLandedGroupName");
        landedGroup = { id: landedId, name: n || c || `Group #${landedId}`, code: c || n || "" };
      }

      const assigneeId = rowNum(t, "assigned_to_agent_id", "assignedToAgentId");
      const resolvedId = rowNum(t, "id", "id") ?? (t.id != null ? Number(t.id) : NaN);
      const slaRaw = t.sla_due_at ?? t.slaDueAt;

      const ticketIdNum = Number.isFinite(resolvedId) ? resolvedId : 0;
      const er = ticketIdNum > 0 ? enrichById.get(ticketIdNum) : undefined;
      let exportMeta:
        | {
            tags: string;
            resolutionText: string;
            internalNotes: string;
            associationType: string;
            agentInteractionCount: string;
            customerInteractionCount: string;
            contactFullName: string;
            contactExternalId: string;
            contactEmail: string;
            contactMobile: string;
            contactAlternateMobile: string;
            contactLanguage: string;
            contactWorkPhone: string;
            contactFacebookId: string;
            contactTwitterId: string;
            contactTimeZone: string;
            contactTags: string;
            contactJobTitle: string;
            contactUniqueExternalId: string;
            contactTwitterVerified: string;
            contactTwitterFollowerCount: string;
            /** Assigned agent (system_users) — maps to Contact: Full name, Email, Work/Mobile phone in export. */
            agentExportFullName: string;
            agentExportEmail: string;
            agentExportMobile: string;
            agentExportAlternateMobile: string;
            companyName: string;
            companyDisplayName: string;
            companyDomains: string;
          }
        | undefined;
      if (forExport && er) {
        const tagVal = er.tags;
        const tagsStr = Array.isArray(tagVal) ? tagVal.join(", ") : tagVal != null ? String(tagVal) : "";
        const metaRaw = er.metadata;
        let internalNotesMeta = "";
        if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) {
          const m = metaRaw as Record<string, unknown>;
          const n = m.internal_notes ?? m.internalNotes;
          if (typeof n === "string") internalNotesMeta = n;
        }
        const internalNotesCol = rowStr(er, "ticket_internal_notes", "ticketInternalNotes");
        const internalNotes = internalNotesCol.trim() || internalNotesMeta;

        const tagContact = er.cust_contact_tags ?? er.custContactTags;
        const contactTagsStr = Array.isArray(tagContact)
          ? tagContact.join(", ")
          : tagContact != null
            ? String(tagContact)
            : "";

        const domainsVal = er.mp_company_domains ?? er.mpCompanyDomains;
        let companyDomainsStr = "";
        if (Array.isArray(domainsVal)) companyDomainsStr = domainsVal.join(", ");
        else if (domainsVal != null) companyDomainsStr = String(domainsVal);

        const tv = er.cust_twitter_verified ?? er.custTwitterVerified;
        const contactTwitterVerified =
          tv === true || tv === "t" || String(tv).toLowerCase() === "true"
            ? "Yes"
            : tv === false || tv === "f" || String(tv).toLowerCase() === "false"
              ? "No"
              : "";

        const tfc = er.cust_twitter_follower_count ?? er.custTwitterFollowerCount;
        const contactTwitterFollowerCount = tfc != null && String(tfc) !== "" ? String(tfc) : "";

        const aic = er.ticket_agent_icount ?? er.ticketAgentIcount;
        const cic = er.ticket_customer_icount ?? er.ticketCustomerIcount;

        exportMeta = {
          tags: tagsStr,
          resolutionText: rowStr(er, "resolution", "resolution"),
          internalNotes,
          associationType: rowStr(er, "ticket_association_type", "ticketAssociationType"),
          agentInteractionCount: aic != null && String(aic) !== "" ? String(aic) : "",
          customerInteractionCount: cic != null && String(cic) !== "" ? String(cic) : "",
          contactFullName: rowStr(er, "cust_full_name", "custFullName"),
          contactExternalId: rowStr(er, "cust_customer_id", "custCustomerId"),
          contactEmail: rowStr(er, "cust_email", "custEmail"),
          contactMobile: rowStr(er, "cust_primary_mobile", "custPrimaryMobile"),
          contactAlternateMobile: rowStr(er, "cust_alternate_mobile", "custAlternateMobile"),
          contactLanguage: rowStr(er, "cust_language", "custLanguage"),
          contactWorkPhone: rowStr(er, "cust_work_phone", "custWorkPhone"),
          contactFacebookId: rowStr(er, "cust_facebook_id", "custFacebookId"),
          contactTwitterId: rowStr(er, "cust_twitter_id", "custTwitterId"),
          contactTimeZone: rowStr(er, "cust_time_zone", "custTimeZone"),
          contactTags: contactTagsStr,
          contactJobTitle: rowStr(er, "cust_job_title", "custJobTitle"),
          contactUniqueExternalId: rowStr(er, "cust_unique_external_id", "custUniqueExternalId"),
          contactTwitterVerified,
          contactTwitterFollowerCount,
          agentExportFullName: rowStr(er, "agent_system_full_name", "agentSystemFullName"),
          agentExportEmail: rowStr(er, "agent_email", "agentEmail"),
          agentExportMobile: rowStr(er, "agent_mobile", "agentMobile"),
          agentExportAlternateMobile: rowStr(er, "agent_alternate_mobile", "agentAlternateMobile"),
          companyName: rowStr(er, "export_company_name", "exportCompanyName"),
          companyDisplayName: rowStr(er, "store_display_name", "storeDisplayName"),
          companyDomains: companyDomainsStr,
        };
      }

      const legacyAgentName = rowStr(t, "assigned_to_agent_name", "assignedToAgentName") || "";
      const agentNameFromSystemUser = er ? rowStr(er, "agent_system_full_name", "agentSystemFullName").trim() : "";
      const agentEmailFromSystemUser = er ? rowStr(er, "agent_email", "agentEmail") : "";

      return {
        id: ticketIdNum,
        ticketNumber: rowStr(t, "ticket_id", "ticketId"),
        ticketType: rowStr(t, "ticket_type", "ticketType"),
        serviceType: rowStr(t, "service_type", "serviceType"),
        ticketCategory: rowStr(t, "ticket_category", "ticketCategory"),
        ticketSection: rowStr(t, "ticket_source", "ticketSource"),
        sourceRole: rowStr(t, "raised_by_type", "raisedByType"),
        title: t.ticket_title != null || t.ticketTitle != null ? String(t.ticket_title ?? t.ticketTitle) : null,
        subject: rowStr(t, "subject", "subject"),
        description: rowStr(t, "description", "description"),
        status: rawStatus ? rawStatus.toLowerCase() : "",
        isSpam: t.is_spam === true || t.is_spam === "t" || String(t.is_spam).toLowerCase() === "true",
        priority: rawPriority ? rawPriority.toLowerCase() : "",
        orderId: rowNum(t, "order_id", "orderId"),
        customerId: rowNum(t, "customer_id", "customerId"),
        riderId: rowNum(t, "rider_id", "riderId"),
        merchantStoreId: rowNum(t, "merchant_store_id", "merchantStoreId"),
        orderServiceType:
          t.order_type != null || t.orderType != null ? String(t.order_type ?? t.orderType) : null,
        is3plOrder: false,
        isHighValueOrder: false,
        assignee:
          assigneeId != null
            ? {
                id: assigneeId,
                name: forExport
                  ? agentNameFromSystemUser || legacyAgentName
                  : legacyAgentName,
                email: forExport ? agentEmailFromSystemUser : "",
              }
            : null,
        group:
          groupId != null
            ? { id: groupId, name: groupName || groupCode || `Group #${groupId}`, code: groupCode || groupName || "" }
            : null,
        /** Intake / routing queue: metadata.landed_group_id or rule match on ticket_groups (same logic as GET /api/tickets/[id]). */
        landedGroup,
        slaDueAt: slaRaw != null && String(slaRaw) !== "" ? String(slaRaw) : null,
        resolvedAt:
          (t.resolved_at ?? t.resolvedAt) != null ? String(t.resolved_at ?? t.resolvedAt) : null,
        closedAt: (t.closed_at ?? t.closedAt) != null ? String(t.closed_at ?? t.closedAt) : null,
        createdAt: String(t.created_at ?? t.createdAt ?? ""),
        updatedAt: String(t.updated_at ?? t.updatedAt ?? ""),
        assignedAt:
          (t.assigned_at ?? t.assignedAt) != null && String(t.assigned_at ?? t.assignedAt).trim() !== ""
            ? String(t.assigned_at ?? t.assignedAt)
            : null,
        satisfactionRating: (() => {
          const v = t.satisfaction_rating ?? t.satisfactionRating;
          if (v == null || v === "") return null;
          const n = typeof v === "bigint" ? Number(v) : Number(v);
          return Number.isFinite(n) ? n : null;
        })(),
        snoozedUntil:
          (t.snoozed_until ?? t.snoozedUntil) != null
            ? String(t.snoozed_until ?? t.snoozedUntil)
            : null,
        snoozeReason:
          (t.snooze_reason ?? t.snoozeReason) != null &&
          String(t.snooze_reason ?? t.snoozeReason).trim() !== ""
            ? String(t.snooze_reason ?? t.snoozeReason)
            : null,
        ...(exportMeta ? { exportMeta } : {}),
      };
    });

    if (searchQuery) {
      tickets = tickets
        .map((ticket, index) => ({
          ticket,
          score: scoreTicketForSearch(ticket, searchQuery),
          index,
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.index - b.index;
        })
        .map((entry) => entry.ticket);
    }

    const payload = { tickets, total: Number(total), limit, offset };

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("[GET /api/tickets] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets
 * Create new ticket
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      serviceType,
      ticketCategory,
      ticketSection,
      sourceRole,
      titleId,
      subject,
      description,
      priority = "medium",
      orderId,
      orderServiceType,
      is3plOrder = false,
      isHighValueOrder = false,
    } = body;

    // Validate required fields
    if (!serviceType || !ticketCategory || !ticketSection || !sourceRole || !subject || !description) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const sqlClient = getSql();

    // Generate ticket number
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    const maxResult = (await sqlClient`
      SELECT COALESCE(
        MAX(
          CASE
            WHEN ticket_number ~ ${`^${prefix}[0-9]+$`}
            THEN CAST(SUBSTRING(ticket_number FROM ${`^${prefix}([0-9]+)$`}) AS INTEGER)
            ELSE NULL
          END
        ),
        0
      )::int AS max_suffix
      FROM tickets
      WHERE ticket_number LIKE ${`${prefix}%`}
    `) as unknown as { max_suffix: number }[];
    const nextSuffix = (maxResult[0]?.max_suffix ?? 0) + 1;
    const ticketNumber = `TKT-${year}-${nextSuffix}`;

    // Resolve group from ticket_groups by service_type, ticket_section, source_role (and ticket_category if present)
    let groupId: number | null = null;
    try {
      const st = String(serviceType).toLowerCase().trim();
      const ts = String(ticketSection).toLowerCase().trim();
      const sr = String(sourceRole).toLowerCase().trim();
      const tc = ticketCategory ? String(ticketCategory).toLowerCase().trim() : "";
      const groupRows = await sqlClient`
        SELECT id FROM ticket_groups
        WHERE is_active = true
          AND LOWER(TRIM(COALESCE(service_type::text, ''))) = ${st}
          AND LOWER(TRIM(COALESCE(ticket_section::text, ''))) = ${ts}
          AND LOWER(TRIM(COALESCE(source_role::text, ''))) = ${sr}
          AND (${tc === ""} OR LOWER(TRIM(COALESCE(ticket_category::text, ''))) = ${tc})
        ORDER BY display_order ASC NULLS LAST
        LIMIT 1
      `;
      if (Array.isArray(groupRows) && groupRows.length > 0 && (groupRows[0] as { id?: number })?.id != null) {
        groupId = Number((groupRows[0] as { id: number }).id);
      }
    } catch (e) {
      console.warn("[POST /api/tickets] Could not resolve group for auto-assign:", e);
    }

    // Insert ticket (include group_id when we resolved one)
    const newTicketResult =
      groupId != null
        ? await sqlClient`
            INSERT INTO tickets (
              ticket_number, service_type, ticket_category, ticket_section, source_role,
              title_id, subject, description, priority, order_id, order_service_type,
              is_3pl_order, is_high_value_order, created_by_user_id, status, group_id
            )
            VALUES (
              ${ticketNumber}, ${serviceType}, ${ticketCategory}, ${ticketSection}, ${sourceRole},
              ${titleId || null}, ${subject}, ${description}, ${priority}, ${orderId || null}, ${orderServiceType || null},
              ${is3plOrder}, ${isHighValueOrder}, ${systemUser.id}, 'open', ${groupId}
            )
            RETURNING *
          `
        : await sqlClient`
            INSERT INTO tickets (
              ticket_number, service_type, ticket_category, ticket_section, source_role,
              title_id, subject, description, priority, order_id, order_service_type,
              is_3pl_order, is_high_value_order, created_by_user_id, status
            )
            VALUES (
              ${ticketNumber}, ${serviceType}, ${ticketCategory}, ${ticketSection}, ${sourceRole},
              ${titleId || null}, ${subject}, ${description}, ${priority}, ${orderId || null}, ${orderServiceType || null},
              ${is3plOrder}, ${isHighValueOrder}, ${systemUser.id}, 'open'
            )
            RETURNING *
          `;
    const newTicket = newTicketResult[0];

    return NextResponse.json({
      success: true,
      data: { ticket: newTicket },
    });
  } catch (error) {
    console.error("[POST /api/tickets] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
