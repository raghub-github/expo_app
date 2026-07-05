import { merchantService, type MenuItem } from "@/services/merchant.service";
import type { StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";

/** Load live menu prices — same source as merchant store page (`GET /menu`). */
export async function loadStoreMenuPriceMaps(
  storePublicIds: string[]
): Promise<Map<string, Map<string, MenuItem>>> {
  const out = new Map<string, Map<string, MenuItem>>();
  const unique = [...new Set(storePublicIds.filter((id) => id?.trim()))];
  await Promise.all(
    unique.map(async (storeId) => {
      try {
        const detail = await merchantService.getMerchantById(storeId);
        if (!detail?.menu?.length) return;
        out.set(storeId, new Map(detail.menu.map((m) => [m.id, m])));
      } catch {
        // keep grouped API prices for this store
      }
    })
  );
  return out;
}

export function applyMenuPricesToStores(
  stores: StoreFoodItemsUnderPrice[],
  menuByStore: Map<string, Map<string, MenuItem>>
): StoreFoodItemsUnderPrice[] {
  if (menuByStore.size === 0) return stores;
  return stores.map((store) => ({
    ...store,
    items: store.items.map((item) => {
      const menuItem = menuByStore.get(store.storePublicId)?.get(item.itemId);
      if (!menuItem) return item;
      const basePrice =
        menuItem.basePrice != null && menuItem.basePrice > menuItem.price
          ? menuItem.basePrice
          : null;
      return {
        ...item,
        price: menuItem.price,
        basePrice,
        discountPercentage: menuItem.discountPercentage ?? item.discountPercentage,
        isVeg: menuItem.isVeg,
        isPopular: menuItem.isPopular ?? item.isPopular,
      };
    }),
  }));
}
