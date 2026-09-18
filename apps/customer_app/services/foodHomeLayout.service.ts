import api from "./api";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  DEFAULT_DISCOVERY_CTA,
  parseDiscoveryCtaConfig,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
  type DiscoveryCtaTile,
} from "@/lib/foodHomeLayout";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import { parseGridFirstHeroMediaItems } from "@/lib/gridFirstHeroMedia";

export type FoodHomeLayoutResult = {
  layoutKey: FoodHomeLayoutKey;
  stateId: string | null;
  stateName: string | null;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRowEnabled: boolean;
  gridFirstSubscriptionRowText: string;
  gridFirstSubscriptionRowBgColor: string;
  gridFirstUnder250Enabled: boolean;
  gridFirstUnder250MaxPrice: number;
  gridFirstUnder250Title: string;
  gridFirstUnder250FilterLabel: string;
  gridFirstUnder250TabImageUrl: string | null;
  gridFirstUnder250HeroImageUrl: string | null;
  classicUnder250Enabled: boolean;
  classicUnder250MaxPrice: number;
  classicUnder250Title: string;
  classicUnder250FilterLabel: string;
  classicUnder250TabImageUrl: string | null;
  classicUnder250HeroImageUrl: string | null;
  discoveryDealsAtMaxPrice: number | null;
  discoveryDealsAtImageUrl: string | null;
  discoveryDealsAtHeroImageUrl: string | null;
  discoveryCrazyDealsImageUrl: string | null;
  discoveryFreePackagingImageUrl: string | null;
  discoveryDealsAtLabel: string | null;
  discoveryCrazyDealsLabel: string | null;
  discoveryFreePackagingLabel: string | null;
  discoveryCtaTiles: DiscoveryCtaTile[];
};

function mapUnder250(
  enabled: unknown,
  maxPrice: unknown,
  title: unknown,
  filterLabel: unknown,
  tabImageUrl: unknown,
  heroImageUrl: unknown
) {
  return {
    enabled: parseGridFirstUnder250Enabled(enabled),
    maxPrice: parseGridFirstUnder250MaxPrice(maxPrice),
    title: parseGridFirstUnder250Title(title, DEFAULT_GRID_FIRST_UNDER_250.title),
    filterLabel: parseGridFirstUnder250Title(
      filterLabel,
      DEFAULT_GRID_FIRST_UNDER_250.filterLabel
    ),
    tabImageUrl: parseGridFirstUnder250ImageUrl(tabImageUrl),
    heroImageUrl: parseGridFirstUnder250ImageUrl(heroImageUrl),
  };
}

function mapFoodHomeLayoutResponse(
  data: Partial<FoodHomeLayoutResult> & { ok?: boolean }
): FoodHomeLayoutResult {
  const gridUnder = mapUnder250(
    data.gridFirstUnder250Enabled,
    data.gridFirstUnder250MaxPrice,
    data.gridFirstUnder250Title,
    data.gridFirstUnder250FilterLabel,
    data.gridFirstUnder250TabImageUrl,
    data.gridFirstUnder250HeroImageUrl
  );
  // Older APIs only returned grid_* — classic falls back once until classic_* ships.
  const hasClassic =
    data.classicUnder250Enabled != null ||
    data.classicUnder250MaxPrice != null ||
    data.classicUnder250Title != null;
  const classicUnder = hasClassic
    ? mapUnder250(
        data.classicUnder250Enabled,
        data.classicUnder250MaxPrice,
        data.classicUnder250Title,
        data.classicUnder250FilterLabel,
        data.classicUnder250TabImageUrl,
        data.classicUnder250HeroImageUrl
      )
    : { ...gridUnder };

  return {
    layoutKey: data.layoutKey ?? "classic",
    stateId: data.stateId ?? null,
    stateName: data.stateName ?? null,
    gridFirstHeroMedia: parseGridFirstHeroMediaItems(data.gridFirstHeroMedia),
    gridFirstSubscriptionRowEnabled: parseGridFirstSubscriptionRowEnabled(
      data.gridFirstSubscriptionRowEnabled
    ),
    gridFirstSubscriptionRowText:
      data.gridFirstSubscriptionRowText?.trim() || DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    gridFirstSubscriptionRowBgColor: parseGridFirstSubscriptionRowBgColor(
      data.gridFirstSubscriptionRowBgColor
    ),
    gridFirstUnder250Enabled: gridUnder.enabled,
    gridFirstUnder250MaxPrice: gridUnder.maxPrice,
    gridFirstUnder250Title: gridUnder.title,
    gridFirstUnder250FilterLabel: gridUnder.filterLabel,
    gridFirstUnder250TabImageUrl: gridUnder.tabImageUrl,
    gridFirstUnder250HeroImageUrl: gridUnder.heroImageUrl,
    classicUnder250Enabled: classicUnder.enabled,
    classicUnder250MaxPrice: classicUnder.maxPrice,
    classicUnder250Title: classicUnder.title,
    classicUnder250FilterLabel: classicUnder.filterLabel,
    classicUnder250TabImageUrl: classicUnder.tabImageUrl,
    classicUnder250HeroImageUrl: classicUnder.heroImageUrl,
    discoveryDealsAtMaxPrice: parseDiscoveryCtaConfig(data).dealsAtMaxPrice,
    discoveryDealsAtImageUrl: parseDiscoveryCtaConfig(data).dealsAtImageUrl,
    discoveryDealsAtHeroImageUrl: parseDiscoveryCtaConfig(data).dealsAtHeroImageUrl,
    discoveryCrazyDealsImageUrl: parseDiscoveryCtaConfig(data).crazyDealsImageUrl,
    discoveryFreePackagingImageUrl: parseDiscoveryCtaConfig(data).freePackagingImageUrl,
    discoveryDealsAtLabel: parseDiscoveryCtaConfig(data).dealsAtLabel,
    discoveryCrazyDealsLabel: parseDiscoveryCtaConfig(data).crazyDealsLabel,
    discoveryFreePackagingLabel: parseDiscoveryCtaConfig(data).freePackagingLabel,
    discoveryCtaTiles: parseDiscoveryCtaConfig(data).tiles,
  };
}

const FALLBACK_LAYOUT: FoodHomeLayoutResult = {
  layoutKey: "classic",
  stateId: null,
  stateName: null,
  gridFirstHeroMedia: [],
  gridFirstSubscriptionRowEnabled: false,
  gridFirstSubscriptionRowText: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
  gridFirstSubscriptionRowBgColor: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor,
  gridFirstUnder250Enabled: false,
  gridFirstUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
  gridFirstUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
  gridFirstUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
  gridFirstUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
  gridFirstUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
  classicUnder250Enabled: DEFAULT_GRID_FIRST_UNDER_250.enabled,
  classicUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
  classicUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
  classicUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
  classicUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
  classicUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
  discoveryDealsAtMaxPrice: DEFAULT_DISCOVERY_CTA.dealsAtMaxPrice,
  discoveryDealsAtImageUrl: DEFAULT_DISCOVERY_CTA.dealsAtImageUrl,
  discoveryDealsAtHeroImageUrl: DEFAULT_DISCOVERY_CTA.dealsAtHeroImageUrl,
  discoveryCrazyDealsImageUrl: DEFAULT_DISCOVERY_CTA.crazyDealsImageUrl,
  discoveryFreePackagingImageUrl: DEFAULT_DISCOVERY_CTA.freePackagingImageUrl,
  discoveryDealsAtLabel: DEFAULT_DISCOVERY_CTA.dealsAtLabel,
  discoveryCrazyDealsLabel: DEFAULT_DISCOVERY_CTA.crazyDealsLabel,
  discoveryFreePackagingLabel: DEFAULT_DISCOVERY_CTA.freePackagingLabel,
  discoveryCtaTiles: DEFAULT_DISCOVERY_CTA.tiles,
};

export async function getFoodHomeLayout(params: {
  pincode?: string;
  state?: string;
  lat?: number;
  lng?: number;
}): Promise<FoodHomeLayoutResult> {
  try {
    const { data } = await api.get<FoodHomeLayoutResult & { ok: true }>("/v1/geo/food-home-layout", {
      params: {
        ...(params.pincode ? { pincode: params.pincode } : {}),
        ...(params.state ? { state: params.state } : {}),
        ...(params.lat != null ? { lat: params.lat } : {}),
        ...(params.lng != null ? { lng: params.lng } : {}),
      },
    });
    return mapFoodHomeLayoutResponse(data);
  } catch {
    return { ...FALLBACK_LAYOUT };
  }
}
