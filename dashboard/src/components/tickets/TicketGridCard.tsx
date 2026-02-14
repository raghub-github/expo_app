"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Clock, User, AlertCircle, FolderGit2, ChevronDown, X, Search } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  assigned: "bg-purple-100 text-purple-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  rejected: "bg-red-100 text-red-800",
  reopened: "bg-orange-100 text-orange-800",
};

const priorityDotColors: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

const serviceTypeLabels: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Ride",
  other: "Other",
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export interface TicketGridCardProps {
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
  currentUserId?: number;
}

export function TicketGridCard({
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
}: TicketGridCardProps) {
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !["closed", "resolved"].includes(ticket.status);

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
    <div
      className="rounded-lg border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md transition-all flex flex-col min-h-0 overflow-visible"
      style={{ isolation: "isolate" }}
    >
      <div className="p-3 flex flex-col gap-3 flex-1 min-h-0">
        {/* Top: checkbox + ticket id + status */}
        <div className="flex items-start gap-2">
          <div
            className="shrink-0 pt-0.5"
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              aria-label={`Select ${ticket.ticketNumber}`}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Ticket ID + status row - only ticket number is clickable */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/dashboard/tickets/${ticket.id}`}
                className="font-mono text-xs font-medium text-gray-700 hover:text-blue-600 hover:underline"
                aria-label={`Open ticket ${ticket.ticketNumber}`}
              >
                {ticket.ticketNumber}
              </Link>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                  statusColors[ticket.status] || statusColors.open
                }`}
              >
                {ticket.status.replace("_", " ").toUpperCase()}
              </span>
              {ticket.isHighValueOrder && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-100 text-yellow-800">
                  High Value
                </span>
              )}
              {isSlaBreached && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-800">
                  <AlertCircle className="w-2.5 h-2.5" />
                  SLA
                </span>
              )}
            </div>
            {/* Title - clickable */}
            <Link
              href={`/dashboard/tickets/${ticket.id}`}
              className="font-medium text-gray-900 text-sm line-clamp-2 leading-tight hover:text-blue-600 hover:underline block"
            >
              {ticket.subject}
            </Link>
            {/* Description and meta - not clickable */}
            <p className="text-xs text-gray-500 line-clamp-2">
              {ticket.description}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              <span>{serviceTypeLabels[ticket.serviceType] || ticket.serviceType}</span>
              {ticket.orderId && <span>Order #{ticket.orderId}</span>}
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(ticket.updatedAt)}
              </span>
              {ticket.assignee ? (
                <span className="flex items-center gap-0.5 max-w-[100px] truncate">
                  <User className="w-3 h-3 shrink-0" />
                  {ticket.assignee.name}
                </span>
              ) : (
                <span className="text-gray-400">Unassigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Priority · Group/Agent · Status (same as list row) */}
        <div
          className="flex flex-col gap-1 border-t border-gray-100 pt-2 mt-auto"
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="w-full flex items-center min-h-[28px]">
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
              <div className="absolute left-0 right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setGroupAgentTab("group")}
                    className={`flex-1 px-3 py-2 text-xs font-semibold ${
                      groupAgentTab === "group" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    GROUP
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupAgentTab("agent")}
                    className={`flex-1 px-3 py-2 text-xs font-semibold ${
                      groupAgentTab === "agent" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    AGENT
                  </button>
                </div>
                {groupAgentTab === "group" && (
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-xs">
                      <span className="truncate font-medium text-gray-800">{groupLabel}</span>
                      <button type="button" onClick={() => { onUpdateGroup(ticket.id, null); setSearchGroup(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Remove group"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">Change group</p>
                    <div className="relative mt-1">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={searchGroup} onChange={(e) => setSearchGroup(e.target.value)} placeholder="Search groups..." className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-200">
                      {filteredGroupOptions.map((opt) => (
                        <li key={opt.value}>
                          <button type="button" onClick={() => { onUpdateGroup(ticket.id, parseInt(opt.value, 10)); setGroupAgentOpen(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50">{opt.label}</button>
                        </li>
                      ))}
                      {filteredGroupOptions.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No groups found</li>}
                    </ul>
                  </div>
                )}
                {groupAgentTab === "agent" && (
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-xs">
                      <span className="truncate font-medium text-gray-800">{agentLabel}</span>
                      {ticket.assignee && <button type="button" onClick={() => { onUpdateAssignee(ticket.id, null); setSearchAgent(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Unassign agent"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">Reassign or unassign</p>
                    <div className="relative mt-1">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={searchAgent} onChange={(e) => setSearchAgent(e.target.value)} placeholder="Search agents..." className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-200">
                      {filteredAgentOptions.map((opt) => (
                        <li key={opt.value}>
                          <button type="button" onClick={() => {
                          const id = opt.value === "me" && currentUserId != null ? currentUserId : opt.value ? parseInt(opt.value, 10) : null;
                          onUpdateAssignee(ticket.id, id != null && !Number.isNaN(id) ? id : null);
                          setGroupAgentOpen(false);
                        }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50">{opt.label}</button>
                        </li>
                      ))}
                      {filteredAgentOptions.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No agents found</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="w-full flex items-center min-h-[28px]">
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
    </div>
  );
}
