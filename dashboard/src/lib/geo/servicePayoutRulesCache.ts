/** Client-side cache + deduped prefetch for service payout rules API. */

export type ServicePayoutRulesKey = string;

export type ServicePayoutRulesPayload = {
  rules: Record<string, unknown>[];
  fetchedAt: number;
};

const cache = new Map<ServicePayoutRulesKey, ServicePayoutRulesPayload>();
const inflight = new Map<ServicePayoutRulesKey, Promise<ServicePayoutRulesPayload>>();

export function servicePayoutRulesCacheKey(args: { level: string; refId: string; service: string }): ServicePayoutRulesKey {
  return `${args.level}:${args.refId}:${args.service}`;
}

export function getServicePayoutRulesCache(key: ServicePayoutRulesKey): ServicePayoutRulesPayload | null {
  return cache.get(key) ?? null;
}

export function invalidateServicePayoutRulesCache(key: ServicePayoutRulesKey): void {
  cache.delete(key);
  inflight.delete(key);
}

export async function fetchServicePayoutRules(args: {
  level: string;
  refId: string;
  service: string;
  force?: boolean;
}): Promise<ServicePayoutRulesPayload> {
  const key = servicePayoutRulesCacheKey(args);
  if (args.force) {
    cache.delete(key);
    inflight.delete(key);
  }
  if (!args.force) {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;
  } else {
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const qs = new URLSearchParams({ level: args.level, refId: args.refId, service: args.service });
    const res = await fetch(`/api/super-admin/geo/rider-payout-rules?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load rider payout rules");

    const payload: ServicePayoutRulesPayload = {
      rules: j.rules ?? [],
      fetchedAt: Date.now(),
    };
    cache.set(key, payload);
    return payload;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function prefetchServicePayoutRules(args: { level: string; refId: string; service: string }): void {
  void fetchServicePayoutRules(args).catch(() => {
    /* warm cache */
  });
}
