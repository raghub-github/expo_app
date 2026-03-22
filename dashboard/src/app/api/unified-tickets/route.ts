/**
 * GET /api/unified-tickets
 * List tickets from public.unified_tickets with pagination and optional filters.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

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

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const sqlClient = getSql();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const statusParam = searchParams.get("status") || searchParams.get("statuses") || "";
    const priorityParam = searchParams.get("priority") || searchParams.get("priorities") || "";
    const searchQuery = (searchParams.get("q") || searchParams.get("search") || "").trim();
    const sortBy = ["created_at", "updated_at", "status", "priority"].includes((searchParams.get("sortBy") || "created_at").toLowerCase())
      ? (searchParams.get("sortBy") || "created_at").toLowerCase()
      : "created_at";
    const sortOrder = (searchParams.get("sortOrder") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const priorities = priorityParam ? priorityParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    // Build WHERE conditions with raw SQL (unified_tickets table)
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex += 1;
    }
    if (priorities.length > 0) {
      conditions.push(`priority = ANY($${paramIndex}::text[])`);
      params.push(priorities);
      paramIndex += 1;
    }
    if (searchQuery) {
      conditions.push(`(ticket_id ILIKE $${paramIndex} OR subject ILIKE $${paramIndex + 1} OR description ILIKE $${paramIndex + 1})`);
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
      paramIndex += 2;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

    const countSql = `SELECT COUNT(*)::int as count FROM public.unified_tickets ${whereClause}`;
    const listSql = `
      SELECT
        id, ticket_id, ticket_type, ticket_source, service_type, ticket_title, ticket_category,
        order_id, customer_id, rider_id, merchant_store_id, merchant_parent_id,
        raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
        subject, description, priority, status,
        assigned_to_agent_id, assigned_to_agent_name, assigned_at,
        resolution, resolved_at, resolved_by, resolved_by_name,
        escalated, first_response_at, last_response_at,
        parent_ticket_id, tags, order_type,
        created_at, updated_at, closed_at
      FROM public.unified_tickets
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const sqlUnsafe = (sqlClient as { unsafe: (query: string, values?: unknown[]) => Promise<unknown[]> }).unsafe;
    const countParams = conditions.length > 0 ? params.slice(0, -2) : [];
    const [countResult] = await sqlUnsafe(countSql, countParams);
    const total = (countResult as { count: number })?.count ?? 0;

    const listQueryNoWhere = `
      SELECT
        id, ticket_id, ticket_type, ticket_source, service_type, ticket_title, ticket_category,
        order_id, customer_id, rider_id, merchant_store_id, merchant_parent_id,
        raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
        subject, description, priority, status,
        assigned_to_agent_id, assigned_to_agent_name, assigned_at,
        resolution, resolved_at, resolved_by, resolved_by_name,
        escalated, first_response_at, last_response_at,
        parent_ticket_id, tags, order_type,
        created_at, updated_at, closed_at
      FROM public.unified_tickets
      ${orderClause}
      LIMIT $1 OFFSET $2
    `;
    const rows = await sqlUnsafe(
      conditions.length > 0 ? listSql : listQueryNoWhere,
      conditions.length > 0 ? params : [limit, offset]
    );

    const tickets = (rows || []).map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
      id: Number(r.id),
      ticketId: String(r.ticket_id ?? ""),
      ticketType: String(r.ticket_type ?? ""),
      ticketSource: String(r.ticket_source ?? ""),
      serviceType: String(r.service_type ?? ""),
      ticketTitle: String(r.ticket_title ?? ""),
      ticketCategory: String(r.ticket_category ?? ""),
      orderId: r.order_id != null ? Number(r.order_id) : null,
      customerId: r.customer_id != null ? Number(r.customer_id) : null,
      riderId: r.rider_id != null ? Number(r.rider_id) : null,
      merchantStoreId: r.merchant_store_id != null ? Number(r.merchant_store_id) : null,
      merchantParentId: r.merchant_parent_id != null ? Number(r.merchant_parent_id) : null,
      raisedByType: String(r.raised_by_type ?? ""),
      raisedById: r.raised_by_id != null ? Number(r.raised_by_id) : null,
      raisedByName: r.raised_by_name != null ? String(r.raised_by_name) : null,
      raisedByMobile: r.raised_by_mobile != null ? String(r.raised_by_mobile) : null,
      raisedByEmail: r.raised_by_email != null ? String(r.raised_by_email) : null,
      subject: String(r.subject ?? ""),
      description: String(r.description ?? ""),
      priority: String(r.priority ?? "MEDIUM"),
      status: String(r.status ?? "OPEN"),
      assignedToAgentId: r.assigned_to_agent_id != null ? Number(r.assigned_to_agent_id) : null,
      assignedToAgentName: r.assigned_to_agent_name != null ? String(r.assigned_to_agent_name) : null,
      assignedAt: r.assigned_at != null ? String(r.assigned_at) : null,
      resolution: r.resolution != null ? String(r.resolution) : null,
      resolvedAt: r.resolved_at != null ? String(r.resolved_at) : null,
      resolvedBy: r.resolved_by != null ? Number(r.resolved_by) : null,
      resolvedByName: r.resolved_by_name != null ? String(r.resolved_by_name) : null,
      escalated: Boolean(r.escalated),
      firstResponseAt: r.first_response_at != null ? String(r.first_response_at) : null,
      lastResponseAt: r.last_response_at != null ? String(r.last_response_at) : null,
      parentTicketId: r.parent_ticket_id != null ? Number(r.parent_ticket_id) : null,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      orderType: r.order_type != null ? String(r.order_type) : null,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
      closedAt: r.closed_at != null ? String(r.closed_at) : null,
    };
    });

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("[GET /api/unified-tickets] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch unified tickets",
      },
      { status: 500 }
    );
  }
}
