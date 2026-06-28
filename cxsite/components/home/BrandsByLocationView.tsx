'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { slugToTitle } from '@/lib/slug'
import type { StoreBrand } from './BrandSections'
import {
  apiBrandToStoreBrand,
  matchCategory,
  getCardsPerPage,
  SECTIONS,
  SectionSpinner,
  ComingSoonCard,
  SectionErrorCard,
  StoreBrandCard,
} from './BrandSections'

/** No brands in this location (URL-based) */
function NoBrandsInLocationCard({ cityDisplay, areaDisplay }: { cityDisplay: string; areaDisplay: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50/80 to-white py-16 px-8 text-center max-w-2xl mx-auto shadow-sm">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-5 text-4xl">📍</div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">No brands available in this location</h3>
      <p className="text-gray-500 text-sm">
        We don’t have any brands in {areaDisplay ? `${areaDisplay}, ` : ''}{cityDisplay} yet. Try another area or check back later.
      </p>
    </div>
  )
}

/** Coming soon in city (fallback when city exists but no brands) */
function ComingSoonInCityCard({ cityDisplay }: { cityDisplay: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gradient-to-br from-gray-50 to-white py-16 px-8 text-center max-w-2xl mx-auto shadow-sm">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-mint/10 to-purple/10 flex items-center justify-center mx-auto mb-5 text-4xl">✨</div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">Coming Soon in {cityDisplay}</h3>
      <p className="text-gray-500 text-sm">We’re adding brands here. Check back soon.</p>
    </div>
  )
}

interface BrandsByLocationViewProps {
  citySlug: string
  areaSlug: string
  categorySlug?: string | null
}

export default function BrandsByLocationView({ citySlug, areaSlug, categorySlug }: BrandsByLocationViewProps) {
  const router = useRouter()
  const [allBrands, setAllBrands] = useState<StoreBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingBrand, setLoadingBrand] = useState(false)
  const [sectionPage, setSectionPage] = useState<Record<string, number>>({})
  const [cardsPerPage, setCardsPerPage] = useState(12)

  const cityDisplay = slugToTitle(citySlug)
  const areaDisplay = slugToTitle(areaSlug)

  useEffect(() => {
    const update = () => setCardsPerPage(getCardsPerPage())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fetchBrands = useCallback(
    (showLoading = false) => {
      if (showLoading) {
        setLoading(true)
        setError(null)
      }
      const params = new URLSearchParams({ city: citySlug, area: areaSlug })
      if (categorySlug) params.set('category', categorySlug)
      fetch(`/api/brands?${params.toString()}`, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok)
            return res.json().then((body: { error?: string }) => {
              throw new Error(body?.error || 'Failed to load brands')
            })
          return res.json()
        })
        .then((data: { brands?: unknown[]; message?: string }) => {
          const list = Array.isArray(data?.brands) ? data.brands : []
          setAllBrands(list.map((row) => apiBrandToStoreBrand(row as Parameters<typeof apiBrandToStoreBrand>[0])))
          setError(null)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Failed to load brands')
        })
        .finally(() => setLoading(false))
    },
    [citySlug, areaSlug, categorySlug]
  )

  useEffect(() => {
    fetchBrands(true)
  }, [fetchBrands])

  const brandsBySection = useMemo(() => {
    const sectionsWithoutOther = SECTIONS.slice(0, -1)
    const otherSection = SECTIONS[SECTIONS.length - 1]
    const result: { section: (typeof SECTIONS)[0]; brands: StoreBrand[] }[] = []
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

  const showNoBrands = !loading && !error && allBrands.length === 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {brandsBySection.map(({ section, brands }) => (
        <section
          key={section.id}
          className={`py-16 px-5 md:px-20 relative ${section.id === 'fashion' ? 'bg-white' : ''}`}
        >
          <div className="text-center mb-4 relative">
            <h2 className={`text-[32px] md:text-[38px] font-black ${section.titleClass}`}>
              {section.title} <span className="text-gray-800">Brands</span>
            </h2>
            <span className={`absolute bottom-[-12px] left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r ${section.underlineClass} rounded`} />
          </div>
          <p className="text-center text-gray-600 max-w-2xl mx-auto mb-10 mt-8">{section.subtitle}</p>

          {error && section.id === 'food' ? (
            <SectionErrorCard message="Please check your connection and try again." onRetry={() => fetchBrands(true)} />
          ) : loading ? (
            <SectionSpinner sectionId={section.id} />
          ) : showNoBrands ? (
            section.id === 'food' ? (
              areaSlug && areaSlug !== citySlug ? (
                <NoBrandsInLocationCard cityDisplay={cityDisplay} areaDisplay={areaDisplay} />
              ) : (
                <ComingSoonInCityCard cityDisplay={cityDisplay} />
              )
            ) : (
              <div className="py-12 text-center text-gray-400 text-sm">No brands in this location for this category.</div>
            )
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
                const goNext = () =>
                  setSectionPage((p) => ({ ...p, [section.id]: Math.min(totalPages - 1, (p[section.id] ?? 0) + 1) }))
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
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
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
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
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
    </div>
  )
}
