import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

export type TicketQueueOfflineReleaseSettings = {
  releaseWhenAgentOffline: boolean;
  offlineReleaseMaxTickets: number;
};

const DEFAULT_MAX = 200;

/**
 * Singleton queue settings for offline release (migration 0171).
 * Safe defaults if table/columns missing.
 */
export async function getTicketQueueOfflineReleaseSettings(
  sql: SqlClient
): Promise<TicketQueueOfflineReleaseSettings> {
  try {
    const rows = (await sql`
      SELECT release_assignments_when_agent_offline, offline_release_max_tickets
      FROM public.ticket_queue_auto_assign_settings
      WHERE id = 1
      LIMIT 1
    `) as {
      release_assignments_when_agent_offline?: boolean | null;
      offline_release_max_tickets?: number | null;
    }[];
    const r = rows[0];
    const rel = r?.release_assignments_when_agent_offline;
    const max = Number(r?.offline_release_max_tickets);
    return {
      releaseWhenAgentOffline: rel !== false,
      offlineReleaseMaxTickets:
        Number.isFinite(max) && max >= 1 && max <= 500 ? Math.floor(max) : DEFAULT_MAX,
    };
  } catch {
    return { releaseWhenAgentOffline: true, offlineReleaseMaxTickets: DEFAULT_MAX };
  }
}
