/**
 * Prefetch dashboard section data on nav link hover for instant switch.
 * Uses the same query keys and shapes as section hooks so cached data is used on click.
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchCustomers } from "@/hooks/queries/useCustomersQuery";

const defaultTicketsParams = "ticketSection=all&ticketCategory=all&limit=30&offset=0&sortBy=created_at&sortOrder=desc";

async function fetchTicketsList() {
  const response = await fetch(`/api/tickets?${defaultTicketsParams}`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Failed to fetch tickets");
  return data.data;
}

export function prefetchDashboardSection(queryClient: QueryClient, href: string): void {
  const path = href.split("?")[0];
  if (path === "/dashboard/customers" || path.startsWith("/dashboard/customers")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.customers.list({}),
      queryFn: () => fetchCustomers({}),
    });
    return;
  }
  if (path === "/dashboard/tickets" || path.startsWith("/dashboard/tickets")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.list({}),
      queryFn: fetchTicketsList,
    });
    return;
  }
}
