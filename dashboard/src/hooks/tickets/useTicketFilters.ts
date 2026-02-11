"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  /** Multi-select: group IDs from ticket_groups */
  groupIds: number[];
  skill: string;
  tags: string;
  company: string;
  dateFrom: string;
  dateTo: string;
  createdPreset: string;
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
  | { type: "setGroupIds"; value: number[] }
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

function initFilters(searchParams: URLSearchParams): TicketFilterState {
  return {
    serviceTypes: parseArrayParam(searchParams.get("serviceType") || searchParams.get("serviceTypes")),
    ticketSection: searchParams.get("ticketSection") || defaultFilters.ticketSection,
    statuses: parseArrayParam(searchParams.get("status") || searchParams.get("statuses")),
    priorities: parseArrayParam(searchParams.get("priority") || searchParams.get("priorities")),
    ticketCategory: searchParams.get("ticketCategory") || defaultFilters.ticketCategory,
    assignedToIds: searchParams.get("assignedToIds")?.split(",").filter(Boolean) || defaultFilters.assignedToIds,
    sourceRoles: parseArrayParam(searchParams.get("sourceRole") || searchParams.get("sourceRoles")),
    groupIds: parseNumberArrayParam(searchParams.get("groupIds") || searchParams.get("groupId")),
    skill: searchParams.get("skill") || defaultFilters.skill,
    tags: searchParams.get("tags") || defaultFilters.tags,
    company: searchParams.get("company") || defaultFilters.company,
    dateFrom: searchParams.get("dateFrom") || defaultFilters.dateFrom,
    dateTo: searchParams.get("dateTo") || defaultFilters.dateTo,
    createdPreset: searchParams.get("createdPreset") || defaultFilters.createdPreset,
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
  if (action.key === "duePreset") {
    return applyDuePreset(state, action.value);
  }
  if (action.key === "dateFrom" || action.key === "dateTo") {
    return { ...state, [action.key]: action.value, createdPreset: "custom" };
  }
  if (action.key === "dueFrom" || action.key === "dueTo") {
    return { ...state, [action.key]: action.value, duePreset: "custom", slaBreach: "all" };
  }
  return { ...state, [action.key]: action.value };
}

function buildSearchParams(filters: TicketFilterState) {
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
  const searchParams = useSearchParams();
  const [filters, dispatch] = useReducer(reducer, searchParams, initFilters);
  const lastParamsRef = useRef<string>("");
  const filtersRef = useRef(filters);
  const isInitialMount = useRef(true);
  const isUpdatingRef = useRef(false);

  // Keep filters ref in sync
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    const currentParams = searchParams.toString();
    const filtersParams = buildSearchParams(filtersRef.current).toString();

    // On initial mount, just store the current params
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastParamsRef.current = currentParams;
      return;
    }

    // If URL changed externally (browser back/forward), sync filters
    if (currentParams !== lastParamsRef.current && !isUpdatingRef.current) {
      const newFilters = initFilters(searchParams);
      // Only update if filters actually differ
      const newFiltersParams = buildSearchParams(newFilters).toString();
      if (newFiltersParams !== filtersParams) {
        dispatch({ type: "setMany", values: newFilters });
      }
      lastParamsRef.current = currentParams;
      return;
    }

    // If filters changed from user action, update URL
    if (filtersParams !== currentParams && !isUpdatingRef.current) {
      isUpdatingRef.current = true;
      lastParamsRef.current = filtersParams;
      const query = filtersParams ? `?${filtersParams}` : "";

      startTransition(() => {
        try {
          // router.replace in Next.js App Router may not return a Promise
          // Use a callback approach instead
          router.replace(`/dashboard/tickets${query}`, { scroll: false });
          // Reset the flag after navigation (use setTimeout to ensure it happens after)
          setTimeout(() => {
            isUpdatingRef.current = false;
          }, 0);
        } catch (error) {
          console.error("Error updating URL with filters:", error);
          // Reset on error
          lastParamsRef.current = currentParams;
          isUpdatingRef.current = false;
        }
      });
    }
  }, [filters, router, searchParams]);

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
  const updateGroupIds = useCallback((groupIds: number[]) => {
    dispatch({ type: "setGroupIds", value: groupIds });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.serviceTypes.length > 0) count++;
    if (filters.ticketSection && filters.ticketSection !== "all") count++;
    if (filters.statuses.length > 0) count++;
    if (filters.priorities.length > 0) count++;
    if (filters.ticketCategory && filters.ticketCategory !== "all") count++;
    if (filters.assignedToIds.length > 0) count++;
    if (filters.sourceRoles.length > 0) count++;
    if (filters.groupIds.length > 0) count++;
    if (filters.skill) count++;
    if (filters.tags) count++;
    if (filters.company) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.dueFrom || filters.dueTo) count++;
    if (filters.searchQuery) count++;
    if (filters.isHighValue === "true") count++;
    if (filters.slaBreach === "true") count++;
    return count;
  }, [filters]);

  return {
    filters,
    updateFilter,
    updateFilters,
    updateStatuses,
    updateServiceTypes,
    updatePriorities,
    updateSourceRoles,
    updateAssignedToIds,
    updateGroupIds,
    resetFilters,
    activeFilterCount,
  };
}
