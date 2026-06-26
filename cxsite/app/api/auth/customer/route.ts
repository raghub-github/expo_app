import { NextRequest, NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { normalizePrimaryMobile, primaryMobileLookupVariantsFromRaw } from '@/lib/phoneNormalize'
import * as dbOps from '@/lib/server/customerAuthDb'

export const runtime = 'nodejs'

function notConfigured() {
  return NextResponse.json({ legacy: true, message: 'Customers DB not configured' }, { status: 501 })
}

export async function GET(req: NextRequest) {
  if (!isCustomersDbConfigured()) return notConfigured()
  const db = getDb()
  if (!db) return notConfigured()

  const phoneRaw = req.nextUrl.searchParams.get('phone')
  const existsOnly = req.nextUrl.searchParams.get('existsOnly') === '1'
  if (!phoneRaw) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }
  if (!primaryMobileLookupVariantsFromRaw(phoneRaw).length) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  if (existsOnly) {
    const exists = await dbOps.customerExists(db, phoneRaw)
    return NextResponse.json({ exists })
  }

  const row = await dbOps.findCustomerByPrimaryMobile(db, phoneRaw)
  if (!row) return NextResponse.json({ customer: null })
  return NextResponse.json({ customer: dbOps.mapCustomerRowToUserPayload(row) })
}

export async function POST(req: NextRequest) {
  if (!isCustomersDbConfigured()) return notConfigured()
  const db = getDb()
  if (!db) return notConfigured()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const phone = normalizePrimaryMobile(
    String(body.primaryMobile ?? body.phone ?? '')
  )
  const fullName = String(body.fullName ?? body.name ?? '').trim()
  let customerId = String(body.customerId ?? body.user_id ?? '').trim()

  if (!phone) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }
  if (!fullName) {
    return NextResponse.json({ error: 'fullName required' }, { status: 400 })
  }

  const existing = await dbOps.findCustomerByPrimaryMobile(db, phone)
  if (existing) {
    const emailVal = body.email !== undefined ? (body.email as string | null) : undefined
    await dbOps.updateCustomerByMobile(db, phone, {
      fullName: fullName !== existing.fullName ? fullName : undefined,
      email: emailVal !== undefined && emailVal !== existing.email ? emailVal : undefined,
    })
    const fresh = await dbOps.findCustomerByPrimaryMobile(db, phone)
    return NextResponse.json({
      customer: fresh ? dbOps.mapCustomerRowToUserPayload(fresh) : null,
    })
  }

  if (!customerId) {
    customerId = await dbOps.getNextGMMSCustomerId(db)
  }

  try {
    const row = await dbOps.insertCustomer(db, {
      customerId,
      fullName,
      primaryMobile: phone,
      email: (body.email as string | null | undefined) ?? null,
      createdVia: (body.createdVia as string | undefined) ?? 'web',
    })
    return NextResponse.json({ customer: dbOps.mapCustomerRowToUserPayload(row) })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === '23505') {
      const again = await dbOps.findCustomerByPrimaryMobile(db, phone)
      if (again) {
        return NextResponse.json({ customer: dbOps.mapCustomerRowToUserPayload(again) })
      }
    }
    console.error('[api/auth/customer POST]', e)
    return NextResponse.json({ error: 'insert failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!isCustomersDbConfigured()) return notConfigured()
  const db = getDb()
  if (!db) return notConfigured()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const phone = normalizePrimaryMobile(String(body.phone ?? body.primaryMobile ?? ''))
  if (!phone) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  if (body.recordLogin === true) {
    await dbOps.updateCustomerByMobile(db, phone, { lastLoginAt: new Date() })
    return NextResponse.json({ ok: true })
  }

  const referralRaw = body.referralCode ?? body.referred_by
  await dbOps.updateCustomerByMobile(db, phone, {
    email: body.email !== undefined ? (body.email as string | null) : undefined,
    referredBy:
      referralRaw !== undefined && referralRaw !== null && referralRaw !== ''
        ? String(referralRaw)
        : undefined,
    smsPermission:
      body.smsPermission !== undefined ? Boolean(body.smsPermission) : undefined,
    profileCompleted:
      body.profileCompleted !== undefined ? Boolean(body.profileCompleted) : true,
  })

  const row = await dbOps.findCustomerByPrimaryMobile(db, phone)
  return NextResponse.json({ customer: row ? dbOps.mapCustomerRowToUserPayload(row) : null })
}
