import type { MerchantCompensationPolicyDisplay } from '@/lib/merchantCancellationCompensation';

let cache: MerchantCompensationPolicyDisplay | null | undefined;

export function getCachedCompensationPolicy(): MerchantCompensationPolicyDisplay | null | undefined {
  return cache;
}

export async function fetchCompensationPolicy(opts?: {
  force?: boolean;
}): Promise<MerchantCompensationPolicyDisplay | null> {
  if (!opts?.force && cache !== undefined) return cache;

  try {
    const res = await fetch('/api/merchant/cancellation-compensation-policy', { cache: 'no-store' });
    if (!res.ok) {
      cache = null;
      return null;
    }
    const data = (await res.json()) as { policy?: MerchantCompensationPolicyDisplay };
    cache = data.policy ?? null;
    return cache;
  } catch {
    return cache === undefined ? null : cache;
  }
}

export function prefetchCompensationPolicy(): void {
  void fetchCompensationPolicy();
}
