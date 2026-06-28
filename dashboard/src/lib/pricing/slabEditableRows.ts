import {
  formatDecimalField,
  formatIntegerField,
  isFirstKmSlab,
  normalizeDecimalOnBlur,
  normalizeIntegerOnBlur,
  parseDecimalOrZero,
  parseIntegerOrZero,
  parseOptionalDecimal,
  parseOptionalInteger,
  parseOptionalKm,
} from "./slabInputUtils";

export type EditableCustomerSlabRow = {
  id: number;
  minKm: string;
  maxKm: string;
  baseFare: string;
  perKmRate: string;
  minCharge: string;
  waitingChargePerMin: string;
  surgeMultiplier: string;
  priority: string;
  isActive: boolean;
};

export type EditablePickupSlabRow = {
  id: number;
  minKm: string;
  maxKm: string;
  baseFare: string;
  pickupPerKm: string;
  minCharge: string;
  waitingChargePerMin: string;
  waitingStartAfter: string;
  priority: string;
  isActive: boolean;
};

export type EditableDropSlabRow = {
  id: number;
  minKm: string;
  maxKm: string;
  dropPerKm: string;
  priority: string;
  isActive: boolean;
};

export type EditableRideCustomerSlabRow = {
  id: number;
  minKm: string;
  maxKm: string;
  baseFare: string;
  perKmRate: string;
  minCharge: string;
  priority: string;
  isActive: boolean;
};

export function customerSlabFromApi(s: Record<string, unknown>): EditableCustomerSlabRow {
  const minKm = s.minKm ?? s.min_km;
  const maxKm = s.maxKm ?? s.max_km;
  const baseFare = s.baseFare ?? s.base_fare;
  const perKmRate = s.perKmRate ?? s.per_km_rate;
  const minCharge = s.minCharge ?? s.min_charge;
  const waitingChargePerMin = s.waitingChargePerMin ?? s.waiting_charge_per_min;
  const surgeMultiplier = s.surgeMultiplier ?? s.surge_multiplier;
  const priority = s.priority;
  const isActive = s.isActive ?? s.is_active;

  return {
    id: Number(s.id),
    minKm: formatDecimalField(Number(minKm)),
    maxKm: formatDecimalField(maxKm == null ? null : Number(maxKm)),
    baseFare: formatDecimalField(baseFare == null ? null : Number(baseFare)),
    perKmRate: formatDecimalField(Number(perKmRate)),
    minCharge: formatDecimalField(minCharge == null ? null : Number(minCharge)),
    waitingChargePerMin: formatDecimalField(
      waitingChargePerMin == null ? null : Number(waitingChargePerMin)
    ),
    surgeMultiplier: formatDecimalField(surgeMultiplier == null ? null : Number(surgeMultiplier)),
    priority: formatIntegerField(Number(priority ?? 100), "100"),
    isActive: isActive === true,
  };
}

export function rideCustomerSlabFromApi(s: Record<string, unknown>): EditableRideCustomerSlabRow {
  const row = customerSlabFromApi(s);
  return {
    id: row.id,
    minKm: row.minKm,
    maxKm: row.maxKm,
    baseFare: row.baseFare,
    perKmRate: row.perKmRate,
    minCharge: row.minCharge,
    priority: row.priority,
    isActive: row.isActive,
  };
}

export function pickupSlabFromApi(s: Record<string, unknown>): EditablePickupSlabRow {
  return {
    id: Number(s.id),
    minKm: formatDecimalField(Number(s.minKm)),
    maxKm: formatDecimalField(s.maxKm == null ? null : Number(s.maxKm)),
    baseFare: formatDecimalField(s.baseFare == null ? null : Number(s.baseFare)),
    pickupPerKm: formatDecimalField(Number(s.pickupPerKm)),
    minCharge: formatDecimalField(s.minCharge == null ? null : Number(s.minCharge)),
    waitingChargePerMin: formatDecimalField(
      s.waitingChargePerMin == null ? null : Number(s.waitingChargePerMin)
    ),
    waitingStartAfter: formatIntegerField(Number(s.waitingStartAfter ?? 0), "0"),
    priority: formatIntegerField(Number(s.priority ?? 100), "100"),
    isActive: s.isActive === true,
  };
}

export function dropSlabFromApi(s: Record<string, unknown>): EditableDropSlabRow {
  return {
    id: Number(s.id),
    minKm: formatDecimalField(Number(s.minKm)),
    maxKm: formatDecimalField(s.maxKm == null ? null : Number(s.maxKm)),
    dropPerKm: formatDecimalField(Number(s.dropPerKm)),
    priority: formatIntegerField(Number(s.priority ?? 100), "100"),
    isActive: s.isActive === true,
  };
}

export function blankCustomerSlabRow(prev: EditableCustomerSlabRow | undefined): EditableCustomerSlabRow {
  const isFirst = !prev;
  return {
    id: -Date.now(),
    minKm: isFirst ? "0" : nextSlabMinKmFromEditable(prev!),
    maxKm: "",
    baseFare: isFirst ? "0" : "",
    perKmRate: "0",
    minCharge: "",
    waitingChargePerMin: isFirst ? "0" : "",
    surgeMultiplier: isFirst ? "1" : "",
    priority: "100",
    isActive: true,
  };
}

export function blankPickupSlabRow(prev: EditablePickupSlabRow | undefined): EditablePickupSlabRow {
  const isFirst = !prev;
  return {
    id: -Date.now(),
    minKm: isFirst ? "0" : nextSlabMinKmFromEditable(prev!),
    maxKm: "",
    baseFare: isFirst ? "0" : "",
    pickupPerKm: "0",
    minCharge: "",
    waitingChargePerMin: isFirst ? "0" : "",
    waitingStartAfter: "0",
    priority: "100",
    isActive: true,
  };
}

export function blankDropSlabRow(prev: EditableDropSlabRow | undefined): EditableDropSlabRow {
  const isFirst = !prev;
  return {
    id: -Date.now(),
    minKm: isFirst ? "0" : nextSlabMinKmFromEditable(prev!),
    maxKm: "",
    dropPerKm: "0",
    priority: "100",
    isActive: true,
  };
}

export function blankRideCustomerSlabRow(prev: EditableRideCustomerSlabRow | undefined): EditableRideCustomerSlabRow {
  const row = blankCustomerSlabRow(prev as EditableCustomerSlabRow | undefined);
  return {
    id: row.id,
    minKm: row.minKm,
    maxKm: row.maxKm,
    baseFare: row.baseFare,
    perKmRate: row.perKmRate,
    minCharge: row.minCharge,
    priority: row.priority,
    isActive: row.isActive,
  };
}

function nextSlabMinKmFromEditable(prev: { minKm: string; maxKm: string }): string {
  const prevMax = parseOptionalKm(prev.maxKm);
  if (prevMax != null) return String(prevMax);
  return String(parseDecimalOrZero(prev.minKm) + 1);
}

export function parseCustomerSlabForPreview(row: EditableCustomerSlabRow) {
  return {
    id: row.id,
    minKm: parseDecimalOrZero(row.minKm),
    maxKm: parseOptionalKm(row.maxKm),
    baseFare: parseOptionalDecimal(row.baseFare),
    perKmRate: parseDecimalOrZero(row.perKmRate),
    minCharge: parseOptionalDecimal(row.minCharge),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

export function parsePickupSlabForPreview(row: EditablePickupSlabRow) {
  return {
    id: row.id,
    minKm: parseDecimalOrZero(row.minKm),
    maxKm: parseOptionalKm(row.maxKm),
    baseFare: parseOptionalDecimal(row.baseFare),
    pickupPerKm: parseDecimalOrZero(row.pickupPerKm),
    minCharge: parseOptionalDecimal(row.minCharge),
    waitingChargePerMin: parseOptionalDecimal(row.waitingChargePerMin),
    waitingStartAfter: parseIntegerOrZero(row.waitingStartAfter),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

export function parseDropSlabForPreview(row: EditableDropSlabRow) {
  return {
    id: row.id,
    minKm: parseDecimalOrZero(row.minKm),
    maxKm: parseOptionalKm(row.maxKm),
    dropPerKm: parseDecimalOrZero(row.dropPerKm),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

export function parseCustomerSlabForSave(row: EditableCustomerSlabRow) {
  const minKm = parseDecimalOrZero(row.minKm);
  return {
    minKm,
    maxKm: parseOptionalKm(row.maxKm),
    baseFare: isFirstKmSlab(row.minKm) ? parseOptionalDecimal(row.baseFare) : null,
    perKmRate: parseDecimalOrZero(row.perKmRate),
    minCharge: parseOptionalDecimal(row.minCharge),
    waitingChargePerMin: parseOptionalDecimal(row.waitingChargePerMin),
    surgeMultiplier: parseOptionalDecimal(row.surgeMultiplier),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

export function parseRideCustomerSlabForPreview(row: EditableRideCustomerSlabRow) {
  return parseCustomerSlabForPreview({
    ...row,
    waitingChargePerMin: "",
    surgeMultiplier: "",
  });
}

export function parseRideCustomerSlabForSave(row: EditableRideCustomerSlabRow) {
  const parsed = parseCustomerSlabForSave(row as EditableCustomerSlabRow);
  return {
    minKm: parsed.minKm,
    maxKm: parsed.maxKm,
    baseFare: parsed.baseFare,
    perKmRate: parsed.perKmRate,
    minCharge: parsed.minCharge,
    priority: parsed.priority,
    isActive: parsed.isActive,
  };
}

export function parsePickupSlabForSave(row: EditablePickupSlabRow) {
  const minKm = parseDecimalOrZero(row.minKm);
  return {
    minKm,
    maxKm: parseOptionalKm(row.maxKm),
    baseFare: isFirstKmSlab(row.minKm) ? parseOptionalDecimal(row.baseFare) : null,
    pickupPerKm: parseDecimalOrZero(row.pickupPerKm),
    minCharge: parseOptionalDecimal(row.minCharge),
    waitingChargePerMin: parseOptionalDecimal(row.waitingChargePerMin),
    waitingStartAfter: parseIntegerOrZero(row.waitingStartAfter),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

export function parseDropSlabForSave(row: EditableDropSlabRow) {
  return {
    minKm: parseDecimalOrZero(row.minKm),
    maxKm: parseOptionalKm(row.maxKm),
    dropPerKm: parseDecimalOrZero(row.dropPerKm),
    priority: parseIntegerOrZero(row.priority) || 100,
    isActive: row.isActive,
  };
}

/** Normalize in-progress input strings before save (blur rules). */
export function normalizeCustomerSlabRow(row: EditableCustomerSlabRow): EditableCustomerSlabRow {
  return {
    ...row,
    minKm: normalizeDecimalOnBlur(row.minKm),
    maxKm: normalizeDecimalOnBlur(row.maxKm),
    baseFare: normalizeDecimalOnBlur(row.baseFare),
    perKmRate: normalizeDecimalOnBlur(row.perKmRate),
    minCharge: normalizeDecimalOnBlur(row.minCharge),
    waitingChargePerMin: normalizeDecimalOnBlur(row.waitingChargePerMin),
    surgeMultiplier: normalizeDecimalOnBlur(row.surgeMultiplier),
    priority: normalizeIntegerOnBlur(row.priority),
  };
}

export function normalizeRideCustomerSlabRow(row: EditableRideCustomerSlabRow): EditableRideCustomerSlabRow {
  return {
    ...row,
    minKm: normalizeDecimalOnBlur(row.minKm ?? ""),
    maxKm: normalizeDecimalOnBlur(row.maxKm ?? ""),
    baseFare: normalizeDecimalOnBlur(row.baseFare ?? ""),
    perKmRate: normalizeDecimalOnBlur(row.perKmRate ?? ""),
    minCharge: normalizeDecimalOnBlur(row.minCharge ?? ""),
    priority: normalizeIntegerOnBlur(row.priority ?? ""),
  };
}

export function normalizePickupSlabRow(row: EditablePickupSlabRow): EditablePickupSlabRow {
  return {
    ...row,
    minKm: normalizeDecimalOnBlur(row.minKm),
    maxKm: normalizeDecimalOnBlur(row.maxKm),
    baseFare: normalizeDecimalOnBlur(row.baseFare),
    pickupPerKm: normalizeDecimalOnBlur(row.pickupPerKm),
    minCharge: normalizeDecimalOnBlur(row.minCharge),
    waitingChargePerMin: normalizeDecimalOnBlur(row.waitingChargePerMin),
    waitingStartAfter: normalizeIntegerOnBlur(row.waitingStartAfter),
    priority: normalizeIntegerOnBlur(row.priority),
  };
}

export function normalizeDropSlabRow(row: EditableDropSlabRow): EditableDropSlabRow {
  return {
    ...row,
    minKm: normalizeDecimalOnBlur(row.minKm),
    maxKm: normalizeDecimalOnBlur(row.maxKm),
    dropPerKm: normalizeDecimalOnBlur(row.dropPerKm),
    priority: normalizeIntegerOnBlur(row.priority),
  };
}
