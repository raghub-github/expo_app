/**
 * Client-safe types + pure helpers for market insights.
 * Keep postgres/drizzle out of this file — client components import from here.
 */

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
  orders_90d?: number;
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
  your_affinity_pct: number;
  locality: LocalityInsight;
};

export function normalizeMatchScope(raw: string | undefined | null): MarketMatchScope {
  return String(raw ?? "").toLowerCase() === "locality" ? "locality" : "city";
}

export function localityNameFromAddress(
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
  if (cityTrim) return cityTrim;
  return null;
}

export function displayPlaceLabel(scope: MarketMatchScope): string {
  return scope === "locality" ? "your locality" : "your city";
}

export type CompetitorLeaderboardRow = {
  id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
  is_own: boolean;
  /** Absolute area rank by 90d orders — matches trophy. */
  display_rank: string;
};

/**
 * Merge own store into competitors, sort by absolute area rank (90d orders).
 * Rank numbers match locality.your_area_rank / competitor.rank from the shared engine.
 */
export function buildCompetitorLeaderboard(args: {
  competitors: CompetitorRow[];
  storeId: string;
  ownName: string;
  ownLogoUrl: string | null;
  ownAffinityPct: number;
  ownOrders90d?: number;
  yourAreaRank?: number | null;
}): CompetitorLeaderboardRow[] {
  const sid = String(args.storeId ?? "").trim();
  const rows: Array<
    Omit<CompetitorLeaderboardRow, "display_rank"> & { orders_90d: number; area_rank: number }
  > = [];

  for (const c of args.competitors ?? []) {
    const id = String(c.competitor_store_id ?? "").trim();
    if (!id || (sid && id === sid)) continue;
    const orders = Number(c.orders_90d);
    const areaRank = Number(c.rank);
    rows.push({
      id,
      name: c.name,
      logo_url: c.logo_url,
      affinity_pct: Number(c.affinity_pct) || 0,
      rank_delta: c.rank_delta,
      is_own: false,
      orders_90d: Number.isFinite(orders) ? orders : 0,
      area_rank: Number.isFinite(areaRank) && areaRank > 0 ? areaRank : Number.MAX_SAFE_INTEGER,
    });
  }

  if (sid) {
    const ownOrders = Number(args.ownOrders90d);
    const ownRank = Number(args.yourAreaRank);
    rows.push({
      id: sid,
      name: args.ownName?.trim() || "Your store",
      logo_url: args.ownLogoUrl,
      affinity_pct: Number(args.ownAffinityPct) || 0,
      rank_delta: null,
      is_own: true,
      orders_90d: Number.isFinite(ownOrders) ? ownOrders : 0,
      area_rank: Number.isFinite(ownRank) && ownRank > 0 ? ownRank : Number.MAX_SAFE_INTEGER,
    });
  }

  rows.sort((a, b) => {
    if (a.area_rank !== b.area_rank) return a.area_rank - b.area_rank;
    if (b.orders_90d !== a.orders_90d) return b.orders_90d - a.orders_90d;
    if (a.is_own !== b.is_own) return a.is_own ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return rows.map((r, idx) => ({
    id: r.id,
    name: r.name,
    logo_url: r.logo_url,
    affinity_pct: r.affinity_pct,
    rank_delta: r.rank_delta,
    is_own: r.is_own,
    display_rank: String(
      r.area_rank < Number.MAX_SAFE_INTEGER ? r.area_rank : idx + 1
    ),
  }));
}
