/**
 * Session flag: after the partner closes “Licence under review”, keep a marquee
 * until Gatimitra verifies the uploaded documents.
 */

import { DOCUMENT_FORMAL_NAMES, LICENSE_VERIFY_WAITING_MARQUEE, type MerchantDocumentPrefix } from '@/lib/merchantLicenseExpiry';

export const LICENSE_VERIFY_MARQUEE_EVENT = 'mx-license-verify-marquee';
export const LICENSE_REVIEW_MODAL_EVENT = 'mx-license-review-modal';

const FLAG_PREFIX = 'mx_license_verify_marquee:';
const LABELS_PREFIX = 'mx_license_verify_marquee_labels:';

function flagKey(storeId: string) {
  return `${FLAG_PREFIX}${storeId}`;
}

function labelsKey(storeId: string) {
  return `${LABELS_PREFIX}${storeId}`;
}

export function markLicenseVerifyMarquee(storeId: string, labels: string[] = []) {
  if (!storeId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(flagKey(storeId), '1');
    sessionStorage.setItem(labelsKey(storeId), JSON.stringify(labels.filter(Boolean)));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(LICENSE_VERIFY_MARQUEE_EVENT, { detail: { storeId } }));
}

export function clearLicenseVerifyMarquee(storeId: string) {
  if (!storeId || typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(flagKey(storeId));
    sessionStorage.removeItem(labelsKey(storeId));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(LICENSE_VERIFY_MARQUEE_EVENT, { detail: { storeId } }));
}

export function isLicenseVerifyMarqueeMarked(storeId: string): boolean {
  if (!storeId || typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(flagKey(storeId)) === '1';
  } catch {
    return false;
  }
}

export function readLicenseVerifyMarqueeLabels(storeId: string): string[] {
  if (!storeId || typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(labelsKey(storeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch {
    return [];
  }
}

export function notifyLicenseReviewModalOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LICENSE_REVIEW_MODAL_EVENT, { detail: { open } }));
}

export function labelsFromPendingDocs(
  docs: Array<{ prefix: MerchantDocumentPrefix; label?: string }>
): string[] {
  return docs.map((d) => DOCUMENT_FORMAL_NAMES[d.prefix] ?? d.label ?? '').filter(Boolean);
}

export function buildLicenseVerifyMarqueeText(labels: string[]): string {
  const names = labels.filter(Boolean);
  if (names.length === 0) return LICENSE_VERIFY_WAITING_MARQUEE;
  const docPart =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length > 1 ? 'are' : 'is';
  return `${docPart} ${verb} awaiting Gatimitra verification — you cannot go online until ${names.length > 1 ? 'they are' : 'it is'} verified.`;
}
