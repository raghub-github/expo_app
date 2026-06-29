/**
 * Store commission resolver — mirrors backend/src/modules/commission/commission.resolver.ts
 * so cxsite menu prices match the customer app (/v1/merchants/:id/menu).
 */

import { getSql } from '@/lib/db'
import { markupCustomerPrice } from '@/lib/server/customerPricing'

export type CommissionSourceKind = 'DEFAULT' | 'STORE_OVERRIDE' | 'SUBSCRIPTION' | 'PROMOTIONAL'

export type ResolvedCommission = {
  percent: number
  sourceKind: CommissionSourceKind
}

const DEFAULT_FALLBACK_PERCENT = 15

const cache = new Map<number, { value: ResolvedCommission; expiresAt: number }>()
const CACHE_TTL_MS = 60_000

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42703'
}

async function getGlobalDefaultPercent(sql: NonNullable<ReturnType<typeof getSql>>): Promise<number> {
  try {
    const rows = await sql<Array<{ pct: string | null }>>`
      SELECT base_service_fee_percent::text AS pct
      FROM store_onboarding_commission_config
      WHERE id = 1
      LIMIT 1
    `
    const pct = rows[0]?.pct
    if (pct == null) return DEFAULT_FALLBACK_PERCENT
    const n = Number(pct)
    if (!Number.isFinite(n) || n < 0 || n >= 100) return DEFAULT_FALLBACK_PERCENT
    return n
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '42P01') return DEFAULT_FALLBACK_PERCENT
    throw err
  }
}

export async function resolveStoreCommission(storeId: number): Promise<ResolvedCommission> {
  if (!storeId || !Number.isFinite(storeId)) {
    return { percent: DEFAULT_FALLBACK_PERCENT, sourceKind: 'DEFAULT' }
  }

  const cached = cache.get(storeId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const sql = getSql()
  if (!sql) {
    return { percent: DEFAULT_FALLBACK_PERCENT, sourceKind: 'DEFAULT' }
  }

  let manualRows: Array<{ commission_value: string }> = []
  try {
    manualRows = await sql`
      SELECT commission_value
      FROM merchant_store_commission_rules
      WHERE store_id = ${storeId}
        AND is_active = TRUE
        AND source_kind = 'MANUAL_OVERRIDE'
        AND commission_type = 'PERCENTAGE'
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY priority DESC, effective_from DESC
      LIMIT 1
    `
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
  if (manualRows.length > 0) {
    const result: ResolvedCommission = {
      percent: Number(manualRows[0]!.commission_value),
      sourceKind: 'STORE_OVERRIDE',
    }
    cache.set(storeId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  }

  let subRows: Array<{ commission_percent_override: string }> = []
  try {
    subRows = await sql`
      SELECT mp.commission_percent_override
      FROM merchant_subscriptions ms
      JOIN merchant_plans mp ON mp.id = ms.plan_id
      WHERE ms.store_id = ${storeId}
        AND ms.is_active = TRUE
        AND ms.subscription_status = 'ACTIVE'
        AND (ms.expiry_date IS NULL OR ms.expiry_date > NOW())
        AND mp.commission_benefit_active = TRUE
        AND mp.commission_percent_override IS NOT NULL
      ORDER BY ms.start_date DESC
      LIMIT 1
    `
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
  if (subRows.length > 0) {
    const result: ResolvedCommission = {
      percent: Number(subRows[0]!.commission_percent_override),
      sourceKind: 'SUBSCRIPTION',
    }
    cache.set(storeId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  }

  let promoRows: Array<{ commission_value: string }> = []
  try {
    promoRows = await sql`
      SELECT commission_value
      FROM merchant_store_commission_rules
      WHERE store_id = ${storeId}
        AND is_active = TRUE
        AND source_kind = 'PROMOTIONAL'
        AND commission_type = 'PERCENTAGE'
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY priority DESC, effective_from DESC
      LIMIT 1
    `
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
  if (promoRows.length > 0) {
    const result: ResolvedCommission = {
      percent: Number(promoRows[0]!.commission_value),
      sourceKind: 'PROMOTIONAL',
    }
    cache.set(storeId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  }

  const defaultPercent = await getGlobalDefaultPercent(sql)
  const result: ResolvedCommission = { percent: defaultPercent, sourceKind: 'DEFAULT' }
  cache.set(storeId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

export type MenuPriceFields = {
  price: number
  base_price: number
  offer_price: number | null
}

/**
 * Same read-path markup as backend getMenuByStoreId — selling_price/base_price in DB
 * are merchant net; customer sees commission included.
 */
export function applyCustomerMenuItemPricing(
  row: {
    base_price?: unknown
    selling_price?: unknown
    discount_percentage?: unknown
  },
  commissionPercent: number
): MenuPriceFields {
  const netSelling = parseFloat(String(row.selling_price ?? '0'))
  const netBase = parseFloat(String(row.base_price ?? '0'))
  const discountPct = Number(row.discount_percentage ?? 0)

  const customerSelling =
    Number.isFinite(netSelling) && netSelling > 0
      ? markupCustomerPrice(netSelling, commissionPercent)
      : 0
  const customerBase =
    Number.isFinite(netBase) && netBase > 0 ? markupCustomerPrice(netBase, commissionPercent) : 0

  let price = customerSelling > 0 ? customerSelling : customerBase
  let offer_price: number | null = null

  if (customerBase > customerSelling && customerSelling > 0) {
    price = customerBase
    offer_price = customerSelling
  } else if (discountPct > 0 && customerSelling > 0) {
    const pct = discountPct / 100
    if (pct < 1) {
      price = Math.round(customerSelling / (1 - pct))
      offer_price = customerSelling
    }
  }

  return {
    price,
    base_price: customerBase > 0 ? customerBase : price,
    offer_price,
  }
}
