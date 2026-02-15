import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET: /api/store-id?store_id=GMMC1001
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const store_id = searchParams.get('store_id');
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', store_id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  return NextResponse.json({ id: data.id });
}
