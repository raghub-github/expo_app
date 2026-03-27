"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export interface TicketActivity {
  id: string;
  ticketId: number;
  actionType: string;
  activityDescription?: string | null;
  actorType?: string | null;
  actorName?: string | null;
  /** Full email of the actor (preferred for display; do not show primary key). */
  actorEmail?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

function formatActivityTime(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    CREATED: "Ticket created",
    ASSIGNED: "Assigned",
    UNASSIGNED: "Unassigned",
    FIRST_RESPONSE: "First response",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    REOPENED: "Reopened",
    STATUS_CHANGED: "Status changed",
    PRIORITY_CHANGED: "Priority changed",
    MESSAGE_ADDED: "Message added",
    ESCALATED: "Escalated",
    status_change: "Status changed",
    priority_change: "Priority changed",
    assignment: "Assigned",
    unassignment: "Unassigned",
    group_change: "Group changed",
    response: "Response sent",
    note: "Internal note",
    internal_note: "Internal note",
    resolved: "Ticket resolved",
    closed: "Ticket closed",
    resolution: "Resolved",
    closure: "Closed",
  };
  return labels[actionType] ?? actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function activitySummary(a: TicketActivity): string {
  const byDisplay = a.actorEmail ?? a.actorName ?? "";
  const who = byDisplay ? ` by ${byDisplay}` : "";
  if (a.activityDescription) return a.activityDescription + who;
  const label = formatActionLabel(a.actionType);
  if (a.oldValue != null || a.newValue != null) {
    const o = a.oldValue as
      | { status?: string; priority?: string; assigned_to_agent_name?: string | null }
      | undefined;
    const n = a.newValue as
      | { status?: string; priority?: string; assigned_to_agent_name?: string | null }
      | undefined;
    if (o?.status !== undefined || n?.status !== undefined) {
      return `${label}: ${o?.status ?? "—"} → ${n?.status ?? "—"}${who}`;
    }
    if (o?.priority !== undefined || n?.priority !== undefined) {
      return `${label}: ${o?.priority ?? "—"} → ${n?.priority ?? "—"}${who}`;
    }
    if (n?.assigned_to_agent_name) return `${label}: ${n.assigned_to_agent_name}${who}`;
  }
  if (byDisplay) return `${label} by ${byDisplay}`;
  return label;
}

export function ActivityTimeline({ ticketId, noScroll }: { ticketId: number; noScroll?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.tickets.activities(ticketId),
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/activities?limit=80`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activities");
      const json = await res.json();
      return (json.data?.activities ?? []) as TicketActivity[];
    },
    enabled: !!ticketId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load activity timeline.
      </div>
    );
  }

  const activities = data ?? [];

  return (
    <div className={`rounded-lg border border-gray-200 bg-white flex flex-col ${noScroll ? "" : "min-h-0 flex-1"}`}>
      <div className="border-b border-gray-200 px-3 py-1.5 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900">Activity timeline</h2>
      </div>
      <div className={noScroll ? "p-2" : "flex-1 min-h-0 overflow-y-auto p-2"}>
        {activities.length === 0 ? (
          <p className="text-xs text-gray-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-2 text-xs">
                <div className="shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-gray-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-700">
                    {activitySummary(a)}
                  </span>
                  <div className="text-[11px] text-gray-500 mt-0">
                    {formatActivityTime(a.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
