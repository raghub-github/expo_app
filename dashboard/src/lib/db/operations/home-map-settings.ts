import { getSql } from "@/lib/db/client";
import {
  HOME_MAP_MODE_CONFIG_KEY,
  HOME_MAP_STATIC_ASSET_ID,
  parseHomeMapMode,
  type HomeMapMode,
} from "@/lib/home-map/shared";
import {
  getAppStaticAssetById,
  type AppStaticAssetRow,
} from "@/lib/db/operations/app-static-assets";

export type HomeMapSettings = {
  mode: HomeMapMode;
  staticImage: {
    id: string;
    proxyUrl: string | null;
    r2Key: string | null;
    label: string;
  } | null;
  updatedAt: string | null;
};

async function ensureHomeMapInfrastructure(): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      INSERT INTO app_static_assets (id, app, section, label, description, sort_order)
      VALUES (
        ${HOME_MAP_STATIC_ASSET_ID},
        'dashboard',
        'Home Map',
        'Static home map',
        'Control Dashboard Home — shown when Home Map mode is Static Map Image. Fully responsive; aspect ratio preserved.',
        10
      )
      ON CONFLICT (id) DO NOTHING
    `;
  } catch {
    // Non-fatal — CHECK may still disallow dashboard until migration runs.
  }
  try {
    await sql`
      INSERT INTO system_config (config_key, config_value, value_type, description, category)
      VALUES (
        ${HOME_MAP_MODE_CONFIG_KEY},
        '"live"'::jsonb,
        'string',
        'Control Dashboard Home map mode: live (Mapbox) or static (uploaded image).',
        'dashboard'
      )
      ON CONFLICT (config_key) DO NOTHING
    `;
  } catch {
    // Non-fatal
  }
}

export async function getHomeMapSettings(): Promise<HomeMapSettings> {
  await ensureHomeMapInfrastructure();
  const sql = getSql();

  let mode: HomeMapMode = "live";
  let updatedAt: string | null = null;
  try {
    const rows = await sql<
      { config_value: unknown; updated_at: string | null }[]
    >`
      SELECT config_value, updated_at
      FROM system_config
      WHERE config_key = ${HOME_MAP_MODE_CONFIG_KEY}
      LIMIT 1
    `;
    const row = rows[0];
    if (row) {
      mode = parseHomeMapMode(row.config_value);
      updatedAt = row.updated_at ? String(row.updated_at) : null;
    }
  } catch {
    mode = "live";
  }

  let asset: AppStaticAssetRow | null = null;
  try {
    asset = await getAppStaticAssetById(HOME_MAP_STATIC_ASSET_ID);
  } catch {
    asset = null;
  }

  return {
    mode,
    staticImage: asset
      ? {
          id: asset.id,
          proxyUrl: asset.proxy_url,
          r2Key: asset.r2_key,
          label: asset.label,
        }
      : {
          id: HOME_MAP_STATIC_ASSET_ID,
          proxyUrl: null,
          r2Key: null,
          label: "Static home map",
        },
    updatedAt,
  };
}

export async function setHomeMapMode(mode: HomeMapMode): Promise<HomeMapSettings> {
  await ensureHomeMapInfrastructure();
  const sql = getSql();
  await sql`
    INSERT INTO system_config (config_key, config_value, value_type, description, category, updated_at)
    VALUES (
      ${HOME_MAP_MODE_CONFIG_KEY},
      to_jsonb(${mode}::text),
      'string',
      'Control Dashboard Home map mode: live (Mapbox) or static (uploaded image).',
      'dashboard',
      NOW()
    )
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_at = NOW()
  `;
  return getHomeMapSettings();
}
