import type { Sql } from "postgres";

export type MarketMatchScope = "city" | "locality";

export type CompetitorRow = {
  rank: number;
  competitor_store_id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
  shared_customers: number;
};

export type LocalityInsight = {
  match_scope: MarketMatchScope;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  stores_in_area: number;
  your_orders_90d: number;
  your_area_rank: number | null;
  area_leader_name: string | null;
};

export type MerchantMarketInsights = {
  store_name: string;
  store_logo_url: string | null;
  match_scope: MarketMatchScope;
  computed_at: string | null;
  competitors: CompetitorRow[];
  locality: LocalityInsight;
};

const STALE_MS = 24 * 60 * 60 * 1000;

export function normalizeMatchScope(raw: string | undefined | null): MarketMatchScope {
  return String(raw ?? "").toLowerCase() === "locality" ? "locality" : "city";
}

function periodKeyForScope(scope: MarketMatchScope): string {
  return scope === "locality" ? "90d_locality" : "90d_city";
}

function resolveLogoUrl(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const t = String(raw).trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/v1/attachments/proxy")) return t;
  return `/v1/attachments/proxy?key=${encodeURIComponent(t)}`;
}

async function snapshotsAreFresh(
  sql: Sql,
  storePk: number,
  scope: MarketMatchScope
): Promise<boolean> {
  const periodKey = periodKeyForScope(scope);
  const rows = await sql`
    SELECT computed_at
    FROM merchant_store_competitor_snapshots
    WHERE merchant_store_id = ${storePk}
      AND period_key = ${periodKey}
    ORDER BY computed_at DESC
    LIMIT 1
  `;
  const at = rows[0]?.computed_at;
  if (!at) return false;
  const ms = new Date(String(at)).getTime();
  return Number.isFinite(ms) && Date.now() - ms < STALE_MS;
}

export async function ensureCompetitorSnapshots(
  sql: Sql,
  storePk: number,
  scope: MarketMatchScope
): Promise<void> {
  if (await snapshotsAreFresh(sql, storePk, scope)) return;
  try {
    await sql`SELECT public.refresh_merchant_store_competitor_snapshots(${storePk}, ${scope})`;
  } catch (e) {
    console.warn(`[merchant-store-competitors] refresh ${scope} failed:`, (e as Error).message);
  }
}

async function loadAreaInsights(
  sql: Sql,
  storePk: number,
  store: {
    city: string | null;
    state: string | null;
    postal_code: string | null;
  },
  scope: MarketMatchScope
): Promise<LocalityInsight> {
  const base: LocalityInsight = {
    match_scope: scope,
    city: store.city,
    state: store.state,
    postal_code: store.postal_code,
    stores_in_area: 0,
    your_orders_90d: 0,
    your_area_rank: null,
    area_leader_name: null,
  };

  const pincodeNorm = (store.postal_code ?? "").replace(/\D/g, "");
  const cityNorm = store.city?.trim().toLowerCase() ?? "";

  if (scope === "locality") {
    if (!pincodeNorm) return base;
    const [areaStats] = await sql`
      SELECT COUNT(*)::int AS stores_in_area
      FROM merchant_stores ms
      WHERE ms.deleted_at IS NULL
        AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
    `;
    const [yourOrders] = await sql`
      SELECT COUNT(*)::int AS c
      FROM orders_core oc
      WHERE oc.merchant_store_id = ${storePk}
        AND oc.placed_at >= now() - interval '90 days'
        AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    `;
    const rankRows = await sql`
      SELECT ms.id,
             COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS name,
             COUNT(oc.id)::int AS order_count
      FROM merchant_stores ms
      LEFT JOIN orders_core oc
        ON oc.merchant_store_id = ms.id
       AND oc.placed_at >= now() - interval '90 days'
       AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
      WHERE ms.deleted_at IS NULL
        AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
      GROUP BY ms.id, ms.store_display_name, ms.store_name
      ORDER BY order_count DESC, ms.id ASC
      LIMIT 50
    `;
    const ranked = rankRows as unknown as Array<{ id: number; name: string; order_count: number }>;
    const idx = ranked.findIndex((r) => Number(r.id) === storePk);
    return {
      ...base,
      stores_in_area: Number((areaStats as { stores_in_area?: number })?.stores_in_area) || 0,
      your_orders_90d: Number((yourOrders as { c?: number })?.c) || 0,
      your_area_rank: idx >= 0 ? idx + 1 : null,
      area_leader_name: ranked[0]?.name ?? null,
    };
  }

  if (!cityNorm) return base;
  const [cityStats] = await sql`
    SELECT COUNT(*)::int AS stores_in_area
    FROM merchant_stores ms
    WHERE ms.deleted_at IS NULL
      AND LOWER(TRIM(ms.city)) = ${cityNorm}
  `;
  const [yourOrders] = await sql`
    SELECT COUNT(*)::int AS c
    FROM orders_core oc
    WHERE oc.merchant_store_id = ${storePk}
      AND oc.placed_at >= now() - interval '90 days'
      AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
  `;
  const rankRows = await sql`
    SELECT ms.id,
           COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS name,
           COUNT(oc.id)::int AS order_count
    FROM merchant_stores ms
    LEFT JOIN orders_core oc
      ON oc.merchant_store_id = ms.id
     AND oc.placed_at >= now() - interval '90 days'
     AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    WHERE ms.deleted_at IS NULL
      AND LOWER(TRIM(ms.city)) = ${cityNorm}
    GROUP BY ms.id, ms.store_display_name, ms.store_name
    ORDER BY order_count DESC, ms.id ASC
    LIMIT 50
  `;
  const ranked = rankRows as unknown as Array<{ id: number; name: string; order_count: number }>;
  const idx = ranked.findIndex((r) => Number(r.id) === storePk);
  return {
    ...base,
    stores_in_area: Number((cityStats as { stores_in_area?: number })?.stores_in_area) || 0,
    your_orders_90d: Number((yourOrders as { c?: number })?.c) || 0,
    your_area_rank: idx >= 0 ? idx + 1 : null,
    area_leader_name: ranked[0]?.name ?? null,
  };
}

export async function loadMerchantMarketInsights(
  sql: Sql,
  storePk: number,
  scopeInput?: string | null,
  limit = 10
): Promise<MerchantMarketInsights | null> {
  const scope = normalizeMatchScope(scopeInput);
  const periodKey = periodKeyForScope(scope);

  const storeRows = await sql`
    SELECT ms.id,
           ms.store_id,
           COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS store_name,
           ms.banner_url,
           ms.city,
           ms.state,
           ms.postal_code,
           mp.store_logo AS parent_logo_url
    FROM merchant_stores ms
    LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE ms.id = ${storePk}
      AND ms.deleted_at IS NULL
    LIMIT 1
  `;
  const store = storeRows[0] as
    | {
        store_name: string;
        banner_url: string | null;
        parent_logo_url: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
      }
    | undefined;
  if (!store) return null;

  await ensureCompetitorSnapshots(sql, storePk, scope);

  const competitorRows = await sql`
    SELECT s.rank,
           cs.store_id AS competitor_store_id,
           COALESCE(NULLIF(TRIM(cs.store_display_name), ''), cs.store_name) AS name,
           cs.banner_url,
           mp.store_logo AS parent_logo_url,
           s.affinity_pct,
           s.rank_delta,
           s.shared_customers,
           s.computed_at
    FROM merchant_store_competitor_snapshots s
    JOIN merchant_stores cs ON cs.id = s.competitor_store_id
    LEFT JOIN merchant_parents mp ON mp.id = cs.parent_id
    WHERE s.merchant_store_id = ${storePk}
      AND s.period_key = ${periodKey}
    ORDER BY s.rank ASC
    LIMIT ${Math.min(Math.max(1, limit), 20)}
  `;

  let computedAt: string | null = null;
  const competitors: CompetitorRow[] = (
    competitorRows as unknown as Array<{
      rank: number;
      competitor_store_id: string;
      name: string;
      banner_url: string | null;
      parent_logo_url: string | null;
      affinity_pct: unknown;
      rank_delta: number | null;
      shared_customers: number;
      computed_at: Date | string | null;
    }>
  ).map((r) => {
    if (r.computed_at && !computedAt) {
      computedAt = new Date(String(r.computed_at)).toISOString();
    }
    return {
      rank: Number(r.rank) || 0,
      competitor_store_id: String(r.competitor_store_id),
      name: String(r.name ?? "Store"),
      logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
      affinity_pct: Number(r.affinity_pct) || 0,
      rank_delta: r.rank_delta == null ? null : Number(r.rank_delta),
      shared_customers: Number(r.shared_customers) || 0,
    };
  });

  const locality = await loadAreaInsights(sql, storePk, store, scope);

  return {
    store_name: String(store.store_name ?? "Store"),
    store_logo_url: resolveLogoUrl(store.banner_url ?? store.parent_logo_url),
    match_scope: scope,
    computed_at: computedAt,
    competitors,
    locality,
  };
}
