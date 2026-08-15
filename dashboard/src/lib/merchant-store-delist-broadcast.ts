export const MERCHANT_STORE_DELIST_EVENT = "store_delist";

export function merchantStoreDelistChannel(storeId: number | string): string {
  return `merchant_store_delist:${storeId}`;
}

export type MerchantStoreDelistBroadcast = {
  storeId: number;
  action: "delist" | "relist";
  isDelisted: boolean;
};

export async function broadcastMerchantStoreDelist(
  payload: MerchantStoreDelistBroadcast,
): Promise<void> {
  const storeId = Number(payload.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key) return;

  const body: MerchantStoreDelistBroadcast = {
    storeId,
    action: payload.action,
    isDelisted: payload.action === "delist",
  };
  const topic = merchantStoreDelistChannel(storeId);
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: MERCHANT_STORE_DELIST_EVENT, payload: body },
        { topic: `realtime:${topic}`, event: MERCHANT_STORE_DELIST_EVENT, payload: body },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[store-delist-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
