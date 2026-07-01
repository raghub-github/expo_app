import { authFetch } from "@/services/authFetch";
import { getConfig } from "@/config/env";
import type { MerchantCompensationPolicyDisplay } from "@/lib/merchantCancellationCompensation";

type CacheEntry = {
  storeId: number;
  token: string;
  policy: MerchantCompensationPolicyDisplay | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;

export function getCachedCompensationPolicy(
  storeId: number,
  token: string,
): MerchantCompensationPolicyDisplay | null | undefined {
  if (!cache || cache.storeId !== storeId || cache.token !== token) return undefined;
  return cache.policy;
}

export async function fetchCompensationPolicy(
  storeId: number,
  token: string,
  opts?: { force?: boolean },
): Promise<MerchantCompensationPolicyDisplay | null> {
  if (!opts?.force) {
    const cached = getCachedCompensationPolicy(storeId, token);
    if (cached !== undefined) return cached;
  }

  try {
    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    const res = await authFetch(
      `${base}/v1/merchant-partner/stores/${storeId}/cancellation-compensation-policy`,
      token,
    );
    if (!res.ok) {
      cache = { storeId, token, policy: null, fetchedAt: Date.now() };
      return null;
    }
    const data = (await res.json()) as { policy?: MerchantCompensationPolicyDisplay };
    const policy = data.policy ?? null;
    cache = { storeId, token, policy, fetchedAt: Date.now() };
    return policy;
  } catch {
    return cache?.storeId === storeId && cache.token === token ? cache.policy : null;
  }
}

export function prefetchCompensationPolicy(storeId: number, token: string): void {
  void fetchCompensationPolicy(storeId, token);
}
