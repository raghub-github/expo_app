'use client'

import type { SitemapServicePoint } from '@/components/sitemap/types'

type Props = {
  points: SitemapServicePoint[]
  loading?: boolean
}

export default function SitemapLocationsSection({ points, loading = false }: Props) {
  return (
    <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#16c2a5]">
            Coverage
          </p>
          <h2 className="mt-1 text-2xl font-black text-[#1a1a2e]">Our locations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cities and service points where GatiMitra is live across India.
          </p>
        </div>
        {!loading ? (
          <span className="rounded-full bg-[#16c2a5]/10 px-3 py-1 text-xs font-bold text-[#0f9f89]">
            {points.length} {points.length === 1 ? 'location' : 'locations'}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading locations…</p>
      ) : points.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          Location list will appear here once service points are available.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <li
              key={point.id}
              className="rounded-2xl border border-gray-100 bg-[#f8fafb] px-4 py-3 transition-colors hover:border-[#16c2a5]/35 hover:bg-[#16c2a5]/5"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/img/onlylogo.png"
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#1a1a2e]">{point.name}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{point.city}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
