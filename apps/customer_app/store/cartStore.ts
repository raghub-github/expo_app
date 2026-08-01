/**
 * Cart global state - persisted locally.
 * Keyed by merchantId so cart is per-merchant (clear when switching merchant if desired).
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";
import { captureCartDeliveryAnchor, type CartDeliveryAnchor } from "@/lib/cartDeliveryAnchor";
import {
  buildCartLineId,
  buildCompositeMenuItemId,
  cartItemBaseId,
  cartLinesMatch,
  hydrateCartLine,
} from "@/lib/cart-line-identity";
import { normalizeOrderItemSpecialInstructions } from "@/lib/order-item-special-instructions";
import { cartQtyDebug } from "@/lib/cartQtyDebug";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";

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
  /** Stable line identity for qty updates / checkout edits. */
  lineId: string;
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
  /** Item-level cooking / special instructions (max 100 chars). */
  specialInstructions?: string | null;
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

type CartLineInput = Omit<CartItem, "quantity" | "lineId"> & { lineId?: string };

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
    item: CartLineInput,
    quantity?: number,
    merchantBannerUrl?: string | null,
  ) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  /**
   * Drop cart lines whose base menu item id is no longer sellable (locked / OOS /
   * deleted / filtered out of the live customer menu). Used after menu delta sync.
   */
  removeUnavailableMenuItems: (merchantId: string, availableMenuItemIds: Set<string>) => number;
  /** Atomic line replace — used by checkout edit flows. */
  replaceLine: (lineId: string, next: CartLineInput, quantity: number) => void;
  /** Partial line update (e.g. instruction-only edit). */
  updateLine: (lineId: string, patch: Partial<CartLineInput>) => void;
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

function normalizeCartLineInput(item: CartLineInput, quantity: number): CartItem {
  const specialInstructions = normalizeOrderItemSpecialInstructions(item.specialInstructions);
  const addonIds = (item.addons ?? []).map((a) => String(a.addonId).trim()).filter(Boolean);
  const baseMenuItemId = cartItemBaseId(item.menuItemId);
  const menuItemId =
    item.variantId || addonIds.length > 0
      ? buildCompositeMenuItemId({
          baseMenuItemId,
          variantId: item.variantId,
          addonIds,
        })
      : baseMenuItemId;
  const line: CartItem = {
    ...item,
    menuItemId,
    specialInstructions,
    quantity: Math.max(1, quantity),
    lineId: buildCartLineId({
      menuItemId,
      variantId: item.variantId,
      addons: item.addons,
      specialInstructions,
    }),
  };
  return hydrateCartLine(line);
}

function findLineIndex(items: CartItem[], lineKey: string): number {
  return items.findIndex((i) => i.lineId === lineKey || i.menuItemId === lineKey);
}

function mergeCartLine(items: CartItem[], line: CartItem): CartItem[] {
  const idx = items.findIndex((i) => cartLinesMatch(i, line));
  if (idx < 0) return [...items, line];
  return items.map((i, iIdx) =>
    iIdx === idx
      ? {
          ...i,
          quantity: i.quantity + line.quantity,
          imageUrl: i.imageUrl ?? line.imageUrl ?? null,
        }
      : i,
  );
}

function maybeCaptureDeliveryAnchor(get: () => CartState, set: (partial: Partial<CartState>) => void, cartWasEmpty: boolean): void {
  if (!cartWasEmpty || get().deliveryAnchor) return;
  queueMicrotask(() => {
    const anchor = captureCartDeliveryAnchor();
    if (!anchor) return;
    const s = get();
    if (s.items.length === 0 || s.deliveryAnchor) return;
    set({ deliveryAnchor: anchor });
  });
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
    const qty = Math.max(1, quantity);
    const line = normalizeCartLineInput(item, qty);
    cartQtyDebug("store_addItem", {
      merchantId,
      menuItemId: line.menuItemId,
      lineId: line.lineId,
      addQty: qty,
      beforeLines: items.length,
      beforeTotalQty: items.reduce((n, i) => n + i.quantity, 0),
    });

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
      const nextItems =
        restored && restored.items.length > 0
          ? mergeCartLine(
              restored.items.map((i) => hydrateCartLine(i)),
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
        deliveryAnchor: keepDeliveryAnchor,
      });
      if (!hadActiveItems && !restoringStash) {
        maybeCaptureDeliveryAnchor(get, set, true);
      }
      queueCartPersist(get);
      return;
    }

    const nextBanner = merchantBannerUrl ?? (currentMerchant === merchantId ? prevBanner : null) ?? null;
    const existingIdx = items.findIndex((i) => cartLinesMatch(i, line));
    const cartWasEmpty = items.length === 0;
    const next =
      existingIdx >= 0
        ? items.map((i, idx) =>
            idx === existingIdx
              ? {
                  ...i,
                  quantity: i.quantity + line.quantity,
                  imageUrl: i.imageUrl ?? line.imageUrl ?? null,
                }
              : i,
          )
        : [...items, line];
    set({
      merchantId,
      merchantName,
      merchantBannerUrl: nextBanner,
      items: next,
      lastUpdatedAt: now,
      deliveryAnchor: keepDeliveryAnchor,
    });
    if (cartWasEmpty) {
      maybeCaptureDeliveryAnchor(get, set, true);
    }
    queueCartPersist(get);
  },

  updateQuantity: (lineId, delta) => {
    const { items } = get();
    const now = Date.now();
    const idx = findLineIndex(items, lineId);
    if (idx < 0) {
      cartQtyDebug("store_updateQuantity", {
        lineId,
        delta,
        result: "noop_missing_line",
      });
      return;
    }
    const prevQty = items[idx]?.quantity ?? 0;
    const next = items
      .map((i, iIdx) => (iIdx === idx ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0);
    const removed = next.length < items.length || (prevQty + delta) <= 0;
    cartQtyDebug("store_updateQuantity", {
      lineId,
      delta,
      prevQty,
      nextQty: removed ? 0 : prevQty + delta,
      removed,
    });
    if (removed) {
      cartQtyDebug("store_removeItem", { lineId, prevQty, delta });
    }
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

  removeItem: (lineId) => {
    get().updateQuantity(lineId, -999);
  },

  removeUnavailableMenuItems: (merchantId, availableMenuItemIds) => {
    const state = get();
    if (
      !merchantId ||
      !merchantCartMatchesRoute(state.merchantId, merchantId) ||
      state.items.length === 0
    ) {
      return 0;
    }
    // Empty available set is treated as "unknown" — never mass-delete the cart.
    if (availableMenuItemIds.size === 0) return 0;

    const next = state.items.filter((i) => {
      const base = cartItemBaseId(i.menuItemId);
      if (availableMenuItemIds.has(base) || availableMenuItemIds.has(i.menuItemId)) {
        return true;
      }
      // Composite lines: base_variant_addons — accept if any available id prefixes the line.
      for (const id of availableMenuItemIds) {
        if (i.menuItemId === id || i.menuItemId.startsWith(`${id}_`)) return true;
      }
      return false;
    });
    const removed = state.items.length - next.length;
    if (removed <= 0) return 0;
    if (next.length === 0) {
      set({
        ...defaultState,
        stashedCarts: state.stashedCarts,
        hydrated: state.hydrated,
        lastUpdatedAt: Date.now(),
      });
    } else {
      set({ items: next, lastUpdatedAt: Date.now() });
    }
    queueCartPersist(get);
    return removed;
  },

  replaceLine: (lineId, nextItem, quantity) => {
    const { items } = get();
    const idx = findLineIndex(items, lineId);
    if (idx < 0) return;
    const replacement = normalizeCartLineInput(nextItem, quantity);
    const mergeIdx = items.findIndex((i, iIdx) => iIdx !== idx && cartLinesMatch(i, replacement));
    let next: CartItem[];
    if (mergeIdx >= 0) {
      next = items
        .map((i, iIdx) => {
          if (iIdx === mergeIdx) {
            return { ...i, quantity: i.quantity + replacement.quantity };
          }
          return i;
        })
        .filter((_, iIdx) => iIdx !== idx);
    } else {
      next = items.map((i, iIdx) => (iIdx === idx ? replacement : i));
    }
    set({ items: next, lastUpdatedAt: Date.now() });
    queueCartPersist(get);
  },

  updateLine: (lineId, patch) => {
    const { items } = get();
    const idx = findLineIndex(items, lineId);
    if (idx < 0) return;
    const current = items[idx]!;
    const merged = normalizeCartLineInput(
      {
        ...current,
        ...patch,
        menuItemId: patch.menuItemId ?? current.menuItemId,
        addons: patch.addons ?? current.addons,
      },
      current.quantity,
    );
    const without = items.filter((_, iIdx) => iIdx !== idx);
    const mergeIdx = without.findIndex((i) => cartLinesMatch(i, merged));
    const next =
      mergeIdx >= 0
        ? without.map((i, iIdx) =>
            iIdx === mergeIdx ? { ...i, quantity: i.quantity + merged.quantity } : i,
          )
        : [...without, merged];
    set({ items: next, lastUpdatedAt: Date.now() });
    queueCartPersist(get);
  },

  syncPricesFromMap: (pricesByMenuItemId) => {
    const { items } = get();
    if (items.length === 0) return;
    let changed = false;
    const next = items.map((i) => {
      const baseMenuId = cartItemBaseId(i.menuItemId);
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
      const baseId = cartItemBaseId(i.menuItemId);
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
    set({
      merchantId: null,
      merchantName: null,
      merchantBannerUrl: null,
      items: [],
      stashedCarts: {},
      lastUpdatedAt: 0,
      deliveryAnchor: null,
    });
    void flushCartPersistNow(get);
  },

  setCartForReorder: (merchantId, merchantName, items, merchantBannerUrl) => {
    const now = Date.now();
    set({
      merchantId,
      merchantName,
      merchantBannerUrl: merchantBannerUrl ?? null,
      items: items.map((i) => hydrateCartLine(i)),
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
        const hydratedItems = Array.isArray(parsed.items)
          ? parsed.items.map((i) => hydrateCartLine(i))
          : [];
        const stashed =
          parsed.stashedCarts && typeof parsed.stashedCarts === "object"
            ? Object.fromEntries(
                Object.entries(parsed.stashedCarts).map(([k, v]) => [
                  k,
                  {
                    ...v,
                    items: Array.isArray(v.items) ? v.items.map((i) => hydrateCartLine(i)) : [],
                  },
                ]),
              )
            : {};
        set({
          merchantId: parsed.merchantId ?? null,
          merchantName: parsed.merchantName ?? null,
          merchantBannerUrl: parsed.merchantBannerUrl ?? null,
          items: hydratedItems,
          stashedCarts: stashed,
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
