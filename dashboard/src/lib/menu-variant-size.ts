/** Normalize variant size for API/DB (supports ranges like 1500-1700). */
export function normalizeVariantSizeValue(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

/** Display value in form inputs. */
export function variantSizeValueForInput(raw: unknown): string {
  if (raw == null || raw === "") return "";
  return String(raw).trim();
}
