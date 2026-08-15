/**
 * Fire freeze/unfreeze to Merchant App + Partner Site without waiting on Fastify.
 */
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

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key) return;

  const body: MerchantWalletFreezeBroadcast = {
    storeId,
    action: payload.action,
    isFrozen: payload.action === "freeze",
    freezeReason: payload.action === "freeze" ? payload.freezeReason : null,
  };
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
        { topic, event: MERCHANT_WALLET_FREEZE_EVENT, payload: body },
        { topic: `realtime:${topic}`, event: MERCHANT_WALLET_FREEZE_EVENT, payload: body },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[wallet-freeze-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
