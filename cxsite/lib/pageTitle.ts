export const SITE_NAME = 'GatiMitra'

/** Page metadata segment — root layout template renders `GatiMitra | {segment}`. */
export function pageTitleSegment(name: string): string {
  return name.trim()
}

/** Full document / Open Graph title. */
export function fullPageTitle(name: string): string {
  const segment = name.trim()
  return segment ? `${SITE_NAME} | ${segment}` : SITE_NAME
}
