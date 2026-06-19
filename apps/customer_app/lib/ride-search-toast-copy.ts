export const RIDE_CAPTAIN_CANCELLED_TOAST = {
  title: "Captain cancelled ride",
  message:
    "Unfortunately, our previous captain cannot proceed with this order. We are looking out for another captain.",
} as const;

export const RIDE_SEARCH_CANCELLED_TOAST = {
  title: "Ride cancelled",
  message:
    "We couldn't find a captain nearby right now. Please try again in a few minutes.",
} as const;

export const RIDE_CUSTOMER_CANCELLED_TOAST = {
  title: "Ride cancelled",
  message: "Your ride has been cancelled.",
} as const;

export const RIDE_BIKE_UNAVAILABLE_TOAST =
  "Bike is not available in the selected route";
