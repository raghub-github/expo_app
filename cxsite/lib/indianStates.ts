/** Canonical Indian state / UT names (lowercase) used for display-name parsing. */
export const INDIAN_STATE_NAMES = [
  'andaman and nicobar islands',
  'andhra pradesh',
  'arunachal pradesh',
  'assam',
  'bihar',
  'chandigarh',
  'chhattisgarh',
  'dadra and nagar haveli and daman and diu',
  'delhi',
  'goa',
  'gujarat',
  'haryana',
  'himachal pradesh',
  'jammu and kashmir',
  'jharkhand',
  'karnataka',
  'kerala',
  'ladakh',
  'lakshadweep',
  'madhya pradesh',
  'maharashtra',
  'manipur',
  'meghalaya',
  'mizoram',
  'nagaland',
  'odisha',
  'puducherry',
  'punjab',
  'rajasthan',
  'sikkim',
  'tamil nadu',
  'telangana',
  'tripura',
  'uttar pradesh',
  'uttarakhand',
  'west bengal',
] as const

const STATE_SET = new Set<string>(INDIAN_STATE_NAMES)

const STATE_ALIASES: Record<string, string> = {
  orissa: 'odisha',
  'uttaranchal': 'uttarakhand',
  'nct of delhi': 'delhi',
  'new delhi': 'delhi',
  'pondicherry': 'puducherry',
  'andaman': 'andaman and nicobar islands',
  'nicobar': 'andaman and nicobar islands',
  'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'jammu & kashmir': 'jammu and kashmir',
}

/**
 * Returns a canonical Indian state name if `raw` matches a known state/UT, else null.
 * City / area tokens like "Hisua" correctly return null.
 */
export function matchIndianStateName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t || t === 'india' || t === 'bharat') return null
  const aliased = STATE_ALIASES[t] ?? t
  if (!STATE_SET.has(aliased)) return null
  // Title-case for DB `states.name` lookups (matches seeded rows).
  return aliased
    .split(' ')
    .map((w) => (w === 'and' || w === 'of' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bNct\b/g, 'NCT')
}

/** Walk comma-separated address parts and pick the first known Indian state. */
export function findIndianStateInParts(parts: string[]): string | null {
  for (const part of parts) {
    const hit = matchIndianStateName(part)
    if (hit) return hit
  }
  // Concatenate short trailing chunks ("Nawada Bihar" style without commas)
  const joined = parts.join(' ')
  for (const name of INDIAN_STATE_NAMES) {
    if (joined.toLowerCase().includes(name)) {
      return matchIndianStateName(name)
    }
  }
  return null
}
