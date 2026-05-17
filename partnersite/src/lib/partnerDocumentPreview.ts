import { normalizeR2ObjectKey, toStoredDocumentUrl } from '@/lib/r2';

/** Partner-safe URL for viewing R2 / stored documents (proxy, no expiring signed URLs). */
export function partnerDocumentPreviewHref(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.includes('://')) {
    return `/api/attachments/proxy?url=${encodeURIComponent(t)}`;
  }
  return toStoredDocumentUrl(t) ?? `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(t))}`;
}

export type PartnerDocumentKind = 'image' | 'pdf' | 'unknown';

export function partnerDocumentKindFromUrl(url: string, rawHint?: string | null): PartnerDocumentKind {
  const combined = `${url} ${rawHint ?? ''}`.toLowerCase();
  if (/\.(png|jpe?g|webp)(\?|$|#)/i.test(combined) || combined.includes('image/')) {
    return 'image';
  }
  if (/\.pdf(\?|$|#)/i.test(combined) || combined.includes('application/pdf')) {
    return 'pdf';
  }
  return 'unknown';
}
