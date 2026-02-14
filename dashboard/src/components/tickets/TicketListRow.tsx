"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Clock, AlertCircle, User, FolderGit2, ChevronDown, X, Search } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";

interface TicketListRowProps {
  ticket: Ticket;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onUpdatePriority: (ticketId: number, priority: string) => void;
  onUpdateGroup: (ticketId: number, groupId: number | null) => void;
  onUpdateAssignee: (ticketId: number, userId: number | null) => void;
  onUpdateStatus: (ticketId: number, status: string) => void;
  priorityOptions: Option[];
  groupOptions: Option[];
  agentOptions: Array<{ value: string; label: string }>;
  statusOptions: Option[];
  /** Current user id so "Me" option displays and submits correctly */
  currentUserId?: number;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function formatOverdue(slaDueAt: string): string {
  const due = new Date(slaDueAt);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
}

const priorityDotColors: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

export function TicketListRow({
  ticket,
  selected,
  onSelect,
  onUpdatePriority,
  onUpdateGroup,
  onUpdateAssignee,
  onUpdateStatus,
  priorityOptions,
  groupOptions,
  agentOptions,
  statusOptions,
  currentUserId,
}: TicketListRowProps) {
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !["closed", "resolved"].includes(ticket.status);

  const initial = (ticket.subject || "T").charAt(0).toUpperCase();
  const sourceLabel = ticket.sourceRole ? ticket.sourceRole.charAt(0).toUpperCase() + ticket.sourceRole.slice(1) : "—";
  const sectionLabel = ticket.ticketSection ? ticket.ticketSection.charAt(0).toUpperCase() + ticket.ticketSection.slice(1) : "";
  const categoryLabel = ticket.ticketCategory
    ? ticket.ticketCategory.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  const serviceLabel = ticket.serviceType
    ? ticket.serviceType === "person_ride"
      ? "Ride"
      : ticket.serviceType.charAt(0).toUpperCase() + ticket.serviceType.slice(1)
    : "";

  const [groupAgentOpen, setGroupAgentOpen] = useState(false);
  const [groupAgentTab, setGroupAgentTab] = useState<"group" | "agent">("group");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const groupAgentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (groupAgentRef.current && !groupAgentRef.current.contains(e.target as Node)) setGroupAgentOpen(false);
    };
    if (groupAgentOpen) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [groupAgentOpen]);

  const groupLabel = ticket.group?.name ?? "—";
  const agentLabel = ticket.assignee
    ? currentUserId != null && ticket.assignee.id === currentUserId
      ? "Me"
      : ticket.assignee.name ?? ticket.assignee.email ?? `Agent ${ticket.assignee.id}`
    : "Unassigned";
  const displaySummary = `${groupLabel} / ${agentLabel}`;

  const filteredGroupOptions = searchGroup.trim()
    ? groupOptions.filter((o) => o.label.toLowerCase().includes(searchGroup.toLowerCase()))
    : groupOptions;
  const filteredAgentOptions = searchAgent.trim()
    ? agentOptions.filter((o) => o.label.toLowerCase().includes(searchAgent.toLowerCase()))
    : agentOptions;

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50/80 transition-colors min-h-[72px] relative" style={{ overflow: 'visible' }}>
      {/* Checkbox - prevent navigation */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          aria-label={`Select ticket ${ticket.ticketNumber}`}
        />
      </div>

      {/* Avatar - clickable (ticket icon) */}
      <Link
        href={`/dashboard/tickets/${ticket.id}`}
        className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        aria-label={`Open ticket ${ticket.ticketNumber}`}
      >
        {initial}
      </Link>

      {/* Main content - only title and ticket ID open detail */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
        {/* Line 1: Priority + group/section/service/category chips - not clickable */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isSlaBreached && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
              <AlertCircle className="h-3 w-3" />
              Overdue
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 capitalize">
            {ticket.priority}
          </span>
          {sectionLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
              {sectionLabel}
            </span>
          )}
          {serviceLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
              {serviceLabel}
            </span>
          )}
          {categoryLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
              {categoryLabel}
            </span>
          )}
        </div>

        {/* Line 2: Subject + Ticket ID - both clickable */}
        <Link
          href={`/dashboard/tickets/${ticket.id}`}
          className="flex items-baseline gap-2 flex-wrap hover:underline underline-offset-1"
        >
          <span className="font-medium text-gray-900 text-sm truncate max-w-[320px]" title={ticket.subject}>
            {ticket.subject}
          </span>
          <span className="text-xs text-gray-500 font-mono shrink-0">#{ticket.id}</span>
        </Link>

        {/* Line 3: Company/source, updated time, overdue - not clickable */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>{sourceLabel}</span>
          <span>Updated {formatTimeAgo(ticket.updatedAt)}</span>
          {isSlaBreached && ticket.slaDueAt && (
            <span className="text-red-600 font-medium">
              Overdue by: {formatOverdue(ticket.slaDueAt)}
            </span>
          )}
        </div>
      </div>

      {/* Right: Priority, Group/Agent, Status - stacked vertically, left-aligned (Freshdesk-style) */}
      <div className="flex flex-col gap-0.5 shrink-0 items-start w-[180px]" onClick={(e) => e.stopPropagation()}>
        {/* Priority */}
        <div className="w-full flex items-center">
          <InlineSearchableSelect
            value={ticket.priority}
            options={priorityOptions}
            onChange={(v) => onUpdatePriority(ticket.id, v)}
            leadingIcon={
              <span
                className={`block w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColors[ticket.priority] ?? "bg-gray-400"}`}
                aria-hidden
              />
            }
          />
        </div>
        {/* Group / Agent - ONE dropdown; opens panel with GROUP (remove/change) and AGENT (reassign/unassign) */}
        <div className="relative w-full" ref={groupAgentRef}>
          <button
            type="button"
            onClick={() => setGroupAgentOpen((o) => !o)}
            className="flex w-full items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[28px]"
            aria-expanded={groupAgentOpen}
            aria-haspopup="dialog"
          >
            <FolderGit2 className="h-3 w-3 text-gray-500 shrink-0" />
            <span className="truncate flex-1 min-w-0">
              {groupLabel === "—" && agentLabel === "Unassigned" ? "— / —" : displaySummary}
            </span>
            <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 transition-transform ${groupAgentOpen ? "rotate-180" : ""}`} />
          </button>
          {groupAgentOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
              {/* Tabs: GROUP | AGENT */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setGroupAgentTab("group")}
                  className={`flex-1 px-3 py-2 text-xs font-semibold ${
                    groupAgentTab === "group"
                      ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  GROUP
                </button>
                <button
                  type="button"
                  onClick={() => setGroupAgentTab("agent")}
                  className={`flex-1 px-3 py-2 text-xs font-semibold ${
                    groupAgentTab === "agent"
                      ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  AGENT
                </button>
              </div>
              {/* GROUP tab: current group + remove, search, change */}
              {groupAgentTab === "group" && (
                <div className="p-2">
                  <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-xs">
                    <span className="truncate font-medium text-gray-800">{groupLabel}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateGroup(ticket.id, null);
                        setSearchGroup("");
                      }}
                      className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
                      aria-label="Remove group"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">Change group</p>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchGroup}
                      onChange={(e) => setSearchGroup(e.target.value)}
                      placeholder="Search groups..."
                      className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-200">
                    {filteredGroupOptions.map((opt) => (
                      <li key={opt.value}>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateGroup(ticket.id, parseInt(opt.value, 10));
                            setGroupAgentOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        >
                          {opt.label}
                        </button>
                      </li>
                    ))}
                    {filteredGroupOptions.length === 0 && (
                      <li className="px-2 py-2 text-xs text-gray-500">No groups found</li>
                    )}
                  </ul>
                </div>
              )}
              {/* AGENT tab: current agent + unassign, search, reassign */}
              {groupAgentTab === "agent" && (
                <div className="p-2">
                  <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-xs">
                    <span className="truncate font-medium text-gray-800">{agentLabel}</span>
                    {ticket.assignee && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateAssignee(ticket.id, null);
                          setSearchAgent("");
                        }}
                        className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
                        aria-label="Unassign agent"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">Reassign or unassign</p>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchAgent}
                      onChange={(e) => setSearchAgent(e.target.value)}
                      placeholder="Search agents..."
                      className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-200">
                    {filteredAgentOptions.map((opt) => (
                      <li key={opt.value}>
                        <button
                          type="button"
                          onClick={() => {
                            const id = opt.value === "me" && currentUserId != null ? currentUserId : opt.value ? parseInt(opt.value, 10) : null;
                            onUpdateAssignee(ticket.id, Number.isNaN(id as number) ? null : id);
                            setGroupAgentOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        >
                          {opt.label}
                        </button>
                      </li>
                    ))}
                    {filteredAgentOptions.length === 0 && (
                      <li className="px-2 py-2 text-xs text-gray-500">No agents found</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Status */}
        <div className="w-full flex items-center">
          <InlineSearchableSelect
            value={ticket.status}
            options={statusOptions}
            onChange={(v) => onUpdateStatus(ticket.id, v)}
            leadingIcon={
              <span
                className={`block w-1.5 h-1.5 rounded-full shrink-0 ${
                  ticket.status === "open" || ticket.status === "reopened"
                    ? "bg-blue-500"
                    : ticket.status === "resolved" || ticket.status === "closed"
                      ? "bg-green-500"
                      : "bg-amber-500"
                }`}
                aria-hidden
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
