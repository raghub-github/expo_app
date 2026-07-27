import { create } from "zustand";

/** Copy shown on merchant menu loading skeleton — one sentence per store entry. */
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

const MESSAGE_COUNT = MERCHANT_MENU_LOADING_MESSAGES.length;

type MerchantLoadingMessageState = {
  /** Last shown index — next pick avoids repeating this. */
  lastIndex: number;
  /** Pick a random sentence for this store entry (never the same as last time). */
  pickStartIndex: (merchantId?: string) => number;
};

function randomIndexExcluding(exclude: number): number {
  if (MESSAGE_COUNT <= 1) return 0;
  if (exclude < 0 || exclude >= MESSAGE_COUNT) {
    return Math.floor(Math.random() * MESSAGE_COUNT);
  }
  // Pick uniformly among every index except `exclude`.
  const offset = 1 + Math.floor(Math.random() * (MESSAGE_COUNT - 1));
  return (exclude + offset) % MESSAGE_COUNT;
}

export const useMerchantLoadingMessageStore = create<MerchantLoadingMessageState>((set, get) => ({
  lastIndex: -1,
  pickStartIndex: (_merchantId?: string) => {
    const next = randomIndexExcluding(get().lastIndex);
    set({ lastIndex: next });
    return next;
  },
}));
