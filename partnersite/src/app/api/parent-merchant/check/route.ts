import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/drizzle';

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }
  const existing = await client`
    SELECT parent_merchant_id FROM merchant_parents
    WHERE registered_phone_normalized = ${phone} OR registered_phone = ${phone}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ exists: true, parent_merchant_id: existing[0].parent_merchant_id });
  }
  return NextResponse.json({ exists: false });
}
