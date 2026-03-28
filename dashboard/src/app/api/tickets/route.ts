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
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";

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

    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const serviceTypeParam = searchParams.get("serviceType") || searchParams.getAll("serviceType").join(",");
    const ticketSection = searchParams.get("ticketSection");
    const statusParam = searchParams.get("status") || searchParams.getAll("status").join(",");
    const priorityParam = searchParams.get("priority") || searchParams.getAll("priority").join(",");
    const ticketCategory = searchParams.get("ticketCategory");
    const assignedTo = searchParams.get("assignedTo");
    const assignedToIdsParam = searchParams.get("assignedToIds");
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
    const orderIdParam = searchParams.get("orderId");
    const orderIdFilter = orderIdParam != null && orderIdParam !== "" ? parseInt(orderIdParam, 10) : null;
    const sortByParam = (searchParams.get("sortBy") || "created_at").toLowerCase();
    const sortOrderParam = (searchParams.get("sortOrder") || "desc").toLowerCase();

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
      OPEN_FRT: "OPEN",
      ASSIGNED: "OPEN",
    };
    const validStatusValues = new Set([
      "OPEN",
      "IN_PROGRESS",
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
    const statuses = rawStatuses
      .map((s) => statusAliases[s] ?? s)
      .filter((s) => validStatusValues.has(s));
    if (rawStatuses.length > 0) {
      if (statuses.length > 0) whereConditions.push(sqlClient`ut.status = ANY(${statuses})`);
      else whereConditions.push(sqlClient`FALSE`);
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
    if (assignedToIds.length > 0) {
      const meIndex = assignedToIds.indexOf("me");
      const unassignedIndex = assignedToIds.indexOf("unassigned");
      const numericIds = assignedToIds.filter((id) => id !== "me" && id !== "unassigned").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
      const orParts: unknown[] = [];
      if (meIndex !== -1) orParts.push(sqlClient`ut.assigned_to_agent_id = ${systemUser.id}`);
      if (unassignedIndex !== -1) {
        orParts.push(
          sqlClient`NOT EXISTS (SELECT 1 FROM public.system_users su WHERE su.id = ut.assigned_to_agent_id)`
        );
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
    if (updatedAfterRaw) {
      whereConstraints.push(sqlClient`ut.updated_at > ${updatedAfterRaw}::timestamptz`);
    }
    if (createdAfterRaw) {
      whereConstraints.push(sqlClient`ut.created_at > ${createdAfterRaw}::timestamptz`);
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

    const redis = getRedisClient();
    const cacheKey = systemUser ? `tickets:v21:${systemUser.id}:${request.nextUrl.searchParams.toString()}` : null;
    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback

    if (cacheKey) {
      const cached = getCached<{ tickets: unknown[]; total: number; limit: number; offset: number }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
        });
      }
    }

    if (redis && cacheKey) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            tickets: unknown[];
            total: number;
            limit: number;
            offset: number;
          };
          // Populate memory cache too for immediate follow-up navigations.
          setCached(cacheKey, parsed, MEMORY_TTL_MS);
          return NextResponse.json({
            success: true,
            data: parsed,
          });
        }
      } catch {
        // ignore cache read errors
      }
    }

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
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, ut.metadata, ut.sla_due_at,
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
                ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                ut.group_id, ut.metadata, ut.sla_due_at,
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
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id, ut.metadata, ut.sla_due_at,
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
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, ut.metadata, ut.sla_due_at,
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
                ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                ut.group_id, ut.metadata, ut.sla_due_at,
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
                  ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
                  ut.group_id, ut.metadata, ut.sla_due_at,
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

      return {
        id: Number.isFinite(resolvedId) ? resolvedId : 0,
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
                name: rowStr(t, "assigned_to_agent_name", "assignedToAgentName") || "",
                email: "",
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

    if (cacheKey) {
      setCached(cacheKey, payload, MEMORY_TTL_MS);
    }

    if (redis && cacheKey) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
      } catch {
        // ignore cache write errors
      }
    }

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
