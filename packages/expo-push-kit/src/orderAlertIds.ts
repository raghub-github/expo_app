export type NativeOrderAlertSoundType =
  | "notification"
  | "food_order"
  | "parcel_order"
  | "ride_order";

export function merchantAlertSessionId(orderId: string, storeId?: string | number | null): string {
  const id = String(orderId ?? "").trim();
  const store = storeId != null && String(storeId).trim() ? String(storeId).trim() : "";
  if (store) return `MERCHANT_NEW_ORDER:${id}:${store}`;
  return `merchant-order-${id}`;
}

export function riderAlertSessionId(args: {
  orderId: string;
  riderId?: string | number | null;
  waveNumber?: string | number | null;
}): string {
  const orderId = String(args.orderId ?? "").trim();
  const riderId = args.riderId != null ? String(args.riderId).trim() : "";
  const wave = args.waveNumber != null ? String(args.waveNumber).trim() : "";
  if (riderId && wave) return `RIDER_NEW_ORDER:${orderId}:${riderId}:${wave}`;
  if (riderId) return `RIDER_NEW_ORDER:${orderId}:${riderId}`;
  return `rider-offer-${orderId}`;
}

export function riderSoundTypeForService(
  serviceTypeOrCategory: string | null | undefined
): NativeOrderAlertSoundType {
  const key = String(serviceTypeOrCategory ?? "").trim().toLowerCase();
  if (key === "food") return "food_order";
  if (key === "parcel") return "parcel_order";
  if (key === "ride" || key === "person_ride") return "ride_order";
  return "notification";
}

export function extractAlertSessionId(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  const raw = data.alertSessionId ?? data.alert_session_id;
  const s = String(raw ?? "").trim();
  return s || null;
}
