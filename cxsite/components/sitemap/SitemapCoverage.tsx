'use client'

import { useEffect, useState } from 'react'
import SitemapServiceMap from '@/components/sitemap/SitemapServiceMap'
import SitemapLocationsSection from '@/components/sitemap/SitemapLocationsSection'
import type { SitemapServicePoint } from '@/components/sitemap/types'

type Props = {
  mapboxToken: string | null
}

export default function SitemapCoverage({ mapboxToken }: Props) {
  const [points, setPoints] = useState<SitemapServicePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setFetchError(null)
      try {
        const res = await fetch('/api/locations/service-points', {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error('Failed to load locations')
        const data = (await res.json()) as SitemapServicePoint[]
        if (!cancelled) setPoints(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) {
          setPoints([])
          setFetchError('Could not load service locations right now.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mt-8 space-y-0">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#16c2a5]">
            Across India
          </p>
          <h2 className="mt-1 text-xl font-black text-[#1a1a2e] sm:text-2xl">
            Where we serve
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Live service points on the map — each pin is a GatiMitra location.
          </p>
        </div>
        <SitemapServiceMap points={points} mapboxToken={mapboxToken} />
        {fetchError ? (
          <p className="border-t border-gray-100 px-5 py-3 text-center text-xs text-amber-700 sm:px-6">
            {fetchError}
          </p>
        ) : null}
      </section>

      <SitemapLocationsSection points={points} loading={loading} />
    </div>
  )
}
