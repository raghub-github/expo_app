import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem } from "@/services/merchant.service";
import type { PastOrderItem } from "@/components/store/StorePastOrderRow";
import type { MenuSheetScrollTarget } from "@/components/store/StoreMenuSheet";

/** Stable FlashList row id when the same dish appears in more than one section. */
export type MenuListRow = MenuItem & { listRowKey: string };

export type MenuSection = {
  title: string;
  data: MenuListRow[];
  isSmart?: boolean;
};

export type MerchantCategoryChip = {
  id: string;
  title: string;
  scrollTarget: MenuSheetScrollTarget;
};

export type MerchantListItemType =
  | "hero"
  | "info"
  | "closed_banner"
  | "filter_bar"
  | "category_bar"
  | "past_orders"
  | "combo_section"
  | "section_lead"
  | "section_header"
  | "menu_item"
  | "footer"
  | "empty_menu"
  | "menu_skeleton";

export type MerchantFlashListItem =
  | { type: "hero"; key: "hero" }
  | { type: "info"; key: "info" }
  | { type: "closed_banner"; key: "closed_banner"; message: string }
  | { type: "filter_bar"; key: "filter_bar" }
  | { type: "category_bar"; key: "category_bar" }
  | {
      type: "past_orders";
      key: "past_orders";
      items: PastOrderItem[];
    }
  | {
      type: "combo_section";
      key: "combo_section";
      combos: ComboPair[];
    }
  | {
      type: "section_lead";
      key: "section_lead";
      title: string;
      showCouponLink: boolean;
    }
  | { type: "section_header"; key: string; title: string; sectionIndex: number }
  | {
      type: "menu_item";
      key: string;
      item: MenuListRow;
      sectionIndex: number;
      itemIndex: number;
      isLastInSection: boolean;
    }
  | { type: "footer"; key: "footer" }
  | { type: "empty_menu"; key: "empty_menu" }
  | { type: "menu_skeleton"; key: string };

export type MerchantScrollIndexMap = {
  pastOrders: number | null;
  startingAt: number | null;
  sectionByTitle: Map<string, number>;
  menuItemByKey: Map<string, number>;
};
