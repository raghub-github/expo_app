"use client";

import Link from "next/link";
import { Clock, AlertCircle, User, FolderGit2 } from "lucide-react";
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

      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
        {initial}
      </div>

      {/* Main content - clickable to detail */}
      <Link
        href={`/dashboard/tickets/${ticket.id}`}
        className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5"
      >
        {/* Line 1: Priority + group/section/service/category chips */}
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

        {/* Line 2: Subject + Ticket ID */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm truncate max-w-[320px]" title={ticket.subject}>
            {ticket.subject}
          </span>
          <span className="text-xs text-gray-500 font-mono shrink-0">#{ticket.id}</span>
        </div>

        {/* Line 3: Company/source, updated time, overdue */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>{sourceLabel}</span>
          <span>Updated {formatTimeAgo(ticket.updatedAt)}</span>
          {isSlaBreached && ticket.slaDueAt && (
            <span className="text-red-600 font-medium">
              Overdue by: {formatOverdue(ticket.slaDueAt)}
            </span>
          )}
        </div>
      </Link>

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
        {/* Group / Agent - TWO separate dropdowns (Freshdesk style) - Compact spacing, no gap */}
        <div className="flex items-center w-full gap-0">
          {/* Group dropdown (left) - Fixed width */}
          <div className="flex items-center min-w-[70px]">
            <InlineSearchableSelect
              value={ticket.group ? String(ticket.group.id) : ""}
              options={groupOptions}
              onChange={(v) => onUpdateGroup(ticket.id, v ? parseInt(v, 10) : null)}
              leadingIcon={<FolderGit2 className="h-3 w-3 text-gray-500 shrink-0" />}
              placeholder="—"
              allowUnset
              unsetLabel="—"
            />
          </div>
          {/* Separator "/" - Minimal gap, tight spacing like Freshdesk */}
          <span className="shrink-0 text-gray-400 text-[10px] mx-0 leading-none">/</span>
          {/* Agent dropdown (right) - No unassign button, handled in dropdown */}
          <div className="flex items-center flex-1 min-w-0">
            <InlineSearchableSelect
              value={ticket.assignee ? String(ticket.assignee.id) : ""}
              options={agentOptions}
              onChange={(v) => onUpdateAssignee(ticket.id, v ? parseInt(v, 10) : null)}
              leadingIcon={<User className="h-3 w-3 text-gray-500 shrink-0" />}
              placeholder="—"
              allowUnset
              unsetLabel="—"
              assignedAgentId={ticket.assignee?.id}
              fallbackLabel={ticket.assignee?.name || undefined}
            />
          </div>
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
