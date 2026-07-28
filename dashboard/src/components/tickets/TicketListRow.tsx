"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FolderGit2, ChevronDown, X, Search } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { prefetchTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { buildTicketDetailHref } from "@/lib/tickets/ticket-path-utils";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";
import { TicketMixedText, TicketNum } from "./tickets-typography";

interface TicketListRowProps {
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
  /** Current user id so "Me" option displays and submits correctly */
  currentUserId?: number;
  /** Full href to ticket detail (includes list query params when provided from the list page). */
  detailHref?: string;
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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function getPriorityResponseSlaMs(priority: string | undefined): number {
  const p = String(priority ?? "").toLowerCase();
  // Response-SLA window:
  // Urgent: 10-15m, High: 15-20m, Medium: 20-25m, Low: 25-30m
  // Use upper bound for breach threshold.
  if (p === "urgent") return 15 * 60 * 1000;
  if (p === "high") return 20 * 60 * 1000;
  if (p === "medium") return 25 * 60 * 1000;
  if (p === "low") return 30 * 60 * 1000;
  if (p === "critical") return 10 * 60 * 1000;
  return 25 * 60 * 1000;
}

const priorityDotColors: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

/** Title-case source role (merchant, rider, customer, …) for chips and avatar. */
function formatTicketSourceRole(role: string): string {
  return role
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ticketTypeAvatarLetter(sourceRole: string | undefined | null): string {
  if (sourceRole == null || !String(sourceRole).trim()) return "T";
  const formatted = formatTicketSourceRole(sourceRole);
  const letter = formatted.charAt(0);
  return letter ? letter.toUpperCase() : "T";
}

export const TicketListRow = React.memo(function TicketListRow({
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
}: TicketListRowProps) {
  const detailLink = detailHref ?? buildTicketDetailHref(ticket.id, "");
  const [groupAgentOpen, setGroupAgentOpen] = useState(false);
  const [groupAgentTab, setGroupAgentTab] = useState<"group" | "agent">("group");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const [groupAgentMenuPlacement, setGroupAgentMenuPlacement] = useState<{ top: number; left: number } | null>(null);
  const groupAgentRef = useRef<HTMLDivElement>(null);
  const groupAgentMenuPortalRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const prefetchThisTicket = useCallback(() => {
    prefetchTicketDetail(queryClient, ticket.id);
  }, [queryClient, ticket.id]);

  useEffect(() => {
    setGroupAgentOpen(false);
    setGroupAgentTab("group");
    setSearchGroup("");
    setSearchAgent("");
    setGroupAgentMenuPlacement(null);
  }, [ticket.id]);

  useLayoutEffect(() => {
    if (!groupAgentOpen) {
      setGroupAgentMenuPlacement(null);
      return;
    }
    const panelWidth = 240;
    const updatePlacement = () => {
      const el = groupAgentRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.right - panelWidth;
      if (left < 8) left = 8;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - panelWidth - 8);
      }
      const panelMaxHeight = Math.min(420, window.innerHeight - 16);
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const preferBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
      let top: number;
      if (preferBelow) {
        top = r.bottom + 4;
        const maxBottom = window.innerHeight - 8;
        if (top + panelMaxHeight > maxBottom) {
          top = Math.max(8, maxBottom - panelMaxHeight);
        }
      } else {
        top = Math.max(8, r.top - panelMaxHeight - 4);
      }
      setGroupAgentMenuPlacement({ top, left });
    };
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [groupAgentOpen]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (groupAgentRef.current?.contains(t) || groupAgentMenuPortalRef.current?.contains(t)) return;
      setGroupAgentOpen(false);
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
  const overdueLabel = showOverdue && ticket.slaDueAt ? `Overdue ${formatOverdue(ticket.slaDueAt)}` : "Overdue";

  const sourceLabel = ticket.sourceRole?.trim() ? formatTicketSourceRole(ticket.sourceRole) : "";
  const typeAvatarLetter = ticketTypeAvatarLetter(ticket.sourceRole);
  const sectionDisplay = ticket.ticketSection?.trim() ? formatTicketSourceRole(ticket.ticketSection) : "";
  /** Skip section chip when it duplicates source role (e.g. Merchant + MERCHANT). */
  const showSectionChip =
    Boolean(sectionDisplay) && sectionDisplay.toLowerCase() !== sourceLabel.toLowerCase();
  const categoryLabel = ticket.ticketCategory
    ? ticket.ticketCategory.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  const ticketTypeLabel = ticket.ticketCategory?.toLowerCase() === "other"
    ? "Other"
    : ticket.ticketType
      ? ticket.ticketType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
  const serviceLabel = ticket.serviceType
    ? ticket.serviceType === "person_ride"
      ? "Ride"
      : ticket.serviceType.charAt(0).toUpperCase() + ticket.serviceType.slice(1)
    : "";

  const onGroupAgentSegmentClick = (segment: "group" | "agent") => {
    if (!groupAgentOpen) {
      setGroupAgentTab(segment);
      setGroupAgentOpen(true);
      return;
    }
    if (groupAgentTab === segment) {
      setGroupAgentOpen(false);
      return;
    }
    setGroupAgentTab(segment);
  };

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
  const showLandedRow =
    Boolean(landedLabel) &&
    (ticket.group == null || ticket.landedGroup == null || ticket.landedGroup.id !== ticket.group.id);
  const agentLabel = ticket.assignee
    ? (ticket.assignee.name ?? ticket.assignee.email ?? `Agent ${ticket.assignee.id}`).trim() || "Unassigned"
    : "Unassigned";
  const hasAssignedGroup = ticket.group != null;
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

  const groupAgentMenuPanel =
    groupAgentOpen && groupAgentMenuPlacement != null && typeof document !== "undefined" ? (
      createPortal(
        <div
          ref={groupAgentMenuPortalRef}
          role="dialog"
          aria-label="Group and agent"
          className="fixed z-[200] flex w-60 max-h-[min(70vh,calc(100vh-16px))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{ top: groupAgentMenuPlacement.top, left: groupAgentMenuPlacement.left }}
        >
          {/* Tabs: GROUP | AGENT */}
          <div className="flex shrink-0 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setGroupAgentTab("group")}
              className={`flex-1 cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold ${
                groupAgentTab === "group"
                  ? "border-b-2 border-blue-600 bg-blue-50/50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              GROUP
            </button>
            <button
              type="button"
              onClick={() => setGroupAgentTab("agent")}
              className={`flex-1 cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold ${
                groupAgentTab === "agent"
                  ? "border-b-2 border-blue-600 bg-blue-50/50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              AGENT
            </button>
          </div>
          {/* GROUP tab: current group + remove, search, change */}
          {groupAgentTab === "group" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {hasAssignedGroup ? (
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
                  <span className="truncate font-medium text-gray-800">{groupLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateGroup(ticket.id, null, "Unassigned");
                      setSearchGroup("");
                    }}
                    className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
                    aria-label="Remove group"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
                  Unassigned
                </span>
              )}
              <p className="mt-1 text-[10px] text-gray-500">Change group</p>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchGroup}
                  onChange={(e) => setSearchGroup(e.target.value)}
                  placeholder="Search groups..."
                  className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
                {filteredGroupOptions.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateGroup(ticket.id, parseInt(opt.value, 10), opt.label);
                        setGroupAgentOpen(false);
                      }}
                      className="w-full cursor-pointer px-2 py-1.5 text-left text-[12px] text-gray-900 hover:bg-blue-50 hover:text-gray-900 focus:bg-blue-50 focus:outline-none"
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
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px]">
                <span className="truncate font-medium text-gray-800">{agentLabel}</span>
                {ticket.assignee && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAssignee(ticket.id, null, "Unassigned");
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
                  className="w-full rounded border border-gray-300 py-1 pl-6.5 pr-2 text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
                {filteredAgentOptions.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        const id =
                          opt.value === "me" && currentUserId != null ? currentUserId : opt.value ? parseInt(opt.value, 10) : null;
                        onUpdateAssignee(ticket.id, Number.isNaN(id as number) ? null : id, opt.label);
                        setGroupAgentOpen(false);
                      }}
                      className="w-full cursor-pointer px-2 py-1.5 text-left text-[12px] text-gray-900 hover:bg-blue-50 hover:text-gray-900 focus:bg-blue-50 focus:outline-none"
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
        </div>,
        document.body
      )
    ) : null;

  return (
    <>
    <div
      className="flex items-center gap-2 border-b border-gray-200 bg-white pl-2 pr-1 py-2 hover:bg-slate-50/80 transition-colors min-h-0 relative group"
      style={{ overflow: "visible" }}
      onPointerEnter={prefetchThisTicket}
    >
      {/* Checkbox — fixed width column so text column aligns row-to-row */}
      <div className="shrink-0 w-4 flex justify-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
          aria-label={`Select ticket ${ticket.ticketNumber}`}
        />
      </div>

      {/* Avatar: ticket source type (Merchant / Rider / Customer …), first letter only */}
      <Link
        href={detailLink}
        scroll={false}
        className="shrink-0 w-8 h-8 rounded-[10px] bg-[#121212] flex items-center justify-center text-white text-xs font-semibold leading-none tickets-num shadow-sm hover:bg-black hover:scale-[1.02] transition-all"
        aria-label={`Open ticket ${ticket.ticketNumber}${sourceLabel ? ` (${sourceLabel})` : ""}`}
        title={sourceLabel ? `Type: ${sourceLabel}` : undefined}
      >
        {typeAvatarLetter}
      </Link>

      {/* Main content — shared left edge for chips, title, meta */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex flex-nowrap items-center gap-1 w-full min-w-0 overflow-x-auto [scrollbar-width:thin]">
          {showOverdue && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              <TicketMixedText>{overdueLabel}</TicketMixedText>
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 capitalize">
            {ticket.priority}
          </span>
          {ticketTypeLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
              {ticketTypeLabel}
            </span>
          )}
          {sourceLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-800 border border-violet-100">
              {sourceLabel}
            </span>
          )}
          {showSectionChip && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
              {sectionDisplay}
            </span>
          )}
          {serviceLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
              {serviceLabel}
            </span>
          )}
          {categoryLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800">
              <TicketMixedText>{categoryLabel}</TicketMixedText>
            </span>
          )}
        </div>

        <Link
          href={detailLink}
          scroll={false}
          // Only the subject + ticket id text should be clickable.
          // Avoid `w-full` here because it makes the whole row width clickable (including blank space).
          className="inline-flex w-fit max-w-full min-w-0 text-left hover:underline underline-offset-2"
          title={`${ticket.subject} · #${ticket.ticketNumber || ticket.id}`}
        >
          <TicketMixedText className="font-medium text-[#121212] text-[12.5px] leading-snug [overflow-wrap:anywhere]">
            {ticket.subject}
          </TicketMixedText>
          <TicketNum className="text-[11px] text-[#121212]/55 font-medium whitespace-nowrap align-baseline ml-2">
            #{ticket.ticketNumber || ticket.id}
          </TicketNum>
        </Link>

        <div className="flex w-full min-w-0 items-center gap-x-2 gap-y-0.5 text-[11px] text-[#121212]/55 flex-wrap text-left">
          <span>
            <span className="text-[#121212]/70 font-medium">Agent:</span> {agentLabel}
          </span>
          <span aria-hidden className="text-[#121212]/25">
            ·
          </span>
          <span>
            Created <TicketNum>{formatDateTime(ticket.createdAt)}</TicketNum>
          </span>
          <span aria-hidden className="text-[#121212]/25">
            ·
          </span>
          <span>
            Updated <TicketNum>{formatDateTime(ticket.updatedAt)}</TicketNum>
          </span>
          {ticket.slaDueAt ? (
            <>
              <span aria-hidden className="text-[#121212]/25">
                ·
              </span>
              <span>
                SLA due <TicketNum>{formatDateTime(ticket.slaDueAt)}</TicketNum>
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Right: Priority + Status on one row; Group/Agent full width below */}
      <div className="flex flex-col gap-1.5 shrink-0 items-start w-[288px] min-w-[288px] mr-2" onClick={(e) => e.stopPropagation()}>
        {snoozeCountdown ? (
          <div className="w-full text-right">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                snoozeCountdown.tone === "red"
                  ? "bg-red-50 text-red-700"
                  : snoozeCountdown.tone === "amber"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-violet-50 text-violet-700"
              }`}
            >
              Resumes in <span className="tickets-num">{snoozeCountdown.label}</span>
            </span>
          </div>
        ) : null}
        <div className="flex w-full min-h-[22px] flex-row items-center gap-1">
          <div className="min-w-0 flex-1">
            <InlineSearchableSelect
              value={ticket.priority}
              options={priorityOptions}
              onChange={(v) => onUpdatePriority(ticket.id, v)}
              compact
              resetMenusWhenChanged={ticket.id}
              leadingIcon={
                <span
                  className={`block w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColors[ticket.priority] ?? "bg-gray-400"}`}
                  aria-hidden
                />
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <InlineSearchableSelect
              value={ticket.status}
              options={statusOptions}
              onChange={(v) => onUpdateStatus(ticket.id, v)}
              compact
              resetMenusWhenChanged={ticket.id}
              leadingIcon={
                <span
                  className={`block w-1.5 h-1.5 rounded-full shrink-0 ${
                    ticket.status === "open" || ticket.status === "reopened"
                      ? "bg-blue-500"
                      : ticket.status === "snoozed"
                        ? "bg-violet-500"
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
        {/* Group / Agent - ONE dropdown */}
        <div
          className="relative w-full rounded-lg border border-gray-200 bg-gray-50/40 px-1.5 py-1 focus-within:ring-1 focus-within:ring-blue-500 focus-within:ring-offset-0"
          ref={groupAgentRef}
          aria-expanded={groupAgentOpen}
        >
          <div
            className="flex w-full items-center gap-1.5"
            title={
              [
                hasAssignedGroup ? `Group: ${groupLabel}` : `Queue: ${groupLabel}`,
                showLandedRow && landedLabel ? `Landed: ${landedLabel}` : null,
                `Agent: ${agentLabel}`,
              ]
                .filter(Boolean)
                .join(" · ")
            }
          >
            <FolderGit2 className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1 text-[11px] leading-snug">
                <button
                  type="button"
                  onClick={() => onGroupAgentSegmentClick("group")}
                  className="min-w-0 flex-1 truncate rounded px-0.5 py-0.5 text-left text-gray-800 hover:bg-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  aria-haspopup="dialog"
                  aria-label={
                    hasAssignedGroup
                      ? `Group: ${groupLabel}. Open group picker.`
                      : `Queue: ${groupLabel}. Open group picker.`
                  }
                >
                  {hasAssignedGroup ? (
                    <span className="font-medium text-gray-900">{groupLabel}</span>
                  ) : (
                    <>
                      <span className="font-medium text-gray-500">Queue:</span>{" "}
                      <span className="text-gray-600">{groupLabel}</span>
                    </>
                  )}
                </button>
                <span className="shrink-0 select-none text-gray-300" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onGroupAgentSegmentClick("agent")}
                  className="min-w-0 flex-1 truncate rounded px-0.5 py-0.5 text-left hover:bg-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  aria-haspopup="dialog"
                  aria-label={`Agent: ${agentLabel}. Open agent picker.`}
                >
                  <span className="font-medium text-gray-500">A:</span>{" "}
                  <span className="text-gray-800">{agentLabel}</span>
                </button>
              </div>
              {showLandedRow && landedLabel ? (
                <span className="truncate text-[10px] leading-snug text-gray-500">
                  <span className="font-medium text-gray-600">Landed:</span> {landedLabel}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setGroupAgentOpen((o) => !o)}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              aria-expanded={groupAgentOpen}
              aria-label="Toggle group and agent menu"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${groupAgentOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
    {groupAgentMenuPanel}
    </>
  );
});
