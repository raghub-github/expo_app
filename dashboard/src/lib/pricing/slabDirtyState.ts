import {
  normalizeCustomerSlabRow,
  normalizeDropSlabRow,
  normalizePickupSlabRow,
  normalizeRideCustomerSlabRow,
  type EditableCustomerSlabRow,
  type EditableDropSlabRow,
  type EditablePickupSlabRow,
  type EditableRideCustomerSlabRow,
} from "./slabEditableRows";
import { parseDecimalOrZero } from "./slabInputUtils";

function fp(parts: (string | boolean)[]): string {
  return JSON.stringify(parts);
}

export function customerSlabFingerprint(row: EditableCustomerSlabRow): string {
  const n = normalizeCustomerSlabRow(row);
  const baseFare = parseDecimalOrZero(n.minKm) === 0 ? n.baseFare : "";
  return fp([
    n.minKm,
    n.maxKm,
    baseFare,
    n.perKmRate,
    n.minCharge,
    n.waitingChargePerMin,
    n.surgeMultiplier,
    n.priority,
    n.isActive,
  ]);
}

export function rideCustomerSlabFingerprint(row: EditableRideCustomerSlabRow): string {
  const n = normalizeRideCustomerSlabRow(row);
  const baseFare = parseDecimalOrZero(n.minKm) === 0 ? n.baseFare : "";
  return fp([n.minKm, n.maxKm, baseFare, n.perKmRate, n.minCharge, n.priority, n.isActive]);
}

export function pickupSlabFingerprint(row: EditablePickupSlabRow): string {
  const n = normalizePickupSlabRow(row);
  const baseFare = parseDecimalOrZero(n.minKm) === 0 ? n.baseFare : "";
  return fp([
    n.minKm,
    n.maxKm,
    baseFare,
    n.pickupPerKm,
    n.minCharge,
    n.waitingChargePerMin,
    n.waitingStartAfter,
    n.priority,
    n.isActive,
  ]);
}

export function dropSlabFingerprint(row: EditableDropSlabRow): string {
  const n = normalizeDropSlabRow(row);
  return fp([n.minKm, n.maxKm, n.dropPerKm, n.priority, n.isActive]);
}

export function isSlabRowDirty(id: number, currentFp: string, savedFp: string | undefined): boolean {
  if (id <= 0) return true;
  if (savedFp === undefined) return false;
  return currentFp !== savedFp;
}

export function buildSavedFingerprintMap<T extends { id: number }>(
  rows: T[],
  fingerprint: (row: T) => string
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(row.id, fingerprint(row));
  }
  return map;
}
