"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { ChevronLeft, ChevronRight, ChevronDown, Check, Download, LayoutList, LayoutGrid, UserPlus, UserMinus, CheckCircle, RefreshCw, Link2, Merge, Ban, Trash2, PanelRightOpen, PanelRightClose } from "lucide-react";
import { useTickets } from "@/hooks/tickets/useTickets";
import { useTicketsRealtime } from "@/hooks/tickets/useTicketsRealtime";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { TicketCard } from "./TicketCard";
import { TicketListRow } from "./TicketListRow";
import { TicketGridCard } from "./TicketGridCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import { useRightSidebar } from "@/context/RightSidebarContext";
import type { Option } from "./InlineSearchableSelect";
import { BulkUpdateModal } from "./BulkUpdateModal";

export type TicketViewMode = "list" | "grid";

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;

/** Build page numbers to show: [1, 2, 3, 4, 5, 'ellipsis', last] etc. */
function getPageNumbers(totalPages: number, currentPage: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [];
  const showLeft = currentPage <= 4;
  const showRight = currentPage >= totalPages - 3;
  if (showLeft) {
    for (let i = 1; i <= Math.min(5, totalPages); i++) pages.push(i);
    if (totalPages > 6) pages.push("ellipsis", totalPages);
  } else if (showRight) {
    pages.push(1, "ellipsis");
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages);
  }
  return pages;
}

/** Shared debounced value hook (must be defined at module scope to avoid hook ordering issues). */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function TicketList() {
  const { filters, appliedFilters, updateFilter, applySort } = useTicketFilters();
  const rightSidebar = useRightSidebar();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [viewMode, setViewModeState] = useState<TicketViewMode>("list");
  const setViewMode = useCallback((mode: TicketViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem("dashboard-tickets-view-mode", mode); } catch {}
  }, []);
  useLayoutEffect(() => {
    const s = localStorage.getItem("dashboard-tickets-view-mode");
    if (s === "grid" || s === "list") setViewModeState(s);
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageSizeDropdownOpen, setPageSizeDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [linkToParentOpen, setLinkToParentOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const pageSizeDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const updateTicket = useTicketUpdate();

  const { data: agentsData } = useTicketsAgentsQuery();
  const { data: refDataRaw } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  const currentUser = agentsData?.currentUser
    ? { id: agentsData.currentUser.id, name: agentsData.currentUser.name || "Me" }
    : null;
  const refData = refDataRaw
    ? { statuses: refDataRaw.statuses as Option[], priorities: refDataRaw.priorities as Option[], groups: refDataRaw.groups }
    : { statuses: [] as Option[], priorities: [] as Option[], groups: [] as Array<{ id: number; groupCode: string; groupName: string }> };

  useEffect(() => {
    setPage(1);
  }, [appliedFilters, pageSize]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, appliedFilters]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (pageSizeDropdownRef.current && !pageSizeDropdownRef.current.contains(target)) {
        setPageSizeDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(target)) {
        setSortDropdownOpen(false);
      }
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(target)) {
        setAssignDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const limit = pageSize;
  const offset = (page - 1) * limit;

  const debouncedSearchQuery = useDebouncedValue(appliedFilters.searchQuery, 400);

  const queryFilters = useMemo(
    () => ({
      ...appliedFilters,
      searchQuery: debouncedSearchQuery,
      limit,
      offset,
    }),
    [appliedFilters, debouncedSearchQuery, limit, offset]
  );

  const { data, isLoading, error, refetch } = useTickets(queryFilters);
  const currentTotal = data?.total ?? 0;
  const { hasNewTickets, newTicketsCount, clearNewTickets } = useTicketsRealtime(currentTotal);

  const handleLoadNewTickets = useCallback(() => {
    refetch();
    clearNewTickets();
  }, [refetch, clearNewTickets]);

  // All hooks must be called before any conditional returns
  // Match filter sidebar: Unassigned + Me (current user) + all API agents
  const agentOptions: Option[] = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...(currentUser ? [{ value: "me", label: currentUser.name }] : []),
      ...agents.map((a) => ({ value: String(a.id), label: a.name || a.email || `Agent ${a.id}` })),
    ],
    [agents, currentUser]
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
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <LoadingSpinner />
        <p className="text-sm text-gray-500">Loading tickets…</p>
        <p className="text-xs text-gray-400">If this takes too long, check the network tab or try refreshing.</p>
      </div>
    );
  }

  const inlineErrorMessage = error instanceof Error ? error.message : "Unknown error";
  const hasCachedData = Boolean(data);

  // Non-blocking error UX: if we have cached/snapshot data, keep rendering the UI
  // and show an inline retry banner. Only block when we have nothing to show.
  if (error && !hasCachedData) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">Failed to load tickets</p>
        <p className="text-sm text-gray-600 mt-2">{inlineErrorMessage}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const showInlineError = Boolean(error && hasCachedData);

  if (!data || data.tickets.length === 0) {
    return (
      <div className="p-8 text-center">
        {showInlineError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left">
            <p className="text-sm font-medium text-red-700">Failed to refresh tickets</p>
            <p className="text-xs text-red-600 mt-1">{inlineErrorMessage}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}
        <p className="text-gray-500">No tickets found matching your filters.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const start = data.total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, data.total);
  const pageNumbers = getPageNumbers(totalPages, page);

  const onSelect = useCallback((ticketId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);
  const selectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(data.tickets.map((t) => t.id)));
      else setSelectedIds(new Set());
    },
    [data.tickets]
  );
  const allSelected = data.tickets.length > 0 && selectedIds.size === data.tickets.length;
  const someSelected = selectedIds.size > 0;

  const handleUpdatePriority = useCallback(
    (ticketId: number, priority: string) => {
      updateTicket.mutate({ ticketId, priority });
    },
    [updateTicket]
  );
  const handleUpdateGroup = useCallback(
    (ticketId: number, groupId: number | null) => {
      updateTicket.mutate({ ticketId, groupId });
    },
    [updateTicket]
  );
  const handleUpdateAssignee = useCallback(
    (ticketId: number, userId: number | null) => {
      updateTicket.mutate({ ticketId, currentAssigneeUserId: userId });
    },
    [updateTicket]
  );
  const handleUpdateStatus = useCallback(
    (ticketId: number, status: string) => {
      updateTicket.mutate({ ticketId, status });
    },
    [updateTicket]
  );

  const handleBulkAssign = useCallback(
    (userId: number) => {
      selectedIds.forEach((id) =>
        updateTicket.mutate({ ticketId: id, currentAssigneeUserId: userId })
      );
      setSelectedIds(new Set());
    },
    [selectedIds, updateTicket]
  );
  const handleBulkUnassign = useCallback(() => {
    selectedIds.forEach((id) =>
      updateTicket.mutate({ ticketId: id, currentAssigneeUserId: null })
    );
    setSelectedIds(new Set());
  }, [selectedIds, updateTicket]);
  const handleBulkStatus = useCallback(
    (status: string) => {
      selectedIds.forEach((id) => updateTicket.mutate({ ticketId: id, status }));
      setSelectedIds(new Set());
    },
    [selectedIds, updateTicket]
  );
  const handleBulkClose = useCallback(() => handleBulkStatus("closed"), [handleBulkStatus]);
  const handleBulkSpam = useCallback(() => handleBulkStatus("rejected"), [handleBulkStatus]);
  const handleBulkUpdateApply = useCallback(
    (updates: {
      priority?: string;
      status?: string;
      groupId?: number | null;
      assigneeId?: number | null;
    }) => {
      selectedIds.forEach((id) => {
        const payload: Parameters<(typeof updateTicket)["mutate"]>[0] = { ticketId: id };
        if (updates.priority !== undefined) payload.priority = updates.priority;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.groupId !== undefined) payload.groupId = updates.groupId;
        if (updates.assigneeId !== undefined)
          payload.currentAssigneeUserId = updates.assigneeId ?? null;
        updateTicket.mutate(payload);
      });
      setBulkUpdateOpen(false);
      setSelectedIds(new Set());
    },
    [selectedIds, updateTicket]
  );
  const handleExportSelected = useCallback(() => {
    const selected = data.tickets.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    const headers = ["Ticket #", "Subject", "Status", "Priority", "Assignee", "Group", "Created"];
    const rows = selected.map((t) => [
      t.ticketNumber,
      t.subject ?? "",
      t.status,
      t.priority,
      t.assignee?.name ?? t.assignee?.email ?? "",
      t.group?.name ?? "",
      t.createdAt ? new Date(t.createdAt).toISOString() : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data.tickets, selectedIds]);

  const ROW_HEIGHT = 72;

  const VirtualRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const ticket = data.tickets[index];
      if (!ticket) return null;

      return (
        <div style={style}>
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
            currentUserId={currentUser?.id}
          />
        </div>
      );
    },
    [
      data.tickets,
      selectedIds,
      onSelect,
      handleUpdatePriority,
      handleUpdateGroup,
      handleUpdateAssignee,
      handleUpdateStatus,
      priorityOptions,
      groupOptions,
      agentOptions,
      statusOptions,
      currentUser?.id,
    ]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white overflow-hidden">
      {showInlineError && (
        <div className="px-3 py-2 border-b border-red-100 bg-red-50 text-red-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Failed to refresh tickets</p>
            <p className="text-xs text-red-600 truncate">{inlineErrorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )}
      {/* Toolbar: fixed 3-column layout so Sort by position never changes */}
      <div className="flex-shrink-0 flex items-center gap-2 border-b border-gray-200/90 bg-white px-3 py-2">
        {/* Left: Sort by - fixed position */}
        <div className="relative flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 shrink-0" ref={sortDropdownRef}>
          <span className="hidden sm:inline font-medium text-gray-700">Sort by:</span>
          <button
            type="button"
            onClick={() => setSortDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            aria-expanded={sortDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Sort options"
          >
            {appliedFilters.sortBy === "created_at" && "Date created"}
            {appliedFilters.sortBy === "updated_at" && "Last modified"}
            {appliedFilters.sortBy === "sla_due_at" && "Due by"}
            {appliedFilters.sortBy === "priority" && "Priority"}
            {appliedFilters.sortBy === "status" && "Status"}
            <span className="text-gray-400">·</span>
            {appliedFilters.sortOrder === "asc" ? "Ascending" : "Descending"}
            <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${sortDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {sortDropdownOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0"
              role="listbox"
            >
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sort by
              </div>
              {[
                { value: "created_at", label: "Date created" },
                { value: "updated_at", label: "Last modified" },
                { value: "sla_due_at", label: "Due by" },
                { value: "priority", label: "Priority" },
                { value: "status", label: "Status" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={appliedFilters.sortBy === opt.value}
                  onClick={() => {
                    setSortDropdownOpen(false);
                    // Date created: default to Descending so latest tickets show first
                    const order = opt.value === "created_at" ? "desc" : appliedFilters.sortOrder;
                    applySort(opt.value, order);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    appliedFilters.sortBy === opt.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={appliedFilters.sortBy === opt.value ? "font-medium" : ""}>{opt.label}</span>
                  {appliedFilters.sortBy === opt.value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              ))}
              <div className="my-1 border-t border-gray-200" />
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Order
              </div>
              {[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={appliedFilters.sortOrder === opt.value}
                  onClick={() => {
                    setSortDropdownOpen(false);
                    applySort(appliedFilters.sortBy, opt.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    appliedFilters.sortOrder === opt.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={appliedFilters.sortOrder === opt.value ? "font-medium" : ""}>{opt.label}</span>
                  {appliedFilters.sortOrder === opt.value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: New Updated button (Freshdesk style) - only when there are new/updated tickets */}
        <div className="flex-1 flex justify-center items-center min-w-0">
          {hasNewTickets && (
            <button
              type="button"
              onClick={handleLoadNewTickets}
              className="inline-flex items-center gap-2 rounded-full border border-blue-400 bg-gray-100 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-gray-200 hover:border-blue-500 transition-colors shrink-0 shadow-sm"
              aria-label={`Load ${newTicketsCount} new update${newTicketsCount !== 1 ? "s" : ""}`}
            >
              <RefreshCw className="h-4 w-4 text-blue-600" />
              {newTicketsCount} update{newTicketsCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>

        {/* Right: Page info, view toggles, Export */}
        <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
          <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap" aria-live="polite">
            Page {page} of {Math.max(1, Math.ceil(currentTotal / pageSize) || 1)}
            {" · "}
            Showing {currentTotal === 0 ? "0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, currentTotal)}`} of {currentTotal}
          </span>
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              title="List view"
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          {/* Right sidebar toggle */}
          {rightSidebar && (
            <button
              type="button"
              onClick={rightSidebar.onToggle}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              title={rightSidebar.isOpen ? "Hide filters" : "Open filters"}
            >
              {rightSidebar.isOpen ? (
                <>
                  <PanelRightClose className="h-3 w-3" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="h-3 w-3" />
                  <span>Open</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions bar when visible */}
      {someSelected && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50/90 px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => selectAll(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label="Select all on page"
          />
          <span className="font-medium text-blue-900">{selectedIds.size} selected</span>
          <div className="h-5 w-px bg-blue-200" aria-hidden />
          <div className="relative" ref={assignDropdownRef}>
            <button
              type="button"
              onClick={() => setAssignDropdownOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-blue-100"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Assign
              <ChevronDown className={`h-3.5 w-3.5 ${assignDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {assignDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {agentOptions.filter((o) => o.value !== "").map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      if (o.value === "me" && currentUser) handleBulkAssign(currentUser.id);
                      else { const id = parseInt(o.value, 10); if (!Number.isNaN(id)) handleBulkAssign(id); }
                      setAssignDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { handleBulkUnassign(); setAssignDropdownOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Unassign
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleBulkClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Close
          </button>
          <button
            type="button"
            onClick={() => setBulkUpdateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Bulk update
          </button>
          <button
            type="button"
            onClick={() => setLinkToParentOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link to a parent
          </button>
          <button
            type="button"
            onClick={() => setMergeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Merge className="h-3.5 w-3.5" />
            Merge
          </button>
          <button
            type="button"
            onClick={handleBulkSpam}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Spam
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleExportSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs font-medium text-blue-700 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Bulk update modal */}
      <BulkUpdateModal
        isOpen={bulkUpdateOpen}
        onClose={() => setBulkUpdateOpen(false)}
        count={selectedIds.size}
        onApply={handleBulkUpdateApply}
        priorityOptions={priorityOptions}
        statusOptions={statusOptions}
        groupOptions={groupOptions}
        agentOptions={agentOptions}
        currentUserId={currentUser?.id}
      />

      {/* Link to parent - placeholder */}
      {linkToParentOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setLinkToParentOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Link to a parent</h3>
            <p className="mt-2 text-sm text-gray-600">Link selected tickets to a parent ticket. This feature will be available when parent-child ticket linking is supported in the API.</p>
            <button type="button" onClick={() => setLinkToParentOpen(false)} className="mt-4 w-full rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
          </div>
        </div>
      )}

      {/* Merge - placeholder */}
      {mergeOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setMergeOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Merge tickets</h3>
            <p className="mt-2 text-sm text-gray-600">Merge selected tickets into one. This feature will be available when merge is supported in the API.</p>
            <button type="button" onClick={() => setMergeOpen(false)} className="mt-4 w-full rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
          </div>
        </div>
      )}

      {/* Delete confirm - no API yet */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Delete tickets?</h3>
            <p className="mt-2 text-sm text-gray-600">Bulk delete is not yet available. You can close tickets or mark as rejected (Spam) instead. Delete API will be added in a future update.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket List or Grid - scrollable area */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-visible ${viewMode === "grid" ? "p-4" : ""}`}
      >
        {viewMode === "list" ? (
          <div className="w-full relative" style={{ overflow: "visible" }}>
            {/* List header row - compact, single line */}
            <div className="flex items-center gap-1.5 border-b border-gray-200 bg-slate-50/90 pl-2 pr-1 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              <div className="shrink-0 w-[14px] flex justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label="Select all on page"
                />
              </div>
              <div className="w-6 shrink-0" />
              <div className="flex-1 min-w-0 truncate">Ticket</div>
              <div className="shrink-0 w-[260px] min-w-[260px] mr-6 text-left">
                <span className="text-gray-500 text-[11px] font-medium">Priority · Group/Agent · Status</span>
              </div>
            </div>
            <List
              height={Math.min(
                600,
                Math.max(ROW_HEIGHT * 3, data.tickets.length * ROW_HEIGHT)
              )}
              itemCount={data.tickets.length}
              itemSize={ROW_HEIGHT}
              width="100%"
            >
              {VirtualRow}
            </List>
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
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3"
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
                  currentUserId={currentUser?.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination footer - fixed at very bottom of ticket list area */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] rounded-b-lg">
        {/* Left: Showing X / page dropdown */}
        <div className="relative" ref={pageSizeDropdownRef}>
          <button
            type="button"
            onClick={() => setPageSizeDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            aria-expanded={pageSizeDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Items per page"
          >
            Showing {pageSize} / page
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-500 transition-transform ${pageSizeDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
          {pageSizeDropdownOpen && (
            <div
              className="absolute left-0 bottom-full z-[100] mb-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={pageSize === size}
                  onClick={() => {
                    setPageSize(size);
                    setPage(1);
                    setPageSizeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    pageSize === size ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {pageSize === size && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                  <span className={pageSize === size ? "font-medium" : ""}>{size} / page</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Prev, page numbers, Next */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-0.5">
            {pageNumbers.map((item, idx) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-8 w-8 items-center justify-center text-gray-400 text-xs"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  className={`flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                    page === item
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  aria-label={page === item ? `Page ${item} (current)` : `Go to page ${item}`}
                  aria-current={page === item ? "page" : undefined}
                >
                  {item}
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
