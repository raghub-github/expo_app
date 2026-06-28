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
