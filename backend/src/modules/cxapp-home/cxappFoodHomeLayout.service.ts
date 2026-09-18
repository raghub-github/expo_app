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
} from "../../lib/cxapp-food-home-layout.js";
import {
  parseGridFirstHeroMediaItems,
  type GridFirstHeroMediaItem,
} from "../../lib/cxapp-grid-first-hero-media.js";
import { getSql } from "../../db/client.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

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
  classicUnder250Enabled: boolean;
  classicUnder250MaxPrice: number;
  classicUnder250Title: string;
  classicUnder250FilterLabel: string;
  classicUnder250TabImageUrl: string | null;
  classicUnder250HeroImageUrl: string | null;
  discoveryDealsAtMaxPrice: number | null;
  discoveryDealsAtImageUrl: string | null;
  discoveryDealsAtHeroImageUrl: string | null;
  discoveryCrazyDealsImageUrl: string | null;
  discoveryFreePackagingImageUrl: string | null;
  discoveryDealsAtLabel: string | null;
  discoveryCrazyDealsLabel: string | null;
  discoveryFreePackagingLabel: string | null;
  discoveryCtaTiles: DiscoveryCtaConfig["tiles"];
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
    const hasClassicCols =
      row.classic_under_250_max_price != null ||
      row.classic_under_250_enabled != null ||
      row.classic_under_250_title != null;
    // Pre-migration DBs: fall back once; never after classic_* exists.
    if (!hasClassicCols) return parseUnder250FromColumns(row, "grid_first");
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

async function getStateFoodHomeLayoutRow(stateId: string): Promise<{
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
  gridFirstUnder250: GridFirstUnder250Config;
  classicUnder250: GridFirstUnder250Config;
  discoveryCta: DiscoveryCtaConfig;
}> {
  const sql = getSql();
  let row: LayoutRow | undefined;
  try {
    const [full] = await sql<LayoutRow[]>`
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
    row = full;
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
      const [withoutClassic] = await sql<LayoutRow[]>`
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
      row = withoutClassic;
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
        const [withoutHero] = await sql<LayoutRow[]>`
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
        row = withoutHero;
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
        const [legacy] = await sql<LayoutRow[]>`
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
        row = legacy;
      }
    }
  }
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
    gridFirstUnder250: parseUnder250FromColumns(row, "grid_first"),
    classicUnder250: parseUnder250FromColumns(row, "classic"),
    discoveryCta: parseDiscoveryRow(row),
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

function flattenRow(row: {
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRow: GridFirstSubscriptionRowConfig;
  gridFirstUnder250: GridFirstUnder250Config;
  classicUnder250: GridFirstUnder250Config;
  discoveryCta: DiscoveryCtaConfig;
}): Omit<ResolvedFoodHomeLayout, "stateId" | "stateName"> {
  const gridUnder = row.gridFirstUnder250;
  const classicUnder = row.classicUnder250;
  // Layout-gate response fields so clients cannot mix classic ₹99 into grid
  // (or the reverse). Discovery never exposes meals-under chips.
  const exposeGridUnder = row.layoutKey === "grid_first";
  const exposeClassicUnder = row.layoutKey === "classic";
  return {
    layoutKey: row.layoutKey,
    gridFirstHeroMedia: row.layoutKey === "grid_first" ? row.gridFirstHeroMedia : [],
    gridFirstSubscriptionRowEnabled:
      row.layoutKey === "grid_first" ? row.gridFirstSubscriptionRow.enabled : false,
    gridFirstSubscriptionRowText: row.gridFirstSubscriptionRow.text,
    gridFirstSubscriptionRowBgColor: row.gridFirstSubscriptionRow.backgroundColor,
    gridFirstUnder250Enabled: exposeGridUnder ? gridUnder.enabled : false,
    gridFirstUnder250MaxPrice: exposeGridUnder
      ? gridUnder.maxPrice
      : DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
    gridFirstUnder250Title: exposeGridUnder
      ? gridUnder.title
      : DEFAULT_GRID_FIRST_UNDER_250.title,
    gridFirstUnder250FilterLabel: exposeGridUnder
      ? gridUnder.filterLabel
      : DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
    gridFirstUnder250TabImageUrl: exposeGridUnder ? gridUnder.tabImageUrl : null,
    gridFirstUnder250HeroImageUrl: exposeGridUnder ? gridUnder.heroImageUrl : null,
    classicUnder250Enabled: exposeClassicUnder ? classicUnder.enabled : false,
    classicUnder250MaxPrice: exposeClassicUnder
      ? classicUnder.maxPrice
      : DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
    classicUnder250Title: exposeClassicUnder
      ? classicUnder.title
      : DEFAULT_GRID_FIRST_UNDER_250.title,
    classicUnder250FilterLabel: exposeClassicUnder
      ? classicUnder.filterLabel
      : DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
    classicUnder250TabImageUrl: exposeClassicUnder ? classicUnder.tabImageUrl : null,
    classicUnder250HeroImageUrl: exposeClassicUnder ? classicUnder.heroImageUrl : null,
    discoveryDealsAtMaxPrice:
      row.layoutKey === "discovery" ? row.discoveryCta.dealsAtMaxPrice : null,
    discoveryDealsAtImageUrl:
      row.layoutKey === "discovery"
        ? toAbsoluteClientMediaUrl(row.discoveryCta.dealsAtImageUrl)
        : null,
    discoveryDealsAtHeroImageUrl:
      row.layoutKey === "discovery"
        ? toAbsoluteClientMediaUrl(row.discoveryCta.dealsAtHeroImageUrl)
        : null,
    discoveryCrazyDealsImageUrl:
      row.layoutKey === "discovery"
        ? toAbsoluteClientMediaUrl(row.discoveryCta.crazyDealsImageUrl)
        : null,
    discoveryFreePackagingImageUrl:
      row.layoutKey === "discovery"
        ? toAbsoluteClientMediaUrl(row.discoveryCta.freePackagingImageUrl)
        : null,
    discoveryDealsAtLabel:
      row.layoutKey === "discovery" ? row.discoveryCta.dealsAtLabel : null,
    discoveryCrazyDealsLabel:
      row.layoutKey === "discovery" ? row.discoveryCta.crazyDealsLabel : null,
    discoveryFreePackagingLabel:
      row.layoutKey === "discovery" ? row.discoveryCta.freePackagingLabel : null,
    discoveryCtaTiles:
      row.layoutKey === "discovery"
        ? row.discoveryCta.tiles.map((tile) => ({
            ...tile,
            imageUrl: toAbsoluteClientMediaUrl(tile.imageUrl),
            heroImageUrl: toAbsoluteClientMediaUrl(tile.heroImageUrl),
          }))
        : [],
  };
}

const emptyLayoutFields: Omit<ResolvedFoodHomeLayout, "layoutKey" | "stateId" | "stateName"> = {
  gridFirstHeroMedia: [],
  gridFirstSubscriptionRowEnabled: false,
  gridFirstSubscriptionRowText: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
  gridFirstSubscriptionRowBgColor: DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor,
  gridFirstUnder250Enabled: false,
  gridFirstUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
  gridFirstUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
  gridFirstUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
  gridFirstUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
  gridFirstUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
  classicUnder250Enabled: false,
  classicUnder250MaxPrice: DEFAULT_GRID_FIRST_UNDER_250.maxPrice,
  classicUnder250Title: DEFAULT_GRID_FIRST_UNDER_250.title,
  classicUnder250FilterLabel: DEFAULT_GRID_FIRST_UNDER_250.filterLabel,
  classicUnder250TabImageUrl: DEFAULT_GRID_FIRST_UNDER_250.tabImageUrl,
  classicUnder250HeroImageUrl: DEFAULT_GRID_FIRST_UNDER_250.heroImageUrl,
  discoveryDealsAtMaxPrice: DEFAULT_DISCOVERY_CTA.dealsAtMaxPrice,
  discoveryDealsAtImageUrl: DEFAULT_DISCOVERY_CTA.dealsAtImageUrl,
  discoveryDealsAtHeroImageUrl: DEFAULT_DISCOVERY_CTA.dealsAtHeroImageUrl,
  discoveryCrazyDealsImageUrl: DEFAULT_DISCOVERY_CTA.crazyDealsImageUrl,
  discoveryFreePackagingImageUrl: DEFAULT_DISCOVERY_CTA.freePackagingImageUrl,
  discoveryDealsAtLabel: DEFAULT_DISCOVERY_CTA.dealsAtLabel,
  discoveryCrazyDealsLabel: DEFAULT_DISCOVERY_CTA.crazyDealsLabel,
  discoveryFreePackagingLabel: DEFAULT_DISCOVERY_CTA.freePackagingLabel,
  discoveryCtaTiles: DEFAULT_DISCOVERY_CTA.tiles,
};

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

  if (!stateId) {
    return {
      layoutKey: DEFAULT_FOOD_HOME_LAYOUT,
      stateId: null,
      stateName,
      ...emptyLayoutFields,
    };
  }

  try {
    const row = await getStateFoodHomeLayoutRow(stateId);
    return {
      stateId,
      stateName,
      ...flattenRow(row),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("cxapp_state_food_home_layout") && message.includes("does not exist")) {
      return {
        layoutKey: DEFAULT_FOOD_HOME_LAYOUT,
        stateId,
        stateName,
        ...emptyLayoutFields,
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
        ...emptyLayoutFields,
        gridFirstHeroMedia,
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
