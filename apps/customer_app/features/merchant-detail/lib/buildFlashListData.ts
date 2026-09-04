import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem } from "@/services/merchant.service";
import type { PastOrderItem } from "@/components/store/StorePastOrderRow";
import type { MenuSheetScrollTarget } from "@/components/store/StoreMenuSheet";
import type {
  MerchantCategoryChip,
  MerchantFlashListItem,
  MenuSection,
  MerchantScrollIndexMap,
} from "../types";

export type BuildFlashListInput = {
  sections: MenuSection[];
  pastOrderItems: PastOrderItem[];
  comboPairs: ComboPair[];
  sectionStartingPrice: number | null;
  visibleOffersCount: number;
  /**
   * Whether to show the closed-store banner cell — a stable boolean, NOT the live
   * countdown string. The banner's own live text is owned by MerchantClosedBanner so a
   * 1s tick never invalidates this memoized list (and re-renders every row) every second.
   */
  showClosedBanner: boolean;
  /** Kitchen rush — show delay notice (only when store is open). */
  showRushBanner: boolean;
  menuPending: boolean;
  /** Row key / id of the last item added to cart — pairing strip renders below it only. */
  pairingAnchorKey: string | null;
  pairingCompanionItems: MenuItem[];
  /** Discovery inner page — skip the large store-info header (name/rating/offers). */
  hideInfoCard?: boolean;
  /** Masonry + rail for discovery only. Classic / grid-first keep list rows. */
  masonry?: boolean;
};

function itemMatchesPairingAnchor(
  item: MenuSection["data"][number],
  anchorKey: string
): boolean {
  return (
    item.listRowKey === anchorKey ||
    item.id === anchorKey ||
    (item.menuItemId != null && String(item.menuItemId) === anchorKey)
  );
}

export type BuildFlashListResult = {
  data: MerchantFlashListItem[];
  indexMap: MerchantScrollIndexMap;
};

export function buildCategoryChips(catalogSections: MenuSection[]): MerchantCategoryChip[] {
  const cats = catalogSections
    .filter((s) => !s.isSmart && !/large order/i.test(s.title))
    .map((sec, idx) => {
      const categoryId = sec.data[0]?.categoryId ?? null;
      const imageUrl =
        sec.data[0]?.categoryImageUrl?.trim() ||
        sec.data.find((item) => item.imageUrl?.trim())?.imageUrl?.trim() ||
        null;
      return {
        id: `cat-${categoryId ?? sec.title}-${idx}`,
        title: sec.title,
        imageUrl,
        scrollTarget: {
          kind: "category" as const,
          categoryId,
          categoryName: sec.title,
        },
      };
    });

  if (cats.length === 0) return [];

  return [
    {
      id: "cat-all",
      title: "All",
      scrollTarget: cats[0]!.scrollTarget,
    },
    ...cats,
  ];
}

export function buildFlashListData(input: BuildFlashListInput): BuildFlashListResult {
  const {
    sections,
    pastOrderItems,
    comboPairs,
    sectionStartingPrice,
    visibleOffersCount,
    showClosedBanner,
    showRushBanner,
    menuPending,
    pairingAnchorKey,
    pairingCompanionItems,
    hideInfoCard = false,
    masonry = false,
  } = input;

  const data: MerchantFlashListItem[] = [];
  const sectionByTitle = new Map<string, number>();
  const sectionByCategoryId = new Map<string, number>();
  const menuItemByKey = new Map<string, number>();
  let pastOrders: number | null = null;
  let startingAt: number | null = null;

  const push = (row: MerchantFlashListItem) => {
    data.push(row);
    return data.length - 1;
  };

  if (!masonry) {
    push({ type: "hero", key: "hero" });
  }
  if (!hideInfoCard) {
    push({ type: "info", key: "info" });
  }

  if (showClosedBanner) {
    push({ type: "closed_banner", key: "closed_banner" });
  } else if (showRushBanner) {
    push({ type: "rush_banner", key: "rush_banner" });
  }

  if (!hideInfoCard) {
    push({ type: "filter_bar", key: "filter_bar" });
  }

  if (pastOrderItems.length > 0) {
    pastOrders = push({ type: "past_orders", key: "past_orders", items: pastOrderItems });
  }

  if (comboPairs.length > 0) {
    push({ type: "combo_section", key: "combo_section", combos: comboPairs });
  }

  if (!hideInfoCard && sections.length > 0 && sectionStartingPrice != null) {
    startingAt = push({
      type: "section_lead",
      key: "section_lead",
      title: `Items starting at ₹${Math.round(sectionStartingPrice)}`,
      showCouponLink: visibleOffersCount > 0,
    });
  }

  if (menuPending) {
    push({ type: "menu_loading", key: "menu_loading" });
  } else {
    if (sections.length === 0) {
      push({ type: "empty_menu", key: "empty_menu" });
    } else {
      sections.forEach((sec, sectionIndex) => {
        if (masonry) {
          const masonryIdx = push({
            type: "menu_masonry",
            key: `menu_masonry-${sectionIndex}-${sec.title}`,
            title: sec.title,
            sectionIndex,
            items: sec.data,
          });
          if (!sectionByTitle.has(sec.title.trim().toLowerCase())) {
            sectionByTitle.set(sec.title.trim().toLowerCase(), masonryIdx);
          }
          const sectionCategoryId = sec.isSmart ? null : sec.data[0]?.categoryId ?? null;
          if (sectionCategoryId != null && !sectionByCategoryId.has(String(sectionCategoryId))) {
            sectionByCategoryId.set(String(sectionCategoryId), masonryIdx);
          }
          sec.data.forEach((item) => {
            menuItemByKey.set(item.listRowKey, masonryIdx);
            menuItemByKey.set(item.id, masonryIdx);
            if (item.menuItemId != null) {
              menuItemByKey.set(String(item.menuItemId), masonryIdx);
            }
          });

          const pairingAnchor = sec.data.find(
            (item) =>
              pairingAnchorKey != null &&
              pairingCompanionItems.length > 0 &&
              itemMatchesPairingAnchor(item, pairingAnchorKey)
          );
          if (pairingAnchor) {
            push({
              type: "pairing_strip",
              key: `pairing-${pairingAnchor.listRowKey}`,
              companions: pairingCompanionItems.map((c) => ({
                ...c,
                listRowKey: `${pairingAnchor.listRowKey}::pair::${c.id}`,
              })),
            });
          }
          return;
        }

        const headerKey = `hdr-${sectionIndex}-${sec.title}`;
        const headerIdx = push({
          type: "section_header",
          key: headerKey,
          title: sec.title,
          sectionIndex,
        });
        if (!sectionByTitle.has(sec.title.trim().toLowerCase())) {
          sectionByTitle.set(sec.title.trim().toLowerCase(), headerIdx);
        }
        const sectionCategoryId = sec.isSmart ? null : sec.data[0]?.categoryId ?? null;
        if (sectionCategoryId != null && !sectionByCategoryId.has(String(sectionCategoryId))) {
          sectionByCategoryId.set(String(sectionCategoryId), headerIdx);
        }

        sec.data.forEach((item, itemIndex) => {
          const isPairingAnchor =
            pairingAnchorKey != null &&
            pairingCompanionItems.length > 0 &&
            itemMatchesPairingAnchor(item, pairingAnchorKey);
          const rowIdx = push({
            type: "menu_item",
            key: item.listRowKey,
            item,
            sectionIndex,
            itemIndex,
            isLastInSection: itemIndex === sec.data.length - 1,
            showDivider: !isPairingAnchor,
          });
          menuItemByKey.set(item.listRowKey, rowIdx);
          menuItemByKey.set(item.id, rowIdx);
          if (item.menuItemId != null) {
            menuItemByKey.set(String(item.menuItemId), rowIdx);
          }
          if (isPairingAnchor) {
            push({
              type: "pairing_strip",
              key: `pairing-${item.listRowKey}`,
              companions: pairingCompanionItems.map((c) => ({
                ...c,
                listRowKey: `${item.listRowKey}::pair::${c.id}`,
              })),
            });
          }
        });
      });
    }
    push({ type: "footer", key: "footer" });
  }

  return {
    data,
    indexMap: {
      pastOrders,
      startingAt,
      sectionByTitle,
      sectionByCategoryId,
      menuItemByKey,
    },
  };
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
      // Prefer the id — two categories can share a display name, and a store can rename one.
      if (target.categoryId != null) {
        const byId = indexMap.sectionByCategoryId.get(String(target.categoryId));
        if (byId != null) return byId;
      }
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
