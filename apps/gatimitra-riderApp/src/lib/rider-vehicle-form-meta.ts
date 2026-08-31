import type {
  RiderVehicleDto,
  RiderVehicleFormMeta,
  RiderVehicleMissingField,
} from "@/src/hooks/useRiderVehicle";

/** Electronic / Cashfree RC — skip the full Step 1 wizard and only ask for uncaptured fields. */
export function isElectronicVehicleForm(
  formMeta?: RiderVehicleFormMeta | null,
  vehicle?: RiderVehicleDto | null,
): boolean {
  if (formMeta?.formMode === "cashfree_missing_only") return true;
  if (formMeta?.prefillSource === "cashfree_rc") return true;
  return Boolean(vehicle?.verified);
}

export function hasMissingStep1VehicleField(
  missingSet: Set<RiderVehicleMissingField>,
): boolean {
  return (
    missingSet.has("vehicle_type") ||
    missingSet.has("registration_number") ||
    missingSet.has("fuel_type") ||
    missingSet.has("make") ||
    missingSet.has("model") ||
    missingSet.has("color") ||
    missingSet.has("year")
  );
}
