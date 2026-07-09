import { getSql, isCustomersDbConfigured } from '@/lib/db'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { supabase } from '@/lib/supabase'

export type PlatformTrustedCount = {
  customers: number
  merchants: number
  riders: number
  /** Same as total — kept for clients that read `count`. */
  count: number
  total: number
}

function toCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

async function countViaSql(): Promise<PlatformTrustedCount | null> {
  if (!isCustomersDbConfigured()) return null
  const sql = getSql()
  if (!sql) return null

  try {
    const rows = await Promise.race([
      sql<{
        customers: string | number
        merchants: string | number
        riders: string | number
      }[]>`
        SELECT
          (SELECT COUNT(*)::bigint FROM customers WHERE deleted_at IS NULL) AS customers,
          (SELECT COUNT(*)::bigint FROM merchant_stores WHERE deleted_at IS NULL) AS merchants,
          (SELECT COUNT(*)::bigint FROM riders WHERE deleted_at IS NULL) AS riders
      `,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ])
    const row = rows?.[0]
    if (!row) return null
    const customers = toCount(row.customers)
    const merchants = toCount(row.merchants)
    const riders = toCount(row.riders)
    const total = customers + merchants + riders
    return { customers, merchants, riders, count: total, total }
  } catch (err) {
    console.warn('[fetchPlatformTrustedCount] SQL failed:', err)
    return null
  }
}

async function countTableSupabase(
  table: 'customers' | 'merchant_stores' | 'riders'
): Promise<number> {
  const db = getSupabaseServiceRole() ?? supabase
  const { count, error } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
  if (error) {
    console.warn(`[fetchPlatformTrustedCount] Supabase ${table} count failed:`, error.message)
    return 0
  }
  return count ?? 0
}

async function countViaSupabase(): Promise<PlatformTrustedCount> {
  const [customers, merchants, riders] = await Promise.all([
    countTableSupabase('customers'),
    countTableSupabase('merchant_stores'),
    countTableSupabase('riders'),
  ])
  const total = customers + merchants + riders
  return { customers, merchants, riders, count: total, total }
}

export async function fetchPlatformTrustedCount(): Promise<PlatformTrustedCount> {
  const fromSql = await countViaSql()
  if (fromSql != null) return fromSql
  return countViaSupabase()
}
