
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

// Lazy DB singleton. Initialising at module scope crashed `next build`
// during page-data collection when DATABASE_URL was empty (Docker pass
// without prod secrets). The real failure now surfaces at request time,
// where it's catchable and observable, not during static analysis.
type Sql = ReturnType<typeof postgres>;
let _sql: Sql | null = null;
function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error('DATABASE_URL is not set');
  }
  _sql = postgres(url);
  return _sql;
}

export async function POST(req: NextRequest) {
  try {
    const { phone, otp } = await req.json();
    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 });
    }
    const sql = getSql();

    // Accept any OTP for demo (in real app, check OTP store)
    // After OTP verification, check parent existence in merchant_parents table
    const parent = await sql`SELECT parent_merchant_id FROM merchant_parents WHERE registered_phone = ${phone} OR registered_phone_normalized = ${phone} LIMIT 1`;
    if (parent.length > 0) {
      return NextResponse.json({ success: true, exists: true, parent_merchant_id: parent[0].parent_merchant_id });
    } else {
      return NextResponse.json({ success: true, exists: false });
    }
  } catch (err) {
    console.error('verify-otp error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
