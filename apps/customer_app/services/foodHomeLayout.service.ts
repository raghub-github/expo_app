import api from "./api";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
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
};

function mapFoodHomeLayoutResponse(
  data: Partial<FoodHomeLayoutResult> & { ok?: boolean }
): FoodHomeLayoutResult {
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
    gridFirstUnder250Enabled: parseGridFirstUnder250Enabled(data.gridFirstUnder250Enabled),
    gridFirstUnder250MaxPrice: parseGridFirstUnder250MaxPrice(data.gridFirstUnder250MaxPrice),
    gridFirstUnder250Title: parseGridFirstUnder250Title(
      data.gridFirstUnder250Title,
      DEFAULT_GRID_FIRST_UNDER_250.title
    ),
    gridFirstUnder250FilterLabel: parseGridFirstUnder250Title(
      data.gridFirstUnder250FilterLabel,
      DEFAULT_GRID_FIRST_UNDER_250.filterLabel
    ),
    gridFirstUnder250TabImageUrl: parseGridFirstUnder250ImageUrl(data.gridFirstUnder250TabImageUrl),
    gridFirstUnder250HeroImageUrl: parseGridFirstUnder250ImageUrl(data.gridFirstUnder250HeroImageUrl),
  };
}

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
    return {
      layoutKey: "classic",
      stateId: null,
      stateName: null,
      gridFirstHeroMedia: [],
      gridFirstSubscriptionRowEnabled: false,
      gridFirstSubscriptionRowText: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
      gridFirstSubscriptionRowBgColor: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor,
      gridFirstUnder250Enabled: DEFAULT_GRID_FIRST_UNDER_250.enabled,
      gridFirstUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
      gridFirstUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
      gridFirstUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
      gridFirstUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
      gridFirstUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
    };
  }
}
