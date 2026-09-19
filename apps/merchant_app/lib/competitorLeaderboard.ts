/** Shared competitor leaderboard ordering (partnersite / dashboard / backend parity). */

export type CompetitorLeaderboardInput = {
  rank: number;
  competitor_store_id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
  orders_90d?: number;
};

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
 */
export function buildCompetitorLeaderboard(args: {
  competitors: CompetitorLeaderboardInput[];
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
