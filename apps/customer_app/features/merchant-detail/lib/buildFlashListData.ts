import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem } from "@/services/merchant.service";
import type { PastOrderItem } from "@/components/store/StorePastOrderRow";
import type { MenuSheetScrollTarget } from "@/components/store/StoreMenuSheet";
import { ESTIMATED_ITEM_SIZES } from "../constants/layout";
import type {
  MerchantCategoryChip,
  MerchantFlashListItem,
  MenuSection,
  MerchantScrollIndexMap,
} from "../types";

/** Row types virtualized in the FlashList body (below the non-virtualized header). */
export const FLASH_LIST_BODY_TYPES = new Set<MerchantFlashListItem["type"]>([
  "section_header",
  "menu_item",
  "menu_skeleton",
  "empty_menu",
  "footer",
]);

export type SplitFlashListRows = {
  headerRows: MerchantFlashListItem[];
  listRows: MerchantFlashListItem[];
  headerRowCount: number;
};

export function splitFlashListRows(data: MerchantFlashListItem[]): SplitFlashListRows {
  const splitAt = data.findIndex((row) => FLASH_LIST_BODY_TYPES.has(row.type));
  if (splitAt < 0) {
    return { headerRows: data, listRows: [], headerRowCount: data.length };
  }
  return {
    headerRows: data.slice(0, splitAt),
    listRows: data.slice(splitAt),
    headerRowCount: splitAt,
  };
}

export function getFlashListHeaderRowCount(data: MerchantFlashListItem[]): number {
  return splitFlashListRows(data).headerRowCount;
}

export function toFlashListBodyIndex(
  flatIndex: number,
  headerRowCount: number
): number | null {
  const listIndex = flatIndex - headerRowCount;
  return listIndex < 0 ? null : listIndex;
}

export type BuildFlashListInput = {
  sections: MenuSection[];
  pastOrderItems: PastOrderItem[];
  comboPairs: ComboPair[];
  sectionStartingPrice: number | null;
  visibleOffersCount: number;
  closedBannerMessage: string | null;
  menuPending: boolean;
};

export type BuildFlashListResult = {
  data: MerchantFlashListItem[];
  indexMap: MerchantScrollIndexMap;
};

export function buildCategoryChips(catalogSections: MenuSection[]): MerchantCategoryChip[] {
  return catalogSections
    .filter((s) => !s.isSmart && !/large order/i.test(s.title))
    .map((sec, idx) => {
      const categoryId = sec.data[0]?.categoryId ?? null;
      return {
        id: `cat-${categoryId ?? sec.title}-${idx}`,
        title: sec.title,
        scrollTarget: {
          kind: "category" as const,
          categoryId,
          categoryName: sec.title,
        },
      };
    });
}

export function buildFlashListData(input: BuildFlashListInput): BuildFlashListResult {
  const {
    sections,
    pastOrderItems,
    comboPairs,
    sectionStartingPrice,
    visibleOffersCount,
    closedBannerMessage,
    menuPending,
  } = input;

  const data: MerchantFlashListItem[] = [];
  const sectionByTitle = new Map<string, number>();
  const menuItemByKey = new Map<string, number>();
  let pastOrders: number | null = null;
  let startingAt: number | null = null;

  const push = (row: MerchantFlashListItem) => {
    data.push(row);
    return data.length - 1;
  };

  push({ type: "hero", key: "hero" });
  push({ type: "info", key: "info" });

  if (closedBannerMessage) {
    push({ type: "closed_banner", key: "closed_banner", message: closedBannerMessage });
  }

  push({ type: "filter_bar", key: "filter_bar" });

  if (pastOrderItems.length > 0) {
    pastOrders = push({ type: "past_orders", key: "past_orders", items: pastOrderItems });
  }

  if (comboPairs.length > 0) {
    push({ type: "combo_section", key: "combo_section", combos: comboPairs });
  }

  if (sections.length > 0 && sectionStartingPrice != null) {
    startingAt = push({
      type: "section_lead",
      key: "section_lead",
      title: `Items starting at ₹${Math.round(sectionStartingPrice)}`,
      showCouponLink: visibleOffersCount > 0,
    });
  }

  if (menuPending) {
    for (let i = 0; i < 5; i++) {
      push({ type: "menu_skeleton", key: `skel-${i}` });
    }
  } else if (sections.length === 0) {
    push({ type: "empty_menu", key: "empty_menu" });
  } else {
    sections.forEach((sec, sectionIndex) => {
      const headerKey = `hdr-${sectionIndex}-${sec.title}`;
      const headerIdx = push({
        type: "section_header",
        key: headerKey,
        title: sec.title,
        sectionIndex,
      });
      sectionByTitle.set(sec.title.trim().toLowerCase(), headerIdx);

      sec.data.forEach((item, itemIndex) => {
        const rowIdx = push({
          type: "menu_item",
          key: item.listRowKey,
          item,
          sectionIndex,
          itemIndex,
          isLastInSection: itemIndex === sec.data.length - 1,
        });
        menuItemByKey.set(item.listRowKey, rowIdx);
        menuItemByKey.set(item.id, rowIdx);
        if (item.menuItemId != null) {
          menuItemByKey.set(String(item.menuItemId), rowIdx);
        }
      });
    });
  }

  push({ type: "footer", key: "footer" });

  return {
    data,
    indexMap: {
      pastOrders,
      startingAt,
      sectionByTitle,
      menuItemByKey,
    },
  };
}

export function getFlashItemType(item: MerchantFlashListItem): string {
  return item.type;
}

export function getFlashItemSize(item: MerchantFlashListItem): number {
  return ESTIMATED_ITEM_SIZES[item.type] ?? ESTIMATED_ITEM_SIZES.menu_item;
}

export function findFlatIndexForScrollTarget(
  indexMap: MerchantScrollIndexMap,
  target: MenuSheetScrollTarget
): number | null {
  switch (target.kind) {
    case "past-orders":
      return indexMap.pastOrders;
    case "starting-at":
      return indexMap.startingAt;
    case "section-title": {
      const want = target.title.trim().toLowerCase();
      return indexMap.sectionByTitle.get(want) ?? null;
    }
    case "category": {
      const normName = target.categoryName?.trim().toLowerCase();
      if (normName) {
        const hit = indexMap.sectionByTitle.get(normName);
        if (hit != null) return hit;
      }
      return null;
    }
    case "menu-item": {
      if (target.itemId) {
        const byId = indexMap.menuItemByKey.get(target.itemId);
        if (byId != null) return byId;
      }
      if (target.menuItemId != null) {
        return indexMap.menuItemByKey.get(String(target.menuItemId)) ?? null;
      }
      return null;
    }
    default:
      return null;
  }
}
