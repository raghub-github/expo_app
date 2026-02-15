// app/api/store-registration/submit/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Map formData to merchant_stores table columns
    // (You may want to add more robust validation and error handling in production)
    const storeData: any = {
      store_id,
      parent_id: parent_id?.replace('GMPP', ''), // Assuming parent_id is bigint in DB
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
      onboarding_completed: false,
      is_active: false,
      is_accepting_orders: false,
      is_available: false,
      store_type: (formData.get('store_type') === 'OTHERS' && formData.get('custom_store_type'))
        ? formData.get('custom_store_type')
        : formData.get('store_type'),
    };

    // Insert into merchant_stores
    const { data, error } = await supabaseAdmin
      .from('merchant_stores')
      .insert([storeData])
      .select();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Insert documents into merchant_store_documents
    // Map formData to document records (one per document type)
    const storeRow = data?.[0];
    const storeRowId = storeRow?.id;
    const docTypes = [
      {
        type: 'PAN',
        number: formData.get('pan_number'),
        file: formData.get('pan_image'),
        name: 'PAN Card',
      },
      {
        type: 'AADHAAR',
        number: formData.get('aadhaar_number'),
        file: formData.get('aadhaar_front'),
        name: 'Aadhaar Front',
      },
      {
        type: 'AADHAAR',
        number: formData.get('aadhaar_number'),
        file: formData.get('aadhaar_back'),
        name: 'Aadhaar Back',
      },
      {
        type: 'FSSAI',
        number: formData.get('fssai_number'),
        file: formData.get('fssai_image'),
        name: 'FSSAI Certificate',
      },
      {
        type: 'GST',
        number: formData.get('gst_number'),
        file: formData.get('gst_image'),
        name: 'GST Certificate',
      },
      {
        type: 'DRUG_LICENSE',
        number: formData.get('drug_license_number'),
        file: formData.get('drug_license_image'),
        name: 'Drug License',
      },
      {
        type: 'PHARMACIST_CERTIFICATE',
        number: formData.get('pharmacist_registration_number'),
        file: formData.get('pharmacist_certificate'),
        name: 'Pharmacist Certificate',
      },
      {
        type: 'PHARMACY_COUNCIL_REGISTRATION',
        number: null,
        file: formData.get('pharmacy_council_registration'),
        name: 'Pharmacy Council Registration',
      },
    ];

    // Only insert documents that have a file (simulate file upload URL for now)
    const docsToInsert = docTypes.filter(doc => doc.file).map(doc => ({
      store_id: storeRowId,
      document_type: doc.type,
      document_number: doc.number,
      document_url: 'https://dummy-upload-url.com/' + (doc.name || doc.type), // TODO: Upload to R2 and get real URL
      document_name: doc.name,
      is_verified: false,
      is_latest: true,
    }));
    if (docsToInsert.length > 0) {
      await supabaseAdmin.from('merchant_store_documents').insert(docsToInsert);
    }

    return NextResponse.json({ success: true, parent_id, store_id, store: data?.[0] });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to register store', details: String(e) }, { status: 500 });
  }
}
