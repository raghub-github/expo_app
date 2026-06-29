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
  getUrl: () => null,
})

function normalizeAssets(
  assets: Record<string, AppAssetItem>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(assets)) {
    const url =
      resolveAppAssetUrl(item.url) ?? resolveAppAssetUrl(item.proxyUrl)
    if (url) out[key] = url
  }
  return out
}

export function AppAssetsProvider({ children }: { children: ReactNode }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/app-assets/customer')
        if (!res.ok) return
        const data = (await res.json()) as {
          assets?: Record<string, AppAssetItem>
        }
        const assets = data.assets ?? {}
        if (cancelled || Object.keys(assets).length === 0) return
        setUrls(normalizeAssets(assets))
        setLoaded(true)
      } catch {
        /* retry on next mount / navigation */
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const getUrl = useCallback((assetKey: string) => urls[assetKey] ?? null, [urls])

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
