'use client'

import { useEffect } from 'react'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import {
  normalizeFoodCategoryTiles,
  preloadCategoryRailImages,
  readCachedFoodCategories,
  writeCachedFoodCategories,
} from '@/lib/categoryRailImageCache'

/**
 * Starts downloading Top Picks icons as soon as any page mounts
 * (home, etc.) so /order already has them in the browser cache.
 */
export default function CategoryRailPrefetch() {
  useEffect(() => {
    let cancelled = false

    const warm = (tiles: Array<{ img: string | null }>) => {
      preloadCategoryRailImages(tiles.map((c) => (c.img ? resolveAppAssetUrl(c.img) : null)))
    }

    const cached = readCachedFoodCategories()
    if (cached.length > 0) warm(cached)

    fetch('/api/user-app-categories?store_type=FOOD')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return
        const tiles = normalizeFoodCategoryTiles(data)
        if (tiles.length === 0) return
        writeCachedFoodCategories(tiles)
        warm(tiles)
      })
      .catch(() => {
        /* keep cached list */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
