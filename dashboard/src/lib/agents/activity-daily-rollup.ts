import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

/** Split whole minutes of [segmentStart, segmentEnd) across UTC calendar days. */
export function splitActivityMinutesUtc(
  segmentStart: Date,
  segmentEnd: Date
): { dateStr: string; minutes: number }[] {
  const out: { dateStr: string; minutes: number }[] = [];
  let startMs = segmentStart.getTime();
  const endMs = segmentEnd.getTime();
  const totalMins = Math.floor((endMs - startMs) / 60000);
  if (totalMins <= 0) return out;

  let remaining = totalMins;
  while (remaining > 0 && startMs < endMs) {
    const cur = new Date(startMs);
    const y = cur.getUTCFullYear();
    const mo = cur.getUTCMonth();
    const d = cur.getUTCDate();
    const nextMidMs = Date.UTC(y, mo, d + 1);
    const chunkEndMs = Math.min(endMs, nextMidMs);
    const chunkMins = Math.min(remaining, Math.floor((chunkEndMs - startMs) / 60000));
    if (chunkMins > 0) {
      const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ dateStr, minutes: chunkMins });
      remaining -= chunkMins;
      startMs += chunkMins * 60000;
    } else {
      startMs = chunkEndMs;
    }
  }
  return out;
}

type DailyKind = "online" | "break" | "busy";

/**
 * Increment agent_profiles lifetime counter and agent_activity_logs per UTC day
 * (same rules as existing total_* fields on profile).
 */
export async function addProfileMinutesAndDailyActivity(
  sql: SqlClient,
  opts: {
    agentUserId: number;
    segmentStart: Date;
    segmentEnd: Date;
    kind: DailyKind;
  }
): Promise<void> {
  const { agentUserId, segmentStart, segmentEnd, kind } = opts;
  const totalMins = Math.floor((segmentEnd.getTime() - segmentStart.getTime()) / 60000);
  if (totalMins <= 0) return;

  if (kind === "online") {
    await sql`
      UPDATE public.agent_profiles
      SET total_online_time_minutes = total_online_time_minutes + ${totalMins}, updated_at = now()
      WHERE user_id = ${agentUserId}
    `;
  } else if (kind === "break") {
    await sql`
      UPDATE public.agent_profiles
      SET total_break_time_minutes = total_break_time_minutes + ${totalMins}, updated_at = now()
      WHERE user_id = ${agentUserId}
    `;
  } else {
    await sql`
      UPDATE public.agent_profiles
      SET total_busy_time_minutes = total_busy_time_minutes + ${totalMins}, updated_at = now()
      WHERE user_id = ${agentUserId}
    `;
  }

  const buckets = splitActivityMinutesUtc(segmentStart, segmentEnd);
  for (const { dateStr, minutes } of buckets) {
    if (minutes <= 0) continue;
    if (kind === "online") {
      await sql`
        INSERT INTO public.agent_activity_logs (agent_user_id, activity_date, online_time_minutes, updated_at)
        VALUES (${agentUserId}, ${dateStr}::date, ${minutes}, now())
        ON CONFLICT (agent_user_id, activity_date) DO UPDATE SET
          online_time_minutes = public.agent_activity_logs.online_time_minutes + ${minutes},
          updated_at = now()
      `;
    } else if (kind === "break") {
      await sql`
        INSERT INTO public.agent_activity_logs (agent_user_id, activity_date, break_time_minutes, updated_at)
        VALUES (${agentUserId}, ${dateStr}::date, ${minutes}, now())
        ON CONFLICT (agent_user_id, activity_date) DO UPDATE SET
          break_time_minutes = public.agent_activity_logs.break_time_minutes + ${minutes},
          updated_at = now()
      `;
    } else {
      await sql`
        INSERT INTO public.agent_activity_logs (agent_user_id, activity_date, busy_time_minutes, updated_at)
        VALUES (${agentUserId}, ${dateStr}::date, ${minutes}, now())
        ON CONFLICT (agent_user_id, activity_date) DO UPDATE SET
          busy_time_minutes = public.agent_activity_logs.busy_time_minutes + ${minutes},
          updated_at = now()
      `;
    }
  }
}
