/** Slug for grocery menu category rows (distinct from user_app_category numeric ids). */
export function groceryMenuCategorySlug(name: string): string {
  return `mcat--${encodeURIComponent(name.trim())}`;
}

export function parseGroceryMenuCategorySlug(slug: string): string | null {
  if (!slug.startsWith("mcat--")) return null;
  try {
    return decodeURIComponent(slug.slice("mcat--".length)).trim() || null;
  } catch {
    return null;
  }
}

export function isGroceryMenuCategorySlug(slug: string): boolean {
  return slug.startsWith("mcat--");
}
