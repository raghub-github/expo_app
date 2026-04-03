"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/** Populated when fetching with includePresence (supervisor / queue views). */
export interface QueueAgentPresence {
  currentStatus: string;
  isOnline: boolean;
  lastActivityAt: string | null;
  /** Latest logged transition to offline (availability log). */
  lastLogoutAt: string | null;
  lastLogoutReason: string | null;
  /** UTC date (YYYY-MM-DD) the daily totals refer to */
  todayUtc: string;
  todayOnlineMinutes: number;
  todayBreakMinutes: number;
  todayBusyMinutes: number;
  /** Online + busy minutes (queue presence excluding break). */
  todayWorkingMinutes: number;
}

export interface TicketAgent {
  id: number;
  name: string;
  email: string;
  queuePresence?: QueueAgentPresence;
}

export interface TicketsAgentsData {
  agents: TicketAgent[];
  currentUser?: { id: number; name: string; email: string };
}

export async function fetchTicketsAgents(
  includePresence: boolean,
  accessApprovedOnly: boolean
): Promise<TicketsAgentsData> {
  const params = new URLSearchParams();
  if (includePresence) params.set("includePresence", "1");
  if (accessApprovedOnly) params.set("accessApprovedOnly", "1");
  const qs = params.toString();
  const q = qs ? `?${qs}` : "";
  const r = await fetch(`/api/tickets/agents${q}`, { credentials: "include" });
  const d = r.ok ? await r.json().catch(() => ({ success: false })) : { success: false };
  if (!d.success || !d.data) {
    return { agents: [] };
  }
  return {
    agents: d.data.agents ?? [],
    currentUser: d.data.currentUser,
  };
}

/** Single deduplicated query for ticket agents; use in TicketFilters, TicketList, TicketPropertiesPanel. */
export function useTicketsAgentsQuery(opts?: {
  includePresence?: boolean;
  refetchIntervalMs?: number;
  /** Only users with an active `dashboard_access` row for the Tickets/TICKET dashboard (supervisor assignment UI). */
  accessApprovedOnly?: boolean;
}) {
  const includePresence = opts?.includePresence ?? false;
  const accessApprovedOnly = opts?.accessApprovedOnly ?? false;
  const refetchEvery = includePresence ? (opts?.refetchIntervalMs ?? 15_000) : false;
  return useQuery({
    queryKey: queryKeys.tickets.agents(includePresence, accessApprovedOnly),
    queryFn: () => fetchTicketsAgents(includePresence, accessApprovedOnly),
    staleTime: includePresence ? (opts?.refetchIntervalMs ?? 15_000) : 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: refetchEvery,
  });
}
