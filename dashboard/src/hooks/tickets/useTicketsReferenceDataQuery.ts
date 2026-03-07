"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface TicketReferenceGroup {
  id: number;
  groupCode: string;
  groupName: string;
}

export interface TicketReferenceData {
  groups: TicketReferenceGroup[];
  statuses: Array<{ value: string; label: string }>;
  services: Array<{ value: string; label: string }>;
  priorities: Array<{ value: string; label: string }>;
  sources: Array<{ value: string; label: string }>;
}

const emptyRefData: TicketReferenceData = {
  groups: [],
  statuses: [],
  services: [],
  priorities: [],
  sources: [],
};

async function fetchTicketsReferenceData(): Promise<TicketReferenceData> {
  const r = await fetch("/api/tickets/reference-data", { credentials: "include" });
  const d = r.ok ? await r.json().catch(() => ({ success: false })) : { success: false };
  if (!d.success || !d.data) return emptyRefData;
  return {
    groups: d.data.groups ?? [],
    statuses: d.data.statuses ?? [],
    services: d.data.services ?? [],
    priorities: d.data.priorities ?? [],
    sources: d.data.sources ?? [],
  };
}

/** Single deduplicated query for ticket reference data; use in TicketFilters, TicketList, NewTicketForm, etc. */
export function useTicketsReferenceDataQuery() {
  return useQuery({
    queryKey: queryKeys.tickets.referenceData(),
    queryFn: fetchTicketsReferenceData,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: emptyRefData,
  });
}
