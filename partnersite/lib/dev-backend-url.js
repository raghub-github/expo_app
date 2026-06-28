/**
 * Single source for partnersite ↔ Fastify backend URL in local dev.
 * Used by next.config.js rewrites and src/lib/backend-api-url.ts (keep in sync).
 *
 * Dev layout:
 * - Partnersite:     http://127.0.0.1:3000  (`npm run dev` in partnersite/)
 * - Dashboard:       http://127.0.0.1:3001  (separate app)
 * - Fastify backend: http://127.0.0.1:3000  (`npm run dev` in backend/)
 */

const fs = require('fs');
const path = require('path');

const DEV_BACKEND_FALLBACK = 'http://127.0.0.1:3000';
const PARTNERSITE_DEV_PORT = '3000';

const LEGACY_DEV_BACKEND_URLS = new Set([
  'http://127.0.0.1:4000',
  'http://localhost:4000',
  'http://127.0.0.1:30000',
  'http://localhost:30000',
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

/** backend/.env API_BASE_URL — optional override when env vars above are unset. */
function readMonorepoBackendApiBaseUrl() {
  try {
    const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^API_BASE_URL=(.+)$/m);
    if (!m?.[1]) return null;
    return normalizeBaseUrl(m[1]);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(raw) {
  return String(raw).trim().replace(/\/+$/, '');
}

/** Host-only values (e.g. api.gatimitra.com) need a scheme for fetch() and Next rewrites. */
function ensureAbsoluteHttpUrl(raw) {
  const trimmed = normalizeBaseUrl(raw);
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Map legacy :4000 / :30000 backend URLs → :3000 fallback; empty dev env → fallback. */
function normalizeDevBackendUrl(raw) {
  const trimmed = ensureAbsoluteHttpUrl(raw);
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

/** Ordered backend base URLs for server-side fetch (first reachable wins). */
function resolveBackendApiBaseUrlCandidates() {
  const seen = new Set();
  const out = [];

  function push(url) {
    if (!url) return;
    const absolute = ensureAbsoluteHttpUrl(url);
    if (isPartnersiteSelfLoop(absolute)) return;
    const n = normalizeBaseUrl(absolute);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  }

  push(normalizeDevBackendUrl(readBackendEnvRaw()));
  push(process.env.GATIMITRA_BACKEND_API_FALLBACK);
  if (process.env.NODE_ENV === 'development') {
    push(readMonorepoBackendApiBaseUrl());
    push(DEV_BACKEND_FALLBACK);
  }

  return out;
}

/** Resolved Fastify base URL for partnersite server-side fetch + /v1 rewrites. */
function resolvePartnersiteBackendBaseUrl() {
  const candidates = resolveBackendApiBaseUrlCandidates();
  if (candidates.length === 0) return null;
  return candidates[0];
}

module.exports = {
  DEV_BACKEND_FALLBACK,
  PARTNERSITE_DEV_PORT,
  LEGACY_DEV_BACKEND_URLS,
  readBackendEnvRaw,
  ensureAbsoluteHttpUrl,
  normalizeDevBackendUrl,
  resolveBackendApiBaseUrlCandidates,
  resolvePartnersiteBackendBaseUrl,
};
