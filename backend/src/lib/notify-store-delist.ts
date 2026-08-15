import { emitEvent } from "../modules/notifications/eventBus.js";
import { getSql } from "../db/client.js";
import { insertMerchantStoreNotification } from "./merchant-push-notify.js";
import { broadcastMerchantStoreDelist } from "./merchant-store-delist-broadcast.js";

export type StoreDelistNotifyInput = {
  storeId: number;
  action: "delist" | "relist";
  reason?: string | null;
};

export async function notifyStoreDelistChange(input: StoreDelistNotifyInput): Promise<void> {
  const storeId = Number(input.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  const sql = getSql();
  const [row] = await sql`
    SELECT
      ms.store_name,
      mp.parent_merchant_id
    FROM merchant_stores ms
    JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE ms.id = ${storeId}
    LIMIT 1
  `;
  const userId = String((row as { parent_merchant_id?: unknown } | undefined)?.parent_merchant_id ?? "").trim();
  const storeName =
    String((row as { store_name?: unknown } | undefined)?.store_name ?? "").trim() || "Your store";
  const reason = String(input.reason ?? "").trim() || "Contact support.";

  if (userId) {
    if (input.action === "delist") {
      emitEvent("store.delisted", {
        role: "merchant",
        userId,
        storeId,
        storeName,
        reason,
      });
    } else {
      emitEvent("store.relisted", {
        role: "merchant",
        userId,
        storeId,
        storeName,
      });
    }
  }

  const title = input.action === "delist" ? "Store Delisted" : "Store Relisted";
  const body =
    input.action === "delist"
      ? `${storeName} has been delisted from GatiMitra and cannot receive new orders. Reason: ${reason}`
      : `${storeName} has been relisted. You can turn the store online from Store Status.`;

  await insertMerchantStoreNotification(sql, {
    storeId,
    type: "store",
    title,
    body,
    actionUrl: "/(tabs)",
  });

  await broadcastMerchantStoreDelist({
    storeId,
    action: input.action,
    isDelisted: input.action === "delist",
  });
}
