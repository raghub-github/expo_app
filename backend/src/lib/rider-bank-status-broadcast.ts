/**
 * Instant bank approve/reject fan-out for Rider App (no polling).
 */
import { getEnv } from "../config/env.js";

export const RIDER_BANK_STATUS_EVENT = "bank_status";

export function riderBankStatusChannel(riderId: number | string): string {
  return `rider_bank_status:${riderId}`;
}

export type RiderBankStatusBroadcast = {
  riderId: number;
  action: "approved" | "rejected";
  verificationStatus: "verified" | "rejected";
  paymentMethodId: number | string | null;
  reason: string | null;
};

export async function broadcastRiderBankStatus(
  payload: RiderBankStatusBroadcast,
): Promise<void> {
  const riderId = Number(payload.riderId);
  if (!Number.isInteger(riderId) || riderId < 1) return;

  const body: RiderBankStatusBroadcast = {
    riderId,
    action: payload.action,
    verificationStatus: payload.verificationStatus,
    paymentMethodId: payload.paymentMethodId ?? null,
    reason: payload.reason?.trim() || null,
  };

  await postSupabaseBroadcast(riderId, body);
}

async function postSupabaseBroadcast(
  riderId: number,
  payload: RiderBankStatusBroadcast,
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

  const topic = riderBankStatusChannel(riderId);
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: RIDER_BANK_STATUS_EVENT, payload },
        { topic: `realtime:${topic}`, event: RIDER_BANK_STATUS_EVENT, payload },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[rider-bank-status-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
