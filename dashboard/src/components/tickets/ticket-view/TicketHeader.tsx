"use client";

import { Clock, AlertCircle } from "lucide-react";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  assigned: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  rejected: "bg-red-100 text-red-800",
  reopened: "bg-orange-100 text-orange-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-900",
};

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
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatSla(slaDueAt: string | null): string {
  if (!slaDueAt) return "";
  const due = new Date(slaDueAt);
  const now = new Date();
  if (due < now) return `Overdue ${formatTimeAgo(slaDueAt)}`;
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor((diffMs % 3600000) / 60000);
  if (diffHours >= 24) return `Due in ${Math.floor(diffHours / 24)}d`;
  return `Due in ${diffHours}h ${diffMins}m`;
}

export function TicketHeader({ ticket }: { ticket: TicketDetail }) {
  const statusKey = (ticket.status || "open").toLowerCase().replace(/\s+/g, "_");
  const priorityKey = (ticket.priority || "medium").toLowerCase();
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !["closed", "resolved"].includes((ticket.status || "").toLowerCase());

  const sourceLabel =
    ticket.sourceRole != null
      ? String(ticket.sourceRole).replace(/_/g, " ")
      : "—";
  const sectionLabel =
    ticket.ticketSection != null
      ? String(ticket.ticketSection).charAt(0).toUpperCase() + String(ticket.ticketSection).slice(1)
      : "";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h1 className="text-lg font-semibold text-gray-900">
        {ticket.subject || ticket.title?.titleText || "No subject"}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-gray-500">#{ticket.ticketNumber || ticket.id}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[statusKey] ?? "bg-gray-100 text-gray-700"}`}>
          {(ticket.status || "open").toUpperCase().replace(/_/g, " ")}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priorityKey] ?? "bg-gray-100 text-gray-700"}`}>
          {(ticket.priority || "medium").toUpperCase()}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600">
        <span>Created {formatTimeAgo(ticket.createdAt)}</span>
        {sectionLabel && <span>via {sectionLabel}</span>}
        {sourceLabel && sourceLabel !== "—" && <span>Source: {sourceLabel}</span>}
        {ticket.slaDueAt && (
          <span className={isSlaBreached ? "flex items-center gap-1 font-medium text-red-600" : "flex items-center gap-1"}>
            {isSlaBreached && <AlertCircle className="h-4 w-4" />}
            <Clock className="h-4 w-4" />
            {formatSla(ticket.slaDueAt)}
          </span>
        )}
      </div>
    </div>
  );
}
