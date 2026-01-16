// Debug: log all rows in merchant_parent
const allRows = await client`SELECT * FROM public.merchant_parent`;
console.log('All merchant_parent rows:', allRows);
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/drizzle';

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  console.log('API parent-merchant/check: phone param:', phone, 'typeof:', typeof phone);
  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }
  // Hardcoded query for debugging
  const hardcoded = await client`
    SELECT parent_merchant_id FROM merchant_parent
    WHERE registered_phone_normalized = '7367878981' OR registered_phone = '7367878981'
    LIMIT 1
  `;
  console.log('API parent-merchant/check: Hardcoded DB result:', hardcoded);
  // Parameterized query
  const existing = await client`
    SELECT parent_merchant_id FROM merchant_parent
    WHERE registered_phone_normalized = ${phone} OR registered_phone = ${phone}
    LIMIT 1
  `;
  console.log('API parent-merchant/check: Parameterized DB result:', existing);
  if (existing.length > 0) {
    return NextResponse.json({ exists: true, parent_merchant_id: existing[0].parent_merchant_id });
  }
  return NextResponse.json({ exists: false });
}
