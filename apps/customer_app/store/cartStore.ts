/**
 * Cart global state - persisted locally.
 * Keyed by merchantId so cart is per-merchant (clear when switching merchant if desired).
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
};

type CartState = {
  merchantId: string | null;
  merchantName: string | null;
  items: CartItem[];
  hydrated: boolean;
  addItem: (merchantId: string, merchantName: string, item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (menuItemId: string, delta: number) => void;
  removeItem: (menuItemId: string) => void;
  clearCart: () => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
};

const defaultState = {
  merchantId: null,
  merchantName: null,
  items: [],
  hydrated: false,
};

export const useCartStore = create<CartState>((set, get) => ({
  ...defaultState,

  addItem: (merchantId, merchantName, item, quantity = 1) => {
    const { items, merchantId: currentMerchant } = get();
    if (currentMerchant && currentMerchant !== merchantId) {
      set({ merchantId, merchantName, items: [{ ...item, quantity }] });
      get().persist();
      return;
    }
    const existing = items.find((i) => i.menuItemId === item.menuItemId);
    const next = existing
      ? items.map((i) =>
          i.menuItemId === item.menuItemId ? { ...i, quantity: i.quantity + quantity } : i
        )
      : [...items, { ...item, quantity }];
    set({
      merchantId,
      merchantName,
      items: next,
    });
    get().persist();
  },

  updateQuantity: (menuItemId, delta) => {
    const { items } = get();
    const next = items
      .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0);
    const merchantId = next.length ? get().merchantId : null;
    const merchantName = next.length ? get().merchantName : null;
    set({ items: next, merchantId, merchantName });
    get().persist();
  },

  removeItem: (menuItemId) => {
    get().updateQuantity(menuItemId, -999);
  },

  clearCart: () => {
    set(defaultState);
    get().persist();
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEYS.CART);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          merchantId: string | null;
          merchantName: string | null;
          items: CartItem[];
        };
        set({
          merchantId: parsed.merchantId ?? null,
          merchantName: parsed.merchantName ?? null,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          hydrated: true,
        });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  persist: async () => {
    const { merchantId, merchantName, items } = get();
    await setItem(
      STORAGE_KEYS.CART,
      JSON.stringify({ merchantId, merchantName, items })
    );
  },
}));
