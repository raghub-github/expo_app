/**
 * Per-cart-line ack for Flash Sale qty-limit sheet.
 * Once the customer has seen/dismissed the sheet for a line, further + taps
 * add at regular price without re-opening the sheet (app session / in-memory).
 */

import { create } from "zustand";

type FlashSaleQtyLimitAckState = {
  ackedLineIds: ReadonlySet<string>;
  hasAcked: (lineId: string) => boolean;
  markAcked: (lineId: string) => void;
  /** Clear when line qty hits 0 so the sheet can show again on next add. */
  clearAcked: (lineId: string) => void;
};

export const useFlashSaleQtyLimitAckStore = create<FlashSaleQtyLimitAckState>((set, get) => ({
  ackedLineIds: new Set<string>(),
  hasAcked: (lineId) => {
    const id = String(lineId ?? "").trim();
    if (!id) return false;
    return get().ackedLineIds.has(id);
  },
  markAcked: (lineId) => {
    const id = String(lineId ?? "").trim();
    if (!id) return;
    const prev = get().ackedLineIds;
    if (prev.has(id)) return;
    const next = new Set(prev);
    next.add(id);
    set({ ackedLineIds: next });
  },
  clearAcked: (lineId) => {
    const id = String(lineId ?? "").trim();
    if (!id) return;
    const prev = get().ackedLineIds;
    if (!prev.has(id)) return;
    const next = new Set(prev);
    next.delete(id);
    set({ ackedLineIds: next });
  },
}));
