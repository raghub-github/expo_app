/**
 * PAN ↔ Aadhaar name match (mirrors backend panAadhaarNamesMatch).
 * Exact normalized equality or identical token sets — extra/missing names fail.
 */

export function normalizePersonName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(name: string): string[] {
  return normalizePersonName(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

export function panAadhaarNamesMatch(
  panName: string | null | undefined,
  aadhaarName: string | null | undefined,
): boolean {
  const na = normalizePersonName(panName);
  const nb = normalizePersonName(aadhaarName);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = tokenize(na);
  const tb = tokenize(nb);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.length !== tb.length) return false;

  const setB = new Set(tb);
  for (const t of ta) {
    if (!setB.has(t)) return false;
  }
  return true;
}

export function pickPanHolderName(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  return String(
    details.registered_name ??
      details.pan_name ??
      details.pan_holder_name ??
      details.name ??
      details.full_name ??
      details.holder_name ??
      "",
  ).trim();
}

/**
 * Soft person-name match for RC owner ↔ Aadhaar (allows containment / token overlap).
 */
export function softPersonNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(tokenize(na));
  const tb = new Set(tokenize(nb));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  const denom = Math.max(ta.size, tb.size);
  return overlap / denom >= 0.7;
}

export function pickRcOwnerName(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  return String(
    details.owner ||
      details.owner_name ||
      details.registered_name ||
      details.name ||
      "",
  ).trim();
}
