/**
 * Dedicated Android channel for incoming dispatch FCM (MAX + bundled alert sound).
 * Sound is immutable after first create — bump the id if the sound file changes.
 */
export const RIDER_DISPATCH_OFFER_CHANNEL_ID = "rider_dispatch_offers_alert";
/** res/raw name from assets/sounds/notification.wav (expo-notifications sounds). */
export const RIDER_DISPATCH_OFFER_SOUND = "notification";

export function isRiderDispatchOfferPushData(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? data.gmType ?? data.template_code ?? "").toLowerCase();
  return (
    t === "dispatch_offer" ||
    t === "rider_dispatch_offer" ||
    t === "incoming_order" ||
    t === "force_assignment_offer" ||
    String(data.template_code ?? "").toUpperCase() === "RIDER_DISPATCH_OFFER" ||
    String(data.gmType ?? "").toUpperCase() === "DISPATCH_OFFER"
  );
}
