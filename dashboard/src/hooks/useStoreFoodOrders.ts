"use client";

import { useCallback } from "react";
import type { OrdersFoodRow } from "@/lib/types/food-orders";

/**
 * Realtime subscription for store food orders.
 * storeId: numeric string (dashboard store id).
 * storeInternalId: numeric id (same as parseInt(storeId)).
 * Returns subscribe(onInsertOrUpdate, onUpdate) => unsubscribe.
 * Stub: no-op until orders_food realtime is wired; then can use Supabase channel.
 */
export function useStoreFoodOrders(
  _storeId: string | null,
  _storeInternalId: number | null
) {
  const subscribe = useCallback(
    (
      _onInsertOrUpdate: (row: OrdersFoodRow) => void,
      _onUpdate?: (row: OrdersFoodRow) => void
    ) => {
      // TODO: Supabase channel on orders_food for this store
      return () => {};
    },
    []
  );
  return { subscribe };
}
