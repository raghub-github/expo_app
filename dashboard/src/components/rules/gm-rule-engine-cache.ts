/** Session cache so rule list appears instantly after save / navigation. */

const CACHE_KEY = "gm_rule_engine_list_v1";

export type GmRuleEngineCachedCatalogs = {
  serviceTypes: { code: string; label: string }[];
  orderStages: { code: string; label: string; source?: string }[];
  triggeredBy: { code: string; label: string }[];
  cancellationReasons: { id: number; label: string; attribute: string }[];
  scenarioTypes: string[];
  faultBuckets: string[];
  refundRecipients: string[];
  refundFundingSources: string[];
  merchantPenaltyRecoverySources: string[];
  riderPenaltyRecoverySources: string[];
  customerPenaltyRecoverySources: string[];
  activeStatuses: string[];
};

export type GmRuleEngineCache = {
  rows: Record<string, unknown>[];
  catalogs: GmRuleEngineCachedCatalogs | null;
  updatedAt: number;
};

export function readGmRuleEngineCache(): GmRuleEngineCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GmRuleEngineCache;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGmRuleEngineCache(
  rows: Record<string, unknown>[],
  catalogs: GmRuleEngineCachedCatalogs | null
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ rows, catalogs, updatedAt: Date.now() } satisfies GmRuleEngineCache)
    );
  } catch {
    /* storage full — ignore */
  }
}

export function mergeRuleIntoGmRuleEngineCache(rule: Record<string, unknown>) {
  const id = Number(rule.id);
  if (!Number.isFinite(id)) return;

  const cached = readGmRuleEngineCache();
  if (!cached) {
    writeGmRuleEngineCache([rule], null);
    return;
  }

  const rows = [...cached.rows];
  const idx = rows.findIndex((r) => Number(r.id) === id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...rule };
  else rows.push(rule);

  rows.sort(
    (a, b) =>
      Number(a.priority ?? 100) - Number(b.priority ?? 100) ||
      String(a.rule_code ?? "").localeCompare(String(b.rule_code ?? ""))
  );

  writeGmRuleEngineCache(rows, cached.catalogs);
}

export function resolveGmRuleEngineInitial(
  payload: {
    migrationRequired: boolean;
    rows: Record<string, unknown>[];
    catalogs: GmRuleEngineCachedCatalogs | null;
    loadError: string | null;
  }
) {
  const cached = readGmRuleEngineCache();
  return {
    migrationRequired: payload.migrationRequired,
    rows: payload.rows.length > 0 ? payload.rows : (cached?.rows ?? []),
    catalogs: payload.catalogs ?? cached?.catalogs ?? null,
    loadError: payload.loadError,
  };
}
