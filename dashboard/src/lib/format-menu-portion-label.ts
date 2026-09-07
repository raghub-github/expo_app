import { formatMenuSize } from "./menu-size-preset";

/** e.g. "Regular", "1500-1700 ml", "500 ml", "1 piece". */
export function formatMenuPortionLabel(
  sizeValue?: string | number | null,
  sizeUnit?: string | null,
  sizePreset?: string | null
): string | null {
  return formatMenuSize(sizePreset, sizeValue, sizeUnit);
}

/** Zomato-style: "Half (500 ml)", "Regular", "Coke (250 ml)". */
export function formatMenuOptionDisplayName(
  name: string,
  sizeValue?: string | number | null,
  sizeUnit?: string | null,
  sizePreset?: string | null
): string {
  const base = String(name ?? "").trim();
  const portion = formatMenuPortionLabel(sizeValue, sizeUnit, sizePreset);
  if (!portion) return base;
  if (!base) return portion;
  const portionLower = portion.toLowerCase();
  if (base.toLowerCase().includes(portionLower)) return base;
  if (/\([^)]+\)\s*$/.test(base)) return base;
  return `${base} (${portion})`;
}
