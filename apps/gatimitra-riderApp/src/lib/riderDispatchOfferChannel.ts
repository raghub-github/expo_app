/**
 * Android notification channels for incoming dispatch FCM.
 * Channel sound is immutable after first create — one channel per service so
 * Food / Parcel / Ride can use distinct bundled wavs (same audio for now).
 */

/** Legacy channel — kept registered for devices that already created it. */
export const RIDER_DISPATCH_OFFER_CHANNEL_ID = "rider_dispatch_offers_alert";
/** Legacy res/raw name from assets/sounds/notification.wav. */
export const RIDER_DISPATCH_OFFER_SOUND = "notification";

export const RIDER_DISPATCH_FOOD_CHANNEL_ID = "rider_dispatch_food_v1";
export const RIDER_DISPATCH_FOOD_SOUND = "food_order";

export const RIDER_DISPATCH_PARCEL_CHANNEL_ID = "rider_dispatch_parcel_v1";
export const RIDER_DISPATCH_PARCEL_SOUND = "parcel_order";

export const RIDER_DISPATCH_RIDE_CHANNEL_ID = "rider_dispatch_ride_v1";
export const RIDER_DISPATCH_RIDE_SOUND = "ride_order";

export type RiderDispatchServiceKey = "food" | "parcel" | "ride" | "person_ride";

export type RiderDispatchChannelSpec = {
  channelId: string;
  sound: string;
  name: string;
};

/**
 * Resolve Android channel + bundled sound for a dispatch offer service/category.
 * Unknown values fall back to the legacy channel.
 */
export function riderDispatchChannelForService(
  serviceTypeOrCategory: string | null | undefined
): RiderDispatchChannelSpec {
  const key = String(serviceTypeOrCategory ?? "")
    .trim()
    .toLowerCase();
  if (key === "food") {
    return {
      channelId: RIDER_DISPATCH_FOOD_CHANNEL_ID,
      sound: RIDER_DISPATCH_FOOD_SOUND,
      name: "Incoming food orders",
    };
  }
  if (key === "parcel") {
    return {
      channelId: RIDER_DISPATCH_PARCEL_CHANNEL_ID,
      sound: RIDER_DISPATCH_PARCEL_SOUND,
      name: "Incoming parcel orders",
    };
  }
  if (key === "ride" || key === "person_ride") {
    return {
      channelId: RIDER_DISPATCH_RIDE_CHANNEL_ID,
      sound: RIDER_DISPATCH_RIDE_SOUND,
      name: "Incoming ride requests",
    };
  }
  return {
    channelId: RIDER_DISPATCH_OFFER_CHANNEL_ID,
    sound: RIDER_DISPATCH_OFFER_SOUND,
    name: "Incoming order requests",
  };
}

export function isRiderDispatchOfferPushData(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? data.gmType ?? data.template_code ?? "").toLowerCase();
  const template = String(data.template_code ?? data.templateCode ?? data.gmType ?? "").toUpperCase();
  return (
    t === "dispatch_offer" ||
    t === "rider_dispatch_offer" ||
    t === "rider_new_order" ||
    t === "incoming_order" ||
    t === "force_assignment_offer" ||
    t === "new_order" ||
    template === "RIDER_DISPATCH_OFFER" ||
    template === "RIDER_NEW_ORDER" ||
    template === "DISPATCH_OFFER"
  );
}
