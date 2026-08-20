"use client";

import { useSyncExternalStore } from "react";

type Snapshot = {
  pending: boolean;
  query: string;
};

let snapshot: Snapshot = { pending: false, query: "" };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const ORDER_LIST_SEARCH_REPEAT_EVENT = "gm-order-list-search-repeat";

export function beginOrderListSearch(query: string) {
  snapshot = { pending: true, query };
  emit();
}

export function endOrderListSearch() {
  if (!snapshot.pending) return;
  snapshot = { pending: false, query: snapshot.query };
  emit();
}

export function getOrderListSearchSnapshot(): Snapshot {
  return snapshot;
}

export function subscribeOrderListSearch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOrderListSearchPending(): boolean {
  return useSyncExternalStore(
    subscribeOrderListSearch,
    () => snapshot.pending,
    () => false
  );
}
