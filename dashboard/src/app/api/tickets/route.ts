/**
 * Tickets API Route
 * GET /api/tickets - List tickets with advanced filtering
 * POST /api/tickets - Create new ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { eq, and, or, desc, gte, lte, isNotNull, isNull, ilike, sql, inArray } from "drizzle-orm";
import { systemUsers, tickets } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * GET /api/tickets
 * List tickets with advanced filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(session.user.id, session.user.email!, "TICKET");
    
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);

    // Pagination
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    // Filters (support multi-select via comma-separated or repeated params)
    const serviceTypeParam = searchParams.get("serviceType") || searchParams.getAll("serviceType").join(",");
    const ticketSection = searchParams.get("ticketSection"); // customer | rider | merchant | system
    const statusParam = searchParams.get("status") || searchParams.getAll("status").join(",");
    const priorityParam = searchParams.get("priority") || searchParams.getAll("priority").join(",");
    const ticketCategory = searchParams.get("ticketCategory"); // order_related | non_order | other
    const assignedTo = searchParams.get("assignedTo"); // Legacy: single value
    const assignedToIdsParam = searchParams.get("assignedToIds"); // Multi-select: comma-separated IDs or "me", "unassigned"
    const sourceRoleParam = searchParams.get("sourceRole") || searchParams.getAll("sourceRole").join(",");
    const groupIdsParam = searchParams.get("groupIds") || searchParams.get("groupId") || searchParams.getAll("groupIds").join(",");
    const tagsParam = (searchParams.get("tags") || "").trim();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const dueFrom = searchParams.get("dueFrom");
    const dueTo = searchParams.get("dueTo");
    const searchQuery = (searchParams.get("q") || "").trim();
    const isHighValue = searchParams.get("isHighValue"); // true | false
    const slaBreach = searchParams.get("slaBreach"); // true | false
    const sortByParam = (searchParams.get("sortBy") || "created_at").toLowerCase();
    const sortOrderParam = (searchParams.get("sortOrder") || "desc").toLowerCase();

    const sortBy =
      sortByParam === "updated_at" || sortByParam === "sla_due_at"
        ? sortByParam
        : "created_at";
    const sortOrder = sortOrderParam === "asc" ? "ASC" : "DESC";
    const orderByClause = `${sortBy} ${sortOrder}`;

    // Build conditions
    const conditions: any[] = [];

    // Use postgres library with template literals
    const sqlClient = getSql();
    
    // Build WHERE conditions using postgres.js template literal syntax
    const whereConditions: any[] = [];

    // Service type filter (multi)
    const serviceTypes = serviceTypeParam
      ? serviceTypeParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (serviceTypes.length > 0) {
      whereConditions.push(sql`service_type = ANY(${serviceTypes})`);
    }

    // Ticket section filter
    if (ticketSection && ticketSection !== "all") {
      whereConditions.push(sql`ticket_section = ${ticketSection}`);
    }

    // Status filter (multi)
    const statuses = statusParam
      ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (statuses.length > 0) {
      whereConditions.push(sql`status = ANY(${statuses})`);
    }

    // Priority filter (multi)
    const priorities = priorityParam
      ? priorityParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (priorities.length > 0) {
      whereConditions.push(sql`priority = ANY(${priorities})`);
    }

    // Category filter
    if (ticketCategory && ticketCategory !== "all") {
      whereConditions.push(sql`ticket_category = ${ticketCategory}`);
    }

    // Assignment filter (multi-select support)
    const assignedToIds = assignedToIdsParam
      ? assignedToIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : assignedTo && assignedTo !== "all"
      ? [assignedTo] // Legacy support
      : [];
    
    if (assignedToIds.length > 0) {
      const meIndex = assignedToIds.indexOf("me");
      const unassignedIndex = assignedToIds.indexOf("unassigned");
      const numericIds = assignedToIds
        .filter((id) => id !== "me" && id !== "unassigned")
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      const conditions: any[] = [];
      
      if (meIndex !== -1) {
        conditions.push(sql`current_assignee_user_id = ${systemUser.id}`);
      }
      if (unassignedIndex !== -1) {
        conditions.push(sql`current_assignee_user_id IS NULL`);
      }
      if (numericIds.length > 0) {
        conditions.push(sql`current_assignee_user_id = ANY(${numericIds})`);
      }
      
      if (conditions.length > 0) {
        whereConditions.push(sql`(${sql.join(conditions, sql` OR `)})`);
      }
    }

    // Source role filter (multi)
    const sourceRoles = sourceRoleParam
      ? sourceRoleParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (sourceRoles.length > 0) {
      whereConditions.push(sql`source_role = ANY(${sourceRoles})`);
    }

    // Group filter (multi) - via ticket_titles.group_id
    const groupIds = groupIdsParam
      ? groupIdsParam.split(",").map((s) => s.trim()).filter(Boolean).map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n))
      : [];
    if (groupIds.length > 0) {
      whereConditions.push(sql`title_id IS NOT NULL AND title_id IN (
        SELECT id FROM ticket_titles WHERE group_id = ANY(${groupIds})
      )`);
    }

    // Date range filter
    if (dateFrom) {
      whereConditions.push(sql`created_at >= ${dateFrom}`);
    }
    if (dateTo) {
      whereConditions.push(sql`created_at <= ${dateTo}`);
    }

    // SLA due range filter
    if (dueFrom || dueTo) {
      whereConditions.push(sql`sla_due_at IS NOT NULL`);
    }
    if (dueFrom) {
      whereConditions.push(sql`sla_due_at >= ${dueFrom}`);
    }
    if (dueTo) {
      whereConditions.push(sql`sla_due_at <= ${dueTo}`);
    }

    // High value filter
    if (isHighValue === "true") {
      whereConditions.push(sql`is_high_value_order = true`);
    }

    // SLA breach filter
    if (slaBreach === "true") {
      whereConditions.push(sql`sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('closed', 'resolved')`);
    }

    // Search query
    if (searchQuery) {
      const num = parseInt(searchQuery, 10);
      if (!Number.isNaN(num) && String(num) === searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        whereConditions.push(sql`(ticket_number LIKE ${searchPattern} OR id = ${num} OR order_id = ${num})`);
      } else {
        const term = `%${searchQuery.replace(/%/g, "\\%")}%`;
        whereConditions.push(sql`(subject ILIKE ${term} OR description ILIKE ${term} OR ticket_number LIKE ${term})`);
      }
    }

    // Tags filter (comma-separated tag codes)
    if (tagsParam) {
      const tags = tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        whereConditions.push(sql`id IN (
          SELECT m.ticket_id
          FROM ticket_tag_map m
          JOIN ticket_tags t ON t.id = m.tag_id
          WHERE t.tag_code = ANY(${tags})
        )`);
      }
    }

    // Build query using postgres.js template literals
    let countResult: any;
    let ticketRows: any;

    try {
      // Combine WHERE conditions with AND
      const whereClause = whereConditions.length > 0
        ? whereConditions.reduce((acc, cond, idx) => 
            idx === 0 ? cond : sql`${acc} AND ${cond}`
          )
        : null;

      if (whereClause) {
        // Execute queries with WHERE clause
        countResult = await sqlClient`
          SELECT COUNT(*)::int as count 
          FROM tickets 
          WHERE ${whereClause}
        `;
        
        ticketRows = await sqlClient`
          SELECT 
            t.id, t.ticket_number, t.service_type, t.ticket_category, t.ticket_section, t.source_role,
            t.title_id, t.subject, t.description, t.status, t.priority, t.order_id, t.order_service_type,
            t.is_3pl_order, t.is_high_value_order, t.current_assignee_user_id,
            t.sla_due_at, t.resolved_at, t.closed_at, t.created_at, t.updated_at,
            tt.group_id as title_group_id,
            tg.group_name as group_name,
            tg.group_code as group_code
          FROM tickets t
          LEFT JOIN ticket_titles tt ON t.title_id = tt.id
          LEFT JOIN ticket_groups tg ON tt.group_id = tg.id AND tg.is_active = true
          WHERE ${whereClause}
          ORDER BY ${sql.raw(orderByClause)}
          LIMIT ${limit}
          OFFSET ${offset}
        `;
      } else {
        // No WHERE clause
        countResult = await sqlClient`SELECT COUNT(*)::int as count FROM tickets`;
        ticketRows = await sqlClient`
          SELECT 
            t.id, t.ticket_number, t.service_type, t.ticket_category, t.ticket_section, t.source_role,
            t.title_id, t.subject, t.description, t.status, t.priority, t.order_id, t.order_service_type,
            t.is_3pl_order, t.is_high_value_order, t.current_assignee_user_id,
            t.sla_due_at, t.resolved_at, t.closed_at, t.created_at, t.updated_at,
            tt.group_id as title_group_id,
            tg.group_name as group_name,
            tg.group_code as group_code
          FROM tickets t
          LEFT JOIN ticket_titles tt ON t.title_id = tt.id
          LEFT JOIN ticket_groups tg ON tt.group_id = tg.id AND tg.is_active = true
          ORDER BY ${sql.raw(orderByClause)}
          LIMIT ${limit}
          OFFSET ${offset}
        `;
      }
    } catch (queryError) {
      console.error("[GET /api/tickets] Query execution error:", queryError);
      console.error("[GET /api/tickets] Error details:", {
        message: queryError instanceof Error ? queryError.message : String(queryError),
        stack: queryError instanceof Error ? queryError.stack : undefined,
        whereConditionsCount: whereConditions.length,
      });
      throw queryError;
    }

    const total = countResult[0]?.count || 0;

    // Get assignee names
    const assigneeIds = ticketRows
      .map((t: any) => t.current_assignee_user_id)
      .filter((id: any): id is number => id !== null);

    let assignees: any[] = [];
    if (assigneeIds.length > 0) {
      const assigneesResult = await sqlClient`
        SELECT id, full_name, email
        FROM system_users
        WHERE id = ANY(${assigneeIds})
      `;
      assignees = assigneesResult || [];
    }

    const assigneeMap = new Map(assignees.map((a: any) => [a.id, a]));

    // Format response
    const tickets = ticketRows.map((ticket: any) => {
      const assignee = ticket.current_assignee_user_id
        ? assigneeMap.get(ticket.current_assignee_user_id)
        : null;

      return {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        serviceType: ticket.service_type,
        ticketCategory: ticket.ticket_category,
        ticketSection: ticket.ticket_section,
        sourceRole: ticket.source_role,
        title: null, // Will be populated if title_id exists
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        orderId: ticket.order_id,
        orderServiceType: ticket.order_service_type,
        is3plOrder: ticket.is_3pl_order,
        isHighValueOrder: ticket.is_high_value_order,
        assignee: assignee
          ? {
              id: assignee.id,
              name: assignee.full_name,
              email: assignee.email,
            }
          : null,
        group: ticket.title_group_id && ticket.group_name
          ? {
              id: ticket.title_group_id,
              name: ticket.group_name,
              code: ticket.group_code,
            }
          : null,
        slaDueAt: ticket.sla_due_at,
        resolvedAt: ticket.resolved_at,
        closedAt: ticket.closed_at,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        total: Number(total) ?? 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets] Error:", error);
    console.error("[GET /api/tickets] Error stack:", error instanceof Error ? error.stack : "No stack");
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(session.user.email!);
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
    const countResult = await sqlClient`
      SELECT COUNT(*)::int as count
      FROM tickets
      WHERE EXTRACT(YEAR FROM created_at) = ${year}
    `;
    const ticketCount = countResult[0]?.count || 0;
    const ticketNumber = `TKT-${year}-${String(ticketCount + 1).padStart(6, "0")}`;

    // Insert ticket
    const newTicketResult = await sqlClient`
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
