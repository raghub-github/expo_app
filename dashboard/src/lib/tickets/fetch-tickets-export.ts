import { buildSearchParams, type TicketFilterState } from "@/hooks/tickets/useTicketFilters";
import type { Ticket, TicketsResponse } from "@/hooks/tickets/useTickets";

export function mergeExportScopedFilters(
  base: TicketFilterState,
  opts: {
    dateFrom: string;
    dateTo: string;
    agentMode: "all" | "specific";
    /** When agentMode is specific, one or more system user ids (strings). */
    agentUserIds: string[];
    groupMode: "all" | "specific";
    /** When groupMode is specific, one or more group ids (strings). */
    groupIdsSelected: string[];
  }
): TicketFilterState {
  const agentIds = opts.agentUserIds.map((s) => s.trim()).filter(Boolean);
  const assignedToIds =
    opts.agentMode === "specific" && agentIds.length > 0 ? agentIds : base.assignedToIds;

  const grpIds = opts.groupIdsSelected.map((s) => s.trim()).filter(Boolean);
  const groupIds = opts.groupMode === "specific" && grpIds.length > 0 ? grpIds : base.groupIds;

  const dateFrom = opts.dateFrom.trim() || base.dateFrom;
  const dateTo = opts.dateTo.trim() || base.dateTo;

  return {
    ...base,
    assignedToIds,
    groupIds,
    dateFrom,
    dateTo,
    createdPreset: dateFrom || dateTo ? "custom" : base.createdPreset,
  };
}

/** Paginates until all matching rows are loaded (max 10k per request). */
export async function fetchAllTicketsForExport(
  filters: TicketFilterState,
  signal?: AbortSignal
): Promise<Ticket[]> {
  const all: Ticket[] = [];
  let offset = 0;
  const pageSize = 5000;
  let total: number | null = null;

  while (true) {
    const params = buildSearchParams(filters);
    params.set("forExport", "1");
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));

    const res = await fetch(`/api/tickets?${params.toString()}`, {
      signal,
      credentials: "include",
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(typeof err.error === "string" ? err.error : `Export failed (${res.status})`);
    }
    const body = (await res.json()) as { success?: boolean; error?: string; data?: TicketsResponse };
    if (!body.success || !body.data) throw new Error(body.error || "Export failed");
    const payload = body.data;
    if (total === null) total = payload.total;
    all.push(...payload.tickets);
    if (payload.tickets.length < pageSize) break;
    offset += pageSize;
    if (total != null && offset >= total) break;
    if (payload.tickets.length === 0) break;
  }
  return all;
}
