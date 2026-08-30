/**
 * Merchant store licence / document expiry — blocks store OPEN until renewed & verified.
 */

import { istTodayKey } from '@/lib/merchant-wallet-resolve';

export const LICENSE_CLOSE_REASON = 'Licence expired';
export const LICENSE_UNAVAILABLE_REASON = 'license_expired';
export const LICENSE_RESTRICTION_TYPE = 'license';

export type MerchantDocumentPrefix =
  | 'pan'
  | 'gst'
  | 'aadhaar'
  | 'fssai'
  | 'drug_license'
  | 'shop_establishment'
  | 'trade_license'
  | 'udyam'
  | 'pharmacist_certificate'
  | 'pharmacy_council_registration'
  | 'other';

export const MERCHANT_DOCUMENT_PREFIXES: MerchantDocumentPrefix[] = [
  'pan',
  'gst',
  'aadhaar',
  'fssai',
  'drug_license',
  'shop_establishment',
  'trade_license',
  'udyam',
  'pharmacist_certificate',
  'pharmacy_council_registration',
  'other',
];

export type LicenseDocumentStatus = {
  prefix: MerchantDocumentPrefix;
  label: string;
  document_number: string | null;
  document_url: string | null;
  back_document_url: string | null;
  expiry_date: string | null;
  is_expired: boolean;
  is_verified: boolean;
  renewal_pending: boolean;
  status: 'ok' | 'expired' | 'pending_verification' | 'expiring_soon';
};

/** Full name shown in renewal modal / alerts */
export const DOCUMENT_FORMAL_NAMES: Record<MerchantDocumentPrefix, string> = {
  pan: 'PAN Card',
  gst: 'GST Certificate',
  aadhaar: 'Aadhaar Card',
  fssai: 'FSSAI Licence',
  drug_license: 'Drug Licence',
  shop_establishment: 'Shop & Establishment Licence',
  trade_license: 'Trade Licence',
  udyam: 'Udyam Registration',
  pharmacist_certificate: 'Pharmacist Certificate',
  pharmacy_council_registration: 'Pharmacy Council Registration',
  other: 'Other Licence',
};

export type DocumentUploadSpec = {
  requires_front: boolean;
  requires_back: boolean;
};

export type LicenseDocumentActionItem = LicenseDocumentStatus & {
  display_title: string;
  status_label: string;
  upload_spec: DocumentUploadSpec;
};

export type MerchantLicenseEvaluation = {
  blocked: boolean;
  can_manual_open: boolean;
  expired: LicenseDocumentStatus[];
  pending_verification: LicenseDocumentStatus[];
  /** Expiring within 30 days — proactive renewal (does not block until expired). */
  expiring_soon: LicenseDocumentStatus[];
  documents: LicenseDocumentStatus[];
};

export const LICENSE_RENEWAL_BLOCKED_MESSAGE =
  'You cannot go online until the expired documents are re-uploaded and verified by GatiMitra.';

const LABELS: Record<MerchantDocumentPrefix, string> = {
  pan: 'PAN',
  gst: 'GST',
  aadhaar: 'Aadhaar',
  fssai: 'FSSAI',
  drug_license: 'Drug licence',
  shop_establishment: 'Shop establishment',
  trade_license: 'Trade licence',
  udyam: 'Udyam',
  pharmacist_certificate: 'Pharmacist certificate',
  pharmacy_council_registration: 'Pharmacy council registration',
  other: 'Other licence',
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

function expiryDateKey(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function readRenewalPending(row: Record<string, unknown>, prefix: MerchantDocumentPrefix): boolean {
  const metaKey = `${prefix}_document_metadata`;
  const meta = row[metaKey];
  if (!meta || typeof meta !== 'object') return false;
  return (meta as { renewal_pending?: boolean }).renewal_pending === true;
}

function hasDocumentOnFile(row: Record<string, unknown>, prefix: MerchantDocumentPrefix): boolean {
  return !!(readStr(row, `${prefix}_document_number`) || readStr(row, `${prefix}_document_url`));
}

function readBackDocumentUrl(row: Record<string, unknown>, prefix: MerchantDocumentPrefix): string | null {
  if (prefix !== 'aadhaar') return null;
  const meta = row.aadhaar_document_metadata;
  if (!meta || typeof meta !== 'object') return null;
  const back = (meta as { back_url?: unknown }).back_url;
  return typeof back === 'string' && back.trim() !== '' ? back.trim() : null;
}

export function evaluateMerchantLicenseCompliance(
  docRow: Record<string, unknown> | null | undefined,
  todayKey: string = istTodayKey()
): MerchantLicenseEvaluation {
  const row = docRow ?? {};
  const documents: LicenseDocumentStatus[] = [];
  const expired: LicenseDocumentStatus[] = [];
  const pending_verification: LicenseDocumentStatus[] = [];

  for (const prefix of MERCHANT_DOCUMENT_PREFIXES) {
    if (!hasDocumentOnFile(row, prefix)) continue;

    const expiryRaw = readStr(row, `${prefix}_expiry_date`);
    const expiryKey = expiryDateKey(expiryRaw);
    const flaggedExpired = readBool(row, `${prefix}_is_expired`);
    const isVerified = readBool(row, `${prefix}_is_verified`);
    const renewalPending = readRenewalPending(row, prefix);

    const expiredByDate = expiryKey != null && expiryKey < todayKey;
    const isExpired = flaggedExpired || expiredByDate;

    const expiresToday = expiryKey != null && expiryKey === todayKey;
    const soonCutoff = expiryKey != null ? addDaysToYmd(todayKey, LICENSE_EXPIRING_SOON_DAYS) : null;
    const isExpiringSoon =
      !isExpired &&
      expiryKey != null &&
      (expiresToday || (expiryKey > todayKey && soonCutoff != null && expiryKey <= soonCutoff));

    let status: LicenseDocumentStatus['status'] = 'ok';
    if (isExpired) status = 'expired';
    else if (renewalPending && !isVerified) status = 'pending_verification';
    else if (isExpiringSoon) status = 'expiring_soon';

    const entry: LicenseDocumentStatus = {
      prefix,
      label: LABELS[prefix],
      document_number: readStr(row, `${prefix}_document_number`),
      document_url: readStr(row, `${prefix}_document_url`),
      back_document_url: readBackDocumentUrl(row, prefix),
      expiry_date: expiryKey,
      is_expired: isExpired,
      is_verified: isVerified,
      renewal_pending: renewalPending,
      status,
    };
    documents.push(entry);
    if (status === 'expired') expired.push(entry);
    if (status === 'pending_verification') pending_verification.push(entry);
  }

  const expiring_soon = documents.filter((d) => d.status === 'expiring_soon');
  const blocked = expired.length > 0 || pending_verification.length > 0;

  return {
    blocked,
    can_manual_open: !blocked,
    expired,
    pending_verification,
    expiring_soon,
    documents,
  };
}

export function formatLicenseExpiryDisplay(expiryDateYmd: string | null): string {
  if (!expiryDateYmd) return '—';
  try {
    const [y, m, d] = expiryDateYmd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return expiryDateYmd;
  }
}

export function getDocumentUploadSpec(
  prefix: MerchantDocumentPrefix,
  row?: Record<string, unknown> | null
): DocumentUploadSpec {
  if (prefix === 'aadhaar') {
    const meta = row?.aadhaar_document_metadata;
    let hasBackOnFile = false;
    if (meta && typeof meta === 'object') {
      const back = (meta as { back_url?: unknown }).back_url;
      hasBackOnFile = typeof back === 'string' && back.trim() !== '';
    }
    return { requires_front: true, requires_back: hasBackOnFile };
  }
  return { requires_front: true, requires_back: false };
}

export function documentActionStatusLabel(doc: LicenseDocumentStatus, todayKey: string = istTodayKey()): string {
  if (doc.status === 'expired') return 'Expired';
  if (doc.status === 'pending_verification') return 'Pending Gatimitra verification';
  if (doc.status === 'expiring_soon') {
    if (doc.expiry_date === todayKey) return 'Expires today';
    return 'Expiring soon';
  }
  if (doc.is_verified) return 'Verified';
  return 'Pending verification';
}

export function documentActionDisplayTitle(doc: LicenseDocumentStatus, todayKey: string = istTodayKey()): string {
  const name = DOCUMENT_FORMAL_NAMES[doc.prefix] ?? doc.label;
  if (doc.status === 'expired') return `${name} expired`;
  if (doc.status === 'pending_verification') return `${name} — awaiting verification`;
  if (doc.status === 'expiring_soon') {
    if (doc.expiry_date === todayKey) return `${name} — expires today`;
    return `${name} — expiring soon`;
  }
  return name;
}

export function enrichDocumentActionItem(
  doc: LicenseDocumentStatus,
  row?: Record<string, unknown> | null
): LicenseDocumentActionItem {
  return {
    ...doc,
    display_title: documentActionDisplayTitle(doc),
    status_label: documentActionStatusLabel(doc),
    upload_spec: getDocumentUploadSpec(doc.prefix, row),
  };
}

export function enrichLicenseEvaluation(
  evaluation: MerchantLicenseEvaluation,
  row?: Record<string, unknown> | null
): {
  evaluation: MerchantLicenseEvaluation;
  action_items: LicenseDocumentActionItem[];
  uploadable_items: LicenseDocumentActionItem[];
} {
  const action_items = [...evaluation.expired, ...evaluation.pending_verification, ...evaluation.expiring_soon].map(
    (d) => enrichDocumentActionItem(d, row)
  );
  const uploadable_items = [...evaluation.expired, ...evaluation.expiring_soon].map((d) =>
    enrichDocumentActionItem(d, row)
  );
  return { evaluation, action_items, uploadable_items };
}

/** Patch `*_is_expired` flags from expiry dates (IST calendar day). */
export function buildLicenseExpiryFlagUpdates(
  docRow: Record<string, unknown> | null | undefined,
  todayKey: string = istTodayKey()
): Record<string, boolean> {
  const row = docRow ?? {};
  const patch: Record<string, boolean> = {};
  for (const prefix of MERCHANT_DOCUMENT_PREFIXES) {
    if (!hasDocumentOnFile(row, prefix)) continue;
    const expiryKey = expiryDateKey(readStr(row, `${prefix}_expiry_date`));
    if (expiryKey == null) continue;
    patch[`${prefix}_is_expired`] = expiryKey < todayKey;
  }
  return patch;
}

export function renewalMetadataPatch(existingMeta?: Record<string, unknown> | null): Record<string, unknown> {
  const existing = existingMeta && typeof existingMeta === 'object' ? existingMeta : {};
  return {
    ...existing,
    renewal_pending: true,
    renewal_submitted_at: new Date().toISOString(),
  };
}

export const LICENSE_ONLINE_BLOCKED_TOAST =
  "Can't go online until your new licence is verified by Gatimitra.";

export const MANUAL_LOCK_LICENSE_BLOCKED_MESSAGE =
  'Manual activation lock cannot be changed while the store is closed due to an expired licence. Upload and verify your licence first.';

/** True when store was forced offline for licence expiry / pending renewal verification. */
export function isStoreOfflineDueToLicense(data: {
  license_blocked?: boolean;
  unavailable_reason?: string | null;
  restriction_type?: string | null;
  close_reason?: string | null;
}): boolean {
  if (data.license_blocked === true) return true;
  const unavail = String(data.unavailable_reason ?? '')
    .trim()
    .toLowerCase();
  if (unavail === LICENSE_UNAVAILABLE_REASON) return true;
  const rt = String(data.restriction_type ?? '')
    .trim()
    .toLowerCase();
  if (rt === LICENSE_RESTRICTION_TYPE) return true;
  if (String(data.close_reason ?? '').trim() === LICENSE_CLOSE_REASON) return true;
  return false;
}

/** Show countdown + renew CTA when expiry is within this many IST calendar days (inclusive). */
export const LICENSE_EXPIRING_SOON_DAYS = 30;

export type DocumentExpiryUiState = {
  badge:
    | 'verified'
    | 'expired'
    | 'pending'
    | 'pending_verification'
    | 'expiring_soon'
    | 'expires_today';
  badgeLabel: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiresToday: boolean;
  showRenewCta: boolean;
  countdownLabel: string | null;
};

export function expiryDateKeyFromRaw(raw: string | null | undefined): string | null {
  return expiryDateKey(raw ?? null);
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function endOfIstDayMs(ymd: string): number {
  return new Date(`${ymd}T23:59:59+05:30`).getTime();
}

export function formatLicenseCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'Expired';
  const days = Math.floor(msRemaining / 86_400_000);
  const hours = Math.floor((msRemaining % 86_400_000) / 3_600_000);
  const mins = Math.floor((msRemaining % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getDocumentExpiryUiState(args: {
  expiryDate: string | null | undefined;
  isVerified?: boolean | null;
  isExpiredFlag?: boolean | null;
  renewalPending?: boolean | null;
  todayKey?: string;
  nowMs?: number;
}): DocumentExpiryUiState {
  const todayKey = args.todayKey ?? istTodayKey();
  const nowMs = args.nowMs ?? Date.now();
  const expiryKey = expiryDateKeyFromRaw(args.expiryDate ?? null);
  const isVerified = args.isVerified === true;
  const renewalPending = args.renewalPending === true;

  const expiredByDate = expiryKey != null && expiryKey < todayKey;
  const isExpired = args.isExpiredFlag === true || expiredByDate;

  if (isExpired) {
    return {
      badge: 'expired',
      badgeLabel: 'Expired',
      isExpired: true,
      isExpiringSoon: false,
      expiresToday: false,
      showRenewCta: true,
      countdownLabel: null,
    };
  }

  if (renewalPending && !isVerified) {
    return {
      badge: 'pending_verification',
      badgeLabel: 'Pending verification',
      isExpired: false,
      isExpiringSoon: false,
      expiresToday: false,
      showRenewCta: false,
      countdownLabel: null,
    };
  }

  if (!expiryKey) {
    return {
      badge: isVerified ? 'verified' : 'pending',
      badgeLabel: isVerified ? 'Verified' : 'Pending',
      isExpired: false,
      isExpiringSoon: false,
      expiresToday: false,
      showRenewCta: false,
      countdownLabel: null,
    };
  }

  const expiresToday = expiryKey === todayKey;
  const soonCutoff = addDaysToYmd(todayKey, LICENSE_EXPIRING_SOON_DAYS);
  const isExpiringSoon = expiryKey > todayKey && expiryKey <= soonCutoff;
  const msLeft = endOfIstDayMs(expiryKey) - nowMs;

  if (expiresToday) {
    return {
      badge: 'expires_today',
      badgeLabel: 'Expires today',
      isExpired: false,
      isExpiringSoon: true,
      expiresToday: true,
      showRenewCta: true,
      countdownLabel: formatLicenseCountdown(msLeft),
    };
  }

  if (isExpiringSoon) {
    return {
      badge: 'expiring_soon',
      badgeLabel: 'Expiring soon',
      isExpired: false,
      isExpiringSoon: true,
      expiresToday: false,
      showRenewCta: true,
      countdownLabel: formatLicenseCountdown(msLeft),
    };
  }

  return {
    badge: isVerified ? 'verified' : 'pending',
    badgeLabel: isVerified ? 'Verified' : 'Pending',
    isExpired: false,
    isExpiringSoon: false,
    expiresToday: false,
    showRenewCta: false,
    countdownLabel: null,
  };
}

export function readRenewalPendingFromRow(
  row: Record<string, unknown>,
  prefix: MerchantDocumentPrefix
): boolean {
  return readRenewalPending(row, prefix);
}

export const PROFILE_LEGAL_DOC_CONFIG: {
  prefix: MerchantDocumentPrefix;
  label: string;
  numberKey: string;
  holderKey?: string;
  expiryKey: string;
  urlKey: string;
  verifiedKey: string;
  expiredKey: string;
  metaKey: string;
  typeKey?: string;
}[] = [
  {
    prefix: 'pan',
    label: 'PAN',
    numberKey: 'pan_document_number',
    holderKey: 'pan_holder_name',
    expiryKey: 'pan_expiry_date',
    urlKey: 'pan_document_url',
    verifiedKey: 'pan_is_verified',
    expiredKey: 'pan_is_expired',
    metaKey: 'pan_document_metadata',
  },
  {
    prefix: 'gst',
    label: 'GST',
    numberKey: 'gst_document_number',
    expiryKey: 'gst_expiry_date',
    urlKey: 'gst_document_url',
    verifiedKey: 'gst_is_verified',
    expiredKey: 'gst_is_expired',
    metaKey: 'gst_document_metadata',
  },
  {
    prefix: 'aadhaar',
    label: 'Aadhaar',
    numberKey: 'aadhaar_document_number',
    holderKey: 'aadhaar_holder_name',
    expiryKey: 'aadhaar_expiry_date',
    urlKey: 'aadhaar_document_url',
    verifiedKey: 'aadhaar_is_verified',
    expiredKey: 'aadhaar_is_expired',
    metaKey: 'aadhaar_document_metadata',
  },
  {
    prefix: 'fssai',
    label: 'FSSAI',
    numberKey: 'fssai_document_number',
    expiryKey: 'fssai_expiry_date',
    urlKey: 'fssai_document_url',
    verifiedKey: 'fssai_is_verified',
    expiredKey: 'fssai_is_expired',
    metaKey: 'fssai_document_metadata',
  },
  {
    prefix: 'trade_license',
    label: 'Trade License',
    numberKey: 'trade_license_document_number',
    expiryKey: 'trade_license_expiry_date',
    urlKey: 'trade_license_document_url',
    verifiedKey: 'trade_license_is_verified',
    expiredKey: 'trade_license_is_expired',
    metaKey: 'trade_license_document_metadata',
  },
  {
    prefix: 'other',
    label: 'Other Document',
    numberKey: 'other_document_number',
    expiryKey: 'other_expiry_date',
    urlKey: 'other_document_url',
    verifiedKey: 'other_is_verified',
    expiredKey: 'other_is_expired',
    metaKey: 'other_document_metadata',
    typeKey: 'other_document_type',
  },
];
