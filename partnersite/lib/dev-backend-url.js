/**
 * Single source for partnersite ↔ Fastify backend URL in local dev.
 * Used by next.config.js rewrites and src/lib/backend-api-url.ts (keep in sync).
 *
 * Dev layout:
 * - Fastify backend: http://127.0.0.1:3000  (`npm run dev` in backend/)
 * - Partnersite:     http://127.0.0.1:3002  (`npm run dev` in partnersite/)
 * - Dashboard:       http://127.0.0.1:3001  (separate app)
 */

const DEV_BACKEND_FALLBACK = 'http://127.0.0.1:3000';
const PARTNERSITE_DEV_PORT = '3002';

const LEGACY_DEV_BACKEND_URLS = new Set([
  'http://127.0.0.1:4000',
  'http://localhost:4000',
]);

function readBackendEnvRaw() {
  return (
    process.env.GATIMITRA_BACKEND_API_URL ||
    process.env.MERCHANT_API_PROXY_TARGET ||
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_URL ||
    ''
  );
}

function normalizeBaseUrl(raw) {
  return String(raw).trim().replace(/\/+$/, '');
}

/** Map legacy :4000 dev default → backend on :3000; empty dev env → fallback. */
function normalizeDevBackendUrl(raw) {
  const trimmed = normalizeBaseUrl(raw);
  if (!trimmed) {
    return process.env.NODE_ENV === 'development' ? DEV_BACKEND_FALLBACK : '';
  }
  if (LEGACY_DEV_BACKEND_URLS.has(trimmed)) {
    return DEV_BACKEND_FALLBACK;
  }
  return trimmed;
}

function isPartnersiteSelfLoop(url) {
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

/** Resolved Fastify base URL for partnersite server-side fetch + /v1 rewrites. */
function resolvePartnersiteBackendBaseUrl() {
  const normalized = normalizeDevBackendUrl(readBackendEnvRaw());
  if (!normalized) return null;

  if (isPartnersiteSelfLoop(normalized)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[dev-backend-url] Backend URL ${normalized} matches partnersite port (${process.env.PORT || PARTNERSITE_DEV_PORT}); using ${DEV_BACKEND_FALLBACK}.`
      );
      return DEV_BACKEND_FALLBACK;
    }
    return null;
  }

  return normalized;
}

module.exports = {
  DEV_BACKEND_FALLBACK,
  PARTNERSITE_DEV_PORT,
  LEGACY_DEV_BACKEND_URLS,
  readBackendEnvRaw,
  normalizeDevBackendUrl,
  resolvePartnersiteBackendBaseUrl,
};
