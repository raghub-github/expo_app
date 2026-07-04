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
