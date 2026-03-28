"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export const TICKET_ACTIVITIES_STALE_MS = 60_000;

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

export async function fetchTicketActivities(ticketId: number): Promise<TicketActivity[]> {
  const res = await fetch(`/api/tickets/${ticketId}/activities?limit=80`, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(
      res.status === 404 ? "Activities not available for this ticket" : "Failed to load activities"
    ) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  const json = await res.json();
  return (json.data?.activities ?? []) as TicketActivity[];
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

function formatRelativeTime(createdAt: string): string {
  const date = new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Just now";
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
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
    group_change: "Group Updated",
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

function activityActorLabel(a: TicketActivity): string {
  const actorName = (a.actorName ?? "").trim();
  const actorEmail = (a.actorEmail ?? "").trim();
  if (actorEmail) {
    if (actorName && actorName.toLowerCase() !== actorEmail.toLowerCase()) return `${actorName} (${actorEmail})`;
    return `GatiMitra Team (${actorEmail})`;
  }
  return actorName || (a.actorType ? String(a.actorType) : "System");
}

function activityInitial(a: TicketActivity): string {
  const raw = activityActorLabel(a).trim();
  return raw ? raw.charAt(0).toUpperCase() : "S";
}

function activityTitle(a: TicketActivity): string {
  const base = (a.activityDescription ?? "").trim();
  const lowerAction = String(a.actionType || "").toLowerCase();
  const lowerDesc = base.toLowerCase();
  if (lowerDesc.startsWith("merged tickets into") || lowerDesc.startsWith("merged into")) {
    return "Tickets Marked As Merged";
  }
  if (lowerAction === "assignment" || lowerAction === "unassignment") {
    return "Agent Updated .";
  }
  if (base) {
    const groupChangedMatch = base.match(/^Group changed from\s+(.+?)\s+to\s+(.+)$/i);
    if (groupChangedMatch) return "Group Updated";
    return base;
  }
  return formatActionLabel(a.actionType);
}

function activityDetailLines(a: TicketActivity): string[] {
  const lines: string[] = [];
  const o = (a.oldValue ?? {}) as Record<string, unknown>;
  const n = (a.newValue ?? {}) as Record<string, unknown>;
  const oldStatus = o.status != null ? String(o.status) : "";
  const newStatus = n.status != null ? String(n.status) : "";
  const oldPriority = o.priority != null ? String(o.priority) : "";
  const newPriority = n.priority != null ? String(n.priority) : "";
  const assigned = n.assigned_to_agent_name != null ? String(n.assigned_to_agent_name) : "";
  const desc = (a.activityDescription ?? "").trim();
  const lowerAction = String(a.actionType || "").toLowerCase();
  const lowerDesc = desc.toLowerCase();
  const cleanValue = (value: string): string => {
    const v = value.trim();
    return v && v !== "—" ? v : "Unassigned";
  };
  const statusChangedMatch = desc.match(/^Status changed from\s+(.+?)\s+to\s+(\S+)(?:\s+\(Spamed\))?$/i);
  if (statusChangedMatch) {
    const spamLabel = /\(Spamed\)/i.test(desc) ? " (Spamed)" : "";
    lines.push(`Set as ${cleanValue(statusChangedMatch[2])}${spamLabel}`);
    return lines;
  }
  if (lowerDesc.startsWith("merged tickets into") || lowerDesc.startsWith("merged into")) {
    lines.push(desc);
    return lines;
  }
  if (lowerAction === "unassignment") {
    lines.push(desc || "Unassigned");
    return lines;
  }
  if (lowerAction === "assignment") {
    lines.push(desc || "Agent assigned");
    return lines;
  }

  if (oldStatus || newStatus) {
    const st = cleanValue(newStatus || oldStatus);
    const spamRejected =
      st.toUpperCase() === "REJECTED" && /\(Spamed\)/i.test(desc) ? " (Spamed)" : "";
    lines.push(`Set as ${st}${spamRejected}`);
  }
  if (oldPriority || newPriority) lines.push(`Set priority as ${newPriority || oldPriority}`);
  if (assigned) lines.push(`Assigned to ${cleanValue(assigned)}`);
  const groupChangedMatch = desc.match(/^Group changed from\s+(.+?)\s+to\s+(.+)$/i);
  if (groupChangedMatch) {
    lines.push(`${cleanValue(groupChangedMatch[1])} - ${cleanValue(groupChangedMatch[2])}`);
  }

  if (lines.length === 0) {
    if (desc.includes("|")) {
      desc
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => lines.push(s));
    } else if (desc && desc.length <= 160) {
      lines.push(desc);
    }
  }
  return lines;
}

function isStatusUpdatedActivity(actionType: string): boolean {
  const t = String(actionType || "").toLowerCase();
  return (
    t.includes("status") ||
    t === "resolved" ||
    t === "closed" ||
    t === "reopened" ||
    t === "resolution" ||
    t === "closure"
  );
}

export function ActivityTimeline({ ticketId, noScroll }: { ticketId: number; noScroll?: boolean }) {
  const activityCacheId = String(ticketId);
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.tickets.activities(activityCacheId),
    queryFn: () => fetchTicketActivities(ticketId),
    enabled: !!ticketId,
    staleTime: TICKET_ACTIVITIES_STALE_MS,
    retry: false,
  });

  if (isPending) {
    return <p className="px-3 py-3 text-xs text-gray-400">Loading activity…</p>;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : "Failed to load activity timeline."}
      </div>
    );
  }

  const activities = [...(data ?? [])].reverse();

  return (
    <div className={`flex flex-col ${noScroll ? "" : "min-h-0 flex-1"}`}>
      <div className={noScroll ? "p-0" : "flex-1 min-h-0 overflow-y-auto p-0"}>
        {activities.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-2.5 rounded-lg border border-[#e5ebf1] bg-[#f4f7fa] px-3.5 py-3 text-xs">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-gray-200 text-[11px] font-semibold text-gray-700">
                  {activityInitial(a)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium text-gray-700">
                      <span className="font-semibold text-gray-800">{activityActorLabel(a)}</span>
                      <span className="ml-1">- {activityTitle(a)}</span>
                    </span>
                    {isStatusUpdatedActivity(a.actionType) ? (
                      <span className="shrink-0 rounded-full border border-gray-300 bg-[#edf2f7] px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        Status updated
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] italic text-gray-500">
                    {formatRelativeTime(a.createdAt)} {formatActivityTime(a.createdAt)}
                  </div>
                  {activityDetailLines(a).length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#334155]">
                      {activityDetailLines(a).map((line, idx) => (
                        <li key={`${a.id}-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
