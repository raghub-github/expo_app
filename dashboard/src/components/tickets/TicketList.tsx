"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check, Download, LayoutList, LayoutGrid, UserPlus, UserMinus, CheckCircle, RefreshCw, Link2, Merge, Ban, Trash2, PanelRightOpen, PanelRightClose } from "lucide-react";
import { useTickets } from "@/hooks/tickets/useTickets";
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

export function TicketList() {
  const { filters, appliedFilters, updateFilter } = useTicketFilters();
  const rightSidebar = useRightSidebar();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [viewMode, setViewMode] = useState<TicketViewMode>("list");
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

  const [agents, setAgents] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);
  const [refData, setRefData] = useState<{ statuses: Option[]; priorities: Option[]; groups: Array<{ id: number; groupCode: string; groupName: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/tickets/agents", { credentials: "include" })
      .then((r) => {
        if (!r.ok) {
          console.error("[TicketList] Failed to fetch agents:", r.status, r.statusText);
          return { success: false, error: `HTTP ${r.status}` };
        }
        return r.json();
      })
      .then((d) => {
        if (d.success && d.data) {
          if (d.data.agents) {
            setAgents(d.data.agents);
          } else {
            setAgents([]);
          }
          if (d.data.currentUser) {
            setCurrentUser({ id: d.data.currentUser.id, name: d.data.currentUser.name || "Me" });
          } else {
            setCurrentUser(null);
          }
        } else {
          setAgents([]);
          setCurrentUser(null);
        }
      })
      .catch((err) => {
        console.error("[TicketList] Error fetching agents:", err);
        setAgents([]);
        setCurrentUser(null);
      });
  }, []);
  useEffect(() => {
    fetch("/api/tickets/reference-data", { credentials: "include" })
      .then((r) => {
        if (!r.ok) {
          console.error("[TicketList] Failed to fetch reference data:", r.status, r.statusText);
          return { success: false, error: `HTTP ${r.status}` };
        }
        return r.json();
      })
      .then((d) => {
        if (d.success && d.data) {
          setRefData({
            statuses: d.data.statuses || [],
            priorities: d.data.priorities || [],
            groups: d.data.groups || [],
          });
        } else {
          setRefData({ statuses: [], priorities: [], groups: [] });
        }
      })
      .catch((err) => {
        console.error("[TicketList] Error fetching reference data:", err);
        setRefData({ statuses: [], priorities: [], groups: [] });
      });
  }, []);

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

  const queryFilters = useMemo(
    () => ({
      ...appliedFilters,
      limit,
      offset,
    }),
    [appliedFilters, limit, offset]
  );

  const { data, isLoading, error } = useTickets(queryFilters);

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

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const start = data.total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, data.total);
  const pageNumbers = getPageNumbers(totalPages, page);

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
  const handleBulkClose = () => handleBulkStatus("closed");
  const handleBulkSpam = () => handleBulkStatus("rejected");
  const handleBulkUpdateApply = (updates: { priority?: string; status?: string; groupId?: number | null; assigneeId?: number | null }) => {
    selectedIds.forEach((id) => {
      const payload: Parameters<typeof updateTicket.mutate>[0] = { ticketId: id };
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.groupId !== undefined) payload.groupId = updates.groupId;
      if (updates.assigneeId !== undefined) payload.currentAssigneeUserId = updates.assigneeId ?? null;
      updateTicket.mutate(payload);
    });
    setBulkUpdateOpen(false);
    setSelectedIds(new Set());
  };
  const handleExportSelected = () => {
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
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar - sticky at top when scrolling, compact height */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-1.5 border-b border-gray-200 bg-white px-3 py-1.5 sm:px-4 shadow-sm">
        {/* Sort by: combined dropdown (criteria + order) */}
        <div className="relative flex items-center gap-1.5 text-xs sm:text-sm text-gray-600" ref={sortDropdownRef}>
          <span className="hidden sm:inline font-medium text-gray-700">Sort by:</span>
          <button
            type="button"
            onClick={() => setSortDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-expanded={sortDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Sort options"
          >
            {filters.sortBy === "created_at" && "Date created"}
            {filters.sortBy === "updated_at" && "Last modified"}
            {filters.sortBy === "sla_due_at" && "Due by"}
            {filters.sortBy === "priority" && "Priority"}
            {filters.sortBy === "status" && "Status"}
            <span className="text-gray-400">·</span>
            {filters.sortOrder === "asc" ? "Ascending" : "Descending"}
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
                  aria-selected={filters.sortBy === opt.value}
                  onClick={() => {
                    updateFilter("sortBy", opt.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    filters.sortBy === opt.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={filters.sortBy === opt.value ? "font-medium" : ""}>{opt.label}</span>
                  {filters.sortBy === opt.value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
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
                  aria-selected={filters.sortOrder === opt.value}
                  onClick={() => {
                    updateFilter("sortOrder", opt.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    filters.sortOrder === opt.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={filters.sortOrder === opt.value ? "font-medium" : ""}>{opt.label}</span>
                  {filters.sortOrder === opt.value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
          <div className="flex items-center rounded border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded p-1 ${viewMode === "list" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              title="List view"
              aria-label="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded p-1 ${viewMode === "grid" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
          {/* Right sidebar toggle */}
          {rightSidebar && (
            <button
              type="button"
              onClick={rightSidebar.onToggle}
              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
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

      {/* Bulk actions bar - sticky below toolbar when visible */}
      {someSelected && (
        <div className="sticky top-12 z-10 flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50/90 px-3 py-1.5 text-sm shadow-sm">
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
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
                currentUserId={currentUser?.id}
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
                  currentUserId={currentUser?.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom pagination - sticky at bottom when scrolling, compact height */}
      <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white px-3 py-2 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
        {/* Left: Showing X / page dropdown */}
        <div className="relative" ref={pageSizeDropdownRef}>
          <button
            type="button"
            onClick={() => setPageSizeDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className={`flex h-8 min-w-[2rem] items-center justify-center rounded-md border text-xs font-medium ${
                    page === item
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
