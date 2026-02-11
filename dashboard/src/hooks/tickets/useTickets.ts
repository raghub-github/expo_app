"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface TicketFilters {
  serviceTypes?: string[];
  ticketSection?: string;
  statuses?: string[];
  priorities?: string[];
  ticketCategory?: string;
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

export function useTickets(filters: TicketFilters = {}) {
  return useQuery<TicketsResponse>({
    queryKey: queryKeys.tickets.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.serviceTypes?.length) params.set("serviceType", filters.serviceTypes.join(","));
      if (filters.ticketSection) params.set("ticketSection", filters.ticketSection);
      if (filters.statuses?.length) params.set("status", filters.statuses.join(","));
      if (filters.priorities?.length) params.set("priority", filters.priorities.join(","));
      if (filters.ticketCategory) params.set("ticketCategory", filters.ticketCategory);
      if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
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

      const response = await fetch(`/api/tickets?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch tickets: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch tickets");
      }
      return data.data;
    },
    staleTime: 30000, // 30 seconds
  });
}
