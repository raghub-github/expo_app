import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import {
  MERCHANT_DOCUMENT_PREFIXES,
  renewalMetadataPatch,
  type MerchantDocumentPrefix,
} from '@/lib/merchantLicenseExpiry';
import { recordLicenceRenewalUpload } from '@/lib/merchantLicenceHistory';
import { syncMerchantLicenseCompliance } from '@/lib/syncMerchantLicenseCompliance';
import { toStoredDocumentUrl, uploadWithKey } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DOC_TYPES = MERCHANT_DOCUMENT_PREFIXES;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'file';
}

function extensionFromFile(file: File): string {
  const rawName = file.name || '';
  const fromName = rawName.includes('.') ? rawName.slice(rawName.lastIndexOf('.')).toLowerCase() : '';
  if (fromName && /^[.][a-z0-9]+$/.test(fromName)) return fromName;
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  return '.bin';
}

function parseExpiryDate(raw: string | null): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function buildR2Key(
  parentId: number,
  storeCode: string,
  docType: string,
  ext: string,
  side?: string | null
): string {
  let base = docType;
  if (docType === 'aadhaar') {
    base = side === 'back' ? 'aadhar_back' : 'aadhar_front';
  } else if (docType === 'pharmacy_council_registration') {
    base = 'pharmacy_council';
  }
  return `docs/merchants/${parentId}/stores/${storeCode}/onboarding/documents/${base}_${Date.now()}${ext}`;
}

/**
 * POST multipart:
 * - storeId, docType, file
 * - document_number?, expiry_date (YYYY-MM-DD) — required except aadhaar back-only follow-up
 * - side=front|back (aadhaar only)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const storeIdParam = formData.get('storeId');
    const storeId = storeIdParam != null ? String(storeIdParam).trim() : '';
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
    }

    const docTypeRaw = formData.get('docType');
    const docType = docTypeRaw != null ? String(docTypeRaw).trim() : '';
    if (!DOC_TYPES.includes(docType as MerchantDocumentPrefix)) {
      return NextResponse.json(
        { error: `Invalid docType. Use one of: ${DOC_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    const prefix = docType as MerchantDocumentPrefix;
    const sideRaw = formData.get('side');
    const side =
      sideRaw != null && String(sideRaw).trim() !== '' ? String(sideRaw).trim().toLowerCase() : 'front';
    const isAadhaarBack = prefix === 'aadhaar' && side === 'back';

    const documentNumber = formData.get('document_number');
    const issueRaw = formData.get('issue_date');
    const expiryRaw = formData.get('expiry_date');
    const docNumber =
      documentNumber != null && String(documentNumber).trim() !== ''
        ? String(documentNumber).trim()
        : null;
    const expiryDate = parseExpiryDate(expiryRaw != null ? String(expiryRaw) : null);
    const issueDate = parseExpiryDate(issueRaw != null ? String(issueRaw) : null);

    if (!isAadhaarBack && !expiryDate) {
      return NextResponse.json({ error: 'Valid expiry_date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    if (expiryDate) {
      const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (expiryDate <= todayKey) {
        return NextResponse.json({ error: 'Expiry date must be after today' }, { status: 400 });
      }
    }

    const db = getDb();
    const { data: storeRow, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, store_id, parent_id')
      .eq('id', access.storeIdNum)
      .single();

    if (storeErr || !storeRow?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const parentId = storeRow.parent_id as number;
    const storeCode = String(storeRow.store_id || access.storeIdNum);
    const ext = extensionFromFile(file);
    const r2Key = buildR2Key(parentId, storeCode, prefix, ext, side);
    await uploadWithKey(file, r2Key);
    const storedUrl = toStoredDocumentUrl(r2Key);
    if (!storedUrl) {
      return NextResponse.json({ error: 'Could not build document URL' }, { status: 400 });
    }

    const { data: existingRow } = await db
      .from('merchant_store_documents')
      .select('*')
      .eq('store_id', access.storeIdNum)
      .maybeSingle();

    const existing = (existingRow ?? {}) as Record<string, unknown>;
    const metaKey = `${prefix}_document_metadata`;
    const prevMeta =
      existing && typeof existing === 'object' && metaKey in existing
        ? (existing[metaKey] as Record<string, unknown> | null)
        : null;

    const nowIso = new Date().toISOString();

    if (isAadhaarBack) {
      const mergedMeta = {
        ...(prevMeta && typeof prevMeta === 'object' ? prevMeta : {}),
        back_url: storedUrl,
        renewal_pending: true,
        renewal_submitted_at: nowIso,
      };
      try {
        await recordLicenceRenewalUpload(db, {
          storeId: access.storeIdNum,
          parentId,
          prefix,
          existingFlat: existing,
          fileUrl:
            (existing.aadhaar_document_url != null ? String(existing.aadhaar_document_url).trim() : '') ||
            storedUrl,
          backFileUrl: storedUrl,
          licenceNumber: docNumber,
          expiresAt: expiryDate,
          documentMetadata: mergedMeta,
          backOnly: true,
        });
      } catch (histErr) {
        console.error('[store-documents/upload] history back', histErr);
      }
      const patch: Record<string, unknown> = {
        store_id: access.storeIdNum,
        aadhaar_document_metadata: mergedMeta,
        aadhaar_is_verified: false,
        aadhaar_verified_at: null,
        aadhaar_verified_by: null,
        aadhaar_updated_at: nowIso,
        updated_at: nowIso,
      };
      if (expiryDate) patch.aadhaar_expiry_date = expiryDate;
      if (docNumber) patch.aadhaar_document_number = docNumber;

      const { error: upsertErr } = await db.from('merchant_store_documents').upsert(patch, {
        onConflict: 'store_id',
      });
      if (upsertErr) {
        console.error('[store-documents/upload] aadhaar back', upsertErr);
        return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
      }
    } else {
      const renewalMeta = renewalMetadataPatch(prevMeta);
      try {
        await recordLicenceRenewalUpload(db, {
          storeId: access.storeIdNum,
          parentId,
          prefix,
          existingFlat: existing,
          fileUrl: storedUrl,
          fileName: sanitizeFileName(file.name || prefix),
          licenceNumber: docNumber,
          issuedAt: issueDate,
          expiresAt: expiryDate,
          documentMetadata: renewalMeta as Record<string, unknown>,
        });
      } catch (histErr) {
        console.error('[store-documents/upload] history', histErr);
      }

      const patch: Record<string, unknown> = {
        store_id: access.storeIdNum,
        [`${prefix}_document_url`]: storedUrl,
        [`${prefix}_document_name`]: sanitizeFileName(file.name || prefix),
        [`${prefix}_is_verified`]: false,
        [`${prefix}_verified_at`]: null,
        [`${prefix}_verified_by`]: null,
        [`${prefix}_rejection_reason`]: null,
        [`${prefix}_updated_at`]: nowIso,
        updated_at: nowIso,
        [metaKey]: renewalMeta,
      };
      if (issueDate) patch[`${prefix}_issued_date`] = issueDate;
      if (expiryDate) patch[`${prefix}_expiry_date`] = expiryDate;
      patch[`${prefix}_is_expired`] = false;
      if (docNumber) patch[`${prefix}_document_number`] = docNumber;

      const { error: upsertErr } = await db.from('merchant_store_documents').upsert(patch, {
        onConflict: 'store_id',
      });
      if (upsertErr) {
        console.error('[store-documents/upload]', upsertErr);
        return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
      }
    }

    await syncMerchantLicenseCompliance(db, access.storeIdNum);

    return NextResponse.json({
      success: true,
      document_url: storedUrl,
      docType: prefix,
      side: isAadhaarBack ? 'back' : 'front',
      expiry_date: expiryDate,
      is_verified: false,
      message:
        'Document uploaded. Gatimitra team will verify it before you can go online.',
    });
  } catch (err) {
    console.error('[store-documents/upload]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
