/**
 * GET /api/tickets/[id]/activities
 * Complete activity timeline: unified_ticket_activities + ticket-level events from unified_tickets
 * (assignment, unassignment, first response, resolved at/by, closed at, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";

export const runtime = "nodejs";

type ActivityItem = {
  id: string;
  ticketId: number;
  actionType: string;
  activityDescription: string | null;
  actorType: string | null;
  actorName: string | null;
  actorEmail?: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  sortKey: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "80", 10) || 80));

    const sqlClient = getSql();

    const ticketCheck = await sqlClient`
      SELECT id, created_at
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const ticketCreatedAt = (ticketCheck[0] as { created_at: string }).created_at;
    const list: ActivityItem[] = [];
    const ts = (d: string | null) => (d ? new Date(d).toISOString() : "");

    // Primary source: unified_ticket_activity_audit (every action is recorded here)
    let auditRows: Array<{
      id: number;
      ticket_id: number;
      activity_type: string;
      activity_category: string;
      activity_description: string;
      actor_user_id: number | null;
      actor_name: string | null;
      actor_email: string | null;
      actor_type: string | null;
      old_value: unknown;
      new_value: unknown;
      created_at: string;
    }> = [];
    try {
      auditRows = await sqlClient`
        SELECT id, ticket_id, activity_type, activity_category, activity_description,
               actor_user_id, actor_name, actor_email, actor_type, old_value, new_value, created_at
        FROM public.unified_ticket_activity_audit
        WHERE ticket_id = ${ticketId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } catch {
      // table may not exist or actor_email column missing (migration 0098)
    }
    if (auditRows.length === 0 && limit > 0) {
      try {
        const fallback = await sqlClient`
          SELECT id, ticket_id, activity_type, activity_category, activity_description,
                 actor_user_id, actor_name, actor_type, old_value, new_value, created_at
          FROM public.unified_ticket_activity_audit
          WHERE ticket_id = ${ticketId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        auditRows = (fallback as Record<string, unknown>[]).map((r) => ({ ...r, actor_email: null })) as typeof auditRows;
      } catch {
        // table may not exist before migration 0096
      }
    }

    for (const a of auditRows) {
      const row = a as typeof auditRows[0] & { actor_email?: string | null };
      list.push({
        id: `audit-${row.id}`,
        ticketId: row.ticket_id,
        actionType: row.activity_type,
        activityDescription: row.activity_description,
        actorType: row.actor_type,
        actorName: row.actor_name,
        actorEmail: row.actor_email ?? undefined,
        oldValue: row.old_value,
        newValue: row.new_value,
        createdAt: row.created_at,
        sortKey: ts(row.created_at) + `-${row.id}`,
      });
    }

    // Ensure "Ticket created" is present (no audit row for creation)
    const hasCreation = list.some((x) => x.actionType === "ticket_created" || x.actionType === "CREATED");
    if (!hasCreation && ticketCreatedAt) {
      list.push({
        id: "ticket-created",
        ticketId,
        actionType: "CREATED",
        activityDescription: "Ticket created",
        actorType: null,
        actorName: null,
        oldValue: null,
        newValue: null,
        createdAt: ticketCreatedAt,
        sortKey: ts(ticketCreatedAt) + "-created",
      });
    }

    // Fallback: surface CSAT/DSAT from ticket columns when audit row was never written
    try {
      const satRows = await sqlClient`
        SELECT satisfaction_rating, satisfaction_feedback, satisfaction_collected_at
        FROM public.unified_tickets
        WHERE id = ${ticketId}
        LIMIT 1
      `;
      const sat = satRows?.[0] as
        | {
            satisfaction_rating: number | null;
            satisfaction_feedback: string | null;
            satisfaction_collected_at: string | null;
          }
        | undefined;
      const rating =
        sat?.satisfaction_rating != null && Number.isFinite(Number(sat.satisfaction_rating))
          ? Number(sat.satisfaction_rating)
          : null;
      const collectedAt =
        sat?.satisfaction_collected_at != null && String(sat.satisfaction_collected_at).trim() !== ""
          ? String(sat.satisfaction_collected_at)
          : null;
      if (rating != null && collectedAt) {
        const hasSat = list.some((x) => {
          const t = String(x.actionType || "").toLowerCase();
          const d = String(x.activityDescription || "").toLowerCase();
          return (
            t === "satisfaction_rating" ||
            t === "csat" ||
            t === "dsat" ||
            d.includes("csat") ||
            d.includes("dsat") ||
            d.includes("satisfaction") ||
            d.includes("rating")
          );
        });
        if (!hasSat) {
          const bucket = rating >= 4 ? "CSAT" : rating <= 2 ? "DSAT" : "Neutral";
          list.push({
            id: "satisfaction-fallback",
            ticketId,
            actionType: "satisfaction_rating",
            activityDescription: `${bucket} ${rating}/5 submitted`,
            actorType: null,
            actorName: null,
            oldValue: null,
            newValue: {
              rating,
              feedback: sat?.satisfaction_feedback ?? null,
              bucket: bucket.toLowerCase(),
            },
            createdAt: collectedAt,
            sortKey: ts(collectedAt) + "-satisfaction",
          });
        }
      }
    } catch {
      // ignore
    }

    // Fallback: legacy unified_ticket_activities if no audit rows yet
    if (list.length === 0) {
      let dbActivities: Array<{
        id: number;
        ticket_id: number;
        activity_type: string;
        activity_description: string | null;
        actor_type: string | null;
        actor_name: string | null;
        old_value: unknown;
        new_value: unknown;
        created_at: string;
      }> = [];
      try {
        dbActivities = await sqlClient`
          SELECT id, ticket_id, activity_type, activity_description, actor_type, actor_name, old_value, new_value, created_at
          FROM public.unified_ticket_activities
          WHERE ticket_id = ${ticketId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } catch {
        // ignore
      }
      for (const a of dbActivities) {
        list.push({
          id: `activity-${a.id}`,
          ticketId: a.ticket_id,
          actionType: a.activity_type,
          activityDescription: a.activity_description,
          actorType: a.actor_type,
          actorName: a.actor_name,
          oldValue: a.old_value,
          newValue: a.new_value,
          createdAt: a.created_at,
          sortKey: ts(a.created_at) + `-${a.id}`,
        });
      }
      // Prepend ticket created when using legacy table
      list.push({
        id: "ticket-created",
        ticketId,
        actionType: "CREATED",
        activityDescription: "Ticket created",
        actorType: null,
        actorName: null,
        oldValue: null,
        newValue: null,
        createdAt: ticketCreatedAt,
        sortKey: ts(ticketCreatedAt) + "-created",
      });
    }

    list.sort((a, b) => (b.sortKey < a.sortKey ? -1 : b.sortKey > a.sortKey ? 1 : 0));
    const trimmed = list.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: {
        activities: trimmed.map((a) => ({
          id: a.id,
          ticketId: a.ticketId,
          actionType: a.actionType,
          activityDescription: a.activityDescription,
          actorType: a.actorType,
          actorName: a.actorName,
          actorEmail: a.actorEmail ?? null,
          oldValue: a.oldValue,
          newValue: a.newValue,
          createdAt: a.createdAt,
        })),
        nextCursor: list.length > limit ? String(trimmed[trimmed.length - 1]?.id ?? "") : null,
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets/[id]/activities] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
