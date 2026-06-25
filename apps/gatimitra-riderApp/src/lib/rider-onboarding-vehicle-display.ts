import type {
  RiderVehicleDto,
  RiderVehicleOnboardingPrefill,
} from "@/src/hooks/useRiderVehicle";
import {
  findVehicleType,
  type OnboardingVehicleType,
} from "@/src/lib/onboarding-vehicle-types";
import { vehicleTypeLabel } from "@/src/lib/rider-vehicle-options";

export function formatOnboardingVehicleCodeFallback(code: string): string {
  return code
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Onboarding catalog label (e.g. Sedan (AC)) instead of generic maps_to type (Car). */
export function resolveRiderOnboardingVehicleDisplayName(args: {
  vehicle?: RiderVehicleDto | null;
  onboardingVehicleChoice?: string | null;
  onboardingPrefill?: RiderVehicleOnboardingPrefill | null;
  onboardingTypes?: OnboardingVehicleType[];
}): string {
  const fromPrefill = args.onboardingPrefill?.vehicleTypeLabel?.trim();
  if (fromPrefill) return fromPrefill;

  const choice =
    args.onboardingVehicleChoice?.trim() ||
    args.onboardingPrefill?.vehicleChoice?.trim();
  if (choice) {
    const catalog = findVehicleType(args.onboardingTypes ?? [], choice);
    if (catalog?.label?.trim()) return catalog.label.trim();
    return formatOnboardingVehicleCodeFallback(choice);
  }

  const vehicle = args.vehicle;
  if (!vehicle) return "—";
  if (vehicle.vehicleType === "other") {
    return (
      vehicle.make?.trim() ||
      vehicle.vehicleTypeLabel ||
      vehicleTypeLabel(vehicle.vehicleType)
    );
  }
  return vehicle.vehicleTypeLabel || vehicleTypeLabel(vehicle.vehicleType);
}
