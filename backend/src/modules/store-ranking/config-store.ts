/**
 * DB-backed ranking config (per profile, versioned) with a short in-memory cache and a code-default
 * fallback. The request path reads config through here so Super Admin can tune weights/caps/windows
 * and flip the engine on without a deploy; if the table is missing or a read fails, the engine
 * transparently uses the code default (never breaks discovery). A kill-switch env forces OFF.
 */
import { getSql } from "../../db/client.js";
import { defaultConfigForProfile } from "./default-config.js";
import type { RankingConfig, RankingProfile } from "./types.js";

export type SubscriptionPlanBoosts = Record<string, number>;

export type StoredRankingConfig = {
  config: RankingConfig;
  revision: number;
  subscriptionPlanBoosts: SubscriptionPlanBoosts;
  updatedBy: string | null;
  updatedAt: string | null;
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<RankingProfile, { at: number; value: StoredRankingConfig }>();

function killSwitchOn(): boolean {
  return String(process.env.STORE_RANKING_KILL_SWITCH ?? "").trim().toLowerCase() === "true";
}

type ConfigRow = {
  profile: string;
  enabled: boolean;
  version: string;
  revision: number;
  weights: RankingConfig["weights"];
  offer_weight: string | number;
  penalty_caps: RankingConfig["penaltyCaps"];
  boost_caps: RankingConfig["boostCaps"];
  refs: RankingConfig["references"];
  min_sample: number;
  subscription_plan_boosts: SubscriptionPlanBoosts;
  updated_by: string | null;
  updated_at: string | Date | null;
};

function rowToStored(row: ConfigRow): StoredRankingConfig {
  const base = defaultConfigForProfile(row.profile as RankingProfile);
  return {
    config: {
      version: row.version || base.version,
      profile: row.profile as RankingProfile,
      enabled: row.enabled === true && !killSwitchOn(),
      weights: { ...base.weights, ...(row.weights ?? {}) },
      offerWeight: Number(row.offer_weight ?? base.offerWeight),
      penaltyCaps: { ...base.penaltyCaps, ...(row.penalty_caps ?? {}) },
      boostCaps: { ...base.boostCaps, ...(row.boost_caps ?? {}) },
      references: { ...base.references, ...(row.refs ?? {}) },
      minSample: Number(row.min_sample ?? base.minSample),
    },
    revision: Number(row.revision ?? 1),
    subscriptionPlanBoosts: row.subscription_plan_boosts ?? {},
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at ?? null),
  };
}

/** Code-default fallback wrapped as a StoredRankingConfig (disabled). */
function fallbackStored(profile: RankingProfile): StoredRankingConfig {
  return {
    config: { ...defaultConfigForProfile(profile), enabled: false },
    revision: 0,
    subscriptionPlanBoosts: {},
    updatedBy: null,
    updatedAt: null,
  };
}

export async function loadStoredRankingConfig(
  profile: RankingProfile,
  opts: { fresh?: boolean } = {}
): Promise<StoredRankingConfig> {
  if (!opts.fresh) {
    const c = cache.get(profile);
    if (c && Date.now() - c.at < CACHE_TTL_MS) return c.value;
  }
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT profile, enabled, version, revision, weights, offer_weight, penalty_caps, boost_caps,
             refs, min_sample, subscription_plan_boosts, updated_by, updated_at
      FROM store_ranking_config WHERE profile = ${profile} LIMIT 1
    `) as unknown as ConfigRow[];
    const stored = rows[0] ? rowToStored(rows[0]) : fallbackStored(profile);
    cache.set(profile, { at: Date.now(), value: stored });
    return stored;
  } catch {
    // Table missing / DB error → code default (disabled). Do not cache a transient failure long.
    const stored = fallbackStored(profile);
    cache.set(profile, { at: Date.now(), value: stored });
    return stored;
  }
}

/** Convenience: just the RankingConfig (with kill-switch applied). */
export async function loadRankingConfigForProfile(profile: RankingProfile): Promise<RankingConfig> {
  return (await loadStoredRankingConfig(profile)).config;
}

export function invalidateRankingConfigCache(profile?: RankingProfile): void {
  if (profile) cache.delete(profile);
  else cache.clear();
}

export type RankingConfigUpdate = {
  enabled: boolean;
  weights: RankingConfig["weights"];
  offerWeight: number;
  penaltyCaps: RankingConfig["penaltyCaps"];
  boostCaps: RankingConfig["boostCaps"];
  references: RankingConfig["references"];
  minSample: number;
  subscriptionPlanBoosts: SubscriptionPlanBoosts;
};

/** Validate + persist a config for a profile: bump revision, append history, invalidate cache. */
export async function saveRankingConfig(
  profile: RankingProfile,
  update: RankingConfigUpdate,
  updatedBy: string
): Promise<StoredRankingConfig> {
  const sql = getSql();
  const base = defaultConfigForProfile(profile);
  const version = base.version;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO store_ranking_config
        (profile, enabled, version, revision, weights, offer_weight, penalty_caps, boost_caps, refs,
         min_sample, subscription_plan_boosts, updated_by, updated_at)
      VALUES (
        ${profile}, ${Boolean(update.enabled)}, ${version}, 1,
        ${JSON.stringify(update.weights)}::jsonb, ${update.offerWeight},
        ${JSON.stringify(update.penaltyCaps)}::jsonb, ${JSON.stringify(update.boostCaps)}::jsonb,
        ${JSON.stringify(update.references)}::jsonb, ${Math.trunc(update.minSample)},
        ${JSON.stringify(update.subscriptionPlanBoosts)}::jsonb, ${updatedBy}, now()
      )
      ON CONFLICT (profile) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        revision = store_ranking_config.revision + 1,
        weights = EXCLUDED.weights,
        offer_weight = EXCLUDED.offer_weight,
        penalty_caps = EXCLUDED.penalty_caps,
        boost_caps = EXCLUDED.boost_caps,
        refs = EXCLUDED.refs,
        min_sample = EXCLUDED.min_sample,
        subscription_plan_boosts = EXCLUDED.subscription_plan_boosts,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;
    await tx`
      INSERT INTO store_ranking_config_history (profile, revision, enabled, version, config, updated_by)
      SELECT profile, revision, enabled, version,
             to_jsonb(store_ranking_config) - 'created_at', updated_by
      FROM store_ranking_config WHERE profile = ${profile}
    `;
  });
  invalidateRankingConfigCache(profile);
  return loadStoredRankingConfig(profile, { fresh: true });
}
