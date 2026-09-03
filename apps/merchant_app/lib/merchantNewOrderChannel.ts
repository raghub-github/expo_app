/**
 * Dedicated Android channel for new-order FCM (MAX + bundled alert sound).
 * Sound is immutable after first create — use a versioned id when changing sound.
 */
export const MERCHANT_NEW_ORDER_CHANNEL_ID = "merchant_new_orders_alert";
/** res/raw name from assets/sounds/notification.wav (expo-notifications sounds). */
export const MERCHANT_NEW_ORDER_SOUND = "notification";

export function isMerchantNewOrderPushData(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? data.gmType ?? data.template_code ?? "").toLowerCase();
  return (
    t === "merchant_new_order" ||
    t === "new_order" ||
    data.screen === "new_order" ||
    String(data.template_code ?? "").toUpperCase() === "MERCHANT_NEW_ORDER" ||
    String(data.gmType ?? "").toUpperCase() === "MERCHANT_NEW_ORDER"
  );
}
