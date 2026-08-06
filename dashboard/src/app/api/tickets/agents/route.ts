/**
 * GET /api/tickets/agents
 * List all agents (system users) who have TICKET dashboard access (view or action).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getDb, getSql } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints, systemUsers } from "@/lib/db/schema";
import { and, eq, inArray, asc, sql } from "drizzle-orm";
import { getCached, setCached, CACHE_KEYS } from "@/lib/server-cache";

export const runtime = "nodejs";

const AGENTS_CACHE_TTL_MS = 60_000; // 60s

export async function GET(request: NextRequest) {
  try {
    const includePresence =
      request.nextUrl.searchParams.get("includePresence") === "1" ||
      request.nextUrl.searchParams.get("includePresence") === "true";
    const accessApprovedOnly =
      request.nextUrl.searchParams.get("accessApprovedOnly") === "1" ||
      request.nextUrl.searchParams.get("accessApprovedOnly") === "true";
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email!,
      "TICKET"
    );

    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const currentUser = {
      id: systemUser.id,
      name: systemUser.fullName ?? systemUser.email ?? "Me",
      email: systemUser.email ?? "",
    };

    const cachedAgents = getCached<Array<{ id: number; name: string; email: string }>>(CACHE_KEYS.TICKETS_AGENTS_LIST);
    if (!includePresence && cachedAgents) {
      return NextResponse.json({
        success: true,
        data: { agents: cachedAgents, currentUser },
      });
    }

    const db = getDb();
    const sqlClient = getSql();

    let userIds: number[];

    if (accessApprovedOnly) {
      // Supervisor UI: only users with an active approved row in `dashboard_access` for the tickets dashboard.
      const accessRows = await db
        .select({ systemUserId: dashboardAccess.systemUserId })
        .from(dashboardAccess)
        .where(
          and(
            eq(dashboardAccess.isActive, true),
            sql`lower(trim(${dashboardAccess.dashboardType})) in ('ticket', 'tickets')`
          )
        );
      userIds = [...new Set(accessRows.map((r) => Number(r.systemUserId)))];
    } else {
      // Ticket dashboard access rows (match storage variants: TICKET, ticket, tickets, etc.)
      const accessRows = await db
        .select({ systemUserId: dashboardAccess.systemUserId })
        .from(dashboardAccess)
        .where(
          and(
            eq(dashboardAccess.isActive, true),
            sql`lower(trim(${dashboardAccess.dashboardType})) in ('ticket', 'tickets')`
          )
        );

      const accessPointRows = await db
        .select({ systemUserId: dashboardAccessPoints.systemUserId })
        .from(dashboardAccessPoints)
        .where(
          and(
            eq(dashboardAccessPoints.isActive, true),
            sql`lower(trim(${dashboardAccessPoints.dashboardType})) in ('ticket', 'tickets')`
          )
        );

      const userIdsFromAccess = accessRows.map((r) => r.systemUserId);
      const userIdsFromAccessPoints = accessPointRows.map((r) => r.systemUserId);
      userIds = [...new Set([...userIdsFromAccess, ...userIdsFromAccessPoints])];

      // Also include agents who are currently assigned to tickets.
      //
      // This used to read `tickets.current_assignee_user_id` — columns from the
      // enterprise ticket schema (migrations 0055/0056/0061) that were never
      // applied here. The query failed on every request ("column
      // current_assignee_user_id does not exist"), so agents who hold tickets
      // but have no dashboard_access row were silently missing from the picker.
      // The live table is `unified_tickets.assigned_to_agent_id`.
      try {
        const assignedAgentsResult = (await sqlClient`
          SELECT DISTINCT assigned_to_agent_id
          FROM public.unified_tickets
          WHERE assigned_to_agent_id IS NOT NULL
        `) as unknown as { assigned_to_agent_id: unknown }[];
        const assignedAgentIds = assignedAgentsResult
          .map((r) => r.assigned_to_agent_id)
          .filter((id): id is number | bigint => id != null && (typeof id === "number" || typeof id === "bigint"))
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0);
        userIds = [...new Set([...userIds, ...assignedAgentIds])];
      } catch (e) {
        console.warn("[tickets/agents] assigned-agents enrichment failed:", (e as Error).message);
      }
    }

    const selfId = Number(systemUser.id);
    userIds = [
      ...new Set(
        [...userIds.map(Number)].filter((n) => Number.isFinite(n) && n > 0).concat(selfId > 0 ? [selfId] : [])
      ),
    ];

    if (userIds.length === 0) {
      if (!includePresence) {
        setCached(CACHE_KEYS.TICKETS_AGENTS_LIST, [], AGENTS_CACHE_TTL_MS);
      }
      return NextResponse.json({
        success: true,
        data: { agents: [], currentUser },
      });
    }

    const users = await db
      .select({
        id: systemUsers.id,
        fullName: systemUsers.fullName,
        email: systemUsers.email,
      })
      .from(systemUsers)
      .where(inArray(systemUsers.id, userIds))
      .orderBy(asc(systemUsers.fullName));

    if (!includePresence) {
      const agents = users.map((u) => ({
        id: u.id,
        name: u.fullName ?? "",
        email: u.email ?? "",
      }));
      setCached(CACHE_KEYS.TICKETS_AGENTS_LIST, agents, AGENTS_CACHE_TTL_MS);
      return NextResponse.json({
        success: true,
        data: { agents, currentUser },
      });
    }

    // Enrichment queries below are all best-effort — if any of the
    // agent presence / activity / availability tables is missing or has
    // a schema drift, we return the base agent list without the extras
    // rather than 500'ing the whole endpoint.
    let profileRows: {
      user_id: number;
      current_status: string | null;
      is_online: boolean | null;
      last_activity_at: string | null;
    }[] = [];
    try {
      profileRows = (await sqlClient`
        SELECT user_id, current_status, is_online, last_activity_at
        FROM agent_profiles
        WHERE user_id IN ${sqlClient(userIds)}
      `) as {
        user_id: number;
        current_status: string | null;
        is_online: boolean | null;
        last_activity_at: string | null;
      }[];
    } catch (e) {
      console.warn("[tickets/agents] agent_profiles enrichment failed:", (e as Error).message);
    }

    const profileById = new Map(
      profileRows.map((r) => [
        Number(r.user_id),
        {
          currentStatus: (r.current_status as string) || "offline",
          isOnline: Boolean(r.is_online),
          lastActivityAt: r.last_activity_at,
        },
      ])
    );

    const todayUtc = new Date().toISOString().slice(0, 10);
    let dayRows: {
      agent_user_id: number;
      online_time_minutes: number | null;
      break_time_minutes: number | null;
      busy_time_minutes: number | null;
    }[] = [];
    try {
      dayRows = (await sqlClient`
        SELECT agent_user_id, online_time_minutes, break_time_minutes, busy_time_minutes
        FROM agent_activity_logs
        WHERE activity_date = ${todayUtc}::date
          AND agent_user_id IN ${sqlClient(userIds)}
      `) as {
        agent_user_id: number;
        online_time_minutes: number | null;
        break_time_minutes: number | null;
        busy_time_minutes: number | null;
      }[];
    } catch (e) {
      console.warn("[tickets/agents] agent_activity_logs enrichment failed:", (e as Error).message);
    }

    const dayByAgent = new Map(
      dayRows.map((r) => {
        const on = Number(r.online_time_minutes) || 0;
        const br = Number(r.break_time_minutes) || 0;
        const bu = Number(r.busy_time_minutes) || 0;
        return [
          Number(r.agent_user_id),
          {
            todayOnlineMinutes: on,
            todayBreakMinutes: br,
            todayBusyMinutes: bu,
            todayWorkingMinutes: on + bu,
          },
        ];
      })
    );

    let logoutRows: {
      agent_user_id: number;
      changed_at: string;
      reason: string | null;
    }[] = [];
    if (userIds.length > 0) {
      try {
        logoutRows = (await sqlClient`
          SELECT DISTINCT ON (agent_user_id) agent_user_id, changed_at, reason
          FROM public.agent_availability_logs
          WHERE agent_user_id IN ${sqlClient(userIds)} AND status = 'offline'
          ORDER BY agent_user_id, changed_at DESC
        `) as {
          agent_user_id: number;
          changed_at: string;
          reason: string | null;
        }[];
      } catch (e) {
        console.warn("[tickets/agents] agent_availability_logs enrichment failed:", (e as Error).message);
      }
    }

    const logoutByAgent = new Map(
      logoutRows.map((r) => [
        Number(r.agent_user_id),
        { at: r.changed_at, reason: r.reason },
      ])
    );

    const agents = users.map((u) => {
      const id = Number(u.id);
      const p = profileById.get(id);
      const d = dayByAgent.get(id);
      const lo = logoutByAgent.get(id);
      return {
        id,
        name: u.fullName ?? "",
        email: u.email ?? "",
        queuePresence: {
          currentStatus: p?.currentStatus ?? "offline",
          isOnline: p?.isOnline ?? false,
          lastActivityAt: p?.lastActivityAt ?? null,
          lastLogoutAt: lo?.at ?? null,
          lastLogoutReason: lo?.reason ?? null,
          todayUtc,
          todayOnlineMinutes: d?.todayOnlineMinutes ?? 0,
          todayBreakMinutes: d?.todayBreakMinutes ?? 0,
          todayBusyMinutes: d?.todayBusyMinutes ?? 0,
          todayWorkingMinutes: d?.todayWorkingMinutes ?? 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: { agents, currentUser },
    });
  } catch (error) {
    console.error("[GET /api/tickets/agents] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
