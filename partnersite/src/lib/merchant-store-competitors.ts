import { client as sql } from "@/lib/drizzle";
import {
  localityNameFromAddress,
  normalizeMatchScope,
  type CompetitorRow,
  type LocalityInsight,
  type MarketMatchScope,
  type MerchantMarketInsights,
} from "@/lib/merchant-store-competitors-shared";

export type {
  CompetitorRow,
  LocalityInsight,
  MarketMatchScope,
  MerchantMarketInsights,
} from "@/lib/merchant-store-competitors-shared";
export {
  displayPlaceLabel,
  localityNameFromAddress,
  normalizeMatchScope,
} from "@/lib/merchant-store-competitors-shared";

const STALE_MS = 24 * 60 * 60 * 1000;

function periodKeyForScope(scope: MarketMatchScope): string {
  return scope === "locality" ? "90d_locality" : "90d_city";
}

function resolveLogoUrl(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const t = String(raw).trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/api/attachments/proxy")) return t;
  return `/api/attachments/proxy?key=${encodeURIComponent(t)}`;
}

async function snapshotsAreFresh(storePk: number, scope: MarketMatchScope): Promise<boolean> {
  const periodKey = periodKeyForScope(scope);
  // Prefer refresh meta (set even when 0 competitor rows) when migration 0572 is applied.
  try {
    const meta = await sql`
      SELECT computed_at
      FROM merchant_store_competitor_refresh_meta
      WHERE merchant_store_id = ${storePk}
        AND period_key = ${periodKey}
      LIMIT 1
    `;
    const metaAt = meta[0]?.computed_at;
    if (metaAt) {
      const ms = new Date(String(metaAt)).getTime();
      if (Number.isFinite(ms) && Date.now() - ms < STALE_MS) return true;
    }
  } catch {
    /* table may not exist until migration 0572 */
  }
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

async function ensureCompetitorSnapshots(storePk: number, scope: MarketMatchScope): Promise<void> {
  if (await snapshotsAreFresh(storePk, scope)) return;
  try {
    await sql`SELECT public.refresh_merchant_store_competitor_snapshots(${storePk}, ${scope})`;
  } catch (e) {
    console.warn(`[merchant-store-competitors] refresh ${scope} failed:`, (e as Error).message);
  }
}

/** Same-city / same-pincode peers when overlap snapshots are empty (pre-migration or no shared customers). */
async function loadAreaPeerCompetitors(
  storePk: number,
  store: { city: string | null; postal_code: string | null },
  scope: MarketMatchScope,
  limit: number,
  excludeStoreIds: Set<string>
): Promise<Array<CompetitorRow & { order_count_90d: number }>> {
  const pincodeNorm = (store.postal_code ?? "").replace(/\D/g, "");
  const cityNorm = store.city?.trim().toLowerCase() ?? "";
  if (scope === "locality" && !pincodeNorm) return [];
  if (scope === "city" && !cityNorm) return [];

  const peerRows =
    scope === "locality"
      ? await sql`
          SELECT cs.store_id AS competitor_store_id,
                 COALESCE(NULLIF(TRIM(cs.store_display_name), ''), cs.store_name) AS name,
                 cs.banner_url,
                 mp.store_logo AS parent_logo_url,
                 COUNT(oc.id)::int AS order_count
          FROM merchant_stores cs
          LEFT JOIN merchant_parents mp ON mp.id = cs.parent_id
          LEFT JOIN orders_core oc
            ON oc.merchant_store_id = cs.id
           AND oc.placed_at >= now() - interval '90 days'
           AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
          WHERE cs.deleted_at IS NULL
            AND cs.id <> ${storePk}
            AND NULLIF(regexp_replace(TRIM(COALESCE(cs.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
          GROUP BY cs.id, cs.store_id, cs.store_display_name, cs.store_name, cs.banner_url, mp.store_logo
          ORDER BY order_count DESC, cs.id ASC
          LIMIT ${Math.min(Math.max(1, limit + excludeStoreIds.size), 40)}
        `
      : await sql`
          SELECT cs.store_id AS competitor_store_id,
                 COALESCE(NULLIF(TRIM(cs.store_display_name), ''), cs.store_name) AS name,
                 cs.banner_url,
                 mp.store_logo AS parent_logo_url,
                 COUNT(oc.id)::int AS order_count
          FROM merchant_stores cs
          LEFT JOIN merchant_parents mp ON mp.id = cs.parent_id
          LEFT JOIN orders_core oc
            ON oc.merchant_store_id = cs.id
           AND oc.placed_at >= now() - interval '90 days'
           AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
          WHERE cs.deleted_at IS NULL
            AND cs.id <> ${storePk}
            AND LOWER(TRIM(cs.city)) = ${cityNorm}
          GROUP BY cs.id, cs.store_id, cs.store_display_name, cs.store_name, cs.banner_url, mp.store_logo
          ORDER BY order_count DESC, cs.id ASC
          LIMIT ${Math.min(Math.max(1, limit + excludeStoreIds.size), 40)}
        `;

  const out: Array<CompetitorRow & { order_count_90d: number }> = [];
  let rank = 1;
  for (const r of peerRows as unknown as Array<{
    competitor_store_id: string;
    name: string;
    banner_url: string | null;
    parent_logo_url: string | null;
    order_count: number;
  }>) {
    const id = String(r.competitor_store_id);
    if (excludeStoreIds.has(id)) continue;
    out.push({
      rank,
      competitor_store_id: id,
      name: String(r.name ?? "Store"),
      logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
      affinity_pct: 0,
      rank_delta: null,
      shared_customers: 0,
      order_count_90d: Number(r.order_count) || 0,
    });
    rank += 1;
    if (out.length >= limit) break;
  }
  return out;
}

/** Share of your customers who also ordered from ≥1 peer in the same city/pincode (90d). */
async function computeOwnOverlapAffinityPct(
  storePk: number,
  store: { city: string | null; postal_code: string | null },
  scope: MarketMatchScope
): Promise<number> {
  const pincodeNorm = (store.postal_code ?? "").replace(/\D/g, "");
  const cityNorm = store.city?.trim().toLowerCase() ?? "";
  if (scope === "locality" && !pincodeNorm) return 0;
  if (scope === "city" && !cityNorm) return 0;

  const rows =
    scope === "locality"
      ? await sql`
          WITH yours AS (
            SELECT DISTINCT oc.customer_id
            FROM orders_core oc
            WHERE oc.merchant_store_id = ${storePk}
              AND oc.customer_id IS NOT NULL
              AND oc.placed_at >= now() - interval '90 days'
              AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
          ),
          peers AS (
            SELECT ms.id
            FROM merchant_stores ms
            WHERE ms.deleted_at IS NULL
              AND ms.id <> ${storePk}
              AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
          )
          SELECT
            (SELECT COUNT(*)::int FROM yours) AS yours_n,
            (
              SELECT COUNT(DISTINCT y.customer_id)::int
              FROM yours y
              JOIN orders_core oc ON oc.customer_id = y.customer_id
              JOIN peers p ON p.id = oc.merchant_store_id
              WHERE oc.placed_at >= now() - interval '90 days'
                AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
            ) AS overlap_n
        `
      : await sql`
          WITH yours AS (
            SELECT DISTINCT oc.customer_id
            FROM orders_core oc
            WHERE oc.merchant_store_id = ${storePk}
              AND oc.customer_id IS NOT NULL
              AND oc.placed_at >= now() - interval '90 days'
              AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
          ),
          peers AS (
            SELECT ms.id
            FROM merchant_stores ms
            WHERE ms.deleted_at IS NULL
              AND ms.id <> ${storePk}
              AND LOWER(TRIM(ms.city)) = ${cityNorm}
          )
          SELECT
            (SELECT COUNT(*)::int FROM yours) AS yours_n,
            (
              SELECT COUNT(DISTINCT y.customer_id)::int
              FROM yours y
              JOIN orders_core oc ON oc.customer_id = y.customer_id
              JOIN peers p ON p.id = oc.merchant_store_id
              WHERE oc.placed_at >= now() - interval '90 days'
                AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
            ) AS overlap_n
        `;

  const yoursN = Number((rows[0] as { yours_n?: number })?.yours_n) || 0;
  const overlapN = Number((rows[0] as { overlap_n?: number })?.overlap_n) || 0;
  if (yoursN <= 0) return 0;
  return Math.round((1000 * overlapN) / yoursN) / 10;
}

async function loadAreaInsights(
  storePk: number,
  store: {
    city: string | null;
    state: string | null;
    postal_code: string | null;
    full_address?: string | null;
    locality_name?: string | null;
  },
  scope: MarketMatchScope
): Promise<LocalityInsight> {
  const localityName =
    store.locality_name?.trim() ||
    localityNameFromAddress(store.full_address, store.city, store.postal_code);

  const base: LocalityInsight = {
    match_scope: scope,
    city: store.city,
    state: store.state,
    postal_code: store.postal_code,
    locality_name: localityName,
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
  storePk: number,
  scopeInput?: string | null,
  limit = 10
): Promise<MerchantMarketInsights | null> {
  const scope = normalizeMatchScope(scopeInput);
  const periodKey = periodKeyForScope(scope);

  const storeRows = await sql`
    SELECT COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS store_name,
           ms.banner_url,
           ms.city,
           ms.state,
           ms.postal_code,
           ms.full_address,
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
        full_address: string | null;
      }
    | undefined;
  if (!store) return null;

  await ensureCompetitorSnapshots(storePk, scope);

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
      AND cs.id <> ${storePk}
    ORDER BY s.affinity_pct DESC NULLS LAST, s.rank ASC
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
  ).map((r, i) => {
    if (r.computed_at && !computedAt) {
      computedAt = new Date(String(r.computed_at)).toISOString();
    }
    return {
      // Display rank among competitors by affinity (1..N) — not your area order-rank.
      rank: i + 1,
      competitor_store_id: String(r.competitor_store_id),
      name: String(r.name ?? "Store"),
      logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
      affinity_pct: (() => {
        const n = Number(r.affinity_pct);
        return Number.isFinite(n) ? n : 0;
      })(),
      rank_delta: r.rank_delta == null ? null : Number(r.rank_delta),
      shared_customers: Number(r.shared_customers) || 0,
    };
  });

  const cap = Math.min(Math.max(1, limit), 20);
  const peerOrderById = new Map<string, number>();
  if (competitors.length < cap) {
    const seen = new Set(competitors.map((c) => c.competitor_store_id));
    const peers = await loadAreaPeerCompetitors(
      storePk,
      store,
      scope,
      cap - competitors.length,
      seen
    );
    for (const p of peers) {
      peerOrderById.set(p.competitor_store_id, p.order_count_90d);
      competitors.push({
        rank: competitors.length + 1,
        competitor_store_id: p.competitor_store_id,
        name: p.name,
        logo_url: p.logo_url,
        affinity_pct: p.affinity_pct,
        rank_delta: p.rank_delta,
        shared_customers: p.shared_customers,
      });
    }
  }

  const [locality, overlapAffinity] = await Promise.all([
    loadAreaInsights(storePk, store, scope),
    computeOwnOverlapAffinityPct(storePk, store, scope),
  ]);

  // When no shared-customer overlap yet, show 90d order-share in the area so Affinity isn't stuck at 0%.
  const yourOrders = locality.your_orders_90d;

  // Fetch order counts for snapshot competitors still at 0% affinity.
  const needOrderFill = competitors.some((c) => !(c.affinity_pct > 0) && c.shared_customers <= 0);
  const orderByStoreId = new Map<string, number>(peerOrderById);
  if (needOrderFill) {
    const ids = competitors.map((c) => c.competitor_store_id);
    if (ids.length > 0) {
      const orderRows = await sql`
        SELECT ms.store_id,
               COUNT(oc.id)::int AS order_count
        FROM merchant_stores ms
        LEFT JOIN orders_core oc
          ON oc.merchant_store_id = ms.id
         AND oc.placed_at >= now() - interval '90 days'
         AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
        WHERE ms.store_id = ANY(${ids})
        GROUP BY ms.store_id
      `;
      for (const row of orderRows as unknown as Array<{ store_id: string; order_count: number }>) {
        orderByStoreId.set(String(row.store_id), Number(row.order_count) || 0);
      }
    }
  }

  const areaOrderTotal =
    yourOrders +
    competitors.reduce((sum, c) => sum + (orderByStoreId.get(c.competitor_store_id) ?? 0), 0);

  if (areaOrderTotal > 0) {
    for (const c of competitors) {
      if (c.affinity_pct > 0 || c.shared_customers > 0) continue;
      const o = orderByStoreId.get(c.competitor_store_id) ?? 0;
      c.affinity_pct = Math.round((1000 * o) / areaOrderTotal) / 10;
    }
  }

  // Re-rank by affinity (overlap first, then order-share).
  competitors.sort((a, b) => b.affinity_pct - a.affinity_pct || a.name.localeCompare(b.name));
  competitors.forEach((c, i) => {
    c.rank = i + 1;
  });

  const yourAffinityPct =
    overlapAffinity > 0
      ? overlapAffinity
      : areaOrderTotal > 0
        ? Math.round((1000 * yourOrders) / areaOrderTotal) / 10
        : 0;

  return {
    store_name: String(store.store_name ?? "Store"),
    store_logo_url: resolveLogoUrl(store.banner_url ?? store.parent_logo_url),
    match_scope: scope,
    computed_at: computedAt,
    competitors,
    your_affinity_pct: yourAffinityPct,
    locality,
  };
}
