import { getSql } from "@/lib/db/client";
import {
  parseHomeAdAudience,
  parseHomeAdCtaAction,
  parseHomeAdPlacement,
  type HomeAdAudience,
  type HomeAdCtaAction,
  type HomeAdPlacement,
  type HomeAdRow,
} from "@/lib/home-ads/shared";

let ensured = false;

async function ensureHomeAdsTable(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS public.home_ads (
      id bigserial PRIMARY KEY,
      audience text NOT NULL CHECK (audience IN ('customer', 'rider', 'merchant')),
      placement text NOT NULL DEFAULT 'both'
        CHECK (placement IN ('home', 'orders', 'both')),
      title text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '',
      image_r2_key text,
      image_proxy_url text,
      cta_label text,
      cta_url text,
      cta_action text NOT NULL DEFAULT 'share',
      sheet_title text,
      sheet_body text,
      enabled boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE public.home_ads ADD COLUMN IF NOT EXISTS cta_action text NOT NULL DEFAULT 'share'`;
  await sql`ALTER TABLE public.home_ads ADD COLUMN IF NOT EXISTS sheet_title text`;
  await sql`ALTER TABLE public.home_ads ADD COLUMN IF NOT EXISTS sheet_body text`;
  // Allow redirect CTA (0647) — best-effort if constraint already matches.
  try {
    await sql`ALTER TABLE public.home_ads DROP CONSTRAINT IF EXISTS home_ads_cta_action_check`;
    await sql`
      ALTER TABLE public.home_ads
        ADD CONSTRAINT home_ads_cta_action_check
        CHECK (cta_action IN ('bottom_sheet', 'share', 'redirect'))
    `;
  } catch {
    /* ignore if concurrent / unsupported */
  }
  await sql`
    CREATE INDEX IF NOT EXISTS idx_home_ads_audience_enabled_sort
      ON public.home_ads (audience, sort_order, id)
      WHERE enabled = true
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_home_ads_audience_admin
      ON public.home_ads (audience, sort_order, id)
  `;
  ensured = true;
}

function mapRow(r: Record<string, unknown>): HomeAdRow {
  return {
    id: Number(r.id),
    audience: parseHomeAdAudience(String(r.audience ?? "")) ?? "merchant",
    placement: parseHomeAdPlacement(String(r.placement ?? "both")) ?? "both",
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    image_r2_key: r.image_r2_key != null ? String(r.image_r2_key) : null,
    image_proxy_url: r.image_proxy_url != null ? String(r.image_proxy_url) : null,
    cta_label: r.cta_label != null ? String(r.cta_label) : null,
    cta_url: r.cta_url != null ? String(r.cta_url) : null,
    cta_action: parseHomeAdCtaAction(String(r.cta_action ?? "share")) ?? "share",
    sheet_title: r.sheet_title != null ? String(r.sheet_title) : null,
    sheet_body: r.sheet_body != null ? String(r.sheet_body) : null,
    enabled: r.enabled === true,
    sort_order: Number(r.sort_order ?? 0) || 0,
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  };
}

export async function listHomeAds(audience?: HomeAdAudience | null): Promise<HomeAdRow[]> {
  await ensureHomeAdsTable();
  const sql = getSql();
  const rows = audience
    ? await sql`
        SELECT *
        FROM home_ads
        WHERE audience = ${audience}
        ORDER BY sort_order ASC, id ASC
      `
    : await sql`
        SELECT *
        FROM home_ads
        ORDER BY audience ASC, sort_order ASC, id ASC
      `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function listEnabledHomeAds(
  audience: HomeAdAudience,
  placement: "home" | "orders"
): Promise<HomeAdRow[]> {
  await ensureHomeAdsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM home_ads
    WHERE audience = ${audience}
      AND enabled = true
      AND (placement = ${placement} OR placement = 'both')
    ORDER BY sort_order ASC, id ASC
    LIMIT 20
  `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function getHomeAdById(id: number): Promise<HomeAdRow | null> {
  await ensureHomeAdsTable();
  const sql = getSql();
  const rows = await sql`SELECT * FROM home_ads WHERE id = ${id} LIMIT 1`;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function insertHomeAd(input: {
  audience: HomeAdAudience;
  placement: HomeAdPlacement;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaAction?: HomeAdCtaAction;
  sheetTitle?: string | null;
  sheetBody?: string | null;
  sortOrder?: number | null;
  enabled?: boolean;
}): Promise<HomeAdRow> {
  await ensureHomeAdsTable();
  const sql = getSql();
  const sort =
    input.sortOrder != null && Number.isFinite(input.sortOrder)
      ? Math.floor(input.sortOrder)
      : 0;
  const ctaAction = input.ctaAction ?? "share";
  const rows = await sql`
    INSERT INTO home_ads (
      audience, placement, title, body, cta_label, cta_url,
      cta_action, sheet_title, sheet_body, enabled, sort_order
    ) VALUES (
      ${input.audience},
      ${input.placement},
      ${input.title.trim()},
      ${input.body.trim()},
      ${input.ctaLabel?.trim() || null},
      ${input.ctaUrl?.trim() || null},
      ${ctaAction},
      ${input.sheetTitle?.trim() || null},
      ${input.sheetBody?.trim() || null},
      ${input.enabled === true},
      ${sort}
    )
    RETURNING *
  `;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function updateHomeAd(
  id: number,
  patch: {
    audience?: HomeAdAudience;
    placement?: HomeAdPlacement;
    title?: string;
    body?: string;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    ctaAction?: HomeAdCtaAction;
    sheetTitle?: string | null;
    sheetBody?: string | null;
    sortOrder?: number | null;
    enabled?: boolean;
    imageR2Key?: string | null;
    imageProxyUrl?: string | null;
  }
): Promise<HomeAdRow | null> {
  await ensureHomeAdsTable();
  const existing = await getHomeAdById(id);
  if (!existing) return null;
  const sql = getSql();
  const audience = patch.audience ?? existing.audience;
  const placement = patch.placement ?? existing.placement;
  const title = patch.title != null ? patch.title.trim() : existing.title;
  const body = patch.body != null ? patch.body.trim() : existing.body;
  const ctaLabel =
    patch.ctaLabel !== undefined ? patch.ctaLabel?.trim() || null : existing.cta_label;
  const ctaUrl =
    patch.ctaUrl !== undefined ? patch.ctaUrl?.trim() || null : existing.cta_url;
  const ctaAction = patch.ctaAction ?? existing.cta_action;
  const sheetTitle =
    patch.sheetTitle !== undefined ? patch.sheetTitle?.trim() || null : existing.sheet_title;
  const sheetBody =
    patch.sheetBody !== undefined ? patch.sheetBody?.trim() || null : existing.sheet_body;
  const sortOrder =
    patch.sortOrder != null && Number.isFinite(patch.sortOrder)
      ? Math.floor(patch.sortOrder)
      : existing.sort_order;
  const enabled = patch.enabled !== undefined ? patch.enabled === true : existing.enabled;
  const imageR2Key =
    patch.imageR2Key !== undefined ? patch.imageR2Key : existing.image_r2_key;
  const imageProxyUrl =
    patch.imageProxyUrl !== undefined ? patch.imageProxyUrl : existing.image_proxy_url;

  const rows = await sql`
    UPDATE home_ads
    SET
      audience = ${audience},
      placement = ${placement},
      title = ${title},
      body = ${body},
      cta_label = ${ctaLabel},
      cta_url = ${ctaUrl},
      cta_action = ${ctaAction},
      sheet_title = ${sheetTitle},
      sheet_body = ${sheetBody},
      enabled = ${enabled},
      sort_order = ${sortOrder},
      image_r2_key = ${imageR2Key},
      image_proxy_url = ${imageProxyUrl},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function setHomeAdEnabled(id: number, enabled: boolean): Promise<HomeAdRow | null> {
  return updateHomeAd(id, { enabled });
}

export async function deleteHomeAd(id: number): Promise<HomeAdRow | null> {
  await ensureHomeAdsTable();
  const sql = getSql();
  const rows = await sql`DELETE FROM home_ads WHERE id = ${id} RETURNING *`;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
