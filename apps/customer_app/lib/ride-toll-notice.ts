import type { OrderDetail } from "@/services/order.service";

export const RIDE_TOLL_NOTICE_DISPLAY =
  "🛣️ Toll fee not included. Pay directly to the driver via Cash/UPI if applicable.";

export const RIDE_TOLL_NOTICE_SPEECH =
  "Toll fee not included. Pay directly to the driver via Cash or UPI if applicable.";

export const RIDE_TOLL_NOTICE_DETAIL =
  "Toll charges are not included unless explicitly shown in your fare breakdown. If your trip passes through a toll plaza, please pay the toll amount directly to the rider at the time of travel.";

const TWO_WHEELER_RIDE_IDS = new Set([
  "bike",
  "bike-lite",
  "cycle",
  "ev_bike",
  "bicycle",
  "scooter",
  "two_wheeler",
  "2_wheeler",
]);

const THREE_WHEELER_RIDE_IDS = new Set([
  "auto",
  "cng_auto",
  "ev_auto",
  "e_rickshaw",
  "three_wheeler",
  "3_wheeler",
]);

const FOUR_WHEELER_RIDE_IDS = new Set([
  "cab-economy",
  "cab-premium",
  "cab",
  "car",
  "taxi",
  "ev_car",
  "four_wheeler",
  "4_wheeler",
  "4_wheeler_non_ac",
  "4_wheeler_ac",
]);

export function resolveRideTypeForTollNotice(
  order: Pick<OrderDetail, "rideType" | "checkoutMetadata">
): string {
  const raw = order.rideType?.trim().toLowerCase();
  if (raw) return raw;
  const meta = order.checkoutMetadata as Record<string, unknown> | null;
  return String(meta?.rideType ?? meta?.selectedRideId ?? "")
    .trim()
    .toLowerCase();
}

/** Toll notices apply to 3-wheelers and 4-wheelers only — not 2-wheelers. */
export function shouldShowRideTollNotice(rideType: string | null | undefined): boolean {
  const raw = (rideType ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (TWO_WHEELER_RIDE_IDS.has(raw)) return false;
  if (THREE_WHEELER_RIDE_IDS.has(raw) || FOUR_WHEELER_RIDE_IDS.has(raw)) return true;
  if (raw.includes("bike") || raw.includes("cycle") || raw.includes("scooter")) return false;
  if (raw.includes("auto") || raw.includes("rickshaw")) return true;
  if (raw.includes("cab") || raw.includes("car") || raw.includes("taxi")) return true;
  return false;
}
