/**
 * Prefetch dashboard section data on nav link hover for instant switch.
 * Uses the same query keys and shapes as section hooks so cached data is used on click.
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchCustomers } from "@/hooks/queries/useCustomersQuery";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";
import { prefetchTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { fetchFoodOrders, type OrdersFilters } from "@/app/dashboard/orders/food/FoodOrdersClient";
import { fetchTicketsReferenceData } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { fetchTicketsAgents } from "@/hooks/tickets/useTicketsAgentsQuery";

const defaultTicketFilters: TicketFilters = {
  ticketSection: "all",
  ticketCategory: "all",
  sortBy: "created_at",
  sortOrder: "desc",
  limit: 30,
  offset: 0,
};

const defaultFoodOrdersFilters: OrdersFilters = {
  orderType: "food",
  statusFilter: "PAYMENT DONE",
  search: "",
  searchType: "Order Id",
  page: 1,
  limit: 20,
};

export function prefetchDashboardSection(queryClient: QueryClient, href: string): void {
  const path = href.split("?")[0];

  if (path === "/dashboard/customers" || path.startsWith("/dashboard/customers")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.customers.list({}),
      queryFn: () => fetchCustomers({}),
    });
    return;
  }

  const ticketDetailMatch = /^\/dashboard\/tickets\/(\d+)$/.exec(path);
  if (ticketDetailMatch) {
    prefetchTicketDetail(queryClient, ticketDetailMatch[1]);
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.referenceData(),
      queryFn: fetchTicketsReferenceData,
    });
    return;
  }

  if (path.startsWith("/dashboard/tickets/queue")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.agents(false, false),
      queryFn: () => fetchTicketsAgents(false, false),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.referenceData(),
      queryFn: fetchTicketsReferenceData,
    });
    return;
  }

  if (path === "/dashboard/tickets" || path.startsWith("/dashboard/tickets")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.list(
        defaultTicketFilters as unknown as Record<string, unknown>
      ),
      queryFn: () => fetchTickets(defaultTicketFilters),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.referenceData(),
      queryFn: fetchTicketsReferenceData,
    });
    return;
  }

  if (path === "/dashboard/orders" || path.startsWith("/dashboard/orders")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.ordersCore.foodList(
        defaultFoodOrdersFilters as unknown as Record<string, unknown>
      ),
      queryFn: () => fetchFoodOrders(defaultFoodOrdersFilters),
    });
    return;
  }
}
