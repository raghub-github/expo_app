'use client'

const META_KEY = 'gatimitra_food_categories_v3'
const CACHE_NAME = 'gatimitra-category-rail-v2'
const warmed = new Set<string>()
const painted = new Set<string>()
const memoryBlobs = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()
const PERSIST_MAX = 3
let persistActive = 0
const persistWait: Array<() => void> = []

async function withPersistSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (persistActive >= PERSIST_MAX) {
    await new Promise<void>((resolve) => persistWait.push(resolve))
  }
  persistActive += 1
  try {
    return await fn()
  } finally {
    persistActive -= 1
    persistWait.shift()?.()
  }
}

export type CachedFoodCategoryTile = { id: string; name: string; img: string | null }

export function readCachedFoodCategories(): CachedFoodCategoryTile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(META_KEY) ?? sessionStorage.getItem('gatimitra_food_categories_v2')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    const tiles = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { tiles?: unknown }).tiles)
        ? (parsed as { tiles: CachedFoodCategoryTile[] }).tiles
        : []
    return tiles
      .map((c) => ({
        id: String((c as CachedFoodCategoryTile).id ?? ''),
        name: String((c as CachedFoodCategoryTile).name ?? '').trim(),
        img: (c as CachedFoodCategoryTile).img ? String((c as CachedFoodCategoryTile).img) : null,
      }))
      .filter((c) => c.name)
  } catch {
    return []
  }
}

export function writeCachedFoodCategories(tiles: CachedFoodCategoryTile[]): void {
  if (typeof window === 'undefined') return
  try {
    const payload = JSON.stringify({ ts: Date.now(), tiles })
    localStorage.setItem(META_KEY, payload)
    sessionStorage.setItem('gatimitra_food_categories_v2', JSON.stringify(tiles))
  } catch {
    /* quota / private mode */
  }
}

export function peekCategoryImageSrc(src: string): string | null {
  return memoryBlobs.get(src) ?? null
}

export function markCategoryImagePainted(src: string): void {
  painted.add(src)
}

export function canPaintCategoryImageNow(src: string): boolean {
  if (!src || typeof window === 'undefined') return false
  if (memoryBlobs.has(src) || painted.has(src)) return true
  try {
    const img = new window.Image()
    img.src = src
    return img.complete && img.naturalWidth > 0
  } catch {
    return false
  }
}

function toInlineProxyUrl(src: string): string {
  if (!src.includes('/api/attachments/proxy')) return src
  try {
    const u = new URL(src, window.location.origin)
    u.searchParams.set('inline', '1')
    return src.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`
  } catch {
    return src.includes('?') ? `${src}&inline=1` : `${src}?inline=1`
  }
}

function isLikelyImageBlob(blob: Blob, contentType: string): boolean {
  const type = (blob.type || contentType || '').toLowerCase()
  if (type.includes('json') || type.includes('html') || type.startsWith('text/')) return false
  if (type.startsWith('image/')) return blob.size > 32
  if (type === 'application/octet-stream' || type === '') return blob.size > 500
  return false
}

async function persistCategoryImageInner(src: string): Promise<string> {
  const mem = memoryBlobs.get(src)
  if (mem) return mem

  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(src)
    if (hit && hit.ok) {
      const blob = await hit.blob()
      if (isLikelyImageBlob(blob, hit.headers.get('content-type') || '')) {
        const url = URL.createObjectURL(blob)
        memoryBlobs.set(src, url)
        painted.add(src)
        return url
      }
    }
  } catch {
    /* Cache Storage unavailable */
  }

  return withPersistSlot(async () => {
    const already = memoryBlobs.get(src)
    if (already) return already
    try {
      const res = await fetch(toInlineProxyUrl(src), { credentials: 'same-origin' })
      if (!res.ok) return src
      const blob = await res.blob()
      if (!isLikelyImageBlob(blob, res.headers.get('content-type') || '')) return src
      const url = URL.createObjectURL(blob)
      memoryBlobs.set(src, url)
      painted.add(src)
      try {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(
          src,
          new Response(blob, {
            headers: {
              'Content-Type': blob.type || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        )
      } catch {
        /* ignore quota */
      }
      return url
    } catch {
      return src
    }
  })
}

/** Copy category photos into Cache Storage + blob URLs so /order can paint without a second network trip. */
export function persistCategoryImage(src: string): Promise<string> {
  if (!src || typeof window === 'undefined') return Promise.resolve(src)
  const existing = inflight.get(src)
  if (existing) return existing
  const p = persistCategoryImageInner(src).finally(() => inflight.delete(src))
  inflight.set(src, p)
  return p
}

/** Decode into the browser HTTP cache so /order paints from disk, not the proxy. */
export function warmCategoryImage(src: string | null | undefined): void {
  if (!src || typeof window === 'undefined') return
  if (warmed.has(src)) return
  warmed.add(src)
  const img = new window.Image()
  img.decoding = 'async'
  img.onload = () => {
    painted.add(src)
  }
  img.onerror = () => {
    warmed.delete(src)
  }
  img.src = src
}

export function preloadCategoryRailImages(urls: Array<string | null | undefined>): void {
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u && u.trim())))]
  for (const src of unique) {
    warmCategoryImage(src)
    void persistCategoryImage(src)
  }
}

export function normalizeFoodCategoryTiles(
  data: Array<{ id?: string; name?: string; img?: string | null }>
): CachedFoodCategoryTile[] {
  return data
    .map((c) => {
      const name = typeof c.name === 'string' ? c.name.trim() : ''
      const img = c.img && typeof c.img === 'string' && c.img.trim() ? c.img.trim() : null
      const id = c.id != null && String(c.id).trim() !== '' ? String(c.id) : name
      return { id, name, img }
    })
    .filter((c) => c.name)
}
