import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'

function toBase64Url(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(ref: string): string {
  const base64 = ref.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8')
  }
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  )
}

/** Opaque token for POST /api/media/view — no raw storage URL in the DOM. */
export function toMediaRef(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const resolved = resolveAppAssetUrl(trimmed) ?? trimmed

  if (resolved.includes('/api/attachments/proxy')) {
    try {
      const key = new URL(resolved, 'http://local').searchParams.get('key')
      if (key) return toBase64Url(`key:${key}`)
    } catch {
      /* fall through */
    }
  }

  if (resolved.startsWith('/')) return toBase64Url(`path:${resolved}`)
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    return toBase64Url(`url:${resolved}`)
  }

  return toBase64Url(`key:${resolved}`)
}

export type MediaRefPayload =
  | { kind: 'key'; key: string }
  | { kind: 'path'; path: string }
  | { kind: 'url'; url: string }

export function parseMediaRef(ref: unknown): MediaRefPayload | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  try {
    const decoded = fromBase64Url(ref.trim())
    if (decoded.startsWith('key:')) return { kind: 'key', key: decoded.slice(4) }
    if (decoded.startsWith('path:')) return { kind: 'path', path: decoded.slice(5) }
    if (decoded.startsWith('url:')) return { kind: 'url', url: decoded.slice(4) }
    return null
  } catch {
    return null
  }
}
