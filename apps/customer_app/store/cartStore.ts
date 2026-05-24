/**
 * Cart global state - persisted locally.
 * Keyed by merchantId so cart is per-merchant (clear when switching merchant if desired).
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

export type CartItemAddon = {
  addonId: string;
  /** merchant_menu_item_customizations.customization_id at add time */
  customizationId?: string;
  addonName: string;
  addonPrice: number;
  quantity: number;
  addonSizeValue?: string | null;
  addonSizeUnit?: string | null;
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
  /** First-line image for floating cart / UI (optional). */
  imageUrl?: string | null;
  /** Base/variant price per unit (when item has variants); used for order payload. */
  basePrice?: number;
  variantId?: string;
  variantName?: string;
  variantSizeValue?: string | null;
  variantSizeUnit?: string | null;
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

/** Snapshot of another restaurant's cart (when user switches store without checking out). */
export type StashedMerchantCart = {
  merchantName: string | null;
  merchantBannerUrl: string | null;
  items: CartItem[];
  lastUpdatedAt: number;
};

type CartState = {
  merchantId: string | null;
  merchantName: string | null;
  /** Hero banner / card image for cart UI when available. */
  merchantBannerUrl: string | null;
  items: CartItem[];
  /** Other merchants' carts kept when switching restaurant (multi-cart UI). */
  stashedCarts: Record<string, StashedMerchantCart>;
  lastUpdatedAt: number;
  hydrated: boolean;
  addItem: (
    merchantId: string,
    merchantName: string,
    item: Omit<CartItem, "quantity">,
    quantity?: number,
    merchantBannerUrl?: string | null,
  ) => void;
  updateQuantity: (menuItemId: string, delta: number) => void;
  removeItem: (menuItemId: string) => void;
  clearCart: () => void;
  /** Replace cart entirely — used for reorder flow. */
  setCartForReorder: (
    merchantId: string,
    merchantName: string,
    items: CartItem[],
    merchantBannerUrl?: string | null,
  ) => void;
  /**
   * Replace stored per-unit prices for every line whose menuItemId matches.
   * Used by the checkout screen to sync cart prices with the live menu API
   * after a commission rate change or merchant price edit — so the cart UI
   * stops showing a stale value the customer saw at add-time.
   */
  syncPricesFromMap: (pricesByMenuItemId: Record<string, number>) => void;
  getActiveCartContext: () => ActiveCartContext;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
};

const defaultState = {
  merchantId: null,
  merchantName: null,
  merchantBannerUrl: null as string | null,
  items: [] as CartItem[],
  stashedCarts: {} as Record<string, StashedMerchantCart>,
  lastUpdatedAt: 0,
  hydrated: false,
};

function mergeCartLine(items: CartItem[], line: CartItem): CartItem[] {
  const existing = items.find((i) => i.menuItemId === line.menuItemId);
  if (!existing) return [...items, line];
  return items.map((i) =>
    i.menuItemId === line.menuItemId
      ? {
          ...i,
          quantity: i.quantity + line.quantity,
          imageUrl: i.imageUrl ?? line.imageUrl ?? null,
        }
      : i,
  );
}

export const useCartStore = create<CartState>((set, get) => ({
  ...defaultState,

  addItem: (merchantId, merchantName, item, quantity = 1, merchantBannerUrl) => {
    const {
      items,
      merchantId: currentMerchant,
      merchantBannerUrl: prevBanner,
      merchantName: curName,
      stashedCarts,
    } = get();
    const now = Date.now();

    if (currentMerchant && currentMerchant !== merchantId) {
      const stash: Record<string, StashedMerchantCart> = { ...stashedCarts };
      if (items.length > 0) {
        stash[currentMerchant] = {
          merchantName: curName,
          merchantBannerUrl: prevBanner,
          items: items.map((i) => ({ ...i })),
          lastUpdatedAt: now,
        };
      }
      const restored = stash[merchantId];
      const restStash = { ...stash };
      delete restStash[merchantId];
      const line: CartItem = { ...item, quantity };
      const nextItems =
        restored && restored.items.length > 0
          ? mergeCartLine(
              restored.items.map((i) => ({ ...i })),
              line,
            )
          : [line];
      set({
        merchantId,
        merchantName,
        merchantBannerUrl: merchantBannerUrl ?? restored?.merchantBannerUrl ?? null,
        items: nextItems,
        stashedCarts: restStash,
        lastUpdatedAt: now,
      });
      get().persist();
      return;
    }

    const nextBanner = merchantBannerUrl ?? (currentMerchant === merchantId ? prevBanner : null) ?? null;
    const existing = items.find((i) => i.menuItemId === item.menuItemId);
    const next = existing
      ? items.map((i) =>
          i.menuItemId === item.menuItemId
            ? {
                ...i,
                quantity: i.quantity + quantity,
                imageUrl: i.imageUrl ?? item.imageUrl ?? null,
              }
            : i
        )
      : [...items, { ...item, quantity }];
    set({
      merchantId,
      merchantName,
      merchantBannerUrl: nextBanner,
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
    const merchantBannerUrl = next.length ? get().merchantBannerUrl : null;
    set({ items: next, merchantId, merchantName, merchantBannerUrl, lastUpdatedAt: now });
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

  syncPricesFromMap: (pricesByMenuItemId) => {
    const { items } = get();
    if (items.length === 0) return;
    let changed = false;
    const next = items.map((i) => {
      const baseMenuId = i.menuItemId.includes("_") ? i.menuItemId.split("_")[0]! : i.menuItemId;
      if (i.variantId || (i.addons?.length ?? 0) > 0 || i.menuItemId.includes("_")) {
        return i;
      }
      const fresh = pricesByMenuItemId[baseMenuId];
      if (fresh != null && Number.isFinite(fresh) && Math.abs(fresh - i.price) > 0.005) {
        changed = true;
        return { ...i, price: fresh, basePrice: fresh };
      }
      return i;
    });
    if (!changed) return;
    set({ items: next, lastUpdatedAt: Date.now() });
    get().persist();
  },

  clearCart: () => {
    // CRITICAL: keep `hydrated: true`. Spreading `defaultState` would reset
    // hydrated → false, and the root layout's `!cartHydrated` guard would
    // immediately swap the entire app to the teal splash screen — which is
    // exactly what stranded the user after Simulate Success / order placement.
    // The cart IS hydrated; we are clearing its CONTENTS, not unloading the store.
    set({
      merchantId: null,
      merchantName: null,
      merchantBannerUrl: null,
      items: [],
      stashedCarts: {},
      lastUpdatedAt: 0,
      // hydrated intentionally NOT touched — stays true
    });
    get().persist();
  },

  setCartForReorder: (merchantId, merchantName, items, merchantBannerUrl) => {
    const now = Date.now();
    set({
      merchantId,
      merchantName,
      merchantBannerUrl: merchantBannerUrl ?? null,
      items: items.map((i) => ({ ...i })),
      lastUpdatedAt: now,
    });
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
          merchantBannerUrl?: string | null;
          items: CartItem[];
          stashedCarts?: Record<string, StashedMerchantCart>;
          lastUpdatedAt?: number;
        };
        set({
          merchantId: parsed.merchantId ?? null,
          merchantName: parsed.merchantName ?? null,
          merchantBannerUrl: parsed.merchantBannerUrl ?? null,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          stashedCarts:
            parsed.stashedCarts && typeof parsed.stashedCarts === "object" ? parsed.stashedCarts : {},
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
    const { merchantId, merchantName, merchantBannerUrl, items, stashedCarts, lastUpdatedAt } = get();
    await setItem(
      STORAGE_KEYS.CART,
      JSON.stringify({ merchantId, merchantName, merchantBannerUrl, items, stashedCarts, lastUpdatedAt }),
    );
  },
}));
