import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'

export type StoreRatingSummary = {
  avgRating: number
  totalReviews: number
}

export type StoreWrittenReview = {
  id: number
  rating: number
  food_rating: number | null
  review_title: string | null
  review_text: string
  merchant_response: string | null
  merchant_responded_at: string | null
  is_verified: boolean
  created_at: string
}

/** Same recency half-life as customer app (`merchant-store-ratings.ts`). */
const RECENCY_HALF_LIFE_DAYS = 90

type RatingRow = {
  store_id: number
  rating: number | null
  food_rating: number | null
  created_at: string | null
  is_flagged: boolean | null
}

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

function ratingScore(row: RatingRow): number | null {
  const raw = row.food_rating ?? row.rating
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return n
}

function recencyWeight(createdAt: string | null): number {
  if (!createdAt) return 1
  const ageSec = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 1000)
  return Math.exp(-ageSec / (RECENCY_HALF_LIFE_DAYS * 86400))
}

/**
 * Aggregate ratings from `merchant_store_ratings` — same source/table as the
 * customer app (recency-weighted avg, spam/flagged filtered).
 */
export async function getStoreRatingsForStores(
  storeInternalIds: number[]
): Promise<Map<number, StoreRatingSummary>> {
  const map = new Map<number, StoreRatingSummary>()
  const ids = [
    ...new Set(
      storeInternalIds.filter((id) => Number.isFinite(id) && id > 0).map((id) => Math.trunc(id))
    ),
  ]
  if (ids.length === 0) return map

  const db = getDb()
  const weighted = new Map<number, { scoreSum: number; weightSum: number; count: number }>()

  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data, error } = await db
      .from('merchant_store_ratings')
      .select('store_id, rating, food_rating, created_at, is_flagged')
      .in('store_id', chunk)
      .or('is_flagged.is.null,is_flagged.eq.false')

    if (error) {
      console.warn('[fetchStoreRatings] merchant_store_ratings error:', error.message)
      continue
    }

    for (const raw of (data ?? []) as RatingRow[]) {
      const storeId = Number(raw.store_id)
      if (!Number.isFinite(storeId)) continue
      if (raw.is_flagged === true) continue
      const score = ratingScore(raw)
      if (score == null) continue
      const w = recencyWeight(raw.created_at)
      const cur = weighted.get(storeId) ?? { scoreSum: 0, weightSum: 0, count: 0 }
      cur.scoreSum += score * w
      cur.weightSum += w
      cur.count += 1
      weighted.set(storeId, cur)
    }
  }

  for (const [storeId, agg] of weighted) {
    if (agg.count <= 0 || agg.weightSum <= 0) continue
    const avg = Math.round((agg.scoreSum / agg.weightSum) * 10) / 10
    if (!Number.isFinite(avg)) continue
    map.set(storeId, { avgRating: avg, totalReviews: agg.count })
  }

  return map
}

export async function getStoreRatingSummary(
  storeInternalId: number
): Promise<StoreRatingSummary | null> {
  const map = await getStoreRatingsForStores([storeInternalId])
  return map.get(storeInternalId) ?? null
}

/** Attach avg_rating / total_reviews onto rows that already have numeric `id`. */
export async function attachStoreRatingsToRows<T extends { id: number }>(
  rows: T[]
): Promise<Array<T & { avg_rating: number | null; total_reviews: number | null }>> {
  if (rows.length === 0) return []
  const ratings = await getStoreRatingsForStores(rows.map((r) => r.id))
  return rows.map((row) => {
    const summary = ratings.get(row.id)
    return {
      ...row,
      avg_rating: summary?.avgRating ?? null,
      total_reviews: summary?.totalReviews ?? null,
    }
  })
}

/**
 * Written reviews for a store from `merchant_store_ratings`
 * (only rows with non-empty review_text, not flagged).
 */
export async function getStoreWrittenReviews(
  storeInternalId: number,
  limit = 40
): Promise<StoreWrittenReview[]> {
  if (!Number.isFinite(storeInternalId) || storeInternalId <= 0) return []

  const db = getDb()
  const { data, error } = await db
    .from('merchant_store_ratings')
    .select(
      'id, rating, food_rating, review_title, review_text, merchant_response, merchant_responded_at, is_verified, is_flagged, created_at'
    )
    .eq('store_id', Math.trunc(storeInternalId))
    .or('is_flagged.is.null,is_flagged.eq.false')
    .not('review_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))

  if (error) {
    console.warn('[fetchStoreRatings] written reviews error:', error.message)
    return []
  }

  const out: StoreWrittenReview[] = []
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>
    if (row.is_flagged === true) continue
    const text = typeof row.review_text === 'string' ? row.review_text.trim() : ''
    if (!text) continue
    const rating = Number(row.food_rating ?? row.rating)
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString()
    const respondedAt =
      row.merchant_responded_at instanceof Date
        ? row.merchant_responded_at.toISOString()
        : typeof row.merchant_responded_at === 'string'
          ? row.merchant_responded_at
          : null
    out.push({
      id: Number(row.id),
      rating: Math.round(rating),
      food_rating: row.food_rating != null ? Number(row.food_rating) : null,
      review_title:
        typeof row.review_title === 'string' && row.review_title.trim()
          ? row.review_title.trim()
          : null,
      review_text: text,
      merchant_response:
        typeof row.merchant_response === 'string' && row.merchant_response.trim()
          ? row.merchant_response.trim()
          : null,
      merchant_responded_at: respondedAt,
      is_verified: row.is_verified === true,
      created_at: createdAt,
    })
  }
  return out
}
