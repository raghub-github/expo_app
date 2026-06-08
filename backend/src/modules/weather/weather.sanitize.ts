/** Reject UI/DB placeholder tokens so weather copy never shows "Rain in —". */
export function sanitizeLocationHint(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location"
  ) {
    return null;
  }
  return trimmed;
}
