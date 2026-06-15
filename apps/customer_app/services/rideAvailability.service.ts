import api from "./api";

const RIDES_PREFIX = "/v1/rides";

export type RideAvailabilityOption = {
  id: string;
  name: string;
  subtitle: string | null;
  baseFare: number;
  etaMins: number;
  capacity: number | null;
  tag: "FASTEST" | "SAVE" | null;
  imageKey: string;
  vehicleTypes: string[];
  nearbyRiderCount: number;
  nearestRiderKm: number | null;
  nearestRiderEtaMins: number | null;
};

export type NearbySupplyRider = {
  riderId: number;
  lat: number;
  lng: number;
  heading: number | null;
  distanceKm: number;
  vehicleType: string;
  vehicleTypes: string[];
};

export type RideAvailabilityResponse = {
  radiusKm: number;
  nearbyRiderCount: number;
  onDutyRiderCount: number;
  options: RideAvailabilityOption[];
  riders: NearbySupplyRider[];
};

export async function getRideAvailability(params: {
  pickupLat: number;
  pickupLng: number;
  radiusKm?: number;
  rideType?: string;
  tripKm?: number;
  pickupPincode?: string;
  pickupState?: string;
}): Promise<RideAvailabilityResponse> {
  const search = new URLSearchParams();
  search.set("pickupLat", String(params.pickupLat));
  search.set("pickupLng", String(params.pickupLng));
  if (params.radiusKm != null) search.set("radiusKm", String(params.radiusKm));
  if (params.rideType) search.set("rideType", params.rideType);
  if (params.tripKm != null && Number.isFinite(params.tripKm)) {
    search.set("tripKm", String(params.tripKm));
  }
  if (params.pickupPincode) search.set("pickupPincode", params.pickupPincode);
  if (params.pickupState) search.set("pickupState", params.pickupState);

  const { data } = await api.get<RideAvailabilityResponse>(
    `${RIDES_PREFIX}/availability?${search.toString()}`
  );
  return data;
}
