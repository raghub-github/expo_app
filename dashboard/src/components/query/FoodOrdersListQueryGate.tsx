"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFoodOrdersListActive } from "@/hooks/useFoodOrdersListActive";

function isFoodOrdersListQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "orders" && key[1] === "core" && key[2] === "food";
}

/**
 * Stops food-orders list API work when the user is on /order/*, tickets, etc.
 * Shared query client + tab prefetch can otherwise keep list requests alive.
 */
export function FoodOrdersListQueryGate() {
  const queryClient = useQueryClient();
  const foodOrdersListActive = useFoodOrdersListActive();

  useEffect(() => {
    if (foodOrdersListActive) return;

    void queryClient.cancelQueries({
      predicate: (query) => isFoodOrdersListQueryKey(query.queryKey as readonly unknown[]),
    });
  }, [foodOrdersListActive, queryClient]);

  return null;
}
