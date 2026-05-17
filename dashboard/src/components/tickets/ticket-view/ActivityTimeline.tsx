"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { TicketMessage } from "@/hooks/tickets/useTicketDetail";

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

type TimelineItem =
  | ({ kind: "activity" } & TicketActivity)
  | {
      kind: "message";
      id: string;
      ticketId: number;
      createdAt: string;
      actionType: "message_received" | "response_sent" | "internal_note" | "public_note";
      actorName?: string | null;
      actorEmail?: string | null;
      activityDescription?: string | null;
      metadata?: Record<string, unknown> | null;
      messagePreview?: string;
    }
  | {
      kind: "created";
      id: string;
      ticketId: number;
      createdAt: string;
      actionType: "created";
      activityDescription?: string | null;
      actorType?: string | null;
      actorName?: string | null;
      actorEmail?: string | null;
    };

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

function safeTimeMs(d: string): number {
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function stripHtmlToText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMessagePreview(msg: TicketMessage): string {
  const raw = msg.message ?? "";
  const txt = stripHtmlToText(String(raw));
  if (!txt) return "";
  return txt;
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

/** New copy + legacy rows stored with the old phrase. */
function normalizeFrtActivityText(text: string | null | undefined): string {
  if (text == null) return "";
  const t = String(text).trim();
  if (/^frt marked and locked$/i.test(t)) return "FRT Updated";
  return String(text);
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
    message_received: "Message received",
    response_sent: "Response sent",
    public_note: "Public note",
    resolved: "Ticket resolved",
    closed: "Ticket closed",
    resolution: "Resolved",
    closure: "Closed",
  };
  return labels[actionType] ?? actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function activitySummary(a: TimelineItem): string {
  const byDisplay = (a as any).actorEmail ?? (a as any).actorName ?? "";
  const who = byDisplay ? ` by ${byDisplay}` : "";
  if ((a as any).activityDescription) return normalizeFrtActivityText((a as any).activityDescription) + who;
  const label = formatActionLabel(a.actionType);
  if (a.kind === "activity" && (a.oldValue != null || a.newValue != null)) {
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

function activityActorLabel(a: TimelineItem): string {
  const actorName = String((a as any).actorName ?? "").trim();
  const actorEmail = String((a as any).actorEmail ?? "").trim();
  if (actorEmail) {
    if (actorName && actorName.toLowerCase() !== actorEmail.toLowerCase()) return `${actorName} (${actorEmail})`;
    return `GatiMitra Team (${actorEmail})`;
  }
  return actorName || ((a as any).actorType ? String((a as any).actorType) : "System");
}

function activityInitial(a: TimelineItem): string {
  const raw = activityActorLabel(a).trim();
  return raw ? raw.charAt(0).toUpperCase() : "S";
}

function activityTitle(a: TimelineItem): string {
  const base = normalizeFrtActivityText(String((a as any).activityDescription ?? "").trim());
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

function activityDetailLines(a: TimelineItem): string[] {
  const lines: string[] = [];
  if (a.kind === "message") {
    if (a.messagePreview && a.messagePreview.trim() !== "") {
      lines.push(a.messagePreview.trim());
      return lines;
    }
    return lines;
  }

  const o = a.kind === "activity" ? ((a.oldValue ?? {}) as Record<string, unknown>) : ({} as Record<string, unknown>);
  const n = a.kind === "activity" ? ((a.newValue ?? {}) as Record<string, unknown>) : ({} as Record<string, unknown>);
  const oldStatus = o.status != null ? String(o.status) : "";
  const newStatus = n.status != null ? String(n.status) : "";
  const oldPriority = o.priority != null ? String(o.priority) : "";
  const newPriority = n.priority != null ? String(n.priority) : "";
  const assigned = n.assigned_to_agent_name != null ? String(n.assigned_to_agent_name) : "";
  const desc = normalizeFrtActivityText(String((a as any).activityDescription ?? "").trim());
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

export function ActivityTimeline({
  ticketId,
  noScroll,
  ticketCreatedAt,
  messages = [],
}: {
  ticketId: number;
  noScroll?: boolean;
  ticketCreatedAt?: string | null;
  messages?: TicketMessage[];
}) {
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

  const baseActivities: TimelineItem[] = [...(data ?? [])]
    .map((a) => ({ ...a, kind: "activity" as const }))
    .sort((a, b) => safeTimeMs(a.createdAt) - safeTimeMs(b.createdAt));

  const createdItem: TimelineItem[] =
    ticketCreatedAt && String(ticketCreatedAt).trim() !== ""
      ? [
          {
            kind: "created" as const,
            id: `created-${ticketId}`,
            ticketId,
            createdAt: String(ticketCreatedAt),
            actionType: "created",
            activityDescription: "Ticket created",
            actorType: "System",
          },
        ]
      : [];

  const messageItems: TimelineItem[] = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.createdAt)
    .map((m): TimelineItem => {
      const mt = String(m.messageType ?? "").toLowerCase();
      const isInternal = Boolean(m.isInternalNote) || mt === "internal_note";
      const isPublic = !isInternal && (mt === "public_note" || mt === "note_public");
      const fromAgent = String(m.senderType ?? "").toUpperCase() === "AGENT";
      const actionType =
        (isInternal
          ? "internal_note"
          : isPublic
            ? "public_note"
            : fromAgent
              ? "response_sent"
              : "message_received") as
          | "internal_note"
          | "public_note"
          | "response_sent"
          | "message_received";
      const label =
        actionType === "internal_note"
          ? "Internal note"
          : actionType === "public_note"
            ? "Public note"
            : actionType === "response_sent"
              ? "Response sent"
              : "Message received";
      return {
        kind: "message" as const,
        id: `msg-${m.id}`,
        ticketId,
        createdAt: String(m.createdAt),
        actionType,
        activityDescription: label,
        actorName: m.senderName,
        actorEmail: m.senderEmail,
        metadata: null,
        messagePreview: normalizeMessagePreview(m),
      };
    })
    .sort((a, b) => safeTimeMs(a.createdAt) - safeTimeMs(b.createdAt));

  const items: TimelineItem[] = [...createdItem, ...messageItems, ...baseActivities].sort(
    (a, b) => safeTimeMs(a.createdAt) - safeTimeMs(b.createdAt)
  );

  return (
    <div className={`flex flex-col ${noScroll ? "" : "min-h-0 flex-1"}`}>
      <div className={noScroll ? "p-0" : "flex-1 min-h-0 overflow-y-auto p-0"}>
        {items.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((a) => (
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
                    {a.kind === "activity" && isStatusUpdatedActivity(a.actionType) ? (
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
