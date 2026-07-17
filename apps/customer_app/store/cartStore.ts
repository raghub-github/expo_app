/**
 * Cart global state - persisted locally.
 * Keyed by merchantId so cart is per-merchant (clear when switching merchant if desired).
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";
import { captureCartDeliveryAnchor, type CartDeliveryAnchor } from "@/lib/cartDeliveryAnchor";

export type { CartDeliveryAnchor } from "@/lib/cartDeliveryAnchor";

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
  /**
   * false = already promoted (MRP / Boost / BOGO strike). Hint for UI;
   * billing server recomputes authoritatively.
   */
  isDiscountEligible?: boolean;
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
  /** Delivery coords when the cart was first populated — blocks checkout after address change. */
  deliveryAnchor: CartDeliveryAnchor | null;
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
  /** Refresh per-line promo eligibility (MRP / Boost) from checkout/menu. */
  syncDiscountEligibility: (eligibleByMenuItemId: Record<string, boolean>) => void;
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
  deliveryAnchor: null as CartDeliveryAnchor | null,
  hydrated: false,
};

let cartPersistTimer: ReturnType<typeof setTimeout> | null = null;
const CART_PERSIST_DEBOUNCE_MS = 180;

async function writeCartToStorage(state: {
  merchantId: string | null;
  merchantName: string | null;
  merchantBannerUrl: string | null;
  items: CartItem[];
  stashedCarts: Record<string, StashedMerchantCart>;
  lastUpdatedAt: number;
  deliveryAnchor: CartDeliveryAnchor | null;
}): Promise<void> {
  await setItem(
    STORAGE_KEYS.CART,
    JSON.stringify({
      merchantId: state.merchantId,
      merchantName: state.merchantName,
      merchantBannerUrl: state.merchantBannerUrl,
      items: state.items,
      stashedCarts: state.stashedCarts,
      lastUpdatedAt: state.lastUpdatedAt,
      deliveryAnchor: state.deliveryAnchor,
    })
  );
}

function queueCartPersist(get: () => CartState): void {
  if (cartPersistTimer) clearTimeout(cartPersistTimer);
  cartPersistTimer = setTimeout(() => {
    cartPersistTimer = null;
    const {
      merchantId,
      merchantName,
      merchantBannerUrl,
      items,
      stashedCarts,
      lastUpdatedAt,
      deliveryAnchor,
    } = get();
    void writeCartToStorage({
      merchantId,
      merchantName,
      merchantBannerUrl,
      items,
      stashedCarts,
      lastUpdatedAt,
      deliveryAnchor,
    });
  }, CART_PERSIST_DEBOUNCE_MS);
}

function flushCartPersistNow(get: () => CartState): Promise<void> {
  if (cartPersistTimer) {
    clearTimeout(cartPersistTimer);
    cartPersistTimer = null;
  }
  const {
    merchantId,
    merchantName,
    merchantBannerUrl,
    items,
    stashedCarts,
    lastUpdatedAt,
    deliveryAnchor,
  } = get();
  return writeCartToStorage({
    merchantId,
    merchantName,
    merchantBannerUrl,
    items,
    stashedCarts,
    lastUpdatedAt,
    deliveryAnchor,
  });
}

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
    const keepDeliveryAnchor = get().deliveryAnchor;

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
      const restoringStash = !!(restored && restored.items.length > 0);
      const hadActiveItems = items.length > 0;
      set({
        merchantId,
        merchantName,
        merchantBannerUrl: merchantBannerUrl ?? restored?.merchantBannerUrl ?? null,
        items: nextItems,
        stashedCarts: restStash,
        lastUpdatedAt: now,
        deliveryAnchor:
          hadActiveItems || restoringStash
            ? keepDeliveryAnchor
            : captureCartDeliveryAnchor(),
      });
      queueCartPersist(get);
      return;
    }

    const nextBanner = merchantBannerUrl ?? (currentMerchant === merchantId ? prevBanner : null) ?? null;
    const existing = items.find((i) => i.menuItemId === item.menuItemId);
    const cartWasEmpty = items.length === 0;
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
      deliveryAnchor: cartWasEmpty ? captureCartDeliveryAnchor() : keepDeliveryAnchor,
    });
    queueCartPersist(get);
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
    queueCartPersist(get);
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
    queueCartPersist(get);
  },

  syncDiscountEligibility: (eligibleByMenuItemId) => {
    const { items } = get();
    if (items.length === 0) return;
    let changed = false;
    const next = items.map((i) => {
      const baseId = i.menuItemId.includes("::")
        ? i.menuItemId.split("::")[0]!
        : i.menuItemId.includes("_")
          ? i.menuItemId.split("_")[0]!
          : i.menuItemId;
      const flagged =
        eligibleByMenuItemId[i.menuItemId] ?? eligibleByMenuItemId[baseId];
      if (flagged == null || flagged === i.isDiscountEligible) return i;
      changed = true;
      return { ...i, isDiscountEligible: flagged };
    });
    if (!changed) return;
    set({ items: next, lastUpdatedAt: Date.now() });
    queueCartPersist(get);
  },

  clearCart: () => {
    useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
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
      deliveryAnchor: null,
      // hydrated intentionally NOT touched — stays true
    });
    void flushCartPersistNow(get);
  },

  setCartForReorder: (merchantId, merchantName, items, merchantBannerUrl) => {
    const now = Date.now();
    set({
      merchantId,
      merchantName,
      merchantBannerUrl: merchantBannerUrl ?? null,
      items: items.map((i) => ({ ...i })),
      lastUpdatedAt: now,
      deliveryAnchor: captureCartDeliveryAnchor(),
    });
    void flushCartPersistNow(get);
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
          deliveryAnchor?: CartDeliveryAnchor | null;
        };
        set({
          merchantId: parsed.merchantId ?? null,
          merchantName: parsed.merchantName ?? null,
          merchantBannerUrl: parsed.merchantBannerUrl ?? null,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          stashedCarts:
            parsed.stashedCarts && typeof parsed.stashedCarts === "object" ? parsed.stashedCarts : {},
          lastUpdatedAt: parsed.lastUpdatedAt ?? 0,
          deliveryAnchor: parsed.deliveryAnchor ?? null,
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
    await flushCartPersistNow(get);
  },
}));
