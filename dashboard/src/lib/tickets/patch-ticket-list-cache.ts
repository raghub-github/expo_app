import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Ticket, TicketsResponse } from "@/hooks/tickets/useTickets";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";

/** Status transitions that usually drop a row from active / open-queue filters. */
export function statusLeavesTypicalActiveList(status: string | undefined): boolean {
  if (status == null) return false;
  const s = String(status).toLowerCase().replace(/-/g, "_");
  return ["resolved", "closed", "rejected", "cancelled", "provisionally_resolved", "snoozed"].includes(s);
}

function normalizeEnum(value: unknown): string | undefined {
  if (value == null || String(value).trim() === "") return undefined;
  return String(value).toLowerCase();
}

/** Merge a postgres `unified_tickets` row into a list `Ticket`. */
export function mergePostgresRowIntoListTicket(existing: Ticket, row: Record<string, unknown>): Ticket {
  const next = { ...existing };
  const status = normalizeEnum(row.status);
  const priority = normalizeEnum(row.priority);
  if (status != null) next.status = status;
  if (priority != null) next.priority = priority;
  if (row.is_spam !== undefined) next.isSpam = Boolean(row.is_spam);
  if (row.updated_at != null) next.updatedAt = String(row.updated_at);
  if (row.resolved_at !== undefined) next.resolvedAt = row.resolved_at != null ? String(row.resolved_at) : null;
  if (row.closed_at !== undefined) next.closedAt = row.closed_at != null ? String(row.closed_at) : null;
  if (row.sla_due_at !== undefined) next.slaDueAt = row.sla_due_at != null ? String(row.sla_due_at) : null;
  if (row.snoozed_until !== undefined) {
    next.snoozedUntil = row.snoozed_until != null ? String(row.snoozed_until) : null;
  }
  if (row.assigned_at !== undefined) {
    next.assignedAt = row.assigned_at != null ? String(row.assigned_at) : null;
  }

  if (row.assigned_to_agent_id !== undefined) {
    if (row.assigned_to_agent_id == null || row.assigned_to_agent_id === "") {
      next.assignee = null;
    } else {
      const id = Number(row.assigned_to_agent_id);
      if (Number.isFinite(id)) {
        next.assignee = {
          id,
          name: String(row.assigned_to_agent_name ?? existing.assignee?.name ?? ""),
          email: existing.assignee?.email ?? "",
        };
      }
    }
  }

  if (row.group_id !== undefined) {
    if (row.group_id == null || row.group_id === "") {
      next.group = null;
    } else {
      const gid = Number(row.group_id);
      if (Number.isFinite(gid)) {
        const prev = existing.group?.id === gid ? existing.group : null;
        next.group = {
          id: gid,
          name: prev?.name ?? existing.group?.name ?? "",
          code: prev?.code ?? existing.group?.code ?? "",
        };
      }
    }
  }

  return next;
}

/** Merge postgres row into open ticket detail (group uses groupName/groupCode). */
export function mergePostgresRowIntoTicketDetail(
  existing: TicketDetail,
  row: Record<string, unknown>
): TicketDetail {
  const next = { ...existing };
  const status = normalizeEnum(row.status);
  const priority = normalizeEnum(row.priority);
  if (status != null) next.status = status;
  if (priority != null) next.priority = priority;
  if (row.is_spam !== undefined) next.isSpam = Boolean(row.is_spam);
  if (row.updated_at != null) next.updatedAt = String(row.updated_at);
  if (row.first_response_at !== undefined) {
    next.firstResponseAt = row.first_response_at != null ? String(row.first_response_at) : null;
  }
  if (row.first_response_time_minutes != null && Number.isFinite(Number(row.first_response_time_minutes))) {
    next.firstResponseTimeMinutes = Number(row.first_response_time_minutes);
  }
  if (row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    next.metadata = { ...existing.metadata, ...(row.metadata as Record<string, unknown>) };
  }

  if (row.assigned_to_agent_id !== undefined) {
    if (row.assigned_to_agent_id == null || row.assigned_to_agent_id === "") {
      next.assignee = null;
    } else {
      const id = Number(row.assigned_to_agent_id);
      if (Number.isFinite(id)) {
        next.assignee = {
          id,
          name: String(row.assigned_to_agent_name ?? existing.assignee?.name ?? ""),
          email: existing.assignee?.email ?? "",
        };
      }
    }
  }

  if (row.group_id !== undefined) {
    if (row.group_id == null || row.group_id === "") {
      next.group = null;
    } else {
      const gid = Number(row.group_id);
      if (Number.isFinite(gid)) {
        const prev = existing.group?.id === gid ? existing.group : null;
        next.group = {
          id: gid,
          groupName: prev?.groupName ?? existing.group?.groupName ?? "",
          groupCode: prev?.groupCode ?? existing.group?.groupCode ?? "",
        };
      }
    }
  }

  // CSAT/DSAT — patch immediately so C&D panel updates without waiting for refetch
  if (row.satisfaction_rating !== undefined) {
    next.satisfactionRating =
      row.satisfaction_rating != null && Number.isFinite(Number(row.satisfaction_rating))
        ? Number(row.satisfaction_rating)
        : null;
  }
  if (row.satisfaction_feedback !== undefined) {
    next.satisfactionFeedback =
      typeof row.satisfaction_feedback === "string" && row.satisfaction_feedback.trim() !== ""
        ? row.satisfaction_feedback.trim()
        : null;
  }
  if (row.satisfaction_collected_at !== undefined) {
    next.satisfactionCollectedAt =
      row.satisfaction_collected_at != null && String(row.satisfaction_collected_at).trim() !== ""
        ? String(row.satisfaction_collected_at)
        : null;
  }

  return next;
}

/** True when a postgres UPDATE changed satisfaction fields (CSAT/DSAT). */
export function ticketSatisfactionChanged(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown> | null | undefined
): boolean {
  if (!newRow || typeof newRow !== "object") return false;
  const nextRating = newRow.satisfaction_rating;
  const nextAt = newRow.satisfaction_collected_at;
  if (nextRating == null && (nextAt == null || String(nextAt).trim() === "")) return false;
  if (!oldRow || typeof oldRow !== "object") return nextRating != null || nextAt != null;
  return (
    String(oldRow.satisfaction_rating ?? "") !== String(nextRating ?? "") ||
    String(oldRow.satisfaction_collected_at ?? "") !== String(nextAt ?? "") ||
    String(oldRow.satisfaction_feedback ?? "") !== String(newRow.satisfaction_feedback ?? "")
  );
}

/** Refresh agent activity + C&D-SAT analysis caches after a rating lands. */
export function invalidateCsatRelatedCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "agentActivity",
    refetchType: "active",
  });
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "csatAnalysis",
    refetchType: "active",
  });
}

export function patchTicketInListCaches(
  queryClient: QueryClient,
  ticketId: number,
  patch: (t: Ticket) => Ticket,
  options?: { pruneIfStatus?: string }
): void {
  const shouldPrune =
    options?.pruneIfStatus != null && statusLeavesTypicalActiveList(options.pruneIfStatus);

  queryClient.setQueriesData(
    { predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list" },
    (old: TicketsResponse | undefined) => {
      if (!old?.tickets) return old;
      const has = old.tickets.some((t) => t.id === ticketId);
      if (!has) return old;
      if (shouldPrune) {
        return {
          ...old,
          tickets: old.tickets.filter((t) => t.id !== ticketId),
          total: Math.max(0, Number(old.total ?? 0) - 1),
        };
      }
      return { ...old, tickets: old.tickets.map((t) => (t.id === ticketId ? patch(t) : t)) };
    }
  );
}

/** Instant UI sync from Supabase postgres_changes `new` payload. */
export function patchTicketFromPostgresRow(
  queryClient: QueryClient,
  row: Record<string, unknown>
): void {
  const ticketId = Number(row.id);
  if (!Number.isFinite(ticketId) || ticketId < 1) return;

  const status = normalizeEnum(row.status);

  patchTicketInListCaches(
    queryClient,
    ticketId,
    (t) => mergePostgresRowIntoListTicket(t, row),
    { pruneIfStatus: status }
  );

  queryClient.setQueryData(queryKeys.tickets.detail(String(ticketId)), (old: TicketDetail | undefined) =>
    old ? mergePostgresRowIntoTicketDetail(old, row) : old
  );
}

export function invalidateTicketListCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
    refetchType: "active",
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.tickets.helpdeskDashboard(),
    refetchType: "active",
  });
}
