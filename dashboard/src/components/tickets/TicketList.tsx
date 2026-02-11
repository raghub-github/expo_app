"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LayoutList, LayoutGrid, UserMinus } from "lucide-react";
import { useTickets } from "@/hooks/tickets/useTickets";
import { TicketCard } from "./TicketCard";
import { TicketListRow } from "./TicketListRow";
import { TicketGridCard } from "./TicketGridCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import type { Option } from "./InlineSearchableSelect";

export type TicketViewMode = "list" | "grid";

export function TicketList() {
  const { filters, updateFilter } = useTicketFilters();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [viewMode, setViewMode] = useState<TicketViewMode>("list");
  const [debouncedSearch, setDebouncedSearch] = useState(filters.searchQuery);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const updateTicket = useTicketUpdate();

  const [agents, setAgents] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [refData, setRefData] = useState<{ statuses: Option[]; priorities: Option[]; groups: Array<{ id: number; groupCode: string; groupName: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/tickets/agents")
      .then((r) => {
        if (!r.ok) {
          console.error("[TicketList] Failed to fetch agents:", r.status, r.statusText);
          return { success: false, error: `HTTP ${r.status}` };
        }
        return r.json();
      })
      .then((d) => {
        if (d.success && d.data?.agents) {
          console.log("[TicketList] Loaded agents:", d.data.agents.length);
          setAgents(d.data.agents);
        } else {
          console.error("[TicketList] Agents API returned error:", d.error || "Unknown error");
          setAgents([]);
        }
      })
      .catch((err) => {
        console.error("[TicketList] Error fetching agents:", err);
        setAgents([]);
      });
  }, []);
  useEffect(() => {
    fetch("/api/tickets/reference-data")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setRefData({
            statuses: d.data.statuses || [],
            priorities: d.data.priorities || [],
            groups: d.data.groups || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.searchQuery), 300);
    return () => clearTimeout(timer);
  }, [filters.searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, filters]);

  const limit = pageSize;
  const offset = (page - 1) * limit;

  const queryFilters = useMemo(
    () => ({
      ...filters,
      searchQuery: debouncedSearch,
      limit,
      offset,
    }),
    [filters, debouncedSearch, limit, offset]
  );

  const { data, isLoading, error } = useTickets(queryFilters);

  // All hooks must be called before any conditional returns
  const agentOptions: Option[] = useMemo(
    () => [
      ...agents.map((a) => ({ value: String(a.id), label: a.name || a.email || `Agent ${a.id}` })),
    ],
    [agents]
  );
  const priorityOptions = refData?.priorities ?? [];
  const groupOptions: Option[] = useMemo(() => {
    // Only show actual groups from database, no fallback to service names
    return (refData?.groups || []).map((g) => ({ value: String(g.id), label: g.groupName }));
  }, [refData?.groups]);
  const statusOptions = refData?.statuses ?? [];

  // Now safe to do conditional returns
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">Failed to load tickets</p>
        <p className="text-sm text-gray-600 mt-2">{error instanceof Error ? error.message : "Unknown error"}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.tickets.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">No tickets found matching your filters.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / limit);
  const start = offset + 1;
  const end = Math.min(offset + limit, data.total);

  const onSelect = (ticketId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  };
  const selectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(data.tickets.map((t) => t.id)));
    else setSelectedIds(new Set());
  };
  const allSelected = data.tickets.length > 0 && selectedIds.size === data.tickets.length;
  const someSelected = selectedIds.size > 0;

  const handleUpdatePriority = (ticketId: number, priority: string) => {
    updateTicket.mutate({ ticketId, priority });
  };
  const handleUpdateGroup = (ticketId: number, groupId: number | null) => {
    updateTicket.mutate({ ticketId, groupId });
  };
  const handleUpdateAssignee = (ticketId: number, userId: number | null) => {
    updateTicket.mutate({ ticketId, currentAssigneeUserId: userId });
  };
  const handleUpdateStatus = (ticketId: number, status: string) => {
    updateTicket.mutate({ ticketId, status });
  };

  const handleBulkAssign = (userId: number) => {
    selectedIds.forEach((id) => updateTicket.mutate({ ticketId: id, currentAssigneeUserId: userId }));
    setSelectedIds(new Set());
  };
  const handleBulkUnassign = () => {
    selectedIds.forEach((id) => updateTicket.mutate({ ticketId: id, currentAssigneeUserId: null }));
    setSelectedIds(new Set());
  };
  const handleBulkStatus = (status: string) => {
    selectedIds.forEach((id) => updateTicket.mutate({ ticketId: id, status }));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar - compact, responsive */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
          <span className="hidden sm:inline">Sort by:</span>
          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter("sortBy", e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs sm:text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="created_at">Date created</option>
            <option value="updated_at">Last updated</option>
            <option value="sla_due_at">Due by</option>
          </select>
          <select
            value={filters.sortOrder}
            onChange={(e) => updateFilter("sortOrder", e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs sm:text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
          <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded p-1.5 ${viewMode === "list" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              title="List view"
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded p-1.5 ${viewMode === "grid" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <span className="text-xs text-gray-600">
            {start}-{end} of {data.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
          >
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Bulk actions bar - show for both list and grid when tickets selected */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-900">{selectedIds.size} selected</span>
          <select
            onChange={(e) => {
              const v = e.target.value;
              if (v) handleBulkAssign(parseInt(v, 10));
              e.target.value = "";
            }}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-800"
          >
            <option value="">Assign to...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkUnassign}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Unassign
          </button>
          <select
            onChange={(e) => {
              const v = e.target.value;
              if (v) handleBulkStatus(v);
              e.target.value = "";
            }}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-800"
          >
            <option value="">Update status...</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-700 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Ticket List or Grid - list: full width; grid: 4 columns, select-all header */}
      <div
        className={`flex-1 overflow-y-auto min-h-0 ${viewMode === "grid" ? "p-4" : ""}`}
        style={{ overflowX: "visible" }}
      >
        {viewMode === "list" ? (
          <div className="w-full relative" style={{ overflow: "visible" }}>
            {/* List header row - select all + column hints */}
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <div className="shrink-0 w-[18px] flex justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label="Select all on page"
                />
              </div>
              <div className="w-8 shrink-0" />
              <div className="flex-1 min-w-0">Ticket</div>
              <div className="shrink-0 w-[180px] text-left">
                <span className="text-gray-500 text-xs">Priority · Group/Agent · Status</span>
              </div>
            </div>
            {data.tickets.map((ticket) => (
              <TicketListRow
                key={ticket.id}
                ticket={ticket}
                selected={selectedIds.has(ticket.id)}
                onSelect={(checked) => onSelect(ticket.id, checked)}
                onUpdatePriority={handleUpdatePriority}
                onUpdateGroup={handleUpdateGroup}
                onUpdateAssignee={handleUpdateAssignee}
                onUpdateStatus={handleUpdateStatus}
                priorityOptions={priorityOptions}
                groupOptions={groupOptions}
                agentOptions={agentOptions}
                statusOptions={statusOptions}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Grid header - select all */}
            <div className="flex items-center gap-2 px-1 pb-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => selectAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="Select all on page"
              />
              <span>Select all</span>
              {someSelected && (
                <span className="text-blue-600 font-medium">
                  ({selectedIds.size} selected)
                </span>
              )}
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              style={{ overflow: "visible" }}
            >
              {data.tickets.map((ticket) => (
                <TicketGridCard
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedIds.has(ticket.id)}
                  onSelect={(checked) => onSelect(ticket.id, checked)}
                  onUpdatePriority={handleUpdatePriority}
                  onUpdateGroup={handleUpdateGroup}
                  onUpdateAssignee={handleUpdateAssignee}
                  onUpdateStatus={handleUpdateStatus}
                  priorityOptions={priorityOptions}
                  groupOptions={groupOptions}
                  agentOptions={agentOptions}
                  statusOptions={statusOptions}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t bg-white px-4 py-2 text-xs text-gray-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
