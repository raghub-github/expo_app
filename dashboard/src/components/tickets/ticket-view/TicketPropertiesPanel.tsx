"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, User, FolderGit2, Filter, X, Calendar } from "lucide-react";
import { useTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { useTicketFilterSidebar } from "@/context/TicketFilterSidebarContext";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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

export function TicketPropertiesPanel({ ticketId }: { ticketId: number }) {
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const updateTicket = useTicketUpdate();
  const filterSidebar = useTicketFilterSidebar();

  const { data: agentsData } = useTicketsAgentsQuery();
  const { data: refDataRaw } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  const currentUserId = agentsData?.currentUser?.id ?? null;
  const currentUser = agentsData?.currentUser
    ? { id: agentsData.currentUser.id, name: agentsData.currentUser.name || "Me" }
    : null;
  const refData = refDataRaw
    ? { groups: refDataRaw.groups, statuses: refDataRaw.statuses, priorities: refDataRaw.priorities }
    : null;

  const statusOptions = useMemo(
    () => refData?.statuses ?? [
      { value: "open", label: "Open" },
      { value: "assigned", label: "Assigned" },
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

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [groupId, setGroupId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [dueBy, setDueBy] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");

  // Sync form from server ticket. Dependencies MUST be stable primitives — `ticket` and
  // `currentUser` object change reference every render (agents query / normalized data), which
  // caused setState → re-render → infinite "Maximum update depth exceeded".
  const tagsFingerprint = ticket ? JSON.stringify(ticket.tags ?? []) : "";
  useEffect(() => {
    if (!ticket) return;
    setStatus(ticket.status || "open");
    setPriority(ticket.priority || "medium");
    setGroupId(ticket.group?.id != null ? String(ticket.group.id) : "");
    setAgentId(
      ticket.assignee
        ? currentUserId != null && ticket.assignee.id === currentUserId
          ? "me"
          : String(ticket.assignee.id)
        : ""
    );
    setTags(Array.isArray(ticket.tags) ? [...ticket.tags] : []);
    if (ticket.slaDueAt) {
      try {
        const d = new Date(ticket.slaDueAt);
        setDueBy(d.toISOString().slice(0, 16));
      } catch {
        setDueBy("");
      }
    } else setDueBy("");
    setTagsInput("");
  }, [
    ticketId,
    ticket?.id,
    ticket?.status,
    ticket?.priority,
    ticket?.group?.id,
    ticket?.assignee?.id,
    ticket?.slaDueAt,
    ticket?.updatedAt,
    tagsFingerprint,
    currentUserId,
  ]);

  const addTag = () => {
    const t = tagsInput.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagsInput("");
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((x) => x !== tag));

  const handleUpdate = () => {
    if (!ticketId) return;
    const payload: {
      ticketId: number;
      status?: string;
      priority?: string;
      currentAssigneeUserId?: number | null;
      groupId?: number | null;
      slaDueAt?: string | null;
      tags?: string[];
    } = { ticketId };
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
    updateTicket.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Could not load ticket properties.
      </div>
    );
  }

  const statusTime = ticket.closedAt || ticket.resolvedAt || ticket.updatedAt;
  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

  const isFilterSidebarOpen = filterSidebar?.isFilterSidebarOpen ?? false;
  const toggleFilterSidebar = filterSidebar?.toggleFilterSidebar ?? (() => {});

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Filters button – top of Properties section */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-200">
        <button
          type="button"
          onClick={toggleFilterSidebar}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            isFilterSidebarOpen
              ? "bg-gray-200 text-gray-800"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
          aria-label={isFilterSidebarOpen ? "Close filter sidebar" : "Open filter sidebar"}
        >
          <Filter className="h-3.5 w-3.5 shrink-0" />
          {isFilterSidebarOpen ? "Hide filters" : "Filters"}
        </button>
      </div>

      {/* Filter options — separate section */}
      <div className="px-3 py-2 border-b border-gray-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Filter options
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
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

        {/* Group */}
        <div>
          <label className={labelCls}>Group</label>
          <div className="relative">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className={`${inputCls} pr-8`}
            >
              <option value="">—</option>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <FolderGit2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
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

        {/* Tags */}
        <div>
          <label className={labelCls}>Tags</label>
          <div className="flex flex-wrap gap-1.5 min-h-[34px] rounded-md border border-gray-300 bg-white px-2 py-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700"
              >
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="p-0.5 rounded hover:bg-gray-200" aria-label={`Remove ${tag}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Add a tag..."
              className="flex-1 min-w-[80px] text-xs border-0 focus:ring-0 focus:outline-none py-0.5"
            />
          </div>
        </div>

        {/* Custom Fields / Private Info — from DB + metadata */}
        <div>
          <label className={labelCls}>Private Info / Custom Fields</label>
          <div className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 space-y-1.5 max-h-48 overflow-y-auto">
            {[
              { label: "Agent Name", value: ticket.assignee?.name ?? "" },
              { label: "Agent Id", value: ticket.assignee?.id != null ? String(ticket.assignee.id) : "" },
              { label: "Status", value: ticket.status ?? "" },
              { label: "Category", value: ticket.ticketCategory ?? "" },
              { label: "Transaction ID", value: ticket.orderId != null ? String(ticket.orderId) : "" },
              ...Object.entries(ticket.metadata || {}).map(([k, v]) => ({
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                value: v != null ? String(v) : "",
              })),
            ]
              .filter((row) => row.value !== "" && row.value != null)
              .map((row, i) => (
                <p key={i} className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">{row.label}:</span>
                  <span className="text-gray-900 truncate text-right">{row.value}</span>
                </p>
              ))}
            {(!ticket.metadata || Object.keys(ticket.metadata).length === 0) &&
              ticket.assignee?.name == null &&
              ticket.orderId == null && (
                <p className="text-gray-400">No custom fields.</p>
              )}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-gray-200 shrink-0">
        <button
          type="button"
          onClick={handleUpdate}
          disabled={updateTicket.isPending}
          className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateTicket.isPending ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}
