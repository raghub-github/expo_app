/**
 * Fan-out when a food order leaves CREATED (accept / reject) so every
 * dashboard merchant-portal tab closes the incoming modal — including
 * devices that did not perform the action (MX-APP, PARTNERSITE, other DASH tabs).
 */
import { getEnv } from "../config/env.js";
import { publishStoreEvent } from "../modules/realtime/publish.js";

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

  const body: MerchantIncomingResolvedBroadcast = {
    storeId,
    coreId: Number.isFinite(Number(payload.coreId)) ? Number(payload.coreId) : null,
    foodId: Number.isFinite(Number(payload.foodId)) ? Number(payload.foodId) : null,
    status: String(payload.status || "").toUpperCase(),
  };

  await Promise.allSettled([
    publishStoreEvent(storeId, { type: "incoming.resolved", ...body }),
    postSupabaseBroadcast(storeId, body),
  ]);
}

async function postSupabaseBroadcast(
  storeId: number,
  payload: MerchantIncomingResolvedBroadcast,
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
        { topic, event: DASH_MX_INCOMING_RESOLVED_EVENT, payload },
        { topic: `realtime:${topic}`, event: DASH_MX_INCOMING_RESOLVED_EVENT, payload },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[incoming-resolved-broadcast] http failed", res.status, text.slice(0, 200));
  }
}
