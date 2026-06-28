import { getSql } from "@/lib/db/client";
import type { AppStaticAssetApp } from "@/lib/app-static-assets/shared";

export type AppStaticAssetRow = {
  id: string;
  app: AppStaticAssetApp;
  section: string;
  label: string;
  description: string;
  r2_key: string | null;
  proxy_url: string | null;
  sort_order: number;
};

function mapRow(r: Record<string, unknown>): AppStaticAssetRow {
  return {
    id: String(r.id),
    app: String(r.app) as AppStaticAssetApp,
    section: String(r.section ?? ""),
    label: String(r.label ?? ""),
    description: String(r.description ?? ""),
    r2_key: r.r2_key != null ? String(r.r2_key) : null,
    proxy_url: r.proxy_url != null ? String(r.proxy_url) : null,
    sort_order: Number(r.sort_order ?? 0),
  };
}

export async function listAppStaticAssets(app: AppStaticAssetApp): Promise<AppStaticAssetRow[]> {
  const sql = getSql();
  const raw = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE app = ${app}
    ORDER BY section ASC, sort_order ASC, id ASC
  `;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => mapRow(x as Record<string, unknown>));
}

export async function getAppStaticAssetById(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE id = ${id}
    LIMIT 1
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function setAppStaticAssetImage(
  id: string,
  r2Key: string,
  proxyUrl: string
): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    UPDATE app_static_assets
    SET r2_key = ${r2Key}, proxy_url = ${proxyUrl}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function clearAppStaticAssetImage(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    UPDATE app_static_assets
    SET r2_key = NULL, proxy_url = NULL, updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
