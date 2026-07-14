import {
  normalizeCustomerSlabRow,
  normalizeRideCustomerSlabRow,
  type EditableCustomerSlabRow,
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
