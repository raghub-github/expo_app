/**
 * Partner menu image URLs — prefer CDN when configured to skip slow proxy round-trips.
 */

function browserAccessiblePublicBase(base: string): boolean {
  if (!base?.trim()) return false;
  try {
    const host = new URL(base.trim()).hostname.toLowerCase();
    if (host.endsWith('.r2.cloudflarestorage.com')) return false;
    return true;
  } catch {
    return false;
  }
}

const PUBLIC_R2_BASE_RAW =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MERCHANT_R2_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '')
    : '';

const PUBLIC_R2_BASE = browserAccessiblePublicBase(PUBLIC_R2_BASE_RAW) ? PUBLIC_R2_BASE_RAW : '';

/** Extract R2 object key from proxy URL or return trimmed key/path. */
export function extractMenuImageR2Key(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  if (s.startsWith('/api/attachments/proxy') || /attachments\/proxy/i.test(s)) {
    try {
      const q = s.includes('?') ? s.slice(s.indexOf('?')) : '';
      const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      const key = params.get('key');
      if (key) return decodeURIComponent(key).replace(/^\/+/, '');
    } catch {
      return null;
    }
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      if (u.pathname.includes('/attachments/proxy')) {
        const key = u.searchParams.get('key');
        if (key) return decodeURIComponent(key).replace(/^\/+/, '');
      }
      return null;
    } catch {
      return null;
    }
  }
  if (s.startsWith('/')) return null;
  return s.replace(/^\/+/, '');
}

/** Best URL for <img src> — CDN when public base is set, else same-origin proxy. */
export function resolvePartnerMenuImageSrc(urlOrKey: string | null | undefined): string {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const trimmed = urlOrKey.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (!trimmed.includes('/attachments/proxy')) return trimmed;
  }

  const key = extractMenuImageR2Key(trimmed);
  if (key && PUBLIC_R2_BASE) {
    return `${PUBLIC_R2_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  if (trimmed.startsWith('/api/attachments/proxy') || trimmed.startsWith('/v1/attachments/proxy')) {
    return trimmed;
  }
  if (/^api\/attachments\/proxy/i.test(trimmed)) {
    return `/${trimmed}`;
  }
  if (key) {
    return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
  }
  return trimmed;
}

/** Redirect-based server use when a component is not suitable. */
export function getMenuImageSrc(urlOrKey: string | null | undefined): string {
  const resolved = resolvePartnerMenuImageSrc(urlOrKey);
  if (resolved) return resolved;
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const s = urlOrKey.trim();
  if (!s || s.startsWith('http://') || s.startsWith('https://')) return s;
  return `/api/images/signed-url?key=${encodeURIComponent(s)}&redirect=1`;
}
