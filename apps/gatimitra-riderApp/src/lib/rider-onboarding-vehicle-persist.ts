/**
 * Pure helpers for onboarding vehicle Category ↔ Type persistence.
 * Authoritative store/backend must keep both in sync; these helpers decide
 * when a category change must drop a stale vehicle type.
 */

export function categoryActuallyChanged(
  prevCategory: string | null | undefined,
  nextCategory: string | null | undefined,
): boolean {
  const prev = String(prevCategory ?? "").trim();
  const next = String(nextCategory ?? "").trim();
  if (!next) return false;
  if (!prev) return false;
  return prev !== next;
}

/**
 * When continuing from the category step: clear vehicle type only if the
 * rider picked a different category than the one already persisted.
 */
export function shouldClearVehicleTypeOnCategoryContinue(args: {
  prevCategory: string | null | undefined;
  nextCategory: string;
  prevVehicleChoice: string | null | undefined;
  prevVehicleCategory: string | null | undefined;
}): boolean {
  const next = String(args.nextCategory ?? "").trim();
  if (!next) return false;
  if (categoryActuallyChanged(args.prevCategory, next)) return true;
  // Stale type under a different category than the one being continued.
  const prevChoice = String(args.prevVehicleChoice ?? "").trim();
  const prevChoiceCat = String(args.prevVehicleCategory ?? "").trim();
  if (prevChoice && prevChoiceCat && prevChoiceCat !== next) return true;
  return false;
}

/** Vehicle type change invalidates prior RC↔type match (not the RC payload itself). */
export function vehicleTypeSelectionChanged(
  prevChoice: string | null | undefined,
  nextChoice: string | null | undefined,
): boolean {
  const prev = String(prevChoice ?? "").trim();
  const next = String(nextChoice ?? "").trim();
  if (!next) return false;
  if (!prev) return false;
  return prev !== next;
}
