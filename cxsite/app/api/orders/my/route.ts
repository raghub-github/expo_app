import { NextRequest, NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { findCustomerByPrimaryMobile } from '@/lib/server/customerAuthDb'
import { fetchCustomerOrders } from '@/lib/server/fetchCustomerOrders'
import { normalizePrimaryMobile } from '@/lib/phoneNormalize'

export const runtime = 'nodejs'

function notConfigured() {
  return NextResponse.json({ error: 'Orders database not configured' }, { status: 501 })
}

export async function GET(req: NextRequest) {
  if (!isCustomersDbConfigured()) return notConfigured()

  const db = getDb()
  if (!db) return notConfigured()

  const phoneRaw = req.nextUrl.searchParams.get('phone')
  if (!phoneRaw) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const phone = normalizePrimaryMobile(phoneRaw)
  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })
  }

  const customer = await findCustomerByPrimaryMobile(db, phone)
  if (!customer) {
    return NextResponse.json({ orders: [] })
  }

  const customerIdParam = req.nextUrl.searchParams.get('customerId')
  if (customerIdParam) {
    const parsed = Number(customerIdParam)
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== customer.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    const limit = Math.min(
      100,
      Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50))
    )
    const orders = await fetchCustomerOrders(db, customer.id, limit)
    return NextResponse.json({ success: true, orders })
  } catch (e) {
    console.error('[api/orders/my]', e)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
