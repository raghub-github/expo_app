/**
 * Platform + per-store slot settings for incoming-order alerts (partnersite / dashboard parity).
 */
import type { Sql } from "postgres";

export type MerchantOrderAcceptanceSettings = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot: [string | null, string | null, string | null];
  alert_sound_slot_choice: number;
};

const DEFAULTS: MerchantOrderAcceptanceSettings = {
  store_type: "GENERAL",
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

function trimUrl(v: unknown): string | null {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Stored DB paths are `/api/attachments/proxy?key=...` — mobile clients need absolute backend URLs. */
function toAbsoluteAttachmentUrl(stored: string | null): string | null {
  if (!stored) return null;
  let path = stored.trim();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/api/attachments/proxy")) {
    path = `/v1/attachments/proxy${path.slice("/api/attachments/proxy".length)}`;
  } else if (!path.startsWith("/v1/attachments/proxy") && !path.startsWith("/")) {
    path = `/v1/attachments/proxy?key=${encodeURIComponent(path)}`;
  }
  const base = (process.env.API_BASE_URL || process.env.PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function slotsFromRow(row: Record<string, unknown> | undefined): [string | null, string | null, string | null] {
  if (!row) return [null, null, null];
  return [
    toAbsoluteAttachmentUrl(trimUrl(row.alert_sound_url)),
    toAbsoluteAttachmentUrl(trimUrl(row.alert_sound_url_2)),
    toAbsoluteAttachmentUrl(trimUrl(row.alert_sound_url_3)),
  ];
}

function resolveEffectiveUrl(slots: [string | null, string | null, string | null], choice: number) {
  const c = Math.max(0, Math.min(2, Math.floor(choice)));
  if (slots[c]) return slots[c];
  for (let i = 0; i < 3; i++) {
    if (slots[i]) return slots[i];
  }
  return null;
}

function parseStoredSlot(meta: unknown): number {
  if (!meta || typeof meta !== "object") return 0;
  const raw = (meta as Record<string, unknown>).platform_food_alert_sound_slot;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 2) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 2) return n;
  }
  return 0;
}

export async function loadMerchantOrderAcceptanceSettings(
  sql: Sql,
  merchantStoreId: number
): Promise<MerchantOrderAcceptanceSettings> {
  const storeRows = await sql`
    SELECT store_type::text AS store_type
    FROM merchant_stores
    WHERE id = ${merchantStoreId}
    LIMIT 1
  `;
  const storeType = String((storeRows[0] as { store_type?: string } | undefined)?.store_type ?? "GENERAL").toUpperCase();

  let storedChoice = 0;
  const settRows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${merchantStoreId}
    LIMIT 1
  `;
  if (settRows[0]) {
    storedChoice = parseStoredSlot((settRows[0] as { settings_metadata?: unknown }).settings_metadata);
  }

  const loadPlatform = async (stype: string) => {
    const rows = await sql`
      SELECT
        store_type::text AS store_type,
        acceptance_window_minutes,
        alert_sound_enabled,
        alert_sound_url,
        alert_sound_url_2,
        alert_sound_url_3,
        alert_sound_repeat_count
      FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type = ${stype}
      LIMIT 1
    `;
    return (rows[0] as Record<string, unknown> | undefined) ?? undefined;
  };

  let row = await loadPlatform(storeType);
  if (!row) row = await loadPlatform("GENERAL");
  if (!row) return { ...DEFAULTS, store_type: storeType };

  const slots = slotsFromRow(row);
  let choice = Math.max(0, Math.min(2, Math.floor(storedChoice)));
  if (!slots[choice]) {
    const first = slots.findIndex((u) => u != null);
    if (first >= 0) choice = first;
  }

  const repeatRaw = Number(row.alert_sound_repeat_count ?? 1);
  const repeat = Number.isFinite(repeatRaw) ? Math.max(1, Math.min(25, Math.floor(repeatRaw))) : 1;
  const windowRaw = Number(row.acceptance_window_minutes ?? 5);
  const windowMins = Number.isFinite(windowRaw)
    ? Math.max(1, Math.min(180, Math.floor(windowRaw)))
    : 5;

  return {
    store_type: storeType,
    acceptance_window_minutes: windowMins,
    alert_sound_enabled: row.alert_sound_enabled !== false,
    alert_sound_url: resolveEffectiveUrl(slots, choice),
    alert_sound_repeat_count: repeat,
    alert_sound_urls_by_slot: slots,
    alert_sound_slot_choice: choice,
  };
}

const PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY = "platform_food_alert_sound_slot";

/** Persist merchant's chosen alert sound slot (0–2) for this store. */
export async function patchMerchantOrderAcceptanceSoundSlot(
  sql: Sql,
  merchantStoreId: number,
  slot: number
): Promise<{ ok: true; alert_sound_slot_choice: number }> {
  const c = Math.max(0, Math.min(2, Math.floor(slot)));
  const settings = await loadMerchantOrderAcceptanceSettings(sql, merchantStoreId);
  if (!settings.alert_sound_urls_by_slot[c]) {
    throw new Error("empty_sound_slot");
  }

  const existing = await sql`
    SELECT id, settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${merchantStoreId}
    LIMIT 1
  `;
  const currentMeta =
    existing[0]?.settings_metadata && typeof existing[0].settings_metadata === "object"
      ? (existing[0].settings_metadata as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...currentMeta,
    [PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY]: c,
  };
  const metaJson = JSON.stringify(nextMeta);

  if (existing[0]?.id != null) {
    await sql`
      UPDATE merchant_store_settings
      SET settings_metadata = ${metaJson}::jsonb, updated_at = NOW()
      WHERE store_id = ${merchantStoreId}
    `;
  } else {
    await sql`
      INSERT INTO merchant_store_settings (store_id, settings_metadata, updated_at)
      VALUES (${merchantStoreId}, ${metaJson}::jsonb, NOW())
    `;
  }

  return { ok: true, alert_sound_slot_choice: c };
}
