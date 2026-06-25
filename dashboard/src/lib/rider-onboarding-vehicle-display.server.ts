import "server-only";

import { getOnboardingVehicleLabelByCode } from "@/lib/db/operations/rider-onboarding-vehicle-types";
import { formatOnboardingVehicleCodeFallback } from "@/lib/rider-onboarding-vehicle-display";

export async function resolveOnboardingVehicleDisplayLabel(
  code: string | null | undefined
): Promise<{ code: string | null; label: string | null }> {
  const trimmed = code?.trim();
  if (!trimmed) return { code: null, label: null };
  const catalogLabel = await getOnboardingVehicleLabelByCode(trimmed);
  return {
    code: trimmed,
    label: catalogLabel ?? formatOnboardingVehicleCodeFallback(trimmed),
  };
}
