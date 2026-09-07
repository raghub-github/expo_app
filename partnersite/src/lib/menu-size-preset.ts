/**
 * Optional size labels for menu items, variants, and add-on options.
 * NULL / MANUAL keeps existing numeric size + unit behavior.
 */

export const SIZE_PRESET_VALUES = ["REGULAR", "STANDARD", "PREMIUM"] as const;
export type SizePreset = (typeof SIZE_PRESET_VALUES)[number];
export type SizeMode = "MANUAL" | SizePreset;

const PRESET_SET = new Set<string>(SIZE_PRESET_VALUES);

const PRESET_LABEL: Record<SizePreset, string> = {
  REGULAR: "Regular",
  STANDARD: "Standard",
  PREMIUM: "Premium",
};

export function parseSizePreset(value: unknown): SizePreset | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (PRESET_SET.has(upper)) return upper as SizePreset;
  const lower = raw.toLowerCase();
  if (lower === "regular") return "REGULAR";
  if (lower === "standard") return "STANDARD";
  if (lower === "premium") return "PREMIUM";
  return null;
}

export function sizePresetLabel(preset: SizePreset | null | undefined): string | null {
  if (!preset) return null;
  return PRESET_LABEL[preset] ?? null;
}

export function sizeModeFromPreset(preset: unknown): SizeMode {
  return parseSizePreset(preset) ?? "MANUAL";
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** Prefer preset label; otherwise size + unit (legacy). */
export function formatMenuSize(
  sizePreset?: unknown,
  sizeValue?: string | number | null,
  sizeUnit?: string | null
): string | null {
  const label = sizePresetLabel(parseSizePreset(sizePreset));
  if (label) return label;
  const v = sizeValue != null ? String(sizeValue).trim() : "";
  const u = sizeUnit != null ? String(sizeUnit).trim() : "";
  if (v && u) {
    const uLower = u.toLowerCase();
    if (v.toLowerCase().endsWith(uLower)) return v;
    return `${v} ${u}`;
  }
  if (v) return v;
  if (u) return u;
  return null;
}

export type NormalizedSizeWrite = {
  size_preset: SizePreset | null;
  size_value: string | null;
  size_unit: string | null;
};

/**
 * When a preset is selected, clear manual size/unit so data is unambiguous.
 * MANUAL / null keeps the provided size + unit.
 */
export function normalizeSizeWrite(input: {
  size_preset?: unknown;
  size_value?: unknown;
  size_unit?: unknown;
}): NormalizedSizeWrite {
  const preset = parseSizePreset(input.size_preset);
  if (preset) {
    return { size_preset: preset, size_value: null, size_unit: null };
  }
  return {
    size_preset: null,
    size_value: blankToNull(input.size_value),
    size_unit: blankToNull(input.size_unit),
  };
}

export function numericSizeOrNull(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
