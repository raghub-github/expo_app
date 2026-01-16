import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper to generate next Store ID in GMMC100X format
async function getNextStoreId() {
  // Get the latest storeId from the DB (assuming a 'stores' table with 'store_id' column)
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('store_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data || !data.store_id) {
    return 'GMMC1001';
  }
  const lastId = data.store_id;
  const match = lastId.match(/GMMC(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `GMMC${nextNum.toString().padStart(4, '0')}`;
  }
  return 'GMMC1001';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate required fields (add more as needed)
    if (!body.store_name || !body.store_email || !body.parent_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate next storeId
    const storeId = await getNextStoreId();

    // Insert into DB (assuming a 'stores' table)
    const { error } = await supabaseAdmin.from('stores').insert({
      store_id: storeId,
      parent_id: body.parent_id,
      store_name: body.store_name,
      store_display_name: body.store_display_name,
      store_type: body.store_type,
      store_email: body.store_email,
      store_phones: body.store_phones,
      store_description: body.store_description,
      full_address: body.full_address,
      address_line1: body.address_line1,
      city: body.city,
      state: body.state,
      postal_code: body.postal_code,
      country: body.country,
      latitude: body.latitude,
      longitude: body.longitude,
      landmark: body.landmark,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to register store', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ storeId });
  } catch (err) {
    return NextResponse.json({ error: 'Server error', details: err?.message }, { status: 500 });
  }
}
