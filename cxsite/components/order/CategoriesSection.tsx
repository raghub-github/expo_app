'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { normalizeCategoryImageUrl } from '@/lib/normalizeCategoryImageUrl'
import { truncateDisplayName } from '@/lib/truncateDisplayName'
import LocationSheet from '@/components/location-search/LocationSheet'
import OrderNoServiceArea from '@/components/order/OrderNoServiceArea'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import type { OrderServiceAreaMode } from '@/lib/hooks/useOrderServiceArea'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import { getMagicpinPathAfterLocationSelect, mergeLocationNavigationUrl } from '@/lib/magicpinLocationUrl'
import type { LocationItem } from '@/components/location-search/LocationPopup'

interface CategoriesSectionProps {
  onViewRestaurants: () => void
  vegOnly: boolean
  onAddToCart?: (item: CartItem) => void
  /** When user committed location: loading / no restaurants in 10km — controls main body only. */
  serviceAreaMode?: OrderServiceAreaMode
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

const FOOD_CATEGORIES_CACHE_KEY = 'gatimitra_food_categories_v1'

function TopPickCategoryCard({
  category,
  locationQueryString,
}: {
  category: { id: string; name: string; img: string | null }
  locationQueryString?: string
}) {
  const [imgBroken, setImgBroken] = useState(false)
  const src = category.img ? normalizeCategoryImageUrl(category.img) : null
  const firstLetter = (category.name && category.name.trim()[0]) || '?'
  const showImage = Boolean(src) && !imgBroken

  return (
    <Link
      href={`/restaurants?category=${encodeURIComponent(category.name)}${locationQueryString ? `&${locationQueryString}` : ''}`}
      className="group flex w-full min-w-0 flex-col items-center text-center cursor-pointer no-underline"
      aria-label={category.name}
    >
      {/* Fixed square tile — transparent (no card box / border); size still uniform */}
      <div className="mb-3 flex h-24 w-24 shrink-0 items-center justify-center overflow-visible rounded-2xl bg-transparent p-2 transition-transform duration-300 group-hover:scale-105 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36">
        {showImage ? (
          <img
            src={src!}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain object-center"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#FF6B6B] select-none">
            {firstLetter.toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-xs sm:text-sm font-medium text-gray-800 group-hover:text-[#FF6B6B] transition-colors">
        {category.name}
      </div>
    </Link>
  )
}

export default function CategoriesSection({
  onViewRestaurants,
  vegOnly,
  onAddToCart,
  serviceAreaMode = 'full',
}: CategoriesSectionProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dispatch = useDispatch();
  const { isFromDifferentRestaurant, clearCartItems, addToCart } = useCart()
  const [selectedPriceCard, setSelectedPriceCard] = useState<string | null>(null)
  const [showLocationSheet, setShowLocationSheet] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [categoryPage, setCategoryPage] = useState(0)
  
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
        const deliveryTime = Number(r?.delivery_time_minutes ?? r?.deliveryTime ?? 30)
        const avgRating = Number(r?.avg_rating ?? r?.rating)
        const operationalStatus = String(r?.operational_status ?? '').toUpperCase()
        const isClosed = operationalStatus !== 'OPEN' && operationalStatus !== ''
        if (!id || !name) return null
        return {
          id,
          name,
          image: image || '/img/placeholder.png',
          deliveryTime: Number.isFinite(deliveryTime) && deliveryTime > 0 ? Math.round(deliveryTime) : 30,
          avgRating: Number.isFinite(avgRating) && avgRating > 0 ? avgRating : null,
          isClosed,
        }
      })
      .filter(Boolean) as Array<{
      id: string
      name: string
      image: string
      deliveryTime: number
      avgRating: number | null
      isClosed: boolean
    }>

    const sorted = stores
      .map((store, index) => ({ store, index }))
      .sort((a, b) => {
        const ar = a.store.avgRating
        const br = b.store.avgRating
        // Rated stores first (higher rating first), unrated at the end in original order.
        if (ar == null && br == null) return a.index - b.index
        if (ar == null) return 1
        if (br == null) return -1
        if (br !== ar) return br - ar
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
        const deliveryTime = Number(r?.delivery_time_minutes ?? r?.deliveryTime ?? 30)
        const operationalStatus = String(r?.operational_status ?? '').toUpperCase()
        const isClosed = operationalStatus !== 'OPEN' && operationalStatus !== ''
        if (!id || !name) return null
        return {
          id,
          name,
          image: image || '/img/placeholder.png',
          cuisines,
          minOrder: Number.isFinite(minOrder) && minOrder > 0 ? Math.round(minOrder) : 0,
          deliveryTime: Number.isFinite(deliveryTime) && deliveryTime > 0 ? Math.round(deliveryTime) : 30,
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
      deliveryTime: number
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
  const { location: locationState, setLocation: setGlobalLocation } = useLocationContext()
  const locationCommitted = locationState.locationCommittedByUser === true
  const restaurantGeoQs = useMemo(
    () => getRestaurantGeoQueryString(locationState, locationCommitted),
    [locationState, locationCommitted]
  )
  const orderGeoQs = useMemo(() => {
    const qLat = searchParams?.get('lat')
    const qLon = searchParams?.get('lon')
    const lat = qLat != null ? Number(qLat) : NaN
    const lon = qLon != null ? Number(qLon) : NaN
    const hasValidCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      !(lat === 0 && lon === 0)
    if (hasValidCoords) {
      const p = new URLSearchParams()
      p.set('lat', String(lat))
      p.set('lon', String(lon))
      p.set('radius_km', '10')
      return p.toString()
    }
    return restaurantGeoQs
  }, [searchParams, restaurantGeoQs])
  const currentLocation = useMemo(() => {
    const fromQuery = searchParams?.get('location')
    if (typeof fromQuery === 'string' && fromQuery.trim() !== '') {
      return decodeURIComponent(fromQuery)
    }
    return locationState.displayName || 'Detecting location...'
  }, [searchParams, locationState.displayName])
  const locationQueryString = useMemo(() => {
    const p = new URLSearchParams()
    const qLocation = searchParams?.get('location')
    const qLat = searchParams?.get('lat')
    const qLon = searchParams?.get('lon')
    if (qLocation && qLocation.trim() !== '') p.set('location', qLocation)
    if (qLat && qLon) {
      const lat = Number(qLat)
      const lon = Number(qLon)
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180 &&
        !(lat === 0 && lon === 0)
      ) {
        p.set('lat', qLat)
        p.set('lon', qLon)
      }
    } else if (locationState.lat != null && locationState.lon != null) {
      p.set('lat', String(locationState.lat))
      p.set('lon', String(locationState.lon))
    }
    if (!p.get('location') && locationState.displayName) {
      p.set('location', locationState.displayName)
    }
    return p.toString()
  }, [searchParams, locationState.displayName, locationState.lat, locationState.lon])

  useEffect(() => {
    const q = orderGeoQs ? `?${orderGeoQs}` : ''
    fetch(`/api/restaurants${q}`)
      .then((res) => res.json())
      .then((data) => setRestaurantList(data || []))
      .catch(() => setRestaurantList([]))
  }, [orderGeoQs])

  // On refresh, sync URL location params back into global location context.
  useEffect(() => {
    const fromQuery = searchParams?.get('location')
    const qLat = searchParams?.get('lat')
    const qLon = searchParams?.get('lon')
    const lat = qLat != null ? Number(qLat) : NaN
    const lon = qLon != null ? Number(qLon) : NaN
    const hasValidCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      !(lat === 0 && lon === 0)
    if (fromQuery && hasValidCoords) {
      setGlobalLocation(fromQuery, lat, lon, { userInitiated: true })
    }
  }, [searchParams, setGlobalLocation])

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
      fetch(`/api/search?q=${encodeURIComponent(value)}${orderGeoQs ? `&${orderGeoQs}` : ''}`)
        .then(res => res.json())
        .then(data => {
          searchCache.current[value] = data || [];
          setSearchResults(data || []);
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
  >([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FOOD_CATEGORIES_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ id: string; name: string; img: string | null }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFoodCategories(parsed)
          setCategoriesLoading(false)
          return
        }
      }
    } catch {
      // Ignore cache read errors and fetch from API.
    }

    setCategoriesLoading(true)
    const url = '/api/user-app-categories?store_type=FOOD'
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{ id?: string; name: string; img: string | null }>) => {
          if (!Array.isArray(data)) {
            setFoodCategories([])
            return
          }
          const list = data
            .map((c) => {
              const name = typeof c.name === 'string' ? c.name.trim() : ''
              const img =
                c.img && typeof c.img === 'string' && c.img.trim()
                  ? c.img.trim()
                  : null
              const id =
                c.id != null && String(c.id).trim() !== ''
                  ? String(c.id)
                  : name
              return { id, name, img }
            })
            .filter((c) => c.name)
          setFoodCategories(list)
          try {
            sessionStorage.setItem(FOOD_CATEGORIES_CACHE_KEY, JSON.stringify(list))
          } catch {
            // Ignore cache write failures.
          }
        }
      )
      .catch(() => setFoodCategories([]))
      .finally(() => setCategoriesLoading(false))
  }, [])

  const categoryPages = useMemo(() => {
    const pages: Array<{ id: string; name: string; img: string | null }[]> = []
    for (let i = 0; i < foodCategories.length; i += 14) {
      pages.push(foodCategories.slice(i, i + 14))
    }
    return pages
  }, [foodCategories])

  const totalCategoryPages = categoryPages.length

  const handleCategoryPrev = () => {
    setCategoryPage((prev) => Math.max(0, prev - 1))
  }
  const handleCategoryNext = () => {
    setCategoryPage((prev) => Math.min(totalCategoryPages - 1, prev + 1))
  }
  const handleCategoryDot = (idx: number) => {
    setCategoryPage(idx)
  }

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(foodCategories.length / 14) - 1)
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
    <div className="min-h-screen bg-[#f5f5f5]">
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
              <img 
                src="/img/logoo.png" 
                alt="Brand Logo" 
                className="h-10 sm:h-11 w-auto object-contain"
              />
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
      <LocationSheet
        isOpen={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
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
        {/* Header with Search */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            What would you like to order?
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Choose from our wide variety of delicious cuisines
          </p>
        </div>

        {/* Order our best food options - Dynamic categories from database */}
        <div className="mb-10 sm:mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Top Picks on GatiMitra</h2>
            {foodCategories.length > 14 && (
              <div className="flex gap-2">
                <button
                  onClick={handleCategoryPrev}
                  disabled={categoryPage === 0}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    categoryPage === 0
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <i className="fas fa-chevron-left text-sm"></i>
                </button>
                <button
                  onClick={handleCategoryNext}
                  disabled={categoryPage >= totalCategoryPages - 1}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    categoryPage >= totalCategoryPages - 1
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <i className="fas fa-chevron-right text-sm"></i>
                </button>
              </div>
            )}
          </div>

          {categoriesLoading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-4 sm:gap-6">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex w-full min-w-0 flex-col items-center animate-pulse">
                  <div className="mb-3 h-24 w-24 shrink-0 rounded-2xl bg-gray-200 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36" />
                  <div className="h-4 w-16 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : foodCategories.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-gray-500 font-medium">No categories available yet.</p>
              <p className="text-sm text-gray-400 mt-1">Categories will show here once added in the database.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: `translate3d(-${categoryPage * 100}%, 0, 0)` }}
                >
                  {categoryPages.map((pageItems, pageIdx) => (
                    <div
                      key={`top-picks-page-${pageIdx}`}
                      className="min-w-full grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-4 sm:gap-6"
                    >
                      {pageItems.map((category) => (
                        <TopPickCategoryCard
                          key={category.id}
                          category={category}
                          locationQueryString={locationQueryString}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {totalCategoryPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  {Array.from({ length: totalCategoryPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleCategoryDot(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === categoryPage ? 'bg-[#FF6B6B] w-6' : 'bg-gray-300 hover:bg-gray-400 w-2'
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Top Stores For You */}
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
          {topStores.length > 0 ? (
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
                  <div className="mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-[12px] overflow-hidden">
                    <img
                      src={store.image}
                      alt={store.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-900 truncate">{store.name}</p>
                  <p className="text-xs text-gray-500">{store.isClosed ? 'Closed' : `${store.deliveryTime} min`}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 py-2">Stores will appear here shortly.</div>
          )}
        </div>

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
                      <span>{store.isClosed ? 'Not accepting orders' : `${store.deliveryTime} min`}</span>
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
