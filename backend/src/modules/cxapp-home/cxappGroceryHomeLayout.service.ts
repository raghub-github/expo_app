import {
  DEFAULT_FOOD_HOME_LAYOUT,
  parseFoodHomeLayoutKey,
  type FoodHomeLayoutKey,
} from "../../lib/cxapp-food-home-layout.js";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "../../lib/cxapp-grid-first-hero-media.js";
import { getSql } from "../../db/client.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

export const DEFAULT_GROCERY_HOME_LAYOUT: FoodHomeLayoutKey = "grid_first";

export type ResolvedGroceryHomeLayout = {
  layoutKey: FoodHomeLayoutKey;
  stateId: string | null;
  stateName: string | null;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
};

type LayoutRow = {
  layout_key: string;
  grid_first_hero_media: unknown;
};

async function getStateGroceryHomeLayoutRow(stateId: string): Promise<{
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
}> {
  const sql = getSql();
  const [row] = await sql<LayoutRow[]>`
    SELECT
      layout_key::text AS layout_key,
      grid_first_hero_media
    FROM cxapp_state_grocery_home_layout
    WHERE state_id = ${stateId}::uuid
    LIMIT 1
  `;
  return {
    layoutKey: parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_GROCERY_HOME_LAYOUT,
    gridFirstHeroMedia: parseGridFirstHeroMediaItems(row?.grid_first_hero_media).map((item) => ({
      ...item,
      url: toAbsoluteClientMediaUrl(item.url) ?? item.url,
    })),
  };
}

export async function resolveGroceryHomeLayout(args: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<ResolvedGroceryHomeLayout> {
  const geo = await resolveGeoLocation({
    livePincode: args.pincode,
    liveState: args.state,
    latitude: args.lat,
    longitude: args.lng,
  });

  const stateId = geo.refs?.state ?? null;
  const stateName = geo.stateName;

  if (!stateId) {
    return {
      layoutKey: DEFAULT_GROCERY_HOME_LAYOUT,
      stateId: null,
      stateName,
      gridFirstHeroMedia: [],
    };
  }

  try {
    const row = await getStateGroceryHomeLayoutRow(stateId);
    return { stateId, stateName, ...row };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("cxapp_state_grocery_home_layout")) {
      return {
        layoutKey: DEFAULT_GROCERY_HOME_LAYOUT,
        stateId,
        stateName,
        gridFirstHeroMedia: [],
      };
    }
    throw err;
  }
}
