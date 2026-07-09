'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import { criticalAppAssetFallback } from '@/lib/criticalAppAssetFallbacks'

type AppAssetItem = {
  id: string
  url: string | null
  proxyUrl: string | null
}

type AppAssetsContextValue = {
  loaded: boolean
  getUrl: (assetKey: string) => string | null
}

const AppAssetsContext = createContext<AppAssetsContextValue>({
  loaded: false,
  getUrl: (key) => criticalAppAssetFallback(key),
})

function normalizeAssets(
  assets: Record<string, AppAssetItem>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(assets)) {
    const url =
      resolveAppAssetUrl(item.url) ?? resolveAppAssetUrl(item.proxyUrl)
    if (!url) continue
    out[key] = url
    if (key.startsWith('customer.')) {
      out[key.slice('customer.'.length)] = url
    } else {
      out[`customer.${key}`] = url
    }
    if (item.id) {
      const id = item.id
      out[id] = url
      if (id.startsWith('customer.')) out[id.slice('customer.'.length)] = url
    }
  }
  return out
}

export function AppAssetsProvider({ children }: { children: ReactNode }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    let attempt = 0

    const load = async () => {
      attempt += 1
      try {
        const res = await fetch('/api/app-assets/customer')
        if (!res.ok) throw new Error(`assets ${res.status}`)
        const data = (await res.json()) as {
          assets?: Record<string, AppAssetItem>
        }
        const assets = data.assets ?? {}
        if (cancelled) return
        if (Object.keys(assets).length === 0) throw new Error('empty assets')
        setUrls(normalizeAssets(assets))
        setLoaded(true)
      } catch {
        if (cancelled) return
        if (attempt < 3) {
          window.setTimeout(() => {
            if (!cancelled) void load()
          }, 600 * attempt)
          return
        }
        setLoaded(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const getUrl = useCallback(
    (assetKey: string) => {
      if (!assetKey) return null
      return (
        urls[assetKey] ??
        urls[
          assetKey.startsWith('customer.')
            ? assetKey.slice('customer.'.length)
            : `customer.${assetKey}`
        ] ??
        criticalAppAssetFallback(assetKey) ??
        null
      )
    },
    [urls]
  )

  const value = useMemo(() => ({ loaded, getUrl }), [loaded, getUrl])

  return (
    <AppAssetsContext.Provider value={value}>{children}</AppAssetsContext.Provider>
  )
}

export function useAppAssetUrl(assetKey: string): string | null {
  const { getUrl } = useContext(AppAssetsContext)
  return getUrl(assetKey)
}

export function useAppAssetsLoaded(): boolean {
  const { loaded } = useContext(AppAssetsContext)
  return loaded
}
