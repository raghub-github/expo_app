/** Close incoming-order modals on every dashboard merchant-portal device. */
export const DASH_MX_INCOMING_RESOLVED_EVENT = "resolved";

export function dashMxIncomingChannel(storeId: number | string): string {
  return `dash-mx-incoming:${storeId}`;
}

export type MerchantIncomingResolvedBroadcast = {
  storeId: number;
  coreId: number | null;
  foodId: number | null;
  status: string;
};

export async function broadcastMerchantIncomingResolved(
  payload: MerchantIncomingResolvedBroadcast,
): Promise<void> {
  const storeId = Number(payload.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key) return;

  const body: MerchantIncomingResolvedBroadcast = {
    storeId,
    coreId: Number.isFinite(Number(payload.coreId)) ? Number(payload.coreId) : null,
    foodId: Number.isFinite(Number(payload.foodId)) ? Number(payload.foodId) : null,
    status: String(payload.status || "").toUpperCase(),
  };
  const topic = dashMxIncomingChannel(storeId);
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: DASH_MX_INCOMING_RESOLVED_EVENT, payload: body },
        { topic: `realtime:${topic}`, event: DASH_MX_INCOMING_RESOLVED_EVENT, payload: body },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[incoming-resolved-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
