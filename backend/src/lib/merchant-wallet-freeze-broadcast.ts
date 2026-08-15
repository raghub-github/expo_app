/**
 * Instant freeze/unfreeze fan-out for Merchant App + Partner Site.
 * HTTP broadcast does not need merchant_wallet in supabase_realtime publication.
 */
import { getEnv } from "../config/env.js";
import { publishStoreEvent } from "../modules/realtime/publish.js";

export const MERCHANT_WALLET_FREEZE_EVENT = "wallet_freeze";

export function merchantWalletFreezeChannel(storeId: number | string): string {
  return `merchant_wallet_freeze:${storeId}`;
}

export type MerchantWalletFreezeBroadcast = {
  storeId: number;
  action: "freeze" | "unfreeze";
  isFrozen: boolean;
  freezeReason: string | null;
};

export async function broadcastMerchantWalletFreeze(
  payload: MerchantWalletFreezeBroadcast,
): Promise<void> {
  const storeId = Number(payload.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  const body: MerchantWalletFreezeBroadcast = {
    storeId,
    action: payload.action,
    isFrozen: payload.action === "freeze",
    freezeReason: payload.action === "freeze" ? payload.freezeReason : null,
  };

  await Promise.allSettled([
    publishStoreEvent(storeId, { type: "wallet.freeze", ...body }),
    postSupabaseBroadcast(storeId, body),
  ]);
}

async function postSupabaseBroadcast(
  storeId: number,
  payload: MerchantWalletFreezeBroadcast,
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

  const topic = merchantWalletFreezeChannel(storeId);
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: MERCHANT_WALLET_FREEZE_EVENT, payload },
        { topic: `realtime:${topic}`, event: MERCHANT_WALLET_FREEZE_EVENT, payload },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[wallet-freeze-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
