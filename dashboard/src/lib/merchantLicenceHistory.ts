import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MERCHANT_DOCUMENT_PREFIXES,
  type MerchantDocumentPrefix,
} from '@/lib/merchantLicenseExpiry';

export type LicenceVerificationStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type MerchantLicenceHistoryRow = {
  id: number;
  store_id: number;
  parent_id: number | null;
  licence_type: string;
  licence_number: string | null;
  file_url: string;
  file_name: string | null;
  back_file_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
  uploaded_at: string;
  verification_status: LicenceVerificationStatus;
  is_active: boolean;
  is_expired: boolean;
  replaced_by: number | null;
  previous_licence_id: number | null;
  document_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function readStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function readBool(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

function readMeta(row: Record<string, unknown>, prefix: MerchantDocumentPrefix): Record<string, unknown> {
  const meta = row[`${prefix}_document_metadata`];
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

function verificationFromFlat(
  row: Record<string, unknown>,
  prefix: MerchantDocumentPrefix
): LicenceVerificationStatus {
  if (readBool(row, `${prefix}_is_expired`)) return 'expired';
  if (readBool(row, `${prefix}_is_verified`)) return 'verified';
  const meta = readMeta(row, prefix);
  if (meta.renewal_pending === true) return 'pending';
  const reason = readStr(row, `${prefix}_rejection_reason`);
  if (reason) return 'rejected';
  return 'pending';
}

function hasFileOnFlat(row: Record<string, unknown>, prefix: MerchantDocumentPrefix): boolean {
  return !!readStr(row, `${prefix}_document_url`);
}

async function deactivateActiveLicences(
  db: SupabaseClient,
  storeId: number,
  prefix: MerchantDocumentPrefix,
  nowIso: string
): Promise<number | null> {
  const { data: activeRows } = await db
    .from('merchant_licence_history')
    .select('id')
    .eq('store_id', storeId)
    .eq('licence_type', prefix)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  const ids = (activeRows ?? []).map((r) => Number(r.id)).filter(Number.isFinite);
  if (ids.length === 0) return null;

  const previousId = ids[0];
  await db
    .from('merchant_licence_history')
    .update({
      is_active: false,
      is_expired: true,
      verification_status: 'expired',
      updated_at: nowIso,
    })
    .in('id', ids);

  return previousId;
}

/** Ensure flat-row snapshot exists in history before it is replaced (never delete). */
async function ensureFlatSnapshotInHistory(
  db: SupabaseClient,
  storeId: number,
  parentId: number | null,
  prefix: MerchantDocumentPrefix,
  existing: Record<string, unknown>,
  previousLicenceId: number | null
): Promise<number | null> {
  const fileUrl = readStr(existing, `${prefix}_document_url`);
  if (!fileUrl) return previousLicenceId;

  const { data: byUrl } = await db
    .from('merchant_licence_history')
    .select('id')
    .eq('store_id', storeId)
    .eq('licence_type', prefix)
    .eq('file_url', fileUrl)
    .maybeSingle();

  if (byUrl?.id != null) {
    return Number(byUrl.id);
  }

  const meta = readMeta(existing, prefix);
  const backUrl = typeof meta.back_url === 'string' && meta.back_url.trim() ? meta.back_url.trim() : null;
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await db
    .from('merchant_licence_history')
    .insert({
      store_id: storeId,
      parent_id: parentId,
      licence_type: prefix,
      licence_number: readStr(existing, `${prefix}_document_number`),
      file_url: fileUrl,
      file_name: readStr(existing, `${prefix}_document_name`),
      back_file_url: backUrl,
      issued_at: readStr(existing, `${prefix}_issued_date`) ?? readStr(existing, `${prefix}_issue_date`),
      expires_at: readStr(existing, `${prefix}_expiry_date`),
      uploaded_at:
        readStr(existing, `${prefix}_updated_at`) ??
        readStr(existing, `${prefix}_created_at`) ??
        nowIso,
      verification_status: verificationFromFlat(existing, prefix),
      is_active: false,
      is_expired: readBool(existing, `${prefix}_is_expired`) || true,
      previous_licence_id: previousLicenceId,
      document_metadata: meta,
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[merchantLicenceHistory] ensure flat snapshot', prefix, error);
    return previousLicenceId;
  }

  return inserted?.id != null ? Number(inserted.id) : previousLicenceId;
}

export type InsertLicenceVersionArgs = {
  storeId: number;
  parentId?: number | null;
  prefix: MerchantDocumentPrefix;
  fileUrl: string;
  fileName?: string | null;
  backFileUrl?: string | null;
  licenceNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  documentMetadata?: Record<string, unknown>;
  previousLicenceId?: number | null;
};

export async function insertLicenceHistoryVersion(
  db: SupabaseClient,
  args: InsertLicenceVersionArgs
): Promise<{ id: number | null; previousId: number | null }> {
  const nowIso = new Date().toISOString();
  const previousId = args.previousLicenceId ?? null;

  const { data: inserted, error } = await db
    .from('merchant_licence_history')
    .insert({
      store_id: args.storeId,
      parent_id: args.parentId ?? null,
      licence_type: args.prefix,
      licence_number: args.licenceNumber ?? null,
      file_url: args.fileUrl,
      file_name: args.fileName ?? null,
      back_file_url: args.backFileUrl ?? null,
      issued_at: args.issuedAt ?? null,
      expires_at: args.expiresAt ?? null,
      uploaded_at: nowIso,
      verification_status: 'pending',
      is_active: true,
      is_expired: false,
      previous_licence_id: previousId,
      document_metadata: args.documentMetadata ?? {},
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[merchantLicenceHistory] insert version', args.prefix, error);
    return { id: null, previousId };
  }

  const newId = inserted?.id != null ? Number(inserted.id) : null;
  if (newId != null && previousId != null) {
    await db
      .from('merchant_licence_history')
      .update({ replaced_by: newId, updated_at: nowIso })
      .eq('id', previousId);
  }

  return { id: newId, previousId };
}

export async function listLicenceHistoryForStore(
  db: SupabaseClient,
  storeId: number,
  licenceType?: MerchantDocumentPrefix
): Promise<MerchantLicenceHistoryRow[]> {
  let q = db
    .from('merchant_licence_history')
    .select('*')
    .eq('store_id', storeId)
    .order('uploaded_at', { ascending: false });

  if (licenceType) {
    q = q.eq('licence_type', licenceType);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[merchantLicenceHistory] list', error);
    return [];
  }

  return (data ?? []) as MerchantLicenceHistoryRow[];
}

export async function listLicenceHistoryGrouped(
  db: SupabaseClient,
  storeId: number
): Promise<Partial<Record<MerchantDocumentPrefix, MerchantLicenceHistoryRow[]>>> {
  const rows = await listLicenceHistoryForStore(db, storeId);
  const grouped: Partial<Record<MerchantDocumentPrefix, MerchantLicenceHistoryRow[]>> = {};
  for (const p of MERCHANT_DOCUMENT_PREFIXES) {
    grouped[p] = [];
  }
  for (const row of rows) {
    const t = row.licence_type as MerchantDocumentPrefix;
    if (MERCHANT_DOCUMENT_PREFIXES.includes(t)) {
      if (!grouped[t]) grouped[t] = [];
      grouped[t]!.push(row);
    }
  }
  return grouped;
}

export function formatHistoryVerificationLabel(status: LicenceVerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    default:
      return 'Pending verification';
  }
}

/** Admin verified the live document — keep history in sync (renewal uploads start as pending). */
export async function markActiveLicenceHistoryVerified(
  db: SupabaseClient,
  storeId: number,
  prefix: MerchantDocumentPrefix
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from('merchant_licence_history')
    .select('id, document_metadata')
    .eq('store_id', storeId)
    .eq('licence_type', prefix)
    .eq('is_active', true);
  if (error || !rows?.length) return;

  for (const row of rows) {
    const meta =
      row.document_metadata && typeof row.document_metadata === 'object'
        ? { ...(row.document_metadata as Record<string, unknown>) }
        : {};
    delete meta.renewal_pending;
    delete meta.renewal_submitted_at;
    await db
      .from('merchant_licence_history')
      .update({
        verification_status: 'verified',
        is_expired: false,
        document_metadata: meta,
        updated_at: nowIso,
      })
      .eq('id', row.id);
  }
}

/** If flat `*_is_verified` is true, heal stale active history rows still marked pending. */
export async function reconcileActiveHistoryWithVerifiedDocs(
  db: SupabaseClient,
  storeId: number,
  prefix?: MerchantDocumentPrefix
): Promise<void> {
  const { data: doc } = await db
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();
  if (!doc) return;
  const row = doc as Record<string, unknown>;
  const prefixes = prefix ? [prefix] : [...MERCHANT_DOCUMENT_PREFIXES];
  for (const p of prefixes) {
    if (readBool(row, `${p}_is_verified`)) {
      await markActiveLicenceHistoryVerified(db, storeId, p);
    }
  }
}

/** Archive current licence, then insert new active version (never overwrites history rows). */
export async function recordLicenceRenewalUpload(
  db: SupabaseClient,
  args: {
    storeId: number;
    parentId?: number | null;
    prefix: MerchantDocumentPrefix;
    existingFlat: Record<string, unknown>;
    fileUrl: string;
    fileName?: string | null;
    backFileUrl?: string | null;
    licenceNumber?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    documentMetadata?: Record<string, unknown>;
    /** Aadhaar back-only follow-up: update active row metadata, no new version. */
    backOnly?: boolean;
  }
): Promise<{ historyId: number | null; previousId: number | null }> {
  const nowIso = new Date().toISOString();

  if (args.backOnly) {
    const { data: active } = await db
      .from('merchant_licence_history')
      .select('id, document_metadata')
      .eq('store_id', args.storeId)
      .eq('licence_type', args.prefix)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active?.id != null) {
      const meta =
        active.document_metadata && typeof active.document_metadata === 'object'
          ? (active.document_metadata as Record<string, unknown>)
          : {};
      await db
        .from('merchant_licence_history')
        .update({
          back_file_url: args.backFileUrl ?? null,
          document_metadata: {
            ...meta,
            ...args.documentMetadata,
            back_url: args.backFileUrl,
          },
          updated_at: nowIso,
        })
        .eq('id', active.id);
      return { historyId: Number(active.id), previousId: null };
    }
    return { historyId: null, previousId: null };
  }

  if (!hasFileOnFlat(args.existingFlat, args.prefix) && !args.fileUrl) {
    return { historyId: null, previousId: null };
  }

  let previousId = await deactivateActiveLicences(db, args.storeId, args.prefix, nowIso);
  previousId = await ensureFlatSnapshotInHistory(
    db,
    args.storeId,
    args.parentId ?? null,
    args.prefix,
    args.existingFlat,
    previousId
  );

  const { id } = await insertLicenceHistoryVersion(db, {
    storeId: args.storeId,
    parentId: args.parentId,
    prefix: args.prefix,
    fileUrl: args.fileUrl,
    fileName: args.fileName,
    backFileUrl: args.backFileUrl,
    licenceNumber: args.licenceNumber,
    issuedAt: args.issuedAt,
    expiresAt: args.expiresAt,
    documentMetadata: args.documentMetadata,
    previousLicenceId: previousId,
  });

  return { historyId: id, previousId };
}
