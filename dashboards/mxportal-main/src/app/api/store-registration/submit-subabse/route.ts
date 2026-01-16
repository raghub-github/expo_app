// app/api/store-registration/submit-subabse/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Simulate a database auto-increment for demonstration (replace with real DB logic)
let parentCounter = 1001;
let childCounter = 1001;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    // Extract parent and child IDs if present, else auto-generate
    let parent_id = formData.get('parent_id') as string | null;
    let store_id = formData.get('store_id') as string | null;

    // If not provided, auto-generate
    if (!parent_id) {
      parent_id = `GMPP${parentCounter++}`;
    }
    if (!store_id) {
      store_id = `GMMC${childCounter++}`;
    }

    // Parse parent_id as number (bigint)
    let parentIdNum: number | null = null;
    if (parent_id) {
      const parsed = parent_id.replace('GMPP', '');
      parentIdNum = parsed ? Number(parsed) : null;
    }

    // Validate required fields
    const requiredFields = [
      'store_name', 'full_address', 'city', 'state', 'postal_code'
    ];
    for (const field of requiredFields) {
      if (!formData.get(field)) {
        return NextResponse.json({ success: false, error: `Missing required field: ${field}` }, { status: 400 });
      }
    }
    if (!parentIdNum) {
      return NextResponse.json({ success: false, error: 'Missing or invalid parent_id' }, { status: 400 });
    }

    const storeData: any = {
      store_id,
      parent_id: parentIdNum,
      store_name: formData.get('store_name'),
      store_display_name: formData.get('store_display_name'),
      store_description: formData.get('store_description'),
      store_email: formData.get('store_email'),
      store_phones: formData.get('store_phones') ? JSON.parse(formData.get('store_phones') as string) : [],
      full_address: formData.get('full_address'),
      landmark: formData.get('landmark'),
      city: formData.get('city'),
      state: formData.get('state'),
      postal_code: formData.get('postal_code'),
      country: formData.get('country') || 'IN',
      latitude: formData.get('latitude'),
      longitude: formData.get('longitude'),
      cuisine_types: formData.get('cuisine_types') ? JSON.parse(formData.get('cuisine_types') as string) : [],
      food_categories: formData.get('food_categories') ? JSON.parse(formData.get('food_categories') as string) : [],
      avg_preparation_time_minutes: formData.get('avg_preparation_time_minutes') ? Number(formData.get('avg_preparation_time_minutes')) : 30,
      min_order_amount: formData.get('min_order_amount') ? Number(formData.get('min_order_amount')) : 0,
      delivery_radius_km: formData.get('delivery_radius_km') ? Number(formData.get('delivery_radius_km')) : null,
      is_pure_veg: formData.get('is_pure_veg') === 'true',
      accepts_online_payment: formData.get('accepts_online_payment') === 'true',
      accepts_cash: formData.get('accepts_cash') === 'true',
      status: 'DRAFT',
      approval_status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      store_type: formData.get('store_type'),
    };

    // Insert into Supabase

    const { data: store, error: storeError } = await supabase
      .from('merchant_stores')
      .insert([storeData])
      .select()
      .single();

    if (storeError) {
      // Log error for debugging
      console.error('Supabase Insert Error:', storeError);
      return NextResponse.json({ success: false, error: 'Failed to insert store', details: storeError.message }, { status: 500 });
    }

    // TODO: Add R2 upload logic here if needed

    return NextResponse.json({ success: true, parent_id, store_id, store });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to register store', details: String(e) }, { status: 500 });
  }
}
