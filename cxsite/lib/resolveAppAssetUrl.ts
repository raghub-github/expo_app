/**
 * Resolve CMS app-asset URLs for the web app.
 * Attachment proxy paths are rewritten to same-origin `/api/attachments/proxy` (forwards to partner R2).
 */
export function resolveAppAssetUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const u = raw.trim()
  if (!u) return null

  if (u.startsWith('http://') || u.startsWith('https://')) {
    try {
      const parsed = new URL(u)
      const isAttachment =
        parsed.pathname.startsWith('/v1/attachments/proxy') ||
        parsed.pathname.startsWith('/api/attachments/proxy')
      if (isAttachment) {
        const query = parsed.search || ''
        return `/api/attachments/proxy${query}`
      }
    } catch {
      return u
    }
    return u
  }

  if (/^\/?v1\/attachments\/proxy/i.test(u)) {
    const path = u.startsWith('/') ? u : `/${u}`
    return `/api/attachments/proxy${path.slice('/v1/attachments/proxy'.length)}`
  }

  if (/^\/?api\/attachments\/proxy/i.test(u)) {
    return u.startsWith('/') ? u : `/${u}`
  }

  return u.startsWith('/') ? u : `/${u}`
}
