"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface UnifiedTicketFilters {
  statuses?: string[];
  priorities?: string[];
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
}

export interface UnifiedTicket {
  id: number;
  ticketId: string;
  ticketType: string;
  ticketSource: string;
  serviceType: string;
  ticketTitle: string;
  ticketCategory: string;
  orderId: number | null;
  customerId: number | null;
  riderId: number | null;
  merchantStoreId: number | null;
  merchantParentId: number | null;
  raisedByType: string;
  raisedById: number | null;
  raisedByName: string | null;
  raisedByMobile: string | null;
  raisedByEmail: string | null;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedToAgentId: number | null;
  assignedToAgentName: string | null;
  assignedAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolvedByName: string | null;
  escalated: boolean;
  firstResponseAt: string | null;
  lastResponseAt: string | null;
  parentTicketId: number | null;
  tags: string[];
  orderType: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface UnifiedTicketsResponse {
  tickets: UnifiedTicket[];
  total: number;
  limit: number;
  offset: number;
}

const UNIFIED_TICKETS_FETCH_TIMEOUT_MS = 60_000;

export function useUnifiedTickets(filters: UnifiedTicketFilters = {}) {
  return useQuery<UnifiedTicketsResponse>({
    queryKey: queryKeys.unifiedTickets.list(filters as unknown as Record<string, unknown>),    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.statuses?.length) params.set("statuses", filters.statuses.join(","));
      if (filters.priorities?.length) params.set("priorities", filters.priorities.join(","));
      if (filters.searchQuery) params.set("q", filters.searchQuery);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
      params.set("limit", String(filters.limit ?? 50));
      params.set("offset", String(filters.offset ?? 0));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UNIFIED_TICKETS_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(`/api/unified-tickets?${params.toString()}`, {
          signal: controller.signal,
          credentials: "include",
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error ?? `Failed to fetch unified tickets: ${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error ?? "Failed to fetch unified tickets");
        }
        return data.data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out. Try again.");
        }
        throw err;
      }
    },
    staleTime: 30_000,
  });
}
