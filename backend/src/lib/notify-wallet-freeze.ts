import { emitEvent } from "../modules/notifications/eventBus.js";
import { getSql } from "../db/client.js";
import { broadcastMerchantWalletFreeze } from "./merchant-wallet-freeze-broadcast.js";
import { broadcastRiderWalletFreeze } from "./rider-wallet-freeze-broadcast.js";

export type WalletFreezeNotifyInput = {
  party: "rider" | "merchant";
  action: "freeze" | "unfreeze";
  riderId?: number;
  storeId?: number;
  reason?: string | null;
};

export async function notifyWalletFreezeChange(input: WalletFreezeNotifyInput): Promise<void> {
  if (input.party === "rider") {
    const riderId = Number(input.riderId);
    if (!Number.isInteger(riderId) || riderId < 1) return;
    const userId = `usr_${riderId}`;
    const freezeReason = input.reason ?? null;
    if (input.action === "freeze") {
      emitEvent("wallet.frozen", {
        role: "rider",
        userId,
        reason: freezeReason,
      });
    } else {
      emitEvent("wallet.unfrozen", { role: "rider", userId });
    }
    // Instant UI (broadcast) + push (event bus) — no client polling.
    await broadcastRiderWalletFreeze({
      riderId,
      action: input.action,
      isFrozen: input.action === "freeze",
      freezeReason: input.action === "freeze" ? freezeReason : null,
    });
    return;
  }

  const storeId = Number(input.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;
  const sql = getSql();
  const [row] = await sql`
    SELECT mp.parent_merchant_id
    FROM merchant_stores ms
    JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE ms.id = ${storeId}
    LIMIT 1
  `;
  const userId = String((row as { parent_merchant_id?: unknown } | undefined)?.parent_merchant_id ?? "").trim();
  const freezeReason = input.reason ?? null;
  if (userId) {
    if (input.action === "freeze") {
      emitEvent("wallet.frozen", {
        role: "merchant",
        userId,
        reason: freezeReason,
      });
    } else {
      emitEvent("wallet.unfrozen", { role: "merchant", userId });
    }
  }

  await broadcastMerchantWalletFreeze({
    storeId,
    action: input.action,
    isFrozen: input.action === "freeze",
    freezeReason: input.action === "freeze" ? freezeReason : null,
  });
}
