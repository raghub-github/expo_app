import type { ImageSourcePropType } from "react-native";
import { appAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

function rideImage(assetKey: string, fallbackKey: string): ImageSourcePropType | null {
  return appAssetSource(assetKey) ?? appAssetSource(fallbackKey);
}

export type RideOption = {
  id: string;
  name: string;
  image: ImageSourcePropType | null;
  baseFare: number;
  etaMins: number;
  capacity?: number;
  tag?: "FASTEST" | "SAVE";
  subtitle?: string;
};

export const RIDE_OPTIONS: RideOption[] = [
  {
    id: "bike",
    name: "Bike",
    image: rideImage(CX.ride.bike, CX.ride.bike),
    baseFare: 19,
    etaMins: 2,
    capacity: 1,
    tag: "FASTEST",
    subtitle: "Quick Bike rides",
  },
  {
    id: "bike-lite",
    name: "Bike Lite",
    image: rideImage(CX.ride.bike, CX.ride.bike),
    baseFare: 15,
    etaMins: 3,
    capacity: 1,
    tag: "SAVE",
    subtitle: "Budget bike rides",
  },
  {
    id: "auto",
    name: "Auto",
    image: rideImage(CX.ride.auto, CX.ride.bike),
    baseFare: 35,
    etaMins: 6,
    capacity: 3,
    subtitle: "Hassle-free Auto rides",
  },
  {
    id: "ev_auto",
    name: "EV Auto",
    image: rideImage(CX.ride.evAuto, CX.ride.auto),
    baseFare: 30,
    etaMins: 6,
    capacity: 3,
    tag: "SAVE",
    subtitle: "Budget EV Auto rides",
  },
  {
    id: "cab-economy",
    name: "Cab Economy",
    image: rideImage(CX.ride.cab, CX.ride.bike),
    baseFare: 55,
    etaMins: 7,
    capacity: 4,
    subtitle: "Affordable cab rides",
  },
  {
    id: "cab-premium",
    name: "Cab Premium",
    image: rideImage(CX.ride.cabPremium, CX.ride.bike),
    baseFare: 85,
    etaMins: 8,
    capacity: 4,
    subtitle: "Premium comfort rides",
  },
];

export function getRideOption(rideId: string): RideOption {
  return RIDE_OPTIONS.find((r) => r.id === rideId) ?? RIDE_OPTIONS[0];
}

/** @deprecated Use backend ride quote API — do not compute fares locally. */
export function estimateRideFare(_baseFare: number, _tripKm: number | null): number {
  return 0;
}

/** Max wait before auto-cancelling rider search (4 minutes). */
export const RIDE_RIDER_SEARCH_TIMEOUT_SEC = 4 * 60;
