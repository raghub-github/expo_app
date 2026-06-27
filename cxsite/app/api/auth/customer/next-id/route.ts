import { NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import * as dbOps from '@/lib/server/customerAuthDb'

export const runtime = 'nodejs'

export async function GET() {
  if (!isCustomersDbConfigured()) {
    return NextResponse.json({ legacy: true }, { status: 501 })
  }
  const db = getDb()
  if (!db) {
    return NextResponse.json({ legacy: true }, { status: 501 })
  }

  const customerId = await dbOps.getNextGMMSCustomerId(db)
  return NextResponse.json({ customerId })
}
