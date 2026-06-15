import { fetchBackendJson } from '@/lib/fetch-backend';

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

export async function fetchNearbyDispatchRidersForOrderCore(
  ordersCoreId: number
): Promise<NearbyDispatchRiderSummary | null> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) return null;

  const json = await fetchBackendJson<{
    ok?: boolean;
    summary?: NearbyDispatchRiderSummary | null;
  }>(
    `/v1/internal/orders/nearby-dispatch-riders?orders_core_id=${ordersCoreId}`,
    {
      headers: { 'x-internal-token': token },
      timeoutMs: 8_000,
    }
  );
  return json?.ok ? json.summary ?? null : null;
}
