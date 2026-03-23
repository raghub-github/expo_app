"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthOptional } from "@/providers/AuthProvider";
import { usePathname } from "next/navigation";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

export interface TicketFilters {
  serviceTypes?: string[];
  ticketSection?: string;
  statuses?: string[];
  priorities?: string[];
  ticketCategory?: string;
  /** Multi-select: "me", "unassigned", or numeric user IDs */
  assignedToIds?: string[];
  assignedTo?: string;
  sourceRoles?: string[];
  groupIds?: number[];
  skill?: string;
  tags?: string;
  company?: string;
  dateFrom?: string;
  dateTo?: string;
  dueFrom?: string;
  dueTo?: string;
  searchQuery?: string;
  isHighValue?: string;
  slaBreach?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  serviceType: string;
  ticketCategory: string;
  ticketSection: string;
  sourceRole: string;
  title: string | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  orderId: number | null;
  orderServiceType: string | null;
  is3plOrder: boolean;
  isHighValueOrder: boolean;
  assignee: {
    id: number;
    name: string;
    email: string;
  } | null;
  group: {
    id: number;
    name: string;
    code: string;
  } | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketsResponse {
  tickets: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

const TICKETS_FETCH_TIMEOUT_MS = 60_000; // 60s so slow DB doesn't hang the UI forever

export async function fetchTickets(filters: TicketFilters = {}, signal?: AbortSignal): Promise<TicketsResponse> {
  const params = new URLSearchParams();
  if (filters.serviceTypes?.length) params.set("serviceType", filters.serviceTypes.join(","));
  if (filters.ticketSection) params.set("ticketSection", filters.ticketSection);
  if (filters.statuses?.length) params.set("status", filters.statuses.join(","));
  if (filters.priorities?.length) params.set("priority", filters.priorities.join(","));
  if (filters.ticketCategory) params.set("ticketCategory", filters.ticketCategory);
  if (filters.assignedToIds?.length) params.set("assignedToIds", filters.assignedToIds.join(","));
  else if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  if (filters.sourceRoles?.length) params.set("sourceRole", filters.sourceRoles.join(","));
  if (filters.groupIds?.length) params.set("groupIds", filters.groupIds.join(","));
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.tags) params.set("tags", filters.tags);
  if (filters.company) params.set("company", filters.company);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.dueFrom) params.set("dueFrom", filters.dueFrom);
  if (filters.dueTo) params.set("dueTo", filters.dueTo);
  if (filters.searchQuery) params.set("q", filters.searchQuery);
  if (filters.isHighValue) params.set("isHighValue", filters.isHighValue);
  if (filters.slaBreach) params.set("slaBreach", filters.slaBreach);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  params.set("limit", String(filters.limit || 50));
  params.set("offset", String(filters.offset || 0));

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, TICKETS_FETCH_TIMEOUT_MS);

  // If React Query cancels this query, propagate that abort into our timeout controller.
  if (signal) {
    if (signal.aborted) controller.abort();
    else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
      const response = await fetch(`/api/tickets?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to fetch tickets: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to fetch tickets");
    }
    return data.data as TicketsResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      // Abort due to navigation/query cancel: rethrow the AbortError so React Query treats it as cancelled.
      if (!didTimeout) throw err;
      throw new Error("Request timed out. The server may be slow. Try again.");
    }
    throw err;
  }
}

export function useTickets(filters: TicketFilters = {}) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);
  const pathname = usePathname();
  const isOnTicketsRoute = pathname.startsWith("/dashboard/tickets");

  const SNAPSHOT_TTL_MS = 10_000;
  const snapshotKey = useMemo(() => {
    if (!isAllowed || !isOnTicketsRoute) return null;
    return `dashboard_snapshot:tickets:${pathname}:${JSON.stringify(filters)}`;
  }, [isAllowed, isOnTicketsRoute, pathname, filters]);
  const initialSnapshot = useMemo(() => {
    if (!snapshotKey) return null;
    return loadClientSnapshot<TicketsResponse>(snapshotKey, SNAPSHOT_TTL_MS);
  }, [snapshotKey]);

  const query = useQuery<TicketsResponse>({
    queryKey: queryKeys.tickets.list(filters as unknown as Record<string, unknown>),
    queryFn: ({ signal }) => fetchTickets(filters, signal),
    enabled: isAllowed && isOnTicketsRoute,
    ...(initialSnapshot != null ? { initialData: initialSnapshot } : {}),
    // Cached list with stale-while-revalidate for smooth pagination/filtering.
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    // Keep previous page's data while fetching the next one to avoid flicker.
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!snapshotKey || query.data == null) return;
    saveClientSnapshot(snapshotKey, query.data);
  }, [snapshotKey, query.data]);

  return query;
}
