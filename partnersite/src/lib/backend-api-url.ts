import {
  DEV_BACKEND_FALLBACK,
  PARTNERSITE_DEV_PORT,
  normalizeDevBackendUrl,
  readBackendEnvRaw,
  resolveBackendApiBaseUrlCandidates,
} from '../../lib/dev-backend-url';

function normalizeBaseUrl(raw: string): string {
  return String(raw).trim().replace(/\/+$/, '');
}

/** True when URL would hit the partnersite Next.js port (rewrite / fetch loop). */
function isPartnersiteSelfLoop(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') return false;
    const partnersitePort = String(process.env.PORT || PARTNERSITE_DEV_PORT);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return port === partnersitePort;
  } catch {
    return false;
  }
}

/** Server-side Fastify backend base URL (never defaults to partnersite port). */
export function resolveBackendApiBaseUrl(): string | null {
  const trimmed = normalizeDevBackendUrl(readBackendEnvRaw());

  if (!trimmed) {
    if (process.env.NODE_ENV === 'development') {
      return DEV_BACKEND_FALLBACK;
    }
    return null;
  }

  if (isPartnersiteSelfLoop(trimmed)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[backend-api-url] Backend URL ${trimmed} matches partnersite port (${process.env.PORT || PARTNERSITE_DEV_PORT}); using ${DEV_BACKEND_FALLBACK}.`
      );
      return DEV_BACKEND_FALLBACK;
    }
    return null;
  }

  return normalizeBaseUrl(trimmed);
}

/** All backend base URLs to try for server-side fetch (primary first). */
export function resolveBackendApiBaseUrlList(): string[] {
  return resolveBackendApiBaseUrlCandidates();
}
