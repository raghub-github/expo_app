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

export const DISCOVERY_CTA_ACTIONS = ["meals", "deals", "packaging"] as const;
export type DiscoveryCtaAction = (typeof DISCOVERY_CTA_ACTIONS)[number];

export type DiscoveryCtaTile = {
  id: string;
  action: DiscoveryCtaAction;
  label: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  maxPrice: number | null;
  sortOrder: number;
};

export const MAX_DISCOVERY_CTA_TILES = 8;

export type DiscoveryCtaConfig = {
  dealsAtMaxPrice: number | null;
  dealsAtImageUrl: string | null;
  dealsAtHeroImageUrl: string | null;
  crazyDealsImageUrl: string | null;
  freePackagingImageUrl: string | null;
  dealsAtLabel: string | null;
  crazyDealsLabel: string | null;
  freePackagingLabel: string | null;
  tiles: DiscoveryCtaTile[];
};

const DEFAULT_DISCOVERY_CTA_TILES: DiscoveryCtaTile[] = [
  { id: "meals", action: "meals", label: null, imageUrl: null, heroImageUrl: null, maxPrice: null, sortOrder: 0 },
  { id: "deals", action: "deals", label: null, imageUrl: null, heroImageUrl: null, maxPrice: null, sortOrder: 1 },
  { id: "packaging", action: "packaging", label: null, imageUrl: null, heroImageUrl: null, maxPrice: null, sortOrder: 2 },
];

export const DEFAULT_DISCOVERY_CTA: DiscoveryCtaConfig = {
  dealsAtMaxPrice: null,
  dealsAtImageUrl: null,
  dealsAtHeroImageUrl: null,
  crazyDealsImageUrl: null,
  freePackagingImageUrl: null,
  dealsAtLabel: null,
  crazyDealsLabel: null,
  freePackagingLabel: null,
  tiles: DEFAULT_DISCOVERY_CTA_TILES,
};

export const DEFAULT_DISCOVERY_CTA_LABELS = {
  crazyDeals: "CRAZY DEALS",
  freePackaging: "FREE PACKAGING",
} as const;

export function parseDiscoveryCtaLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 40);
  return trimmed || null;
}

export function resolveDiscoveryDealsAtLabel(
  label: string | null | undefined,
  maxPrice: number
): string {
  const custom = label?.trim();
  if (custom) return custom;
  return `DEALS AT ₹${maxPrice}`;
}

export function parseDiscoveryDealsAtMaxPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(5000, Math.trunc(n)));
}

export function resolveDiscoveryDealsAtMaxPrice(
  discoveryPrice: number | null | undefined,
  under250Price: number
): number {
  if (discoveryPrice != null && discoveryPrice > 0) return discoveryPrice;
  return under250Price;
}

export function parseDiscoveryCtaConfig(raw: {
  discoveryDealsAtMaxPrice?: unknown;
  discoveryDealsAtImageUrl?: unknown;
  discoveryDealsAtHeroImageUrl?: unknown;
  discoveryCrazyDealsImageUrl?: unknown;
  discoveryFreePackagingImageUrl?: unknown;
  discoveryDealsAtLabel?: unknown;
  discoveryCrazyDealsLabel?: unknown;
  discoveryFreePackagingLabel?: unknown;
  discoveryCtaTiles?: unknown;
} | null | undefined): DiscoveryCtaConfig {
  const dealsAtImageUrl = parseGridFirstUnder250ImageUrl(raw?.discoveryDealsAtImageUrl);
  const crazyDealsImageUrl = parseGridFirstUnder250ImageUrl(raw?.discoveryCrazyDealsImageUrl);
  const freePackagingImageUrl = parseGridFirstUnder250ImageUrl(raw?.discoveryFreePackagingImageUrl);
  const dealsAtLabel = parseDiscoveryCtaLabel(raw?.discoveryDealsAtLabel);
  const crazyDealsLabel = parseDiscoveryCtaLabel(raw?.discoveryCrazyDealsLabel);
  const freePackagingLabel = parseDiscoveryCtaLabel(raw?.discoveryFreePackagingLabel);
  const legacyTiles: DiscoveryCtaTile[] = [
    {
      id: "meals",
      action: "meals",
      label: dealsAtLabel,
      imageUrl: dealsAtImageUrl,
      heroImageUrl: parseGridFirstUnder250ImageUrl(raw?.discoveryDealsAtHeroImageUrl),
      maxPrice: parseDiscoveryDealsAtMaxPrice(raw?.discoveryDealsAtMaxPrice),
      sortOrder: 0,
    },
    { id: "deals", action: "deals", label: crazyDealsLabel, imageUrl: crazyDealsImageUrl, heroImageUrl: null, maxPrice: null, sortOrder: 1 },
    { id: "packaging", action: "packaging", label: freePackagingLabel, imageUrl: freePackagingImageUrl, heroImageUrl: null, maxPrice: null, sortOrder: 2 },
  ];
  return {
    dealsAtMaxPrice: parseDiscoveryDealsAtMaxPrice(raw?.discoveryDealsAtMaxPrice),
    dealsAtImageUrl,
    dealsAtHeroImageUrl: parseGridFirstUnder250ImageUrl(raw?.discoveryDealsAtHeroImageUrl),
    crazyDealsImageUrl,
    freePackagingImageUrl,
    dealsAtLabel,
    crazyDealsLabel,
    freePackagingLabel,
    tiles: parseDiscoveryCtaTiles(raw?.discoveryCtaTiles, legacyTiles),
  };
}

export function parseDiscoveryCtaTiles(
  raw: unknown,
  fallback: DiscoveryCtaTile[]
): DiscoveryCtaTile[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<string>();
  const out: DiscoveryCtaTile[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_DISCOVERY_CTA_TILES; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const action = rec.action;
    if (action !== "meals" && action !== "deals" && action !== "packaging") continue;
    const rawId = typeof rec.id === "string" ? rec.id.trim().slice(0, 64) : "";
    const id = rawId && !seen.has(rawId) ? rawId : `${action}_${i}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      action,
      label: parseDiscoveryCtaLabel(rec.label),
      imageUrl: parseGridFirstUnder250ImageUrl(rec.imageUrl),
      heroImageUrl: parseGridFirstUnder250ImageUrl(rec.heroImageUrl),
      maxPrice: action === "meals" ? parseDiscoveryDealsAtMaxPrice(rec.maxPrice) : null,
      sortOrder: out.length,
    });
  }
  return out;
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
    description: "Dark discovery home: promo tiles, 2-row category rail, horizontal restaurant cards, floating sort/filters.",
  },
];

export function parseFoodHomeLayoutKey(value: unknown): FoodHomeLayoutKey | null {
  if (typeof value !== "string") return null;
  const v = value.trim() as FoodHomeLayoutKey;
  return FOOD_HOME_LAYOUT_KEYS.includes(v) ? v : null;
}
