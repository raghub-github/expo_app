/**
 * Shop / Marketplace cart – product-based, persisted.
 * Separate from food cart; used by Shop / Marketplace page.
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

export type ShopCartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageKey: string;
  cod: boolean;
};

type ShopCartState = {
  items: ShopCartItem[];
  hydrated: boolean;
  addItem: (item: Omit<ShopCartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (productId: string, delta: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
};

const defaultState = { items: [], hydrated: false };

export const useShopCartStore = create<ShopCartState>((set, get) => ({
  ...defaultState,

  addItem: (item, quantity = 1) => {
    const { items } = get();
    const existing = items.find((i) => i.productId === item.productId);
    const next = existing
      ? items.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + quantity } : i
        )
      : [...items, { ...item, quantity }];
    set({ items: next });
    get().persist();
  },

  updateQuantity: (productId, delta) => {
    const { items } = get();
    const next = items
      .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0);
    set({ items: next });
    get().persist();
  },

  removeItem: (productId) => {
    get().updateQuantity(productId, -999);
  },

  clearCart: () => {
    set(defaultState);
    get().persist();
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEYS.SHOP_CART);
      if (raw) {
        const parsed = JSON.parse(raw) as { items: ShopCartItem[] };
        set({
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
    const { items } = get();
    await setItem(STORAGE_KEYS.SHOP_CART, JSON.stringify({ items }));
  },
}));
