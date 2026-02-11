import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { headers } from "next/headers";

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
        INSERT INTO agent_profiles (user_id, current_status, is_online)
        VALUES (${systemUser.id}, 'offline', false)
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

    // Check if user has ticket action permissions (UPDATE or ASSIGN)
    const hasTicketEditAccess = await canPerformActionByAuth(
      user.id,
      user.email!,
      "TICKET",
      "UPDATE"
    ) || await canPerformActionByAuth(
      user.id,
      user.email!,
      "TICKET",
      "ASSIGN"
    );

    if (!hasTicketEditAccess) {
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
    let breakStartedAt = null;

    if (currentProfileResult && currentProfileResult.length > 0) {
      currentStatus = currentProfileResult[0].current_status || "offline";
      previousStatus = currentStatus;
      breakStartedAt = currentProfileResult[0].break_started_at;
    }

    // Handle status transitions - use ISO strings for postgres timestamp columns
    const toIso = (d: Date) => d.toISOString();

    if (status === "online") {
      // Going online
      const now = new Date();
      const nowIso = toIso(now);

      // If coming from break, calculate break duration
      if (currentStatus === "break" && breakStartedAt) {
        const breakDuration = Math.floor((now.getTime() - new Date(breakStartedAt).getTime()) / 60000);

        // Update break log
        await sqlClient`
          UPDATE agent_break_logs
          SET break_ended_at = ${nowIso},
              duration_minutes = ${breakDuration},
              is_active = false,
              updated_at = ${nowIso}
          WHERE agent_user_id = ${systemUser.id} AND is_active = true
        `;

        // Update total break time
        await sqlClient`
          UPDATE agent_profiles
          SET total_break_time_minutes = total_break_time_minutes + ${breakDuration}
          WHERE user_id = ${systemUser.id}
        `;
      }

      // Update profile
      await sqlClient`
        INSERT INTO agent_profiles (user_id, current_status, is_online, last_online_at, break_started_at, last_activity_at, updated_at)
        VALUES (${systemUser.id}, ${status}, true, ${nowIso}, NULL, ${nowIso}, ${nowIso})
        ON CONFLICT (user_id) DO UPDATE SET
          current_status = ${status},
          is_online = true,
          last_online_at = ${nowIso},
          break_started_at = NULL,
          last_activity_at = ${nowIso},
          updated_at = ${nowIso}
      `;

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, ip_address, user_agent, changed_at
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${ipAddress}, ${userAgent}, ${nowIso}
        )
      `;
    } else if (status === "break") {
      // Going on break
      const now = new Date();
      const nowIso = toIso(now);

      // If currently online, calculate online time
      if (currentStatus === "online") {
        const lastOnlineAt = currentProfileResult?.[0]?.last_online_at;
        if (lastOnlineAt) {
          const onlineDuration = Math.floor((now.getTime() - new Date(lastOnlineAt).getTime()) / 60000);

          // Update total online time
          await sqlClient`
            UPDATE agent_profiles
            SET total_online_time_minutes = total_online_time_minutes + ${onlineDuration}
            WHERE user_id = ${systemUser.id}
          `;
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

      // Update profile
      await sqlClient`
        UPDATE agent_profiles
        SET current_status = ${status},
            is_online = false,
            break_started_at = ${nowIso},
            last_activity_at = ${nowIso},
            updated_at = ${nowIso}
        WHERE user_id = ${systemUser.id}
      `;

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, reason, ip_address, user_agent, changed_at
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${reason || null}, ${ipAddress}, ${userAgent}, ${nowIso}
        )
      `;
    } else {
      // Going offline or busy
      const now = new Date();
      const nowIso = toIso(now);

      // If currently online, calculate online time
      if (currentStatus === "online") {
        const lastOnlineAt = currentProfileResult?.[0]?.last_online_at;
        if (lastOnlineAt) {
          const onlineDuration = Math.floor((now.getTime() - new Date(lastOnlineAt).getTime()) / 60000);

          // Update total online time
          await sqlClient`
            UPDATE agent_profiles
            SET total_online_time_minutes = total_online_time_minutes + ${onlineDuration}
            WHERE user_id = ${systemUser.id}
          `;
        }
      }

      // If coming from break, calculate break duration
      if (currentStatus === "break" && breakStartedAt) {
        const breakDuration = Math.floor((now.getTime() - new Date(breakStartedAt).getTime()) / 60000);

        // Update break log
        await sqlClient`
          UPDATE agent_break_logs
          SET break_ended_at = ${nowIso},
              duration_minutes = ${breakDuration},
              is_active = false,
              updated_at = ${nowIso}
          WHERE agent_user_id = ${systemUser.id} AND is_active = true
        `;

        // Update total break time
        await sqlClient`
          UPDATE agent_profiles
          SET total_break_time_minutes = total_break_time_minutes + ${breakDuration}
          WHERE user_id = ${systemUser.id}
        `;
      }

      // Update profile
      await sqlClient`
        UPDATE agent_profiles
        SET current_status = ${status},
            is_online = ${status === "busy" ? true : false},
            break_started_at = NULL,
            last_activity_at = ${nowIso},
            updated_at = ${nowIso}
        WHERE user_id = ${systemUser.id}
      `;

      // Log availability change
      await sqlClient`
        INSERT INTO agent_availability_logs (
          agent_user_id, status, previous_status, reason, ip_address, user_agent, changed_at
        )
        VALUES (
          ${systemUser.id}, ${status}, ${previousStatus}, ${reason || null}, ${ipAddress}, ${userAgent}, ${nowIso}
        )
      `;
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
