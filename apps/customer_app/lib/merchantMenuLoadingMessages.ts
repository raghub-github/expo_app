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
  /** Last shown message index per merchant — next open picks the following one. */
  lastIndexByMerchant: Record<string, number>;
  pickStartIndex: (merchantId: string) => number;
};

export const useMerchantLoadingMessageStore = create<MerchantLoadingMessageState>((set, get) => ({
  lastIndexByMerchant: {},
  pickStartIndex: (merchantId: string) => {
    const key = merchantId.trim();
    if (!key) return 0;
    const prev = get().lastIndexByMerchant[key] ?? -1;
    const next = (prev + 1) % MERCHANT_MENU_LOADING_MESSAGES.length;
    set((state) => ({
      lastIndexByMerchant: { ...state.lastIndexByMerchant, [key]: next },
    }));
    return next;
  },
}));
