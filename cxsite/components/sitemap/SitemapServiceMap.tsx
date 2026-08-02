'use client'

import { useEffect, useRef, useState } from 'react'
import type { SitemapServicePoint } from '@/components/sitemap/types'

const MAPBOX_GL_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css'
const MAPBOX_GL_JS = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js'
const MARKER_LOGO = '/img/onlylogo.png'

declare global {
  interface Window {
    mapboxgl?: {
      accessToken: string
      Map: new (opts: Record<string, unknown>) => MapboxMap
      Marker: new (opts?: { element?: HTMLElement }) => MapboxMarker
      Popup: new (opts?: Record<string, unknown>) => MapboxPopup
    }
  }
}

type MapboxMap = {
  remove: () => void
  resize: () => void
  on: (event: string, fn: () => void) => void
  loaded: () => boolean
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: Record<string, unknown>
  ) => void
  setMaxBounds: (bounds: [[number, number], [number, number]]) => void
}

/** Tight India viewport — keeps Pakistan / Myanmar / SEA out of the default frame. */
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [68.1, 6.5],
  [97.4, 35.7],
]

type MapboxMarker = {
  setLngLat: (lngLat: [number, number]) => MapboxMarker
  setPopup: (popup: MapboxPopup) => MapboxMarker
  addTo: (map: MapboxMap) => MapboxMarker
  remove: () => void
}

type MapboxPopup = {
  setHTML: (html: string) => MapboxPopup
}

function loadMapboxAssets(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.mapboxgl) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existingCss = document.querySelector(`link[href="${MAPBOX_GL_CSS}"]`)
    if (!existingCss) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MAPBOX_GL_CSS
      document.head.appendChild(link)
    }

    const existingScript = document.querySelector(`script[src="${MAPBOX_GL_JS}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve())
      if (window.mapboxgl) resolve()
      return
    }

    const script = document.createElement('script')
    script.src = MAPBOX_GL_JS
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Mapbox GL'))
    document.head.appendChild(script)
  })
}

type Props = {
  points: SitemapServicePoint[]
  mapboxToken: string | null
}

export default function SitemapServiceMap({ points, mapboxToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<MapboxMarker[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!mapboxToken) {
      setError('Map is temporarily unavailable.')
      return
    }
    if (!hostRef.current) return

    let cancelled = false

    const boot = async () => {
      try {
        await loadMapboxAssets()
        if (cancelled || !hostRef.current || !window.mapboxgl) return

        window.mapboxgl.accessToken = mapboxToken
        const map = new window.mapboxgl.Map({
          container: hostRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [78.9, 22.5],
          zoom: 4.35,
          maxBounds: INDIA_BOUNDS,
          minZoom: 3.8,
          maxZoom: 12,
          attributionControl: true,
          failIfMajorPerformanceCaveat: false,
        })
        mapRef.current = map
        map.setMaxBounds(INDIA_BOUNDS)

        const onLoad = () => {
          if (cancelled) return
          try {
            map.fitBounds(INDIA_BOUNDS, {
              padding: { top: 28, bottom: 28, left: 28, right: 28 },
              duration: 0,
              maxZoom: 5.2,
            })
            map.resize()
          } catch {
            /* ignore */
          }
          setReady(true)
        }

        if (map.loaded()) onLoad()
        else map.on('load', onLoad)

        const resize = () => {
          try {
            map.resize()
          } catch {
            /* ignore */
          }
        }
        window.setTimeout(resize, 120)
        window.setTimeout(resize, 400)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load map')
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => {
        try {
          m.remove()
        } catch {
          /* ignore */
        }
      })
      markersRef.current = []
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          /* ignore */
        }
        mapRef.current = null
      }
    }
  }, [mapboxToken])

  useEffect(() => {
    const map = mapRef.current
    const gl = window.mapboxgl
    if (!map || !gl || !ready) return

    markersRef.current.forEach((m) => {
      try {
        m.remove()
      } catch {
        /* ignore */
      }
    })
    markersRef.current = []

    points.forEach((point) => {
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return

      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', `${point.name}, ${point.city}`)
      el.style.cssText =
        'border:none;background:transparent;padding:0;cursor:pointer;line-height:0;'

      const img = document.createElement('img')
      img.src = MARKER_LOGO
      img.alt = 'GatiMitra'
      img.width = 24
      img.height = 24
      img.style.cssText =
        'width:24px;height:24px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.22));display:block;'
      el.appendChild(img)

      const safeName = escapeHtml(point.name)
      const safeCity = escapeHtml(point.city)
      const popup = new gl.Popup({ offset: 18, closeButton: true, maxWidth: '220px' }).setHTML(
        `<div style="font-family:system-ui,sans-serif;padding:2px 0">
          <div style="font-weight:700;font-size:13px;color:#1a1a2e">${safeName}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${safeCity}</div>
        </div>`
      )

      const marker = new gl.Marker({ element: el })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })

    try {
      map.resize()
    } catch {
      /* ignore */
    }
  }, [points, ready])

  if (error) {
    return (
      <div className="flex h-[82vh] min-h-[640px] items-center justify-center bg-[#eef2f7] px-6 text-center text-sm text-slate-600 sm:h-[85vh] sm:min-h-[720px]">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-[82vh] min-h-[640px] w-full bg-[#e8eef5] sm:h-[85vh] sm:min-h-[720px]">
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-500">
          Loading map…
        </div>
      ) : null}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
