/**
 * SEO-friendly URL slug: lowercase, spaces to hyphens, remove special chars.
 */
export function toSlug(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Slug back to title case for display (e.g. "agam-kuan" → "Agam Kuan").
 */
export function slugToTitle(slug: string): string {
  if (!slug || typeof slug !== 'string') return ''
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
