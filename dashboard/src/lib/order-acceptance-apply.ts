import { randomUUID } from "crypto";
import { getSql } from "@/lib/db/client";
import { extractR2KeyFromProxyUrl } from "@/lib/r2-proxy-url";
import { copyObjectToKey } from "@/lib/services/r2";

export type OrderAcceptanceSettingsRow = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_url_2: string | null;
  alert_sound_url_3: string | null;
  alert_sound_repeat_count: number;
};

const PROXY_PREFIX = "/api/attachments/proxy?key=";

function trimUrl(v: string | null | undefined): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
}

function hasAnySound(row: OrderAcceptanceSettingsRow): boolean {
  return Boolean(
    trimUrl(row.alert_sound_url) ||
      trimUrl(row.alert_sound_url_2) ||
      trimUrl(row.alert_sound_url_3)
  );
}

export function proxyUrlForR2Key(key: string): string {
  return `${PROXY_PREFIX}${encodeURIComponent(key)}`;
}

async function duplicateStoredSound(
  storedUrl: string | null,
  destPrefix: string
): Promise<string | null> {
  const raw = trimUrl(storedUrl);
  if (!raw) return null;
  try {
    const srcKey = extractR2KeyFromProxyUrl(raw) || raw;
    if (!srcKey) return raw;
    const extMatch = /\.([a-zA-Z0-9]{2,5})$/.exec(srcKey);
    const ext = extMatch?.[1] ?? "mp3";
    const destKey = `${destPrefix}-${randomUUID()}.${ext}`;
    await copyObjectToKey(srcKey, destKey);
    return proxyUrlForR2Key(destKey);
  } catch (e) {
    console.warn("[order-acceptance] sound copy failed, reusing source url", e);
    return raw;
  }
}

export async function countSoundUrlReferences(
  url: string,
  excludeStoreType?: string
): Promise<number> {
  const raw = trimUrl(url);
  if (!raw) return 0;
  const sql = getSql();
  const type = excludeStoreType?.trim().toUpperCase() || "";
  const rows = type
    ? await sql<Array<{ n: string }>>`
        SELECT COUNT(*)::text AS n
        FROM platform_food_acceptance_settings_by_store_type
        WHERE store_type <> ${type}
          AND (
            alert_sound_url = ${raw}
            OR alert_sound_url_2 = ${raw}
            OR alert_sound_url_3 = ${raw}
          )
      `
    : await sql<Array<{ n: string }>>`
        SELECT COUNT(*)::text AS n
        FROM platform_food_acceptance_settings_by_store_type
        WHERE alert_sound_url = ${raw}
           OR alert_sound_url_2 = ${raw}
           OR alert_sound_url_3 = ${raw}
      `;
  return Number(rows[0]?.n ?? 0) || 0;
}

export async function applySourceSoundsToAllTypes(opts?: {
  sourceType?: string;
  windowMinutes?: number;
}): Promise<{
  sourceType: string;
  windowMinutes: number;
  updated: string[];
}> {
  const sql = getSql();
  const windowMinutes = Math.max(1, Math.min(180, Math.floor(opts?.windowMinutes ?? 15)));
  const rows = (await sql`
    SELECT
      store_type,
      acceptance_window_minutes,
      alert_sound_enabled,
      alert_sound_url,
      alert_sound_url_2,
      alert_sound_url_3,
      alert_sound_repeat_count
    FROM platform_food_acceptance_settings_by_store_type
    ORDER BY store_type ASC
  `) as OrderAcceptanceSettingsRow[];

  const preferred = String(opts?.sourceType || "RESTAURANT").trim().toUpperCase();
  const withSound = rows.filter(hasAnySound);
  const source =
    withSound.find((r) => String(r.store_type).toUpperCase() === preferred) ??
    withSound[0];
  if (!source) {
    throw new Error("No store type has uploaded alert sounds to copy");
  }

  const sourceType = String(source.store_type).toUpperCase();
  const updated: string[] = [];

  for (const row of rows) {
    const type = String(row.store_type || "").trim().toUpperCase();
    if (!type) continue;

    let url1 = trimUrl(source.alert_sound_url);
    let url2 = trimUrl(source.alert_sound_url_2);
    let url3 = trimUrl(source.alert_sound_url_3);

    if (type !== sourceType) {
      const prefix = `admin/order-acceptance-sound/${type.toLowerCase()}`;
      url1 = await duplicateStoredSound(source.alert_sound_url, `${prefix}-1`);
      url2 = await duplicateStoredSound(source.alert_sound_url_2, `${prefix}-2`);
      url3 = await duplicateStoredSound(source.alert_sound_url_3, `${prefix}-3`);
    }

    await sql`
      UPDATE platform_food_acceptance_settings_by_store_type
      SET
        acceptance_window_minutes = ${windowMinutes}::int,
        alert_sound_enabled = ${source.alert_sound_enabled !== false}::boolean,
        alert_sound_url = ${url1},
        alert_sound_url_2 = ${url2},
        alert_sound_url_3 = ${url3},
        alert_sound_repeat_count = ${Math.max(0, Math.min(25, Number(source.alert_sound_repeat_count) || 1))}::int
      WHERE store_type = ${type}
    `;
    updated.push(type);
  }

  return { sourceType, windowMinutes, updated };
}
