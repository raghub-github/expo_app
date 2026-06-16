"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFoodOrdersListActive } from "@/hooks/useFoodOrdersListActive";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchFoodOrders,
  type OrdersFilters,
} from "@/app/dashboard/orders/food/FoodOrdersClient";

function isFoodOrdersListQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "orders" && key[1] === "core" && key[2] === "food";
}

const DEFAULT_FOOD_ORDERS_FILTERS: OrdersFilters = {
  orderType: "food",
  statusFilter: "PAYMENT DONE",
  search: "",
  searchType: "Order Id",
  page: 1,
  limit: 20,
};

/**
 * Stops food-orders list API work when the user is on /order/*, tickets, etc.
 * Prefetches the default tab when the food orders list route is active.
 */
export function FoodOrdersListQueryGate() {
  const queryClient = useQueryClient();
  const foodOrdersListActive = useFoodOrdersListActive();

  useEffect(() => {
    if (foodOrdersListActive) {
      const key = queryKeys.ordersCore.foodList(
        DEFAULT_FOOD_ORDERS_FILTERS as unknown as Record<string, unknown>
      );
      const existing = queryClient.getQueryData(key);
      if (existing == null) {
        void queryClient.prefetchQuery({
          queryKey: key,
          queryFn: ({ signal }) => fetchFoodOrders(DEFAULT_FOOD_ORDERS_FILTERS, signal),
          staleTime: 2 * 60 * 1000,
        });
      }
      return;
    }

    void queryClient.cancelQueries({
      predicate: (query) => isFoodOrdersListQueryKey(query.queryKey as readonly unknown[]),
    });
  }, [foodOrdersListActive, queryClient]);

  return null;
}
