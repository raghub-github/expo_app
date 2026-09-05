/**
 * Case-insensitive includes that never throws on missing API strings.
 * Catalog / order payloads sometimes omit `name` — `.toLowerCase()` would crash render.
 */
export function textIncludes(haystack: unknown, needle: string): boolean {
  if (!needle || typeof haystack !== "string") return false;
  return haystack.toLowerCase().includes(needle);
}

/** Cuisine / tag arrays from the API may contain nulls or non-strings. */
export function anyTextIncludes(values: unknown, needle: string): boolean {
  if (!Array.isArray(values) || !needle) return false;
  return values.some(
    (value) =>
      textIncludes(value, needle) ||
      (typeof value === "string" && needle.includes(value.toLowerCase()))
  );
}
