import { create } from "zustand";

/** Rotating copy shown on merchant menu loading skeleton. */
export const MERCHANT_MENU_LOADING_MESSAGES = [
  "Cooking up something delicious... 🍽️",
  "Discovering delicious picks for you.",
  "Serving freshness, one moment...",
  "Finding the best meals nearby.",
  "Preparing your perfect menu.",
  "Your feast is almost ready.",
  "Fresh flavours are on the way.",
  "Your next favourite meal is loading...",
  "Good food takes just a moment.",
  "Almost ready to satisfy your cravings.",
  "Warning: Hungry moments ahead. 😋",
  "The wait is short. The taste is worth it.",
  "Something tasty is coming your way.",
  "Hold tight, deliciousness is loading.",
  "Good things take a few seconds.",
] as const;

type MerchantLoadingMessageState = {
  /** Last shown index — every store entry advances globally. */
  lastIndex: number;
  pickStartIndex: (merchantId?: string) => number;
};

export const useMerchantLoadingMessageStore = create<MerchantLoadingMessageState>((set, get) => ({
  lastIndex: -1,
  pickStartIndex: (_merchantId?: string) => {
    const next = (get().lastIndex + 1) % MERCHANT_MENU_LOADING_MESSAGES.length;
    set({ lastIndex: next });
    return next;
  },
}));
