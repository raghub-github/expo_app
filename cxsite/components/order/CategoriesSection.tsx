'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import { useDispatch } from 'react-redux'
import { restoreAuth } from '@/lib/slices/authSlice'
import { useCart } from '@/lib/hooks/useCart'
import { CartItem } from './OrderPage'
import AuthModal from '@/components/auth/AuthModal'
import UserProfileModal from '@/components/auth/UserProfileModal'

import RestaurantSwitchModal from '@/components/cart/RestaurantSwitchModal'
import CustomizeModal from '@/components/cart/CustomizeModal'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import { truncateDisplayName } from '@/lib/truncateDisplayName'
import LocationSheet from '@/components/location-search/LocationSheet'
import LocationWelcomeModal from '@/components/location-search/LocationWelcomeModal'
import OrderNoServiceArea from '@/components/order/OrderNoServiceArea'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import type { OrderServiceAreaMode } from '@/lib/hooks/useOrderServiceArea'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import { detectCurrentLocation } from '@/lib/detectCurrentLocation'
import { locationAutoDetectErrorMessage } from '@/lib/locationAutoDetect'
import { resolveOrderPageLocationLabel } from '@/lib/panIndiaLocation'
import { formatMerchantDeliveryTime } from '@/lib/merchantDeliveryTime'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import { getMagicpinPathAfterLocationSelect, mergeLocationNavigationUrl } from '@/lib/magicpinLocationUrl'
import type { LocationItem } from '@/components/location-search/LocationPopup'
import { useLocationPromptAutoOpen } from '@/lib/hooks/useLocationPromptAutoOpen'

const FOOD_CATEGORIES_CACHE_KEY = 'gatimitra_food_categories_v2'
const TOP_PICKS_PER_PAGE = 14
const TOP_PICKS_COLS = 7

type FoodCategoryTile = { id: string; name: string; img: string | null }

interface CategoriesSectionProps {
  onViewRestaurants: () => void
  vegOnly: boolean
  onAddToCart?: (item: CartItem) => void
  /** When user committed location: loading / no restaurants in 10km — controls main body only. */
  serviceAreaMode?: OrderServiceAreaMode
  /** SSR-seeded Top Picks from `user_app_category` (same as customer app). */
  initialCategories?: FoodCategoryTile[]
}

interface PriceCard {
  id: string
  price: number
  title: string
  desc: string
  image: string
  priceRange: [number, number]
}

interface RestaurantWithItems {
  id: number
  name: string
  image: string
  items: Array<{ name: string; price: number; image: string }>
}

function splitTopPicksRows(items: FoodCategoryTile[]): [FoodCategoryTile[], FoodCategoryTile[]] {
  return [items.slice(0, TOP_PICKS_COLS), items.slice(TOP_PICKS_COLS, TOP_PICKS_PER_PAGE)]
}

function TopPickCategoryCard({
  category,
  locationQueryString,
  variant = 'desktop',
  priority = false,
}: {
  category: FoodCategoryTile
  locationQueryString?: string
  variant?: 'desktop' | 'mobile'
  priority?: boolean
}) {
  const [imgBroken, setImgBroken] = useState(false)
  const src = category.img ? resolveAppAssetUrl(category.img) : null
  const firstLetter = (category.name && category.name.trim()[0]) || '?'
  const showImage = Boolean(src) && !imgBroken

  if (variant === 'mobile') {
    return (
      <Link
        href={`/restaurants?category=${encodeURIComponent(category.name)}${locationQueryString ? `&${locationQueryString}` : ''}`}
        className="flex w-full min-w-0 flex-col items-center text-center no-underline"
        aria-label={category.name}
      >
        <div className="top-picks-circle">
          {showImage ? (
            <div className="top-picks-circle__img">
              <img
                src={src!}
                alt=""
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
                onError={() => setImgBroken(true)}
              />
            </div>
          ) : (
            <span className="text-2xl font-bold text-[#FF6B6B] select-none sm:text-3xl">
              {firstLetter.toUpperCase()}
            </span>
          )}
        </div>
        <div className="top-picks-label">{category.name}</div>
      </Link>
    )
  }

  return (
    <Link
      href={`/restaurants?category=${encodeURIComponent(category.name)}${locationQueryString ? `&${locationQueryString}` : ''}`}
      className="flex min-w-0 flex-col items-center text-center no-underline"
      aria-label={category.name}
    >
      <div className="top-picks-circle">
        {showImage ? (
          <div className="top-picks-circle__img">
            <img
              src={src!}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              onError={() => setImgBroken(true)}
            />
          </div>
        ) : (
          <span className="text-3xl font-bold text-[#FF6B6B] select-none">
            {firstLetter.toUpperCase()}
          </span>
        )}
      </div>
      <div className="top-picks-label">{category.name}</div>
    </Link>
  )
}

function TopPicksPageGrid({
  items,
  locationQueryString,
  priority = false,
}: {
  items: FoodCategoryTile[]
  locationQueryString?: string
  priority?: boolean
}) {
  const [row1, row2] = splitTopPicksRows(items)

  return (
    <>
      <div className="hidden lg:block top-picks-grid-desktop">
        {[row1, row2].map((row, rowIdx) => (
          <div key={`top-picks-row-${rowIdx}`} className="top-picks-row">
            {row.map((category) => (
              <TopPickCategoryCard
                key={category.id}
                category={category}
                locationQueryString={locationQueryString}
                priority={priority}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-5 sm:gap-x-4 md:grid-cols-6 lg:hidden">
        {items.map((category) => (
          <TopPickCategoryCard
            key={category.id}
            category={category}
            locationQueryString={locationQueryString}
            variant="mobile"
            priority={priority}
          />
        ))}
      </div>
    </>
  )
}

export default function CategoriesSection({
  onViewRestaurants,
  vegOnly,
  onAddToCart,
  serviceAreaMode = 'full',
  initialCategories = [],
}: CategoriesSectionProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dispatch = useDispatch();
  const { isFromDifferentRestaurant, clearCartItems, addToCart } = useCart()
  const [selectedPriceCard, setSelectedPriceCard] = useState<string | null>(null)
  const [showLocationSheet, setShowLocationSheet] = useState(false)
  const [showLocationWelcomeModal, setShowLocationWelcomeModal] = useState(false)
  const [autoDetecting, setAutoDetecting] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [categoryPage, setCategoryPage] = useState(0)
  const [categorySlideDir, setCategorySlideDir] = useState<'next' | 'prev' | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  // Cache for previous search queries
  const searchCache = useRef<{ [key: string]: any[] }>({})
  // Restaurant list for mapping id to name
  const [restaurantList, setRestaurantList] = useState<any[]>([])
  const topStores = useMemo(() => {
    const stores = (restaurantList || [])
      .map((r: any) => {
        const id = String(r?.restaurant_id ?? r?.id ?? '')
        const name = String(r?.restaurant_name ?? r?.name ?? '').trim()
        const image = String(r?.store_img ?? r?.banner_url ?? r?.image ?? '').trim()
        const deliveryTime = formatMerchantDeliveryTime(r)
        const avgRating = Number(r?.avg_rating ?? r?.rating)
        const operationalStatus = String(r?.operational_status ?? '').toUpperCase()
        const isClosed = operationalStatus !== 'OPEN' && operationalStatus !== ''
        if (!id || !name) return null
        // Top Stores: only stores with rating between 3.5 and 5 (inclusive).
        if (!Number.isFinite(avgRating) || avgRating < 3.5 || avgRating > 5) return null
        return {
          id,
          name,
          image: image || '/img/placeholder.png',
          deliveryTime: deliveryTime || '25-35 mins',
          avgRating,
          isClosed,
        }
      })
      .filter(Boolean) as Array<{
      id: string
      name: string
      image: string
      deliveryTime: string
      avgRating: number
      isClosed: boolean
    }>

    const sorted = stores
      .map((store, index) => ({ store, index }))
      .sort((a, b) => {
        if (b.store.avgRating !== a.store.avgRating) return b.store.avgRating - a.store.avgRating
        return a.index - b.index
      })
      .map((x) => x.store)

    return sorted.slice(0, 10)
  }, [restaurantList])
  const locationStores = useMemo(() => {
    return (restaurantList || [])
      .map((r: any) => {
        const id = String(r?.restaurant_id ?? r?.id ?? '')
        const name = String(r?.restaurant_name ?? r?.name ?? '').trim()
        const image = String(r?.store_img ?? r?.banner_url ?? r?.image ?? '').trim()
        const cuisinesRaw = String(r?.cuisine_type ?? '').trim()
        const cuisines = cuisinesRaw
          ? cuisinesRaw.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 2).join(', ')
          : 'Multi-cuisine'
        const minOrder = Number(r?.min_order_amount ?? 0)
        const deliveryTime = formatMerchantDeliveryTime(r)
        const avgRating = Number(r?.avg_rating ?? r?.rating)
        const operationalStatus = String(r?.operational_status ?? '').toUpperCase()
        const isClosed = operationalStatus !== 'OPEN' && operationalStatus !== ''
        if (!id || !name) return null
        return {
          id,
          name,
          image: image || '/img/placeholder.png',
          cuisines,
          minOrder: Number.isFinite(minOrder) && minOrder > 0 ? Math.round(minOrder) : 0,
          deliveryTime: deliveryTime || '25-35 mins',
          avgRating: Number.isFinite(avgRating) && avgRating > 0 ? avgRating : null,
          isClosed,
        }
      })
      .filter(Boolean)
      .slice(0, 4) as Array<{
      id: string
      name: string
      image: string
      cuisines: string
      minOrder: number
      deliveryTime: string
      avgRating: number | null
      isClosed: boolean
    }>
  }, [restaurantList])

  // Notification state
  const [notification, setNotification] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  
  // Restaurant switch modal state
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  // Pending item with all needed info
  const [pendingItemFull, setPendingItemFull] = useState<{
    id: string
    name: string
    price: number
    image: string
    restaurantId: string
    restaurant: string
  } | null>(null)
  const [switchFromRestaurant, setSwitchFromRestaurant] = useState('')
  const [switchToRestaurant, setSwitchToRestaurant] = useState('')
  
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
  const {
    location: locationState,
    setLocation: setGlobalLocation,
    permissionStatus,
    locationLoading,
    markAutoDetectInFlight,
    hydrated,
  } = useLocationContext()
  const [welcomeDetectError, setWelcomeDetectError] = useState<string | null>(null)
  const locationCommitted = locationState.locationCommittedByUser === true
  const openLocationWelcomeModal = useCallback(() => setShowLocationWelcomeModal(true), [])
  const {
    handlePromptDismiss: markLocationPromptDismissed,
    markSelected: markLocationSelected,
    dismissed: locationPromptDismissed,
  } = useLocationPromptAutoOpen({
      enabled: true,
      hydrated,
      locationCommitted,
      promptOpen: showLocationWelcomeModal,
      openPrompt: openLocationWelcomeModal,
      permissionStatus,
      locationLoading,
    })
  const showLocationNudgeBar = hydrated && !locationCommitted && !locationPromptDismissed && permissionStatus !== 'granted'
  const closeLocationWelcomeModal = useCallback(() => {
    setShowLocationWelcomeModal(false)
    setWelcomeDetectError(null)
    markLocationPromptDismissed()
  }, [markLocationPromptDismissed])
  const closeLocationSheet = useCallback(() => {
    setShowLocationSheet(false)
  }, [])
  const restaurantGeoQs = useMemo(
    () => getRestaurantGeoQueryString(locationState),
    [locationState, locationCommitted]
  )
  const currentLocation = useMemo(
    () =>
      resolveOrderPageLocationLabel({
        locationCommittedByUser: locationCommitted,
        displayName: locationState.displayName,
      }),
    [locationCommitted, locationState.displayName]
  )
  const locationQueryString = useMemo(() => {
    if (!locationCommitted) return ''
    const p = new URLSearchParams()
    if (locationState.displayName) {
      p.set('location', locationState.displayName)
    }
    if (locationState.lat != null && locationState.lon != null) {
      p.set('lat', String(locationState.lat))
      p.set('lon', String(locationState.lon))
    }
    return p.toString()
  }, [locationCommitted, locationState.displayName, locationState.lat, locationState.lon])

  const handleAutoDetectCurrentLocation = () => {
    setWelcomeDetectError(null)
    setAutoDetecting(true)
    markAutoDetectInFlight(true)

    const pending = detectCurrentLocation()
    void pending
      .then((result) => {
        if (result.ok) {
          handleSelectLocation(result.displayName, {
            id: 0,
            location_name: result.displayName,
            city: result.city || '',
            latitude: result.lat,
            longitude: result.lon,
          })
          return
        }
        setWelcomeDetectError(locationAutoDetectErrorMessage(result))
      })
      .finally(() => {
        setAutoDetecting(false)
        markAutoDetectInFlight(false)
      })
  }

  const openManualLocationEntry = () => {
    setShowLocationWelcomeModal(false)
    setWelcomeDetectError(null)
    window.requestAnimationFrame(() => {
      setShowLocationSheet(true)
    })
  }

  useEffect(() => {
    if (!hydrated) return
    const q = restaurantGeoQs ? `?${restaurantGeoQs}` : ''
    fetch(`/api/restaurants${q}`)
      .then((res) => res.json())
      .then((data) => setRestaurantList(Array.isArray(data) ? data : []))
      .catch(() => setRestaurantList([]))
  }, [restaurantGeoQs, hydrated])

  // Restore auth state on mount
  useEffect(() => {
    dispatch(restoreAuth());
  }, [dispatch]);
  const cartItems = useAppSelector(state => state.cart.items)

  // Real-time, instant search handler with cache and no loading state
  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    // Check cache for all prefixes to allow instant refinement
    let bestCached = null;
    for (let i = value.length; i > 0; i--) {
      const prefix = value.slice(0, i);
      if (searchCache.current[prefix]) {
        bestCached = searchCache.current[prefix];
        break;
      }
    }
    if (bestCached) {
      // Refine cached results client-side for partial/exact match
      const lower = value.toLowerCase();
      const refined = bestCached
        .filter(item =>
          (item.item_name && item.item_name.toLowerCase().includes(lower)) ||
          (item.category && item.category.toLowerCase().includes(lower)) ||
          (item.category_item && item.category_item.toLowerCase().includes(lower))
        )
        .sort((a, b) => {
          // Exact match first, then partial
          const aExact = a.item_name && a.item_name.toLowerCase() === lower;
          const bExact = b.item_name && b.item_name.toLowerCase() === lower;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          // Otherwise, shorter match first
          return (a.item_name?.length || 0) - (b.item_name?.length || 0);
        });
      setSearchResults(refined);
    } else {
      // Fire API call, but do not block UI or show loading
      fetch(`/api/search?q=${encodeURIComponent(value)}${restaurantGeoQs ? `&${restaurantGeoQs}` : ''}`)
        .then(res => res.json())
        .then(data => {
          const results = Array.isArray(data) ? data : [];
          searchCache.current[value] = results;
          setSearchResults(results);
        })
        .catch(() => {
          setSearchResults([]);
        });
    }
  }

  // Close search results when clicking outside
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.relative')) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleSelectLocation = (displayName: string, item?: LocationItem) => {
    markLocationSelected()
    const rawLat = item?.latitude
    const rawLon = item?.longitude
    const lat = rawLat != null ? Number(rawLat) : undefined
    const lon = rawLon != null ? Number(rawLon) : undefined
    const hasValidCoords =
      Number.isFinite(lat as number) &&
      Number.isFinite(lon as number) &&
      !((lat as number) === 0 && (lon as number) === 0)

    // Update global location first so UI reflects immediately.
    setGlobalLocation(displayName, hasValidCoords ? lat : undefined, hasValidCoords ? lon : undefined, {
      userInitiated: true,
    })

    // Keep user on /order while syncing URL query params.
    const isOrderRoute = Boolean(pathname && pathname.startsWith('/order'))
    if (isOrderRoute) {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.set('location', displayName)
      if (hasValidCoords) {
        next.set('lat', String(lat))
        next.set('lon', String(lon))
      } else {
        next.delete('lat')
        next.delete('lon')
      }
      const qs = next.toString()
      router.replace(qs ? `/order?${qs}` : '/order', { scroll: false })
    } else {
      const nextPath = getMagicpinPathAfterLocationSelect(pathname ?? '', displayName, item)
      if (nextPath) {
        const url = mergeLocationNavigationUrl(
          nextPath,
          new URLSearchParams(searchParams?.toString() ?? '')
        )
        router.replace(url, { scroll: false })
      }
    }

    setShowLocationSheet(false)
    setShowLocationWelcomeModal(false)
    setWelcomeDetectError(null)
  }

  const priceCards: PriceCard[] = [
    {
      id: 'budget',
      price: 99,
      title: "Budget Meals",
      desc: "Delicious meals under ₹99",
      image: "/img/street food.png",
      priceRange: [0, 99]
    },
    {
      id: 'mid',
      price: 149,
      title: "Value Meals",
      desc: "Great food at ₹100-₹149",
      image: "/img/burger.png",
      priceRange: [100, 149]
    },
    {
      id: 'premium',
      price: 199,
      title: "Premium Delights",
      desc: "Quality dishes at ₹150-₹199",
      image: "/img/pizza.png",
      priceRange: [150, 199]
    },
    {
      id: 'feast',
      price: 249,
      title: "Feast Special",
      desc: "Larger portions at ₹200-₹249",
      image: "/img/thali.png",
      priceRange: [200, 249]
    },
    {
      id: 'luxury',
      price: 299,
      title: "Luxury Dishes",
      desc: "Premium items at ₹250-₹299",
      image: "/img/biryani.png",
      priceRange: [250, 299]
    },
    {
      id: 'gourmet',
      price: 399,
      title: "Gourmet",
      desc: "Fine dining items ₹300+",
      image: "/img/desserts.png",
      priceRange: [300, 500]
    },
  ]

  // Mock restaurant items data - in real app, this would come from API
  const restaurantItems: Record<string, RestaurantWithItems[]> = {
    budget: [
      {
        id: 1,
        name: "Delhi Darbar Dhaba",
        image: "/img/street food.png",
        items: [
          { name: "Plain Naan", price: 40, image: "/img/northindian.png" },
          { name: "Chole Bhature", price: 80, image: "/img/thali.png" },
          { name: "Aloo Paratha", price: 70, image: "/img/northindian.png" },
        ]
      },
    ],
    mid: [
      {
        id: 2,
        name: "Burger King",
        image: "/img/burger.png",
        items: [
          { name: "Whopper Burger", price: 119, image: "/img/burger.png" },
          { name: "Cheese Burger", price: 99, image: "/img/burger.png" },
          { name: "Chicken Fries", price: 129, image: "/img/street food.png" },
        ]
      },
    ],
    premium: [
      {
        id: 3,
        name: "Pizza Hut",
        image: "/img/pizza.png",
        items: [
          { name: "Margherita Pizza", price: 180, image: "/img/pizza.png" },
          { name: "Veggie Pizza", price: 150, image: "/img/pizza.png" },
        ]
      },
    ],
    feast: [
      {
        id: 4,
        name: "Haldiram's",
        image: "/img/thali.png",
        items: [
          { name: "Chole Bhature Combo", price: 220, image: "/img/thali.png" },
          { name: "Raj Kachori", price: 200, image: "/img/street food.png" },
        ]
      },
    ],
  }

  const [foodCategories, setFoodCategories] = useState<
    Array<{ id: string; name: string; img: string | null }>
  >(() => (Array.isArray(initialCategories) ? initialCategories : []))
  const [categoriesLoading, setCategoriesLoading] = useState(
    () => !(Array.isArray(initialCategories) && initialCategories.length > 0)
  )

  useEffect(() => {
    const normalize = (
      data: Array<{ id?: string; name: string; img: string | null }>
    ) =>
      data
        .map((c) => {
          const name = typeof c.name === 'string' ? c.name.trim() : ''
          const img =
            c.img && typeof c.img === 'string' && c.img.trim() ? c.img.trim() : null
          const id =
            c.id != null && String(c.id).trim() !== '' ? String(c.id) : name
          return { id, name, img }
        })
        .filter((c) => c.name)

    // Seed SSR list + warm session cache immediately (instant paint).
    if (Array.isArray(initialCategories) && initialCategories.length > 0) {
      const seeded = normalize(initialCategories)
      setFoodCategories(seeded)
      setCategoriesLoading(false)
      try {
        sessionStorage.setItem(FOOD_CATEGORIES_CACHE_KEY, JSON.stringify(seeded))
      } catch {
        // ignore
      }
    } else {
      try {
        const raw = sessionStorage.getItem(FOOD_CATEGORIES_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as Array<{
            id: string
            name: string
            img: string | null
          }>
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFoodCategories(parsed)
            setCategoriesLoading(false)
          }
        }
      } catch {
        // Ignore cache read errors and fetch from API.
      }
    }

    // Soft revalidate in background (same DB source as customer app).
    const url = '/api/user-app-categories?store_type=FOOD'
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ id?: string; name: string; img: string | null }>) => {
        if (!Array.isArray(data)) return
        const list = normalize(data)
        setFoodCategories(list)
        try {
          sessionStorage.setItem(FOOD_CATEGORIES_CACHE_KEY, JSON.stringify(list))
        } catch {
          // Ignore cache write failures.
        }
      })
      .catch(() => {
        /* keep seeded / cached list */
      })
      .finally(() => setCategoriesLoading(false))
  }, [initialCategories])

  const categoryPages = useMemo(() => {
    const pages: FoodCategoryTile[][] = []
    for (let i = 0; i < foodCategories.length; i += TOP_PICKS_PER_PAGE) {
      pages.push(foodCategories.slice(i, i + TOP_PICKS_PER_PAGE))
    }
    return pages
  }, [foodCategories])

  const totalCategoryPages = categoryPages.length
  const showTopPicksNav = totalCategoryPages > 1

  const handleCategoryPrev = useCallback(() => {
    setCategorySlideDir('prev')
    setCategoryPage((prev) => Math.max(0, prev - 1))
  }, [])
  const handleCategoryNext = useCallback(() => {
    setCategorySlideDir('next')
    setCategoryPage((prev) => Math.min(totalCategoryPages - 1, prev + 1))
  }, [totalCategoryPages])
  const handleCategoryDot = (idx: number) => {
    setCategorySlideDir(idx > categoryPage ? 'next' : idx < categoryPage ? 'prev' : null)
    setCategoryPage(idx)
  }

  const categoryTrackRef = useRef<HTMLDivElement>(null)
  const categoryPageRef = useRef(categoryPage)
  categoryPageRef.current = categoryPage
  const [categoryDragging, setCategoryDragging] = useState(false)
  const categoryDragRef = useRef<{
    active: boolean
    startX: number
    startScroll: number
    moved: boolean
  }>({ active: false, startX: 0, startScroll: 0, moved: false })
  const suppressClickRef = useRef(false)
  /** Ignore only the next programmatic scrollTo; user scroll always updates dots. */
  const ignoreScrollSyncUntil = useRef(0)
  const pageChangeSourceRef = useRef<'ui' | 'scroll'>('ui')

  const scrollCategoryToPage = useCallback((page: number, smooth = true) => {
    const el = categoryTrackRef.current
    if (!el) return
    const width = el.clientWidth
    if (width <= 0) return
    ignoreScrollSyncUntil.current = Date.now() + (smooth ? 480 : 80)
    el.scrollTo({ left: page * width, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Arrows / dots → scroll track (not when page came from user scroll).
  useEffect(() => {
    if (totalCategoryPages <= 1) return
    if (pageChangeSourceRef.current === 'scroll') {
      pageChangeSourceRef.current = 'ui'
      return
    }
    scrollCategoryToPage(categoryPage, true)
  }, [categoryPage, totalCategoryPages, scrollCategoryToPage])

  // Bind scroll/drag after track is in the DOM (re-run when loading finishes).
  useEffect(() => {
    if (categoriesLoading || foodCategories.length === 0 || totalCategoryPages <= 1) return
    const el = categoryTrackRef.current
    if (!el) return

    const syncPageFromScroll = () => {
      if (Date.now() < ignoreScrollSyncUntil.current) return
      const width = el.clientWidth
      if (width <= 0) return
      const next = Math.round(el.scrollLeft / width)
      const clamped = Math.max(0, Math.min(totalCategoryPages - 1, next))
      if (clamped === categoryPageRef.current) return
      pageChangeSourceRef.current = 'scroll'
      setCategoryPage(clamped)
    }

    let scrollRaf = 0
    const onScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      scrollRaf = requestAnimationFrame(syncPageFromScroll)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      categoryDragRef.current = {
        active: true,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        moved: false,
      }
      suppressClickRef.current = false
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const drag = categoryDragRef.current
      if (!drag.active) return
      const dx = e.clientX - drag.startX
      if (!drag.moved && Math.abs(dx) < 8) return
      if (!drag.moved) {
        drag.moved = true
        suppressClickRef.current = true
        setCategoryDragging(true)
      }
      ignoreScrollSyncUntil.current = 0
      el.scrollLeft = drag.startScroll - dx
      e.preventDefault()
    }

    const endDrag = (e: PointerEvent) => {
      const drag = categoryDragRef.current
      if (!drag.active) return
      drag.active = false
      setCategoryDragging(false)
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (!drag.moved) return
      const width = el.clientWidth
      if (width <= 0) return
      const clamped = Math.max(
        0,
        Math.min(totalCategoryPages - 1, Math.round(el.scrollLeft / width))
      )
      pageChangeSourceRef.current = 'ui'
      setCategoryPage(clamped)
      scrollCategoryToPage(clamped, true)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickRef.current) return
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current = false
    }

    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX
      const dy = e.deltaY
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 1) {
        ignoreScrollSyncUntil.current = 0
        return
      }
      if (Math.abs(dy) < 1 && !e.shiftKey) return
      e.preventDefault()
      ignoreScrollSyncUntil.current = 0
      el.scrollLeft += dy
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', syncPageFromScroll as EventListener)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('wheel', onWheel, { passive: false })

    // Align track with current page once mounted.
    scrollCategoryToPage(categoryPageRef.current, false)

    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', syncPageFromScroll as EventListener)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('wheel', onWheel)
    }
  }, [categoriesLoading, foodCategories.length, totalCategoryPages, scrollCategoryToPage])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(foodCategories.length / TOP_PICKS_PER_PAGE) - 1)
    if (categoryPage > maxPage) setCategoryPage(0)
  }, [foodCategories.length, categoryPage])

  const popularItems = [
    {
      id: "pop-1",
      restaurantId: "chandraksh-bhoj",
      name: "Fried Rice With Manchurian",
      restaurant: "Chandraksh Bhoj",
      price: 299,
      image: "/img/friedrice.png",
      rating: 4.2,
      deliveryTime: "30-35 min"
    },
    {
      id: "pop-2",
      restaurantId: "cha-bar",
      name: "Spinach And Feta Cheese Pizza",
      restaurant: "Cha Bar",
      price: 399,
      image: "/img/Fetacheese.png",
      rating: 4.5,
      deliveryTime: "25-30 min"
    },
    {
      id: "pop-3",
      restaurantId: "chandraksh-bhoj",
      name: "Veg Biryani With Burani Raita",
      restaurant: "Chandraksh Bhoj",
      price: 249,
      image: "/img/vegbiryani.png",
      rating: 4.3,
      deliveryTime: "35-40 min"
    },
    {
      id: "pop-4",
      restaurantId: "local-sweets",
      name: "Gulab Jamun [2 Pieces]",
      restaurant: "Local",
      price: 99,
      image: "/img/gulabjamun2.png",
      rating: 4.0,
      deliveryTime: "20-25 min"
    },
    {
      id: "pop-5",
      restaurantId: "castles-barbeque",
      name: "Veg Sweet Corn Soup",
      restaurant: "Castle's Barbeque",
      price: 149,
      image: "/img/cornsoup.png",
      rating: 4.1,
      deliveryTime: "25-30 min"
    }
  ]

  // Show notification
  const showNotification = (message: string) => {
    setNotification({ show: true, message })
    setTimeout(() => {
      setNotification({ show: false, message: '' })
    }, 3000)
  }

  // Handle add to cart with restaurant switch check
  const [customizeModalItem, setCustomizeModalItem] = useState<any | null>(null);
  const handleAddWithCheck = async (item: any) => {
    // Fetch menu item details from API to check for customizations/addons/sizes
    let menuItemDetails = item;
    try {
      const res = await fetch(`/api/menu_items?id=${item.id}`);
      if (res.ok) {
        const data = await res.json();
        // Merge all possible customizability fields
        if ((data && ((data.customizations && data.customizations.length > 0) || (data.addons && data.addons.length > 0) || (data.sizes && data.sizes.length > 0)))) {
          menuItemDetails = { ...item, ...data };
        }
      }
    } catch {}

    // If item is customizable (has customizations, addons, or sizes), show customization modal first
    if ((menuItemDetails.customizations && menuItemDetails.customizations.length > 0) ||
        (menuItemDetails.addons && menuItemDetails.addons.length > 0) ||
        (menuItemDetails.sizes && menuItemDetails.sizes.length > 0) ||
        menuItemDetails.customizable) {
      setCustomizeModalItem(menuItemDetails);
      return;
    }

    // Check if adding from a different restaurant
    if (isFromDifferentRestaurant(item.restaurantId)) {
      // Get current restaurant name from cart
      const currentRestaurantName = cartItems[0]?.restaurantName || 'Current Restaurant';
      setSwitchFromRestaurant(currentRestaurantName);
      setSwitchToRestaurant(item.restaurant);
      setPendingItemFull({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        restaurantId: item.restaurantId,
        restaurant: item.restaurant
      });
      setShowSwitchModal(true);
      return;
    }

    // Add to cart normally
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      restaurantId: item.restaurantId,
      restaurantName: item.restaurant,
      image: item.image,
    });
    showNotification(`${item.name} added to cart!`);
  }


  // Handle restaurant switch confirmation
  const handleSwitchConfirm = (keepBoth: boolean) => {
    if (!pendingItemFull) return

    if (!keepBoth) {
      // Clear cart first
      clearCartItems()
    }

    // Add the pending item
    addToCart({
      id: pendingItemFull.id,
      name: pendingItemFull.name,
      price: pendingItemFull.price,
      quantity: 1,
      restaurantId: pendingItemFull.restaurantId,
      restaurantName: pendingItemFull.restaurant,
      image: pendingItemFull.image,
    })

    showNotification(`${pendingItemFull.name} added to cart!`)
    setShowSwitchModal(false)
    setPendingItemFull(null)
  }

  // Auto-scroll ref for lowest prices section
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll effect - continues even with manual scroll
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const scroll = () => {
      const containerWidth = scrollContainer.offsetWidth
      const scrollWidth = scrollContainer.scrollWidth
      const maxScroll = scrollWidth - containerWidth

      if (scrollContainer.scrollLeft < maxScroll) {
        scrollContainer.scrollLeft += 1
      } else {
        scrollContainer.scrollLeft = 0
      }
    }

    const interval = setInterval(scroll, 30)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Customization Modal for Customizable Items */}
      {customizeModalItem && (
        <CustomizeModal
          open={!!customizeModalItem}
          item={customizeModalItem}
          onClose={() => setCustomizeModalItem(null)}
          onConfirm={(customizedItem: { quantity: number; size?: any; addons?: any[] }) => {
            addToCart({ ...customizeModalItem, ...customizedItem });
            showNotification(`${customizeModalItem.name} added to cart!`);
            setCustomizeModalItem(null);
          }}
        />
      )}
      {/* Top Header Bar with Location, Sign In and Cart */}
      <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Logo - Matching Footer Style */}
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <GatiMitraLogo alt="GatiMitra" className="h-10 sm:h-11 w-auto object-contain" />
            </Link>

            {/* Search Bar - Desktop */}
            <div className="hidden md:flex flex-1 max-w-xl mx-8">
              <div className="relative w-full">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search for restaurants, dishes..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-full bg-gray-100 border border-gray-200 focus:outline-none focus:border-[#16c2a5] focus:bg-white transition-all text-sm"
                  value={searchQuery}
                  onChange={handleSearchInput}
                  onFocus={() => setShowSearchResults(true)}
                />
                {showSearchResults && searchQuery && (
                  <div className="absolute left-0 right-0 top-12 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                    {searchResults.length > 0 && searchResults.map((item, idx) => {
                      // Find restaurant name from restaurantList
                      const restaurant = restaurantList.find(r => r.restaurant_id === item.restaurant_id || r.id === item.restaurant_id);
                      const restaurantName = restaurant ? (restaurant.restaurant_name || restaurant.name) : 'Unknown Restaurant';
                      const restaurantPageUrl = restaurant
                        ? restaurantDetailHref(String(restaurant.restaurant_id || restaurant.id), 'order')
                        : '#'
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-purple-light cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 min-h-[56px]"
                          style={{ minHeight: 56 }}
                          onClick={() => restaurant && window.location.assign(restaurantPageUrl)}
                        >
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt={item.item_name}
                              className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex flex-col justify-center flex-1 min-w-0">
                            <div className="font-semibold text-text text-sm truncate">{item.item_name}</div>
                            <div className="text-xs text-blue-600 font-semibold truncate">
                              <span style={{textDecoration:'underline'}}>{restaurantName}</span>
                            </div>
                            <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                              {item.category && <span>{item.category}</span>}
                              {item.category_item && <span className="text-gray-400">{item.category_item}</span>}
                              {item.price && <span>₹{item.price}</span>}
                              {typeof item.score !== 'undefined' && <span className="text-green-600">Score: {item.score}</span>}
                            </div>
                          </div>
                          {item.score === 100 && (
                            <span className="px-2 py-1 bg-mint-light text-purple text-xs font-bold rounded-full ml-2">
                              Exact Match
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {searchResults.length === 0 && (
                      <div className="px-4 py-2 text-center text-gray-400 text-sm">No results found for "{searchQuery}"</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Section - Location and Sign In */}
            <div className="flex items-center gap-3">
              {/* Location */}
              <button
                type="button"
                onClick={() => setShowLocationSheet(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <i className="fas fa-map-marker-alt text-[#ff6b35]"></i>
                <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                  {currentLocation}
                </span>
                <i className="fas fa-chevron-down text-xs text-gray-400"></i>
              </button>

              {/* Sign In / User */}
              {isAuthenticated && user ? (
                <button 
                  onClick={() => setIsProfileModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0fa589] text-white font-semibold text-sm hover:shadow-lg transition-all"
                  type="button"
                >
                  <i className="fas fa-user"></i>
                  <span className="hidden sm:inline max-w-[115px] truncate" title={user.name || user.phone || 'User'}>
                    {truncateDisplayName(user.name || user.phone)}
                  </span>
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsAuthModalOpen(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#ff6b35] to-[#ff8451] text-white font-semibold text-sm hover:shadow-lg transition-all z-50"
                  type="button"
                >
                  <i className="fas fa-user"></i>
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              )}

            </div>
          </div>

          {/* Mobile Search */}
          <div className="md:hidden mt-3">
            <div className="relative w-full">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search for restaurants, dishes..."
                className="w-full pl-11 pr-4 py-2.5 rounded-full bg-gray-100 border border-gray-200 focus:outline-none focus:border-[#16c2a5] transition-all text-sm"
                value={searchQuery}
                onChange={handleSearchInput}
                onFocus={() => setShowSearchResults(true)}
              />
              {showSearchResults && searchQuery && (
                <div className="absolute left-0 right-0 top-12 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  {searchResults.length > 0 && searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-6 py-4 hover:bg-purple-light cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt={item.item_name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold text-text">{item.item_name}</div>
                          {item.category && (
                            <div className="text-sm text-text-light">{item.category}</div>
                          )}
                          {item.category_item && (
                            <div className="text-xs text-gray-400">{item.category_item}</div>
                          )}
                          {item.price && (
                            <div className="text-xs text-gray-500 mt-1">₹{item.price}</div>
                          )}
                          {typeof item.score !== 'undefined' && (
                            <div className="text-xs text-green-600 mt-1">Score: {item.score}</div>
                          )}
                        </div>
                        {item.score === 100 && (
                          <span className="px-2 py-1 bg-mint-light text-purple text-xs font-bold rounded-full">
                            Exact Match
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="px-6 py-4 text-center text-gray-400">No results found for "{searchQuery}"</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile Location */}
          <div className="sm:hidden mt-2 flex items-center gap-2 text-sm text-gray-600">
            <i className="fas fa-map-marker-alt text-[#ff6b35]"></i>
            <span className="truncate">{currentLocation}</span>
          </div>
        </div>
      </header>

      {showLocationNudgeBar && (
        <div className="border-b border-amber-100 bg-amber-50">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-amber-950 sm:text-[13px]">
              <i className="fas fa-map-marker-alt shrink-0 text-[#ff6b35]" aria-hidden />
              <span>
                {permissionStatus === 'denied'
                  ? 'Location is off. Turn on location access or pick an address to see stores near you.'
                  : 'Set your delivery location to see nearby stores. Showing restaurants across India until then.'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {permissionStatus === 'denied' ? (
                <>
                  <button
                    type="button"
                    onClick={handleAutoDetectCurrentLocation}
                    disabled={autoDetecting}
                    className="rounded-full bg-[#ff6b35] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#ff8451] transition-colors disabled:opacity-70 sm:px-3.5 sm:py-1.5 sm:text-xs"
                  >
                    {autoDetecting ? 'Detecting…' : 'Auto Detect Current Location'}
                  </button>
                  <button
                    type="button"
                    onClick={openManualLocationEntry}
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 transition-colors sm:px-3.5 sm:py-1.5 sm:text-xs"
                  >
                    Enter address
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowLocationSheet(true)}
                    className="rounded-full bg-[#16c2a5] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0fa589] transition-colors sm:px-3.5 sm:py-1.5 sm:text-xs"
                  >
                    Set location
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLocationWelcomeModal(true)}
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 transition-colors sm:px-3.5 sm:py-1.5 sm:text-xs"
                  >
                    Detect location
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={markLocationPromptDismissed}
                aria-label="Dismiss location prompt"
                className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-amber-800/70 hover:bg-amber-100 hover:text-amber-950 transition-colors"
              >
                <i className="fas fa-times text-xs" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      <LocationWelcomeModal
        isOpen={showLocationWelcomeModal}
        onClose={closeLocationWelcomeModal}
        onAutoDetect={handleAutoDetectCurrentLocation}
        onManualEntry={openManualLocationEntry}
        detecting={autoDetecting}
        errorMessage={welcomeDetectError}
      />

      <LocationSheet
        isOpen={showLocationSheet}
        onClose={closeLocationSheet}
        onSelectLocation={handleSelectLocation}
      />

      {serviceAreaMode === 'checking' ? (
        <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-[1400px] flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <GatiMitraSpinner />
        </div>
      ) : serviceAreaMode === 'no-service' ? (
        <OrderNoServiceArea onTryDifferentLocation={() => setShowLocationSheet(true)} />
      ) : (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 transition-opacity duration-300">
        {/* Top Picks — 7×2 carousel (reference layout) */}
        <div className="top-picks-section mb-10 sm:mb-12">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Top Picks on GatiMitra</h2>
            {showTopPicksNav && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handleCategoryPrev}
                  disabled={categoryPage === 0}
                  aria-label="Previous categories"
                  className={`top-picks-nav-btn ${
                    categoryPage === 0 ? 'top-picks-nav-btn--disabled' : 'top-picks-nav-btn--enabled'
                  }`}
                >
                  <i className="fas fa-chevron-left text-sm" />
                </button>
                <button
                  type="button"
                  onClick={handleCategoryNext}
                  disabled={categoryPage >= totalCategoryPages - 1}
                  aria-label="Next categories"
                  className={`top-picks-nav-btn ${
                    categoryPage >= totalCategoryPages - 1
                      ? 'top-picks-nav-btn--disabled'
                      : 'top-picks-nav-btn--enabled'
                  }`}
                >
                  <i className="fas fa-chevron-right text-sm" />
                </button>
              </div>
            )}
          </div>

          {categoriesLoading ? (
            <>
              <div className="hidden lg:block top-picks-grid-desktop">
                {[0, 1].map((rowIdx) => (
                  <div key={rowIdx} className="top-picks-row">
                    {Array.from({ length: TOP_PICKS_COLS }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center animate-pulse">
                        <div className="top-picks-circle bg-gray-200" />
                        <div className="mt-3 h-4 w-16 rounded bg-gray-200" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-5 sm:gap-x-4 md:grid-cols-6 lg:hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center animate-pulse">
                    <div className="top-picks-circle bg-gray-200" />
                    <div className="mt-3 h-4 w-16 rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            </>
          ) : foodCategories.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-gray-500 font-medium">No categories available yet.</p>
              <p className="text-sm text-gray-400 mt-1">Categories will show here once added in the database.</p>
            </div>
          ) : (
            <>
              <div
                ref={categoryTrackRef}
                className={`top-picks-track${categoryDragging ? ' is-dragging' : ''}${
                  totalCategoryPages > 1 ? ' top-picks-track--scrollable' : ''
                }`}
              >
                <div className="top-picks-track__inner">
                  {categoryPages.map((pageItems, pageIdx) => (
                    <div key={`top-picks-page-${pageIdx}`} className="top-picks-track__page">
                      <TopPicksPageGrid
                        items={pageItems}
                        locationQueryString={locationQueryString}
                        priority={pageIdx === 0}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {showTopPicksNav && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {Array.from({ length: totalCategoryPages }).map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleCategoryDot(idx)}
                      aria-label={`Go to category page ${idx + 1}`}
                      aria-current={idx === categoryPage ? 'true' : undefined}
                      className={idx === categoryPage ? 'top-picks-dot-active' : 'top-picks-dot'}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Top Stores For You — only when 3.5–5 rated stores exist */}
        {topStores.length > 0 && (
          <div className="mb-10 sm:mb-12 p-0">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Top Stores For You</h2>
              <button
                type="button"
                onClick={onViewRestaurants}
                className="text-sm sm:text-base text-[#FF6B6B] font-semibold hover:text-[#FF5252] transition-colors"
              >
                View All →
              </button>
            </div>
            <div
              className="flex gap-4 sm:gap-6 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {topStores.map((store) => (
                <Link
                  key={store.id}
                  href={restaurantDetailHref(store.id, 'order')}
                  className={`group shrink-0 w-[122px] sm:w-[136px] text-center no-underline transition-opacity ${
                    store.isClosed ? 'opacity-55' : 'opacity-100'
                  }`}
                >
                  <div className="relative mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-[12px] overflow-hidden">
                    <img
                      src={store.image}
                      alt={store.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-gray-900 shadow-sm">
                      {store.avgRating.toFixed(1)}
                      <i className="fas fa-star text-[8px] text-amber-400" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-900 truncate">{store.name}</p>
                  <p className="text-xs text-gray-500">{store.isClosed ? 'Closed' : store.deliveryTime}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Stores in selected location */}
        {locationStores.length > 0 && (
          <div className="mb-10 sm:mb-12 p-0">
            <h2 className="mb-5 text-xl sm:text-2xl font-bold text-gray-900">
              {currentLocation} Restaurants
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {locationStores.map((store) => (
                <Link
                  key={`location-store-${store.id}`}
                  href={restaurantDetailHref(store.id, 'order')}
                  className={`group block overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all no-underline ${
                    store.isClosed ? 'opacity-65' : ''
                  }`}
                >
                  <div className="relative h-40 w-full overflow-hidden bg-gray-100">
                    <img
                      src={store.image}
                      alt={store.name}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {store.avgRating != null ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs font-bold text-gray-900 shadow-sm">
                        {store.avgRating.toFixed(1)}
                        <i className="fas fa-star text-[10px] text-amber-400" aria-hidden />
                      </span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold text-gray-900 line-clamp-1">{store.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          store.isClosed ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {store.isClosed ? 'Closed' : 'Open'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 line-clamp-1">{store.cuisines}</p>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                      <span>{store.minOrder > 0 ? `₹${store.minOrder} for one` : 'Great prices'}</span>
                      <span>{store.isClosed ? 'Not accepting orders' : store.deliveryTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
      )}

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* User Profile Modal */}
      <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />

      {/* Restaurant Switch Modal */}
      <RestaurantSwitchModal
        isOpen={showSwitchModal}
        onClose={() => {
          setShowSwitchModal(false)
          setPendingItemFull(null)
        }}
        onConfirm={handleSwitchConfirm}
        currentRestaurantName={switchFromRestaurant}
        newRestaurantName={switchToRestaurant}
      />

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-bottom duration-300">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <i className="fas fa-check text-white"></i>
            </div>
            <span className="font-semibold">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
