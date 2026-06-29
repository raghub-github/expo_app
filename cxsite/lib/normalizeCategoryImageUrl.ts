import { toAbsoluteImageUrl } from '@/lib/mediaUrl'

/**
 * Turn DB `image_url` values into a usable browser `src`.
 * @deprecated Prefer `toAbsoluteImageUrl` from `@/lib/mediaUrl`.
 */
export function normalizeCategoryImageUrl(
  raw: string | null | undefined
): string | null {
  return toAbsoluteImageUrl(raw)
}
