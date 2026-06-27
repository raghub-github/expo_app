'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import BrandNotFound404 from '@/components/brand/BrandNotFound404'

type BrandDetail = {
  id: number
  parent_merchant_id: string
  parent_name: string
  store_name: string
  merchant_type: string
  business_category: string | null
  city: string | null
  state: string | null
  store_logo: string | null
  logo: string | null
  location: string | null
  is_verified: boolean
  is_active: boolean
  approval_status: string
}

export default function BrandDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const [brand, setBrand] = useState<BrandDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    if (!id) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setNotFound(false)
    fetch(`/api/brands/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true)
          return null
        }
        if (!res.ok) throw new Error('Failed to load brand')
        return res.json()
      })
      .then((data) => {
        if (data) setBrand(data)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
        <div className="w-12 h-12 border-3 border-[#16c2a5] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm mt-4">Loading brand…</p>
      </div>
    )
  }

  if (notFound || !brand) {
    return <BrandNotFound404 />
  }

  const displayName = brand.store_name || brand.parent_name || 'Brand'
  const logo = brand.logo ?? brand.store_logo
  const hasLogo = Boolean(logo && String(logo).trim() !== '') && !logoError

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium mb-8"
        >
          ← Back to Brands
        </Link>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-8 md:p-12 flex flex-col md:flex-row gap-8 items-start">
            <div className="shrink-0 w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden">
              {hasLogo ? (
                <img
                  src={logo!}
                  alt={displayName}
                  className="w-full h-full object-contain p-2"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="text-4xl md:text-5xl font-bold text-[#16c2a5]">
                  {(displayName || '?').trim().slice(0, 2).toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                  {displayName}
                </h1>
                {brand.is_verified && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">
                    ✓ Verified
                  </span>
                )}
              </div>
              {brand.business_category && (
                <p className="text-gray-600 text-sm mb-1">
                  {brand.business_category}
                </p>
              )}
              {brand.location && (
                <p className="text-gray-500 text-sm">
                  📍 {brand.location}
                </p>
              )}
              <p className="text-gray-400 text-xs mt-2">
                ID: {brand.parent_merchant_id}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  )
}
