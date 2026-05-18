/** Clean drop address for display (trim duplicate commas / whitespace). */
export function formatOrderDropAddress(
  normalized?: string | null,
  raw?: string | null
): string {
  const base = (normalized || raw || '').trim();
  if (!base) return '';
  return base
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}
