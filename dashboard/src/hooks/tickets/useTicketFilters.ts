"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export interface TicketFilterState {
  /** Multi-select: service types (e.g. food, parcel) */
  serviceTypes: string[];
  ticketSection: string;
  /** Multi-select: statuses (e.g. open, resolved, reopened) */
  statuses: string[];
  /** Multi-select: priorities */
  priorities: string[];
  ticketCategory: string;
  /** Multi-select: assigned agent IDs (or "me", "unassigned") */
  assignedToIds: string[];
  /** Multi-select: source roles */
  sourceRoles: string[];
  /** Multi-select: group IDs as strings, or "unassigned" for tickets with no group */
  groupIds: string[];
  skill: string;
  tags: string;
  company: string;
  dateFrom: string;
  dateTo: string;
  createdPreset: string;
  resolvedFrom: string;
  resolvedTo: string;
  resolvedPreset: string;
  closedFrom: string;
  closedTo: string;
  closedPreset: string;
  dueFrom: string;
  dueTo: string;
  duePreset: string;
  searchQuery: string;
  isHighValue: string;
  slaBreach: string;
  sortBy: string;
  sortOrder: string;
}

const defaultFilters: TicketFilterState = {
  serviceTypes: [],
  ticketSection: "all",
  statuses: [],
  priorities: [],
  ticketCategory: "all",
  assignedToIds: [],
  sourceRoles: [],
  groupIds: [],
  skill: "",
  tags: "",
  company: "",
  dateFrom: "",
  dateTo: "",
  createdPreset: "any",
  resolvedFrom: "",
  resolvedTo: "",
  resolvedPreset: "any",
  closedFrom: "",
  closedTo: "",
  closedPreset: "any",
  dueFrom: "",
  dueTo: "",
  duePreset: "any",
  searchQuery: "",
  isHighValue: "all",
  slaBreach: "all",
  sortBy: "created_at",
  sortOrder: "desc",
};

type FilterAction =
  | { type: "set"; key: keyof TicketFilterState; value: string }
  | { type: "setMulti"; key: "serviceTypes" | "statuses" | "priorities" | "sourceRoles" | "assignedToIds"; value: string[] }
  | { type: "setGroupIds"; value: string[] }
  | { type: "setMany"; values: Partial<TicketFilterState> }
  | { type: "reset" };

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function applyCreatedPreset(state: TicketFilterState, preset: string) {
  if (preset === "any") {
    return { ...state, createdPreset: "any", dateFrom: "", dateTo: "" };
  }
  if (preset === "last_24h") {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { ...state, createdPreset: preset, dateFrom: toDateInput(from), dateTo: toDateInput(now) };
  }
  if (preset === "last_7d") {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { ...state, createdPreset: preset, dateFrom: toDateInput(from), dateTo: toDateInput(now) };
  }
  if (preset === "last_30d") {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { ...state, createdPreset: preset, dateFrom: toDateInput(from), dateTo: toDateInput(now) };
  }
  return { ...state, createdPreset: "custom" };
}

function applyResolvedPreset(state: TicketFilterState, preset: string) {
  if (preset === "any") {
    return { ...state, resolvedPreset: "any", resolvedFrom: "", resolvedTo: "" };
  }
  if (preset === "last_24h") {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { ...state, resolvedPreset: preset, resolvedFrom: toDateInput(from), resolvedTo: toDateInput(now) };
  }
  if (preset === "last_7d") {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { ...state, resolvedPreset: preset, resolvedFrom: toDateInput(from), resolvedTo: toDateInput(now) };
  }
  if (preset === "last_30d") {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { ...state, resolvedPreset: preset, resolvedFrom: toDateInput(from), resolvedTo: toDateInput(now) };
  }
  return { ...state, resolvedPreset: "custom" };
}

function applyClosedPreset(state: TicketFilterState, preset: string) {
  if (preset === "any") {
    return { ...state, closedPreset: "any", closedFrom: "", closedTo: "" };
  }
  if (preset === "last_24h") {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { ...state, closedPreset: preset, closedFrom: toDateInput(from), closedTo: toDateInput(now) };
  }
  if (preset === "last_7d") {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { ...state, closedPreset: preset, closedFrom: toDateInput(from), closedTo: toDateInput(now) };
  }
  if (preset === "last_30d") {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { ...state, closedPreset: preset, closedFrom: toDateInput(from), closedTo: toDateInput(now) };
  }
  return { ...state, closedPreset: "custom" };
}

function applyDuePreset(state: TicketFilterState, preset: string) {
  if (preset === "any") {
    return { ...state, duePreset: "any", dueFrom: "", dueTo: "", slaBreach: "all" };
  }
  if (preset === "overdue") {
    return { ...state, duePreset: "overdue", dueFrom: "", dueTo: "", slaBreach: "true" };
  }
  if (preset === "next_24h") {
    const now = new Date();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return { ...state, duePreset: preset, dueFrom: toDateInput(now), dueTo: toDateInput(to), slaBreach: "all" };
  }
  if (preset === "next_7d") {
    const now = new Date();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { ...state, duePreset: preset, dueFrom: toDateInput(now), dueTo: toDateInput(to), slaBreach: "all" };
  }
  return { ...state, duePreset: "custom" };
}

function parseArrayParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseNumberArrayParam(param: string | null): number[] {
  return parseArrayParam(param)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

function parseGroupIdsParam(param: string | null): string[] {
  if (!param) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of param.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.toLowerCase() === "unassigned") {
      if (!seen.has("unassigned")) {
        seen.add("unassigned");
        out.push("unassigned");
      }
      continue;
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) continue;
    const id = String(n);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function initFilters(searchParams: URLSearchParams): TicketFilterState {
  return {
    serviceTypes: parseArrayParam(searchParams.get("serviceType") || searchParams.get("serviceTypes")),
    ticketSection: searchParams.get("ticketSection") || defaultFilters.ticketSection,
    statuses: parseArrayParam(searchParams.get("status") || searchParams.get("statuses")),
    priorities: parseArrayParam(searchParams.get("priority") || searchParams.get("priorities")),
    ticketCategory: searchParams.get("ticketCategory") || defaultFilters.ticketCategory,
    assignedToIds: searchParams.get("assignedToIds")?.split(",").filter(Boolean) || defaultFilters.assignedToIds,
    sourceRoles: parseArrayParam(searchParams.get("sourceRole") || searchParams.get("sourceRoles")),
    groupIds: parseGroupIdsParam(searchParams.get("groupIds") || searchParams.get("groupId")),
    skill: searchParams.get("skill") || defaultFilters.skill,
    tags: searchParams.get("tags") || defaultFilters.tags,
    company: searchParams.get("company") || defaultFilters.company,
    dateFrom: searchParams.get("dateFrom") || defaultFilters.dateFrom,
    dateTo: searchParams.get("dateTo") || defaultFilters.dateTo,
    createdPreset: searchParams.get("createdPreset") || defaultFilters.createdPreset,
    resolvedFrom: searchParams.get("resolvedFrom") || defaultFilters.resolvedFrom,
    resolvedTo: searchParams.get("resolvedTo") || defaultFilters.resolvedTo,
    resolvedPreset: searchParams.get("resolvedPreset") || defaultFilters.resolvedPreset,
    closedFrom: searchParams.get("closedFrom") || defaultFilters.closedFrom,
    closedTo: searchParams.get("closedTo") || defaultFilters.closedTo,
    closedPreset: searchParams.get("closedPreset") || defaultFilters.closedPreset,
    dueFrom: searchParams.get("dueFrom") || defaultFilters.dueFrom,
    dueTo: searchParams.get("dueTo") || defaultFilters.dueTo,
    duePreset: searchParams.get("duePreset") || defaultFilters.duePreset,
    searchQuery: searchParams.get("q") || defaultFilters.searchQuery,
    isHighValue: searchParams.get("isHighValue") || defaultFilters.isHighValue,
    slaBreach: searchParams.get("slaBreach") || defaultFilters.slaBreach,
    sortBy: searchParams.get("sortBy") || defaultFilters.sortBy,
    sortOrder: searchParams.get("sortOrder") || defaultFilters.sortOrder,
  };
}

/**
 * Counts filters that narrow the ticket list (from URL or draft). Excludes sort-only params.
 * Used for empty-state copy: "wrong turn" only when count is greater than zero.
 */
export function countRestrictiveTicketFilters(f: TicketFilterState): number {
  let count = 0;
  if (f.serviceTypes.length > 0) count++;
  if (f.ticketSection && f.ticketSection !== "all") count++;
  if (f.statuses.length > 0) count++;
  if (f.priorities.length > 0) count++;
  if (f.ticketCategory && f.ticketCategory !== "all") count++;
  if (f.assignedToIds.length > 0) count++;
  if (f.sourceRoles.length > 0) count++;
  if (f.groupIds.length > 0) count++;
  if (f.skill) count++;
  if (f.tags) count++;
  if (f.company) count++;
  if (f.dateFrom || f.dateTo || (f.createdPreset && f.createdPreset !== "any")) count++;
  if (f.resolvedFrom || f.resolvedTo || (f.resolvedPreset && f.resolvedPreset !== "any")) count++;
  if (f.closedFrom || f.closedTo || (f.closedPreset && f.closedPreset !== "any")) count++;
  const dueNarrowed =
    Boolean(f.dueFrom || f.dueTo) ||
    Boolean(f.duePreset && f.duePreset !== "any") ||
    f.slaBreach === "true";
  if (dueNarrowed) count++;
  if (f.searchQuery) count++;
  if (f.isHighValue === "true") count++;
  return count;
}

function reducer(state: TicketFilterState, action: FilterAction): TicketFilterState {
  if (action.type === "reset") {
    return { ...defaultFilters };
  }
  if (action.type === "setMany") {
    return { ...state, ...action.values };
  }
  if (action.type === "setMulti") {
    return { ...state, [action.key]: action.value };
  }
  if (action.type === "setGroupIds") {
    return { ...state, groupIds: action.value };
  }
  if (action.key === "createdPreset") {
    return applyCreatedPreset(state, action.value);
  }
  if (action.key === "resolvedPreset") {
    return applyResolvedPreset(state, action.value);
  }
  if (action.key === "closedPreset") {
    return applyClosedPreset(state, action.value);
  }
  if (action.key === "duePreset") {
    return applyDuePreset(state, action.value);
  }
  if (action.key === "dateFrom" || action.key === "dateTo") {
    return { ...state, [action.key]: action.value, createdPreset: "custom" };
  }
  if (action.key === "resolvedFrom" || action.key === "resolvedTo") {
    return { ...state, [action.key]: action.value, resolvedPreset: "custom" };
  }
  if (action.key === "closedFrom" || action.key === "closedTo") {
    return { ...state, [action.key]: action.value, closedPreset: "custom" };
  }
  if (action.key === "dueFrom" || action.key === "dueTo") {
    return { ...state, [action.key]: action.value, duePreset: "custom", slaBreach: "all" };
  }
  return { ...state, [action.key]: action.value };
}

/** Build query string for `/api/tickets` from sidebar / URL filter state (used by list + export). */
export function buildSearchParams(filters: TicketFilterState) {
  const params = new URLSearchParams();
  if (filters.serviceTypes.length > 0) {
    params.set("serviceType", filters.serviceTypes.join(","));
  }
  if (filters.ticketSection && filters.ticketSection !== "all") {
    params.set("ticketSection", filters.ticketSection);
  }
  if (filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.priorities.length > 0) {
    params.set("priority", filters.priorities.join(","));
  }
  if (filters.ticketCategory && filters.ticketCategory !== "all") {
    params.set("ticketCategory", filters.ticketCategory);
  }
  if (filters.assignedToIds.length > 0) {
    params.set("assignedToIds", filters.assignedToIds.join(","));
  }
  if (filters.sourceRoles.length > 0) {
    params.set("sourceRole", filters.sourceRoles.join(","));
  }
  if (filters.groupIds.length > 0) {
    params.set("groupIds", filters.groupIds.join(","));
  }
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.tags) params.set("tags", filters.tags);
  if (filters.company) params.set("company", filters.company);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.createdPreset && filters.createdPreset !== "any") params.set("createdPreset", filters.createdPreset);
  if (filters.resolvedFrom) params.set("resolvedFrom", filters.resolvedFrom);
  if (filters.resolvedTo) params.set("resolvedTo", filters.resolvedTo);
  if (filters.resolvedPreset && filters.resolvedPreset !== "any") params.set("resolvedPreset", filters.resolvedPreset);
  if (filters.closedFrom) params.set("closedFrom", filters.closedFrom);
  if (filters.closedTo) params.set("closedTo", filters.closedTo);
  if (filters.closedPreset && filters.closedPreset !== "any") params.set("closedPreset", filters.closedPreset);
  if (filters.dueFrom) params.set("dueFrom", filters.dueFrom);
  if (filters.dueTo) params.set("dueTo", filters.dueTo);
  if (filters.duePreset && filters.duePreset !== "any") params.set("duePreset", filters.duePreset);
  if (filters.searchQuery) params.set("q", filters.searchQuery);
  if (filters.isHighValue === "true") params.set("isHighValue", filters.isHighValue);
  if (filters.slaBreach === "true") params.set("slaBreach", filters.slaBreach);
  if (filters.sortBy && filters.sortBy !== defaultFilters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder && filters.sortOrder !== defaultFilters.sortOrder) params.set("sortOrder", filters.sortOrder);
  return params;
}

export function useTicketFilters() {
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const [filters, dispatch] = useReducer(reducer, searchParams, initFilters);

  /** Applied filters (from URL) - use for the ticket list so it only updates on Apply */
  const appliedFilters = useMemo(
    () => initFilters(searchParams),
    [searchParams.toString()]
  );

  // Always sync draft panel from URL when the query string changes (Apply, Clear, back/forward).
  // Depend on `toString()` so unstable `searchParams` identity does not wipe in-progress draft edits.
  const urlQueryString = searchParams.toString();
  const prevUrlQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (urlQueryString === prevUrlQueryRef.current) return;
    prevUrlQueryRef.current = urlQueryString;
    dispatch({ type: "setMany", values: initFilters(searchParams) });
  }, [urlQueryString, searchParams]);

  // Apply filters on submit only. We close over `filters` directly instead of
  // going through a ref — using a ref left a window where the ref was stale
  // relative to the current render (between state commit and the post-commit
  // effect that synced the ref). With `filters` in the dep array the callback
  // always sees the latest draft, including chips that were just removed.
  // We also preserve the current pathname so applying filters from a sub-route
  // (e.g. opening filters while focused on a ticket detail) keeps the URL.
  const ticketsBasePath = useMemo(() => {
    if (!pathname) return "/dashboard/tickets";
    if (pathname.startsWith("/dashboard/tickets")) return pathname;
    return "/dashboard/tickets";
  }, [pathname]);

  const applyFilters = useCallback(() => {
    const filtersParams = buildSearchParams(filters).toString();
    const query = filtersParams ? `?${filtersParams}` : "";
    startTransition(() => {
      router.replace(`${ticketsBasePath}${query}`, { scroll: false });
    });
  }, [filters, router, ticketsBasePath]);

  /** Clear all filters: reset the draft immediately AND blow away URL params.
   *  Resetting the draft locally is the critical bit — without it the UI lags
   *  one URL-sync cycle behind, which read as "click Clear, filter still
   *  shows" especially when React batches the navigation. */
  const clearFilters = useCallback(() => {
    dispatch({ type: "reset" });
    startTransition(() => {
      router.replace(ticketsBasePath, { scroll: false });
    });
  }, [router, ticketsBasePath]);

  /** Apply sort immediately to URL so ticket list/cards auto-shift. Use for toolbar Sort dropdown. */
  const applySort = useCallback(
    (sortBy: string, sortOrder: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const query = params.toString();
      startTransition(() => {
        router.replace(`${ticketsBasePath}${query ? `?${query}` : ""}`, { scroll: false });
      });
    },
    [router, searchParams, ticketsBasePath]
  );

  const updateFilter = useCallback((key: keyof TicketFilterState, value: string) => {
    dispatch({ type: "set", key, value });
  }, []);

  const updateFilters = useCallback((values: Partial<TicketFilterState>) => {
    dispatch({ type: "setMany", values });
  }, []);

  const updateStatuses = useCallback((statuses: string[]) => {
    dispatch({ type: "setMulti", key: "statuses", value: statuses });
  }, []);
  const updateServiceTypes = useCallback((serviceTypes: string[]) => {
    dispatch({ type: "setMulti", key: "serviceTypes", value: serviceTypes });
  }, []);
  const updatePriorities = useCallback((priorities: string[]) => {
    dispatch({ type: "setMulti", key: "priorities", value: priorities });
  }, []);
  const updateSourceRoles = useCallback((sourceRoles: string[]) => {
    dispatch({ type: "setMulti", key: "sourceRoles", value: sourceRoles });
  }, []);
  const updateAssignedToIds = useCallback((assignedToIds: string[]) => {
    dispatch({ type: "setMulti", key: "assignedToIds", value: assignedToIds });
  }, []);
  const updateGroupIds = useCallback((groupIds: string[]) => {
    dispatch({ type: "setGroupIds", value: groupIds });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const activeFilterCount = useMemo(() => countRestrictiveTicketFilters(filters), [filters]);
  const appliedTicketFilterCount = useMemo(
    () => countRestrictiveTicketFilters(appliedFilters),
    [appliedFilters]
  );
  const hasPendingFilterChanges = useMemo(
    () => buildSearchParams(filters).toString() !== buildSearchParams(appliedFilters).toString(),
    [filters, appliedFilters]
  );

  return {
    /** Draft filters (form state) - use in filter panel */
    filters,
    /** Applied filters (from URL) - use for ticket list so it only updates on Apply */
    appliedFilters,
    /** Apply sort to URL immediately (toolbar dropdown) so list/cards re-order */
    applySort,
    updateFilter,
    updateFilters,
    updateStatuses,
    updateServiceTypes,
    updatePriorities,
    updateSourceRoles,
    updateAssignedToIds,
    updateGroupIds,
    resetFilters,
    applyFilters,
    clearFilters,
    activeFilterCount,
    /** Restrictive filters currently in the URL (after Apply). For empty list messaging. */
    appliedTicketFilterCount,
    /** True when draft filters differ from URL-applied filters */
    hasPendingFilterChanges,
  };
}
