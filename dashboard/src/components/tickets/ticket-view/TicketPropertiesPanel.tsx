"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, User, FolderGit2, X, Calendar } from "lucide-react";
import { useTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { useToast } from "@/context/ToastContext";
import { useRightSidebar } from "@/context/RightSidebarContext";
import type { TicketOtherAgentViewer } from "@/lib/tickets/ticket-presence";
import { TicketNum } from "@/components/tickets/tickets-typography";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

function formatStatusTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMarkedTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getReadableTextColor(bg: string): string {
  const clean = bg.replace("#", "").trim();
  const hex = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#334155";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#1f2937" : "#ffffff";
}

/** Shown when merchant app and agent dashboard are both on this ticket (Supabase Presence). */
function TicketCopresenceLiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80"
      title="Merchant is viewing this ticket in the app"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}

function formatOtherAgentsTooltip(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is also viewing this ticket.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are also viewing this ticket.`;
  const head = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];
  return `${head}, and ${last} are also viewing this ticket.`;
}

/** Other internal agents on this ticket (Supabase Presence); always shown when N > 0, even if Live is hidden. */
function TicketOtherAgentsViewerIndicator({ viewers }: { viewers: TicketOtherAgentViewer[] }) {
  if (viewers.length === 0) return null;
  const names = viewers.map((v) => v.displayName);
  const title = formatOtherAgentsTooltip(names);
  return (
    <span
      className="inline-flex cursor-help items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200/80"
      title={title}
      aria-label={title}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-red-600" />
      </span>
      <span>+{viewers.length}</span>
    </span>
  );
}

function TicketPropertiesPanelSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f3f5f7] animate-pulse">
      <div className="shrink-0 bg-gradient-to-b from-white to-[#f3f5f7] px-3 pb-2 pt-2.5">
        <div className="h-5 w-28 rounded bg-gray-200" />
        <div className="mt-1.5 h-3 w-36 rounded bg-gray-200" />
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-3 pb-2 pt-2">
        <div className="h-2.5 w-16 rounded bg-gray-200" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2.5">
            <div className="mb-2 h-2.5 w-20 rounded bg-gray-100" />
            <div className="h-8 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TicketPropertiesPanel({ ticketId }: { ticketId: number | string }) {
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const updateTicket = useTicketUpdate();
  const { toast } = useToast();
  const rightSidebar = useRightSidebar();
  const ticketCopresenceLive = Boolean(rightSidebar?.ticketCopresenceLive);
  const ticketOtherAgentViewers = rightSidebar?.ticketOtherAgentViewers ?? [];

  const { data: agentsData } = useTicketsAgentsQuery();
  const { data: refDataRaw } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  const agentEmailById = useMemo(
    () => new Map(agents.map((a) => [String(a.id), a.email || ""])),
    [agents]
  );
  const currentUser = useMemo(
    () =>
      agentsData?.currentUser
        ? { id: agentsData.currentUser.id, name: agentsData.currentUser.name || "Me" }
        : null,
    [agentsData?.currentUser?.id, agentsData?.currentUser?.name]
  );
  const refData = refDataRaw
    ? { groups: refDataRaw.groups, tags: refDataRaw.tags, statuses: refDataRaw.statuses, priorities: refDataRaw.priorities }
    : null;

  const statusOptions = useMemo(
    () => refData?.statuses ?? [
      { value: "open", label: "Open" },
      { value: "in_progress", label: "In progress" },
      { value: "resolved", label: "Resolved" },
      { value: "closed", label: "Closed" },
      { value: "reopened", label: "Reopened" },
    ],
    [refData?.statuses]
  );
  const priorityOptions = useMemo(
    () => refData?.priorities ?? [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "urgent", label: "Urgent" },
      { value: "critical", label: "Critical" },
    ],
    [refData?.priorities]
  );
  const groupOptions = useMemo(
    () => (refData?.groups || []).map((g) => ({ value: String(g.id), label: g.groupName })),
    [refData?.groups]
  );
  const agentOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...(currentUser ? [{ value: "me", label: currentUser.name }] : []),
      ...agents.map((a) => ({ value: String(a.id), label: a.name || a.email || `Agent ${a.id}` })),
    ],
    [agents, currentUser]
  );
  const tagOptions = useMemo(() => {
    const base = (refData?.tags || []).map((t) => ({
      value: t.tagCode,
      label: t.tagName || t.tagCode,
      color: (t as { tagColor?: string | null; tag_color?: string | null }).tagColor
        ?? (t as { tagColor?: string | null; tag_color?: string | null }).tag_color
        ?? null,
    }));
    const refUpper = new Map(
      (refData?.tags || []).map((t) => [String(t.tagCode).trim().toUpperCase(), String(t.tagCode).trim()])
    );
    const seen = new Set(base.map((o) => o.value));
    const extras: typeof base = [];
    for (const code of ticket?.tags ?? []) {
      const c = String(code).trim();
      if (!c) continue;
      if (refUpper.has(c.toUpperCase())) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      extras.push({ value: c, label: c, color: null });
    }
    return [...base, ...extras];
  }, [refData?.tags, ticket?.tags]);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [groupId, setGroupId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [dueBy, setDueBy] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [buyerNpName, setBuyerNpName] = useState("");
  const [sellerNpName, setSellerNpName] = useState("");
  const [logisticsNpName, setLogisticsNpName] = useState("");
  const [igmActionTriggered, setIgmActionTriggered] = useState("");
  const [igmShortResolution, setIgmShortResolution] = useState("");
  const [igmLongResolution, setIgmLongResolution] = useState("");
  const [igmRefundAmount, setIgmRefundAmount] = useState("0.00");
  const [groDetails, setGroDetails] = useState("");

  useEffect(() => {
    if (!ticket) return;
    const nextStatus = ticket.status || "open";
    const nextPriority = ticket.priority || "medium";
    const nextGroupId = ticket.group?.id != null ? String(ticket.group.id) : "";
    const nextAgentId = ticket.assignee
      ? currentUser && ticket.assignee.id === currentUser.id
        ? "me"
        : String(ticket.assignee.id)
      : "";
    const nextTags = Array.isArray(ticket.tags)
      ? [
          ...new Set(
            ticket.tags
              .map((raw) => {
                const s = String(raw).trim();
                if (!s) return "";
                const hit = (refData?.tags || []).find(
                  (t) => String(t.tagCode).trim().toUpperCase() === s.toUpperCase()
                );
                return hit ? String(hit.tagCode).trim() : s;
              })
              .filter(Boolean)
          ),
        ]
      : [];
    const nextBuyerNpName = ticket.buyerNpName ?? "";
    const nextSellerNpName = ticket.sellerNpName ?? "";
    const nextLogisticsNpName = ticket.logisticsNpName ?? "";
    const nextIgmActionTriggered = ticket.igmActionTriggered ?? "";
    const nextIgmShortResolution = ticket.igmShortResolution ?? "";
    const nextIgmLongResolution = ticket.igmLongResolution ?? "";
    const nextIgmRefundAmount =
      ticket.igmRefundAmount != null && String(ticket.igmRefundAmount).trim() !== ""
        ? String(ticket.igmRefundAmount)
        : "0.00";
    const nextGroDetails = ticket.groDetails ?? "";
    let nextDueBy = "";
    if (ticket.slaDueAt) {
      try {
        nextDueBy = new Date(ticket.slaDueAt).toISOString().slice(0, 16);
      } catch {
        nextDueBy = "";
      }
    }

    setStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    setPriority((prev) => (prev === nextPriority ? prev : nextPriority));
    setGroupId((prev) => (prev === nextGroupId ? prev : nextGroupId));
    setAgentId((prev) => (prev === nextAgentId ? prev : nextAgentId));
    setTags((prev) =>
      prev.length === nextTags.length && prev.every((t, i) => t === nextTags[i]) ? prev : nextTags
    );
    setDueBy((prev) => (prev === nextDueBy ? prev : nextDueBy));
    setBuyerNpName((prev) => (prev === nextBuyerNpName ? prev : nextBuyerNpName));
    setSellerNpName((prev) => (prev === nextSellerNpName ? prev : nextSellerNpName));
    setLogisticsNpName((prev) => (prev === nextLogisticsNpName ? prev : nextLogisticsNpName));
    setIgmActionTriggered((prev) => (prev === nextIgmActionTriggered ? prev : nextIgmActionTriggered));
    setIgmShortResolution((prev) => (prev === nextIgmShortResolution ? prev : nextIgmShortResolution));
    setIgmLongResolution((prev) => (prev === nextIgmLongResolution ? prev : nextIgmLongResolution));
    setIgmRefundAmount((prev) => (prev === nextIgmRefundAmount ? prev : nextIgmRefundAmount));
    setGroDetails((prev) => (prev === nextGroDetails ? prev : nextGroDetails));
  }, [ticket, currentUser, refData?.tags]);

  const hasPendingChanges = useMemo(() => {
    if (!ticket) return false;
    if ((ticket.status || "open") !== status) return true;
    if ((ticket.priority || "medium") !== priority) return true;
    if ((ticket.group?.id != null ? String(ticket.group.id) : "") !== groupId) return true;
    const currentAssigneeStr = ticket.assignee?.id != null ? String(ticket.assignee.id) : "";
    const nextAssigneeStr =
      agentId === "me" && currentUser ? String(currentUser.id) : agentId ? String(agentId) : "";
    if (currentAssigneeStr !== nextAssigneeStr) return true;
    const currentDueBy = ticket.slaDueAt ? new Date(ticket.slaDueAt).toISOString().slice(0, 16) : "";
    if (currentDueBy !== dueBy) return true;
    const normalize = (arr: string[]) => [...arr].map((x) => x.trim()).filter(Boolean).sort();
    if (JSON.stringify(normalize(ticket.tags ?? [])) !== JSON.stringify(normalize(tags))) return true;
    if ((ticket.buyerNpName ?? "") !== buyerNpName.trim()) return true;
    if ((ticket.sellerNpName ?? "") !== sellerNpName.trim()) return true;
    if ((ticket.logisticsNpName ?? "") !== logisticsNpName.trim()) return true;
    if ((ticket.igmActionTriggered ?? "") !== igmActionTriggered.trim()) return true;
    if ((ticket.igmShortResolution ?? "") !== igmShortResolution.trim()) return true;
    if ((ticket.igmLongResolution ?? "") !== igmLongResolution.trim()) return true;
    if ((ticket.igmRefundAmount ?? "") !== igmRefundAmount.trim()) return true;
    if ((ticket.groDetails ?? "") !== groDetails.trim()) return true;
    return false;
  }, [
    ticket,
    status,
    priority,
    groupId,
    agentId,
    currentUser,
    dueBy,
    tags,
    buyerNpName,
    sellerNpName,
    logisticsNpName,
    igmActionTriggered,
    igmShortResolution,
    igmLongResolution,
    igmRefundAmount,
    groDetails,
  ]);

  const handleUpdate = () => {
    const resolvedTicketId = ticket?.id;
    if (!resolvedTicketId || !hasPendingChanges) return;
    const payload: {
      ticketId: number;
      status?: string;
      priority?: string;
      currentAssigneeUserId?: number | null;
      groupId?: number | null;
      slaDueAt?: string | null;
      tags?: string[];
      buyerNpName?: string | null;
      sellerNpName?: string | null;
      logisticsNpName?: string | null;
      igmActionTriggered?: string | null;
      igmShortResolution?: string | null;
      igmLongResolution?: string | null;
      igmRefundAmount?: string | null;
      groDetails?: string | null;
    } = { ticketId: resolvedTicketId };
    if (status) payload.status = status;
    if (priority) payload.priority = priority;
    const assigneeNum = agentId === "me" && currentUser ? currentUser.id : agentId ? parseInt(agentId, 10) : null;
    if (assigneeNum !== undefined) payload.currentAssigneeUserId = Number.isNaN(assigneeNum as number) ? null : (assigneeNum as number);
    if (groupId !== undefined) payload.groupId = groupId ? parseInt(groupId, 10) : null;
    if (dueBy) {
      try {
        payload.slaDueAt = new Date(dueBy).toISOString();
      } catch {
        payload.slaDueAt = null;
      }
    } else payload.slaDueAt = null;
    payload.tags = tags;
    payload.buyerNpName = buyerNpName.trim() || null;
    payload.sellerNpName = sellerNpName.trim() || null;
    payload.logisticsNpName = logisticsNpName.trim() || null;
    payload.igmActionTriggered = igmActionTriggered.trim() || null;
    payload.igmShortResolution = igmShortResolution.trim() || null;
    payload.igmLongResolution = igmLongResolution.trim() || null;
    payload.igmRefundAmount = igmRefundAmount.trim() || null;
    payload.groDetails = groDetails.trim() || null;

    const changedFields: string[] = [];
    if ((ticket.status || "open") !== status) changedFields.push("Status");
    if ((ticket.priority || "medium") !== priority) changedFields.push("Priority");
    if ((ticket.group?.id != null ? String(ticket.group.id) : "") !== groupId) changedFields.push("Group");
    const currentAssigneeStr = ticket.assignee?.id != null ? String(ticket.assignee.id) : "";
    const nextAssigneeStr =
      agentId === "me" && currentUser ? String(currentUser.id) : agentId ? String(agentId) : "";
    if (currentAssigneeStr !== nextAssigneeStr) changedFields.push("Assigned Agent");
    const currentDueBy = ticket.slaDueAt ? new Date(ticket.slaDueAt).toISOString().slice(0, 16) : "";
    if (currentDueBy !== dueBy) changedFields.push("Due By");
    const normalize = (arr: string[]) => [...arr].map((x) => x.trim()).filter(Boolean).sort();
    if (JSON.stringify(normalize(ticket.tags ?? [])) !== JSON.stringify(normalize(tags))) changedFields.push("Tags");
    if ((ticket.buyerNpName ?? "") !== buyerNpName.trim()) changedFields.push("Buyer NP Name");
    if ((ticket.sellerNpName ?? "") !== sellerNpName.trim()) changedFields.push("Seller NP Name");
    if ((ticket.logisticsNpName ?? "") !== logisticsNpName.trim()) changedFields.push("Logistics NP Name");
    if ((ticket.igmActionTriggered ?? "") !== igmActionTriggered.trim()) changedFields.push("IGM Action Triggered");
    if ((ticket.igmShortResolution ?? "") !== igmShortResolution.trim()) changedFields.push("IGM Short Resolution");
    if ((ticket.igmLongResolution ?? "") !== igmLongResolution.trim()) changedFields.push("IGM Long Resolution");
    if ((ticket.igmRefundAmount ?? "") !== igmRefundAmount.trim()) changedFields.push("IGM Refund Amount");
    if ((ticket.groDetails ?? "") !== groDetails.trim()) changedFields.push("GRO Details");

    updateTicket.mutate(payload, {
      onSuccess: () =>
        toast(changedFields.length > 0 ? `${changedFields.join(", ")} updated` : "Ticket updated"),
      onError: (err) => toast(err instanceof Error ? err.message : "Failed to update ticket"),
    });
  };

  if (isLoading || (!ticket && !error)) {
    return <TicketPropertiesPanelSkeleton />;
  }

  if (error || !ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <p className="text-xs font-medium text-gray-600">Could not load ticket properties</p>
        <p className="mt-1 text-[11px] text-gray-500">
          {error instanceof Error ? error.message : "Try refreshing the page."}
        </p>
      </div>
    );
  }

  const statusTime = ticket.closedAt || ticket.resolvedAt || ticket.updatedAt;
  const firstAgentReplyAt =
    ticket.messages
      ?.find((m) => {
        const sender = String(m.senderType || "").toLowerCase();
        return sender.includes("agent") || sender.includes("system_user") || sender.includes("admin");
      })
      ?.createdAt ?? null;
  const frtMarked = Boolean(
    ticket.firstResponseAt ||
    ((ticket?.metadata as Record<string, unknown> | undefined)?.frt_marked === true)
  );
  const frtMarkedAtRaw = ((ticket?.metadata as Record<string, unknown> | undefined)?.frt_marked_at ?? null) as string | null;
  const frtMarkedAtText = formatMarkedTime(frtMarkedAtRaw);
  const frtMs =
    ticket.firstResponseTimeMinutes != null
      ? ticket.firstResponseTimeMinutes * 60000
      : firstAgentReplyAt != null
      ? new Date(firstAgentReplyAt).getTime() - new Date(ticket.createdAt).getTime()
      : Date.now() - new Date(ticket.createdAt).getTime();
  const frtText = formatDuration(frtMs);
  const orderRef =
    ticket.orderFormattedId && ticket.orderFormattedId.trim() !== ""
      ? ticket.orderFormattedId.trim()
      : null;
  const helpdeskOrderUrl = orderRef ? `https://control.gatimitra.com/order/${encodeURIComponent(orderRef)}` : null;
  const isHelpdeskOpenEnabled = Boolean(ticket.orderId != null && helpdeskOrderUrl);
  const customerDashboardUrl = "https://control.gatimitra.com/dashboard/customers";

  const handleMarkFrt = () => {
    if (frtMarked || updateTicket.isPending) return;
    updateTicket.mutate({
      ticketId: ticket.id,
      markFrt: true,
    }, {
      onSuccess: () => toast("FRT marked"),
      onError: (err) => toast(err instanceof Error ? err.message : "Failed to mark FRT"),
    });
  };
  const statusLabel = (ticket.status || "open")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer";
  const labelCls = "mb-0.5 block text-[11px] font-medium text-gray-600";
  const igmActionOptions = ["REFUND", "NO-ACTION", "REPLACEMENT", "CANCEL"];

  return (
    <div className="tickets-typo flex h-full flex-col overflow-hidden bg-[#f3f5f7]">
      <div className="shrink-0 bg-gradient-to-b from-white to-[#f3f5f7] px-3 pb-2 pt-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-tight tracking-tight text-[#1f3553]">{statusLabel}</p>
            <p className="mt-0.5 text-[11px] font-medium text-[#4b647f]">
              on <TicketNum>{formatStatusTime(statusTime)}</TicketNum>
            </p>
          </div>
          {ticketOtherAgentViewers.length > 0 || ticketCopresenceLive ? (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <TicketOtherAgentsViewerIndicator viewers={ticketOtherAgentViewers} />
              {ticketCopresenceLive ? <TicketCopresenceLiveBadge /> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-2 pt-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Properties</h2>
        <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Mark FRT</p>
            <button
              type="button"
              onClick={handleMarkFrt}
              disabled={frtMarked || updateTicket.isPending}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                frtMarked
                  ? "cursor-not-allowed border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "cursor-pointer border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              }`}
            >
              {frtMarked ? "Marked" : updateTicket.isPending ? "Marking..." : "Mark now"}
            </button>
          </div>
          {!frtMarked && (
            <p className="mt-1 text-xs text-gray-700">
              First response time:{" "}
              <span className="font-semibold text-[#1f3553]">
                <TicketNum>{frtText}</TicketNum>
              </span>
            </p>
          )}
          {frtMarked && frtMarkedAtText && (
            <p className="mt-1 text-[11px] text-emerald-700">
              Marked at:{" "}
              <span className="font-semibold">
                <TicketNum>{frtMarkedAtText}</TicketNum>
              </span>
            </p>
          )}
        </div>
        {/* Status */}
        <div>
          <label className={labelCls}>Status</label>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputCls} pr-8`}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className={labelCls}>Priority</label>
          <div className="relative flex items-center">
            <span
              className={`absolute left-2.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority] ?? "bg-gray-400"}`}
              aria-hidden
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${inputCls} pl-6 pr-8`}
            >
              {priorityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className={labelCls}>GatiMitra Queue</label>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5">
            <span
              className={`min-w-0 flex-1 truncate text-xs font-medium ${
                isHelpdeskOpenEnabled ? "text-blue-700" : "text-gray-400"
              }`}
              title={helpdeskOrderUrl ?? "Order ID not available"}
            >
              {helpdeskOrderUrl ?? "Order ID not available"}
            </span>
            {isHelpdeskOpenEnabled ? (
              <a
                href={helpdeskOrderUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-6 cursor-pointer items-center rounded-md border border-gray-300 bg-gray-50 px-2 text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
              >
                Open
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-6 cursor-not-allowed items-center rounded-md border border-gray-200 bg-gray-100 px-2 text-[10px] font-semibold text-gray-400"
              >
                Open
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Customer Dashboard</label>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5">
            <a
              href={customerDashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
              title={customerDashboardUrl}
            >
              {customerDashboardUrl}
            </a>
            <a
              href={customerDashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-6 cursor-pointer items-center rounded-md border border-gray-300 bg-gray-50 px-2 text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
            >
              Open
            </a>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className={labelCls}>Tags</label>
          <TagMultiSelect
            placeholder="Select tags"
            options={tagOptions}
            selectedValues={tags}
            onChange={setTags}
          />
        </div>

        {/* Group */}
        <div className="pb-1">
          <label className={labelCls}>Group</label>
          <GroupSingleSelect
            placeholder="Unassigned"
            value={groupId}
            options={groupOptions}
            onChange={setGroupId}
          />
        </div>

        {/* Assigned Agent */}
        <div>
          <label className={labelCls}>Assigned Agent</label>
          <div className="relative">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className={`${inputCls} pr-8`}
            >
              <option value="">Unassigned</option>
              {currentUser && <option value="me">{currentUser.name}</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.email}</option>
              ))}
            </select>
            <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Due By */}
        <div>
          <label className={labelCls}>Due By</label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="datetime-local"
              value={dueBy}
              onChange={(e) => setDueBy(e.target.value)}
              className={`${inputCls} pl-8`}
            />
          </div>
        </div>

        {/* Type (read-only) */}
        <div>
          <label className={labelCls}>Type</label>
          <div className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
            {(ticket.ticketCategory || ticket.ticketSection || "—").replace(/_/g, " ")}
          </div>
        </div>

        <div>
          <label className={labelCls}>Ticket Source</label>
          <div className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
            {ticket.ticketSource || "—"}
          </div>
        </div>
        <div>
          <label className={labelCls}>Buyer NP Name</label>
          <input
            type="text"
            value={buyerNpName}
            onChange={(e) => setBuyerNpName(e.target.value)}
            className={inputCls}
            placeholder="Buyer NP Name"
          />
        </div>
        <div>
          <label className={labelCls}>Seller NP Name</label>
          <input
            type="text"
            value={sellerNpName}
            onChange={(e) => setSellerNpName(e.target.value)}
            className={inputCls}
            placeholder="Seller NP Name"
          />
        </div>
        <div>
          <label className={labelCls}>Logistics NP Name</label>
          <input
            type="text"
            value={logisticsNpName}
            onChange={(e) => setLogisticsNpName(e.target.value)}
            className={inputCls}
            placeholder="Logistics NP Name"
          />
        </div>
        <div>
          <label className={labelCls}>IGM Action Triggered</label>
          <div className="relative">
            <select
              value={igmActionTriggered}
              onChange={(e) => setIgmActionTriggered(e.target.value)}
              className={`${inputCls} pr-8`}
            >
              <option value="">Select Action</option>
              {igmActionOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className={labelCls}>IGM Short Resolution</label>
          <input
            type="text"
            value={igmShortResolution}
            onChange={(e) => setIgmShortResolution(e.target.value)}
            className={inputCls}
            placeholder="Brief description of resolution"
          />
        </div>
        <div>
          <label className={labelCls}>IGM Long Resolution</label>
          <textarea
            value={igmLongResolution}
            onChange={(e) => setIgmLongResolution(e.target.value)}
            className={`${inputCls} min-h-[88px] resize-y`}
            placeholder="Detailed description of resolution"
          />
        </div>
        <div>
          <label className={labelCls}>IGM Refund Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={igmRefundAmount}
            onChange={(e) => setIgmRefundAmount(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>GRO Details</label>
          <textarea
            value={groDetails}
            onChange={(e) => setGroDetails(e.target.value)}
            className={`${inputCls} min-h-[88px] resize-y`}
            placeholder="GRO Details"
          />
        </div>
      </div>

      <div className="relative z-10 shrink-0 bg-[#f3f5f7] px-3 pb-2.5 pt-2.5">
        <button
          type="button"
          onClick={handleUpdate}
          disabled={updateTicket.isPending || !hasPendingChanges}
          className={`flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white transition-colors ${
            updateTicket.isPending || !hasPendingChanges
              ? "cursor-not-allowed bg-[#121212]/40"
              : "cursor-pointer bg-[#121212] hover:bg-black"
          }`}
        >
          {updateTicket.isPending ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}

function TagMultiSelect({
  placeholder,
  options,
  selectedValues,
  onChange,
}: {
  placeholder: string;
  options: Array<{ value: string; label: string; color?: string | null }>;
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet]
  );
  const hideSearchInLayout = selectedValues.length > 0 && !open && search.length === 0;

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selectedValues.filter((v) => v !== value));
    else onChange([...selectedValues, value]);
  };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="flex min-h-[34px] cursor-pointer items-start gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[11px] font-semibold"
              style={
                opt.color
                  ? {
                      backgroundColor: opt.color,
                      color: getReadableTextColor(opt.color),
                    }
                  : { backgroundColor: "#E9ECEF", color: "#334155" }
              }
              onClick={(e) => e.stopPropagation()}
            >
              {opt.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(opt.value);
                }}
                className="text-[#334155] hover:opacity-70"
                aria-label={`Remove ${opt.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={selectedOptions.length ? "" : placeholder}
            className={
              hideSearchInLayout
                ? "pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden border-0 p-0 opacity-0"
                : "h-5 min-w-[5rem] flex-1 border-0 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
            }
          />
        </div>
        <ChevronDown className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-0.5 max-h-64 w-full overflow-y-auto rounded border border-gray-300 bg-white shadow-sm">
          {filtered.length === 0 ? (
            <div className="px-2.5 py-2.5 text-xs text-gray-500">No tags found</div>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs ${
                  selectedSet.has(opt.value) ? "bg-slate-50 text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3.5 w-3.5 rounded border-gray-400 text-blue-600"
                />
                <span className="flex-1">{opt.label}</span>
                {opt.color ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-gray-300/70"
                    style={{ backgroundColor: opt.color }}
                    aria-hidden
                  />
                ) : null}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GroupSingleSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[34px] cursor-pointer items-start gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected ? (
            <span
              className="inline-flex items-center gap-1 rounded-[2px] bg-[#E9ECEF] px-2 py-1 text-[11px] font-semibold text-[#334155]"
              onClick={(e) => e.stopPropagation()}
            >
              {selected.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="text-[#334155] hover:opacity-70"
                aria-label={`Remove ${selected.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-0.5 w-full rounded border border-gray-300 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search group..."
              className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 outline-none focus:border-gray-400"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <label
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs ${
                value === "" ? "bg-slate-50 text-gray-900" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={value === ""}
                onChange={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
                className="h-3.5 w-3.5 rounded border-gray-400 text-blue-600"
              />
              <span className="flex-1">Unassigned</span>
            </label>
            {filtered.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs ${
                  value === o.value ? "bg-slate-50 text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={value === o.value}
                  onChange={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-400 text-blue-600"
                />
                <span className="flex-1">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
