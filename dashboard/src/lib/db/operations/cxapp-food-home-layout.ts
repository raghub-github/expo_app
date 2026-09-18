import { getSql } from "@/lib/db/client";
import {
  DEFAULT_DISCOVERY_CTA,
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  type DiscoveryCtaConfig,
  type FoodHomeLayoutKey,
  type GridFirstSubscriptionRowConfig,
  type GridFirstUnder250Config,
  parseDiscoveryCtaConfig,
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
  classicHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
  gridFirstUnder250: GridFirstUnder250Config;
  classicUnder250: GridFirstUnder250Config;
  discoveryCta: DiscoveryCtaConfig;
};

type LayoutRow = {
  layout_key: string;
  grid_first_hero_media: unknown;
  classic_hero_media?: unknown;
  grid_first_subscription_row_enabled: boolean | null;
  grid_first_subscription_row_text: string | null;
  grid_first_subscription_row_bg_color: string | null;
  grid_first_under_250_enabled: boolean | null;
  grid_first_under_250_max_price: number | null;
  grid_first_under_250_title: string | null;
  grid_first_under_250_filter_label: string | null;
  grid_first_under_250_tab_image_url: string | null;
  grid_first_under_250_hero_image_url: string | null;
  classic_under_250_enabled?: boolean | null;
  classic_under_250_max_price?: number | null;
  classic_under_250_title?: string | null;
  classic_under_250_filter_label?: string | null;
  classic_under_250_tab_image_url?: string | null;
  classic_under_250_hero_image_url?: string | null;
  discovery_deals_at_max_price?: number | null;
  discovery_deals_at_image_url?: string | null;
  discovery_deals_at_hero_image_url?: string | null;
  discovery_crazy_deals_image_url?: string | null;
  discovery_free_packaging_image_url?: string | null;
  discovery_deals_at_label?: string | null;
  discovery_crazy_deals_label?: string | null;
  discovery_free_packaging_label?: string | null;
  discovery_cta_tiles?: unknown;
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

function parseUnder250FromColumns(
  row: LayoutRow | undefined,
  prefix: "grid_first" | "classic"
): GridFirstUnder250Config {
  if (!row) return { ...DEFAULT_GRID_FIRST_UNDER_250 };
  if (prefix === "classic") {
    const hasClassic =
      row.classic_under_250_max_price != null ||
      row.classic_under_250_enabled != null ||
      row.classic_under_250_title != null;
    if (!hasClassic) return parseUnder250FromColumns(row, "grid_first");
    return {
      enabled: parseGridFirstUnder250Enabled(row.classic_under_250_enabled),
      maxPrice: parseGridFirstUnder250MaxPrice(row.classic_under_250_max_price),
      title: parseGridFirstUnder250Title(
        row.classic_under_250_title,
        DEFAULT_GRID_FIRST_UNDER_250.title
      ),
      filterLabel: parseGridFirstUnder250Title(
        row.classic_under_250_filter_label,
        DEFAULT_GRID_FIRST_UNDER_250.filterLabel
      ),
      tabImageUrl: parseGridFirstUnder250ImageUrl(row.classic_under_250_tab_image_url),
      heroImageUrl: parseGridFirstUnder250ImageUrl(row.classic_under_250_hero_image_url),
    };
  }
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

function parseDiscoveryRow(row: LayoutRow | undefined): DiscoveryCtaConfig {
  if (!row) return { ...DEFAULT_DISCOVERY_CTA };
  return parseDiscoveryCtaConfig({
    discoveryDealsAtMaxPrice: row.discovery_deals_at_max_price,
    discoveryDealsAtImageUrl: row.discovery_deals_at_image_url,
    discoveryDealsAtHeroImageUrl: row.discovery_deals_at_hero_image_url,
    discoveryCrazyDealsImageUrl: row.discovery_crazy_deals_image_url,
    discoveryFreePackagingImageUrl: row.discovery_free_packaging_image_url,
    discoveryDealsAtLabel: row.discovery_deals_at_label,
    discoveryCrazyDealsLabel: row.discovery_crazy_deals_label,
    discoveryFreePackagingLabel: row.discovery_free_packaging_label,
    discoveryCtaTiles: row.discovery_cta_tiles,
  });
}

function isMissingColumnError(err: unknown, needles: string[]): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return needles.some((n) => message.includes(n));
}

export async function getStateFoodHomeLayoutConfig(stateId: string): Promise<StateFoodHomeLayoutConfig> {
  const sql = getSql();
  let row: LayoutRow | undefined;
  try {
    const rows = await sql<LayoutRow[]>`
      SELECT
        layout_key::text AS layout_key,
        grid_first_hero_media,
        classic_hero_media,
        grid_first_subscription_row_enabled,
        grid_first_subscription_row_text,
        grid_first_subscription_row_bg_color,
        grid_first_under_250_enabled,
        grid_first_under_250_max_price,
        grid_first_under_250_title,
        grid_first_under_250_filter_label,
        grid_first_under_250_tab_image_url,
        grid_first_under_250_hero_image_url,
        classic_under_250_enabled,
        classic_under_250_max_price,
        classic_under_250_title,
        classic_under_250_filter_label,
        classic_under_250_tab_image_url,
        classic_under_250_hero_image_url,
        discovery_deals_at_max_price,
        discovery_deals_at_image_url,
        discovery_deals_at_hero_image_url,
        discovery_crazy_deals_image_url,
        discovery_free_packaging_image_url,
        discovery_deals_at_label,
        discovery_crazy_deals_label,
        discovery_free_packaging_label,
        discovery_cta_tiles
      FROM cxapp_state_food_home_layout
      WHERE state_id = ${stateId}::uuid
      LIMIT 1
    `;
    row = rows[0];
  } catch (err) {
    if (
      !isMissingColumnError(err, [
        "classic_hero_media",
        "classic_under_250",
        "discovery_deals_at_max_price",
        "discovery_deals_at_image_url",
        "discovery_deals_at_hero_image_url",
        "discovery_crazy_deals_image_url",
        "discovery_free_packaging_image_url",
        "discovery_deals_at_label",
        "discovery_crazy_deals_label",
        "discovery_free_packaging_label",
        "discovery_cta_tiles",
      ])
    ) {
      throw err;
    }
    try {
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
          grid_first_under_250_hero_image_url,
          discovery_deals_at_max_price,
          discovery_deals_at_image_url,
          discovery_deals_at_hero_image_url,
          discovery_crazy_deals_image_url,
          discovery_free_packaging_image_url,
          discovery_deals_at_label,
          discovery_crazy_deals_label,
          discovery_free_packaging_label,
          discovery_cta_tiles
        FROM cxapp_state_food_home_layout
        WHERE state_id = ${stateId}::uuid
        LIMIT 1
      `;
      row = rows[0];
    } catch (err2) {
      if (
        !isMissingColumnError(err2, [
          "discovery_deals_at_max_price",
          "discovery_deals_at_image_url",
          "discovery_deals_at_hero_image_url",
          "discovery_crazy_deals_image_url",
          "discovery_free_packaging_image_url",
          "discovery_deals_at_label",
          "discovery_crazy_deals_label",
          "discovery_free_packaging_label",
          "discovery_cta_tiles",
        ])
      ) {
        throw err2;
      }
      try {
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
            grid_first_under_250_hero_image_url,
            discovery_deals_at_max_price,
            discovery_deals_at_image_url,
            discovery_crazy_deals_image_url,
            discovery_free_packaging_image_url,
            discovery_deals_at_label,
            discovery_crazy_deals_label,
            discovery_free_packaging_label
          FROM cxapp_state_food_home_layout
          WHERE state_id = ${stateId}::uuid
          LIMIT 1
        `;
        row = rows[0];
      } catch (err3) {
        if (
          !isMissingColumnError(err3, [
            "discovery_deals_at_max_price",
            "discovery_deals_at_image_url",
            "discovery_crazy_deals_image_url",
            "discovery_free_packaging_image_url",
            "discovery_deals_at_label",
            "discovery_crazy_deals_label",
            "discovery_free_packaging_label",
          ])
        ) {
          throw err3;
        }
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
        row = rows[0];
      }
    }
  }
  const gridFirstHeroMedia = parseGridFirstHeroMediaItems(row?.grid_first_hero_media);
  const classicHeroMedia =
    row?.classic_hero_media !== undefined
      ? parseGridFirstHeroMediaItems(row.classic_hero_media)
      : gridFirstHeroMedia;
  return {
    layoutKey: parseFoodHomeLayoutKey(row?.layout_key) ?? DEFAULT_FOOD_HOME_LAYOUT,
    gridFirstHeroMedia,
    classicHeroMedia,
    gridFirstSubscriptionRow: parseSubscriptionRow(row),
    gridFirstUnder250: parseUnder250FromColumns(row, "grid_first"),
    classicUnder250: parseUnder250FromColumns(row, "classic"),
    discoveryCta: parseDiscoveryRow(row),
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
      discovery_deals_at_max_price,
      discovery_deals_at_image_url,
      discovery_crazy_deals_image_url,
      discovery_free_packaging_image_url,
      discovery_deals_at_label,
      discovery_crazy_deals_label,
      discovery_free_packaging_label,
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
      ${DEFAULT_DISCOVERY_CTA.dealsAtMaxPrice},
      ${DEFAULT_DISCOVERY_CTA.dealsAtImageUrl},
      ${DEFAULT_DISCOVERY_CTA.crazyDealsImageUrl},
      ${DEFAULT_DISCOVERY_CTA.freePackagingImageUrl},
      ${DEFAULT_DISCOVERY_CTA.dealsAtLabel},
      ${DEFAULT_DISCOVERY_CTA.crazyDealsLabel},
      ${DEFAULT_DISCOVERY_CTA.freePackagingLabel},
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

export async function saveStateClassicUnder250(
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
  try {
    await sql`
      UPDATE cxapp_state_food_home_layout
      SET classic_under_250_enabled = ${enabled},
          classic_under_250_max_price = ${maxPrice},
          classic_under_250_title = ${title},
          classic_under_250_filter_label = ${filterLabel},
          classic_under_250_tab_image_url = ${tabImageUrl},
          classic_under_250_hero_image_url = ${heroImageUrl},
          updated_at = now()
      WHERE state_id = ${stateId}::uuid
    `;
  } catch (err) {
    if (!isMissingColumnError(err, ["classic_under_250"])) throw err;
    // Pre-migration: refuse to write classic into grid columns (that caused the mix).
    throw new Error(
      "classic_under_250 columns missing — apply migration 0635_food_home_layout_under250_detach.sql"
    );
  }
  return { enabled, maxPrice, title, filterLabel, tabImageUrl, heroImageUrl };
}

export async function saveStateDiscoveryCta(
  stateId: string,
  config: DiscoveryCtaConfig
): Promise<DiscoveryCtaConfig> {
  await ensureStateFoodHomeLayoutRow(stateId);
  const sql = getSql();
  const parsed = parseDiscoveryCtaConfig({
    discoveryDealsAtMaxPrice: config.dealsAtMaxPrice,
    discoveryDealsAtImageUrl: config.dealsAtImageUrl,
    discoveryDealsAtHeroImageUrl: config.dealsAtHeroImageUrl,
    discoveryCrazyDealsImageUrl: config.crazyDealsImageUrl,
    discoveryFreePackagingImageUrl: config.freePackagingImageUrl,
    discoveryDealsAtLabel: config.dealsAtLabel,
    discoveryCrazyDealsLabel: config.crazyDealsLabel,
    discoveryFreePackagingLabel: config.freePackagingLabel,
    discoveryCtaTiles: config.tiles,
  });
  const meals = parsed.tiles.find((t) => t.action === "meals");
  const deals = parsed.tiles.find((t) => t.action === "deals");
  const packaging = parsed.tiles.find((t) => t.action === "packaging");
  await sql`
    UPDATE cxapp_state_food_home_layout
    SET discovery_deals_at_max_price = ${meals?.maxPrice ?? parsed.dealsAtMaxPrice},
        discovery_deals_at_image_url = ${meals?.imageUrl ?? null},
        discovery_deals_at_hero_image_url = ${meals?.heroImageUrl ?? parsed.dealsAtHeroImageUrl},
        discovery_crazy_deals_image_url = ${deals?.imageUrl ?? null},
        discovery_free_packaging_image_url = ${packaging?.imageUrl ?? null},
        discovery_deals_at_label = ${meals?.label ?? null},
        discovery_crazy_deals_label = ${deals?.label ?? null},
        discovery_free_packaging_label = ${packaging?.label ?? null},
        discovery_cta_tiles = ${JSON.stringify(parsed.tiles)}::jsonb,
        updated_at = now()
    WHERE state_id = ${stateId}::uuid
  `;
  return parsed;
}
