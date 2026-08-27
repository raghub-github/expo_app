/** Shared competitor leaderboard ordering (partnersite parity). */

export type CompetitorLeaderboardInput = {
  rank: number;
  competitor_store_id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
};

export type CompetitorLeaderboardRow = {
  id: string;
  name: string;
  logo_url: string | null;
  affinity_pct: number;
  rank_delta: number | null;
  is_own: boolean;
  /** e.g. "1-1", "1-2" — affinity order. */
  display_rank: string;
};

/**
 * Merge own store into competitors, sort by affinity (desc).
 * Own store wins affinity ties. Display ranks: 1-1, 1-2, 1-3…
 */
export function buildCompetitorLeaderboard(args: {
  competitors: CompetitorLeaderboardInput[];
  storeId: string;
  ownName: string;
  ownLogoUrl: string | null;
  ownAffinityPct: number;
}): CompetitorLeaderboardRow[] {
  const sid = String(args.storeId ?? "").trim();
  const rows: Array<Omit<CompetitorLeaderboardRow, "display_rank">> = [];

  for (const c of args.competitors ?? []) {
    const id = String(c.competitor_store_id ?? "").trim();
    if (!id || (sid && id === sid)) continue;
    rows.push({
      id,
      name: c.name,
      logo_url: c.logo_url,
      affinity_pct: Number(c.affinity_pct) || 0,
      rank_delta: c.rank_delta,
      is_own: false,
    });
  }

  if (sid) {
    rows.push({
      id: sid,
      name: args.ownName?.trim() || "Your store",
      logo_url: args.ownLogoUrl,
      affinity_pct: Number(args.ownAffinityPct) || 0,
      rank_delta: null,
      is_own: true,
    });
  }

  rows.sort((a, b) => {
    if (b.affinity_pct !== a.affinity_pct) return b.affinity_pct - a.affinity_pct;
    if (a.is_own !== b.is_own) return a.is_own ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return rows.map((r, idx) => ({
    ...r,
    display_rank: `1-${idx + 1}`,
  }));
}
