import { supabaseAdmin } from './supabase';
import { supabase } from './supabase';

export async function fetchStoreDocuments(storeId: number) {
  const { data, error } = await supabaseAdmin
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching store documents:', error?.message || error);
    return [];
  }
  if (!data || data.length === 0) {
    // No documents found for this store, not an error
    return [];
  }
  // The table is one row per store, with all docs as columns. Transform to array of doc objects for UI.
  const docRow = data[0];
  if (!docRow) return [];
  const docTypes = [
    { key: 'pan', label: 'PAN', number: 'pan_document_number', url: 'pan_document_url', name: 'pan_document_name', is_verified: 'pan_is_verified' },
    { key: 'gst', label: 'GST', number: 'gst_document_number', url: 'gst_document_url', name: 'gst_document_name', is_verified: 'gst_is_verified' },
    { key: 'aadhaar', label: 'AADHAAR', number: 'aadhaar_document_number', url: 'aadhaar_document_url', name: 'aadhaar_document_name', is_verified: 'aadhaar_is_verified' },
    { key: 'fssai', label: 'FSSAI', number: 'fssai_document_number', url: 'fssai_document_url', name: 'fssai_document_name', is_verified: 'fssai_is_verified' },
    { key: 'trade_license', label: 'TRADE LICENSE', number: 'trade_license_document_number', url: 'trade_license_document_url', name: 'trade_license_document_name', is_verified: 'trade_license_is_verified' },
    { key: 'drug_license', label: 'DRUG LICENSE', number: 'drug_license_document_number', url: 'drug_license_document_url', name: 'drug_license_document_name', is_verified: 'drug_license_is_verified' },
    { key: 'shop_establishment', label: 'SHOP ESTABLISHMENT', number: 'shop_establishment_document_number', url: 'shop_establishment_document_url', name: 'shop_establishment_document_name', is_verified: 'shop_establishment_is_verified' },
    { key: 'udyam', label: 'UDYAM', number: 'udyam_document_number', url: 'udyam_document_url', name: 'udyam_document_name', is_verified: 'udyam_is_verified' },
    { key: 'pharmacist_certificate', label: 'PHARMACIST CERTIFICATE', number: 'pharmacist_certificate_document_number', url: 'pharmacist_certificate_document_url', name: 'pharmacist_certificate_document_name', is_verified: 'pharmacist_certificate_is_verified' },
    { key: 'pharmacy_council_registration', label: 'PHARMACY COUNCIL REGISTRATION', number: 'pharmacy_council_registration_document_number', url: 'pharmacy_council_registration_document_url', name: 'pharmacy_council_registration_document_name', is_verified: 'pharmacy_council_registration_is_verified' },
    { key: 'bank_proof', label: 'BANK PROOF', number: 'bank_proof_document_number', url: 'bank_proof_document_url', name: 'bank_proof_document_name', is_verified: 'bank_proof_is_verified' },
    { key: 'other', label: 'OTHER', number: 'other_document_number', url: 'other_document_url', name: 'other_document_name', is_verified: 'other_is_verified', type: 'other_document_type' },
  ];
  // Only return docs that have a number or url
  return docTypes.map(doc => ({
    document_type: doc.label,
    document_number: docRow[doc.number],
    document_url: docRow[doc.url],
    document_name: docRow[doc.name],
    is_verified: docRow[doc.is_verified],
    ...(doc.type ? { document_subtype: docRow[doc.type] } : {}),
    id: docRow.id,
  })).filter(d => d.document_number || d.document_url);
}

export async function fetchStoreOperatingHours(storeId: number) {
  const { data, error } = await supabaseAdmin
    .from('merchant_store_operating_hours')
    .select('*')
    .eq('store_id', storeId);
  if (error) {
    console.error('Error fetching store operating hours:', error?.message || error);
    return [];
  }
  if (!data || data.length === 0) {
    // No operating hours found for this store, not an error
    return [];
  }
  // If you expect only one row per store, use data[0].
  const row = data[0];
  const days = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];
  // Return an array of objects, one per day
  return days.map(day => ({
    day_label: day.label,
    open: row[`${day.key}_open`],
    slot1_start: row[`${day.key}_slot1_start`],
    slot1_end: row[`${day.key}_slot1_end`],
    slot2_start: row[`${day.key}_slot2_start`],
    slot2_end: row[`${day.key}_slot2_end`],
    total_duration_minutes: row[`${day.key}_total_duration_minutes`],
  }));
}

// Helper to get numeric store id from code
export async function fetchStoreNumericIdByCode(storeCode: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeCode)
    .single();
  if (error || !data) {
    console.error('Error fetching numeric store id:', error?.message || error);
    return null;
  }
  return data.id;
}
