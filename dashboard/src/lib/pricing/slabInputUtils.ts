/**
 * Shared numeric input helpers for geo slab pricing forms.
 * Keeps edit strings separate from parsed values used for save/preview.
 */

export function sanitizeDecimalInput(raw: string | null | undefined): string {
  let value = (raw ?? "").replace(/[^\d.]/g, "");
  const dotIndex = value.indexOf(".");
  if (dotIndex !== -1) {
    value = value.slice(0, dotIndex + 1) + value.slice(dotIndex + 1).replace(/\./g, "");
  }
  return value;
}

export function sanitizeIntegerInput(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function parseOptionalDecimal(raw: string | null | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "." || trimmed.endsWith(".")) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

export function parseDecimalOrZero(raw: string | null | undefined): number {
  return parseOptionalDecimal(raw) ?? 0;
}

export function parseOptionalInteger(raw: string | null | undefined): number | null {
  const digits = sanitizeIntegerInput((raw ?? "").trim());
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIntegerOrZero(raw: string | null | undefined): number {
  return parseOptionalInteger(raw) ?? 0;
}

export function parseOptionalKm(raw: string | null | undefined): number | null {
  return parseOptionalDecimal(raw);
}

export function formatDecimalField(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

export function formatIntegerField(value: number | null | undefined, fallback = ""): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return String(Math.trunc(value));
}

export function normalizeDecimalOnBlur(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === ".") return "";
  if (trimmed.endsWith(".")) {
    const whole = trimmed.slice(0, -1);
    if (!whole) return "";
    const parsed = Number(whole);
    return Number.isFinite(parsed) ? String(Math.round(parsed * 100) / 100) : "";
  }
  const parsed = parseOptionalDecimal(trimmed);
  return parsed == null ? "" : String(parsed);
}

export function normalizeIntegerOnBlur(raw: string | null | undefined): string {
  const digits = sanitizeIntegerInput((raw ?? "").trim());
  if (!digits) return "";
  return String(Number.parseInt(digits, 10));
}

export function isFirstKmSlab(minKmRaw: string): boolean {
  return parseDecimalOrZero(minKmRaw) === 0;
}

export function nextSlabMinKmFromPrevious(prev: { minKm: string; maxKm: string }): string {
  const prevMax = parseOptionalKm(prev.maxKm);
  if (prevMax != null) return String(prevMax);
  const prevMin = parseDecimalOrZero(prev.minKm);
  return String(prevMin + 1);
}
