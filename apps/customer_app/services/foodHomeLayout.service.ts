import api from "./api";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
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
    };
  }
}
