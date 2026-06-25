import type { ImageSourcePropType } from "react-native";

export type RideOption = {
  id: string;
  name: string;
  image: ImageSourcePropType;
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
    image: require("../../public/img/bike.png"),
    baseFare: 19,
    etaMins: 2,
    capacity: 1,
    tag: "FASTEST",
    subtitle: "Quick Bike rides",
  },
  {
    id: "bike-lite",
    name: "Bike Lite",
    image: require("../../public/img/bike.png"),
    baseFare: 15,
    etaMins: 3,
    capacity: 1,
    tag: "SAVE",
    subtitle: "Budget bike rides",
  },
  {
    id: "auto",
    name: "Auto",
    image: require("../../public/img/auto.png"),
    baseFare: 35,
    etaMins: 6,
    capacity: 3,
    subtitle: "Hassle-free Auto rides",
  },
  {
    id: "cab-economy",
    name: "Cab Economy",
    image: require("../../public/img/ride1.png"),
    baseFare: 55,
    etaMins: 7,
    capacity: 4,
    subtitle: "Affordable cab rides",
  },
  {
    id: "cab-premium",
    name: "Cab Premium",
    image: require("../../public/img/cabpremium.png"),
    baseFare: 85,
    etaMins: 8,
    capacity: 4,
    subtitle: "Premium comfort rides",
  },
];

export function getRideOption(rideId: string): RideOption {
  return RIDE_OPTIONS.find((r) => r.id === rideId) ?? RIDE_OPTIONS[0];
}

export function estimateRideFare(baseFare: number, tripKm: number | null): number {
  const km = tripKm ?? 4;
  return Math.round(baseFare + km * 7);
}

/** Max wait before auto-cancelling rider search (4 minutes). */
export const RIDE_RIDER_SEARCH_TIMEOUT_SEC = 4 * 60;
