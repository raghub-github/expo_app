import { getSql } from "../../db/client.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import {
  APP_STATIC_ASSET_SEEDS,
  parseAppStaticAssetApp,
  type AppStaticAssetApp,
} from "../../lib/app-static-assets.registry.js";

export type AppStaticAssetRow = {
  id: string;
  app: AppStaticAssetApp;
  section: string;
  label: string;
  description: string;
  r2Key: string | null;
  proxyUrl: string | null;
  sortOrder: number;
};

export type AppStaticAssetClientItem = {
  id: string;
  section: string;
  label: string;
  description: string;
  proxyUrl: string | null;
  url: string | null;
  sortOrder: number;
};

function mapRow(r: Record<string, unknown>): AppStaticAssetRow {
  return {
    id: String(r.id),
    app: String(r.app) as AppStaticAssetApp,
    section: String(r.section ?? ""),
    label: String(r.label ?? ""),
    description: String(r.description ?? ""),
    r2Key: r.r2_key != null ? String(r.r2_key) : null,
    proxyUrl: r.proxy_url != null ? String(r.proxy_url) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toClientItem(row: AppStaticAssetRow): AppStaticAssetClientItem {
  const proxyUrl = row.proxyUrl?.trim() || null;
  return {
    id: row.id,
    section: row.section,
    label: row.label,
    description: row.description,
    proxyUrl,
    url: toAbsoluteClientMediaUrl(proxyUrl),
    sortOrder: row.sortOrder,
  };
}

/** Ensure registry rows exist (idempotent). */
export async function ensureAppStaticAssetSeeds(): Promise<void> {
  const sql = getSql();
  for (const seed of APP_STATIC_ASSET_SEEDS) {
    await sql`
      INSERT INTO app_static_assets (id, app, section, label, description, sort_order)
      VALUES (
        ${seed.id},
        ${seed.app},
        ${seed.section},
        ${seed.label},
        ${seed.description},
        ${seed.sortOrder}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

let seedsOnce: Promise<void> | null = null;

/** One-shot seed so new registry slots appear without waiting for a migration deploy. */
export function ensureAppStaticAssetSeedsOnce(): Promise<void> {
  if (!seedsOnce) {
    seedsOnce = ensureAppStaticAssetSeeds().catch((err) => {
      seedsOnce = null;
      throw err;
    });
  }
  return seedsOnce;
}

export async function listAppStaticAssets(app: AppStaticAssetApp): Promise<AppStaticAssetRow[]> {
  await ensureAppStaticAssetSeedsOnce().catch(() => undefined);
  const sql = getSql();
  const rows = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE app = ${app}
    ORDER BY section ASC, sort_order ASC, id ASC
  `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function getAppStaticAssetById(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapRow(row) : null;
}

export async function listAppStaticAssetsForClient(
  app: AppStaticAssetApp
): Promise<AppStaticAssetClientItem[]> {
  const rows = await listAppStaticAssets(app);
  return rows.map(toClientItem);
}

export async function setAppStaticAssetImage(
  id: string,
  r2Key: string,
  proxyUrl: string
): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE app_static_assets
    SET
      r2_key = ${r2Key},
      proxy_url = ${proxyUrl},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapRow(row) : null;
}

export async function clearAppStaticAssetImage(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE app_static_assets
    SET
      r2_key = NULL,
      proxy_url = NULL,
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapRow(row) : null;
}

export function parseAppStaticAssetAppParam(value: string): AppStaticAssetApp | null {
  return parseAppStaticAssetApp(value);
}
