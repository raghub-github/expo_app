/**
 * Prefetch dashboard section data on nav link hover for instant switch.
 * Uses the same query keys and shapes as section hooks so cached data is used on click.
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchCustomers } from "@/hooks/queries/useCustomersQuery";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";
import { fetchFoodOrders, type OrdersFilters } from "@/app/dashboard/orders/food/FoodOrdersClient";

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
  statusFilter: null,
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

  if (path === "/dashboard/tickets" || path.startsWith("/dashboard/tickets")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.list(
        defaultTicketFilters as unknown as Record<string, unknown>
      ),
      queryFn: () => fetchTickets(defaultTicketFilters),
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
