import { getSql } from "../../db/client.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { getR2SignedUrl } from "../../services/r2/r2Service.js";
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
  updatedAt: string | null;
};

export type AppStaticAssetClientItem = {
  id: string;
  section: string;
  label: string;
  description: string;
  proxyUrl: string | null;
  url: string | null;
  sortOrder: number;
  updatedAt: string | null;
};

/** Signed GET URLs for mobile — phone hits R2 directly (avoids LAN proxy bottleneck). */
const CLIENT_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 6; // 6 days (under R2 7-day max)

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
    updatedAt:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : r.updated_at != null
          ? String(r.updated_at)
          : null,
  };
}

async function toClientItem(row: AppStaticAssetRow): Promise<AppStaticAssetClientItem> {
  const proxyUrl = row.proxyUrl?.trim() || null;
  const r2Key = row.r2Key?.trim() || null;
  let url: string | null = null;
  if (r2Key) {
    try {
      url = await getR2SignedUrl(r2Key, CLIENT_SIGNED_URL_TTL_SEC);
    } catch {
      url = null;
    }
  }
  if (!url) {
    url = toAbsoluteClientMediaUrl(proxyUrl);
  }
  return {
    id: row.id,
    section: row.section,
    label: row.label,
    description: row.description,
    proxyUrl,
    url,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt,
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
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order, updated_at
    FROM app_static_assets
    WHERE app = ${app}
    ORDER BY section ASC, sort_order ASC, id ASC
  `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function getAppStaticAssetById(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order, updated_at
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
  return Promise.all(rows.map((row) => toClientItem(row)));
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
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order, updated_at
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
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order, updated_at
  `;
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapRow(row) : null;
}

export function parseAppStaticAssetAppParam(value: string): AppStaticAssetApp | null {
  return parseAppStaticAssetApp(value);
}
