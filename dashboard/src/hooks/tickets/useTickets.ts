"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthOptional } from "@/providers/AuthProvider";
import { usePathname } from "next/navigation";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import { ticketsPathTicketId } from "@/lib/tickets/ticket-path-utils";

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
  /** Numeric group IDs and/or the token "unassigned" */
  groupIds?: string[];
  skill?: string;
  tags?: string;
  company?: string;
  dateFrom?: string;
  dateTo?: string;
  resolvedFrom?: string;
  resolvedTo?: string;
  closedFrom?: string;
  closedTo?: string;
  dueFrom?: string;
  dueTo?: string;
  searchQuery?: string;
  isHighValue?: string;
  slaBreach?: string;
  sortBy?: string;
  sortOrder?: string;
  /** Count/list only rows updated strictly after this ISO timestamp (activity badge). */
  updatedAfter?: string;
  /** Count/list only rows created strictly after this ISO timestamp (new-ticket badge). */
  createdAfter?: string;
  /** Count/list rows with created_at OR updated_at strictly after this (queue/main “new or updated” poll). */
  activityAfter?: string;
  limit?: number;
  offset?: number;
  /** When true, GET /api/tickets applies queue home rules (session assignee + active statuses only). */
  queueScope?: boolean;
  /** Include snoozed tickets in results (default list excludes them). */
  includeSnoozed?: boolean;
  /** Return only snoozed tickets. */
  snoozedOnly?: boolean;
}

/** Extra columns loaded when `forExport=1` (joins customers / stores / parents). */
export interface TicketExportMeta {
  tags: string;
  resolutionText: string;
  internalNotes: string;
  /** From unified_tickets.association_type, else UI derives from type/source. */
  associationType: string;
  agentInteractionCount: string;
  customerInteractionCount: string;
  contactFullName: string;
  contactExternalId: string;
  contactEmail: string;
  contactMobile: string;
  contactAlternateMobile: string;
  contactLanguage: string;
  contactWorkPhone: string;
  contactFacebookId: string;
  contactTwitterId: string;
  contactTimeZone: string;
  contactTags: string;
  contactJobTitle: string;
  contactUniqueExternalId: string;
  contactTwitterVerified: string;
  contactTwitterFollowerCount: string;
  /** Assigned agent profile (system_users.full_name, email, mobile). */
  agentExportFullName: string;
  agentExportEmail: string;
  agentExportMobile: string;
  agentExportAlternateMobile: string;
  /** Company / merchant (parent or store). */
  companyName: string;
  companyDisplayName: string;
  companyDomains: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  ticketType: string;
  serviceType: string;
  ticketCategory: string;
  ticketSection: string;
  sourceRole: string;
  title: string | null;
  subject: string;
  description: string;
  status: string;
  /** Marked as spam (independent of current status). */
  isSpam?: boolean;
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
  /** Routing / intake queue from metadata.landed_group_id or ticket_groups rule match (may differ from assigned group). */
  landedGroup?: {
    id: number;
    name: string;
    code: string;
  } | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Current assignment time from `unified_tickets.assigned_at` (list API). */
  assignedAt?: string | null;
  /** CSAT / satisfaction score when collected (list API). */
  satisfactionRating?: number | null;
  snoozedUntil?: string | null;
  snoozeReason?: string | null;
  /** Populated only when listing with `forExport=1`. */
  exportMeta?: TicketExportMeta;
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
  if (filters.ticketSection && filters.ticketSection !== "all") params.set("ticketSection", filters.ticketSection);
  if (filters.statuses?.length) params.set("status", filters.statuses.join(","));
  if (filters.priorities?.length) params.set("priority", filters.priorities.join(","));
  if (filters.ticketCategory && filters.ticketCategory !== "all") params.set("ticketCategory", filters.ticketCategory);
  if (filters.assignedToIds?.length) params.set("assignedToIds", filters.assignedToIds.join(","));
  else if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  if (filters.sourceRoles?.length) params.set("sourceRole", filters.sourceRoles.join(","));
  if (filters.groupIds?.length) params.set("groupIds", filters.groupIds.join(","));
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.tags) params.set("tags", filters.tags);
  if (filters.company) params.set("company", filters.company);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.resolvedFrom) params.set("resolvedFrom", filters.resolvedFrom);
  if (filters.resolvedTo) params.set("resolvedTo", filters.resolvedTo);
  if (filters.closedFrom) params.set("closedFrom", filters.closedFrom);
  if (filters.closedTo) params.set("closedTo", filters.closedTo);
  if (filters.dueFrom) params.set("dueFrom", filters.dueFrom);
  if (filters.dueTo) params.set("dueTo", filters.dueTo);
  if (filters.searchQuery) params.set("q", filters.searchQuery);
  if (filters.isHighValue === "true") params.set("isHighValue", "true");
  if (filters.slaBreach === "true") params.set("slaBreach", "true");
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.updatedAfter?.trim()) params.set("updatedAfter", filters.updatedAfter.trim());
  if (filters.createdAfter?.trim()) params.set("createdAfter", filters.createdAfter.trim());
  if (filters.activityAfter?.trim()) params.set("activityAfter", filters.activityAfter.trim());
  if (filters.queueScope) params.set("queueScope", "1");
  if (filters.includeSnoozed) params.set("includeSnoozed", "1");
  if (filters.snoozedOnly) params.set("snoozedOnly", "1");
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

export function useTickets(
  filters: TicketFilters = {},
  options?: { enabled?: boolean }
) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);
  const pathname = usePathname();
  const isOnTicketsRoute = pathname.startsWith("/dashboard/tickets");
  const extraEnabled = options?.enabled ?? true;
  const cleanPath = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  /** On `/tickets/:id`, use the same snapshot bucket as the main list so returning from detail does not miss cache. */
  const snapshotPathKey = useMemo(() => {
    return ticketsPathTicketId(cleanPath) != null ? "/dashboard/tickets" : cleanPath;
  }, [cleanPath]);

  const SNAPSHOT_TTL_MS = 10_000;
  const snapshotKey = useMemo(() => {
    if (!isAllowed || !isOnTicketsRoute) return null;
    return `dashboard_snapshot:tickets:${snapshotPathKey}:${JSON.stringify(filters)}`;
  }, [isAllowed, isOnTicketsRoute, snapshotPathKey, filters]);
  const initialSnapshot = useMemo(() => {
    if (!snapshotKey) return null;
    return loadClientSnapshot<TicketsResponse>(snapshotKey, SNAPSHOT_TTL_MS);
  }, [snapshotKey]);

  const query = useQuery<TicketsResponse>({
    queryKey: queryKeys.tickets.list(filters as unknown as Record<string, unknown>),
    queryFn: ({ signal }) => fetchTickets(filters, signal),
    enabled: isAllowed && isOnTicketsRoute && extraEnabled,
    ...(initialSnapshot != null ? { initialData: initialSnapshot } : {}),
    // Cached list with stale-while-revalidate for smooth pagination/filtering.
    staleTime: 90 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    /** Inherit global refetchOnMount: false so returning from ticket detail keeps the list cache without a forced refetch. */
  });

  useEffect(() => {
    if (!snapshotKey || query.data == null) return;
    saveClientSnapshot(snapshotKey, query.data);
  }, [snapshotKey, query.data]);

  return query;
}
