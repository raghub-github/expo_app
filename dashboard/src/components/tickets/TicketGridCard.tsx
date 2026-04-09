"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { User, ChevronDown, X, Search, Copy } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { prefetchTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { buildTicketDetailHref } from "@/lib/tickets/ticket-path-utils";
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

function formatSnoozeCountdownShort(
  snoozedUntil: string,
  nowMs: number
): { label: string; tone: "violet" | "amber" | "red" } | null {
  const endMs = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(endMs)) return null;
  const diff = endMs - nowMs;
  if (diff <= 0) return { label: "Resuming now", tone: "red" };
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tone: "violet" | "amber" | "red" = totalSeconds < 60 ? "red" : totalSeconds < 300 ? "amber" : "violet";
  if (hours > 0) return { label: `${hours}h ${minutes}m ${seconds}s`, tone };
  if (minutes > 0) return { label: `${minutes}m ${seconds}s`, tone };
  return { label: `${seconds}s`, tone };
}

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

function getPriorityResponseSlaMs(priority: string | undefined): number {
  // Response-SLA window:
  // Urgent: 10-15m, High: 15-20m, Medium: 20-25m, Low: 25-30m
  // Use upper bound for breach threshold.
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent") return 15 * 60 * 1000;
  if (p === "high") return 20 * 60 * 1000;
  if (p === "medium") return 25 * 60 * 1000;
  if (p === "low") return 30 * 60 * 1000;
  if (p === "critical") return 10 * 60 * 1000;
  return 25 * 60 * 1000;
}

export interface TicketGridCardProps {
  ticket: Ticket;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onUpdatePriority: (ticketId: number, priority: string) => void;
  onUpdateGroup: (ticketId: number, groupId: number | null, groupLabel?: string) => void;
  onUpdateAssignee: (ticketId: number, userId: number | null, assigneeLabel?: string) => void;
  onUpdateStatus: (ticketId: number, status: string) => void;
  priorityOptions: Option[];
  groupOptions: Option[];
  agentOptions: Array<{ value: string; label: string }>;
  statusOptions: Option[];
  currentUserId?: number;
  detailHref?: string;
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
  detailHref,
}: TicketGridCardProps) {
  const detailLink = detailHref ?? buildTicketDetailHref(ticket.id, "");
  const [groupAgentOpen, setGroupAgentOpen] = useState(false);
  const [groupAgentTab, setGroupAgentTab] = useState<"group" | "agent">("group");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const prefetchThisTicket = useCallback(() => {
    prefetchTicketDetail(queryClient, ticket.id);
  }, [queryClient, ticket.id]);

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

  const isResolvedOrClosed = ["closed", "resolved"].includes(ticket.status);
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !isResolvedOrClosed;
  const isOverdue15 =
    !isResolvedOrClosed &&
    Date.now() - new Date(ticket.createdAt).getTime() > getPriorityResponseSlaMs(ticket.priority);
  const showOverdue = isSlaBreached || isOverdue15;

  const queueNameFromRef =
    ticket.group?.id != null
      ? groupOptions.find((o) => o.value === String(ticket.group!.id))?.label
      : undefined;
  const groupLabel =
    (ticket.group?.name?.trim() ||
      ticket.group?.code?.trim() ||
      queueNameFromRef ||
      (ticket.group?.id != null ? `Group #${ticket.group.id}` : "")) || "—";
  const landedLabel = ticket.landedGroup?.name ?? ticket.landedGroup?.code ?? null;
  const showLandedOnCard =
    Boolean(landedLabel) &&
    (ticket.group == null || ticket.landedGroup == null || ticket.landedGroup.id !== ticket.group.id);
  const agentLabel = ticket.assignee
    ? (ticket.assignee.name ?? ticket.assignee.email ?? `Agent ${ticket.assignee.id}`).trim() || "Unassigned"
    : "Unassigned";

  const filteredGroupOptions = searchGroup.trim()
    ? groupOptions.filter((o) => o.label.toLowerCase().includes(searchGroup.toLowerCase()))
    : groupOptions;
  const filteredAgentOptions = searchAgent.trim()
    ? agentOptions.filter((o) => o.label.toLowerCase().includes(searchAgent.toLowerCase()))
    : agentOptions;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (ticket.status !== "snoozed" || !ticket.snoozedUntil) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticket.status, ticket.snoozedUntil]);
  const snoozeCountdown =
    ticket.status === "snoozed" && ticket.snoozedUntil
      ? formatSnoozeCountdownShort(ticket.snoozedUntil, nowMs)
      : null;

  const sourceLabel = ticket.sourceRole ? ticket.sourceRole.replace(/_/g, " ").toUpperCase() : "";
  const ticketTypeLabel = ticket.ticketCategory?.toLowerCase() === "other"
    ? "Other"
    : ticket.ticketType
      ? ticket.ticketType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : "";

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
          className={`flex-1 cursor-pointer px-2 py-1 text-[11px] font-semibold ${groupAgentTab === "group" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          GROUP
        </button>
        <button
          type="button"
          onClick={() => setGroupAgentTab("agent")}
          className={`flex-1 cursor-pointer px-2 py-1 text-[11px] font-semibold ${groupAgentTab === "agent" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          AGENT
        </button>
      </div>
      {groupAgentTab === "group" && (
        <div className="p-1.5">
          {ticket.group ? (
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
              <span className="truncate font-medium text-gray-800">{groupLabel}</span>
              <button type="button" onClick={() => { onUpdateGroup(ticket.id, null, "Unassigned"); setSearchGroup(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Remove group"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <span className="inline-flex items-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
              Unassigned
            </span>
          )}
          <p className="mt-1 text-[10px] text-gray-500">Change group</p>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchGroup} onChange={(e) => setSearchGroup(e.target.value)} placeholder="Search groups..." className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
            {filteredGroupOptions.map((opt) => (
              <li key={opt.value}>
                <button type="button" onClick={() => { onUpdateGroup(ticket.id, parseInt(opt.value, 10), opt.label); setGroupAgentOpen(false); }} className="w-full cursor-pointer px-2 py-1.5 text-left text-[11px] text-gray-900 hover:bg-blue-50 focus:outline-none">{opt.label}</button>
              </li>
            ))}
            {filteredGroupOptions.length === 0 && <li className="px-2 py-1.5 text-[11px] text-gray-500">No groups</li>}
          </ul>
        </div>
      )}
      {groupAgentTab === "agent" && (
        <div className="p-1.5">
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
            <span className="truncate font-medium text-gray-800">{agentLabel}</span>
            {ticket.assignee && <button type="button" onClick={() => { onUpdateAssignee(ticket.id, null, "Unassigned"); setSearchAgent(""); }} className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100" aria-label="Unassign"><X className="h-3 w-3" /></button>}
          </div>
          <p className="mt-1 text-[10px] text-gray-500">Reassign</p>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchAgent} onChange={(e) => setSearchAgent(e.target.value)} placeholder="Search agents..." className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
            {filteredAgentOptions.map((opt) => (
              <li key={opt.value}>
                <button type="button" onClick={() => { const id = opt.value === "me" && currentUserId != null ? currentUserId : opt.value ? parseInt(opt.value, 10) : null; onUpdateAssignee(ticket.id, id != null && !Number.isNaN(id) ? id : null, opt.label); setGroupAgentOpen(false); }} className="w-full cursor-pointer px-2 py-1.5 text-left text-[11px] text-gray-900 hover:bg-blue-50 focus:outline-none">{opt.label}</button>
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
      onPointerEnter={prefetchThisTicket}
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
        {snoozeCountdown ? (
          <div className="flex justify-end">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                snoozeCountdown.tone === "red"
                  ? "bg-red-50 text-red-700"
                  : snoozeCountdown.tone === "amber"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-violet-50 text-violet-700"
              }`}
            >
              Resumes in {snoozeCountdown.label}
            </span>
          </div>
        ) : null}
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
          {ticketTypeLabel && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              {ticketTypeLabel}
            </span>
          )}
        </div>

        {/* Title */}
        <Link
          href={detailLink}
          scroll={false}
          className="font-bold text-gray-900 text-[13px] line-clamp-2 leading-tight hover:text-blue-600 hover:underline -mx-0.5 px-0.5"
        >
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

        {(ticket.group || (showLandedOnCard && landedLabel)) && (
          <div className="text-[10px] text-gray-600 space-y-0.5 min-w-0">
            {ticket.group ? (
              <div className="truncate">
                <span className="font-medium text-gray-700">Queue:</span> {groupLabel}
              </div>
            ) : null}
            {showLandedOnCard && landedLabel ? (
              <div className="truncate">
                <span className="font-medium text-gray-700">Landed:</span> {landedLabel}
              </div>
            ) : null}
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
