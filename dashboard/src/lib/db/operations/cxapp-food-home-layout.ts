import { getSql } from "@/lib/db/client";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  type FoodHomeLayoutKey,
  type GridFirstSubscriptionRowConfig,
  parseFoodHomeLayoutKey,
  parseGridFirstSubscriptionRowBgColor,
} from "@/lib/cxapp-home/food-home-layout";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "@/lib/cxapp-home/grid-first-hero-media";

export type StateFoodHomeLayoutConfig = {
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
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

export async function getStateFoodHomeLayoutConfig(stateId: string): Promise<StateFoodHomeLayoutConfig> {
  const sql = getSql();
  const rows = await sql<LayoutRow[]>`
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
  const row = rows[0];
  return {
    layoutKey: parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_FOOD_HOME_LAYOUT,
    gridFirstHeroMedia: parseGridFirstHeroMediaItems(row?.grid_first_hero_media),
    gridFirstSubscriptionRow: parseSubscriptionRow(row),
  };
}

export async function getStateFoodHomeLayout(stateId: string): Promise<FoodHomeLayoutKey> {
  const config = await getStateFoodHomeLayoutConfig(stateId);
  return config.layoutKey;
}

export async function getStateGridFirstHeroMedia(stateId: string): Promise<GridFirstHeroMediaItem[]> {
  const config = await getStateFoodHomeLayoutConfig(stateId);
  return config.gridFirstHeroMedia;
}

async function ensureStateFoodHomeLayoutRow(stateId: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO cxapp_state_food_home_layout (
      state_id,
      layout_key,
      grid_first_hero_media,
      grid_first_subscription_row_enabled,
      grid_first_subscription_row_text,
      grid_first_subscription_row_bg_color,
      updated_at
    )
    VALUES (
      ${stateId}::uuid,
      ${DEFAULT_FOOD_HOME_LAYOUT}::cxapp_food_home_layout,
      '[]'::jsonb,
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.enabled},
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text},
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor},
      now()
    )
    ON CONFLICT (state_id) DO NOTHING
  `;
}

export async function saveStateGridFirstHeroMedia(
  stateId: string,
  items: GridFirstHeroMediaItem[]
): Promise<GridFirstHeroMediaItem[]> {
  await ensureStateFoodHomeLayoutRow(stateId);
  const sql = getSql();
  const normalized = items
    .map((item, index) => ({ ...item, sortOrder: index }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  await sql`
    UPDATE cxapp_state_food_home_layout
    SET grid_first_hero_media = ${JSON.stringify(normalized)}::jsonb,
        updated_at = now()
    WHERE state_id = ${stateId}::uuid
  `;
  return normalized;
}

export async function upsertStateFoodHomeLayout(
  stateId: string,
  layoutKey: FoodHomeLayoutKey
): Promise<void> {
  await ensureStateFoodHomeLayoutRow(stateId);
  const sql = getSql();
  await sql`
    UPDATE cxapp_state_food_home_layout
    SET layout_key = ${layoutKey}::cxapp_food_home_layout,
        updated_at = now()
    WHERE state_id = ${stateId}::uuid
  `;
}

export async function saveStateGridFirstSubscriptionRow(
  stateId: string,
  config: GridFirstSubscriptionRowConfig
): Promise<GridFirstSubscriptionRowConfig> {
  await ensureStateFoodHomeLayoutRow(stateId);
  const sql = getSql();
  const text = config.text.trim() || DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text;
  const enabled = config.enabled === true;
  const backgroundColor = parseGridFirstSubscriptionRowBgColor(config.backgroundColor);
  await sql`
    UPDATE cxapp_state_food_home_layout
    SET grid_first_subscription_row_enabled = ${enabled},
        grid_first_subscription_row_text = ${text},
        grid_first_subscription_row_bg_color = ${backgroundColor},
        updated_at = now()
    WHERE state_id = ${stateId}::uuid
  `;
  return { enabled, text, backgroundColor };
}
