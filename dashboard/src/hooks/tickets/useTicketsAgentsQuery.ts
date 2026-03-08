"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface TicketAgent {
  id: number;
  name: string;
  email: string;
}

export interface TicketsAgentsData {
  agents: TicketAgent[];
  currentUser?: { id: number; name: string; email: string };
}

async function fetchTicketsAgents(): Promise<TicketsAgentsData> {
  const r = await fetch("/api/tickets/agents", { credentials: "include" });
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
export function useTicketsAgentsQuery() {
  return useQuery({
    queryKey: queryKeys.tickets.agents(),
    queryFn: fetchTicketsAgents,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
