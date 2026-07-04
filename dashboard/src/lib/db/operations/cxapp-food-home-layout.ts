import { getSql } from "@/lib/db/client";
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
} from "@/lib/cxapp-home/food-home-layout";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "@/lib/cxapp-home/grid-first-hero-media";

export type StateFoodHomeLayoutConfig = {
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
  gridFirstUnder250: GridFirstUnder250Config;
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

export async function getStateFoodHomeLayoutConfig(stateId: string): Promise<StateFoodHomeLayoutConfig> {
  const sql = getSql();
  const rows = await sql<LayoutRow[]>`
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
  const row = rows[0];
  return {
    layoutKey: parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_FOOD_HOME_LAYOUT,
    gridFirstHeroMedia: parseGridFirstHeroMediaItems(row?.grid_first_hero_media),
    gridFirstSubscriptionRow: parseSubscriptionRow(row),
    gridFirstUnder250: parseUnder250Row(row),
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
      grid_first_under_250_enabled,
      grid_first_under_250_max_price,
      grid_first_under_250_title,
      grid_first_under_250_filter_label,
      grid_first_under_250_tab_image_url,
      grid_first_under_250_hero_image_url,
      updated_at
    )
    VALUES (
      ${stateId}::uuid,
      ${DEFAULT_FOOD_HOME_LAYOUT}::cxapp_food_home_layout,
      '[]'::jsonb,
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.enabled},
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text},
      ${DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor},
      ${DEFAULT_GRID_FIRST_UNDER_250.enabled},
      ${DEFAULT_GRID_FIRST_UNDER_250.maxPrice},
      ${DEFAULT_GRID_FIRST_UNDER_250.title},
      ${DEFAULT_GRID_FIRST_UNDER_250.filterLabel},
      ${DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl},
      ${DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl},
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

export async function saveStateGridFirstUnder250(
  stateId: string,
  config: GridFirstUnder250Config
): Promise<GridFirstUnder250Config> {
  await ensureStateFoodHomeLayoutRow(stateId);
  const sql = getSql();
  const enabled = parseGridFirstUnder250Enabled(config.enabled);
  const maxPrice = parseGridFirstUnder250MaxPrice(config.maxPrice);
  const title = parseGridFirstUnder250Title(config.title, DEFAULT_GRID_FIRST_UNDER_250.title);
  const filterLabel = parseGridFirstUnder250Title(
    config.filterLabel,
    DEFAULT_GRID_FIRST_UNDER_250.filterLabel
  );
  const tabImageUrl = parseGridFirstUnder250ImageUrl(config.tabImageUrl);
  const heroImageUrl = parseGridFirstUnder250ImageUrl(config.heroImageUrl);
  await sql`
    UPDATE cxapp_state_food_home_layout
    SET grid_first_under_250_enabled = ${enabled},
        grid_first_under_250_max_price = ${maxPrice},
        grid_first_under_250_title = ${title},
        grid_first_under_250_filter_label = ${filterLabel},
        grid_first_under_250_tab_image_url = ${tabImageUrl},
        grid_first_under_250_hero_image_url = ${heroImageUrl},
        updated_at = now()
    WHERE state_id = ${stateId}::uuid
  `;
  return { enabled, maxPrice, title, filterLabel, tabImageUrl, heroImageUrl };
}
