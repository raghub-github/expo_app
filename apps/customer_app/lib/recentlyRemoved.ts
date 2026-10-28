/**
 * Recently Removed — pure helpers for cart restore history.
 * Bounded, merchant-scoped, newest-first. No persistence / timers.
 */

import type { CartItem, CartItemAddon } from "@/store/cartStore";
import { buildCartLineId, cartItemBaseId } from "@/lib/cart-line-identity";

/** Initial release: keep at most two unique item configurations. */
export const MAX_RECENTLY_REMOVED = 2;

export type RecentlyRemovedLineSnapshot = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  isVeg: boolean;
  imageUrl?: string | null;
  basePrice?: number;
  variantId?: string;
  variantName?: string;
  variantSizeValue?: string | null;
  variantSizeUnit?: string | null;
  variantSizePreset?: string | null;
  addons?: CartItemAddon[];
  specialInstructions?: string | null;
  isDiscountEligible?: boolean;
};

export type RecentlyRemovedEntry = {
  /** Stable key for list rendering (config identity + merchant). */
  entryKey: string;
  merchantId: string;
  merchantName: string;
  merchantBannerUrl: string | null;
  merchantStoreType: string | null;
  removedAt: number;
  /** Quantity at the moment of removal (restored when possible). */
  quantity: number;
  line: RecentlyRemovedLineSnapshot;
};

export function recentlyRemovedConfigKey(item: {
  menuItemId: string;
  variantId?: string | null;
  addons?: CartItemAddon[];
  specialInstructions?: string | null;
}): string {
  return buildCartLineId({
    menuItemId: item.menuItemId,
    variantId: item.variantId,
    addons: item.addons,
    specialInstructions: item.specialInstructions,
  });
}

export function snapshotCartItemForRecentlyRemoved(item: CartItem): RecentlyRemovedLineSnapshot {
  const rawImage = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
  return {
    lineId: item.lineId,
    menuItemId: item.menuItemId,
    name: item.name,
    price: item.price,
    isVeg: item.isVeg,
    imageUrl: rawImage || null,
    basePrice: item.basePrice,
    variantId: item.variantId,
    variantName: item.variantName,
    variantSizeValue: item.variantSizeValue,
    variantSizeUnit: item.variantSizeUnit,
    variantSizePreset: item.variantSizePreset,
    addons: item.addons?.map((a) => ({ ...a })),
    specialInstructions: item.specialInstructions ?? null,
    isDiscountEligible: item.isDiscountEligible,
  };
}

export function buildRecentlyRemovedEntry(args: {
  merchantId: string;
  merchantName: string | null;
  merchantBannerUrl?: string | null;
  merchantStoreType?: string | null;
  item: CartItem;
  quantity: number;
  removedAt?: number;
}): RecentlyRemovedEntry | null {
  const merchantId = String(args.merchantId ?? "").trim();
  if (!merchantId) return null;
  const qty = Math.max(1, Math.round(args.quantity) || 1);
  const line = snapshotCartItemForRecentlyRemoved(args.item);
  const configKey = recentlyRemovedConfigKey(line);
  if (!configKey) return null;
  return {
    entryKey: `${merchantId}::${configKey}`,
    merchantId,
    merchantName: (args.merchantName ?? "").trim() || "Restaurant",
    merchantBannerUrl: args.merchantBannerUrl ?? null,
    merchantStoreType: args.merchantStoreType ?? null,
    removedAt: args.removedAt ?? Date.now(),
    quantity: qty,
    line,
  };
}

/**
 * Insert or bump an entry: newest first, dedupe by config, cap at maxEntries.
 */
export function pushRecentlyRemovedEntry(
  entries: RecentlyRemovedEntry[],
  next: RecentlyRemovedEntry,
  maxEntries: number = MAX_RECENTLY_REMOVED
): RecentlyRemovedEntry[] {
  const withoutDup = entries.filter((e) => e.entryKey !== next.entryKey);
  return [next, ...withoutDup].slice(0, Math.max(1, maxEntries));
}

export function filterRecentlyRemovedByMerchant(
  entries: RecentlyRemovedEntry[],
  merchantId: string | null | undefined
): RecentlyRemovedEntry[] {
  const id = String(merchantId ?? "").trim();
  if (!id) return [];
  return entries.filter((e) => e.merchantId === id);
}

export function dropRecentlyRemovedByMerchant(
  entries: RecentlyRemovedEntry[],
  merchantId: string
): RecentlyRemovedEntry[] {
  const id = String(merchantId ?? "").trim();
  if (!id) return entries;
  return entries.filter((e) => e.merchantId !== id);
}

export function dropRecentlyRemovedEntry(
  entries: RecentlyRemovedEntry[],
  entryKey: string
): RecentlyRemovedEntry[] {
  const key = String(entryKey ?? "").trim();
  if (!key) return entries;
  return entries.filter((e) => e.entryKey !== key);
}

/** Variant / addon subtitle for compact cards. */
export function formatRecentlyRemovedVariantSummary(line: RecentlyRemovedLineSnapshot): string | null {
  const parts: string[] = [];
  const variant = (line.variantName ?? "").trim();
  if (variant) parts.push(variant);
  for (const a of line.addons ?? []) {
    const name = (a.addonName ?? "").trim();
    if (name) parts.push(name);
  }
  const note = (line.specialInstructions ?? "").trim();
  if (note) parts.push(note);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function recentlyRemovedBaseMenuId(line: RecentlyRemovedLineSnapshot): string {
  return cartItemBaseId(line.menuItemId);
}
