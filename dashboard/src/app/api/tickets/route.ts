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
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const resolvedFrom = searchParams.get("resolvedFrom");
    const resolvedTo = searchParams.get("resolvedTo");
    const closedFrom = searchParams.get("closedFrom");
    const closedTo = searchParams.get("closedTo");
    const searchQuery = (searchParams.get("q") || "").trim();
    const orderIdParam = searchParams.get("orderId");
    const orderIdFilter = orderIdParam != null && orderIdParam !== "" ? parseInt(orderIdParam, 10) : null;
    const sortByParam = (searchParams.get("sortBy") || "created_at").toLowerCase();
    const sortOrderParam = (searchParams.get("sortOrder") || "desc").toLowerCase();

    const allowedSortColumns = ["created_at", "updated_at", "priority", "status"];
    const sortBy = allowedSortColumns.includes(sortByParam) ? sortByParam : "created_at";
    const sortOrder = sortOrderParam === "asc" ? "ASC" : "DESC";
    const orderByClause = `${sortBy} ${sortOrder}`;

    const sqlClient = getSql();
    /** postgres.js fragments (do not use Drizzle sql`` here — incompatible with getSql() templates) */
    const whereConditions: unknown[] = [];

    const serviceTypes = serviceTypeParam ? serviceTypeParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (serviceTypes.length > 0) {
      whereConditions.push(sqlClient`ut.service_type = ANY(${serviceTypes})`);
    }
    if (ticketSection && ticketSection !== "all") {
      whereConditions.push(sqlClient`ut.raised_by_type = ${ticketSection.toUpperCase()}`);
    }
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim().toUpperCase().replace(/-/g, "_")).filter(Boolean) : [];
    if (statuses.length > 0) {
      whereConditions.push(sqlClient`ut.status = ANY(${statuses})`);
    }
    const priorities = priorityParam ? priorityParam.split(",").map((s) => s.trim().toUpperCase().replace(/-/g, "_")).filter(Boolean) : [];
    if (priorities.length > 0) {
      whereConditions.push(sqlClient`ut.priority = ANY(${priorities})`);
    }
    if (ticketCategory && ticketCategory !== "all") {
      whereConditions.push(sqlClient`ut.ticket_category = ${ticketCategory}`);
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
      if (unassignedIndex !== -1) orParts.push(sqlClient`ut.assigned_to_agent_id IS NULL`);
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
    if (dateFrom) {
      whereConditions.push(sqlClient`ut.created_at >= ${dateFrom}::date`);
    }
    if (dateTo) {
      whereConditions.push(sqlClient`ut.created_at <= (${dateTo}::date + interval '1 day')`);
    }
    if (resolvedFrom) {
      whereConditions.push(sqlClient`ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${resolvedFrom}::date`);
    }
    if (resolvedTo) {
      whereConditions.push(sqlClient`ut.resolved_at IS NOT NULL AND ut.resolved_at < (${resolvedTo}::date + interval '1 day')`);
    }
    if (closedFrom) {
      whereConditions.push(sqlClient`ut.closed_at IS NOT NULL AND ut.closed_at >= ${closedFrom}::date`);
    }
    if (closedTo) {
      whereConditions.push(sqlClient`ut.closed_at IS NOT NULL AND ut.closed_at < (${closedTo}::date + interval '1 day')`);
    }
    if (orderIdFilter != null && !Number.isNaN(orderIdFilter)) {
      whereConditions.push(sqlClient`ut.order_id = ${orderIdFilter}`);
    }
    if (searchQuery) {
      const num = parseInt(searchQuery, 10);
      if (!Number.isNaN(num) && String(num) === searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        whereConditions.push(sqlClient`(ut.ticket_id LIKE ${searchPattern} OR ut.id = ${num} OR ut.order_id = ${num})`);
      } else {
        const term = `%${searchQuery.replace(/%/g, "\\%")}%`;
        whereConditions.push(sqlClient`(ut.subject ILIKE ${term} OR ut.description ILIKE ${term} OR ut.ticket_id ILIKE ${term})`);
      }
    }
    if (tagsParam) {
      const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        whereConditions.push(sqlClient`ut.tags && ${tags}`);
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? whereConditions.reduce((acc, cond, idx) =>
            idx === 0 ? cond : sqlClient`${acc as never} AND ${cond as never}`
          )
        : null;

    let countResult: { count: number }[];
    let ticketRows: Record<string, unknown>[];

    const redis = getRedisClient();
    const cacheKey = systemUser ? `tickets:${systemUser.id}:${request.nextUrl.searchParams.toString()}` : null;
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
              ut.subject, ut.description, ut.priority, ut.status,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, tg.group_code as group_code, tg.group_name as group_name
            FROM public.unified_tickets ut
            LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
            WHERE ${whereClause as never}
            ORDER BY ${sqlClient.unsafe(orderByClause)}            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
        } catch {
          ticketRows = (await sqlClient`
            SELECT
              ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
              ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
              ut.subject, ut.description, ut.priority, ut.status,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at
            FROM public.unified_tickets ut
            WHERE ${whereClause as never}
            ORDER BY ${sqlClient.unsafe(orderByClause)}            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
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
              ut.subject, ut.description, ut.priority, ut.status,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at,
              ut.group_id, tg.group_code as group_code, tg.group_name as group_name
            FROM public.unified_tickets ut
            LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
            ORDER BY ${sqlClient.unsafe(orderByClause)}            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
        } catch {
          ticketRows = (await sqlClient`
            SELECT
              ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
              ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_name,
              ut.subject, ut.description, ut.priority, ut.status,
              ut.assigned_to_agent_id, ut.assigned_to_agent_name,
              ut.created_at, ut.updated_at, ut.resolved_at, ut.closed_at
            FROM public.unified_tickets ut
            ORDER BY ${sqlClient.unsafe(orderByClause)}            LIMIT ${limit}
            OFFSET ${offset}
          `) as unknown as Record<string, unknown>[];
        }
      }
    } catch (queryError) {
      console.error("[GET /api/tickets] Query execution error:", queryError);
      console.error("[GET /api/tickets] Ensure public.unified_tickets table and enums exist.");
      throw queryError;
    }

    const total = countResult[0]?.count ?? 0;

    const tickets = ticketRows.map((t: Record<string, unknown>) => {
      const rawStatus = String(t.status ?? "").toUpperCase().replace(/-/g, "_");
      const rawPriority = String(t.priority ?? "").toUpperCase().replace(/-/g, "_");
      const groupId = t.group_id != null ? Number(t.group_id) : null;
      const groupName = t.group_name != null ? String(t.group_name) : "";
      const groupCode = t.group_code != null ? String(t.group_code) : "";
      return {
        id: Number(t.id),
        ticketNumber: String(t.ticket_id ?? ""),
        serviceType: String(t.service_type ?? ""),
        ticketCategory: String(t.ticket_category ?? ""),
        ticketSection: String(t.ticket_source ?? ""),
        sourceRole: String(t.raised_by_type ?? ""),
        title: t.ticket_title != null ? String(t.ticket_title) : null,
        subject: String(t.subject ?? ""),
        description: String(t.description ?? ""),
        status: rawStatus ? rawStatus.toLowerCase() : "",
        priority: rawPriority ? rawPriority.toLowerCase() : "",
        orderId: t.order_id != null ? Number(t.order_id) : null,
        orderServiceType: t.order_type != null ? String(t.order_type) : null,
        is3plOrder: false,
        isHighValueOrder: false,
        assignee:
          t.assigned_to_agent_id != null
            ? {
                id: Number(t.assigned_to_agent_id),
                name: (t.assigned_to_agent_name as string) || "",
                email: "",
              }
            : null,
        group: groupId != null ? { id: groupId, name: groupName || groupCode, code: groupCode || groupName } : null,
        slaDueAt: null,
        resolvedAt: t.resolved_at != null ? String(t.resolved_at) : null,
        closedAt: t.closed_at != null ? String(t.closed_at) : null,
        createdAt: String(t.created_at ?? ""),
        updatedAt: String(t.updated_at ?? ""),
      };
    });

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
    const countResult = (await sqlClient`
      SELECT COUNT(*)::int as count
      FROM tickets
      WHERE EXTRACT(YEAR FROM created_at) = ${year}
    `) as unknown as { count: number }[];
    const ticketCount = countResult[0]?.count || 0;
    const ticketNumber = `TKT-${year}-${String(ticketCount + 1).padStart(6, "0")}`;

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
