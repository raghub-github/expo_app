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

export type GridFirstUnder250Config = {
  enabled: boolean;
  maxPrice: number;
  title: string;
  filterLabel: string;
  tabImageUrl: string | null;
  heroImageUrl: string | null;
};

export const DEFAULT_GRID_FIRST_UNDER_250: GridFirstUnder250Config = {
  enabled: true,
  maxPrice: 250,
  title: "Items under ₹250",
  filterLabel: "Meals under ₹250",
  tabImageUrl: null,
  heroImageUrl: null,
};

export function parseGridFirstUnder250MaxPrice(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
  return Math.max(1, Math.min(5000, Math.trunc(n)));
}

export function parseGridFirstUnder250Enabled(value: unknown): boolean {
  return value !== false;
}

export function parseGridFirstUnder250Title(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function parseGridFirstUnder250ImageUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseGridFirstSubscriptionRowBgColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG;
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG;
}

/** Explicit false from API must stay false — do not coerce via ?? true. */
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
