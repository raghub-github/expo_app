/**
 * Prefetch dashboard section data on nav link hover for instant switch.
 * Uses the same query keys and shapes as section hooks so cached data is used on click.
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchCustomers } from "@/hooks/queries/useCustomersQuery";
import { fetchUsersByState } from "@/components/customers/CustomerUsersByStateClient";
import { fetchTickets, DEFAULT_TICKETS_LIST_FILTERS, compactTicketFilters } from "@/hooks/tickets/useTickets";
import { prefetchTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { fetchFoodOrders, type OrdersFilters } from "@/app/dashboard/orders/food/FoodOrdersClient";
import { fetchTicketsReferenceData } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { fetchTicketsAgents } from "@/hooks/tickets/useTicketsAgentsQuery";

const defaultFoodOrdersFilters: OrdersFilters = {
  orderType: "food",
  statusFilter: "PAYMENT DONE",
  search: "",
  searchType: "Order Id",
  page: 1,
  limit: 20,
};

export function prefetchDashboardSection(queryClient: QueryClient, href: string): void {
  if (typeof window !== "undefined") {
    const current = window.location.pathname.split("?")[0].split("#")[0];
    if (current.startsWith("/order") || !current.startsWith("/dashboard")) {
      return;
    }
  }

  const path = href.split("?")[0];

  if (path.startsWith("/dashboard/merchants")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.merchantStores.stats(undefined, undefined, undefined),
      queryFn: async () => {
        const res = await fetch("/api/merchant/stores/stats", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to prefetch merchant stats");
        return res.json();
      },
      staleTime: 60_000,
    });
    return;
  }

  if (path === "/dashboard/customers" || path.startsWith("/dashboard/customers")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.customers.list({}),
      queryFn: () => fetchCustomers({}),
    });
    if (path === "/dashboard/customers" || path.startsWith("/dashboard/customers/users-by-state")) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.customers.usersByState(),
        queryFn: fetchUsersByState,
        staleTime: 60_000,
      });
    }
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
    const filters = compactTicketFilters(DEFAULT_TICKETS_LIST_FILTERS);
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.list(filters),
      queryFn: () => fetchTickets(DEFAULT_TICKETS_LIST_FILTERS),
      staleTime: 90_000,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.referenceData(),
      queryFn: fetchTicketsReferenceData,
    });
    return;
  }

  if (path === "/dashboard/orders" || path.startsWith("/dashboard/orders/food")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.ordersCore.foodList(
        defaultFoodOrdersFilters as unknown as Record<string, unknown>
      ),
      queryFn: () => fetchFoodOrders(defaultFoodOrdersFilters),
    });
    return;
  }

  if (path.startsWith("/dashboard/orders/person-ride")) {
    void import("@/app/dashboard/orders/person-ride/PersonRideOrdersClient").then(({ fetchPersonRideOrders }) =>
      queryClient.prefetchQuery({
        queryKey: [
          "person-ride-orders",
          {
            page: 1,
            limit: 20,
            status: "",
            dateFrom: "",
            dateTo: "",
            search: "",
            searchType: "Order Id",
          },
        ],
        queryFn: () =>
          fetchPersonRideOrders({
            page: 1,
            limit: 20,
            status: "",
            dateFrom: "",
            dateTo: "",
            search: "",
            searchType: "Order Id",
          }),
        staleTime: 30_000,
      })
    );
    return;
  }

  if (path.startsWith("/dashboard/orders")) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.ordersCore.foodList(
        defaultFoodOrdersFilters as unknown as Record<string, unknown>
      ),
      queryFn: () => fetchFoodOrders(defaultFoodOrdersFilters),
    });
    return;
  }
}
