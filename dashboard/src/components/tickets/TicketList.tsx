"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";

import { ChevronLeft, ChevronRight, ChevronDown, Check, Download, LayoutList, LayoutGrid, UserPlus, UserMinus, CheckCircle, RefreshCw, Link2, Merge, Ban, PanelRightOpen, PanelRightClose } from "lucide-react";
import { useTickets, fetchTickets, compactTicketFilters, type TicketFilters } from "@/hooks/tickets/useTickets";
import { useTicketsRealtime } from "@/hooks/tickets/useTicketsRealtime";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { playQueueAssignmentSound } from "@/lib/tickets/play-queue-assignment-sound";
import { TicketListRow } from "./TicketListRow";
import { TicketGridCard } from "./TicketGridCard";
import { TicketsPageSkeleton } from "@/components/skeletons/TicketsPageSkeleton";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import {
  useTicketBulkUpdate,
  describeBulkOutcome,
  type BulkTicketUpdates,
} from "@/hooks/tickets/useTicketBulkUpdate";
import { useRightSidebar } from "@/context/RightSidebarContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { patchTicketInListCaches, invalidateTicketListCaches } from "@/lib/tickets/patch-ticket-list-cache";
import type { Option } from "./InlineSearchableSelect";
import { BulkUpdateModal } from "./BulkUpdateModal";
import { ExportTicketsModal } from "./ExportTicketsModal";
import { buildTicketDetailHref, TICKET_FROM_QUEUE_PARAM, ticketsPathTicketId } from "@/lib/tickets/ticket-path-utils";
import { useAuth } from "@/providers/AuthProvider";
import { TicketNum } from "./tickets-typography";

export type TicketViewMode = "list" | "grid";
type TicketScopeTab = "active" | "snoozed";

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

export function TicketList({ hideExportAndSidebarToggle = false }: { hideExportAndSidebarToggle?: boolean } = {}) {
  const pathname = useAppPathname();
  const isQueueHome = pathname === "/dashboard/tickets/queue/home";
  const searchParams = useAppSearchParams();
  const detailHrefForTicket = useCallback(
    (ticketId: number) => {
      if (isQueueHome) {
        const p = new URLSearchParams(searchParams.toString());
        p.set(TICKET_FROM_QUEUE_PARAM, "1");
        return buildTicketDetailHref(ticketId, p);
      }
      return buildTicketDetailHref(ticketId, searchParams);
    },
    [searchParams, isQueueHome]
  );
  const { filters, appliedFilters, appliedTicketFilterCount, updateFilter, applySort } = useTicketFilters();
  const rightSidebar = useRightSidebar();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [viewMode, setViewModeState] = useState<TicketViewMode>("list");
  useEffect(() => {
    try {
      const s = localStorage.getItem("dashboard-tickets-view-mode");
      if (s === "grid" || s === "list") setViewModeState(s);
    } catch {
      /* ignore */
    }
  }, []);
  const setViewMode = useCallback((mode: TicketViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem("dashboard-tickets-view-mode", mode); } catch {}
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageSizeDropdownOpen, setPageSizeDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [linkToParentOpen, setLinkToParentOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [scopeTab, setScopeTab] = useState<TicketScopeTab>("active");
  const autoSelectAllAfterPageSizeChangeRef = useRef(false);
  const pageSizeDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const updateTicket = useTicketUpdate();
  /** Multi-ticket edits go to /api/tickets/bulk-update, not N parallel PATCHes. */
  const bulkUpdate = useTicketBulkUpdate();
  const queryClient = useQueryClient();

  const { systemUser, permissions } = useAuth();

  /** Shared cache with header AgentStatusToggle — used for queue-home empty state when offline. */
  const { data: agentStatusRes, isFetched: agentStatusFetched } = useQuery<{
    success: boolean;
    data?: { currentStatus?: string; isOnline?: boolean };
  }>({
    queryKey: ["agentStatus"],
    queryFn: async () => {
      const res = await fetch("/api/agents/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    staleTime: 10_000,
  });
  // Match AgentStatusToggle: default missing status to offline so list chrome and queue body stay in sync.
  const queueResolvedAgentStatus = agentStatusRes?.data?.currentStatus || "offline";
  const queueHomeAgentOffline =
    isQueueHome && agentStatusFetched && queueResolvedAgentStatus === "offline";

  const { data: agentsData } = useTicketsAgentsQuery();
  const { data: refDataRaw } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  /** Prefer agents API name; fall back to auth bootstrap so queue list can fetch without waiting on /api/tickets/agents. */
  const authAgentId =
    systemUser?.id ??
    (typeof permissions?.systemUserId === "number" ? permissions.systemUserId : null);
  const currentUser = agentsData?.currentUser
    ? { id: agentsData.currentUser.id, name: agentsData.currentUser.name || "Me" }
    : authAgentId != null
      ? {
          id: authAgentId,
          name: systemUser?.fullName?.trim() || "Me",
        }
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

  useEffect(() => {
    if (!mergeOpen) return;
    const ids = Array.from(selectedIds);
    setMergeTargetId((prev) => (prev != null && ids.includes(prev) ? prev : ids[0] ?? null));
  }, [mergeOpen, selectedIds]);

  const limit = pageSize;
  const offset = (page - 1) * limit;

  const debouncedSearchQuery = useDebouncedValue(appliedFilters.searchQuery, 400);

  const queryFilters = useMemo((): TicketFilters => {
    const f = appliedFilters;
    const queueLocked = isQueueHome && currentUser != null;
    const assignedToIds = queueLocked
      ? [String(currentUser.id)]
      : f.assignedToIds.length
        ? f.assignedToIds
        : undefined;
    const statuses = queueLocked ? undefined : f.statuses.length ? f.statuses : undefined;

    return {
      serviceTypes: f.serviceTypes.length ? f.serviceTypes : undefined,
      ticketSection: f.ticketSection !== "all" ? f.ticketSection : undefined,
      statuses,
      priorities: f.priorities.length ? f.priorities : undefined,
      ticketCategory: f.ticketCategory !== "all" ? f.ticketCategory : undefined,
      assignedToIds,
      sourceRoles: f.sourceRoles.length ? f.sourceRoles : undefined,
      groupIds: f.groupIds.length ? f.groupIds : undefined,
      skill: f.skill.trim() ? f.skill : undefined,
      tags: f.tags.trim() ? f.tags : undefined,
      company: f.company.trim() ? f.company : undefined,
      dateFrom: f.dateFrom.trim() ? f.dateFrom : undefined,
      dateTo: f.dateTo.trim() ? f.dateTo : undefined,
      resolvedFrom: f.resolvedFrom.trim() ? f.resolvedFrom : undefined,
      resolvedTo: f.resolvedTo.trim() ? f.resolvedTo : undefined,
      closedFrom: f.closedFrom.trim() ? f.closedFrom : undefined,
      closedTo: f.closedTo.trim() ? f.closedTo : undefined,
      dueFrom: f.dueFrom.trim() ? f.dueFrom : undefined,
      dueTo: f.dueTo.trim() ? f.dueTo : undefined,
      searchQuery: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
      isHighValue: f.isHighValue === "true" ? "true" : undefined,
      slaBreach: f.slaBreach === "true" ? "true" : undefined,
      sortBy: f.sortBy || undefined,
      sortOrder: f.sortOrder || undefined,
      limit,
      offset,
      includeSnoozed: scopeTab === "snoozed",
      snoozedOnly: scopeTab === "snoozed",
      ...(queueLocked ? { queueScope: true } : {}),
    };
  }, [appliedFilters, debouncedSearchQuery, limit, offset, isQueueHome, currentUser?.id, scopeTab]);

  const updatesPollBase = useMemo(() => {
    const { limit: _l, offset: _o, ...rest } = queryFilters;
    return rest;
  }, [queryFilters]);

  /** Fetch immediately; only pause when status confirms the agent is offline (queue home). */
  const queueHomeTicketsEnabled = !isQueueHome || !queueHomeAgentOffline;
  const { data, isLoading, isPending, isError, isRefetchError, error, refetch } = useTickets(queryFilters, {
    enabled: queueHomeTicketsEnabled,
  });
  const [refreshErrorDismissed, setRefreshErrorDismissed] = useState(false);
  const activeCountFilters = useMemo<TicketFilters>(() => {
    const { limit: _l, offset: _o, includeSnoozed: _is, snoozedOnly: _so, ...base } = queryFilters;
    return {
      ...base,
      includeSnoozed: false,
      snoozedOnly: false,
      limit: 1,
      offset: 0,
    };
  }, [queryFilters]);
  const snoozedCountFilters = useMemo<TicketFilters>(() => {
    const { limit: _l, offset: _o, includeSnoozed: _is, snoozedOnly: _so, ...base } = queryFilters;
    return {
      ...base,
      includeSnoozed: true,
      snoozedOnly: true,
      limit: 1,
      offset: 0,
    };
  }, [queryFilters]);
  const cleanPath = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  /** List stays mounted under detail — pause polling/realtime while hidden. */
  const listVisible = ticketsPathTicketId(cleanPath) == null;
  const { data: activeCountData } = useQuery({
    queryKey: [...queryKeys.tickets.list(compactTicketFilters(activeCountFilters)), "countOnly"],
    queryFn: ({ signal }) => fetchTickets(activeCountFilters, signal),
    // Defer tab counts until the main list has data so cold load isn't 3x DB work.
    enabled: queueHomeTicketsEnabled && Boolean(data) && listVisible,
    staleTime: 15_000,
    refetchInterval: listVisible ? 45_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const { data: snoozedCountData } = useQuery({
    queryKey: [...queryKeys.tickets.list(compactTicketFilters(snoozedCountFilters)), "countOnly"],
    queryFn: ({ signal }) => fetchTickets(snoozedCountFilters, signal),
    enabled: queueHomeTicketsEnabled && Boolean(data) && listVisible,
    staleTime: 15_000,
    refetchInterval: listVisible ? 45_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const currentTotal = data?.total ?? 0;
  const activeCountDisplay = Number(activeCountData?.total ?? 0);
  const snoozedCountDisplay = Number(snoozedCountData?.total ?? 0);
  const listReadyForUpdates =
    Boolean(data) && !isLoading && !isPending && queueHomeTicketsEnabled;
  const { hasNewTickets, newTicketsCount, clearNewTickets } = useTicketsRealtime(
    updatesPollBase,
    listReadyForUpdates,
    listVisible
  );

  const { data: queueSoundCfg } = useQuery({
    queryKey: ["queueAssignmentSound"],
    queryFn: async (): Promise<{ enabled: boolean; soundUrl: string }> => {
      const res = await fetch("/api/tickets/queue-assignment-sound", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        success?: boolean;
        data?: { enabled?: boolean; soundUrl?: string };
      };
      if (!res.ok || !j.success) {
        return { enabled: true, soundUrl: "/notification.wav" };
      }
      return {
        enabled: j.data?.enabled !== false,
        soundUrl: String(j.data?.soundUrl ?? "/notification.wav"),
      };
    },
    staleTime: 60_000,
  });

  const queueSoundListKey = useMemo(
    () =>
      isQueueHome && currentUser
        ? `${page}-${pageSize}-${appliedTicketFilterCount}-${JSON.stringify(queryFilters)}`
        : "",
    [isQueueHome, currentUser, page, pageSize, appliedTicketFilterCount, queryFilters]
  );

  const queueSoundSeenRef = useRef<{ key: string; ids: Set<number> } | null>(null);
  /** Plays buzzer when activity badge count rises (assignments may not be on the current page). */
  const queueSoundLastBadgeCountRef = useRef(0);

  useEffect(() => {
    if (!isQueueHome || !queueSoundCfg?.enabled) {
      return;
    }
    const url = queueSoundCfg.soundUrl;
    if (!url?.startsWith("/")) return;
    const prev = queueSoundLastBadgeCountRef.current;
    if (newTicketsCount > prev) {
      playQueueAssignmentSound(url);
    }
    queueSoundLastBadgeCountRef.current = newTicketsCount;
  }, [isQueueHome, queueSoundCfg?.enabled, queueSoundCfg?.soundUrl, newTicketsCount]);

  useEffect(() => {
    if (!isQueueHome || !currentUser?.id || !queueSoundCfg?.enabled || data?.tickets == null) {
      return;
    }
    const url = queueSoundCfg.soundUrl;
    if (!url?.startsWith("/")) return;
    const key = queueSoundListKey;
    if (!key) return;

    const seenBag = queueSoundSeenRef.current;
    const currentIds = data.tickets.map((t) => t.id);

    if (!seenBag || seenBag.key !== key) {
      queueSoundSeenRef.current = { key, ids: new Set(currentIds) };
      return;
    }

    const { ids: seen } = seenBag;
    for (const id of currentIds) {
      if (!seen.has(id)) {
        seen.add(id);
        playQueueAssignmentSound(url);
      }
    }
  }, [data?.tickets, isQueueHome, currentUser?.id, queueSoundCfg?.enabled, queueSoundCfg?.soundUrl, queueSoundListKey]);

  useEffect(() => {
    if (!autoSelectAllAfterPageSizeChangeRef.current) return;
    if (!data || !Array.isArray(data.tickets)) return;
    setSelectedIds(new Set(data.tickets.map((t) => t.id)));
    autoSelectAllAfterPageSizeChangeRef.current = false;
  }, [data]);

  // Keep page within valid range when total shrinks after bulk actions.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [data?.total, page, pageSize]);

  // Expiry-driven refresh: as soon as the next visible snoozed ticket reaches snoozed_until,
  // refetch lists/counts so Active/Snoozed counts and rows move without waiting for poll cycle.
  useEffect(() => {
    if (!data || !Array.isArray(data.tickets) || data.tickets.length === 0) return;
    const now = Date.now();
    let minDelayMs: number | null = null;
    for (const t of data.tickets) {
      if (String(t.status).toLowerCase() !== "snoozed" || !t.snoozedUntil) continue;
      const endMs = new Date(t.snoozedUntil).getTime();
      if (!Number.isFinite(endMs)) continue;
      const delay = Math.max(0, endMs - now + 450);
      minDelayMs = minDelayMs == null ? delay : Math.min(minDelayMs, delay);
    }
    if (minDelayMs == null) return;
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
    }, minDelayMs);
    return () => window.clearTimeout(timer);
  }, [data, queryClient]);

  const inlineErrorMessage = error instanceof Error ? error.message : "Unknown error";
  const hasCachedData = Boolean(data);
  const showRefreshErrorModal =
    !refreshErrorDismissed &&
    ((isRefetchError && hasCachedData) || (isError && !hasCachedData));

  useEffect(() => {
    if (isError || isRefetchError) {
      setRefreshErrorDismissed(false);
    }
  }, [inlineErrorMessage, isError, isRefetchError]);

  const ticketsFetchErrorModal = (
    <TicketsFetchErrorModal
      open={showRefreshErrorModal}
      message={inlineErrorMessage}
      onRetry={() => {
        setRefreshErrorDismissed(true);
        void refetch();
      }}
      onDismiss={() => setRefreshErrorDismissed(true)}
    />
  );

  const handleLoadNewTickets = useCallback(async () => {
    try {
      await refetch();
    } finally {
      // Acknowledge current "new tickets" marker so same count doesn't reappear repeatedly.
      clearNewTickets();
    }
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
  /** Numeric agent ids for export step (API expects assignedToIds, not "me"). */
  const exportAgentOptions = useMemo(
    () => [
      ...(currentUser ? [{ value: String(currentUser.id), label: `${currentUser.name} (Me)` }] : []),
      ...agents.map((a) => ({ value: String(a.id), label: a.name || a.email || `Agent ${a.id}` })),
    ],
    [agents, currentUser]
  );
  const priorityOptions = refData?.priorities ?? [];
  const groupOptions: Option[] = useMemo(() => {
    // Only show actual groups from database, no fallback to service names
    return (refData?.groups || []).map((g) => ({ value: String(g.id), label: g.groupName }));
  }, [refData?.groups]);
  const statusOptions: Option[] = useMemo(() => {
    const raw = refData?.statuses ?? [];
    return raw
      .filter((s) => s.value !== "assigned")
      .map((s) =>
        s.value === "open_frt" || s.label.toLowerCase() === "mark frt"
          ? { ...s, label: "Open FRT" }
          : s
      );
  }, [refData?.statuses]);

  /** Stable while loading / empty; avoids hooks after conditional returns. */
  const tickets = data?.tickets ?? [];
  const ticketNumberById = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tickets) m.set(t.id, t.ticketNumber || String(t.id));
    return m;
  }, [tickets]);

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
      if (checked) setSelectedIds(new Set(tickets.map((t) => t.id)));
      else setSelectedIds(new Set());
    },
    [tickets]
  );
  const handleSelectCount = useCallback(
    (nextCountRaw: number) => {
      const pageTicketCount = tickets.length;
      const bounded = Math.max(0, Math.min(pageTicketCount, Number.isFinite(nextCountRaw) ? nextCountRaw : 0));
      if (bounded === 0) {
        setSelectedIds(new Set());
        return;
      }
      const nextIds = tickets.slice(0, bounded).map((t) => t.id);
      setSelectedIds(new Set(nextIds));
    },
    [tickets]
  );

  const handleUpdatePriority = useCallback(
    (ticketId: number, priority: string) => {
      updateTicket.mutate({ ticketId, priority });
    },
    [updateTicket]
  );
  const handleUpdateGroup = useCallback(
    (ticketId: number, groupId: number | null, groupLabel?: string) => {
      const resolvedLabel =
        groupId == null
          ? "Unassigned"
          : groupLabel || groupOptions.find((g) => g.value === String(groupId))?.label || `Group ${groupId}`;
      const ticketNumber = ticketNumberById.get(ticketId) ?? String(ticketId);
      toast(
        `#${ticketNumber} Group set as - ${resolvedLabel}`,
        groupId == null ? "error" : "success"
      );
      updateTicket.mutate(
        { ticketId, groupId, groupName: resolvedLabel }
      );
    },
    [updateTicket, groupOptions, toast, ticketNumberById]
  );
  const handleUpdateAssignee = useCallback(
    async (ticketId: number, userId: number | null, assigneeLabel?: string) => {
      const resolvedLabel =
        userId == null
          ? "Unassigned"
          : assigneeLabel ||
            (currentUser && userId === currentUser.id ? currentUser.name : agents.find((a) => a.id === userId)?.name) ||
            `Agent ${userId}`;
      const ticketNumber = ticketNumberById.get(ticketId) ?? String(ticketId);
      if (userId == null) {
        toast(`#${ticketNumber} Agent set as - ${resolvedLabel}`, "success");
        updateTicket.mutate({
          ticketId,
          currentAssigneeUserId: null,
          currentAssigneeName: resolvedLabel,
        });
        return;
      }
      try {
        await updateTicket.mutateAsync({
          ticketId,
          currentAssigneeUserId: userId,
          currentAssigneeName: resolvedLabel,
        });
        toast(`#${ticketNumber} Agent set as - ${resolvedLabel}`, "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Assignment failed", "error");
      }
    },
    [updateTicket, currentUser, agents, toast, ticketNumberById]
  );
  const handleUpdateStatus = useCallback(
    (ticketId: number, status: string) => {
      const statusLabel = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      updateTicket.mutate({ ticketId, status }, { onSuccess: () => toast(`Status set as - ${statusLabel}`) });
    },
    [updateTicket, toast]
  );

  /**
   * Every bulk action goes through one request instead of one PATCH per ticket.
   * The old fan-out ran the workflow engine N times in parallel and starved the
   * connection pool, which is what surfaced as "Failed to refresh tickets".
   *
   * Rows are patched optimistically first so the table reacts immediately, then
   * reconciled against what the server actually applied.
   */
  const runBulkUpdate = useCallback(
    async (
      updates: BulkTicketUpdates,
      opts: {
        verb: string;
        /** Optimistic patch applied to each selected row before the request. */
        patchRow?: (row: any) => any;
      }
    ) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const patchRow = opts.patchRow;

      if (patchRow) {
        ids.forEach((id) => {
          patchTicketInListCaches(queryClient, id, (t) => patchRow(t));
          queryClient.setQueryData(queryKeys.tickets.detail(id), (old: any) =>
            old ? patchRow(old) : old
          );
        });
      }

      setSelectedIds(new Set());

      try {
        const outcome = await bulkUpdate(ids, updates);
        toast(describeBulkOutcome(outcome, opts.verb), outcome.failed > 0 ? "error" : "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : `Bulk ${opts.verb} failed`, "error");
      } finally {
        invalidateTicketListCaches(queryClient);
        await refetch();
      }
    },
    [selectedIds, queryClient, toast, refetch, bulkUpdate]
  );

  const handleBulkAssign = useCallback(
    async (userId: number) => {
      const assigneeName =
        (currentUser && userId === currentUser.id
          ? currentUser.name
          : agents.find((a) => a.id === userId)?.name) || `Agent ${userId}`;
      await runBulkUpdate(
        { currentAssigneeUserId: userId },
        {
          verb: `assigned to ${assigneeName}`,
          patchRow: (t) => ({
            ...t,
            assignee: { ...(t.assignee ?? {}), id: userId, name: assigneeName, email: t.assignee?.email ?? "" },
          }),
        }
      );
    },
    [runBulkUpdate, currentUser, agents]
  );

  const handleBulkUnassign = useCallback(
    () =>
      runBulkUpdate(
        { currentAssigneeUserId: null },
        { verb: "unassigned", patchRow: (t) => ({ ...t, assignee: null }) }
      ),
    [runBulkUpdate]
  );

  const handleBulkStatus = useCallback(
    (status: string) => {
      const statusLabel = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return runBulkUpdate(
        { status },
        { verb: `marked as ${statusLabel}`, patchRow: (t) => ({ ...t, status }) }
      );
    },
    [runBulkUpdate]
  );

  const handleBulkClose = useCallback(() => handleBulkStatus("closed"), [handleBulkStatus]);

  const handleBulkSpam = useCallback(
    () =>
      runBulkUpdate(
        { isSpam: true, status: "rejected" },
        {
          verb: "marked as spam",
          patchRow: (t) => ({ ...t, status: "rejected", isSpam: true }),
        }
      ),
    [runBulkUpdate]
  );
  const handleBulkMerge = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < 2) {
      toast("Select at least 2 tickets to merge", "error");
      return;
    }
    const targetTicketId = mergeTargetId ?? ids[0] ?? null;
    if (!targetTicketId) {
      toast("Select a primary ticket", "error");
      return;
    }
    const sourceTicketIds = ids.filter((id) => id !== targetTicketId);
    if (sourceTicketIds.length < 1) {
      toast("Select at least one duplicate ticket", "error");
      return;
    }

    setMergeSubmitting(true);
    try {
      const res = await fetch("/api/tickets/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetTicketId,
          sourceTicketIds,
          reason: mergeReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Failed to merge tickets", "error");
        return;
      }

      const mergedCount = Number(data?.data?.mergedCount ?? sourceTicketIds.length);
      const targetNumber = ticketNumberById.get(targetTicketId) ?? String(targetTicketId);
      toast(`${mergedCount} duplicate ticket${mergedCount === 1 ? "" : "s"} merged into #${targetNumber}`);
      setMergeOpen(false);
      setMergeReason("");
      setMergeTargetId(null);
      setSelectedIds(new Set([targetTicketId]));
      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(targetTicketId) });
      await refetch();
    } catch {
      toast("Failed to merge tickets", "error");
    } finally {
      setMergeSubmitting(false);
    }
  }, [selectedIds, mergeTargetId, mergeReason, toast, ticketNumberById, queryClient, refetch]);
  const handleBulkUpdateApply = useCallback(
    async (updates: {
      priority?: string;
      status?: string;
      groupId?: number | null;
      assigneeId?: number | null;
    }) => {
      const payload: BulkTicketUpdates = {};
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.groupId !== undefined) payload.groupId = updates.groupId;
      // `assigneeId: null` is a real instruction ("Unassigned"), not "no change" —
      // the modal omits the key entirely when the agent picked "— No change —".
      if (updates.assigneeId !== undefined) payload.currentAssigneeUserId = updates.assigneeId ?? null;

      setBulkUpdateOpen(false);
      setPage(1);
      await runBulkUpdate(payload, { verb: "updated" });
    },
    [runBulkUpdate]
  );
  const handleExportSelected = useCallback(() => {
    const selected = tickets.filter((t) => selectedIds.has(t.id));
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
  }, [tickets, selectedIds]);

  // Only full-page spin when we have nothing to show (no snapshot / cache). Otherwise paint list and refresh in background.
  // When queue home is offline we intentionally disable the tickets query — never spin forever on a disabled query with no data.
  const awaitingTickets =
    !(isQueueHome && queueHomeAgentOffline) && data == null && (isLoading || isPending);
  if (awaitingTickets) {
    return (
      <div className="tickets-typo flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
        {ticketsFetchErrorModal}
        <TicketsPageSkeleton />
      </div>
    );
  }

  if (queueHomeAgentOffline) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-white">
        {ticketsFetchErrorModal}
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-4 py-12 text-center">
          <div className="max-w-md text-gray-800">
            <p className="text-base font-semibold text-gray-900">
              Hit online to start receiving and viewing tickets from the queue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    const emptyBecauseOfFilters = appliedTicketFilterCount > 0;
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-white">
        {ticketsFetchErrorModal}
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-4 py-12 text-center">
          {queueHomeAgentOffline ? (
            <div className="max-w-md text-gray-800">
              <p className="text-base font-semibold text-gray-900">
                Hit online to start receiving and viewing tickets from the queue.
              </p>
            </div>
          ) : emptyBecauseOfFilters ? (
            <div className="max-w-md text-gray-800">
              <p className="text-lg font-semibold tracking-tight">😒 Ohh Nooo there's nothing here......</p>
              <p className="mt-3 text-base font-normal text-gray-600">Cool - We’re preparing your queue. Tickets will appear shortly.</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No tickets to display.</p>
          )}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const start = data.total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, data.total);
  const pageNumbers = getPageNumbers(totalPages, page);

  const allSelected = data.tickets.length > 0 && selectedIds.size === data.tickets.length;
  const someSelected = selectedIds.size > 0;
  const pageTicketCount = data.tickets.length;

  return (
    <div className="tickets-typo flex flex-col h-full min-h-0 bg-white overflow-hidden">
      {ticketsFetchErrorModal}
      {/* Toolbar: fixed 3-column layout so Sort by position never changes */}
      <div className="flex-shrink-0 z-20 flex items-center gap-2 border-b border-gray-200/90 bg-white px-3 py-1.5">
        {/* Left: Sort by + scope tabs */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs font-medium text-gray-700">Sort by:</span>
          <div className="relative flex items-center gap-1.5 text-xs text-gray-600 shrink-0" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setSortDropdownOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50/80 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
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
                className="absolute left-0 top-full z-50 mt-1 min-w-[184px] rounded-lg border border-gray-200 bg-white py-0.5 shadow-lg sm:left-auto sm:right-0"
                role="listbox"
              >
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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
                      const order = opt.value === "created_at" ? "desc" : appliedFilters.sortOrder;
                      applySort(opt.value, order);
                    }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] ${
                      appliedFilters.sortBy === opt.value ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className={appliedFilters.sortBy === opt.value ? "font-medium" : ""}>{opt.label}</span>
                    {appliedFilters.sortBy === opt.value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                  </button>
                ))}
                <div className="my-0.5 border-t border-gray-200" />
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] ${
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
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setScopeTab("active")}
              className={`cursor-pointer rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                scopeTab === "active" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Active (<TicketNum>{activeCountDisplay}</TicketNum>)
            </button>
            <button
              type="button"
              onClick={() => setScopeTab("snoozed")}
              className={`cursor-pointer rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                scopeTab === "snoozed" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Snoozed (<TicketNum>{snoozedCountDisplay}</TicketNum>)
            </button>
          </div>
        </div>

        {/* Center: New Updated button (Freshdesk style) - only when there are new/updated tickets */}
        <div className="flex-1 flex justify-center items-center min-w-0">
          {hasNewTickets && (
            <button
              type="button"
              onClick={handleLoadNewTickets}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-400 bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-gray-200 hover:border-blue-500 transition-colors shrink-0 shadow-sm"
              aria-label={
                isQueueHome
                  ? `Load ${newTicketsCount} new or updated ticket${newTicketsCount !== 1 ? "s" : ""}`
                  : `Load ${newTicketsCount} new ticket${newTicketsCount !== 1 ? "s" : ""}`
              }
            >
              <RefreshCw className="h-4 w-4 text-blue-600" />
              {isQueueHome ? (
                <>
                  {newTicketsCount} New updated
                </>
              ) : (
                <>
                  {newTicketsCount} new ticket{newTicketsCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: Page info, view toggles, Export */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
          <span className="text-xs text-gray-600 whitespace-nowrap" aria-live="polite">
            Page <TicketNum>{page}</TicketNum> of{" "}
            <TicketNum>{Math.max(1, Math.ceil(currentTotal / pageSize) || 1)}</TicketNum>
            {isQueueHome && hasNewTickets ? (
              <>
                {" "}
                <span className="font-medium text-blue-600">
                  · <TicketNum>{newTicketsCount}</TicketNum> New updated
                </span>
              </>
            ) : null}
            {" · "}
            Showing{" "}
            <TicketNum>
              {currentTotal === 0 ? "0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, currentTotal)}`}
            </TicketNum>{" "}
            of <TicketNum>{currentTotal}</TicketNum>
          </span>
          <div className="flex items-center rounded-md border border-gray-200 bg-gray-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded p-1 transition-colors ${viewMode === "list" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              title="List view"
              aria-label="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded p-1 transition-colors ${viewMode === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          {!hideExportAndSidebarToggle && (
            <>
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-gray-50/80 px-1.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
              {/* Right sidebar toggle */}
              {rightSidebar && (
                <button
                  type="button"
                  onClick={rightSidebar.onToggle}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50/80 px-1.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  title={rightSidebar.isOpen ? "Hide filters" : "Open filters"}
                >
                  {rightSidebar.isOpen ? (
                    <PanelRightClose className="h-3 w-3" />
                  ) : (
                    <PanelRightOpen className="h-3 w-3" />
                  )}
                </button>
              )}
            </>
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
          <label className="inline-flex items-center gap-1.5 font-medium text-blue-900">
            <input
              type="number"
              min={0}
              max={pageTicketCount}
              value={selectedIds.size}
              onChange={(e) => {
                const value = e.target.value.trim();
                if (value === "") {
                  handleSelectCount(0);
                  return;
                }
                handleSelectCount(parseInt(value, 10));
              }}
              className="h-7 w-16 rounded-md border border-blue-200 bg-white px-2 text-center text-sm font-medium text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              aria-label="Selected ticket count"
              title={`Set selection count (max ${pageTicketCount})`}
            />
            <span>selected</span>
          </label>
          <div className="h-5 w-px bg-blue-200" aria-hidden />
          <div className="relative" ref={assignDropdownRef}>
            <button
              type="button"
              onClick={() => setAssignDropdownOpen((o) => !o)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-blue-100"
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
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { handleBulkUnassign(); setAssignDropdownOpen(false); }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Unassign
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCloseConfirmOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Close
          </button>
          <button
            type="button"
            onClick={() => setBulkUpdateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Bulk update
          </button>
          <button
            type="button"
            onClick={() => setLinkToParentOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link to a parent
          </button>
          <button
            type="button"
            onClick={() => setMergeOpen(true)}
            disabled={selectedIds.size < 2}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Merge className="h-3.5 w-3.5" />
            Merge
          </button>
          <button
            type="button"
            onClick={handleBulkSpam}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Spam
          </button>
          {!hideExportAndSidebarToggle && (
            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto cursor-pointer text-xs font-medium text-blue-700 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      <ExportTicketsModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        appliedFilters={appliedFilters}
        exportAgentOptions={exportAgentOptions}
        groupOptions={groupOptions}
      />

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

      {/* Merge */}
      {mergeOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setMergeOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Merge tickets</h3>
            <p className="mt-2 text-sm text-gray-600">
              Select one primary ticket. Other selected duplicate tickets will be merged into it and marked as closed.
            </p>

            <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-gray-200">
              {Array.from(selectedIds).map((id) => {
                const number = ticketNumberById.get(id) ?? String(id);
                const row = tickets.find((t) => t.id === id);
                return (
                  <label key={id} className="flex cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="merge-target-ticket"
                      checked={(mergeTargetId ?? Array.from(selectedIds)[0]) === id}
                      onChange={() => setMergeTargetId(id)}
                      className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="min-w-0 text-sm text-gray-800">
                      <span className="font-medium">#{number}</span>
                      {row?.subject ? <span className="ml-1 text-gray-600">- {row.subject}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">Merge reason (optional)</label>
              <textarea
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                placeholder="Duplicate ticket for same issue..."
                className="min-h-[84px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMergeOpen(false)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkMerge()}
                disabled={mergeSubmitting || selectedIds.size < 2}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mergeSubmitting ? "Merging..." : "Merge tickets"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close confirm */}
      {closeConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setCloseConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Mark selected tickets as closed?</h3>
            <p className="mt-2 text-sm text-gray-600">
              These selected tickets will be marked as closed in all participant systems-please review before proceeding.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(false)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setCloseConfirmOpen(false);
                  void handleBulkClose();
                }}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Mark as closed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket List or Grid - scrollable area */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-visible`}
      >
        {tickets.length === 0 ? (
          <div className="flex h-full min-h-0 w-full flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-base font-semibold text-gray-900">Whoa, relax 😄 no stress at all!</p>
            <p className="mt-2 text-sm text-gray-600">Seems like there’s no ticket to worry about.</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="w-full relative" style={{ overflow: "visible" }}>
            {/* List header row - compact, single line */}
            <div className="flex items-center gap-2 border-b border-gray-200 bg-slate-50/90 pl-2 pr-1 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              <div className="shrink-0 w-4 flex justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label="Select all on page"
                />
              </div>
              <div className="w-8 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0 truncate">Ticket</div>
              <div className="shrink-0 w-[288px] min-w-[288px] mr-2 text-left">
                <span className="text-gray-500 text-[11px] font-medium">Priority · Group/Agent · Status</span>
              </div>
            </div>
            <div className="w-full">
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
                  detailHref={detailHrefForTicket(ticket.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Grid header - select all (matches list header styling) */}
            <div className="flex items-center gap-2 border-b border-gray-200 bg-slate-50/90 pl-2 pr-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => selectAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="Select all on page"
              />
              <span className="normal-case font-medium text-gray-600">Select all</span>
              {someSelected && (
                <span className="normal-case text-blue-600 font-medium">
                  ({selectedIds.size} selected)
                </span>
              )}
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 p-3"
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
                  detailHref={detailHrefForTicket(ticket.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination footer - fixed at very bottom of ticket list area */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-3 py-1.5">
        {/* Left: Showing X / page dropdown */}
        <div className="relative" ref={pageSizeDropdownRef}>
          <button
            type="button"
            onClick={() => setPageSizeDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50/80 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            aria-expanded={pageSizeDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Items per page"
          >
            Showing <TicketNum>{pageSize}</TicketNum> / page
            <ChevronDown
              className={`h-3 w-3 text-gray-500 transition-transform ${pageSizeDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
          {pageSizeDropdownOpen && (
            <div
              className="absolute left-0 bottom-full z-[100] mb-1 min-w-[120px] rounded-md border border-gray-200 bg-white py-0.5 shadow-lg"
              role="listbox"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={pageSize === size}
                  onClick={() => {
                    autoSelectAllAfterPageSizeChangeRef.current = selectedIds.size > 0;
                    setPageSize(size);
                    setPage(1);
                    setPageSizeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] ${
                    pageSize === size ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {pageSize === size && <Check className="h-3 w-3 shrink-0 text-blue-600" />}
                  <span className={pageSize === size ? "font-medium tickets-num" : "tickets-num"}>{size} / page</span>
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#121212]/10 bg-white text-[#121212] hover:bg-[#F3F7FA] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-0.5">
            {pageNumbers.map((item, idx) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-7 w-7 items-center justify-center text-[#121212]/40 text-[11px] tickets-num"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  className={`tickets-num flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border text-[11px] font-medium transition-colors ${
                    page === item
                      ? "border-[#121212] bg-[#121212] text-white shadow-sm"
                      : "border-[#121212]/10 bg-white text-[#121212] hover:bg-[#F3F7FA]"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#121212]/10 bg-white text-[#121212] hover:bg-[#F3F7FA] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketsFetchErrorModal({
  open,
  message,
  onRetry,
  onDismiss,
}: {
  open: boolean;
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tickets-fetch-error-title"
    >
      <div className="w-full max-w-md rounded-xl border border-red-100 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="tickets-fetch-error-title" className="text-base font-semibold text-gray-900">
              Failed to refresh tickets
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{message}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
