/**
 * Session-level (in-memory) per-store tracking for the long-distance warning sheet.
 * Survives navigation / background; clears on app process restart.
 */

import { create } from "zustand";

type LongDistanceSheetSeenState = {
  /** Store IDs that have already been shown the far-away warning this session. */
  seenStoreIds: ReadonlySet<string>;
  hasSeen: (storeId: string) => boolean;
  /** Idempotent — safe to call on present and on dismiss. */
  markSeen: (storeId: string) => void;
};

export const useLongDistanceSheetSeenStore = create<LongDistanceSheetSeenState>((set, get) => ({
  seenStoreIds: new Set<string>(),
  hasSeen: (storeId) => {
    const id = storeId.trim();
    if (!id) return false;
    return get().seenStoreIds.has(id);
  },
  markSeen: (storeId) => {
    const id = storeId.trim();
    if (!id) return;
    const prev = get().seenStoreIds;
    if (prev.has(id)) return;
    const next = new Set(prev);
    next.add(id);
    set({ seenStoreIds: next });
  },
}));
