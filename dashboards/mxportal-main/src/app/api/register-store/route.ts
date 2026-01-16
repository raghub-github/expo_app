import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
        // Validate required document fields before DB insert
        function validateDocuments(documentUrls: any[]): { valid: boolean, errors: Record<string, string> } {
          const errors: Record<string, string> = {};
          for (const doc of documentUrls) {
            const docType = doc.type;
            if (docType === 'PAN' || docType === 'PAN_IMAGE') {
              if (!doc.number) errors.pan_number = 'PAN number is required.';
              if (!doc.file && !doc.url) errors.pan_image = 'PAN image is required.';
            } else if (docType === 'AADHAAR' || docType === 'AADHAR_FRONT' || docType === 'AADHAR_BACK') {
              if (!doc.number) errors.aadhar_number = 'Aadhaar number is required.';
              if (!doc.file && !doc.url) errors.aadhar_image = 'Aadhaar image is required.';
            } else if (docType === 'GST' || docType === 'GST_IMAGE') {
              if (!doc.number) errors.gst_number = 'GST number is required.';
              if (!doc.file && !doc.url) errors.gst_image = 'GST image is required.';
            } else if (docType === 'FSSAI' || docType === 'FSSAI_IMAGE') {
              if (!doc.number) errors.fssai_number = 'FSSAI number is required.';
              if (!doc.file && !doc.url) errors.fssai_image = 'FSSAI image is required.';
            } else if (docType === 'DRUG_LICENSE' || docType === 'PHARMACIST_CERTIFICATE' || docType === 'PHARMACY_COUNCIL_REGISTRATION') {
              if (!doc.number) errors.pharma_number = 'Pharma document number is required.';
              if (!doc.file && !doc.url) errors.pharma_image = 'Pharma document image is required.';
            } else if (docType === 'OTHER' || docType === 'OTHER_IMAGE') {
              if (doc.otherType || doc.number || doc.file) {
                if (!doc.otherType) errors.other_document_type = 'Other document type is required.';
                if (!doc.number) errors.other_document_number = 'Other document number is required.';
                if (!doc.file && !doc.url) errors.other_document_file = 'Other document file is required.';
              }
            }
          }
          return { valid: Object.keys(errors).length === 0, errors };
        }
  // Import R2 helpers
  const { uploadToR2 } = await import('@/lib/r2');
  // Define document types and folders
  const docFolders = {
    PAN: 'PAN',
    GST: 'GST',
    AADHAAR: 'AADHAAR',
    FSSAI: 'FSSAI',
    PHARMA: 'PHARMA',
    BANNERS: 'BANNERS',
    GALLERY: 'GALLERY',
    OTHERS: 'OTHERS',
  };
  try {
    const body = await req.json();
    const { step1, step2, storeSetup, documents, logoUrl, bannerUrl, galleryUrls, documentUrls, parentInfo } = body;
  // If store_type is OTHERS, save 'OTHERS' in store_type and custom type in store_description
  const storeTypeValue = step1.store_type === 'OTHERS' ? 'OTHERS' : step1.store_type;
  const storeDescriptionValue = step1.store_type === 'OTHERS' && step1.custom_store_type
    ? `${step1.store_description || ''} (Custom type: ${step1.custom_store_type})`
    : step1.store_description;

    // Always use parentInfo.id (numeric) for parent_id
    const parentId = parentInfo?.id;
    const parentMerchantId = parentInfo?.parent_merchant_id || step1.parent_merchant_id;
    if (!parentId || !parentMerchantId) throw new Error('Parent info missing');

    // 1. Generate storeId (global sequence, always GMMC{number})
    // Find the highest numeric part of existing store_ids
    const { data: existingStores, error: idError } = await supabaseAdmin
      .from('merchant_stores')
      .select('store_id');
    let maxNum = 1000;
    if (existingStores && Array.isArray(existingStores)) {
      for (const s of existingStores) {
        const match = typeof s.store_id === 'string' && s.store_id.match(/^GMMC(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    const storeId = `GMMC${maxNum + 1}`;
    // Create directory structure (R2 is flat, so prefix keys)
    const r2Base = `store-documents/${storeId}`;
    // Map all possible frontend keys to valid enum values for document_type_merchant
    // Valid enum values: PAN, GST, AADHAR, FSSAI, PHARMACIST_CERTIFICATE, PHARMACY_COUNCIL_REGISTRATION, DRUG_LICENSE, SHOP_ESTABLISHMENT, TRADE_LICENSE, UDYAM, OTHER
    const typeMap: Record<string, string> = {
      PAN_IMAGE: 'PAN',
      PAN: 'PAN',
      GST_IMAGE: 'GST',
      GST: 'GST',
      AADHAR_FRONT: 'AADHAAR',
      AADHAR_BACK: 'AADHAAR',
      AADHAR: 'AADHAAR',
      AADHAAR_FRONT: 'AADHAAR',
      AADHAAR_BACK: 'AADHAAR',
      AADHAAR: 'AADHAAR',
      FSSAI_IMAGE: 'FSSAI',
      FSSAI: 'FSSAI',
      PHARMACIST_CERTIFICATE: 'PHARMACIST_CERTIFICATE',
      PHARMACY_COUNCIL_REGISTRATION: 'PHARMACY_COUNCIL_REGISTRATION',
      DRUG_LICENSE_IMAGE: 'DRUG_LICENSE',
      DRUG_LICENSE: 'DRUG_LICENSE',
      SHOP_ESTABLISHMENT_IMAGE: 'SHOP_ESTABLISHMENT',
      SHOP_ESTABLISHMENT: 'SHOP_ESTABLISHMENT',
      TRADE_LICENSE_IMAGE: 'TRADE_LICENSE',
      TRADE_LICENSE: 'TRADE_LICENSE',
      UDYAM_IMAGE: 'UDYAM',
      UDYAM: 'UDYAM',
      OTHER_IMAGE: 'OTHER',
      OTHER: 'OTHER',
      // Add more mappings as needed
    };
    // --- R2 Document Upload Logic (after storeId and typeMap are defined) ---
    if (documentUrls && documentUrls.length > 0) {
      for (const doc of documentUrls) {
        const docType: string = typeMap[doc.type] || doc.type;
        let folder = docFolders[docType as keyof typeof docFolders] || 'OTHERS';
        // For pharma, group pharmacist and council under PHARMA
        if (docType === 'PHARMACIST_CERTIFICATE' || docType === 'PHARMACY_COUNCIL_REGISTRATION' || docType === 'DRUG_LICENSE') {
          folder = 'PHARMA';
        }
        // For banners and gallery
        if (docType === 'BANNER') folder = 'BANNERS';
        if (docType === 'GALLERY') folder = 'GALLERY';
        // Compose R2 key
        const fileName = `${Date.now()}_${doc.name}`;
        const r2Key = `${r2Base}/${folder}/${fileName}`;
        // Upload file to R2
        if (doc.file) {
          await uploadToR2(doc.file, r2Key);
          doc.url = r2Key; // Save R2 key as URL for DB
        }
      }
    }

    // 2. Insert store (one row per child store)
    const { data: storeData, error: storeError } = await supabaseAdmin
      .from('merchant_stores')
      .insert([{
        store_id: storeId,
        parent_id: parentId,
        store_name: step1.store_name,
        store_display_name: step1.store_display_name,
        store_description: storeDescriptionValue,
        store_email: step1.store_email,
        store_phones: step1.store_phones,
        full_address: step2.full_address,
        landmark: step2.landmark,
        city: step2.city,
        state: step2.state,
        postal_code: step2.postal_code,
        country: step2.country,
        latitude: step2.latitude,
        longitude: step2.longitude,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        gallery_images: galleryUrls,
        cuisine_types: storeSetup.cuisine_types,
        food_categories: storeSetup.food_categories,
        avg_preparation_time_minutes: storeSetup.avg_preparation_time_minutes,
        min_order_amount: storeSetup.min_order_amount,
        delivery_radius_km: storeSetup.delivery_radius_km,
        is_pure_veg: storeSetup.is_pure_veg,
        accepts_online_payment: storeSetup.accepts_online_payment,
        accepts_cash: storeSetup.accepts_cash,
        status: 'INACTIVE',
        approval_status: 'SUBMITTED',
        store_type: storeTypeValue,
        is_active: false,
        is_accepting_orders: false,
        is_available: false,
        operational_status: 'CLOSED',
        onboarding_completed: true, 
      }])
      .select()
      .single();
    if (storeError) throw new Error(storeError.message);

    // 3. Insert operating hours (one row per store)
    const hours = storeSetup.store_hours || {};
    const opRow = {
      store_id: storeData.id,
      monday_open: !!(hours.monday?.open && hours.monday?.close),
      monday_slot1_start: hours.monday?.open || null,
      monday_slot1_end: hours.monday?.close || null,
      monday_slot2_start: null,
      monday_slot2_end: null,
      monday_total_duration_minutes: 0,
      tuesday_open: !!(hours.tuesday?.open && hours.tuesday?.close),
      tuesday_slot1_start: hours.tuesday?.open || null,
      tuesday_slot1_end: hours.tuesday?.close || null,
      tuesday_slot2_start: null,
      tuesday_slot2_end: null,
      tuesday_total_duration_minutes: 0,
      wednesday_open: !!(hours.wednesday?.open && hours.wednesday?.close),
      wednesday_slot1_start: hours.wednesday?.open || null,
      wednesday_slot1_end: hours.wednesday?.close || null,
      wednesday_slot2_start: null,
      wednesday_slot2_end: null,
      wednesday_total_duration_minutes: 0,
      thursday_open: !!(hours.thursday?.open && hours.thursday?.close),
      thursday_slot1_start: hours.thursday?.open || null,
      thursday_slot1_end: hours.thursday?.close || null,
      thursday_slot2_start: null,
      thursday_slot2_end: null,
      thursday_total_duration_minutes: 0,
      friday_open: !!(hours.friday?.open && hours.friday?.close),
      friday_slot1_start: hours.friday?.open || null,
      friday_slot1_end: hours.friday?.close || null,
      friday_slot2_start: null,
      friday_slot2_end: null,
      friday_total_duration_minutes: 0,
      saturday_open: !!(hours.saturday?.open && hours.saturday?.close),
      saturday_slot1_start: hours.saturday?.open || null,
      saturday_slot1_end: hours.saturday?.close || null,
      saturday_slot2_start: null,
      saturday_slot2_end: null,
      saturday_total_duration_minutes: 0,
      sunday_open: !!(hours.sunday?.open && hours.sunday?.close),
      sunday_slot1_start: hours.sunday?.open || null,
      sunday_slot1_end: hours.sunday?.close || null,
      sunday_slot2_start: null,
      sunday_slot2_end: null,
      sunday_total_duration_minutes: 0,
      is_24_hours: false,
      same_for_all_days: false,
      closed_days: [],
    };
    const { error: opError } = await supabaseAdmin
      .from('merchant_store_operating_hours')
      .insert([opRow]);
    if (opError) throw new Error(opError.message);

    // 4. Insert documents (one row per store)
    if (documentUrls && documentUrls.length > 0) {
      // For each document, if a document number is provided, save all related data for that document type
      const typeMap: Record<string, string> = {
        PAN_IMAGE: 'PAN', PAN: 'PAN',
        GST_IMAGE: 'GST', GST: 'GST',
        AADHAR_FRONT: 'AADHAAR', AADHAR_BACK: 'AADHAAR', AADHAR: 'AADHAAR',
        AADHAAR_FRONT: 'AADHAAR', AADHAAR_BACK: 'AADHAAR', AADHAAR: 'AADHAAR',
        FSSAI_IMAGE: 'FSSAI', FSSAI: 'FSSAI',
        PHARMACIST_CERTIFICATE: 'PHARMACIST_CERTIFICATE',
        PHARMACY_COUNCIL_REGISTRATION: 'PHARMACY_COUNCIL_REGISTRATION',
        DRUG_LICENSE_IMAGE: 'DRUG_LICENSE', DRUG_LICENSE: 'DRUG_LICENSE',
        SHOP_ESTABLISHMENT_IMAGE: 'SHOP_ESTABLISHMENT', SHOP_ESTABLISHMENT: 'SHOP_ESTABLISHMENT',
        TRADE_LICENSE_IMAGE: 'TRADE_LICENSE', TRADE_LICENSE: 'TRADE_LICENSE',
        UDYAM_IMAGE: 'UDYAM', UDYAM: 'UDYAM',
        OTHER_IMAGE: 'OTHER', OTHER: 'OTHER',
        BANK_PROOF: 'BANK_PROOF',
      };
      // Merge all document data into a single object for this store
      const docRow: any = { store_id: storeData.id };
      documentUrls.forEach((doc: any) => {
        const docType = typeMap[doc.type] || doc.type;
        if (docType === 'PAN' && (doc.number || doc.pan_number || doc.url)) {
          docRow.pan_document_number = doc.number || doc.pan_number || null;
          docRow.pan_document_url = doc.url || null;
          docRow.pan_document_name = doc.name || null;
        }
        if (docType === 'GST' && (doc.number || doc.gst_number || doc.url)) {
          docRow.gst_document_number = doc.number || doc.gst_number || null;
          docRow.gst_document_url = doc.url || null;
          docRow.gst_document_name = doc.name || null;
        }
        if (docType === 'AADHAAR' && (doc.number || doc.aadhar_number || doc.aadhaar_number || doc.url)) {
          docRow.aadhaar_document_number = doc.number || doc.aadhar_number || doc.aadhaar_number || null;
          docRow.aadhaar_document_url = doc.url || null;
          docRow.aadhaar_document_name = doc.name || null;
        }
        if (docType === 'FSSAI' && (doc.number || doc.url)) {
          docRow.fssai_document_number = doc.number || null;
          docRow.fssai_document_url = doc.url || null;
          docRow.fssai_document_name = doc.name || null;
          docRow.fssai_issued_date = doc.issued_date || null;
          docRow.fssai_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'TRADE_LICENSE' && (doc.number || doc.url)) {
          docRow.trade_license_document_number = doc.number || null;
          docRow.trade_license_document_url = doc.url || null;
          docRow.trade_license_document_name = doc.name || null;
          docRow.trade_license_issued_date = doc.issued_date || null;
          docRow.trade_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'DRUG_LICENSE' && (doc.number || doc.url)) {
          docRow.drug_license_document_number = doc.number || null;
          docRow.drug_license_document_url = doc.url || null;
          docRow.drug_license_document_name = doc.name || null;
          docRow.drug_license_type = doc.drug_license_type || null;
          docRow.drug_license_issued_date = doc.issued_date || null;
          docRow.drug_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'SHOP_ESTABLISHMENT' && (doc.number || doc.url)) {
          docRow.shop_establishment_document_number = doc.number || null;
          docRow.shop_establishment_document_url = doc.url || null;
          docRow.shop_establishment_document_name = doc.name || null;
          docRow.shop_establishment_issued_date = doc.issued_date || null;
          docRow.shop_establishment_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'UDYAM' && (doc.number || doc.url)) {
          docRow.udyam_document_number = doc.number || null;
          docRow.udyam_document_url = doc.url || null;
          docRow.udyam_document_name = doc.name || null;
          docRow.udyam_issued_date = doc.issued_date || null;
          docRow.udyam_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACIST_CERTIFICATE' && (doc.number || doc.url)) {
          docRow.pharmacist_certificate_document_number = doc.number || null;
          docRow.pharmacist_certificate_document_url = doc.url || null;
          docRow.pharmacist_certificate_document_name = doc.name || null;
          docRow.pharmacist_certificate_issued_date = doc.issued_date || null;
          docRow.pharmacist_certificate_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACY_COUNCIL_REGISTRATION' && (doc.number || doc.url)) {
          docRow.pharmacy_council_registration_document_number = doc.number || null;
          docRow.pharmacy_council_registration_document_url = doc.url || null;
          docRow.pharmacy_council_registration_document_name = doc.name || null;
          docRow.pharmacy_council_registration_type = doc.pharmacy_council_registration_type || null;
          docRow.pharmacy_council_registration_issued_date = doc.issued_date || null;
          docRow.pharmacy_council_registration_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'BANK_PROOF' && (doc.number || doc.url)) {
          docRow.bank_proof_document_number = doc.number || null;
          docRow.bank_proof_document_url = doc.url || null;
          docRow.bank_proof_document_name = doc.name || null;
          docRow.bank_proof_issued_date = doc.issued_date || null;
          docRow.bank_proof_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'OTHER' && (doc.number || doc.url)) {
          docRow.other_document_number = doc.number || null;
          docRow.other_document_url = doc.url || null;
          docRow.other_document_name = doc.name || null;
          docRow.other_document_type = doc.otherType || doc.type || 'OTHER';
          docRow.other_issued_date = doc.issued_date || null;
          docRow.other_expiry_date = doc.expiry_date || null;
        }
      });
      // Upsert (insert or update) one row per store_id
      if (Object.keys(docRow).length > 1) {
        const { error: docError } = await supabaseAdmin
          .from('merchant_store_documents')
          .upsert([docRow], { onConflict: 'store_id' });
        if (docError) throw new Error(docError.message);
      }

          return NextResponse.json({ success: true, storeId });
        }
      } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Registration failed' }, { status: 500 });
      }
    }
