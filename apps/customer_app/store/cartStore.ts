/**
 * Cart global state - persisted locally.
 * Keyed by merchantId so cart is per-merchant (clear when switching merchant if desired).
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

export type CartItemAddon = {
  addonId: string;
  addonName: string;
  addonPrice: number;
  quantity: number;
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
  /** Base/variant price per unit (when item has variants); used for order payload. */
  basePrice?: number;
  variantId?: string;
  variantName?: string;
  addons?: CartItemAddon[];
};

/** Active cart context for floating cart (restaurant_id, name, totals, last_updated). */
export type ActiveCartContext = {
  restaurant_id: string | null;
  restaurant_name: string | null;
  total_items: number;
  total_price: number;
  last_updated_at: number;
};

type CartState = {
  merchantId: string | null;
  merchantName: string | null;
  items: CartItem[];
  lastUpdatedAt: number;
  hydrated: boolean;
  addItem: (merchantId: string, merchantName: string, item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (menuItemId: string, delta: number) => void;
  removeItem: (menuItemId: string) => void;
  clearCart: () => void;
  getActiveCartContext: () => ActiveCartContext;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
};

const defaultState = {
  merchantId: null,
  merchantName: null,
  items: [],
  lastUpdatedAt: 0,
  hydrated: false,
};

export const useCartStore = create<CartState>((set, get) => ({
  ...defaultState,

  addItem: (merchantId, merchantName, item, quantity = 1) => {
    const { items, merchantId: currentMerchant } = get();
    const now = Date.now();
    if (currentMerchant && currentMerchant !== merchantId) {
      set({ merchantId, merchantName, items: [{ ...item, quantity }], lastUpdatedAt: now });
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
      lastUpdatedAt: now,
    });
    get().persist();
  },

  updateQuantity: (menuItemId, delta) => {
    const { items } = get();
    const now = Date.now();
    const next = items
      .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0);
    const merchantId = next.length ? get().merchantId : null;
    const merchantName = next.length ? get().merchantName : null;
    set({ items: next, merchantId, merchantName, lastUpdatedAt: now });
    get().persist();
  },

  getActiveCartContext: (): ActiveCartContext => {
    const { merchantId, merchantName, items, lastUpdatedAt } = get();
    const total_items = items.reduce((n, i) => n + i.quantity, 0);
    const total_price = items.reduce((n, i) => n + i.price * i.quantity, 0);
    return {
      restaurant_id: merchantId,
      restaurant_name: merchantName,
      total_items,
      total_price,
      last_updated_at: lastUpdatedAt,
    };
  },

  removeItem: (menuItemId) => {
    get().updateQuantity(menuItemId, -999);
  },

  clearCart: () => {
    set({ ...defaultState, lastUpdatedAt: 0 });
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
          lastUpdatedAt: parsed.lastUpdatedAt ?? 0,
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
    const { merchantId, merchantName, items, lastUpdatedAt } = get();
    await setItem(
      STORAGE_KEYS.CART,
      JSON.stringify({ merchantId, merchantName, items, lastUpdatedAt })
    );
  },
}));
