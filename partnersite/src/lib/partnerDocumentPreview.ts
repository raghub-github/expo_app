import { extractR2KeyFromUrl, normalizeR2ObjectKey, toStoredDocumentUrl } from '@/lib/r2';

/** Collect path/filename hints from proxy URLs, R2 URLs, and raw keys (incl. encoded query params). */
function documentPathHints(...values: (string | null | undefined)[]): string {
  const parts: string[] = [];
  for (const raw of values) {
    if (!raw?.trim()) continue;
    const t = raw.trim();
    parts.push(t);
    try {
      const isProxy = t.includes('/attachments/proxy');
      if (isProxy) {
        const u = new URL(t, 'http://local');
        const key = u.searchParams.get('key');
        const urlParam = u.searchParams.get('url');
        if (key) {
          try {
            parts.push(decodeURIComponent(key));
          } catch {
            parts.push(key);
          }
        }
        if (urlParam) {
          let decoded = urlParam;
          try {
            decoded = decodeURIComponent(urlParam);
          } catch {
            /* keep */
          }
          parts.push(decoded);
          try {
            parts.push(new URL(decoded).pathname);
          } catch {
            /* ignore */
          }
        }
      } else if (t.includes('://')) {
        parts.push(new URL(t).pathname);
      } else {
        parts.push(t.replace(/^\/+/, ''));
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return parts.join(' ');
}

/** Partner-safe URL for viewing R2 / stored documents (proxy, no expiring signed URLs). */
export function partnerDocumentPreviewHref(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;

  // Always prefer stable ?key= proxy (extension visible, no presigned query noise).
  const stored = toStoredDocumentUrl(t);
  if (stored?.includes('/api/attachments/proxy') && stored.includes('key=')) {
    return stored;
  }

  if (t.startsWith('/api/attachments/proxy') || t.startsWith('/v1/attachments/proxy')) {
    let href = t.startsWith('/v1/')
      ? t.replace('/v1/attachments/proxy', '/api/attachments/proxy')
      : t;
    if (href.includes('url=') && !href.includes('key=')) {
      try {
        const u = new URL(href, 'http://local');
        const inner = u.searchParams.get('url');
        if (inner) {
          const upgraded = toStoredDocumentUrl(inner);
          if (upgraded?.includes('key=')) return upgraded;
        }
      } catch {
        /* fall through */
      }
    }
    if (href.includes('key=')) {
      const k = extractR2KeyFromUrl(href);
      if (k) {
        return `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(k))}`;
      }
    }
    return href;
  }

  if (stored) return stored;

  if (t.includes('://')) {
    return `/api/attachments/proxy?url=${encodeURIComponent(t)}`;
  }

  return (
    toStoredDocumentUrl(t) ??
    `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(t))}`
  );
}

export type PartnerDocumentKind = 'image' | 'pdf' | 'unknown';

export function partnerDocumentKindFromUrl(url: string, rawHint?: string | null): PartnerDocumentKind {
  const combined = documentPathHints(url, rawHint).toLowerCase();

  if (
    /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i.test(combined) ||
    /_(image|img|photo)[_.\d]/i.test(combined) ||
    combined.includes('image/')
  ) {
    return 'image';
  }

  if (/\.pdf(\?|#|$)/i.test(combined) || combined.includes('application/pdf')) {
    return 'pdf';
  }

  return 'unknown';
}
