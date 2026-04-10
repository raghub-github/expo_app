import type { getSql } from "@/lib/db/client";
import { addProfileMinutesAndDailyActivity } from "@/lib/agents/activity-daily-rollup";
import { inferStatusSegmentStart, recordCompletedStatusSegment } from "@/lib/agents/status-segment-utils";

type SqlClient = ReturnType<typeof getSql>;

/**
 * Same side effects as an agent choosing "Go offline", plus availability log/session attribution to the supervisor.
 */
export async function applySupervisorAgentOffline(
  sql: SqlClient,
  opts: {
    targetUserId: number;
    supervisorUserId: number;
    ipAddress: string;
    userAgent: string;
    /** Stored on `agent_availability_logs.reason` for the offline event. */
    offlineReason?: string | null;
  }
): Promise<void> {
  const { targetUserId, supervisorUserId, ipAddress, userAgent, offlineReason } = opts;
  const reasonText =
    typeof offlineReason === "string" && offlineReason.trim() !== "" ? offlineReason.trim().slice(0, 500) : null;
  const now = new Date();
  const nowIso = now.toISOString();

  const currentProfileResult = (await sql`
    SELECT * FROM public.agent_profiles WHERE user_id = ${targetUserId} LIMIT 1
  `) as Record<string, unknown>[];

  let currentStatus = "offline";
  let breakStartedAt: string | null = null;
  let lastOnlineAt: string | null = null;
  let busyStartedAt: string | null = null;

  if (currentProfileResult?.length) {
    const row = currentProfileResult[0];
    currentStatus = (row.current_status as string) || "offline";
    breakStartedAt = (row.break_started_at as string) ?? null;
    lastOnlineAt = (row.last_online_at as string) ?? null;
    busyStartedAt = (row.busy_started_at as string) ?? null;
  }

  const previousStatus = currentStatus;

  if (currentStatus === "busy" && busyStartedAt) {
    await addProfileMinutesAndDailyActivity(sql, {
      agentUserId: targetUserId,
      segmentStart: new Date(busyStartedAt),
      segmentEnd: now,
      kind: "busy",
    });
  }

  if (currentStatus === "online" && lastOnlineAt) {
    await addProfileMinutesAndDailyActivity(sql, {
      agentUserId: targetUserId,
      segmentStart: new Date(lastOnlineAt),
      segmentEnd: now,
      kind: "online",
    });
  }

  if (currentStatus === "break" && breakStartedAt) {
    const breakDuration = Math.floor((now.getTime() - new Date(breakStartedAt).getTime()) / 60000);
    await sql`
      UPDATE public.agent_break_logs
      SET break_ended_at = ${nowIso},
          duration_minutes = ${breakDuration},
          is_active = false,
          updated_at = ${nowIso}
      WHERE agent_user_id = ${targetUserId} AND is_active = true
    `;
    await addProfileMinutesAndDailyActivity(sql, {
      agentUserId: targetUserId,
      segmentStart: new Date(breakStartedAt),
      segmentEnd: now,
      kind: "break",
    });
  }

  const profRow = currentProfileResult?.[0] as Record<string, unknown> | undefined;
  const segStart = inferStatusSegmentStart(profRow, previousStatus);
  await recordCompletedStatusSegment(sql, {
    agentUserId: targetUserId,
    status: previousStatus,
    startedAt: segStart,
    endedAt: now,
    reason: reasonText,
    changeSource: "supervisor",
    changedByUserId: supervisorUserId,
  });

  await sql`
    INSERT INTO public.agent_profiles (
      user_id, current_status, is_online, break_started_at, busy_started_at, last_activity_at, updated_at,
      current_status_since
    )
    VALUES (${targetUserId}, 'offline', false, NULL, NULL, ${nowIso}, ${nowIso}, ${nowIso})
    ON CONFLICT (user_id) DO UPDATE SET
      current_status = 'offline',
      is_online = false,
      break_started_at = NULL,
      busy_started_at = NULL,
      last_activity_at = ${nowIso},
      updated_at = ${nowIso},
      current_status_since = ${nowIso}
  `;

  await sql`
    UPDATE public.agent_work_sessions
    SET ended_at = ${nowIso},
        ended_by_user_id = ${supervisorUserId},
        end_source = 'supervisor_offline'
    WHERE agent_user_id = ${targetUserId} AND ended_at IS NULL
  `;

  await sql`
    INSERT INTO public.agent_availability_logs (
      agent_user_id, status, previous_status, reason, ip_address, user_agent, changed_at,
      changed_by_user_id, change_source
    )
    VALUES (
      ${targetUserId}, 'offline', ${previousStatus}, ${reasonText}, ${ipAddress}, ${userAgent}, ${nowIso},
      ${supervisorUserId}, 'supervisor'
    )
  `;
}
