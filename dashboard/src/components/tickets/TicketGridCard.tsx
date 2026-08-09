"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import { prefetchTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { useTicketsNavPendingOptional } from "@/context/TicketsNavPendingContext";
import { buildTicketDetailHref } from "@/lib/tickets/ticket-path-utils";
import { formatTicketDisplaySubject } from "@/lib/tickets/ticket-display-subject";
import { InlineSearchableSelect, type Option } from "./InlineSearchableSelect";
import { TicketMixedText, TicketNum } from "./tickets-typography";
import { TicketCardActionControls } from "./TicketCardActionControls";

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

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOverdue(slaDueAt: string): string {
  const diffMs = Date.now() - new Date(slaDueAt).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays >= 1) return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours >= 1) return `${diffHours}h`;
  const diffMins = Math.floor(diffMs / 60000);
  return `${Math.max(diffMins, 1)}m`;
}

function formatTicketSourceRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ticketTypeAvatarLetter(sourceRole: string | undefined | null): string {
  if (!sourceRole?.trim()) return "T";
  const formatted = formatTicketSourceRole(sourceRole);
  return formatted.charAt(0).toUpperCase();
}

function getPriorityResponseSlaMs(priority: string | undefined): number {
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
  const displaySubject = formatTicketDisplaySubject(ticket);
  const queryClient = useQueryClient();
  const ticketsNavPending = useTicketsNavPendingOptional();
  const prefetchThisTicket = useCallback(() => {
    prefetchTicketDetail(queryClient, ticket.id);
  }, [queryClient, ticket.id]);
  const beginDetailNav = useCallback(() => {
    ticketsNavPending?.beginDetailNav(ticket.id);
  }, [ticketsNavPending, ticket.id]);

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
  const showSectionChip =
    Boolean(sectionDisplay) && sectionDisplay.toLowerCase() !== sourceLabel.toLowerCase();
  const categoryLabel = ticket.ticketCategory
    ? ticket.ticketCategory.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  const serviceLabel = ticket.serviceType
    ? ticket.serviceType === "person_ride"
      ? "Ride"
      : ticket.serviceType.charAt(0).toUpperCase() + ticket.serviceType.slice(1)
    : "";

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

  const ticketTypeLabel = ticket.ticketCategory?.toLowerCase() === "other"
    ? "Other"
    : ticket.ticketType
      ? ticket.ticketType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : "";

  return (
    <div
      className={`group/card rounded-xl border bg-white flex flex-col min-h-0 overflow-visible transition-all duration-200 ${
        selected
          ? "border-blue-200 ring-2 ring-blue-500/15 shadow-md"
          : "border-gray-200/90 shadow-sm hover:border-gray-300/90 hover:shadow-md"
      }`}
      style={{ isolation: "isolate" }}
      onPointerEnter={prefetchThisTicket}
    >
      <div className="p-2 flex flex-col gap-1 flex-1 min-h-0">
        <div className="flex items-start gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30 shrink-0"
            aria-label={`Select ${ticket.ticketNumber}`}
          />
          <Link
            href={detailLink}
            scroll={false}
            onClick={beginDetailNav}
            className="shrink-0 w-7 h-7 rounded-[9px] bg-[#121212] flex items-center justify-center text-white text-[11px] font-semibold leading-none tickets-num shadow-sm group-hover/card:scale-[1.02] transition-transform"
            aria-label={`Open ticket ${ticket.ticketNumber}${sourceLabel ? ` (${sourceLabel})` : ""}`}
          >
            {typeAvatarLetter}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
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
          </div>
        </div>

        <Link
          href={detailLink}
          scroll={false}
          onClick={beginDetailNav}
          className="group/title inline-flex w-fit max-w-full min-w-0 text-left rounded-sm px-0.5 -mx-0.5 transition-colors duration-150 hover:bg-blue-50/80"
        >
          <TicketMixedText className="font-medium text-[#121212] group-hover/title:text-blue-700 transition-colors duration-150 text-[12px] leading-snug line-clamp-2 [overflow-wrap:anywhere]">
            {displaySubject}
          </TicketMixedText>
          <TicketNum className="text-[10px] text-[#121212]/55 group-hover/title:text-blue-600/75 font-medium whitespace-nowrap align-baseline ml-1.5 transition-colors duration-150">
            #{ticket.ticketNumber || ticket.id}
          </TicketNum>
        </Link>

        <div className="flex items-center gap-1 text-[10px] text-[#121212]/55 truncate">
          <span className="truncate">
            <span className="text-[#121212]/70 font-medium">A:</span> {agentLabel}
          </span>
          <span aria-hidden className="text-[#121212]/25">·</span>
          <span className="shrink-0">Updated <TicketNum>{formatDateTime(ticket.updatedAt)}</TicketNum></span>
        </div>

        <div
          className="mt-auto border-t border-gray-100 pt-1"
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TicketCardActionControls
            ticket={ticket}
            onUpdatePriority={onUpdatePriority}
            onUpdateGroup={onUpdateGroup}
            onUpdateAssignee={onUpdateAssignee}
            onUpdateStatus={onUpdateStatus}
            priorityOptions={priorityOptions}
            groupOptions={groupOptions}
            agentOptions={agentOptions}
            statusOptions={statusOptions}
            currentUserId={currentUserId}
            groupLabel={groupLabel}
            landedLabel={landedLabel}
            showLandedRow={showLandedRow}
            agentLabel={agentLabel}
            hasAssignedGroup={hasAssignedGroup}
            snoozeCountdown={snoozeCountdown}
          />
        </div>
      </div>
    </div>
  );
}
