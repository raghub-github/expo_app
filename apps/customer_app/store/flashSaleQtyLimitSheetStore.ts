import { create } from "zustand";
import type { ItemDiet } from "@/lib/itemDiet";

export type FlashSaleQtyLimitSheetPayload = {
  lineId: string;
  maxFlashQuantity: number;
  itemName: string;
  itemSubtitle: string | null;
  imageUri: string | null;
  diet: ItemDiet;
  quantity: number;
  /** Cart line unit price (usually flash selling price). */
  unitPrice: number;
  /** Regular / strike unit for over-limit qty. */
  regularUnit: number;
};

type Handlers = {
  onGotIt: () => void;
  onWantMore: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
};

type FlashSaleQtyLimitSheetState = {
  payload: FlashSaleQtyLimitSheetPayload | null;
  handlers: Handlers | null;
  open: (payload: FlashSaleQtyLimitSheetPayload, handlers: Handlers) => void;
  setQuantity: (quantity: number) => void;
  close: () => void;
};

/**
 * Root-hosted Flash Sale limit sheet — avoids Android elevated merchant chrome
 * (Continue dock / FAB) painting over an in-page Modal footer.
 */
export const useFlashSaleQtyLimitSheetStore = create<FlashSaleQtyLimitSheetState>((set) => ({
  payload: null,
  handlers: null,
  open: (payload, handlers) => set({ payload, handlers }),
  setQuantity: (quantity) =>
    set((s) => (s.payload ? { payload: { ...s.payload, quantity } } : s)),
  close: () => set({ payload: null, handlers: null }),
}));
