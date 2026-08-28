import { getSql } from "@/lib/db/client";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  parseFoodHomeLayoutKey,
  type FoodHomeLayoutKey,
} from "@/lib/cxapp-home/food-home-layout";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "@/lib/cxapp-home/grid-first-hero-media";

export const DEFAULT_GROCERY_HOME_LAYOUT: FoodHomeLayoutKey = "grid_first";

export type StateGroceryHomeLayoutConfig = {
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
};

type LayoutRow = {
  layout_key: string;
  grid_first_hero_media: unknown;
};

export async function getStateGroceryHomeLayoutConfig(
  stateId: string
): Promise<StateGroceryHomeLayoutConfig> {
  const sql = getSql();
  const rows = await sql<LayoutRow[]>`
    SELECT layout_key::text AS layout_key, grid_first_hero_media
    FROM cxapp_state_grocery_home_layout
    WHERE state_id = ${stateId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  return {
    layoutKey: parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_GROCERY_HOME_LAYOUT,
    gridFirstHeroMedia: parseGridFirstHeroMediaItems(row?.grid_first_hero_media),
  };
}

export async function upsertStateGroceryHomeLayout(
  stateId: string,
  layoutKey: FoodHomeLayoutKey
): Promise<StateGroceryHomeLayoutConfig> {
  const sql = getSql();
  await sql`
    INSERT INTO cxapp_state_grocery_home_layout (state_id, layout_key, updated_at)
    VALUES (${stateId}::uuid, ${layoutKey}::cxapp_food_home_layout, now())
    ON CONFLICT (state_id) DO UPDATE SET
      layout_key = EXCLUDED.layout_key,
      updated_at = now()
  `;
  return getStateGroceryHomeLayoutConfig(stateId);
}

export async function getStateGroceryGridFirstHeroMedia(
  stateId: string
): Promise<GridFirstHeroMediaItem[]> {
  const config = await getStateGroceryHomeLayoutConfig(stateId);
  return config.gridFirstHeroMedia;
}

export async function saveStateGroceryGridFirstHeroMedia(
  stateId: string,
  items: GridFirstHeroMediaItem[]
): Promise<GridFirstHeroMediaItem[]> {
  const sql = getSql();
  const parsed = parseGridFirstHeroMediaItems(items);
  await sql`
    INSERT INTO cxapp_state_grocery_home_layout (state_id, layout_key, grid_first_hero_media, updated_at)
    VALUES (${stateId}::uuid, ${DEFAULT_GROCERY_HOME_LAYOUT}::cxapp_food_home_layout, ${JSON.stringify(parsed)}::jsonb, now())
    ON CONFLICT (state_id) DO UPDATE SET
      grid_first_hero_media = EXCLUDED.grid_first_hero_media,
      updated_at = now()
  `;
  return parsed;
}
