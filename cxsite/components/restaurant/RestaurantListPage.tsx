"use client"

import React, { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { formatMerchantDeliveryTime } from '@/lib/merchantDeliveryTime'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import {
  isOperationalClosedStatus,
  operationalStatusPillClassName,
} from '@/lib/operationalStatusBadge'
import OpeningHoursModal from '@/components/common/OpeningHoursModal'
import OrderHeader from '@/components/order/OrderHeader'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'

// Add CSS for blinking animation
const styleSheet = typeof document !== 'undefined' ? (() => {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulse-blink {
      0%, 100% {
        opacity: 1;
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
      }
      50% {
        opacity: 0.8;
        box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
      }
    }
    .pulse-attention {
      animation: pulse-blink 2s infinite;
    }
  `
  if (document.head) {
    document.head.appendChild(style)
  }
  return style
})() : null

interface RestaurantCard {
  id: string
  name: string
  cuisines: string[]
  rating: number
  reviews: number
  deliveryTime: number
  deliveryFee: number
  minOrderAmount?: number
  image: string
  isVeg?: boolean
  discount?: number
  fssaiLicense: string
  category?: string
  is_active?: boolean
  opening_time?: string
  closing_time?: string
  address?: string
  isVerified?: boolean
  operational_status?: string | null
  store_id?: string
  public_slug?: string | null
  /** Numeric merchant_stores.id — preferred for /api/restaurants/[id] (operating hours FK). */
  merchantStorePk?: string
}

function maskFssai(license: string | undefined): string {
  if (!license || typeof license !== 'string') return ''
  const s = license.replace(/\s/g, '')
  if (s.length <= 4) return '****'
  return '****' + s.slice(-4)
}

// Updated NotFound Component with improved layout
const NotFound = ({ 
  message, 
  description, 
  buttonText, 
  onButtonClick 
}: { 
  message: string; 
  description: string; 
  buttonText: string; 
  onButtonClick: () => void 
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
        {/* Left side - Image with increased height */}
        <div className="relative h-80 md:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
          <Image
            src="/img/wrong.png" // Your public image path
            alt="Wrong turn illustration"
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
        </div>

        {/* Right side - Content with reduced text area */}
        <div className="text-center md:text-left space-y-6">
          {/* "Oops" at top with smaller text size */}
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-2">
              Oops,
            </h2>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
              {message}
            </h1>
          </div>
          
          <p className="text-gray-600 text-lg leading-relaxed">
            {description}
          </p>
          
          <div className="space-y-4 pt-4">
            <button
              onClick={onButtonClick}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-4 px-10 rounded-2xl text-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 active:translate-y-0 shadow-lg"
            >
              <span>{buttonText}</span>
              <i className="fas fa-arrow-right text-xl"></i>
            </button>
            
            <p className="text-gray-500 text-sm italic">
              Let's explore other amazing restaurants in your city!
            </p>
          </div>
          
          {/* Additional decorative elements */}
          <div className="mt-10 pt-8 border-t border-gray-200">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-store text-green-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Local Stores</span>
                  <span className="text-xs text-gray-500">Near you</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-bolt text-blue-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Fast Delivery</span>
                  <span className="text-xs text-gray-500">Minutes away</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-star text-purple-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Top Rated</span>
                  <span className="text-xs text-gray-500">Quality assured</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Updated 404 Page Component with new layout
const NotFound404 = () => {
  const router = useRouter()
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
        {/* Left side - Image with increased height */}
        <div className="relative h-80 md:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
          <Image
            src="/img/wrong.png"
            alt="Wrong turn illustration"
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
        </div>

        {/* Right side - Content with reduced text area */}
        <div className="text-center md:text-left space-y-6">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-2">
              Oops,
            </h2>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
              Wrong Way!
            </h1>
            <div className="text-8xl md:text-9xl font-black text-gray-900 opacity-10 -mt-6 -mb-4">
              404
            </div>
          </div>
          
          <p className="text-gray-600 text-lg leading-relaxed">
            Looks like you're off the route!
            Let's take you back to GatiMitra—discover nearby stores and get food, parcels, or rides in minutes.
          </p>
          
          <div className="space-y-4 pt-4">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-4 px-10 rounded-2xl text-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 active:translate-y-0 shadow-lg"
            >
              <span>Back to GatiMitra</span>
              <i className="fas fa-home text-xl"></i>
            </button>
            
            <p className="text-gray-500 text-sm italic">
              Discover your city & experience the joy of shopping at local stores
            </p>
          </div>
          
          {/* Additional decorative elements */}
          <div className="mt-10 pt-8 border-t border-gray-200">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-store text-green-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Local Stores</span>
                  <span className="text-xs text-gray-500">Near you</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-shipping-fast text-blue-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Fast Delivery</span>
                  <span className="text-xs text-gray-500">Minutes away</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shadow-md">
                  <i className="fas fa-star text-purple-600 text-lg"></i>
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Top Rated</span>
                  <span className="text-xs text-gray-500">Quality assured</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const MainArea404State = () => {
  return (
    <div className="min-h-[65vh] flex items-center justify-center p-4 md:p-6">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
        <div className="flex items-center justify-center md:justify-start">
          <span className="text-[120px] md:text-[180px] font-black leading-none text-slate-100 select-none">404</span>
        </div>

        <div className="text-center md:text-left space-y-4">
          <h2 className="text-4xl md:text-5xl font-black text-gray-900">Oops,</h2>
          <h3 className="text-2xl md:text-3xl font-bold text-gray-800">Looks like you're off the route!</h3>
          <p className="text-gray-600 text-base leading-relaxed">
            No stores found right now for this selection. Try another category or adjust filters.
          </p>
          <div>
            <Link
              href="/order"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#0d9488] px-5 py-2.5 text-sm font-semibold text-[#0d9488] transition-all hover:bg-[#0d9488] hover:text-white"
            >
              Browse all restaurants
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export type StoreListVariant = 'restaurant' | 'grocery'

const VARIANT_CONFIG: Record<
  StoreListVariant,
  { title: string; subtitle: string; emptyTitle: string; linkFrom: string }
> = {
  restaurant: {
    title: 'Restaurants',
    subtitle: 'Discover top restaurants near you',
    emptyTitle: 'No restaurants found',
    linkFrom: 'restaurants',
  },
  grocery: {
    title: 'Grocery Stores',
    subtitle: 'Daily essentials from trusted local stores',
    emptyTitle: 'No grocery stores found',
    linkFrom: 'grocery',
  },
}

const RestaurantListPage = ({ variant = 'restaurant' }: { variant?: StoreListVariant }) => {
  const config = VARIANT_CONFIG[variant]
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category')
  const { location: locationState, setLocation: setGlobalLocation } = useLocationContext()
  const locationCommitted = locationState.locationCommittedByUser === true
  const urlLat = searchParams.get('lat')
  const urlLon = searchParams.get('lon')
  const urlLocation = searchParams.get('location')
  const urlHasValidCoords = useMemo(() => {
    const lat = urlLat != null ? Number(urlLat) : NaN
    const lon = urlLon != null ? Number(urlLon) : NaN
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      !(lat === 0 && lon === 0)
    )
  }, [urlLat, urlLon])
  const restaurantGeoQs = useMemo(
    () => getRestaurantGeoQueryString(locationState),
    [locationState, locationCommitted]
  )
  const effectiveGeoQs = useMemo(() => {
    if (urlHasValidCoords && urlLat && urlLon) {
      const p = new URLSearchParams()
      p.set('lat', urlLat)
      p.set('lon', urlLon)
      p.set('radius_km', '10')
      return p.toString()
    }
    return restaurantGeoQs
  }, [urlHasValidCoords, urlLat, urlLon, restaurantGeoQs])
  const locationCarryQuery = useMemo(() => {
    const p = new URLSearchParams()
    if (urlLocation && urlLocation.trim() !== '') p.set('location', urlLocation)
    if (urlHasValidCoords && urlLat && urlLon) {
      p.set('lat', urlLat)
      p.set('lon', urlLon)
    }
    if (!p.get('location') && locationState.displayName) {
      p.set('location', locationState.displayName)
    }
    if (!p.get('lat') && locationState.lat != null && locationState.lon != null) {
      p.set('lat', String(locationState.lat))
      p.set('lon', String(locationState.lon))
    }
    return p
  }, [urlLocation, urlHasValidCoords, urlLat, urlLon, locationState.displayName, locationState.lat, locationState.lon])
  
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'nonveg'>('all')
  const [minRating, setMinRating] = useState<4.5 | 4 | null>(null)
  const [maxDeliveryTime, setMaxDeliveryTime] = useState<30 | 45 | null>(null)
  const [sortBy, setSortBy] = useState<'relevance' | 'delivery' | 'rating' | 'cost_asc' | 'cost_desc'>('relevance')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [openLeftSection, setOpenLeftSection] = useState<'sort' | 'veg' | 'rating' | 'delivery' | null>('sort')
  const [openSheetSection, setOpenSheetSection] = useState<'sort' | 'veg' | 'rating' | 'delivery' | null>('sort')

  React.useEffect(() => {
    if (openLeftSection == null) setOpenLeftSection('sort')
  }, [openLeftSection])

  React.useEffect(() => {
    if (openSheetSection == null) setOpenSheetSection('sort')
  }, [openSheetSection])

  // Fetch real restaurant data from API
  const [restaurants, setRestaurants] = useState<RestaurantCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingHoursStoreId, setOpeningHoursStoreId] = useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const storeTypeParam = variant === 'grocery' ? 'store_type=GROCERY' : ''
    const geo = effectiveGeoQs ? `&${effectiveGeoQs}` : ''
    const typePrefix = storeTypeParam ? `${storeTypeParam}&` : ''
    let url = effectiveGeoQs
      ? `/api/restaurants?${typePrefix}${effectiveGeoQs}`
      : storeTypeParam
        ? `/api/restaurants?${storeTypeParam}`
        : '/api/restaurants'
    if (selectedCategory) {
      url = `/api/restaurants/by-category?category=${encodeURIComponent(selectedCategory)}${geo}${storeTypeParam ? `&${storeTypeParam}` : ''}`
    }
    fetch(url)
      .then(res => {
        return res.json().then(data => {
          if (!res.ok) {
            setError(data?.error || 'Failed to load restaurants');
            setRestaurants([]);
            return;
          }
          const list = Array.isArray(data) ? data : [];
          setRestaurants(
            list.map((r: any) => ({
              id: String(r.public_slug ?? r.restaurant_id ?? r.store_id ?? r.id ?? ''),
              public_slug: r.public_slug ?? null,
              store_id: String(r.store_id ?? r.restaurant_id ?? ''),
              merchantStorePk:
                r.id != null && String(r.id).trim() !== '' ? String(r.id) : undefined,
              name: r.restaurant_name ?? r.name ?? '',
              cuisines: r.cuisine_type ? (typeof r.cuisine_type === 'string' ? r.cuisine_type.split(',').map((c: string) => c.trim()) : []) : [],
              rating: r.avg_rating != null ? Number(r.avg_rating) : 0,
              reviews: r.total_reviews ?? '',
              deliveryTime: r.eta_min_minutes != null ? Number(r.eta_min_minutes) : (r.delivery_time_minutes != null ? Number(r.delivery_time_minutes) : 0),
              deliveryTimeLabel: formatMerchantDeliveryTime(r),
              deliveryFee: r.delivery_fee ?? '',
              minOrderAmount: r.min_order_amount != null ? Number(r.min_order_amount) : undefined,
              image: r.store_img ?? r.image_url ?? '',
              isVeg: r.is_veg ?? false,
              discount: r.discount ?? '',
              fssaiLicense: r.fssai_license ?? '',
              category: r.category ?? '',
              is_active: r.is_active ?? true,
              opening_time: r.opening_time ?? '',
              closing_time: r.closing_time ?? '',
              address: r.address ?? r.full_address ?? '',
              isVerified: r.approval_status === 'APPROVED',
              operational_status:
                r.operational_status != null && String(r.operational_status).trim() !== ''
                  ? String(r.operational_status)
                  : null,
            }))
          );
        });
      })
      .catch(() => {
        setError('Failed to load restaurants');
        setRestaurants([]);
      })
      .finally(() => setLoading(false));
  }, [selectedCategory, effectiveGeoQs, variant]);

  // Live OPEN/CLOSED from merchant_stores (hours edits + schedule tick).
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase
      .channel('cx-restaurant-list-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'merchant_stores' },
        (payload: { new?: { id?: number | string; store_id?: string; operational_status?: string | null } }) => {
          const row = payload?.new;
          if (!row) return;
          const pk = row.id != null ? String(row.id) : '';
          const publicId = row.store_id != null ? String(row.store_id) : '';
          const status =
            row.operational_status != null && String(row.operational_status).trim() !== ''
              ? String(row.operational_status)
              : null;
          setRestaurants((prev) => {
            let changed = false;
            const next = prev.map((r) => {
              const match =
                (pk && r.merchantStorePk === pk) ||
                (publicId && (r.store_id === publicId || r.id === publicId));
              if (!match) return r;
              if (r.operational_status === status) return r;
              changed = true;
              return { ...r, operational_status: status };
            });
            return changed ? next : prev;
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, []);

  React.useEffect(() => {
    if (!urlLocation || !urlHasValidCoords || !urlLat || !urlLon) return
    setGlobalLocation(urlLocation, Number(urlLat), Number(urlLon), { userInitiated: true })
  }, [urlLocation, urlHasValidCoords, urlLat, urlLon, setGlobalLocation])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <GatiMitraSpinner message="Loading restaurants…" />
      </div>
    );
  }

  if (error) {
      return (
          <NotFound 
            message="Looks like you're off the route!!" 
            description="Let's take you back to GatiMitra—discover nearby stores and get food, parcels, or rides in minutes." 
            buttonText="Push me to GatiMitra!" 
            onButtonClick={() => window.location.href = '/order'}
          />
      );
  }

  const filteredRestaurants = restaurants.filter((r) => {
    const vegMatch =
      vegFilter === 'all' ||
      (vegFilter === 'veg' && Boolean(r.isVeg)) ||
      (vegFilter === 'nonveg' && !Boolean(r.isVeg))
    const ratingMatch = minRating == null || (Number(r.rating) || 0) >= minRating
    const deliveryMatch =
      maxDeliveryTime == null || (Number(r.deliveryTime) || Number.MAX_SAFE_INTEGER) <= maxDeliveryTime
    return vegMatch && ratingMatch && deliveryMatch
  })

  const sortedRestaurants = [...filteredRestaurants].sort((a, b) => {
    switch (sortBy) {
      case 'delivery':
        return a.deliveryTime - b.deliveryTime
      case 'rating':
        return b.rating - a.rating
      case 'cost_asc':
        return (a.minOrderAmount ?? 0) - (b.minOrderAmount ?? 0)
      case 'cost_desc':
        return (b.minOrderAmount ?? 0) - (a.minOrderAmount ?? 0)
      case 'relevance':
      default:
        return b.rating - a.rating
    }
  })

  const resetFilters = () => {
    setVegFilter('all')
    setMinRating(null)
    setMaxDeliveryTime(null)
    setSortBy('relevance')
  }

  return (
    <>
    <OpeningHoursModal
      isOpen={openingHoursStoreId != null}
      onClose={() => setOpeningHoursStoreId(null)}
      storeId={openingHoursStoreId}
    />
    <OrderHeader
      logoHref="/order"
      showBackButton={false}
      showFilterButton={true}
      onFilterClick={() => setShowFilterSheet(true)}
    />
    <div className="h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-[#f0fdfb]/30">
      <div className="flex h-full w-full items-start gap-3">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:h-full lg:w-[248px] lg:shrink-0 z-20 box-border">
        <div className="flex h-full w-full flex-col overflow-hidden rounded-none bg-gradient-to-b from-slate-50 to-white p-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/60 box-border">
        <div className="flex-1 box-border">
        <div className="mb-2">
          <h1 className="mb-0.5 text-[1.75rem] leading-tight font-black text-[#0f172a]">
            {selectedCategory ? selectedCategory : `All ${config.title}`}
          </h1>
          <p className="text-xs leading-[1.3] font-medium text-slate-500">
            <i className="fas fa-store text-emerald-500 mr-1"></i>
            {sortedRestaurants.length} {sortedRestaurants.length === 1 ? 'store' : 'stores'}
          </p>
        </div>

        <div className="space-y-2 box-border">
          {([
            { key: 'sort', label: 'Sort' },
            { key: 'veg', label: 'Veg/Non-Veg' },
            { key: 'rating', label: 'Ratings' },
            { key: 'delivery', label: 'Delivery Time' },
          ] as const).map((section) => (
            <div key={section.key} className="rounded-[10px] bg-white shadow-sm ring-1 ring-slate-200/60">
              <button
                type="button"
                onClick={() => setOpenLeftSection(openLeftSection === section.key ? null : section.key)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-semibold text-slate-800"
              >
                <span>{section.label}</span>
                <i className={`fas fa-chevron-down text-[10px] text-slate-500 transition-transform ${openLeftSection === section.key ? 'rotate-180' : ''}`}></i>
              </button>
              {openLeftSection === section.key && (
                <div className="border-t border-slate-100 px-3 py-3">
                  {section.key === 'sort' && (
                    <div className="space-y-2.5 text-sm text-slate-700">
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'relevance'} onChange={() => setSortBy('relevance')} /> Relevance</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'delivery'} onChange={() => setSortBy('delivery')} /> Delivery Time</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'rating'} onChange={() => setSortBy('rating')} /> Rating</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'cost_asc'} onChange={() => setSortBy('cost_asc')} /> Cost: Low to High</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'cost_desc'} onChange={() => setSortBy('cost_desc')} /> Cost: High to Low</label>
                    </div>
                  )}
                  {section.key === 'veg' && (
                    <div className="space-y-2.5 text-sm text-slate-700">
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={vegFilter === 'nonveg'} onChange={() => setVegFilter(vegFilter === 'nonveg' ? 'all' : 'nonveg')} /> Non Veg</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={vegFilter === 'veg'} onChange={() => setVegFilter(vegFilter === 'veg' ? 'all' : 'veg')} /> Pure Veg</label>
                    </div>
                  )}
                  {section.key === 'rating' && (
                    <div className="space-y-2.5 text-sm text-slate-700">
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === null} onChange={() => setMinRating(null)} /> Ratings</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === 4} onChange={() => setMinRating(minRating === 4 ? null : 4)} /> Ratings 4.0+</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === 4.5} onChange={() => setMinRating(minRating === 4.5 ? null : 4.5)} /> Ratings 4.5+</label>
                    </div>
                  )}
                  {section.key === 'delivery' && (
                    <div className="space-y-2.5 text-sm text-slate-700">
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={maxDeliveryTime === 30} onChange={() => setMaxDeliveryTime(maxDeliveryTime === 30 ? null : 30)} /> Less than 30 mins</label>
                      <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={maxDeliveryTime === 45} onChange={() => setMaxDeliveryTime(maxDeliveryTime === 45 ? null : 45)} /> Less than 45 mins</label>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={resetFilters}
            className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-sm leading-[1.25] font-semibold text-slate-700 transition-all duration-200 hover:shadow-sm"
          >
            <i className="fas fa-rotate-left mr-2 text-[11px]"></i>
            Reset Filters
          </button>
        </div>
        </div>
        </div>
      </aside>

      {/* Main Content - no top gap */}
      <div className="h-full w-full min-w-0 overflow-y-auto pt-0 pr-2 sm:pr-3 lg:pr-4">
        {/* Mobile header - compact; Back at top when category selected */}
        <div className="lg:hidden bg-white border-b border-slate-200 sticky top-14 z-20">
          <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <h1 className="text-xl font-black text-[#0f172a]">
                {selectedCategory ? selectedCategory : 'Restaurants'}
              </h1>
              <p className="text-xs text-slate-500">{sortedRestaurants.length} stores</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setVegFilter(vegFilter === 'veg' ? 'all' : 'veg')}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold ${vegFilter === 'veg' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}
              >
                <i className="fas fa-leaf"></i>
                Veg
              </button>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700"
              >
                <i className="fas fa-rotate-left"></i>
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['relevance', 'delivery', 'rating'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                  sortBy === option ? 'bg-[#0d9488] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                  {option === 'relevance' && <i className="fas fa-sliders-h"></i>}
                  {option === 'delivery' && <i className="fas fa-bolt"></i>}
                  {option === 'rating' && <i className="fas fa-star"></i>}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Restaurants Grid - tight padding, no upper gap */}
        <div className="mx-auto w-full px-2 sm:px-3 md:px-4 py-4 md:py-6">
        {sortedRestaurants.length > 0 ? (
          <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1040px]:grid-cols-3 min-[1320px]:grid-cols-4 gap-3.5 md:gap-4">
            {sortedRestaurants.map((restaurant) => {
              // Operational status: exact DB value only (no fallback, no mapping)
              const opStatus = restaurant.operational_status != null && String(restaurant.operational_status).trim() !== ''
                ? String(restaurant.operational_status)
                : null
              const isClosed = opStatus != null && isOperationalClosedStatus(opStatus)
              return (
                <Link
                  key={restaurant.id}
                  href={restaurantDetailHref(
                    {
                      public_slug: restaurant.public_slug,
                      store_id: restaurant.store_id,
                      id: restaurant.id,
                    },
                    config.linkFrom,
                    locationCarryQuery
                  )}
                  className="group block no-underline h-full"
                >
                  <div
                    className={`h-full min-h-[380px] bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col hover:-translate-y-1 border border-slate-200 hover:border-[#0d9488] ${
                      isClosed ? 'opacity-[0.88] saturate-[0.55] grayscale-[0.35]' : ''
                    }`}
                  >
                    <div className="relative w-full h-44 sm:h-48 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300 flex-shrink-0">
                      <Image
                        src={restaurant.image || '/img/thali.png'}
                        alt={restaurant.name}
                        fill
                        priority={false}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      />
                      {/* Top Badge Area */}
                      <div className="absolute inset-0 top-0 pt-4 px-4 flex justify-between items-start pointer-events-none">
                        {/* Left: Veg Badge */}
                        {restaurant.isVeg && (
                          <div className="bg-white px-3 py-1.5 rounded-full text-green-700 font-bold text-xs shadow-lg flex items-center gap-1.5 border border-green-300 pointer-events-auto">
                            <div className="w-2.5 h-2.5 bg-green-700 rounded-full"></div>
                            Pure Veg
                          </div>
                        )}
                        {/* Operational status: exact DB value, hide when null */}
                        {opStatus && (
                          <button
                            type="button"
                            title="Opening hours"
                            aria-label={`View opening hours — ${opStatus}`}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setOpeningHoursStoreId(
                                restaurant.merchantStorePk ||
                                  restaurant.store_id ||
                                  restaurant.id
                              )
                            }}
                            className={`px-2.5 py-1 rounded-full font-semibold text-[11px] shadow flex items-center gap-1 pointer-events-auto border transition hover:opacity-90 active:scale-[0.98] ${operationalStatusPillClassName(opStatus)}`}
                          >
                            <i className="fas fa-store" aria-hidden />
                            <span>{opStatus}</span>
                            <i className="fas fa-chevron-down text-[9px] opacity-90" aria-hidden />
                          </button>
                        )}
                        {/* Right: Discount Badge */}
                        {restaurant.discount && (
                          <div className="bg-gradient-to-r from-[#ff6b35] to-[#ff8451] text-white px-3 py-1.5 rounded-full font-bold text-xs shadow-lg flex items-center gap-1 pointer-events-auto">
                            <i className="fas fa-fire text-white text-sm"></i>
                            {restaurant.discount}% OFF
                          </div>
                        )}
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/50 to-transparent flex items-end justify-start p-2.5">
                        <div className="bg-[#0d9488] text-white px-2.5 py-1 rounded-full font-semibold text-xs flex items-center gap-1">
                          <i className="fas fa-star text-white text-[10px]"></i>
                          <span>{restaurant.rating ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between">
                      <div className="mb-2.5">
                        <h3 className="font-bold text-[15px] text-[#0f172a] group-hover:text-[#0d9488] transition-colors line-clamp-2 mb-1">
                          {restaurant.name}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {restaurant.cuisines?.length ? restaurant.cuisines.join(', ') : '—'}
                        </p>
                      </div>

                      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                          <span className="text-amber-500">★</span>
                          <span className="font-semibold text-slate-800">{restaurant.rating ?? 0}</span>
                          <span className="text-slate-400">·</span>
                          <span>{restaurant.reviews != null ? `${restaurant.reviews} ratings` : '—'}</span>
                        </p>
                        {restaurant.isVerified && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                            <i className="fas fa-check-circle text-emerald-600"></i>
                            Verified
                          </span>
                        )}
                      </div>

                      {restaurant.address ? (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mb-1.5 flex items-start gap-1.5" title={restaurant.address}>
                          <i className="fas fa-map-marker-alt text-slate-400 mt-0.5 flex-shrink-0 text-[9px]"></i>
                          <span>{restaurant.address}</span>
                        </p>
                      ) : null}

                      {(restaurant.opening_time || restaurant.closing_time) ? (
                        <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1.5">
                          <i className="fas fa-clock text-slate-400 text-[9px]"></i>
                          <span>{restaurant.opening_time ?? '—'} – {restaurant.closing_time ?? '—'}</span>
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-slate-100">
                        {restaurant.fssaiLicense ? (
                          <p className="text-[10px] text-slate-500 font-mono">
                            FSSAI <span className="text-slate-600">{maskFssai(restaurant.fssaiLicense)}</span>
                          </p>
                        ) : null}
                        {restaurant.minOrderAmount != null && restaurant.minOrderAmount > 0 && (
                          <p className="text-[11px] text-slate-600 font-medium">
                            Min order ₹{restaurant.minOrderAmount}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <MainArea404State />
        )}
      </div>
      </div>
    </div>
    </div>
    {showFilterSheet && (
      <div className="fixed inset-0 z-[1300]">
        <button
          type="button"
          className="absolute inset-0 bg-black/35"
          onClick={() => setShowFilterSheet(false)}
          aria-label="Close filters sheet"
        />
        <aside className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Filter</h3>
              <p className="text-xs text-slate-500">Refine your search</p>
            </div>
            <button
              type="button"
              onClick={() => setShowFilterSheet(false)}
              className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              aria-label="Close sheet"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="space-y-2">
              {([
                { key: 'sort', label: 'Sort' },
                { key: 'veg', label: 'Veg/Non-Veg' },
                { key: 'rating', label: 'Ratings' },
                { key: 'delivery', label: 'Delivery Time' },
              ] as const).map((section) => (
                <div key={section.key} className="rounded-[10px] bg-white shadow-sm ring-1 ring-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setOpenSheetSection(openSheetSection === section.key ? null : section.key)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-slate-800"
                  >
                    <span>{section.label}</span>
                    <i className={`fas fa-chevron-down text-[10px] text-slate-500 transition-transform ${openSheetSection === section.key ? 'rotate-180' : ''}`}></i>
                  </button>
                  {openSheetSection === section.key && (
                    <div className="border-t border-slate-100 px-3 py-3">
                      {section.key === 'sort' && (
                        <div className="space-y-2.5 text-sm text-slate-700">
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'relevance'} onChange={() => setSortBy('relevance')} /> Relevance</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'delivery'} onChange={() => setSortBy('delivery')} /> Delivery Time</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'rating'} onChange={() => setSortBy('rating')} /> Rating</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'cost_asc'} onChange={() => setSortBy('cost_asc')} /> Cost: Low to High</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="radio" checked={sortBy === 'cost_desc'} onChange={() => setSortBy('cost_desc')} /> Cost: High to Low</label>
                        </div>
                      )}
                      {section.key === 'veg' && (
                        <div className="space-y-2.5 text-sm text-slate-700">
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={vegFilter === 'nonveg'} onChange={() => setVegFilter(vegFilter === 'nonveg' ? 'all' : 'nonveg')} /> Non Veg</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={vegFilter === 'veg'} onChange={() => setVegFilter(vegFilter === 'veg' ? 'all' : 'veg')} /> Pure Veg</label>
                        </div>
                      )}
                      {section.key === 'rating' && (
                        <div className="space-y-2.5 text-sm text-slate-700">
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === null} onChange={() => setMinRating(null)} /> Ratings</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === 4} onChange={() => setMinRating(minRating === 4 ? null : 4)} /> Ratings 4.0+</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={minRating === 4.5} onChange={() => setMinRating(minRating === 4.5 ? null : 4.5)} /> Ratings 4.5+</label>
                        </div>
                      )}
                      {section.key === 'delivery' && (
                        <div className="space-y-2.5 text-sm text-slate-700">
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={maxDeliveryTime === 30} onChange={() => setMaxDeliveryTime(maxDeliveryTime === 30 ? null : 30)} /> Less than 30 mins</label>
                          <label className="flex items-center gap-2.5 rounded-md px-1 py-0.5"><input type="checkbox" checked={maxDeliveryTime === 45} onChange={() => setMaxDeliveryTime(maxDeliveryTime === 45 ? null : 45)} /> Less than 45 mins</label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  resetFilters()
                  setShowFilterSheet(false)
                }}
                className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </aside>
      </div>
    )}
    </>
  )
}

export default RestaurantListPage
export { NotFound404 }