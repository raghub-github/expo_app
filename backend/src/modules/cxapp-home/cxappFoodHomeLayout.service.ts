import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  type FoodHomeLayoutKey,
  type GridFirstSubscriptionRowConfig,
  parseFoodHomeLayoutKey,
  parseGridFirstSubscriptionRowBgColor,
} from "../../lib/cxapp-food-home-layout.js";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "../../lib/cxapp-grid-first-hero-media.js";
import { getSql } from "../../db/client.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";

export type ResolvedFoodHomeLayout = {
  layoutKey: FoodHomeLayoutKey;
  stateId: string | null;
  stateName: string | null;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRowEnabled: boolean;
  gridFirstSubscriptionRowText: string;
  gridFirstSubscriptionRowBgColor: string;
};

type LayoutRow = {
  layout_key: string;
  grid_first_hero_media: unknown;
  grid_first_subscription_row_enabled: boolean | null;
  grid_first_subscription_row_text: string | null;
  grid_first_subscription_row_bg_color: string | null;
};

function parseSubscriptionRow(row: LayoutRow | undefined): GridFirstSubscriptionRowConfig {
  if (!row) return { ...DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW };
  const text = row.grid_first_subscription_row_text?.trim();
  return {
    enabled: row.grid_first_subscription_row_enabled === true,
    text: text || DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    backgroundColor: parseGridFirstSubscriptionRowBgColor(row.grid_first_subscription_row_bg_color),
  };
}

async function getStateFoodHomeLayoutRow(stateId: string): Promise<{
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
}> {
  const sql = getSql();
  const [row] = await sql<LayoutRow[]>`
    SELECT
      layout_key::text AS layout_key,
      grid_first_hero_media,
      grid_first_subscription_row_enabled,
      grid_first_subscription_row_text,
      grid_first_subscription_row_bg_color
    FROM cxapp_state_food_home_layout
    WHERE state_id = ${stateId}::uuid
    LIMIT 1
  `;
  const layoutKey = parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_FOOD_HOME_LAYOUT;
  let gridFirstHeroMedia: GridFirstHeroMediaItem[] = [];
  if (layoutKey === "grid_first") {
    try {
      gridFirstHeroMedia = parseGridFirstHeroMediaItems(row?.grid_first_hero_media);
    } catch {
      gridFirstHeroMedia = [];
    }
  }
  return {
    layoutKey,
    gridFirstHeroMedia,
    gridFirstSubscriptionRow: parseSubscriptionRow(row),
  };
}

export async function getGridFirstHeroMediaForState(stateId: string): Promise<GridFirstHeroMediaItem[]> {
  const row = await getStateFoodHomeLayoutRow(stateId);
  return row.gridFirstHeroMedia;
}

export async function getFoodHomeLayoutForState(stateId: string): Promise<FoodHomeLayoutKey> {
  const row = await getStateFoodHomeLayoutRow(stateId);
  return row.layoutKey;
}

export async function resolveFoodHomeLayout(args: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<ResolvedFoodHomeLayout> {
  const geo = await resolveGeoLocation({
    livePincode: args.pincode,
    liveState: args.state,
    latitude: args.lat,
    longitude: args.lng,
  });

  const stateId = geo.refs?.state ?? null;
  const stateName = geo.stateName;
  const emptySubscription = {
    gridFirstSubscriptionRowEnabled: false,
    gridFirstSubscriptionRowText: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    gridFirstSubscriptionRowBgColor: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor,
  };

  if (!stateId) {
    return {
      layoutKey: DEFAULT_FOOD_HOME_LAYOUT,
      stateId: null,
      stateName,
      gridFirstHeroMedia: [],
      ...emptySubscription,
    };
  }

  try {
    const row = await getStateFoodHomeLayoutRow(stateId);
    return {
      layoutKey: row.layoutKey,
      stateId,
      stateName,
      gridFirstHeroMedia: row.gridFirstHeroMedia,
      gridFirstSubscriptionRowEnabled: row.gridFirstSubscriptionRow.enabled,
      gridFirstSubscriptionRowText: row.gridFirstSubscriptionRow.text,
      gridFirstSubscriptionRowBgColor: row.gridFirstSubscriptionRow.backgroundColor,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("cxapp_state_food_home_layout") && message.includes("does not exist")) {
      return {
        layoutKey: DEFAULT_FOOD_HOME_LAYOUT,
        stateId,
        stateName,
        gridFirstHeroMedia: [],
        ...emptySubscription,
      };
    }
    if (
      message.includes("grid_first_subscription_row_enabled") ||
      message.includes("grid_first_subscription_row_text") ||
      message.includes("grid_first_subscription_row_bg_color")
    ) {
      const layoutKey = await getFoodHomeLayoutForState(stateId);
      let gridFirstHeroMedia: GridFirstHeroMediaItem[] = [];
      if (layoutKey === "grid_first") {
        try {
          gridFirstHeroMedia = await getGridFirstHeroMediaForState(stateId);
        } catch {
          gridFirstHeroMedia = [];
        }
      }
      return {
        layoutKey,
        stateId,
        stateName,
        gridFirstHeroMedia,
        ...emptySubscription,
      };
    }
    throw err;
  }
}

export async function upsertFoodHomeLayoutForState(
  stateId: string,
  layoutKey: FoodHomeLayoutKey
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO cxapp_state_food_home_layout (state_id, layout_key, updated_at)
    VALUES (${stateId}::uuid, ${layoutKey}::cxapp_food_home_layout, now())
    ON CONFLICT (state_id) DO UPDATE SET
      layout_key = EXCLUDED.layout_key,
      updated_at = now()
  `;
}
