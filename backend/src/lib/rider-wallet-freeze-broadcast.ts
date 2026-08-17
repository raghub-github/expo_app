/**
 * Instant freeze/unfreeze fan-out for Rider App (merchant parity, no DB poll).
 * HTTP broadcast only — does not require rider_wallet in supabase_realtime publication.
 */
import { getEnv } from "../config/env.js";

export const RIDER_WALLET_FREEZE_EVENT = "wallet_freeze";

export function riderWalletFreezeChannel(riderId: number | string): string {
  return `rider_wallet_freeze:${riderId}`;
}

export type RiderWalletFreezeBroadcast = {
  riderId: number;
  action: "freeze" | "unfreeze";
  isFrozen: boolean;
  freezeReason: string | null;
};

export async function broadcastRiderWalletFreeze(
  payload: RiderWalletFreezeBroadcast,
): Promise<void> {
  const riderId = Number(payload.riderId);
  if (!Number.isInteger(riderId) || riderId < 1) return;

  const body: RiderWalletFreezeBroadcast = {
    riderId,
    action: payload.action,
    isFrozen: payload.action === "freeze",
    freezeReason: payload.action === "freeze" ? payload.freezeReason : null,
  };

  await postSupabaseBroadcast(riderId, body);
}

async function postSupabaseBroadcast(
  riderId: number,
  payload: RiderWalletFreezeBroadcast,
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

  const topic = riderWalletFreezeChannel(riderId);
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: RIDER_WALLET_FREEZE_EVENT, payload },
        { topic: `realtime:${topic}`, event: RIDER_WALLET_FREEZE_EVENT, payload },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[rider-wallet-freeze-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
