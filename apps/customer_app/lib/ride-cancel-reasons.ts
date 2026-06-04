export type RideCancelReason = {
  id: string;
  label: string;
};

export const RIDE_SEARCH_CANCEL_REASONS: RideCancelReason[] = [
  { id: "wrong_pickup", label: "Selected Wrong Pickup Location" },
  { id: "wrong_drop", label: "Selected Wrong Drop Location" },
  { id: "booked_by_mistake", label: "Booked by mistake" },
  { id: "wrong_vehicle", label: "Selected different service/vehicle" },
  { id: "taking_too_long", label: "Taking too long to confirm the ride" },
  { id: "got_ride_elsewhere", label: "Got a ride elsewhere" },
  { id: "other", label: "Others" },
];
