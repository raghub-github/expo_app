import { getEnv } from "../config/env.js";
import { publishStoreEvent } from "../modules/realtime/publish.js";

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

  const body: MerchantStoreDelistBroadcast = {
    storeId,
    action: payload.action,
    isDelisted: payload.action === "delist",
  };

  await Promise.allSettled([
    publishStoreEvent(storeId, { type: "store.delist", ...body }),
    postSupabaseBroadcast(storeId, body),
  ]);
}

async function postSupabaseBroadcast(
  storeId: number,
  payload: MerchantStoreDelistBroadcast,
): Promise<void> {
  let url = "";
  let key = "";
  try {
    const env = getEnv();
    url = String(env.SUPABASE_URL ?? "").replace(/\/$/, "");
    key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  } catch {
    url = String(process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
    key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  }
  if (!url || !key) return;

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
        { topic, event: MERCHANT_STORE_DELIST_EVENT, payload },
        { topic: `realtime:${topic}`, event: MERCHANT_STORE_DELIST_EVENT, payload },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[store-delist-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
