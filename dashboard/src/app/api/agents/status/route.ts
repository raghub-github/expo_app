import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { headers } from "next/headers";
import { runQueueBalanceAutoAssign } from "@/lib/tickets/queue-balance-auto-assign";
import { addProfileMinutesAndDailyActivity } from "@/lib/agents/activity-daily-rollup";
import { inferStatusSegmentStart, recordCompletedStatusSegment } from "@/lib/agents/status-segment-utils";

/**
 * GET /api/agents/status
 * Get current agent's online/offline status
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const sqlClient = getSql();

    // Get agent profile
    const profileResult = await sqlClient`
      SELECT 
        ap.*,
        su.full_name,
        su.email
      FROM agent_profiles ap
      JOIN system_users su ON ap.user_id = su.id
      WHERE ap.user_id = ${systemUser.id}
      LIMIT 1
    `;

    if (!profileResult || profileResult.length === 0) {
      // Create profile if it doesn't exist
      await sqlClient`
        INSERT INTO agent_profiles (user_id, current_status, is_online, current_status_since)
        VALUES (${systemUser.id}, 'offline', false, now())
        ON CONFLICT (user_id) DO NOTHING
      `;
      
      return NextResponse.json({
        success: true,
        data: {
          isOnline: false,
          currentStatus: "offline",
          breakStartedAt: null,
          lastOnlineAt: null,
        },
      });
    }

    const profile = profileResult[0];

    return NextResponse.json({
      success: true,
      data: {
        isOnline: profile.is_online || false,
        currentStatus: profile.current_status || "offline",
        breakStartedAt: profile.break_started_at,
        lastOnlineAt: profile.last_online_at,
        totalOnlineTimeMinutes: profile.total_online_time_minutes || 0,
        totalBreakTimeMinutes: profile.total_break_time_minutes || 0,
        totalBusyTimeMinutes: profile.total_busy_time_minutes ?? 0,
        busyStartedAt: profile.busy_started_at ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching agent status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch agent status" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/status
 * Update agent's online/offline/break status
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Check if user has ticket action permissions (UPDATE or ASSIGN).
    // Some users are configured on ticket sub-dashboards, so validate across all ticket dashboard variants.
    const ticketDashboards = [
      "TICKET",
      "TICKET_FOOD",
      "TICKET_PARCEL",
      "TICKET_PERSON_RIDE",
      "TICKET_GENERAL",
      "TICKET_CUSTOMER_FOOD",
      "TICKET_CUSTOMER_PARCEL",
      "TICKET_CUSTOMER_PERSON_RIDE",
      "TICKET_CUSTOMER_GENERAL",
      // Legacy/normalized values seen in older data
      "ticket",
      "tickets",
      "ticket_food",
      "ticket_parcel",
      "ticket_person_ride",
      "ticket_general",
      "ticket_customer_food",
      "ticket_customer_parcel",
      "ticket_customer_person_ride",
      "ticket_customer_general",
    ] as const;

    let hasTicketEditAccess = false;
    const permissionDebug: Array<{ dashboardType: string; canUpdate: boolean; canAssign: boolean }> = [];
    for (const dashboardType of ticketDashboards) {
      const canUpdate = await canPerformActionByAuth(
        user.id,
        user.email!,
        dashboardType as any,
        "UPDATE"
      );
      let canAssign = false;
      if (canUpdate) {
        permissionDebug.push({ dashboardType, canUpdate, canAssign });
        hasTicketEditAccess = true;
        break;
      }
      canAssign = await canPerformActionByAuth(
        user.id,
        user.email!,
        dashboardType as any,
        "ASSIGN"
      );
      permissionDebug.push({ dashboardType, canUpdate, canAssign });
      if (canAssign) {
        hasTicketEditAccess = true;
        break;
      }
    }

    // Dedicated grant for queue header online/offline toggle (Super Admin can assign explicitly).
    const hasStatusToggleAccess =
      (await canPerformActionByAuth(
        user.id,
        user.email!,
        "TICKET",
        "UPDATE",
        undefined,
        { access_point_group: "TICKET_AGENT_STATUS_TOGGLE" }
      )) ||
      (await canPerformActionByAuth(
        user.id,
        user.email!,
        "ticket" as any,
        "UPDATE",
        undefined,
        { access_point_group: "TICKET_AGENT_STATUS_TOGGLE" }
      ));

    if (!hasTicketEditAccess && !hasStatusToggleAccess) {
      console.warn("[PATCH /api/agents/status] permission denied", {
        authUserId: user.id,
        email: user.email,
        systemUserId: systemUser.id,
        primaryRole: systemUser.primary_role,
        permissionDebug,
        hasStatusToggleAccess,
      });
      return NextResponse.json(
        { success: false, error: "You don't have permission to change status" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, breakType, reason } = body;

    if (!status || !["online", "offline", "break", "busy"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status. Must be: online, offline, break, or busy" },
        { status: 400 }
      );
    }

    if (status === "offline") {
      const offlineReason = typeof reason === "string" ? reason.trim() : "";
      if (!offlineReason) {
        return NextResponse.json(
          { success: false, error: "Reason is required to go offline" },
          { status: 400 }
        );
      }
      if (offlineReason.length > 500) {
        return NextResponse.json({ success: false, error: "Reason is too long" }, { status: 400 });
      }
    }

    const sqlClient = getSql();
    const headersList = await headers();
    const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
    const userAgent = headersList.get("user-agent") || "unknown";

    // Get current profile
    const currentProfileResult = await sqlClient`
      SELECT * FROM agent_profiles WHERE user_id = ${systemUser.id} LIMIT 1
    `;

    let currentStatus = "offline";
    let previousStatus = "offline";
    let breakStartedAt: string | null = null;
    let busyStartedAt: string | null = null;

    if (currentProfileResult && currentProfileResult.length > 0) {
      currentStatus = currentProfileResult[0].current_status || "offline";
      previousStatus = currentStatus;
      breakStartedAt = currentProfileResult[0].break_started_at ?? null;
      busyStartedAt = currentProfileResult[0].busy_started_at ?? null;
    }

    if (previousStatus === status) {
      return NextResponse.json({
        success: true,
        data: { status },
      });
    }

    // Handle status transitions - use ISO strings for postgres timestamp columns
    const toIso = (d: Date) => d.toISOString();

    if (status === "online") {
      // Going online
      const now = new Date();
      const nowIso = toIso(now);

      if (currentStatus === "busy" && busyStartedAt) {
        await addProfileMinutesAndDailyActivity(sqlClient, {
          agentUserId: systemUser.id,
          segmentStart: new Date(busyStartedAt),
          segmentEnd: now,
          kind: "busy",
        });
      }

      // If coming from break, close break log + roll into profile + daily activity_logs
      if (currentStatus === "break" && breakStartedAt) {
        const breakDuration = Math.floor((now.getTime() - new Date(breakStartedAt).getTime()) / 60000);

        await sqlClient`
          UPDATE agent_break_logs
          SET break_ended_at = ${nowIso},
              duration_minutes = ${breakDuration},
              is_active = false,
              updated_at = ${nowIso}
          WHERE agent_user_id = ${systemUser.id} AND is_active = true
        `;

        await addProfileMinutesAndDailyActivity(sqlClient, {
          agentUserId: systemUser.id,
          segmentStart: new Date(breakStartedAt),
          segmentEnd: now,
          kind: "break",
        });
      }

      const profRowOnline = currentProfileResult?.[0] as Record<string, unknown> | undefined;
      const segStartOnline = inferStatusSegmentStart(profRowOnline, previousStatus);
      await recordCompletedStatusSegment(sqlClient, {
        agentUserId: systemUser.id,
        status: previousStatus,
        startedAt: segStartOnline,
        endedAt: now,
        changeSource: "self",
        changedByUserId: systemUser.id,
      });

      // Update profile
      await sqlClient`
        INSERT INTO agent_profiles (
          user_id, current_status, is_online, last_online_at, break_started_at, busy_started_at, last_activity_at, updated_at,
          current_status_since
        )
        VALUES (${systemUser.id}, ${status}, true, ${nowIso}, NULL, NULL, ${nowIso}, ${nowIso}, ${nowIso})
        ON CONFLICT (user_id) DO UPDATE SET
          current_status = ${status},
          is_online = true,
          last_online_at = ${nowIso},
          break_started_at = NULL,
          busy_started_at = NULL,
          last_activity_at = ${nowIso},
          updated_at = ${nowIso},
          current_status_since = ${nowIso}
      `;

      await sqlClient`
        INSERT INTO agent_work_sessions (agent_user_id, started_at)
        SELECT ${systemUser.id}, ${nowIso}
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_work_sessions s
          WHERE s.agent_user_id = ${systemUser.id} AND s.ended_at IS NULL
        )
      `;

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, ip_address, user_agent, changed_at,
          changed_by_user_id, change_source
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${ipAddress}, ${userAgent}, ${nowIso},
          ${systemUser.id}, 'self'
        )
      `;
    } else if (status === "break") {
      // Going on break
      const now = new Date();
      const nowIso = toIso(now);

      if (currentStatus === "busy" && busyStartedAt) {
        await addProfileMinutesAndDailyActivity(sqlClient, {
          agentUserId: systemUser.id,
          segmentStart: new Date(busyStartedAt),
          segmentEnd: now,
          kind: "busy",
        });
      }

      if (currentStatus === "online") {
        const lastOnlineAt = currentProfileResult?.[0]?.last_online_at;
        if (lastOnlineAt) {
          await addProfileMinutesAndDailyActivity(sqlClient, {
            agentUserId: systemUser.id,
            segmentStart: new Date(lastOnlineAt as string),
            segmentEnd: now,
            kind: "online",
          });
        }
      }

      // Create break log
      await sqlClient`
        INSERT INTO agent_break_logs (
          agent_user_id, break_type, reason, break_started_at, is_active
        )
        VALUES (
          ${systemUser.id},
          ${breakType || "other"},
          ${reason || null},
          ${nowIso},
          true
        )
      `;

      const profRowBreak = currentProfileResult?.[0] as Record<string, unknown> | undefined;
      const segStartBreak = inferStatusSegmentStart(profRowBreak, previousStatus);
      await recordCompletedStatusSegment(sqlClient, {
        agentUserId: systemUser.id,
        status: previousStatus,
        startedAt: segStartBreak,
        endedAt: now,
        changeSource: "self",
        changedByUserId: systemUser.id,
      });

      // Update profile
      await sqlClient`
        UPDATE agent_profiles
        SET current_status = ${status},
            is_online = false,
            break_started_at = ${nowIso},
            busy_started_at = NULL,
            last_activity_at = ${nowIso},
            updated_at = ${nowIso},
            current_status_since = ${nowIso}
        WHERE user_id = ${systemUser.id}
      `;

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, reason, ip_address, user_agent, changed_at,
          changed_by_user_id, change_source
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${reason || null}, ${ipAddress}, ${userAgent}, ${nowIso},
          ${systemUser.id}, 'self'
        )
      `;
    } else {
      // Going offline or busy
      const now = new Date();
      const nowIso = toIso(now);

      if (currentStatus === "busy" && busyStartedAt) {
        await addProfileMinutesAndDailyActivity(sqlClient, {
          agentUserId: systemUser.id,
          segmentStart: new Date(busyStartedAt),
          segmentEnd: now,
          kind: "busy",
        });
      }

      if (currentStatus === "online") {
        const lastOnlineAt = currentProfileResult?.[0]?.last_online_at;
        if (lastOnlineAt) {
          await addProfileMinutesAndDailyActivity(sqlClient, {
            agentUserId: systemUser.id,
            segmentStart: new Date(lastOnlineAt as string),
            segmentEnd: now,
            kind: "online",
          });
        }
      }

      if (currentStatus === "break" && breakStartedAt) {
        const breakDuration = Math.floor((now.getTime() - new Date(breakStartedAt).getTime()) / 60000);

        await sqlClient`
          UPDATE agent_break_logs
          SET break_ended_at = ${nowIso},
              duration_minutes = ${breakDuration},
              is_active = false,
              updated_at = ${nowIso}
          WHERE agent_user_id = ${systemUser.id} AND is_active = true
        `;

        await addProfileMinutesAndDailyActivity(sqlClient, {
          agentUserId: systemUser.id,
          segmentStart: new Date(breakStartedAt),
          segmentEnd: now,
          kind: "break",
        });
      }

      const profRowOther = currentProfileResult?.[0] as Record<string, unknown> | undefined;
      const segStartOther = inferStatusSegmentStart(profRowOther, previousStatus);
      await recordCompletedStatusSegment(sqlClient, {
        agentUserId: systemUser.id,
        status: previousStatus,
        startedAt: segStartOther,
        endedAt: now,
        changeSource: "self",
        changedByUserId: systemUser.id,
      });

      // Update profile
      const busyAt = status === "busy" ? nowIso : null;
      await sqlClient`
        UPDATE agent_profiles
        SET current_status = ${status},
            is_online = ${status === "busy" ? true : false},
            break_started_at = NULL,
            busy_started_at = ${busyAt},
            last_activity_at = ${nowIso},
            updated_at = ${nowIso},
            current_status_since = ${nowIso}
        WHERE user_id = ${systemUser.id}
      `;

      if (status === "offline") {
        await sqlClient`
          UPDATE agent_work_sessions
          SET ended_at = ${nowIso},
              ended_by_user_id = ${systemUser.id},
              end_source = 'self_offline'
          WHERE agent_user_id = ${systemUser.id} AND ended_at IS NULL
        `;
      }

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, reason, ip_address, user_agent, changed_at,
          changed_by_user_id, change_source
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${reason || null}, ${ipAddress}, ${userAgent}, ${nowIso},
          ${systemUser.id}, 'self'
        )
      `;
    }

    if (status === "online") {
      try {
        await runQueueBalanceAutoAssign(sqlClient, { forAgentUserId: systemUser.id });
      } catch (e) {
        console.error("[PATCH /api/agents/status] queue auto-assign:", e);
      }
      try {
        const { runAgentAutomation } = await import("@/lib/tickets/ticket-automation/engine");
        const { processPendingAutomationJobs } = await import("@/lib/tickets/ticket-automation/job-processor");
        await runAgentAutomation(sqlClient, systemUser.id, { workerLabel: "api-agents-status-online" });
        await processPendingAutomationJobs(sqlClient, {
          limit: 12,
          workerId: `api-agents-status-${systemUser.id}`,
        });
      } catch (autoErr) {
        console.error("[PATCH /api/agents/status] workflow automation:", autoErr);
      }
    }

    // Fully offline only: release + automation. Break/busy never enqueue agent_went_offline
    // (tickets stay assigned while the agent is on break or busy).
    if (status === "offline") {
      try {
        const { getTicketQueueOfflineReleaseSettings } = await import("@/lib/tickets/ticket-queue-offline-settings");
        const { enqueueTicketAutomationJob } = await import("@/lib/tickets/ticket-automation/enqueue-automation-job");
        const { processPendingAutomationJobs } = await import("@/lib/tickets/ticket-automation/job-processor");
        const offlineSettings = await getTicketQueueOfflineReleaseSettings(sqlClient);
        if (offlineSettings.releaseWhenAgentOffline) {
          await enqueueTicketAutomationJob(sqlClient, {
            ticketId: null,
            agentUserId: systemUser.id,
            triggerEvent: "agent_went_offline",
            idempotencyKey: `agent-offline:${systemUser.id}:${Math.floor(Date.now() / 1000)}`,
          });
          await processPendingAutomationJobs(sqlClient, {
            limit: 20,
            workerId: `api-agents-offline-${systemUser.id}`,
          });
        }
      } catch (autoErr) {
        console.error("[PATCH /api/agents/status] offline automation:", autoErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: { status },
    });
  } catch (error) {
    console.error("Error updating agent status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update agent status" },
      { status: 500 }
    );
  }
}
