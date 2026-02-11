"use client";

import Link from "next/link";
import { Clock, User, AlertCircle, CheckCircle, XCircle, Circle } from "lucide-react";
import { Ticket } from "@/hooks/tickets/useTickets";
import type { TicketViewMode } from "./TicketList";
// Format date helper
function formatDistanceToNow(date: Date, options?: { addSuffix?: boolean }): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  
  return date.toLocaleDateString();
}

interface TicketCardProps {
  ticket: Ticket;
  variant?: TicketViewMode;
}

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  assigned: "bg-purple-100 text-purple-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  rejected: "bg-red-100 text-red-800",
  reopened: "bg-orange-100 text-orange-800",
};

const priorityColors: Record<string, string> = {
  low: "text-gray-600",
  medium: "text-blue-600",
  high: "text-orange-600",
  urgent: "text-red-600",
  critical: "text-red-800 font-bold",
};

const serviceTypeLabels: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Ride",
  other: "Other",
};

export function TicketCard({ ticket, variant = "list" }: TicketCardProps) {
  const isSlaBreached =
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt) < new Date() &&
    !["closed", "resolved"].includes(ticket.status);

  const isGrid = variant === "grid";

  return (
    <Link
      href={`/dashboard/tickets/${ticket.id}`}
      className={`block transition-colors ${
        isGrid
          ? "rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md"
          : "border-b border-gray-200 hover:bg-gray-50"
      }`}
    >
      <div className={isGrid ? "p-0" : "p-4"}>
        <div className={`flex items-start justify-between gap-4 ${isGrid ? "flex-col gap-2" : ""}`}>
          {/* Left Section */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-sm font-medium text-gray-900">
                {ticket.ticketNumber}
              </span>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  statusColors[ticket.status] || statusColors.open
                }`}
              >
                {ticket.status.replace("_", " ").toUpperCase()}
              </span>
              {ticket.isHighValueOrder && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
                  High Value
                </span>
              )}
              {isSlaBreached && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  SLA Breached
                </span>
              )}
            </div>

            <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">
              {ticket.subject}
            </h3>

            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {ticket.description}
            </p>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="capitalize">
                {serviceTypeLabels[ticket.serviceType] || ticket.serviceType}
              </span>
              <span className="capitalize">{ticket.ticketSection}</span>
              {ticket.orderId && (
                <span>Order #{ticket.orderId}</span>
              )}
              <span className={`font-medium ${priorityColors[ticket.priority] || priorityColors.medium}`}>
                {ticket.priority.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex flex-col items-end gap-2 text-xs text-gray-500">
            {ticket.assignee ? (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span className="max-w-[120px] truncate">{ticket.assignee.name}</span>
              </div>
            ) : (
              <span className="text-gray-400">Unassigned</span>
            )}

            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
