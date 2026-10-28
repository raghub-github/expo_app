/**
 * Validate + restore a Recently Removed cart line via the existing cart store.
 */

import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";
import { useCartStore } from "@/store/cartStore";
import { cartItemBaseId } from "@/lib/cart-line-identity";
import { getCachedMenuItemFullConfig } from "@/lib/menu-item-config-cache";
import { resolveFullConfigItemId } from "@/lib/menuItemFullConfigFallback";
import {
  recentlyRemovedBaseMenuId,
  type RecentlyRemovedEntry,
} from "@/lib/recentlyRemoved";

export type RestoreRecentlyRemovedResult =
  | {
      ok: true;
      priceChanged: boolean;
      previousPrice: number;
      currentPrice: number;
      restoredQty: number;
    }
  | {
      ok: false;
      reason:
        | "wrong_store"
        | "store_unavailable"
        | "item_unavailable"
        | "variant_unavailable"
        | "addon_unavailable"
        | "network"
        | "busy";
      message: string;
    };

function findMenuItem(
  menu: MenuItem[] | undefined,
  baseId: string
): MenuItem | undefined {
  if (!menu?.length || !baseId) return undefined;
  return menu.find(
    (m) => m.id === baseId || (m.menuItemId != null && String(m.menuItemId) === baseId)
  );
}

function computeCustomizedUnitPrice(
  config: MenuItemFullConfig,
  entry: RecentlyRemovedEntry
): number | null {
  const variantId = (entry.line.variantId ?? "").trim();
  let unit = Number(config.item.price);
  if (variantId) {
    const variant = (config.variants ?? []).find((v) => String(v.id) === variantId);
    if (!variant) return null;
    unit = Number(variant.price);
  }
  for (const a of entry.line.addons ?? []) {
    const addonId = String(a.addonId ?? "").trim();
    if (!addonId) continue;
    let found: { price: number } | undefined;
    for (const c of config.customizations ?? []) {
      found = (c.addons ?? []).find((x) => String(x.id) === addonId);
      if (found) break;
    }
    if (!found) return null;
    const addonQty = Math.max(1, Number(a.quantity) || 1);
    unit += Number(found.price) * addonQty;
  }
  return Number.isFinite(unit) ? unit : null;
}

async function loadFullConfig(
  merchantId: string,
  menuItem: MenuItem
): Promise<MenuItemFullConfig | null> {
  const itemId = resolveFullConfigItemId(menuItem);
  const cached = getCachedMenuItemFullConfig(merchantId, itemId);
  if (cached) return cached;
  try {
    return await merchantService.getMenuItemFullConfig(merchantId, itemId);
  } catch {
    return null;
  }
}

export async function restoreRecentlyRemovedEntry(args: {
  entry: RecentlyRemovedEntry;
  /** Live menu for the active cart merchant (preferred). */
  menu?: MenuItem[] | undefined;
  /** When set, must match entry.merchantId (or empty cart). */
  activeMerchantId: string | null;
}): Promise<RestoreRecentlyRemovedResult> {
  const { entry, menu, activeMerchantId } = args;
  const cart = useCartStore.getState();
  const activeId = (activeMerchantId ?? cart.merchantId ?? "").trim() || null;

  if (activeId && activeId !== entry.merchantId) {
    return {
      ok: false,
      reason: "wrong_store",
      message: "This item belongs to another restaurant.",
    };
  }

  let liveMenu = menu;
  if (!liveMenu?.length) {
    try {
      const detail = await merchantService.getMerchantById(entry.merchantId);
      liveMenu = detail?.menu;
      if (!detail) {
        return {
          ok: false,
          reason: "store_unavailable",
          message: "This restaurant is unavailable right now.",
        };
      }
    } catch {
      return {
        ok: false,
        reason: "network",
        message: "Couldn't reach the restaurant. Check your connection and try again.",
      };
    }
  }

  const baseId = recentlyRemovedBaseMenuId(entry.line);
  const menuItem = findMenuItem(liveMenu, baseId);
  if (!menuItem || menuItem.inStock === false) {
    return {
      ok: false,
      reason: "item_unavailable",
      message: "This item is no longer available.",
    };
  }

  const previousPrice = Number(entry.line.price) || 0;
  let currentPrice = previousPrice;
  let priceChanged = false;

  const hasOptions =
    !!(entry.line.variantId || (entry.line.addons?.length ?? 0) > 0) ||
    !!(menuItem.hasVariants || menuItem.hasAddons || menuItem.hasCustomizations);

  if (hasOptions && (entry.line.variantId || (entry.line.addons?.length ?? 0) > 0)) {
    const config = await loadFullConfig(entry.merchantId, menuItem);
    if (!config) {
      return {
        ok: false,
        reason: "network",
        message: "Couldn't verify this item. Please try again.",
      };
    }
    const priced = computeCustomizedUnitPrice(config, entry);
    if (priced == null) {
      const missingVariant =
        !!(entry.line.variantId ?? "").trim() &&
        !(config.variants ?? []).some((v) => String(v.id) === String(entry.line.variantId).trim());
      return {
        ok: false,
        reason: missingVariant ? "variant_unavailable" : "addon_unavailable",
        message: missingVariant
          ? "The selected size or variant is no longer available."
          : "One or more add-ons are no longer available.",
      };
    }
    currentPrice = priced;
    priceChanged = Math.abs(currentPrice - previousPrice) > 0.005;
  } else {
    const live = Number(menuItem.price);
    if (Number.isFinite(live) && live >= 0) {
      currentPrice = live;
      priceChanged = Math.abs(currentPrice - previousPrice) > 0.005;
    }
  }

  const restoredQty = Math.max(1, Math.round(entry.quantity) || 1);
  const billingMenuItemId =
    menuItem.menuItemId != null && Number.isFinite(menuItem.menuItemId) && menuItem.menuItemId > 0
      ? String(menuItem.menuItemId)
      : cartItemBaseId(entry.line.menuItemId);

  useCartStore.getState().addItem(
    entry.merchantId,
    entry.merchantName,
    {
      menuItemId: billingMenuItemId,
      name: entry.line.name || menuItem.name,
      price: currentPrice,
      isVeg: entry.line.isVeg,
      imageUrl: entry.line.imageUrl ?? menuItem.imageUrl ?? null,
      basePrice: entry.line.basePrice ?? menuItem.price,
      variantId: entry.line.variantId,
      variantName: entry.line.variantName,
      variantSizeValue: entry.line.variantSizeValue,
      variantSizeUnit: entry.line.variantSizeUnit,
      variantSizePreset: entry.line.variantSizePreset,
      addons: entry.line.addons,
      specialInstructions: entry.line.specialInstructions,
      isDiscountEligible: entry.line.isDiscountEligible,
    },
    restoredQty,
    entry.merchantBannerUrl,
    entry.merchantStoreType
  );

  return {
    ok: true,
    priceChanged,
    previousPrice,
    currentPrice,
    restoredQty,
  };
}
