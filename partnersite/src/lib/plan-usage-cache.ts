export type CachedPlanUsage = {
  totalItems: number
  unlockedItems: number
  lockedItems: number
  lockedCategories: number
  planLockingSupported: boolean
  fetchedAt: number
}

const USAGE_KEY = (storeId: string) => `mx_plan_usage_v1_${storeId}`
const ENFORCE_KEY = (storeId: string) => `mx_plan_enforce_v1_${storeId}`
const ENFORCE_TTL_MS = 5 * 60 * 1000

export function readCachedPlanUsage(storeId: string): CachedPlanUsage | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(USAGE_KEY(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPlanUsage
    if (!parsed || typeof parsed.totalItems !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedPlanUsage(storeId: string, usage: Omit<CachedPlanUsage, 'fetchedAt'>) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      USAGE_KEY(storeId),
      JSON.stringify({ ...usage, fetchedAt: Date.now() } satisfies CachedPlanUsage)
    )
  } catch {
    // ignore quota errors
  }
}

export function shouldRunPlanEnforce(storeId: string): boolean {
  if (typeof sessionStorage === 'undefined') return true
  try {
    const raw = sessionStorage.getItem(ENFORCE_KEY(storeId))
    if (!raw) return true
    const ts = Number(raw)
    return !Number.isFinite(ts) || Date.now() - ts > ENFORCE_TTL_MS
  } catch {
    return true
  }
}

export function markPlanEnforceRan(storeId: string) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(ENFORCE_KEY(storeId), String(Date.now()))
  } catch {
    // ignore
  }
}
