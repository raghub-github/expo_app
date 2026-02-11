"use client";

import Link from "next/link";
import { Clock, User, AlertCircle, FolderGit2 } from "lucide-react";
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
}: TicketGridCardProps) {
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !["closed", "resolved"].includes(ticket.status);

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
          <Link
            href={`/dashboard/tickets/${ticket.id}`}
            className="flex-1 min-w-0 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-medium text-gray-700">
                {ticket.ticketNumber}
              </span>
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
            <h3 className="font-medium text-gray-900 text-sm line-clamp-2 leading-tight">
              {ticket.subject}
            </h3>
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
          </Link>
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
          <div className="flex items-center w-full gap-0">
            <div className="flex items-center min-w-0 flex-1">
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
            <span className="shrink-0 text-gray-400 text-[10px] mx-0.5 leading-none">/</span>
            <div className="flex items-center min-w-0 flex-1">
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
