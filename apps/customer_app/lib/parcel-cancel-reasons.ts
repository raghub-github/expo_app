import type { RideCancelReason } from "@/lib/ride-cancel-reasons";

/** Parcel search cancel reasons — same sheet UX as ride. */
export const PARCEL_SEARCH_CANCEL_REASONS: RideCancelReason[] = [
  { id: "wrong_pickup", label: "Selected Wrong Pickup Location" },
  { id: "wrong_drop", label: "Selected Wrong Drop Location" },
  { id: "booked_by_mistake", label: "Booked by mistake" },
  { id: "wrong_vehicle", label: "Selected different vehicle" },
  { id: "taking_too_long", label: "Taking too long to find a captain" },
  { id: "got_courier_elsewhere", label: "Got a courier elsewhere" },
  { id: "other", label: "Others" },
];
