/** e.g. "1500-1700 ml", "500 ml", "1 piece". */
export function formatMenuPortionLabel(
  sizeValue?: string | number | null,
  sizeUnit?: string | null
): string | null {
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

/** Zomato-style: "Half (500 ml)", "Coke (250 ml)", "Boiled Egg (1 piece)". */
export function formatMenuOptionDisplayName(
  name: string,
  sizeValue?: string | number | null,
  sizeUnit?: string | null
): string {
  const base = String(name ?? "").trim();
  const portion = formatMenuPortionLabel(sizeValue, sizeUnit);
  if (!portion) return base;
  if (!base) return portion;
  const portionLower = portion.toLowerCase();
  if (base.toLowerCase().includes(portionLower)) return base;
  if (/\([^)]+\)\s*$/.test(base)) return base;
  return `${base} (${portion})`;
}
