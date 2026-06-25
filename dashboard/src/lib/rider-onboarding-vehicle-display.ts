export function formatOnboardingVehicleCodeFallback(code: string): string {
  return code
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type OnboardingVehicleSummarySlice = {
  vehicle?: {
    onboardingVehicleLabel?: string | null;
    onboardingVehicleCode?: string | null;
    vehicleType?: string | null;
  } | null;
  rider?: {
    onboardingVehicleLabel?: string | null;
    vehicleChoice?: string | null;
  } | null;
};

/** Client-safe display name when summary already includes resolved labels. */
export function getOnboardingVehicleDisplayName(
  summary: OnboardingVehicleSummarySlice | null | undefined
): string {
  if (!summary) return "—";
  const label =
    summary.vehicle?.onboardingVehicleLabel ??
    summary.rider?.onboardingVehicleLabel;
  if (label) return label;
  const code =
    summary.vehicle?.onboardingVehicleCode ?? summary.rider?.vehicleChoice;
  if (code) return formatOnboardingVehicleCodeFallback(code);
  if (summary.vehicle?.vehicleType) {
    const raw = String(summary.vehicle.vehicleType);
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  return "—";
}

/** Prefer DB ac_type; infer AC / Non-AC from onboarding code when missing. */
export function resolveAcTypeDisplay(args: {
  acType?: string | null;
  onboardingVehicleCode?: string | null;
}): string | null {
  const fromDb = args.acType?.trim();
  if (fromDb) return fromDb;
  const code = args.onboardingVehicleCode?.trim().toLowerCase();
  if (!code) return null;
  if (code.includes("non_ac")) return "Non-AC";
  if (code.endsWith("_ac") || code.includes("_ac_")) return "AC";
  return null;
}
