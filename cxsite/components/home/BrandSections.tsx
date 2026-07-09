'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BrandNotFound404 from '@/components/brand/BrandNotFound404'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getBrandsGeoQueryString } from '@/lib/buildRestaurantGeoQuery'

/** API response: only merchant_type = BRAND from merchant_parents. No dummy data. */
export type StoreBrand = {
  id: string
  store_name: string
  merchant_type: string
  logo: string | null
  short_description: string | null
  category: string | null
  rating: number | null
  location: string | null
  is_verified: boolean
}

/** Map API brand row to StoreBrand (id = parent_merchant_id for routing). */
export function apiBrandToStoreBrand(row: {
  id?: number
  parent_merchant_id: string
  store_name?: string
  parent_name?: string
  brand_name?: string | null
  merchant_type: string
  store_logo?: string | null
  logo?: string | null
  business_category?: string | null
  category?: string | null
  short_description?: string | null
  city?: string | null
  state?: string | null
  location?: string | null
  registration_status?: string | null
  is_verified?: boolean
}): StoreBrand {
  const name = row.store_name ?? row.brand_name ?? row.parent_name ?? 'Store'
  const location = row.location ?? ([row.city, row.state].filter(Boolean).join(', ') || null)
  const category = row.category ?? row.business_category ?? row.short_description ?? null
  const logo = row.logo ?? (row.store_logo != null && String(row.store_logo).trim() !== '' ? String(row.store_logo).trim() : null)
  return {
    id: String(row.parent_merchant_id),
    store_name: name,
    merchant_type: row.merchant_type,
    logo,
    short_description: category,
    category,
    rating: null,
    location: location || null,
    is_verified: row.is_verified ?? row.registration_status === 'VERIFIED',
  }
}

/** Category matcher: (business_category) => belongs to this section */
export function matchCategory(cat: string | null, patterns: RegExp): boolean {
  if (!cat || typeof cat !== 'string') return false
  return patterns.test(cat)
}

/** Max 2 rows per section. Cards per 2 rows by breakpoint: 3*2=6 (sm), 4*2=8 (md), 6*2=12 (lg). */
export function getCardsPerPage(): number {
  if (typeof window === 'undefined') return 12
  const w = window.innerWidth
  if (w < 768) return 6   // grid-cols-3
  if (w < 1024) return 8  // md:grid-cols-4
  return 12              // lg:grid-cols-6
}

/** Section config: order and how to match business_category. Each brand assigned to first matching section. */
export const SECTIONS: {
  id: string
  title: string
  subtitle: string
  /** Regex to match business_category (case-insensitive) */
  categoryPattern: RegExp
  /** Gradient/accent for heading */
  titleClass: string
  underlineClass: string
}[] = [
  {
    id: 'food',
    title: 'Food Delivery',
    subtitle: 'Discover food delivery and restaurant brands. Click to explore menu and place orders.',
    categoryPattern: /food|restaurant|cafe|bakery|dining|quick\s*service|qsr/i,
    titleClass: 'text-mint',
    underlineClass: 'from-mint to-purple',
  },
  {
    id: 'fashion',
    title: 'Fashion',
    subtitle: 'Explore fashion brands for clothing, footwear, and accessories.',
    categoryPattern: /fashion|clothing|apparel|footwear|textile|garment/i,
    titleClass: 'text-purple',
    underlineClass: 'from-purple to-pink-500',
  },
  {
    id: 'pharma',
    title: 'Pharma & Health',
    subtitle: 'Trusted pharmacy and health brands.',
    categoryPattern: /pharma|pharmacy|health|medical/i,
    titleClass: 'text-emerald-600',
    underlineClass: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'electronics',
    title: 'Electronics & Tech',
    subtitle: 'Electronics, gadgets, and e-commerce brands.',
    categoryPattern: /electronic|tech|gadget|ecommerce|e-commerce|online/i,
    titleClass: 'text-blue-500',
    underlineClass: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'other',
    title: 'Explore More',
    subtitle: 'Other verified brands.',
    categoryPattern: /./, // matches any non-empty; used as fallback
    titleClass: 'text-gray-700',
    underlineClass: 'from-gray-500 to-gray-600',
  },
]

/** Premium "Coming Soon" for sections with no BRAND stores yet */
export function ComingSoonCard({ sectionTitle }: { sectionTitle: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gradient-to-br from-gray-50 to-white py-16 px-8 text-center max-w-2xl mx-auto shadow-sm">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-mint/10 to-purple/10 flex items-center justify-center mx-auto mb-5 text-4xl">
        ✨
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">Coming Soon</h3>
      <p className="text-gray-500 text-sm">
        We’re adding great <span className="font-medium text-gray-700">{sectionTitle}</span> brands here. Check back soon.
      </p>
    </div>
  )
}

/** Error card shown inside the section that failed to load (no global error box) */
export function SectionErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/80 to-white py-12 px-8 text-center max-w-2xl mx-auto shadow-sm">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4 text-3xl">
        ⚠️
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">Couldn’t load brands</h3>
      <p className="text-gray-600 text-sm mb-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-5 py-2.5 rounded-xl bg-mint text-white font-medium text-sm hover:bg-mint/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

/** Per-section loading spinner – different colour per section */
export function SectionSpinner({ sectionId }: { sectionId: string }) {
  const config: Record<string, { ring: string; text: string }> = {
    food: { ring: 'border-mint border-t-transparent', text: 'text-mint' },
    fashion: { ring: 'border-purple border-t-transparent', text: 'text-purple' },
    pharma: { ring: 'border-emerald-500 border-t-transparent', text: 'text-emerald-600' },
    electronics: { ring: 'border-blue-500 border-t-transparent', text: 'text-blue-500' },
    other: { ring: 'border-gray-500 border-t-transparent', text: 'text-gray-600' },
  }
  const { ring, text } = config[sectionId] ?? config.other
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className={`w-12 h-12 border-3 ${ring} rounded-full animate-spin`} />
      <p className={`text-sm ${text} font-medium`}>Loading brands…</p>
    </div>
  )
}

/** Partial name: max ~18 chars for compact card */
function truncateName(name: string, maxLen = 18) {
  const s = (name || '').trim()
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen).trim() + '…'
}

/** Food brand card - exact same size & style as Fashion: bg-white, border, shadow, more details on overlay */
export function StoreBrandCard({
  brand,
  onClick,
  disabled,
}: {
  brand: StoreBrand
  onClick: () => void
  disabled?: boolean
}) {
  const [logoError, setLogoError] = useState(false)
  const hasLogo = Boolean(brand.logo && brand.logo.trim() !== '')
  const showLogo = hasLogo && !logoError

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-white group relative w-full h-[170px] min-w-0 rounded-[17px] border-2 border-gray-200 shadow-sm flex flex-col cursor-pointer transition-all duration-[400ms] overflow-hidden hover:-translate-y-3 hover:scale-105 hover:shadow-[0_35px_70px_rgba(75,42,212,0.25)] hover:border-mint focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 disabled:opacity-70"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-mint/10 to-purple/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Verified badge - top right */}
      {brand.is_verified && (
        <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-emerald-100 text-emerald-700">
          ✓ Verified
        </span>
      )}

      {/* Logo area - well contained with padding (like reference image), aspect ratio maintained */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 relative z-10">
        <div className="w-full h-full max-h-[90px] flex items-center justify-center rounded-lg bg-gray-50/80">
          {hasLogo && (
            <img
              src={brand.logo!}
              alt={brand.store_name}
              className="max-w-[90px] max-h-[70px] w-auto h-auto object-contain"
              loading="lazy"
              onError={(e) => {
                setLogoError(true)
                ;(e.target as HTMLImageElement).style.display = 'none'
                const next = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null
                if (next) next.style.display = 'flex'
              }}
              style={logoError ? { display: 'none' } : undefined}
            />
          )}
          <div
            className="max-w-[90px] max-h-[70px] w-[70px] h-[70px] rounded-xl bg-gradient-to-br from-mint/20 to-purple/20 flex items-center justify-center text-mint font-bold text-lg"
            style={hasLogo && !logoError ? { display: 'none' } : undefined}
          >
            {(brand.store_name || '?').trim().slice(0, 2).toUpperCase() || '?'}
          </div>
        </div>
      </div>

      {/* Store name - always visible on card */}
      <div className="shrink-0 px-2 pb-2 pt-0.5 text-center relative z-10">
        <p className="text-xs font-bold text-gray-900 truncate" title={brand.store_name}>
          {truncateName(brand.store_name)}
        </p>
      </div>

      {/* Hover overlay: extra details + CTA */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white p-3 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-10 text-center">
        <p className="text-xs font-bold truncate" title={brand.store_name}>
          {truncateName(brand.store_name)}
        </p>
        {brand.category && (
          <p className="text-[10px] text-white/90 truncate">{brand.category}</p>
        )}
        {brand.location && (
          <p className="text-[10px] text-white/80 truncate">📍 {brand.location}</p>
        )}
        <p className="text-[10px] opacity-90 mt-0.5">Click to explore</p>
      </div>
    </button>
  )
}

export default function BrandSections() {
  const router = useRouter()
  const { location, hydrated } = useLocationContext()
  /** Geo query once location is hydrated; empty string = fetch all brands (fast initial paint). */
  const brandsGeoQs = useMemo(() => {
    if (!hydrated) return ''
    return getBrandsGeoQueryString(location)
  }, [hydrated, location])
  const [show404, setShow404] = useState(false)
  const [loadingBrand, setLoadingBrand] = useState(false)
  const [allBrands, setAllBrands] = useState<StoreBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Per-section page index when section has more than 2 rows (prev/next navigation). */
  const [sectionPage, setSectionPage] = useState<Record<string, number>>({})
  /** Cards per page (2 rows) – responsive. */
  const [cardsPerPage, setCardsPerPage] = useState(12)
  /** Only show section spinners on the first load; geo refetch after hydration stays silent. */
  const showBrandLoadingRef = useRef(true)
  useEffect(() => {
    const update = () => setCardsPerPage(getCardsPerPage())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fetchBrands = useCallback((showLoading = false) => {
    if (showLoading) {
      setLoading(true)
      setError(null)
    }
    const q = brandsGeoQs ? `?${brandsGeoQs}&limit=100` : '?limit=100'
    fetch(`/api/brands${q}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) return res.json().then((body: { error?: string; details?: string }) => { throw new Error(body?.error || body?.details || 'Failed to load brands') })
        return res.json()
      })
      .then((data: { brands?: unknown[] }) => {
        const list = Array.isArray(data?.brands) ? data.brands : []
        setAllBrands(list.map((row) => apiBrandToStoreBrand(row as Parameters<typeof apiBrandToStoreBrand>[0])))
        setError(null)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load brands')
      })
      .finally(() => setLoading(false))
  }, [brandsGeoQs])

  useEffect(() => {
    fetchBrands(showBrandLoadingRef.current)
    showBrandLoadingRef.current = false
  }, [fetchBrands, brandsGeoQs])

  useEffect(() => {
    const interval = setInterval(() => fetchBrands(false), 30000)
    return () => clearInterval(interval)
  }, [fetchBrands])

  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') fetchBrands(false) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [fetchBrands])

  /** Group BRANDs by section: each brand assigned to first matching section. Other = rest. */
  const brandsBySection = useMemo(() => {
    const sectionsWithoutOther = SECTIONS.slice(0, -1)
    const otherSection = SECTIONS[SECTIONS.length - 1]
    const result: { section: typeof SECTIONS[0]; brands: StoreBrand[] }[] = []

    for (const section of sectionsWithoutOther) {
      const brands = allBrands.filter((b) => matchCategory(b.category, section.categoryPattern))
      result.push({ section, brands })
    }

    const assigned = new Set(result.flatMap((r) => r.brands.map((b) => b.id)))
    const otherBrands = allBrands.filter((b) => !assigned.has(b.id))
    result.push({ section: otherSection, brands: otherBrands })

    return result
  }, [allBrands])

  const handleBrandClick = (brand: StoreBrand) => {
    setLoadingBrand(true)
    setTimeout(() => {
      setLoadingBrand(false)
      router.push(`/brand/${brand.id}`)
    }, 300)
  }

  // Show 404 page if brand details not found
  if (show404) {
    return <BrandNotFound404 />
  }

  /** Always show all section headings + descriptions; per-section content (spinner / cards) below */
  return (
    <div className="min-h-screen bg-transparent">
      {brandsBySection.map(({ section, brands }, idx) => (
        <section
          key={section.id}
          className={`${idx === 0 ? 'pt-12 pb-16' : 'py-16'} px-5 md:px-20 relative`}
        >
          <div className="text-center mb-4 relative">
            <h2 className={`text-[32px] md:text-[38px] font-black ${section.titleClass}`}>
              {section.title} <span className="text-gray-800">Brands</span>
            </h2>
            <span className={`absolute bottom-[-12px] left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r ${section.underlineClass} rounded`} />
          </div>
          <p className="text-center text-gray-600 max-w-2xl mx-auto mb-10 mt-8">
            {section.subtitle}
          </p>

          {/* Per-section content: error (food only) / loading / brands grid or Coming Soon */}
          {error && section.id === 'food' ? (
            <SectionErrorCard
              message="Please check your connection and try again."
              onRetry={() => fetchBrands(true)}
            />
          ) : loading ? (
            <SectionSpinner sectionId={section.id} />
          ) : brands.length === 0 ? (
            <ComingSoonCard sectionTitle={section.title} />
          ) : (
            <div className="max-w-[1200px] mx-auto my-12">
              {(() => {
                const needsNav = brands.length > cardsPerPage
                const totalPages = Math.ceil(brands.length / cardsPerPage)
                const page = Math.min(sectionPage[section.id] ?? 0, Math.max(0, totalPages - 1))
                const start = page * cardsPerPage
                const visibleBrands = brands.slice(start, start + cardsPerPage)
                const goPrev = () => setSectionPage((p) => ({ ...p, [section.id]: Math.max(0, (p[section.id] ?? 0) - 1) }))
                const goNext = () => setSectionPage((p) => ({ ...p, [section.id]: Math.min(totalPages - 1, (p[section.id] ?? 0) + 1) }))
                return (
                  <>
                    {needsNav && (
                      <div className="flex items-center justify-end gap-2 mb-4">
                        <button
                          type="button"
                          onClick={goPrev}
                          disabled={page === 0}
                          className="w-10 h-10 rounded-full border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-mint hover:text-mint disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
                          aria-label="Previous"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className="text-sm text-gray-500 min-w-[4rem] text-center">
                          {page + 1} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={goNext}
                          disabled={page >= totalPages - 1}
                          className="w-10 h-10 rounded-full border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-mint hover:text-mint disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
                          aria-label="Next"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8">
                      {visibleBrands.map((brand) => (
                        <StoreBrandCard
                          key={brand.id}
                          brand={brand}
                          onClick={() => handleBrandClick(brand)}
                          disabled={loadingBrand}
                        />
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </section>
      ))}

      {/* Global Styles */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        /* Define color variables if not already defined */
        :root {
          --mint: #16c2a5;
          --purple: #4b2ad4;
          --border: #e5e7eb;
        }
        
        .text-mint {
          color: var(--mint);
        }
        
        .text-purple {
          color: var(--purple);
        }
        
        .border-mint {
          border-color: var(--mint);
        }
        
        .border-border {
          border-color: var(--border);
        }
        
        .bg-mint {
          background-color: var(--mint);
        }
        
        .bg-purple {
          background-color: var(--purple);
        }
        
        .from-mint {
          --tw-gradient-from: var(--mint);
        }
        
        .to-purple {
          --tw-gradient-to: var(--purple);
        }
      `}</style>
    </div>
  )
}