import api from "./api";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import { parseGridFirstHeroMediaItems } from "@/lib/gridFirstHeroMedia";

export type GroceryHomeLayoutResult = {
  layoutKey: FoodHomeLayoutKey;
  stateId: string | null;
  stateName: string | null;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
};

export async function getGroceryHomeLayout(params: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<GroceryHomeLayoutResult> {
  try {
    const { data } = await api.get<GroceryHomeLayoutResult & { ok: true }>(
      "/v1/geo/grocery-home-layout",
      {
        params: {
          ...(params.pincode ? { pincode: params.pincode } : {}),
          ...(params.state ? { state: params.state } : {}),
          ...(params.lat != null ? { lat: params.lat } : {}),
          ...(params.lng != null ? { lng: params.lng } : {}),
        },
      }
    );
    return {
      layoutKey: data.layoutKey ?? "grid_first",
      stateId: data.stateId ?? null,
      stateName: data.stateName ?? null,
      gridFirstHeroMedia: parseGridFirstHeroMediaItems(data.gridFirstHeroMedia),
    };
  } catch {
    return {
      layoutKey: "grid_first",
      stateId: null,
      stateName: null,
      gridFirstHeroMedia: [],
    };
  }
}
