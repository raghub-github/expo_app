/**
 * GET /api/reviews/mine?phone=...&customerId=GM100001&id=25&email=...
 * Returns ONLY ratings belonging to that customer (merchant_store_ratings.customer_id).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { findCustomerByPrimaryMobile } from '@/lib/server/customerAuthDb'
import { normalizePrimaryMobile } from '@/lib/phoneNormalize'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { supabase } from '@/lib/supabase'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import { and, eq, isNull } from 'drizzle-orm'
import { customers } from '@/db/customersTable'

export const runtime = 'nodejs'

function dbClient() {
  return getSupabaseServiceRole() ?? supabase
}

export type MineReviewItem = {
  id: string
  source: 'order' | 'feedback'
  title: string
  subtitle: string | null
  rating: number | null
  review: string | null
  response: string | null
  status: string | null
  created_at: string | null
  order_id: number | null
  store_id: number | null
  store_image: string | null
  store_slug: string | null
  service_label: string
  customer_id: number
  customer_code: string | null
}

export async function GET(req: NextRequest) {
  const phoneRaw = req.nextUrl.searchParams.get('phone') ?? ''
  const emailRaw = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  const customerCode = (req.nextUrl.searchParams.get('customerId') ?? '').trim() // e.g. GM100001
  const numericIdRaw = (req.nextUrl.searchParams.get('id') ?? '').trim()
  const numericId = /^\d+$/.test(numericIdRaw) ? Number(numericIdRaw) : null
  const phone = normalizePrimaryMobile(phoneRaw)

  if (!phone && !customerCode && numericId == null) {
    return NextResponse.json(
      {
        ok: false,
        error: 'phone, customerId, or id required',
        reviews: [],
        profile_image_url: null,
      },
      { status: 400 }
    )
  }

  if (!isCustomersDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Database not configured', reviews: [], profile_image_url: null },
      { status: 503 }
    )
  }

  const drizzle = getDb()
  if (!drizzle) {
    return NextResponse.json(
      { ok: false, error: 'Database not configured', reviews: [], profile_image_url: null },
      { status: 503 }
    )
  }

  const admin = dbClient()
  const items: MineReviewItem[] = []
  let profileImageUrl: string | null = null
  let profileName: string | null = null

  // Resolve the ONE customer this session belongs to — never mix users.
  let customer: typeof customers.$inferSelect | null = null

  try {
    if (customerCode) {
      const rows = await drizzle
        .select()
        .from(customers)
        .where(and(eq(customers.customerId, customerCode), isNull(customers.deletedAt)))
        .limit(1)
      customer = rows[0] ?? null
    }

    if (!customer && numericId != null && numericId > 0) {
      const rows = await drizzle
        .select()
        .from(customers)
        .where(and(eq(customers.id, numericId), isNull(customers.deletedAt)))
        .limit(1)
      customer = rows[0] ?? null
    }

    if (!customer && phone) {
      customer = await findCustomerByPrimaryMobile(drizzle, phone)
    }

    // If phone was sent, it must belong to the resolved customer (prevents ID spoofing).
    if (customer && phone) {
      const byPhone = await findCustomerByPrimaryMobile(drizzle, phone)
      if (byPhone && byPhone.id !== customer.id) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Identity mismatch',
            reviews: [],
            profile_image_url: null,
          },
          { status: 403 }
        )
      }
    }

    // customerId (GM…) is authoritative when present
    if (customer && customerCode && customer.customerId !== customerCode) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Identity mismatch',
          reviews: [],
          profile_image_url: null,
        },
        { status: 403 }
      )
    }

    // Only enforce numeric id when it was the sole resolver (no customerId)
    if (
      customer &&
      !customerCode &&
      numericId != null &&
      customer.id !== numericId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Identity mismatch',
          reviews: [],
          profile_image_url: null,
        },
        { status: 403 }
      )
    }
  } catch (e) {
    console.warn('[reviews/mine] customer resolve failed', e)
    return NextResponse.json(
      { ok: false, error: 'Could not resolve customer', reviews: [], profile_image_url: null },
      { status: 500 }
    )
  }

  if (!customer) {
    return NextResponse.json({
      ok: true,
      reviews: [],
      count: 0,
      profile_image_url: null,
      profile_name: null,
      customer_id: null,
      customer_code: customerCode || null,
    })
  }

  const ownerPk = customer.id
  const ownerCode = customer.customerId
  profileName = customer.fullName?.trim() || null
  profileImageUrl = toAbsoluteImageUrl(
    (customer as { profileImageUrl?: string | null }).profileImageUrl ?? null
  )

  if (!profileImageUrl) {
    const { data: photoRow } = await admin
      .from('customers')
      .select('profile_image_url, full_name')
      .eq('id', ownerPk)
      .maybeSingle()
    if (photoRow?.profile_image_url) {
      profileImageUrl = toAbsoluteImageUrl(String(photoRow.profile_image_url))
    }
    if (!profileName && photoRow?.full_name) {
      profileName = String(photoRow.full_name).trim() || null
    }
  }

  // Store ratings — STRICT customer_id filter (no .or() that can widen scope)
  const { data: ratings, error } = await admin
    .from('merchant_store_ratings')
    .select(
      'id, customer_id, store_id, order_id, rating, food_rating, review_text, review_title, merchant_response, created_at, is_flagged'
    )
    .eq('customer_id', ownerPk)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.warn('[reviews/mine] ratings error:', error.message)
  } else {
    const ownRatings = (ratings ?? []).filter((r) => {
      // Belt-and-suspenders: never include another customer's row
      if (Number(r.customer_id) !== ownerPk) return false
      if (r.is_flagged === true) return false
      return true
    })

    const storeIds = [
      ...new Set(
        ownRatings
          .map((r) => Number(r.store_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ]
    const storeMap = new Map<
      number,
      {
        name: string
        city: string | null
        landmark: string | null
        image: string | null
        slug: string | null
      }
    >()

    if (storeIds.length) {
      const { data: stores, error: storesErr } = await admin
        .from('merchant_stores')
        .select(
          'id, store_name, store_display_name, city, landmark, public_slug, banner_url'
        )
        .in('id', storeIds)

      if (storesErr) {
        console.warn('[reviews/mine] stores lookup error:', storesErr.message)
      }
      for (const s of stores ?? []) {
        const id = Number(s.id)
        if (!Number.isFinite(id)) continue
        const name = String(s.store_display_name || s.store_name || '').trim()
        if (!name) continue
        storeMap.set(id, {
          name,
          city: s.city != null ? String(s.city) : null,
          landmark: s.landmark != null ? String(s.landmark) : null,
          image: toAbsoluteImageUrl((s.banner_url as string | null) ?? null),
          slug: s.public_slug != null ? String(s.public_slug) : null,
        })
      }
    }

    const orderIds = [
      ...new Set(
        ownRatings
          .map((r) => Number(r.order_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ]
    const nameByOrderId = new Map<number, string>()
    if (orderIds.length && storeMap.size < storeIds.length) {
      const { data: foodRows } = await admin
        .from('orders_food')
        .select('order_id, restaurant_name')
        .in('order_id', orderIds)
      for (const f of foodRows ?? []) {
        const oid = Number(f.order_id)
        const n = String(f.restaurant_name ?? '').trim()
        if (Number.isFinite(oid) && n) nameByOrderId.set(oid, n)
      }
    }

    for (const r of ownRatings) {
      const storeId = Number(r.store_id)
      const orderId = r.order_id != null ? Number(r.order_id) : null
      const store = storeMap.get(storeId)
      const stars = Number(r.food_rating ?? r.rating)
      const text = String(r.review_text ?? '').trim()
      const title = String(r.review_title ?? '').trim()
      const locParts = [store?.landmark, store?.city].filter(Boolean)
      const resolvedName =
        store?.name ||
        (orderId != null ? nameByOrderId.get(orderId) : null) ||
        'Restaurant'

      items.push({
        id: `order-${r.id}`,
        source: 'order',
        title: resolvedName,
        subtitle: locParts.length ? locParts.join(', ') : null,
        rating: Number.isFinite(stars) ? stars : null,
        review: text || title || null,
        response:
          r.merchant_response != null
            ? String(r.merchant_response).trim() || null
            : null,
        status: 'published',
        created_at: r.created_at != null ? String(r.created_at) : null,
        order_id: orderId != null && Number.isFinite(orderId) ? orderId : null,
        store_id: Number.isFinite(storeId) ? storeId : null,
        store_image: store?.image ?? null,
        store_slug: store?.slug ?? null,
        service_label: 'DELIVERY',
        customer_id: ownerPk,
        customer_code: ownerCode,
      })
    }
  }

  // Website feedback — only if email matches THIS customer (not any random email param)
  const customerEmail = (customer.email ?? emailRaw ?? '').trim().toLowerCase()
  if (customerEmail && customerEmail.includes('@')) {
    // Prefer DB email; if client email differs, ignore client email for feedback
    const emailToUse =
      customer.email?.trim().toLowerCase() ||
      (emailRaw && emailRaw === customerEmail ? emailRaw : '')

    if (emailToUse) {
      const { data, error: fbErr } = await admin
        .from('customer_reviews')
        .select('id, name, email, review, stars, status, response_message, created_at')
        .ilike('email', emailToUse)
        .order('created_at', { ascending: false })
        .limit(50)

      if (fbErr) {
        console.warn('[reviews/mine] feedback error:', fbErr.message)
      } else {
        for (const r of data ?? []) {
          const rowEmail = String(r.email ?? '').trim().toLowerCase()
          if (rowEmail !== emailToUse) continue
          const text = String(r.review ?? '').trim()
          if (!text) continue
          items.push({
            id: `feedback-${r.id}`,
            source: 'feedback',
            title: 'GatiMitra',
            subtitle: 'Platform feedback · Website',
            rating: r.stars != null ? Number(r.stars) : null,
            review: text,
            response:
              r.response_message != null
                ? String(r.response_message).trim() || null
                : null,
            status: r.status != null ? String(r.status) : 'pending',
            created_at: r.created_at != null ? String(r.created_at) : null,
            order_id: null,
            store_id: null,
            store_image: null,
            store_slug: null,
            service_label: 'FEEDBACK',
            customer_id: ownerPk,
            customer_code: ownerCode,
          })
        }
      }
    }
  }

  items.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'order' ? -1 : 1
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json({
    ok: true,
    reviews: items,
    count: items.length,
    profile_image_url: profileImageUrl,
    profile_name: profileName,
    customer_id: ownerPk,
    customer_code: ownerCode,
  })
}
