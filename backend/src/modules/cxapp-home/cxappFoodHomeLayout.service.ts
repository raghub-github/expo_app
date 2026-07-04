import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  type FoodHomeLayoutKey,
  type GridFirstSubscriptionRowConfig,
  type GridFirstUnder250Config,
  parseFoodHomeLayoutKey,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
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
  gridFirstUnder250Enabled: boolean;
  gridFirstUnder250MaxPrice: number;
  gridFirstUnder250Title: string;
  gridFirstUnder250FilterLabel: string;
  gridFirstUnder250TabImageUrl: string | null;
  gridFirstUnder250HeroImageUrl: string | null;
};

type LayoutRow = {
  layout_key: string;
  grid_first_hero_media: unknown;
  grid_first_subscription_row_enabled: boolean | null;
  grid_first_subscription_row_text: string | null;
  grid_first_subscription_row_bg_color: string | null;
  grid_first_under_250_enabled: boolean | null;
  grid_first_under_250_max_price: number | null;
  grid_first_under_250_title: string | null;
  grid_first_under_250_filter_label: string | null;
  grid_first_under_250_tab_image_url: string | null;
  grid_first_under_250_hero_image_url: string | null;
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

function parseUnder250Row(row: LayoutRow | undefined): GridFirstUnder250Config {
  if (!row) return { ...DEFAULT_GRID_FIRST_UNDER_250 };
  return {
    enabled: parseGridFirstUnder250Enabled(row.grid_first_under_250_enabled),
    maxPrice: parseGridFirstUnder250MaxPrice(row.grid_first_under_250_max_price),
    title: parseGridFirstUnder250Title(
      row.grid_first_under_250_title,
      DEFAULT_GRID_FIRST_UNDER_250.title
    ),
    filterLabel: parseGridFirstUnder250Title(
      row.grid_first_under_250_filter_label,
      DEFAULT_GRID_FIRST_UNDER_250.filterLabel
    ),
    tabImageUrl: parseGridFirstUnder250ImageUrl(row.grid_first_under_250_tab_image_url),
    heroImageUrl: parseGridFirstUnder250ImageUrl(row.grid_first_under_250_hero_image_url),
  };
}

async function getStateFoodHomeLayoutRow(stateId: string): Promise<{
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
  gridFirstUnder250: GridFirstUnder250Config;
}> {
  const sql = getSql();
  const [row] = await sql<LayoutRow[]>`
    SELECT
      layout_key::text AS layout_key,
      grid_first_hero_media,
      grid_first_subscription_row_enabled,
      grid_first_subscription_row_text,
      grid_first_subscription_row_bg_color,
      grid_first_under_250_enabled,
      grid_first_under_250_max_price,
      grid_first_under_250_title,
      grid_first_under_250_filter_label,
      grid_first_under_250_tab_image_url,
      grid_first_under_250_hero_image_url
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
    gridFirstUnder250: parseUnder250Row(row),
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
  const emptyUnder250 = {
    gridFirstUnder250Enabled: DEFAULT_GRID_FIRST_UNDER_250.enabled,
    gridFirstUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
    gridFirstUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
    gridFirstUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
    gridFirstUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
    gridFirstUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
  };

  if (!stateId) {
    return {
      layoutKey: DEFAULT_FOOD_HOME_LAYOUT,
      stateId: null,
      stateName,
      gridFirstHeroMedia: [],
      ...emptySubscription,
      ...emptyUnder250,
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
      gridFirstUnder250Enabled: row.gridFirstUnder250.enabled,
      gridFirstUnder250MaxPrice: row.gridFirstUnder250.maxPrice,
      gridFirstUnder250Title: row.gridFirstUnder250.title,
      gridFirstUnder250FilterLabel: row.gridFirstUnder250.filterLabel,
      gridFirstUnder250TabImageUrl: row.gridFirstUnder250.tabImageUrl,
      gridFirstUnder250HeroImageUrl: row.gridFirstUnder250.heroImageUrl,
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
        ...emptyUnder250,
      };
    }
    if (
      message.includes("grid_first_subscription_row_enabled") ||
      message.includes("grid_first_subscription_row_text") ||
      message.includes("grid_first_subscription_row_bg_color") ||
      message.includes("grid_first_under_250")
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
        ...emptyUnder250,
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
