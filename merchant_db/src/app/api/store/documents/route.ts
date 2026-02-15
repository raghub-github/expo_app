import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      store_id,
      parent_id,
      storeData,      // all merchant_stores fields
      documents,      // array of document objects
    } = body;

    // 1. Insert into merchant_stores
    const { data: store, error: storeError } = await supabase
      .from('merchant_stores')
      .insert([{ ...storeData, store_id, parent_id }])
      .select()
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Failed to create store', details: storeError }, { status: 500 });
    }

    // 2. Insert documents into merchant_store_documents
    for (const doc of documents) {
      const {
        document_type,
        document_number,
        document_url,
        document_name,
        expiry_date,
        issued_date,
        document_metadata,
      } = doc;

      const { error: docError } = await supabase
        .from('merchant_store_documents')
        .insert([{
          store_id: store.id, // PK from merchant_stores
          document_type,
          document_number,
          document_url,
          document_name: document_name || null,
          expiry_date: expiry_date || null,
          issued_date: issued_date || null,
          is_latest: true,
          is_verified: false,
          document_metadata: document_metadata || {},
        }]);

      if (docError) {
        return NextResponse.json({ error: 'Failed to save document', details: docError }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, store });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
