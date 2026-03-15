import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getOnboardingR2Path, getOnboardingDocumentPath, type R2OnboardingDocType } from '@/lib/r2-paths';
import { upsertStoreCuisines } from '@/lib/cuisines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
              // Aadhaar optional for child registration; if provided, images optional
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
  const { uploadToR2, deleteFromR2, extractR2KeyFromUrl, toStoredDocumentUrl, toStoredDocumentUrlSigned } = await import('@/lib/r2');
  // Store proxy URLs (not signed URLs) for banner/gallery so they load in profile regardless of when uploaded
  const toStoredMediaUrl = (value: string | null | undefined): string | null => {
    if (!value || typeof value !== 'string') return null;
    return toStoredDocumentUrl(value) ?? value;
  };
  // Map API document type to R2 onboarding document folder (pan, aadhaar, fssai, gst, bank, pharma, other)
  const toR2DocType = (docType: string): R2OnboardingDocType => {
    if (docType === 'PAN') return 'PAN';
    if (docType === 'GST') return 'GST';
    if (docType === 'AADHAAR') return 'AADHAAR';
    if (docType === 'FSSAI') return 'FSSAI';
    if (docType === 'BANK_PROOF' || docType === 'BANK') return 'BANK';
    if (['PHARMACIST_CERTIFICATE', 'PHARMACY_COUNCIL_REGISTRATION', 'DRUG_LICENSE', 'SHOP_ESTABLISHMENT', 'TRADE_LICENSE', 'UDYAM'].includes(docType)) return 'PHARMA';
    return 'OTHER';
  };
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server misconfiguration: Supabase service role not set' },
        { status: 500 }
      );
    }
    const body = await req.json();
    const { step1, step2, storeSetup, documents, logoUrl, bannerUrl, galleryUrls, menuAssets, documentUrls, parentInfo, agreementAcceptance } = body;
    const composedFullAddress = [
      step2?.unit_number,
      step2?.floor_number,
      step2?.building_name,
      step2?.address_line1,
      step2?.full_address,
    ]
      .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
      .join(', ');
  // If store_type is OTHERS, save 'OTHERS' in store_type and custom type in store_description
  const storeTypeValue = step1.store_type === 'OTHERS' ? 'OTHERS' : step1.store_type;
  const storeDescriptionValue = step1.store_type === 'OTHERS' && step1.custom_store_type
    ? `${step1.store_description || ''} (Custom type: ${step1.custom_store_type})`
    : step1.store_description;

    // Always use parentInfo.id (numeric) for parent_id
    const parentId = parentInfo?.id;
    const parentMerchantId = parentInfo?.parent_merchant_id || step1.parent_merchant_id;
    if (!parentId || !parentMerchantId) throw new Error('Parent info missing');

    const db = getSupabaseAdmin();

    // 1. Get storeId from progress table or generate new one
    let storeId = step1?.__storePublicId || null;
    
    // If no Store ID is provided, check if it exists in the progress table
    if (!storeId) {
      const { data: progressData } = await db
        .from('merchant_store_registration_progress')
        .select('form_data')
        .eq('parent_id', parentId)
        .neq('registration_status', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      storeId = progressData?.form_data?.step_store?.storePublicId || null;
    }
    
    // If still no Store ID, generate a new one (fallback)
    if (!storeId) {
      // Use the database function for consistent Store ID generation
      const { data: generatedId, error: genError } = await db.rpc('generate_unique_store_id');
      if (genError) {
        // Fallback to original logic
        const { data: existingStores, error: idError } = await db
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
        storeId = `GMMC${maxNum + 1}`;
      } else {
        storeId = generatedId;
      }
    }
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
    // --- R2 Document Upload Logic: each document type under onboarding/documents/{pan|aadhaar|fssai|gst|bank|pharma|other} ---
    if (documentUrls && documentUrls.length > 0) {
      for (const doc of documentUrls) {
        const docType: string = typeMap[doc.type] || doc.type;
        const r2DocType = toR2DocType(docType);
        const documentPath = getOnboardingDocumentPath(String(parentMerchantId), storeId ?? undefined, r2DocType);
        const fileName = `${Date.now()}_${doc.name}`;
        const r2Key = `${documentPath}/${fileName}`;
        if (doc.file) {
          await uploadToR2(doc.file, r2Key);
          doc.url = r2Key;
        }
      }
    }

    // 2. Insert or update draft store (one row per child store)
    const draftStoreDbId = step1?.__draftStoreDbId ? Number(step1.__draftStoreDbId) : null;
    // Store proxy URLs (stable, no expiry) so banner/gallery load in merchant profile from onboarding or dashboard
    const logoUrlStored = toStoredMediaUrl(logoUrl) || logoUrl || null;
    const bannerUrlStored = toStoredMediaUrl(bannerUrl) || bannerUrl || null;
    const galleryUrlsStored = Array.isArray(galleryUrls)
      ? galleryUrls.map((u: string) => toStoredMediaUrl(u)).filter((u): u is string => !!u)
      : galleryUrls;
    const storePayload = {
      parent_id: parentId,
      store_name: step1.store_name,
      store_display_name: step1.store_display_name,
      store_description: storeDescriptionValue,
      store_email: step1.store_email,
      store_phones: step1.store_phones,
      full_address: composedFullAddress || step2.full_address,
      landmark: step2.landmark,
      city: step2.city,
      state: step2.state,
      postal_code: step2.postal_code,
      country: step2.country,
      latitude: step2.latitude,
      longitude: step2.longitude,
      logo_url: logoUrlStored,
      banner_url: bannerUrlStored,
      gallery_images: galleryUrlsStored,
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
      onboarding_completed_at: new Date().toISOString(),
      current_onboarding_step: 9,
    };

    let storeData: any = null;
    if (draftStoreDbId) {
      const { data, error } = await db
        .from('merchant_stores')
        .update(storePayload)
        .eq('id', draftStoreDbId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      storeData = data;
    } else {
      const { data, error } = await db
        .from('merchant_stores')
        .insert([{ store_id: storeId, ...storePayload }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      storeData = data;
    }

    // 2.a Ensure cuisines are stored in cuisine_master + merchant_store_cuisines
    if (storeData?.id && Array.isArray(storeSetup.cuisine_types)) {
      try {
        await upsertStoreCuisines(storeData.id as number, storeSetup.cuisine_types as string[]);
      } catch (e) {
        console.error('[register-store] upsertStoreCuisines failed', e);
      }
    }

    // 2.a Persist menu upload references for frequent updates (if media table exists)
    const menuImageUrls: string[] = Array.isArray(menuAssets?.imageUrls) ? menuAssets.imageUrls.filter(Boolean) : [];
    const menuSpreadsheetUrl: string | null = menuAssets?.spreadsheetUrl || null;
    if (menuImageUrls.length > 0 || menuSpreadsheetUrl) {
      const mediaRows: any[] = [];
      menuImageUrls.forEach((url, idx) => {
        const key = typeof url === 'string' ? (extractR2KeyFromUrl(url) || (url.includes('://') ? null : url.replace(/^\/+/, '')) || url) : null;
        const publicUrl = key ? (toStoredDocumentUrl(key) ?? url) : url;
        mediaRows.push({
          store_id: storeData.id,
          media_scope: 'MENU_REFERENCE',
          source_entity: 'ONBOARDING_MENU_IMAGE',
          source_entity_id: null,
          original_file_name: `menu_image_${idx + 1}`,
          r2_key: key,
          public_url: publicUrl,
          mime_type: 'image/*',
          is_active: true,
          verification_status: 'PENDING',
        });
      });
      if (menuSpreadsheetUrl) {
        const sheetKey = typeof menuSpreadsheetUrl === 'string' ? (extractR2KeyFromUrl(menuSpreadsheetUrl) || (menuSpreadsheetUrl.includes('://') ? null : menuSpreadsheetUrl.replace(/^\/+/, '')) || menuSpreadsheetUrl) : null;
        const sheetPublicUrl = sheetKey ? (toStoredDocumentUrl(sheetKey) ?? menuSpreadsheetUrl) : menuSpreadsheetUrl;
        mediaRows.push({
          store_id: storeData.id,
          media_scope: 'MENU_REFERENCE',
          source_entity: 'ONBOARDING_MENU_SHEET',
          source_entity_id: null,
          original_file_name: 'menu_spreadsheet',
          r2_key: sheetKey,
          public_url: sheetPublicUrl,
          mime_type: 'application/octet-stream',
          is_active: true,
          verification_status: 'PENDING',
        });
      }
      if (mediaRows.length > 0) {
        try {
          const { data: existingRows } = await db
            .from('merchant_store_media_files')
            .select('id, r2_key, public_url')
            .eq('store_id', storeData.id)
            .eq('media_scope', 'MENU_REFERENCE');
          for (const row of existingRows || []) {
            const key = row.r2_key || extractR2KeyFromUrl(row.public_url || '');
            if (key && typeof key === 'string') {
              try {
                await deleteFromR2(key);
              } catch (e) {
                console.warn('merchant_store_media_files R2 delete failed for key:', key, e);
              }
            }
          }
          await db
            .from('merchant_store_media_files')
            .delete()
            .eq('store_id', storeData.id)
            .eq('media_scope', 'MENU_REFERENCE');
          const { error: mediaInsertError } = await db
            .from('merchant_store_media_files')
            .insert(mediaRows);
          if (mediaInsertError) {
            console.warn('merchant_store_media_files insert skipped:', mediaInsertError.message);
          }
        } catch (mediaError: any) {
          console.warn('merchant_store_media_files insert skipped:', mediaError.message);
        }
      }
    }

    // 3. Insert operating hours (one row per store)
    const hours = storeSetup.store_hours || {};
    const parseMinutes = (v: string | null | undefined) => {
      if (!v) return null;
      const [h, m] = String(v).split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const dayDuration = (d: any) => {
      const closed = !!d?.closed;
      if (closed) return 0;
      const s1 = parseMinutes(d?.slot1_open ?? d?.open);
      const e1 = parseMinutes(d?.slot1_close ?? d?.close);
      const s2 = parseMinutes(d?.slot2_open);
      const e2 = parseMinutes(d?.slot2_close);
      const first = s1 != null && e1 != null && e1 > s1 ? e1 - s1 : 0;
      const second = s2 != null && e2 != null && e2 > s2 ? e2 - s2 : 0;
      return first + second;
    };
    const toTimeOrNull = (v: string | null | undefined): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const dayRow = (d: any) => {
      const closed = !!d?.closed;
      const slot1Start = closed ? null : toTimeOrNull(d?.slot1_open ?? d?.open);
      const slot1End = closed ? null : toTimeOrNull(d?.slot1_close ?? d?.close);
      const slot2Start = closed ? null : toTimeOrNull(d?.slot2_open);
      const slot2End = closed ? null : toTimeOrNull(d?.slot2_close);
      return {
        open: !!(slot1Start && slot1End),
        slot1Start,
        slot1End,
        slot2Start,
        slot2End,
        duration: dayDuration(d),
        closed,
      };
    };
    const monday = dayRow(hours.monday);
    const tuesday = dayRow(hours.tuesday);
    const wednesday = dayRow(hours.wednesday);
    const thursday = dayRow(hours.thursday);
    const friday = dayRow(hours.friday);
    const saturday = dayRow(hours.saturday);
    const sunday = dayRow(hours.sunday);
    const closedDays = ([
      ['monday', monday.closed],
      ['tuesday', tuesday.closed],
      ['wednesday', wednesday.closed],
      ['thursday', thursday.closed],
      ['friday', friday.closed],
      ['saturday', saturday.closed],
      ['sunday', sunday.closed],
    ] as const)
      .filter(([, isClosed]) => isClosed)
      .map(([day]) => day);
    const sameForAllDays =
      JSON.stringify(monday) === JSON.stringify(tuesday) &&
      JSON.stringify(monday) === JSON.stringify(wednesday) &&
      JSON.stringify(monday) === JSON.stringify(thursday) &&
      JSON.stringify(monday) === JSON.stringify(friday) &&
      JSON.stringify(monday) === JSON.stringify(saturday) &&
      JSON.stringify(monday) === JSON.stringify(sunday);
    const is24Hours = [monday, tuesday, wednesday, thursday, friday, saturday, sunday].every(
      (d) => !d.closed && d.slot1Start === '00:00' && d.slot1End === '23:59' && !d.slot2Start && !d.slot2End
    );
    const opRow = {
      store_id: storeData.id,
      monday_open: monday.open,
      monday_slot1_start: monday.slot1Start,
      monday_slot1_end: monday.slot1End,
      monday_slot2_start: monday.slot2Start,
      monday_slot2_end: monday.slot2End,
      monday_total_duration_minutes: monday.duration,
      tuesday_open: tuesday.open,
      tuesday_slot1_start: tuesday.slot1Start,
      tuesday_slot1_end: tuesday.slot1End,
      tuesday_slot2_start: tuesday.slot2Start,
      tuesday_slot2_end: tuesday.slot2End,
      tuesday_total_duration_minutes: tuesday.duration,
      wednesday_open: wednesday.open,
      wednesday_slot1_start: wednesday.slot1Start,
      wednesday_slot1_end: wednesday.slot1End,
      wednesday_slot2_start: wednesday.slot2Start,
      wednesday_slot2_end: wednesday.slot2End,
      wednesday_total_duration_minutes: wednesday.duration,
      thursday_open: thursday.open,
      thursday_slot1_start: thursday.slot1Start,
      thursday_slot1_end: thursday.slot1End,
      thursday_slot2_start: thursday.slot2Start,
      thursday_slot2_end: thursday.slot2End,
      thursday_total_duration_minutes: thursday.duration,
      friday_open: friday.open,
      friday_slot1_start: friday.slot1Start,
      friday_slot1_end: friday.slot1End,
      friday_slot2_start: friday.slot2Start,
      friday_slot2_end: friday.slot2End,
      friday_total_duration_minutes: friday.duration,
      saturday_open: saturday.open,
      saturday_slot1_start: saturday.slot1Start,
      saturday_slot1_end: saturday.slot1End,
      saturday_slot2_start: saturday.slot2Start,
      saturday_slot2_end: saturday.slot2End,
      saturday_total_duration_minutes: saturday.duration,
      sunday_open: sunday.open,
      sunday_slot1_start: sunday.slot1Start,
      sunday_slot1_end: sunday.slot1End,
      sunday_slot2_start: sunday.slot2Start,
      sunday_slot2_end: sunday.slot2End,
      sunday_total_duration_minutes: sunday.duration,
      is_24_hours: is24Hours,
      same_for_all_days: sameForAllDays,
      closed_days: closedDays,
    };
    // Use upsert to avoid duplicate key errors
    try {
      const { error: opError } = await db
        .from('merchant_store_operating_hours')
        .upsert([opRow], { onConflict: 'store_id' });
      if (opError) {
        // If upsert fails, try update/insert approach
        const { data: existingHours } = await db
          .from('merchant_store_operating_hours')
          .select('id')
          .eq('store_id', storeData.id)
          .maybeSingle();
        
        if (existingHours) {
          // Update existing record
          const { error: updateError } = await db
            .from('merchant_store_operating_hours')
            .update(opRow)
            .eq('store_id', storeData.id);
          if (updateError) throw new Error(updateError.message);
        } else {
          // Insert new record
          const { error: insertError } = await db
            .from('merchant_store_operating_hours')
            .insert([opRow]);
          if (insertError) throw new Error(insertError.message);
        }
      }
    } catch (opError: any) {
      console.error('[register-store] Operating hours error:', opError);
      throw new Error(opError.message || 'Failed to save operating hours');
    }

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
      // Resolve all document URLs to signed URLs (same format as upload response)
      const resolvedDocUrls = await Promise.all(
        (documentUrls || []).map((d: any) => toStoredDocumentUrlSigned(d.url))
      );
      const docRow: any = { store_id: storeData.id };
      (documentUrls || []).forEach((doc: any, i: number) => {
        const docType = typeMap[doc.type] || doc.type;
        const storedUrl = resolvedDocUrls[i] || doc.url || null;
        if (docType === 'PAN' && (doc.number || doc.pan_number || doc.url)) {
          docRow.pan_document_number = doc.number || doc.pan_number || null;
          docRow.pan_document_url = storedUrl || null;
          docRow.pan_document_name = doc.name || null;
        }
        if (docType === 'GST' && (doc.number || doc.gst_number || doc.url)) {
          docRow.gst_document_number = doc.number || doc.gst_number || null;
          docRow.gst_document_url = storedUrl || null;
          docRow.gst_document_name = doc.name || null;
        }
        if (docType === 'AADHAAR' && (doc.number || doc.aadhar_number || doc.aadhaar_number || doc.url)) {
          docRow.aadhaar_document_number = doc.number || doc.aadhar_number || doc.aadhaar_number || null;
          docRow.aadhaar_document_url = storedUrl || null;
          docRow.aadhaar_document_name = doc.name || null;
        }
        if (docType === 'FSSAI' && (doc.number || doc.url)) {
          docRow.fssai_document_number = doc.number || null;
          docRow.fssai_document_url = storedUrl || null;
          docRow.fssai_document_name = doc.name || null;
          docRow.fssai_issued_date = doc.issued_date || null;
          docRow.fssai_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'TRADE_LICENSE' && (doc.number || doc.url)) {
          docRow.trade_license_document_number = doc.number || null;
          docRow.trade_license_document_url = storedUrl || null;
          docRow.trade_license_document_name = doc.name || null;
          docRow.trade_license_issued_date = doc.issued_date || null;
          docRow.trade_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'DRUG_LICENSE' && (doc.number || doc.url)) {
          docRow.drug_license_document_number = doc.number || null;
          docRow.drug_license_document_url = storedUrl || null;
          docRow.drug_license_document_name = doc.name || null;
          docRow.drug_license_type = doc.drug_license_type || null;
          docRow.drug_license_issued_date = doc.issued_date || null;
          docRow.drug_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'SHOP_ESTABLISHMENT' && (doc.number || doc.url)) {
          docRow.shop_establishment_document_number = doc.number || null;
          docRow.shop_establishment_document_url = storedUrl || null;
          docRow.shop_establishment_document_name = doc.name || null;
          docRow.shop_establishment_issued_date = doc.issued_date || null;
          docRow.shop_establishment_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'UDYAM' && (doc.number || doc.url)) {
          docRow.udyam_document_number = doc.number || null;
          docRow.udyam_document_url = storedUrl || null;
          docRow.udyam_document_name = doc.name || null;
          docRow.udyam_issued_date = doc.issued_date || null;
          docRow.udyam_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACIST_CERTIFICATE' && (doc.number || doc.url)) {
          docRow.pharmacist_certificate_document_number = doc.number || null;
          docRow.pharmacist_certificate_document_url = storedUrl || null;
          docRow.pharmacist_certificate_document_name = doc.name || null;
          docRow.pharmacist_certificate_issued_date = doc.issued_date || null;
          docRow.pharmacist_certificate_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACY_COUNCIL_REGISTRATION' && (doc.number || doc.url)) {
          docRow.pharmacy_council_registration_document_number = doc.number || null;
          docRow.pharmacy_council_registration_document_url = storedUrl || null;
          docRow.pharmacy_council_registration_document_name = doc.name || null;
          docRow.pharmacy_council_registration_type = doc.pharmacy_council_registration_type || null;
          docRow.pharmacy_council_registration_issued_date = doc.issued_date || null;
          docRow.pharmacy_council_registration_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'BANK_PROOF' && (doc.number || doc.url)) {
          docRow.bank_proof_document_number = doc.number || null;
          docRow.bank_proof_document_url = storedUrl || null;
          docRow.bank_proof_document_name = doc.name || null;
          docRow.bank_proof_issued_date = doc.issued_date || null;
          docRow.bank_proof_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'OTHER' && (doc.number || doc.url)) {
          docRow.other_document_number = doc.number || null;
          docRow.other_document_url = storedUrl || null;
          docRow.other_document_name = doc.name || null;
          docRow.other_document_type = doc.otherType || doc.type || 'OTHER';
          docRow.other_issued_date = doc.issued_date || null;
          docRow.other_expiry_date = doc.expiry_date || null;
        }
      });
      // Upsert (insert or update) one row per store_id
      if (Object.keys(docRow).length > 1) {
        const { error: docError } = await db
          .from('merchant_store_documents')
          .upsert([docRow], { onConflict: 'store_id' });
        if (docError) throw new Error(docError.message);
      }
    }

    // 5. Persist agreement acceptance with digital signature
    if (agreementAcceptance && agreementAcceptance.signatureDataUrl) {
      const signatureHash = crypto
        .createHash('sha256')
        .update(String(agreementAcceptance.signatureDataUrl))
        .digest('hex');
      const templateSnapshot = {
        title: agreementAcceptance.templateTitle || 'Merchant Partner Agreement',
        version: agreementAcceptance.templateVersion || 'v1',
        content: agreementAcceptance.templateContentSnapshot || null,
        pdf_url: agreementAcceptance.templatePdfUrl || null,
      };
      const ipAddress =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null;
      const userAgent = req.headers.get('user-agent') || null;

      // Resolve the contract PDF to its R2 key, copy it to the correct store path if needed,
      // and always store a proxy URL (never a signed URL) so the contract is permanently accessible.
      let contractPdfUrlStored: string | null = null;
      let contractPdfR2Key: string | null = null;
      if (agreementAcceptance.signedPdfUrl) {
        const rawValue = agreementAcceptance.signedPdfUrl.trim();
        let originalKey = extractR2KeyFromUrl(rawValue) || (rawValue.includes('://') ? null : rawValue.replace(/^\/+/, ''));

        if (originalKey) {
          const correctAgreementsPath = getOnboardingR2Path(String(parentMerchantId), storeId, 'AGREEMENTS');
          const fileName = originalKey.split('/').pop() || `contract_${Date.now()}.pdf`;
          const correctKey = `${correctAgreementsPath}/${fileName}`;

          if (originalKey !== correctKey) {
            try {
              const { S3Client: S3, GetObjectCommand: GetObj, PutObjectCommand: PutObj } = await import('@aws-sdk/client-s3');
              const s3 = new S3({
                region: process.env.R2_REGION || 'auto',
                endpoint: process.env.R2_ENDPOINT,
                credentials: { accessKeyId: process.env.R2_ACCESS_KEY!, secretAccessKey: process.env.R2_SECRET_KEY! },
              });
              const bucket = process.env.R2_BUCKET_NAME!;
              const getResp = await s3.send(new GetObj({ Bucket: bucket, Key: originalKey }));
              if (getResp.Body) {
                const bodyBytes = await getResp.Body.transformToByteArray();
                await s3.send(new PutObj({
                  Bucket: bucket,
                  Key: correctKey,
                  Body: bodyBytes,
                  ContentType: getResp.ContentType || 'application/pdf',
                }));
                originalKey = correctKey;
                console.log(`[register-store] Copied contract PDF to correct path: ${correctKey}`);
              }
            } catch (copyErr) {
              console.warn('[register-store] Could not copy contract PDF to store path, using original key:', copyErr);
            }
          }

          contractPdfR2Key = originalKey;
          contractPdfUrlStored = `/api/attachments/proxy?key=${encodeURIComponent(originalKey)}`;
        }
      }

      const commissionFirst = agreementAcceptance.commissionFirstMonthPct != null ? Number(agreementAcceptance.commissionFirstMonthPct) : 0;
      const commissionSecond = agreementAcceptance.commissionFromSecondMonthPct != null ? Number(agreementAcceptance.commissionFromSecondMonthPct) : 15;
      const effectiveFrom = agreementAcceptance.agreementEffectiveFrom ? new Date(agreementAcceptance.agreementEffectiveFrom).toISOString() : new Date().toISOString();
      const effectiveTo = agreementAcceptance.agreementEffectiveTo ? new Date(agreementAcceptance.agreementEffectiveTo).toISOString() : null;

      const basePayload = {
        store_id: storeData.id,
        template_id: agreementAcceptance.templateId || null,
        template_key: agreementAcceptance.templateKey || 'DEFAULT_CHILD_ONBOARDING_AGREEMENT',
        template_version: agreementAcceptance.templateVersion || 'v1',
        template_snapshot: {
          ...templateSnapshot,
          r2_key: contractPdfR2Key,
          commission_first_month_pct: commissionFirst,
          commission_from_second_month_pct: commissionSecond,
          agreement_effective_from: effectiveFrom,
          agreement_effective_to: effectiveTo,
        },
        contract_pdf_url: contractPdfUrlStored ?? agreementAcceptance.templatePdfUrl ?? null,
        signer_name: agreementAcceptance.signerName || null,
        signer_email: agreementAcceptance.signerEmail || null,
        signer_phone: agreementAcceptance.signerPhone || null,
        signature_data_url: agreementAcceptance.signatureDataUrl,
        signature_hash: signatureHash,
        terms_accepted: !!agreementAcceptance.agreedToTerms,
        contract_read_confirmed: !!agreementAcceptance.agreedToContract,
        accepted_at: new Date().toISOString(),
        accepted_ip: ipAddress,
        user_agent: userAgent,
        acceptance_source: 'CHILD_ONBOARDING',
      };
      const payloadWithCommission = {
        ...basePayload,
        commission_first_month_pct: commissionFirst,
        commission_from_second_month_pct: commissionSecond,
        agreement_effective_from: effectiveFrom,
        agreement_effective_to: effectiveTo,
      };
      let agreementError = (await db.from('merchant_store_agreement_acceptances').upsert([payloadWithCommission], { onConflict: 'store_id' })).error;
      if (agreementError && (agreementError.message?.includes('commission_first_month_pct') || agreementError.message?.includes('does not exist'))) {
        agreementError = (await db.from('merchant_store_agreement_acceptances').upsert([basePayload], { onConflict: 'store_id' })).error;
      }
      if (agreementError) throw new Error(agreementError.message);
    }

    // 6. Mark the registration progress as COMPLETED
    // This prevents the "Incomplete onboarding draft" banner from showing after submission
    try {
      // Update progress record to mark as completed and link to the actual store
      await db
        .from('merchant_store_registration_progress')
        .update({ 
          registration_status: 'COMPLETED',
          store_id: storeData.id, // Link to the actual merchant_stores.id
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          current_step: 9,
          step_6_completed: true, // Mark final step as completed
          completed_steps: 9
        })
        .eq('parent_id', parentId)
        .or(`store_id.is.null,store_id.eq.${storeData.id}`) // Update either null store_id or matching store_id
        .neq('registration_status', 'COMPLETED');
        
      console.log(`[register-store] Marked progress as completed for parent_id: ${parentId}, store_id: ${storeData.id}, public_id: ${storeId}`);
    } catch (progressError) {
      console.warn('[register-store] Failed to mark progress as completed:', progressError);
      // Don't fail the entire registration if this update fails
    }

    return NextResponse.json({ success: true, storeId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Registration failed' }, { status: 500 });
  }
}
