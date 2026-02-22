/**
 * Single source of truth for store open/closed state.
 * Synced from API responses and Supabase realtime; all UI reads from here.
 * Store is OPEN only when: is_active AND is_available AND is_accepting_orders AND operational_status = 'OPEN'.
 */

import { create } from "zustand";

export type LiveStatus = "OPEN" | "CLOSED";

type StoreStatusState = {
  /** store_id (string) -> live_status. When absent, UI falls back to API isOpen. */
  statusMap: Record<string, LiveStatus>;
  /** Seed from API response so list/card/detail stay in sync. */
  setStatus: (storeId: string, status: LiveStatus) => void;
  /** Batch seed from list/menu API (isOpen or liveStatus). */
  setStatusFromApi: (storeId: string, isOpen?: boolean, liveStatus?: LiveStatus) => void;
  /** Get current status; null means use API fallback. */
  getStatus: (storeId: string) => LiveStatus | null;
  /** Callback when a store is set to CLOSED (e.g. show toast if it's the cart merchant). */
  onStoreClosedCallback: ((storeId: string) => void) | null;
  setOnStoreClosedCallback: (cb: ((storeId: string) => void) | null) => void;
};

export const useStoreStatusStore = create<StoreStatusState>((set, get) => ({
  statusMap: {},
  onStoreClosedCallback: null,

  setStatus: (storeId, status) => {
    const prev = get().statusMap[storeId];
    set((s) => ({
      statusMap: { ...s.statusMap, [storeId]: status },
    }));
    if (status === "CLOSED" && prev !== "CLOSED") {
      get().onStoreClosedCallback?.(storeId);
    }
  },

  setStatusFromApi: (storeId, isOpen, liveStatus) => {
    const status: LiveStatus =
      liveStatus ?? (isOpen === true ? "OPEN" : "CLOSED");
    set((s) => ({
      statusMap: { ...s.statusMap, [storeId]: status },
    }));
  },

  getStatus: (storeId) => {
    return get().statusMap[storeId] ?? null;
  },

  setOnStoreClosedCallback: (cb) => {
    set({ onStoreClosedCallback: cb });
  },
}));

/** Compute live status from row (same logic as backend). */
export function computeLiveStatusFromRow(row: {
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
}): LiveStatus {
  const op = (row.operational_status ?? "").toString().trim().toUpperCase();
  const isAvailable = row.is_available === undefined ? true : row.is_available === true;
  if (
    row.is_active === true &&
    isAvailable &&
    row.is_accepting_orders === true &&
    op === "OPEN"
  ) {
    return "OPEN";
  }
  return "CLOSED";
}
