import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

const VALID = new Set(["online", "offline", "break", "busy"]);

export function inferStatusSegmentStart(
  row: Record<string, unknown> | undefined,
  status: string
): Date | null {
  if (!row) return null;
  const cs = row.current_status_since;
  if (cs != null && String(cs).length > 0) {
    const d = new Date(cs as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const s = status.toLowerCase();
  if (s === "online" && row.last_online_at) {
    const d = new Date(row.last_online_at as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (s === "break" && row.break_started_at) {
    const d = new Date(row.break_started_at as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (s === "busy" && row.busy_started_at) {
    const d = new Date(row.busy_started_at as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (row.last_activity_at) {
    const d = new Date(row.last_activity_at as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export async function recordCompletedStatusSegment(
  sql: SqlClient,
  opts: {
    agentUserId: number;
    status: string;
    startedAt: Date | null;
    endedAt: Date;
    reason?: string | null;
    changeSource?: string | null;
    changedByUserId?: number | null;
  }
): Promise<void> {
  const status = (opts.status || "").toLowerCase();
  if (!VALID.has(status)) return;
  const start = opts.startedAt;
  if (!start || Number.isNaN(start.getTime())) return;
  if (opts.endedAt.getTime() <= start.getTime()) return;
  const durationMinutes = Math.floor((opts.endedAt.getTime() - start.getTime()) / 60000);
  const endedIso = opts.endedAt.toISOString();
  const startedIso = start.toISOString();
  await sql`
    INSERT INTO public.agent_status_segments (
      agent_user_id,
      status,
      started_at,
      ended_at,
      duration_minutes,
      reason,
      change_source,
      changed_by_user_id
    )
    VALUES (
      ${opts.agentUserId},
      ${status},
      ${startedIso},
      ${endedIso},
      ${durationMinutes},
      ${opts.reason ?? null},
      ${opts.changeSource ?? null},
      ${opts.changedByUserId ?? null}
    )
  `;
}
