/**
 * Menu item and category images may be stored as:
 * - R2 key (e.g. "menuitems/xyz.jpg", "categories/abc.jpg") – preferred; no expiry when using R2Image.
 * - Full URL (legacy) – may expire; R2Image auto-renews on load failure.
 *
 * For UI display, use <R2Image src={urlOrKey} /> so signed URLs auto-renew and never show as broken.
 * This helper is for redirect-based or server-side use when a component is not suitable.
 */
export function getMenuImageSrc(urlOrKey: string | null | undefined): string {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const s = urlOrKey.trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `/api/images/signed-url?key=${encodeURIComponent(s)}&redirect=1`;
}
