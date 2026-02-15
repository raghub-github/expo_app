"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useUnifiedTickets, type UnifiedTicket, type UnifiedTicketFilters } from "@/hooks/tickets/useUnifiedTickets";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "PENDING", label: "Pending" },
];
const PRIORITY_OPTIONS = [
  { value: "", label: "All priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
  { value: "CRITICAL", label: "Critical" },
];

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityBadgeClass(priority: string): string {
  const p = priority.toUpperCase();
  if (p === "URGENT" || p === "CRITICAL") return "bg-red-100 text-red-800";
  if (p === "HIGH") return "bg-orange-100 text-orange-800";
  if (p === "MEDIUM") return "bg-blue-100 text-blue-800";
  if (p === "LOW") return "bg-gray-100 text-gray-800";
  return "bg-gray-100 text-gray-700";
}

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "OPEN" || s === "PENDING") return "bg-amber-100 text-amber-800";
  if (s === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (s === "RESOLVED") return "bg-green-100 text-green-800";
  if (s === "CLOSED") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function UnifiedTicketsList() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const filters: UnifiedTicketFilters = useMemo(
    () => ({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sortBy: "created_at",
      sortOrder: "desc",
      ...(statusFilter ? { statuses: [statusFilter] } : {}),
      ...(priorityFilter ? { priorities: [priorityFilter] } : {}),
      ...(searchApplied ? { searchQuery: searchApplied } : {}),
    }),
    [page, pageSize, statusFilter, priorityFilter, searchApplied]
  );

  const { data, isLoading, error, refetch, isFetching } = useUnifiedTickets(filters);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const from = data ? (page - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(page * pageSize, data.total) : 0;

  const applySearch = () => setSearchApplied(searchInput.trim());
  const clearSearch = () => {
    setSearchInput("");
    setSearchApplied("");
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
        <LoadingSpinner />
        <p className="text-sm text-gray-500">Loading unified tickets…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center rounded-lg border border-red-200 bg-red-50">
        <p className="text-red-700 font-medium">Failed to load unified tickets</p>
        <p className="text-sm text-red-600 mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const tickets: UnifiedTicket[] = data?.tickets ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200 bg-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search ticket ID, subject…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="button"
            onClick={applySearch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
          {searchApplied && (
            <button type="button" onClick={clearSearch} className="text-sm text-gray-500 hover:text-gray-700">
              Clear
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border-x border-b border-gray-200 rounded-b-lg bg-white">
        {tickets.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No unified tickets found. Adjust filters or create tickets in the unified_tickets table.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type / Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service / Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned to</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raised by</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{t.ticketId || t.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={t.subject}>{t.subject || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <span className="block">{t.ticketType?.replace(/_/g, " ") || "—"}</span>
                    <span className="block text-xs text-gray-500">{t.ticketSource?.replace(/_/g, " ") || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <span className="block">{t.serviceType || "—"}</span>
                    <span className="block text-xs text-gray-500">{t.ticketCategory?.replace(/_/g, " ") || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(t.priority)}`}>
                      {t.priority?.replace(/_/g, " ") || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(t.status)}`}>
                      {t.status?.replace(/_/g, " ") || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.assignedToAgentName || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.raisedByName || t.raisedByEmail || t.raisedByMobile || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 bg-white rounded-b-lg">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{from}</span> to <span className="font-medium">{to}</span> of <span className="font-medium">{total}</span> tickets
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
