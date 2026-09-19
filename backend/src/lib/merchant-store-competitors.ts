import type { Sql } from "postgres";

export type MarketMatchScope = "city" | "locality";

export type CompetitorRow = {
  /** Absolute area rank by 90d orders (same engine as trophy / your_area_rank). */
  rank: number;
  competitor_store_id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
  shared_customers: number;
  /** 90-day non-cancelled order count — drives area ranking. */
  orders_90d: number;
};

export type LocalityInsight = {
  match_scope: MarketMatchScope;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  locality_name: string | null;
  stores_in_area: number;
  your_orders_90d: number;
  your_area_rank: number | null;
  area_leader_name: string | null;
};

export type MerchantMarketInsights = {
  store_id: string;
  store_name: string;
  store_logo_url: string | null;
  match_scope: MarketMatchScope;
  computed_at: string | null;
  competitors: CompetitorRow[];
  /** Own store affinity % (customer overlap, else 90d order-share in area). */
  your_affinity_pct: number;
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

/** Short area name from full address (not pincode) — partnersite parity. */
function localityNameFromAddress(
  fullAddress: string | null | undefined,
  city: string | null | undefined,
  postalCode: string | null | undefined
): string | null {
  if (fullAddress?.trim()) {
    const parts = fullAddress
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const candidate = (parts[parts.length - 2] ?? parts[0]!).replace(/^\d{5,6}\s+/, "").trim();
      if (candidate && !/^\d{5,6}$/.test(candidate)) return candidate;
    }
    const first = (parts[0] ?? "").replace(/^\d{5,6}\s+/, "").trim();
    if (first && !/^\d{5,6}$/.test(first)) return first;
  }
  const cityTrim = city?.trim() || null;
  return cityTrim;
}

async function snapshotsAreFresh(
  sql: Sql,
  storePk: number,
  scope: MarketMatchScope
): Promise<boolean> {
  const periodKey = periodKeyForScope(scope);
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

async function loadAreaPeerCompetitors(
  sql: Sql,
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
    const orders90d = Number(r.order_count) || 0;
    out.push({
      rank,
      competitor_store_id: id,
      name: String(r.name ?? "Store"),
      logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
      affinity_pct: 0,
      rank_delta: null,
      shared_customers: 0,
      orders_90d: orders90d,
      order_count_90d: orders90d,
    });
    rank += 1;
    if (out.length >= limit) break;
  }
  return out;
}

/** Share of your customers who also ordered from ≥1 peer in the same city/pincode (90d). */
async function computeOwnOverlapAffinityPct(
  sql: Sql,
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

type AreaOrderEntry = {
  store_pk: number;
  store_id: string;
  name: string;
  logo_url: string | null;
  orders_90d: number;
  area_rank: number;
};

/**
 * Single area ranking engine (90d orders) used for trophy + competitor list ranks.
 * Shared by partnersite / dashboard / merchant-app via this backend loader.
 */
async function loadAreaOrderBoard(
  sql: Sql,
  storePk: number,
  store: {
    city: string | null;
    state: string | null;
    postal_code: string | null;
    full_address?: string | null;
  },
  scope: MarketMatchScope,
  limit = 50
): Promise<{ locality: LocalityInsight; board: AreaOrderEntry[] }> {
  const localityName = localityNameFromAddress(store.full_address, store.city, store.postal_code);
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
  const boardLimit = Math.min(Math.max(1, limit), 50);

  if (scope === "locality") {
    if (!pincodeNorm) return { locality: base, board: [] };
    const [areaStats] = await sql`
      SELECT COUNT(*)::int AS stores_in_area
      FROM merchant_stores ms
      WHERE ms.deleted_at IS NULL
        AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
    `;
    const rankRows = await sql`
      SELECT ms.id,
             ms.store_id,
             COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS name,
             ms.banner_url,
             mp.store_logo AS parent_logo_url,
             COUNT(oc.id)::int AS order_count
      FROM merchant_stores ms
      LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
      LEFT JOIN orders_core oc
        ON oc.merchant_store_id = ms.id
       AND oc.placed_at >= now() - interval '90 days'
       AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
      WHERE ms.deleted_at IS NULL
        AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = ${pincodeNorm}
      GROUP BY ms.id, ms.store_id, ms.store_display_name, ms.store_name, ms.banner_url, mp.store_logo
      ORDER BY order_count DESC, ms.id ASC
      LIMIT ${boardLimit}
    `;
    const ranked = rankRows as unknown as Array<{
      id: number;
      store_id: string;
      name: string;
      banner_url: string | null;
      parent_logo_url: string | null;
      order_count: number;
    }>;
    const idx = ranked.findIndex((r) => Number(r.id) === storePk);
    const board: AreaOrderEntry[] = ranked.map((r, i) => ({
      store_pk: Number(r.id),
      store_id: String(r.store_id),
      name: String(r.name ?? "Store"),
      logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
      orders_90d: Number(r.order_count) || 0,
      area_rank: i + 1,
    }));
    return {
      locality: {
        ...base,
        stores_in_area: Number((areaStats as { stores_in_area?: number })?.stores_in_area) || 0,
        your_orders_90d: idx >= 0 ? board[idx]!.orders_90d : 0,
        your_area_rank: idx >= 0 ? idx + 1 : null,
        area_leader_name: board[0]?.name ?? null,
      },
      board,
    };
  }

  if (!cityNorm) return { locality: base, board: [] };
  const [cityStats] = await sql`
    SELECT COUNT(*)::int AS stores_in_area
    FROM merchant_stores ms
    WHERE ms.deleted_at IS NULL
      AND LOWER(TRIM(ms.city)) = ${cityNorm}
  `;
  const rankRows = await sql`
    SELECT ms.id,
           ms.store_id,
           COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS name,
           ms.banner_url,
           mp.store_logo AS parent_logo_url,
           COUNT(oc.id)::int AS order_count
    FROM merchant_stores ms
    LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
    LEFT JOIN orders_core oc
      ON oc.merchant_store_id = ms.id
     AND oc.placed_at >= now() - interval '90 days'
     AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    WHERE ms.deleted_at IS NULL
      AND LOWER(TRIM(ms.city)) = ${cityNorm}
    GROUP BY ms.id, ms.store_id, ms.store_display_name, ms.store_name, ms.banner_url, mp.store_logo
    ORDER BY order_count DESC, ms.id ASC
    LIMIT ${boardLimit}
  `;
  const ranked = rankRows as unknown as Array<{
    id: number;
    store_id: string;
    name: string;
    banner_url: string | null;
    parent_logo_url: string | null;
    order_count: number;
  }>;
  const idx = ranked.findIndex((r) => Number(r.id) === storePk);
  const board: AreaOrderEntry[] = ranked.map((r, i) => ({
    store_pk: Number(r.id),
    store_id: String(r.store_id),
    name: String(r.name ?? "Store"),
    logo_url: resolveLogoUrl(r.banner_url ?? r.parent_logo_url),
    orders_90d: Number(r.order_count) || 0,
    area_rank: i + 1,
  }));
  return {
    locality: {
      ...base,
      stores_in_area: Number((cityStats as { stores_in_area?: number })?.stores_in_area) || 0,
      your_orders_90d: idx >= 0 ? board[idx]!.orders_90d : 0,
      your_area_rank: idx >= 0 ? idx + 1 : null,
      area_leader_name: board[0]?.name ?? null,
    },
    board,
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
  const cap = Math.min(Math.max(1, limit), 20);

  const storeRows = await sql`
    SELECT ms.store_id,
           COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS store_name,
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
        store_id: string;
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

  await ensureCompetitorSnapshots(sql, storePk, scope);

  // Affinity overlay (customer overlap) — does NOT drive rank order.
  const affinityRows = await sql`
    SELECT cs.store_id AS competitor_store_id,
           s.affinity_pct,
           s.rank_delta,
           s.shared_customers,
           s.computed_at
    FROM merchant_store_competitor_snapshots s
    JOIN merchant_stores cs ON cs.id = s.competitor_store_id
    WHERE s.merchant_store_id = ${storePk}
      AND s.period_key = ${periodKey}
      AND cs.id <> ${storePk}
  `;

  let computedAt: string | null = null;
  const affinityById = new Map<
    string,
    { affinity_pct: number; rank_delta: number | null; shared_customers: number }
  >();
  for (const r of affinityRows as unknown as Array<{
    competitor_store_id: string;
    affinity_pct: unknown;
    rank_delta: number | null;
    shared_customers: number;
    computed_at: Date | string | null;
  }>) {
    if (r.computed_at && !computedAt) {
      computedAt = new Date(String(r.computed_at)).toISOString();
    }
    const id = String(r.competitor_store_id);
    const n = Number(r.affinity_pct);
    affinityById.set(id, {
      affinity_pct: Number.isFinite(n) ? n : 0,
      rank_delta: r.rank_delta == null ? null : Number(r.rank_delta),
      shared_customers: Number(r.shared_customers) || 0,
    });
  }

  const [{ locality, board }, overlapAffinity] = await Promise.all([
    loadAreaOrderBoard(sql, storePk, store, scope, Math.max(cap + 1, 50)),
    computeOwnOverlapAffinityPct(sql, storePk, store, scope),
  ]);

  const yourOrders = locality.your_orders_90d;
  const peers = board.filter((e) => e.store_pk !== storePk).slice(0, cap);
  const areaOrderTotal = board.reduce((sum, e) => sum + e.orders_90d, 0);

  const competitors: CompetitorRow[] = peers.map((p) => {
    const aff = affinityById.get(p.store_id);
    let affinityPct = aff?.affinity_pct ?? 0;
    if (!(affinityPct > 0) && (aff?.shared_customers ?? 0) <= 0 && areaOrderTotal > 0) {
      affinityPct = Math.round((1000 * p.orders_90d) / areaOrderTotal) / 10;
    }
    return {
      rank: p.area_rank,
      competitor_store_id: p.store_id,
      name: p.name,
      logo_url: p.logo_url,
      affinity_pct: affinityPct,
      rank_delta: aff?.rank_delta ?? null,
      shared_customers: aff?.shared_customers ?? 0,
      orders_90d: p.orders_90d,
    };
  });

  // Keep list ordered by absolute area rank (90d orders) — same as trophy.
  competitors.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  const yourAffinityPct =
    overlapAffinity > 0
      ? overlapAffinity
      : areaOrderTotal > 0
        ? Math.round((1000 * yourOrders) / areaOrderTotal) / 10
        : 0;

  return {
    store_id: String(store.store_id),
    store_name: String(store.store_name ?? "Store"),
    store_logo_url: resolveLogoUrl(store.banner_url ?? store.parent_logo_url),
    match_scope: scope,
    computed_at: computedAt,
    competitors,
    your_affinity_pct: yourAffinityPct,
    locality,
  };
}
