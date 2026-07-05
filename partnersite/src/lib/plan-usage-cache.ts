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

const inflightByStore = new Map<string, Promise<CachedPlanUsage | null>>()

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

function usageFromApiPayload(data: { usage?: Record<string, unknown> }): Omit<CachedPlanUsage, 'fetchedAt'> | null {
  if (!data?.usage) return null
  return {
    totalItems: Number(data.usage.totalItems ?? 0),
    unlockedItems: Number(data.usage.unlockedItems ?? 0),
    lockedItems: Number(data.usage.lockedItems ?? 0),
    lockedCategories: Number(data.usage.lockedCategories ?? 0),
    planLockingSupported: data.usage.planLockingSupported !== false,
  }
}

/** Fetch plan usage + write session cache. Dedupes concurrent calls per store. */
export async function fetchAndCachePlanUsage(
  storeId: string,
  options?: { runEnforce?: boolean }
): Promise<CachedPlanUsage | null> {
  const id = storeId.trim()
  if (!id) return null

  const existing = inflightByStore.get(id)
  if (existing) return existing

  const promise = (async () => {
    try {
      const runEnforce = options?.runEnforce !== false && shouldRunPlanEnforce(id)
      if (runEnforce) {
        await fetch(`/api/merchant/subscription/enforce-limits?storeId=${encodeURIComponent(id)}`, {
          method: 'POST',
          credentials: 'include',
        })
        markPlanEnforceRan(id)
      }
      const res = await fetch(
        `/api/merchant/subscription/enforce-limits?storeId=${encodeURIComponent(id)}`,
        { credentials: 'include' }
      )
      if (!res.ok) return readCachedPlanUsage(id)
      const data = (await res.json().catch(() => ({}))) as { usage?: Record<string, unknown> }
      const next = usageFromApiPayload(data)
      if (!next) return readCachedPlanUsage(id)
      writeCachedPlanUsage(id, next)
      return { ...next, fetchedAt: Date.now() }
    } catch {
      return readCachedPlanUsage(id)
    } finally {
      inflightByStore.delete(id)
    }
  })()

  inflightByStore.set(id, promise)
  return promise
}

/** Warm session cache before opening Store Settings → Menu & Capacity. */
export function prefetchPlanUsage(storeId: string): void {
  if (!storeId.trim()) return
  void fetchAndCachePlanUsage(storeId)
}
