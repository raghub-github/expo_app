/** Options aligned with backend `vehicle_type` enum. */
export const RIDER_VEHICLE_TYPE_OPTIONS = [
  { value: "bike", label: "Bike", icon: "bicycle-outline" as const },
  { value: "ev_bike", label: "EV Bike", icon: "flash-outline" as const },
  { value: "cycle", label: "Bicycle", icon: "bicycle-outline" as const },
  { value: "auto", label: "Auto", icon: "car-outline" as const },
  { value: "cng_auto", label: "CNG Auto", icon: "car-outline" as const },
  { value: "ev_auto", label: "EV Auto", icon: "flash-outline" as const },
  { value: "car", label: "Car", icon: "car-sport-outline" as const },
  { value: "ev_car", label: "EV Car", icon: "flash-outline" as const },
  { value: "taxi", label: "Taxi", icon: "car-outline" as const },
  { value: "e_rickshaw", label: "E-Rickshaw", icon: "bus-outline" as const },
  { value: "other", label: "Other", icon: "ellipsis-horizontal-outline" as const },
];

export const RIDER_FUEL_TYPE_OPTIONS = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
];

export function vehicleTypeLabel(value: string | null | undefined): string {
  return RIDER_VEHICLE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? "—";
}

export function fuelTypeLabel(value: string | null | undefined): string {
  return RIDER_FUEL_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? "—";
}

export function formatVehicleSubtitle(
  vehicle: {
    vehicleTypeLabel?: string;
    vehicleType?: string;
    make?: string | null;
    model?: string | null;
    registrationNumber?: string;
  } | null,
  isComplete: boolean,
  incompleteLabel: string,
): string {
  if (!isComplete || !vehicle) return incompleteLabel;
  const reg = vehicle.registrationNumber?.trim();
  if (vehicle.vehicleType === "other") {
    const customType = vehicle.make?.trim() || vehicle.vehicleTypeLabel || "Other";
    const brand = vehicle.model?.trim();
    if (brand && reg) return `${customType} • ${brand} • ${reg}`;
    if (brand) return `${customType} • ${brand}`;
    return reg ? `${customType} • ${reg}` : customType;
  }
  const type = vehicle.vehicleTypeLabel ?? vehicleTypeLabel(vehicle.vehicleType);
  if (vehicle.make?.trim() && vehicle.model?.trim()) {
    return `${vehicle.make.trim()} ${vehicle.model.trim()}${reg ? ` • ${reg}` : ""}`;
  }
  return reg ? `${type} • ${reg}` : type;
}
