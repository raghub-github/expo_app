import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type MerchantParentRow = {
  id: number
  parent_merchant_id: string
  parent_name: string
  brand_name: string | null
  business_category: string | null
  store_logo: string | null
  merchant_type: string
  city: string | null
  state: string | null
  is_active: boolean
  approval_status: string
  registration_status: string | null
}

/**
 * GET /api/brands/[parent_merchant_id]
 *
 * Returns a single BRAND from merchant_parents with same filters as list:
 * merchant_type = 'BRAND', is_active = true, approval_status = 'APPROVED', registration_status = 'VERIFIED'.
 * 404 if not found.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ parent_merchant_id: string }> }
) {
  try {
    const { parent_merchant_id } = await params
    if (!parent_merchant_id || typeof parent_merchant_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing parent_merchant_id' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const { data, error } = await supabase
      .from('merchant_parents')
      .select(
        'id, parent_merchant_id, parent_name, brand_name, business_category, store_logo, merchant_type, city, state, is_active, approval_status, registration_status'
      )
      .eq('parent_merchant_id', parent_merchant_id)
      .eq('merchant_type', 'BRAND')
      .eq('is_active', true)
      .eq('approval_status', 'APPROVED')
      .eq('registration_status', 'VERIFIED')
      .maybeSingle()

    if (error) {
      console.error('[api/brands/[parent_merchant_id]] Supabase error:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch brand', details: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const row = data as MerchantParentRow
    const logoRaw = row.store_logo
    const logo =
      logoRaw != null && String(logoRaw).trim() !== ''
        ? String(logoRaw).trim()
        : null
    const storeName = row.brand_name || row.parent_name || 'Store'
    const locationParts = [row.city, row.state].filter(Boolean)
    const location = locationParts.length > 0 ? locationParts.join(', ') : null

    const brand = {
      id: row.id,
      parent_merchant_id: row.parent_merchant_id,
      parent_name: row.parent_name,
      merchant_type: row.merchant_type,
      business_category: row.business_category,
      city: row.city,
      state: row.state,
      store_logo: logo,
      is_active: row.is_active,
      approval_status: row.approval_status,
      store_name: storeName,
      logo,
      short_description: row.business_category ?? null,
      category: row.business_category ?? null,
      location,
      is_verified: row.registration_status === 'VERIFIED',
    }

    const res = NextResponse.json(brand)
    res.headers.set('Cache-Control', 'no-store, max-age=0')
    return res
  } catch (err) {
    console.error('[api/brands/[parent_merchant_id]] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
