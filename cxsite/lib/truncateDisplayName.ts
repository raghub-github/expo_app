/** Header / profile chip: max visible characters, ellipsis if longer. */
export function truncateDisplayName(
  raw: string | undefined | null,
  maxLen = 15,
  fallback = 'User'
): string {
  const s = (raw ?? '').trim()
  if (!s) return fallback
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
}
