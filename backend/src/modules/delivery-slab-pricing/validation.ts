import type { DeliveryRateSlabRow } from "./types.js";

export type SlabValidationErrorCode =
  | "EMPTY"
  | "NEGATIVE_DISTANCE"
  | "NOT_SORTED"
  | "OVERLAP"
  | "GAP"
  | "BASE_FARE_NOT_FIRST"
  | "MISSING_ZERO_SLAB";

export type SlabValidationError = { code: SlabValidationErrorCode; message: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateEffectiveSlabs(slabs: DeliveryRateSlabRow[], distanceKm: number): SlabValidationError[] {
  const errs: SlabValidationError[] = [];
  if (!Array.isArray(slabs) || slabs.length === 0) return [{ code: "EMPTY", message: "No slabs configured" }];
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return [{ code: "NEGATIVE_DISTANCE", message: "Invalid distance" }];

  const sorted = [...slabs].sort((a, b) => (a.minKm - b.minKm) || ((a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)) || (b.priority - a.priority) || (a.id - b.id));

  // Must start from 0 for deterministic pricing (at least for any distance > 0).
  if (sorted[0]!.minKm !== 0) errs.push({ code: "MISSING_ZERO_SLAB", message: "Slabs must start from 0 km" });

  // Base fare only allowed in first slab.
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i]!.baseFare ?? 0) > 0) {
      errs.push({ code: "BASE_FARE_NOT_FIRST", message: "Base fare can be set only on the first slab (min_km=0)" });
      break;
    }
  }

  // No overlap and no gaps (up to distanceKm).
  // Overlap check must always consider the whole set (even if distanceKm is small).
  let prevMax = sorted[0]!.maxKm ?? Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s.minKm < prevMax) {
      errs.push({ code: "OVERLAP", message: `Slab overlap at ${s.minKm} km` });
      break;
    }
    prevMax = s.maxKm ?? Infinity;
  }

  // Gap check is required only up to distanceKm.
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    const min = s.minKm;
    const max = s.maxKm ?? Infinity;
    if (distanceKm > 0 && min > cursor && cursor < distanceKm) {
      errs.push({ code: "GAP", message: `Slab gap between ${round2(cursor)} and ${round2(min)} km` });
      break;
    }
    cursor = max;
    if (cursor >= distanceKm) break;
  }

  return errs;
}

