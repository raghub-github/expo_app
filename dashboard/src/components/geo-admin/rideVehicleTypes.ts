export type VehicleType = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";

export const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "2_wheeler", label: "2 Wheeler" },
  { value: "3_wheeler", label: "3 Wheeler" },
  { value: "4_wheeler_non_ac", label: "4 Wheeler Non AC" },
  { value: "4_wheeler_ac", label: "4 Wheeler AC" },
];
