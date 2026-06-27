export const FOOD_HOME_LAYOUT_KEYS = ["classic", "grid_first", "discovery"] as const;

export type FoodHomeLayoutKey = (typeof FOOD_HOME_LAYOUT_KEYS)[number];

export const DEFAULT_FOOD_HOME_LAYOUT: FoodHomeLayoutKey = "classic";

export const DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_TEXT =
  "Subscribed users get free delivery on eligible orders within delivery range.";

export const DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG = "#FFF4E8";

export type GridFirstSubscriptionRowConfig = {
  enabled: boolean;
  text: string;
  backgroundColor: string;
};

export const DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW: GridFirstSubscriptionRowConfig = {
  enabled: true,
  text: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_TEXT,
  backgroundColor: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG,
};

export function parseGridFirstSubscriptionRowBgColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG;
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG;
}

export function parseGridFirstSubscriptionRowEnabled(value: unknown): boolean {
  return value === true;
}

export type FoodHomeLayoutMeta = {
  key: FoodHomeLayoutKey;
  label: string;
  description: string;
};

export const FOOD_HOME_LAYOUT_CATALOG: FoodHomeLayoutMeta[] = [
  {
    key: "classic",
    label: "Classic",
    description: "Promo carousel, horizontal category rail, loved-by-customers grid, restaurant list.",
  },
  {
    key: "grid_first",
    label: "Grid First",
    description:
      "Hero promo carousel, gold delivery strip, category tabs, deal filters, recommended grid, restaurant list.",
  },
  {
    key: "discovery",
    label: "Discovery",
    description: "Large promo, category chips, loved stores horizontal scroll, restaurant list.",
  },
];

export function parseFoodHomeLayoutKey(value: unknown): FoodHomeLayoutKey | null {
  if (typeof value !== "string") return null;
  const v = value.trim() as FoodHomeLayoutKey;
  return FOOD_HOME_LAYOUT_KEYS.includes(v) ? v : null;
}
