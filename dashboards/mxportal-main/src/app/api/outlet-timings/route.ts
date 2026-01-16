import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// You may want to move these to env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// POST: Save or update outlet timings
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { store_id, same_for_all, force_24_hours, closed_day, updated_by_email, updated_by_at, ...timings } = body;
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  // If email is not provided in body, try to get from Supabase session cookie (optional fallback)
  let userEmail = updated_by_email;
  if (!userEmail) {
    try {
      const cookieStore = cookies();
      const supabaseAccessToken = cookieStore.get('sb-access-token')?.value;
      if (supabaseAccessToken) {
        const { data: { user } } = await supabase.auth.getUser(supabaseAccessToken);
        userEmail = user?.email || '';
      }
    } catch (e) {
      userEmail = '';
    }
  }

  // Get store bigint id from merchant_stores
  const { data: storeData, error: storeError } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', store_id)
    .single();
  if (storeError || !storeData) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  const storeBigIntId = storeData.id;

  // Upsert (insert or update) into merchant_store_operating_hours
  const { error } = await supabase
    .from('merchant_store_operating_hours')
    .upsert([
      {
        store_id: storeBigIntId,
        ...timings,
        same_for_all_days: same_for_all ?? false,
        is_24_hours: force_24_hours ?? false,
        closed_days: closed_day ? [closed_day] : null,
        updated_by_email: userEmail,
        updated_by_at: updated_by_at || new Date().toISOString(),
      },
    ], { onConflict: 'store_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// GET: Fetch outlet timings for a store
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const store_id = searchParams.get('store_id');
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('merchant_store_operating_hours')
    .select('*')
    .eq('store_id', store_id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
