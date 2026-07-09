/**
 * Upstream GatiMitra API base URL for cxsite server routes.
 * In dev, prefer local backend over production when env is unset.
 */
export function getGatimitraBackendUrl(): string {
  const explicit = process.env.GATIMITRA_BACKEND_API_URL?.trim()
  const isProdBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const isProd = process.env.NODE_ENV === 'production'

  if (explicit) {
    const normalized = explicit.replace(/\/$/, '')
    // .env.local often points at localhost; skip that during `next build`.
    if (isProdBuild && /localhost|127\.0\.0\.1/i.test(normalized)) {
      return 'https://api.gatimitra.com'
    }
    return normalized
  }

  if (isProd || isProdBuild) {
    return 'https://api.gatimitra.com'
  }

  return 'http://127.0.0.1:3000'
}
