"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, User, FolderGit2, Filter } from "lucide-react";
import { useTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { useTicketFilterSidebar } from "@/context/TicketFilterSidebarContext";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
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

  const [agents, setAgents] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);
  const [refData, setRefData] = useState<{
    groups: Array<{ id: number; groupCode: string; groupName: string }>;
    statuses: Array<{ value: string; label: string }>;
    priorities: Array<{ value: string; label: string }>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/tickets/agents", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setAgents(d.data.agents || []);
          if (d.data.currentUser)
            setCurrentUser({ id: d.data.currentUser.id, name: d.data.currentUser.name || "Me" });
          else setCurrentUser(null);
        }
      })
      .catch(() => { setAgents([]); setCurrentUser(null); });
  }, []);
  useEffect(() => {
    fetch("/api/tickets/reference-data", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setRefData({
            groups: d.data.groups || [],
            statuses: d.data.statuses || [],
            priorities: d.data.priorities || [],
          });
        }
      })
      .catch(() => {});
  }, []);

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
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (!ticket) return;
    setStatus(ticket.status || "open");
    setPriority(ticket.priority || "medium");
    setGroupId(""); // TODO: from ticket when API returns group_id
    setAgentId(
      ticket.assignee
        ? currentUser && ticket.assignee.id === currentUser.id
          ? "me"
          : String(ticket.assignee.id)
        : ""
    );
    setTagsInput(""); // TODO: from ticket tags when API returns
  }, [ticket, currentUser]);

  const handleUpdate = () => {
    if (!ticketId) return;
    const payload: { ticketId: number; status?: string; priority?: string; currentAssigneeUserId?: number | null; groupId?: number | null } = { ticketId };
    if (status) payload.status = status;
    if (priority) payload.priority = priority;
    const assigneeNum = agentId === "me" && currentUser ? currentUser.id : agentId ? parseInt(agentId, 10) : null;
    if (assigneeNum !== undefined) payload.currentAssigneeUserId = Number.isNaN(assigneeNum as number) ? null : (assigneeNum as number);
    if (groupId !== undefined) payload.groupId = groupId ? parseInt(groupId, 10) : null;
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

      {/* Status + timestamp */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-200">
        <p className="text-sm font-medium text-gray-900 capitalize">
          {(ticket.status || "open").replace(/_/g, " ")}
        </p>
        {statusTime && (
          <p className="text-xs text-gray-500 mt-0.5">
            on {formatStatusTime(statusTime)}
          </p>
        )}
      </div>

      <div className="px-3 py-2 border-b border-gray-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Properties
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Tags - input with pill hint (like reference) */}
        <div>
          <label className={labelCls}>Tags</label>
          <div className="flex flex-wrap gap-1.5 min-h-[34px] rounded-md border border-gray-300 bg-white px-2 py-1.5">
            {/* Placeholder pill when no tags - or real tags from API later */}
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Add tag..."
              className="flex-1 min-w-[80px] text-xs border-0 focus:ring-0 focus:outline-none py-0.5"
            />
          </div>
        </div>

        {/* Group - dropdown */}
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

        {/* Agent - dropdown */}
        <div>
          <label className={labelCls}>Agent</label>
          <div className="relative">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className={`${inputCls} pr-8`}
            >
              <option value="">—</option>
              {currentUser && <option value="me">{currentUser.name}</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.email}</option>
              ))}
            </select>
            <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Priority - dropdown with dot */}
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

        {/* Status - dropdown */}
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

        {/* Type (read-only for now) */}
        <div>
          <label className={labelCls}>Type</label>
          <div className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
            {ticket.ticketCategory?.replace(/_/g, " ") ?? "—"}
          </div>
        </div>

        {/* Business metadata */}
        <div>
          <label className={labelCls}>Business metadata</label>
          <div className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 space-y-1">
            {ticket.orderId != null && <p>Order ID: {ticket.orderId}</p>}
            <p className="text-gray-400">Custom fields load from API.</p>
          </div>
        </div>

        {/* Contact */}
        <div>
          <label className={labelCls}>Contact details</label>
          <p className="text-xs text-gray-600">
            {ticket.participants?.length ? `${ticket.participants.length} participant(s)` : "No contact info"}
          </p>
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
