import type { RiderDropSlabRow, RiderPickupSlabRow } from "./types.js";

export type SlabValidationError = { code: string; message: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type DistanceSlabLike = { minKm: number; maxKm: number | null };

export function validateDistanceSlabSet(
  slabs: DistanceSlabLike[],
  distanceKm: number,
  label = "slabs"
): SlabValidationError[] {
  const errs: SlabValidationError[] = [];
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return [{ code: "EMPTY", message: `No ${label} configured` }];
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return [{ code: "NEGATIVE_DISTANCE", message: "Invalid distance" }];
  }

  const sorted = [...slabs].sort(
    (a, b) => a.minKm - b.minKm || (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)
  );

  if (sorted[0]!.minKm !== 0) {
    errs.push({ code: "MISSING_ZERO_SLAB", message: `${label} must start from 0 km` });
  }

  let prevMax = sorted[0]!.maxKm ?? Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s.minKm < prevMax) {
      errs.push({ code: "OVERLAP", message: `${label} overlap at ${s.minKm} km` });
      break;
    }
    prevMax = s.maxKm ?? Infinity;
  }

  let cursor = 0;
  for (const s of sorted) {
    const min = s.minKm;
    const max = s.maxKm ?? Infinity;
    if (distanceKm > 0 && min > cursor && cursor < distanceKm) {
      errs.push({
        code: "GAP",
        message: `${label} gap between ${round2(cursor)} and ${round2(min)} km`,
      });
      break;
    }
    cursor = max;
    if (cursor >= distanceKm) break;
  }

  return errs;
}

export function validatePickupSlabSet(
  slabs: RiderPickupSlabRow[],
  pickupKm: number
): SlabValidationError[] {
  const errs = validateDistanceSlabSet(slabs, pickupKm, "pickup slabs");
  for (let i = 1; i < slabs.length; i++) {
    if ((slabs[i]!.baseFare ?? 0) > 0) {
      errs.push({
        code: "BASE_FARE_NOT_FIRST",
        message: "Base fare can be set only on the first pickup slab (minKm=0)",
      });
      break;
    }
  }
  return errs;
}

export function validateDropSlabSet(slabs: RiderDropSlabRow[], dropKm: number): SlabValidationError[] {
  return validateDistanceSlabSet(slabs, dropKm, "drop slabs");
}
