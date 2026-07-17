/**
 * Client-safe person-ride order detail types (no DB / server-only imports).
 */

export type PersonRideOrderDetail = {
  passengerName: string | null;
  passengerPhone: string | null;
  passengerCount: number | null;
  bookedForSelf: boolean;
  rideType: string | null;
  vehicleTypeRequired: string | null;
  pickupOtp: string | null;
  scheduledRide: boolean;
  scheduledPickupTime: string | null;
  returnTrip: boolean;
  waitingCharges: number | null;
  tollCharges: number | null;
  parkingCharges: number | null;
  pickupDistanceFromBookerKm: number | null;
  intermediateStopsCount: number;
};
