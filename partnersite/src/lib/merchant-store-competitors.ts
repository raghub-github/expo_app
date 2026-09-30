import { client as sql } from "@/lib/drizzle";
import { scoreAreaStoresHomeFood } from "../../../backend/src/lib/home-food-area-affinity";
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

type AreaOrderEntry = {
  store_pk: number;
  store_id: string;
  name: string;
  logo_url: string | null;
  orders_90d: number;
  area_rank: number;
};

/** Same 90d-order area ranking engine as backend (trophy + list ranks). */
async function loadAreaOrderBoard(
  storePk: number,
  store: {
    city: string | null;
    state: string | null;
    postal_code: string | null;
    full_address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
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
    const ownLat = Number(store.latitude);
    const ownLng = Number(store.longitude);
    const hasGeo = Number.isFinite(ownLat) && Number.isFinite(ownLng) && !(ownLat === 0 && ownLng === 0);
    if (!hasGeo && !pincodeNorm) return { locality: base, board: [] };
    const localityRadiusKm = 3;
    const rankRows = hasGeo
      ? await sql`
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
            AND ms.latitude IS NOT NULL
            AND ms.longitude IS NOT NULL
            AND (
              6371 * acos(LEAST(1::float8, GREATEST(-1::float8,
                cos(radians(${ownLat})) * cos(radians(ms.latitude::float8))
                * cos(radians(ms.longitude::float8) - radians(${ownLng}))
                + sin(radians(${ownLat})) * sin(radians(ms.latitude::float8))
              )))
            ) <= ${localityRadiusKm}
          GROUP BY ms.id, ms.store_id, ms.store_display_name, ms.store_name, ms.banner_url, mp.store_logo
          ORDER BY order_count DESC, ms.id ASC
          LIMIT ${boardLimit}
        `
      : await sql`
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
            AND (${cityNorm} = '' OR LOWER(TRIM(ms.city)) = ${cityNorm})
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
        stores_in_area: ranked.length,
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
           ms.latitude,
           ms.longitude,
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
        latitude: number | string | null;
        longitude: number | string | null;
      }
    | undefined;
  if (!store) return null;

  await ensureCompetitorSnapshots(storePk, scope);

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
    loadAreaOrderBoard(storePk, store, scope, Math.max(cap + 1, 50)),
    computeOwnOverlapAffinityPct(storePk, store, scope),
  ]);

  const yourOrders = locality.your_orders_90d;
  const peers = board.filter((e) => e.store_pk !== storePk).slice(0, cap);
  const areaOrderTotal = board.reduce((sum, e) => sum + e.orders_90d, 0);

  let homeFood: Awaited<ReturnType<typeof scoreAreaStoresHomeFood>> = null;
  try {
    homeFood = await scoreAreaStoresHomeFood(sql, board.map((e) => e.store_pk));
  } catch (e) {
    console.warn("[merchant-store-competitors] HOME_FOOD area score failed:", (e as Error).message);
  }

  const competitors: CompetitorRow[] = peers.map((p) => {
    const aff = affinityById.get(p.store_id);
    const engine = homeFood?.get(p.store_pk);
    let affinityPct = engine?.affinityPct ?? aff?.affinity_pct ?? 0;
    if (engine == null && !(affinityPct > 0) && (aff?.shared_customers ?? 0) <= 0 && areaOrderTotal > 0) {
      affinityPct = Math.round((1000 * p.orders_90d) / areaOrderTotal) / 10;
    }
    return {
      rank: engine?.rank ?? p.area_rank,
      competitor_store_id: p.store_id,
      name: p.name,
      logo_url: p.logo_url,
      affinity_pct: affinityPct,
      rank_delta: aff?.rank_delta ?? null,
      shared_customers: aff?.shared_customers ?? 0,
      orders_90d: p.orders_90d,
    };
  });

  competitors.sort((a, b) => a.rank - b.rank || b.affinity_pct - a.affinity_pct || a.name.localeCompare(b.name));

  const ownEngine = homeFood?.get(storePk);
  if (ownEngine && homeFood) {
    locality.your_area_rank = ownEngine.rank;
    const leaderId = [...homeFood.entries()].find(([, v]) => v.rank === 1)?.[0];
    const leader = board.find((e) => e.store_pk === leaderId);
    if (leader?.name) locality.area_leader_name = leader.name;
  }

  const yourAffinityPct =
    ownEngine != null
      ? ownEngine.affinityPct
      : overlapAffinity > 0
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
