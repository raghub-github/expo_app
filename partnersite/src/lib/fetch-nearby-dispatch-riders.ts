export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

export async function fetchNearbyDispatchRidersForOrderCore(
  ordersCoreId: number
): Promise<NearbyDispatchRiderSummary | null> {
  const backendUrl =
    process.env.GATIMITRA_BACKEND_API_URL ||
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!backendUrl || !token) return null;

  try {
    const url = `${backendUrl.replace(/\/+$/, "")}/v1/internal/orders/nearby-dispatch-riders?orders_core_id=${ordersCoreId}`;
    const res = await fetch(url, {
      headers: { "x-internal-token": token },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      summary?: NearbyDispatchRiderSummary | null;
    };
    return json?.ok ? json.summary ?? null : null;
  } catch {
    return null;
  }
}
