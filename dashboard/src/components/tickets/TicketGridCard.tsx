"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { User, ChevronDown, X, Search, Copy } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";

// Reference card: Ticket ID = purple-blue pill (white text), Status = light blue, Priority = light green,
// Model tags (source/group) = light purple bg + purple text, Age = bright orange pill (white text)
const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  assigned: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  rejected: "bg-red-100 text-red-800",
  reopened: "bg-orange-100 text-orange-800",
};

const priorityPillColors: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-purple-100 text-purple-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const priorityDotColors: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-purple-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

// Model/category tags: light purple background, purple text (RIDER, magicfleet_OMS style)
const modelTagClass = "bg-purple-100 text-purple-800";

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays >= 1 && diffDays < 2) return `1d ${diffHours % 24}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const isResolvedOrClosed = ["closed", "resolved"].includes(ticket.status);
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !isResolvedOrClosed;
  const isOverdue15 =
    !isResolvedOrClosed &&
    Date.now() - new Date(ticket.createdAt).getTime() > 15 * 60 * 1000;
  const showOverdue = isSlaBreached || isOverdue15;

  const [groupAgentOpen, setGroupAgentOpen] = useState(false);
  const [groupAgentTab, setGroupAgentTab] = useState<"group" | "agent">("group");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (groupAgentOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [groupAgentOpen]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setGroupAgentOpen(false);
    };
    if (groupAgentOpen) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [groupAgentOpen]);

  const groupLabel = ticket.group?.name ?? ticket.group?.code ?? "—";
  const agentLabel = ticket.assignee
    ? (ticket.assignee.name ?? ticket.assignee.email ?? `Agent ${ticket.assignee.id}`).trim() || "Unassigned"
    : "Unassigned";

  const filteredGroupOptions = searchGroup.trim()
    ? groupOptions.filter((o) => o.label.toLowerCase().includes(searchGroup.toLowerCase()))
    : groupOptions;
  const filteredAgentOptions = searchAgent.trim()
    ? agentOptions.filter((o) => o.label.toLowerCase().includes(searchAgent.toLowerCase()))
    : agentOptions;

  const sourceLabel = ticket.sourceRole ? ticket.sourceRole.replace(/_/g, " ").toUpperCase() : "";

  // Top gradient: Indian flag style (saffron → white → green)
  const topBorderGradient = "linear-gradient(90deg, #FF9933 0%, #FFFFFF 50%, #138808 100%)";

  const copyId = () => {
    const id = ticket.ticketNumber || String(ticket.id);
    navigator.clipboard.writeText(id).catch(() => {});
  };

  const panelContent = groupAgentOpen && typeof document !== "undefined" && (
    <div
      ref={panelRef}
      className="fixed w-56 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden z-[9999]"
      style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
    >
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setGroupAgentTab("group")}
          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold ${groupAgentTab === "group" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          GROUP
        </button>
        <button
          type="button"
          onClick={() => setGroupAgentTab("agent")}
          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold ${groupAgentTab === "agent" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          AGENT
        </button>
      </div>
      {groupAgentTab === "group" && (
        <div className="p-2">
          <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-[11px]">
            <span className="truncate font-medium text-gray-800">{groupLabel}</span>
            <button type="button" onClick={() => { onUpdateGroup(ticket.id, null); setSearchGroup(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Remove group"><X className="h-3 w-3" /></button>
          </div>
          <p className="mt-1 text-[10px] text-gray-500">Change group</p>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchGroup} onChange={(e) => setSearchGroup(e.target.value)} placeholder="Search groups..." className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
            {filteredGroupOptions.map((opt) => (
              <li key={opt.value}>
                <button type="button" onClick={() => { onUpdateGroup(ticket.id, parseInt(opt.value, 10)); setGroupAgentOpen(false); }} className="w-full px-2 py-1.5 text-left text-[11px] text-gray-900 hover:bg-blue-50 focus:outline-none">{opt.label}</button>
              </li>
            ))}
            {filteredGroupOptions.length === 0 && <li className="px-2 py-1.5 text-[11px] text-gray-500">No groups</li>}
          </ul>
        </div>
      )}
      {groupAgentTab === "agent" && (
        <div className="p-2">
          <div className="flex items-center justify-between gap-2 rounded bg-gray-100 px-2 py-1.5 text-[11px]">
            <span className="truncate font-medium text-gray-800">{agentLabel}</span>
            {ticket.assignee && <button type="button" onClick={() => { onUpdateAssignee(ticket.id, null); setSearchAgent(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Unassign"><X className="h-3 w-3" /></button>}
          </div>
          <p className="mt-1 text-[10px] text-gray-500">Reassign</p>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchAgent} onChange={(e) => setSearchAgent(e.target.value)} placeholder="Search agents..." className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
            {filteredAgentOptions.map((opt) => (
              <li key={opt.value}>
                <button type="button" onClick={() => { const id = opt.value === "me" && currentUserId != null ? currentUserId : opt.value ? parseInt(opt.value, 10) : null; onUpdateAssignee(ticket.id, id != null && !Number.isNaN(id) ? id : null); setGroupAgentOpen(false); }} className="w-full px-2 py-1.5 text-left text-[11px] text-gray-900 hover:bg-blue-50 focus:outline-none">{opt.label}</button>
              </li>
            ))}
            {filteredAgentOptions.length === 0 && <li className="px-2 py-1.5 text-[11px] text-gray-500">No agents</li>}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white shadow-sm transition-all flex flex-col min-h-0 overflow-visible"
      style={{ isolation: "isolate" }}
    >
      <div
        className="h-1 rounded-t-lg shrink-0"
        style={{ background: topBorderGradient }}
        aria-hidden
      />
      <div className="p-2 flex flex-col gap-1 flex-1 min-h-0">
        {/* Row 1: Checkbox left, Ticket ID pill + copy icon top right */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
            aria-label={`Select ${ticket.ticketNumber}`}
          />
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="inline-flex items-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              #{ticket.ticketNumber || ticket.id}
            </span>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyId(); }} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Copy ticket ID">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
        {/* Row 2: Status, Priority, Overdue */}
        <div className="flex items-center gap-1 flex-wrap">
          {showOverdue && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
              Overdue
            </span>
          )}
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusColors[ticket.status] || statusColors.open}`}>
            {(ticket.status || "open").replace(/_/g, " ")}
          </span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${priorityPillColors[ticket.priority] ?? priorityPillColors.medium}`}>
            {(ticket.priority || "medium").replace(/_/g, " ")}
          </span>
        </div>

        {/* Title */}
        <Link href={`/dashboard/tickets/${ticket.id}`} className="font-bold text-gray-900 text-[13px] line-clamp-2 leading-tight hover:text-blue-600 hover:underline -mx-0.5 px-0.5">
          {ticket.subject || "No subject"}
        </Link>

        {/* Source tag only (no Group below subject) */}
        {sourceLabel && (
          <div className="flex flex-wrap gap-1">
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${modelTagClass}`}>
              {sourceLabel}
            </span>
          </div>
        )}

        {/* Bottom row: Agent · Created At · Updated At */}
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-wrap">
          <span><span className="text-gray-600 font-medium">Agent:</span> {agentLabel}</span>
          <span aria-hidden>·</span>
          <span>Created {formatTimestamp(ticket.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>Updated {formatTimestamp(ticket.updatedAt)}</span>
        </div>

        {/* Assign Agent + Status dropdowns */}
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-1.5 mt-auto" onClick={(e) => e.preventDefault()} onMouseDown={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-1">
            <div className="min-w-0">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setGroupAgentOpen((o) => !o)}
                className="flex w-full items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-left text-[10px] text-gray-700 hover:bg-gray-50 min-h-[24px]"
                aria-expanded={groupAgentOpen}
              >
                <User className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="truncate flex-1 min-w-0">{agentLabel}</span>
                <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 ${groupAgentOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            <div className="min-w-0 flex items-center">
              <InlineSearchableSelect
                value={ticket.status}
                options={statusOptions}
                onChange={(v) => onUpdateStatus(ticket.id, v)}
                leadingIcon={
                  <span className={`block w-1.5 h-1.5 rounded-full shrink-0 ${ticket.status === "open" || ticket.status === "reopened" ? "bg-blue-500" : ticket.status === "resolved" || ticket.status === "closed" ? "bg-green-500" : "bg-amber-500"}`} aria-hidden />
                }
              />
            </div>
          </div>
        </div>
      </div>
      {panelContent && createPortal(panelContent, document.body)}
    </div>
  );
}
