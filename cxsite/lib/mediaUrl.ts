/**
 * Resolve store / menu / gallery image URLs for the web app.
 * Mirrors customer app `toAbsoluteImageUrl` — attachment paths load via same-origin
 * GET `/api/attachments/proxy` (forwards to partner R2).
 */
function attachmentProxyPath(pathname: string, search: string): string {
  if (pathname.startsWith('/v1/attachments/proxy')) {
    return `/api/attachments/proxy${pathname.slice('/v1/attachments/proxy'.length)}${search}`
  }
  if (pathname.startsWith('/api/attachments/proxy')) {
    return `${pathname}${search}`
  }
  return `${pathname}${search}`
}

function rewriteAttachmentAbsoluteUrl(u: string): string | null {
  try {
    const parsed = new URL(u)
    const isAttachment =
      parsed.pathname.startsWith('/v1/attachments') ||
      parsed.pathname.startsWith('/api/attachments')
    if (!isAttachment) return null

    const host = parsed.hostname
    const loopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '10.0.2.2' ||
      /^192\.168\.\d+\.\d+$/.test(host)
    if (loopback || isAttachment) {
      return attachmentProxyPath(parsed.pathname, parsed.search)
    }
  } catch {
    return null
  }
  return null
}

export function toAbsoluteImageUrl(uri: string | null | undefined): string | null {
  if (uri == null || typeof uri !== 'string') return null
  const u = uri.trim()
  if (!u) return null

  if (u.startsWith('http://') || u.startsWith('https://')) {
    const rewritten = rewriteAttachmentAbsoluteUrl(u)
    return rewritten ?? u
  }

  if (/^\/?api\/attachments\/proxy/i.test(u)) {
    const path = u.startsWith('/') ? u : `/${u}`
    return path
  }

  if (/^\/?v1\/attachments\/proxy/i.test(u)) {
    const path = u.startsWith('/') ? u : `/${u}`
    return `/api/attachments/proxy${path.slice('/v1/attachments/proxy'.length)}`
  }

  if (u.startsWith('//')) return `https:${u}`

  if (u.startsWith('/')) return u

  // Bare storage key → partner proxy key param
  if (!u.includes('://') && !u.startsWith('/')) {
    return `/api/attachments/proxy?key=${encodeURIComponent(u)}`
  }

  return `/${u.replace(/^\/+/, '')}`
}

/** Same-origin absolute URL for <img src> in the browser (avoids host mismatch localhost vs LAN IP). */
export function toBrowserImageUrl(uri: string | null | undefined): string | null {
  const relative = toAbsoluteImageUrl(uri)
  if (!relative) return null
  if (typeof window === 'undefined') return relative
  if (relative.startsWith('http://') || relative.startsWith('https://')) return relative
  if (relative.startsWith('/')) return `${window.location.origin}${relative}`
  return relative
}

/**
 * Ordered fallbacks for attachment images — handles cached 404s and host rewrites.
 * Used by ProtectedImage retry logic.
 */
export function getBrowserImageSrcCandidates(uri: string | null | undefined): string[] {
  if (uri == null || typeof uri !== 'string') return []
  const trimmed = uri.trim()
  if (!trimmed) return []

  const out: string[] = []
  const add = (u?: string | null) => {
    if (!u) return
    const t = u.trim()
    if (t && !out.includes(t)) out.push(t)
  }

  add(toAbsoluteImageUrl(trimmed))
  add(trimmed)

  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    const snapshot = [...out]
    for (const u of snapshot) {
      if (u.startsWith('/')) add(`${origin}${u}`)
      if (u.startsWith('http://') || u.startsWith('https://')) {
        const rewritten = rewriteAttachmentAbsoluteUrl(u)
        if (rewritten) add(`${origin}${rewritten}`)
      }
    }
  }

  return out
}

export function resolveImageUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  const out: string[] = []
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const resolved = toAbsoluteImageUrl(raw)
    if (resolved && !out.includes(resolved)) out.push(resolved)
  }
  return out
}
