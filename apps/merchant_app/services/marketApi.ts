import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

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
  your_affinity_pct?: number;
  locality: LocalityInsight;
};

function getBase(): string {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

function resolveMediaUrl(path: string | null): string | null {
  if (path == null || path.trim() === "") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getBase();
  if (path.startsWith("/v1/")) return `${base}${path}`;
  return `${base}/v1/attachments/proxy?key=${encodeURIComponent(path)}`;
}

const TOP_N = 10;

export async function fetchMarketInsights(
  storeId: number,
  token: string,
  scope: MarketMatchScope = "city"
): Promise<MerchantMarketInsights> {
  const q = new URLSearchParams({ scope, limit: String(TOP_N) });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/market/insights?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load market insights");
  }
  const data = (await res.json()) as MerchantMarketInsights;
  return {
    ...data,
    store_logo_url: resolveMediaUrl(data.store_logo_url),
    competitors: (data.competitors ?? []).map((c) => ({
      ...c,
      logo_url: resolveMediaUrl(c.logo_url),
    })),
  };
}
