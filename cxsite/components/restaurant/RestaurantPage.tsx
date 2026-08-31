"use client";

// Skeleton Loader Components
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-gradient-to-r from-purple-light/80 via-mint-light/50 to-purple-light/80 ${className}`}></div>;
}

function RestaurantSkeleton() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-4 space-y-3">
        <Skeleton className="h-3 w-52 rounded opacity-40" />
        <div className="flex justify-between gap-3">
          <Skeleton className="h-7 w-2/3 max-w-sm rounded-lg opacity-35" />
          <Skeleton className="h-12 w-28 rounded-lg opacity-35 hidden sm:block" />
        </div>
        <Skeleton className="h-3 w-full max-w-lg rounded opacity-30" />
        <Skeleton className="h-36 sm:h-48 w-full rounded-xl opacity-25" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3 pb-16">
        {[1, 2, 3, 4, 5].map((k) => (
          <Skeleton key={k} className="h-20 w-full rounded-xl opacity-20" />
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback, Fragment } from 'react'
import { Smartphone, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import AppAssetImage from '@/components/common/AppAssetImage'
import AppDownloadModal from '@/components/common/AppDownloadModal'
import AppLinkSentToast from '@/components/common/AppLinkSentToast'
import ProtectedImage from '@/components/common/ProtectedImage'
import { CX } from '@/lib/appAssetKeys'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import { useRouter } from 'next/navigation'
import { getRestaurantBreadcrumbMiddle } from '@/lib/restaurantDetailLink'
import {
  buildMerchantDeepLink,
  buildMerchantShareMessage,
} from '@/lib/merchantShare'
import { useCart } from '@/lib/hooks/useCart'
import { useCartAnimation, triggerCartAnimation } from '@/components/cart/CartAnimation'
import CustomizeModal from '@/components/cart/CustomizeModal'
import RestaurantSwitchModal from '@/components/cart/RestaurantSwitchModal'
import GroceryStoreMenuSection from '@/components/grocery/GroceryStoreMenuSection'
import type { GroceryProduct } from '@/components/grocery/GroceryProductCard'
import { useRestaurantMenuRealtime } from '@/lib/hooks/useRestaurantMenuRealtime'
import { useRestaurantStoreStatusRealtime } from '@/lib/hooks/useRestaurantStoreStatusRealtime'
// Define MenuItem and Restaurant interfaces as before
interface MenuItem {
  id: string;
  restaurant_id: string;
  item_name: string;
  name?: string;
  category: string;
  category_item?: string;
  price: number;
  offer_price?: number | null;
  image_url?: string | null;
  in_stock?: boolean;
  description?: string;
  customizations?: any[];
  sizes?: unknown[];
  addons?: unknown[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Restaurant {
  id: string
  name: string
  image?: string
  isOpen?: boolean
  rating?: number
  reviews?: number
  cuisines?: string[]
  location?: string
  openingHours?: string
  closingHours?: string
  phone?: string | null
  restaurant_id: string
  restaurant_name: string
  store_img?: string
  banner_url?: string | null
  cuisine_type?: string
  address?: string
  full_address?: string
  is_active?: boolean
  opening_time?: string | null
  closing_time?: string | null
  operational_status?: string
  avg_rating?: number | null
  total_reviews?: number | null
  written_reviews?: Array<{
    id: number
    rating: number
    food_rating: number | null
    review_title: string | null
    review_text: string
    merchant_response: string | null
    merchant_responded_at: string | null
    is_verified: boolean
    created_at: string
  }> | null
  avg_preparation_time_minutes?: number | null
  min_order_amount?: number
  delivery_time_minutes?: number | null
  delivery_fee?: number | null
  fssai_license?: string
  approval_status?: string
  is_verified?: boolean
  gallery_images?: string[] | null
  cuisine_types?: string[]
  latitude?: number | null
  longitude?: number | null
  operating_hours?: { day: string; open: boolean; slots: string[] }[] | null
}

function formatReviewCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(n))
}

function formatReviewDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Zomato-style: open directions from user's current position → destination (no typing). */
function openGoogleMapsDirections(destLat: number, destLng: number) {
  if (typeof window === 'undefined') return
  const dest = `${destLat},${destLng}`
  const openPath = (originLat: number, originLng: number) => {
    const url = `https://www.google.com/maps/dir/${originLat},${originLng}/${destLat},${destLng}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const openQueryFallback = () => {
    const q = new URLSearchParams({
      api: '1',
      destination: dest,
      travelmode: 'driving',
    })
    window.open(`https://www.google.com/maps/dir/?${q.toString()}`, '_blank', 'noopener,noreferrer')
  }
  if (!navigator.geolocation?.getCurrentPosition) {
    openQueryFallback()
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      openPath(pos.coords.latitude, pos.coords.longitude)
    },
    () => {
      openQueryFallback()
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
  )
}

const FLOATING_PROMO_ASSET_KEY = CX.home.brandBanner

const FLOATING_PROMO_TEXTS: string[][] = [
  ['Experience the Future', 'with GatiMitra'],
  ['Fast. Reliable. Affordable.', 'Only on GatiMitra'],
  ['Food, Rides & More', 'Everything in One App'],
  ["India's Smart Mobility App", 'Download GatiMitra Now'],
  ['From Food to Rides', "We've Got You Covered"],
]

/** Unique enter motion before each tagline (no wipe/clip — avoids PNG layer artifacts). */
const FLOATING_IMAGE_ANIMS = ['rise', 'zoom', 'tilt', 'drop', 'soft'] as const
type FloatingImageAnim = (typeof FLOATING_IMAGE_ANIMS)[number]

/** Interleaved reel: image (unique anim) → text → … */
const FLOATING_PROMO_SLIDES: Array<
  | { kind: 'image'; assetKey: string; anim: FloatingImageAnim }
  | { kind: 'text'; lines: string[] }
> = FLOATING_PROMO_TEXTS.flatMap((lines, idx) => [
  {
    kind: 'image' as const,
    assetKey: FLOATING_PROMO_ASSET_KEY,
    anim: FLOATING_IMAGE_ANIMS[idx % FLOATING_IMAGE_ANIMS.length],
  },
  { kind: 'text' as const, lines },
])

// Main component function
function RestaurantPage({
  restaurantId,
  entryFrom,
  groceryMenu = false,
}: {
  restaurantId: string
  entryFrom?: string
  /** Grocery store: same header/tabs as restaurants; product grid in menu tab. */
  groceryMenu?: boolean
}) {
  // Create Supabase client (move inside component)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  // Numeric merchant_stores.id PK — resolved when the store detail loads.
  // Used for store-scoped Supabase realtime filters.
  const [storeNumericId, setStoreNumericId] = useState<number | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [groceryProducts, setGroceryProducts] = useState<GroceryProduct[]>([])
  const [groceryLoadError, setGroceryLoadError] = useState<string | null>(null)
  const [, setOffers] = useState<any[]>([])
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null)
  const [loadingOffers, setLoadingOffers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { items, addToCart, decreaseItem, getCartQuantity, isFromDifferentRestaurant, restaurantName: currentCartRestaurantName, clearCartItems } = useCart()
  const { addFlyingAnimation } = useCartAnimation()

  // State for UI
  const [activeTab, setActiveTab] = useState<'menu' | 'photos' | 'reviews' | 'info'>('menu')
  const [showNotification, setShowNotification] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [localVegOnly, setLocalVegOnly] = useState(false)
  const [isTabsSticky, setIsTabsSticky] = useState(false)
  const isTabsStickyRef = useRef(false)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false)
  const [floatingDownloadExpanded, setFloatingDownloadExpanded] = useState(true)
  /** Teal promo reel index into FLOATING_PROMO_SLIDES (image ↔ text). */
  const [floatingPromoSlide, setFloatingPromoSlide] = useState(0)
  /** Typed characters for the active text slide (write / erase). */
  const [floatingPromoTyped, setFloatingPromoTyped] = useState('')
  const [downloadContextItem, setDownloadContextItem] = useState<string | null>(null)
  const [showAppLinkToast, setShowAppLinkToast] = useState(false)

  // State for restaurant switch confirmation
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [pendingAddItem, setPendingAddItem] = useState<any | null>(null)
  const [pendingItemElement, setPendingItemElement] = useState<HTMLElement | null>(null)

  // Refs for scrolling and animations
  const tabsRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const cartButtonRef = useRef<HTMLButtonElement>(null)
  const menuSectionRef = useRef<HTMLDivElement>(null)
  const menuScrollContainerRef = useRef<HTMLDivElement>(null)
  const menuSelectionsHeaderRef = useRef<HTMLDivElement>(null)
  const menuColumnRef = useRef<HTMLDivElement>(null)
  const overviewStripRef = useRef<HTMLDivElement>(null)
  const sidebarNavRef = useRef<HTMLElement>(null)
  /** Keep menu column height while filtering so sticky sidebar doesn't jump. */
  const searchListMinHeightRef = useRef<number | null>(null)
  const photosSectionRef = useRef<HTMLDivElement>(null)
  const reviewsSectionRef = useRef<HTMLDivElement>(null)
  const infoSectionRef = useRef<HTMLDivElement>(null)
  const cuisinesSectionRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const tabBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [tabInk, setTabInk] = useState({ left: 0, width: 0, top: 0, height: 0 })

  const TAB_KEYS = ['menu', 'photos', 'reviews', 'info'] as const

  const readMenuStickyTopPx = () => 0

  const syncMenuStickyTopVar = () => {
    document.documentElement.style.setProperty('--gm-restaurant-sticky-top', '0px')
  }

  /**
   * Silently re-fetches the menu without resetting loading state.
   * Used by the realtime hook and visibility-change handler so updates arrive
   * without any skeleton flash while the customer is browsing.
   */
  const silentRefreshMenu = useCallback(() => {
    if (!restaurantId) return;
    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { items?: Array<{ id: string; item_name: string; description?: string | null; image_url?: string | null; category?: string | null; category_item?: string; price: number; offer_price?: number | null; in_stock?: boolean }> } | null) => {
        if (!data?.items) return;
        const normalized: MenuItem[] = data.items.map((it) => ({
          id: String(it.id),
          restaurant_id: restaurantId,
          item_name: it.item_name ?? '',
          category: it.category ?? '',
          category_item: (it.category_item ?? 'VEG').toUpperCase().startsWith('NON') ? 'NON_VEG' : 'VEG',
          price: Number(it.price) || 0,
          offer_price: it.offer_price != null ? it.offer_price : null,
          image_url: toAbsoluteImageUrl(it.image_url ?? null) ?? it.image_url ?? null,
          in_stock: it.in_stock !== false,
          description: it.description ?? undefined,
          is_active: true,
        }));
        setMenuItems(normalized);
        setMenuLoadError(null);
      })
      .catch(() => {
        // Non-fatal: keep existing items, retry on next realtime event or visibility change.
      });
  }, [restaurantId]);

  // Realtime: subscribe to live menu table changes → silent refresh without page reload.
  useRestaurantMenuRealtime(groceryMenu ? null : restaurantId, groceryMenu ? null : storeNumericId, silentRefreshMenu);

  /**
   * Keep store hours / open status fresh while the page stays open.
   * Merchant schedule edits write operating_hours + merchant_stores live columns —
   * realtime wakes this; focus/interval remain as fallbacks.
   */
  const refreshStoreMeta = useCallback(() => {
    if (!restaurantId) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data !== 'object') return;
        setRestaurant((prev) => {
          if (!prev) return data;
          return {
            ...prev,
            ...data,
            // Preserve already-loaded menu-adjacent fields if API omits them
            operating_hours: data.operating_hours ?? prev.operating_hours,
            opening_time: data.opening_time ?? prev.opening_time,
            closing_time: data.closing_time ?? prev.closing_time,
            operational_status: data.operational_status ?? prev.operational_status,
          };
        });
      })
      .catch(() => {
        /* non-fatal background refresh */
      });
  }, [restaurantId]);

  useRestaurantStoreStatusRealtime(restaurantId, storeNumericId, refreshStoreMeta);

  useEffect(() => {
    if (!restaurantId) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshStoreMeta();
        silentRefreshMenu();
      }
    };
    const onFocus = () => {
      refreshStoreMeta();
      silentRefreshMenu();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(refreshStoreMeta, 45_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [restaurantId, silentRefreshMenu, refreshStoreMeta]);

  // Fetch data: restaurant from API; menu loads in parallel (page renders before menu finishes).
  useEffect(() => {
    setError(null);
    setMenuLoadError(null);
    setLoadingRestaurant(true);
    setLoadingMenu(true);
    setLoadingOffers(true);

    const restaurantAc = new AbortController();
    const menuAc = new AbortController();
    let menuTimedOut = false;
    const MENU_FETCH_TIMEOUT_MS = 20_000;

    const menuTimeoutId = window.setTimeout(() => {
      menuTimedOut = true;
      menuAc.abort();
    }, MENU_FETCH_TIMEOUT_MS);

    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}`, {
      signal: restaurantAc.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setRestaurant(data);
        // Capture numeric PK for store-scoped realtime channel filter.
        const numericId = data?.id != null ? Number(data.id) : NaN;
        if (Number.isFinite(numericId) && numericId > 0) setStoreNumericId(numericId);
        setLoadingRestaurant(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Restaurant not found');
        setLoadingRestaurant(false);
      });

    // Menu or grocery products for this store
    if (groceryMenu) {
      const qs = new URLSearchParams()
      qs.set('store', restaurantId)
      qs.set('limit', '120')
      fetch(`/api/grocery/products?${qs.toString()}`, { signal: menuAc.signal, cache: 'no-store' })
        .then((res) => res.json())
        .then((data: { products?: GroceryProduct[] }) => {
          setGroceryProducts(data?.products ?? [])
          setGroceryLoadError(null)
          setLoadingMenu(false)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            if (menuTimedOut) {
              setGroceryLoadError('Products are taking longer than usual. Pull to refresh or tap retry.')
            }
            setGroceryProducts([])
          } else {
            setGroceryLoadError('Could not load products. Please try again.')
            setGroceryProducts([])
          }
          setLoadingMenu(false)
        })
        .finally(() => {
          window.clearTimeout(menuTimeoutId)
        })
    } else {
    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu`, { signal: menuAc.signal, cache: 'no-store' })
      .then((res) => res.json().then((data: { items?: Array<{ id: string; item_name: string; description?: string | null; image_url?: string | null; category?: string | null; category_item?: string; price: number; offer_price?: number | null; in_stock?: boolean }> }) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        const apiItems = (ok && data?.items) ? data.items : [];
        const normalized: MenuItem[] = apiItems.map((it) => ({
          id: String(it.id),
          restaurant_id: restaurantId,
          item_name: it.item_name ?? '',
          category: it.category ?? '',
          category_item: (it.category_item ?? 'VEG').toUpperCase().startsWith('NON') ? 'NON_VEG' : 'VEG',
          price: Number(it.price) || 0,
          offer_price: it.offer_price != null ? it.offer_price : null,
          image_url: toAbsoluteImageUrl(it.image_url ?? null) ?? it.image_url ?? null,
          in_stock: it.in_stock !== false,
          description: it.description ?? undefined,
          is_active: true,
        }));
        setMenuItems(normalized);
        setMenuLoadError(null);
        setLoadingMenu(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (menuTimedOut) {
            setMenuLoadError('Menu is taking longer than usual. Pull to refresh or tap retry.');
          }
          setMenuItems([]);
        } else {
          setMenuLoadError('Could not load menu. Please try again.');
          setMenuItems([]);
        }
        setLoadingMenu(false);
      })
      .finally(() => {
        window.clearTimeout(menuTimeoutId);
      });
    }

    const now = new Date().toISOString();
    void Promise.resolve(
      supabase
        .from('offers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gt('valid_till', now)
    )
      .then(({ data, error: offersError }) => {
        if (!offersError) setOffers(data || []);
      })
      .catch(() => {
        setOffers([]);
      })
      .finally(() => {
        setLoadingOffers(false);
      });

    return () => {
      restaurantAc.abort();
      menuAc.abort();
      window.clearTimeout(menuTimeoutId);
    };
  }, [restaurantId, groceryMenu]);

  // Sidebar: All + unique category names + VEG/NON_VEG
  const categories = ['All', ...Array.from(new Set([...menuItems.map(i => i.category), ...menuItems.map(i => i.category_item)].filter(Boolean)))]

  const groceryCategories = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(groceryProducts.map((p) => p.category).filter(Boolean) as string[])
      ),
    ],
    [groceryProducts]
  )

  const browseCategories = groceryMenu ? groceryCategories : categories

  const filteredGroceryProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return groceryProducts.filter((p) => {
      const categoryMatch = selectedCategory === 'All' || p.category === selectedCategory
      const searchMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.subtitle?.toLowerCase().includes(q) ?? false) ||
        (p.category?.toLowerCase().includes(q) ?? false)
      return categoryMatch && searchMatch
    })
  }, [groceryProducts, selectedCategory, searchQuery])

  // Filtered menu items
  const filteredMenuItems = menuItems.filter(item => {
    if (item.in_stock === false) return false;
    const categoryMatch = selectedCategory === 'All' || item.category_item === selectedCategory || item.category === selectedCategory;
    const vegMatch = !localVegOnly || (String(item.category_item || item.category || '').toUpperCase() === 'VEG');
    const q = searchQuery.trim().toLowerCase();
    const searchMatch =
      !q ||
      item.item_name?.toLowerCase().includes(q) ||
      Boolean(item.description && item.description.toLowerCase().includes(q));
    return categoryMatch && vegMatch && searchMatch;
  });

  // Popular items (if any flag exists)
  // You can define popularItems logic if you have a flag, else leave empty
  const popularItems: MenuItem[] = [];

  useEffect(() => {
    setShowSkeleton(true)
  }, [restaurantId])

  // Show restaurant shell as soon as store details load; menu section has its own loader.
  useEffect(() => {
    if (!loadingRestaurant) {
      const timeout = setTimeout(() => setShowSkeleton(false), 150)
      return () => clearTimeout(timeout)
    }
  }, [loadingRestaurant])

  // Keep sticky offset in sync (no fixed header above the main store chrome).
  // Intentionally omit searchQuery — typing must not reflow sticky math / scroll.
  useLayoutEffect(() => {
    isTabsStickyRef.current = false
    setIsTabsSticky(false)
    syncMenuStickyTopVar()
    const onScrollOrResize = () => syncMenuStickyTopVar()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize)
    }
  }, [showSkeleton, activeTab])

  useLayoutEffect(() => {
    syncMenuStickyTopVar()
  }, [isTabsSticky, activeTab, showSkeleton])

  useLayoutEffect(() => {
    const headerEl = menuSelectionsHeaderRef.current
    const sync = () => {
      const headerH = headerEl?.offsetHeight ?? 120
      document.documentElement.style.setProperty('--gm-overview-strip-h', '0px')
      document.documentElement.style.setProperty('--gm-menu-selections-h', `${headerH}px`)
    }
    sync()
    const ro = typeof ResizeObserver !== 'undefined' && headerEl ? new ResizeObserver(sync) : null
    if (headerEl && ro) ro.observe(headerEl)
    return () => ro?.disconnect()
  }, [activeTab, showSkeleton])

  const clearMenuSearch = () => {
    searchListMinHeightRef.current = null
    setSearchQuery('')
  }

  // Floating card teal reel: image hold, then text write → hold → erase → next.
  useEffect(() => {
    if (!floatingDownloadExpanded) {
      setFloatingPromoSlide(0)
      setFloatingPromoTyped('')
      return
    }

    const slide = FLOATING_PROMO_SLIDES[floatingPromoSlide]
    let cancelled = false
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms))
    }
    const goNext = () => {
      if (cancelled) return
      setFloatingPromoSlide((s) => (s + 1) % FLOATING_PROMO_SLIDES.length)
    }

    if (slide.kind === 'image') {
      setFloatingPromoTyped('')
      // Enter anim ~1.1s + hold ~2s + slow fade-out ~1.5s
      later(goNext, 4800)
      return () => {
        cancelled = true
        timers.forEach((t) => window.clearTimeout(t))
      }
    }

    const full = slide.lines.join('\n')
    setFloatingPromoTyped('')
    let i = 0
    const TYPE_MS = 55
    const HOLD_MS = 1600
    const ERASE_MS = 68

    const erase = () => {
      if (cancelled) return
      i -= 1
      setFloatingPromoTyped(full.slice(0, Math.max(0, i)))
      if (i > 0) later(erase, ERASE_MS)
      else later(goNext, 320)
    }

    const type = () => {
      if (cancelled) return
      i += 1
      setFloatingPromoTyped(full.slice(0, i))
      if (i < full.length) later(type, TYPE_MS)
      else later(erase, HOLD_MS)
    }

    later(type, 350)

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [floatingDownloadExpanded, floatingPromoSlide])

  const handleMenuSearchChange = (value: string) => {
    // Lock menu column height before first filter shrink (keeps sticky sidebar stable).
    if (!searchQuery.trim() && value.trim() && menuColumnRef.current) {
      searchListMinHeightRef.current = menuColumnRef.current.offsetHeight
    }
    if (!value.trim()) {
      searchListMinHeightRef.current = null
    }
    setSearchQuery(value)
  }

  // If the first match sits ABOVE the sticky header (common after list shrinks),
  // scroll UP only so the row appears. Stop once the last result is already visible
  // so typing / filtering doesn't yank the page up again.
  useLayoutEffect(() => {
    if (activeTab !== 'menu' || !searchQuery.trim()) return
    if (filteredMenuItems.length === 0) return
    const header = menuSelectionsHeaderRef.current
    const list = menuScrollContainerRef.current
    if (!header || !list) return
    const rows = list.querySelectorAll('li')
    if (rows.length === 0) return
    const firstRow = rows[0]
    const lastRow = rows[rows.length - 1]
    const headerBottom = header.getBoundingClientRect().bottom
    const viewBottom = window.innerHeight
    const lastRect = lastRow.getBoundingClientRect()
    // Last item row already in view → ban further scroll-up.
    if (lastRect.top < viewBottom - 8 && lastRect.bottom > headerBottom + 8) {
      return
    }
    const rowTop = firstRow.getBoundingClientRect().top
    if (rowTop < headerBottom - 2) {
      window.scrollBy({ top: rowTop - headerBottom - 12, left: 0, behavior: 'instant' })
    }
  }, [searchQuery, filteredMenuItems.length, activeTab])

  // State to handle customization modal
  const [customOpen, setCustomOpen] = useState(false)
  const [customItem, setCustomItem] = useState<MenuItem | null>(null)
  const lastClickedElement = useRef<HTMLElement | null>(null)

  const openCustomizeFor = (menuItem: MenuItem, sourceEl?: HTMLElement | null) => {
    setCustomItem(menuItem)
    setCustomOpen(true)
    lastClickedElement.current = sourceEl ?? null
  }

  // Helper function to actually add the item to cart
  const performAddToCart = (itemData: any, itemElement?: HTMLElement | null) => {
    addToCart(itemData)

    // Trigger flying animation if element is provided and cart button exists
    const menuItem = menuItems.find(m => m.id === itemData.id)
    if (itemElement && cartButtonRef.current && menuItem) {
      triggerCartAnimation(
        itemElement,
        cartButtonRef.current,
        itemData.name,
        toAbsoluteImageUrl(menuItem.image_url || (menuItem as any).image) ?? '',
        addFlyingAnimation
      )
    }

    // Show notification
    setShowNotification(true)
    setTimeout(() => setShowNotification(false), 3000)
  }

  // Handle confirmation from restaurant switch modal
  const handleConfirmSwitch = (keepBoth: boolean) => {
    if (!keepBoth) {
      // Clear cart first
      clearCartItems()
    }
    if (pendingAddItem) {
      performAddToCart(pendingAddItem, pendingItemElement)
    }
    setShowSwitchModal(false)
    setPendingAddItem(null)
    setPendingItemElement(null)
  }

  const handleCancelSwitch = () => {
    setShowSwitchModal(false)
    setPendingAddItem(null)
    setPendingItemElement(null)
  }

  const handleAddToCart = (itemId: string, itemName: string, itemElement?: HTMLElement | null) => {
    const menuItem = menuItems.find(m => m.id === itemId)
    if (!menuItem || !restaurant) return

    // If this item has sizes or addons, open modal instead of adding directly
    if ((menuItem.sizes && menuItem.sizes.length > 0) || (menuItem.addons && menuItem.addons.length > 0)) {
      openCustomizeFor(menuItem, itemElement ?? null)
      return
    }

    const itemData = {
      id: itemId,
      name: itemName,
      basePrice: menuItem.price,
      quantity: 1,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      image: toAbsoluteImageUrl(menuItem.image_url || (menuItem as any).image) ?? undefined,
    }

    // Check if adding from different restaurant
    if (isFromDifferentRestaurant(restaurant.id)) {
      setPendingAddItem(itemData)
      setPendingItemElement(itemElement ?? null)
      setShowSwitchModal(true)
      return
    }

    // No switch needed -> add directly
    performAddToCart(itemData, itemElement)
  }

  // Called when modal selection is confirmed
  const handleConfirmCustomization = ({ quantity, size, addons }: { quantity: number; size?: { id: string; name: string; price: number }; addons?: { id: string; name: string; price: number }[] }) => {
    if (!customItem || !restaurant) return

    const itemData = {
      id: customItem.id,
      name: customItem.item_name,
      basePrice: customItem.price,
      quantity,
      size,
      addons,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      image: toAbsoluteImageUrl(customItem.image_url || (customItem as any).image) ?? undefined,
    }

    // Check if adding from different restaurant
    if (isFromDifferentRestaurant(restaurant.id)) {
      setPendingAddItem(itemData)
      setPendingItemElement(lastClickedElement.current)
      setShowSwitchModal(true)
      return
    }

    // Add to cart
    addToCart(itemData)

    // Trigger animation from last clicked element if present
    if (lastClickedElement.current && cartButtonRef.current) {
      triggerCartAnimation(
        lastClickedElement.current,
        cartButtonRef.current,
        customItem.item_name,
        toAbsoluteImageUrl(customItem.image_url || (customItem as any).image) ?? '',
        addFlyingAnimation
      )
    }

    setShowNotification(true)
    setTimeout(() => setShowNotification(false), 3000)
  }

  const handleRemoveFromCart = (productId: string) => {
    // Decrease one unit for given product id (handles composite entries internally)
    decreaseItem(productId)
  }

  const handleOpenAppDownloadPopup = (itemName?: string) => {
    setDownloadContextItem(itemName?.trim() ? itemName.trim() : null)
    setShowAppDownloadModal(true)
  }

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  useLayoutEffect(() => {
    const i = TAB_KEYS.indexOf(activeTab)
    const btn = tabBtnRefs.current[i]
    const list = tabListRef.current
    if (!btn || !list) return
    const lr = list.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    setTabInk({
      left: br.left - lr.left + list.scrollLeft,
      width: br.width,
      top: br.top - lr.top + list.scrollTop,
      height: br.height,
    })
  }, [activeTab, showSkeleton])

  useEffect(() => {
    const onResize = () => {
      const i = TAB_KEYS.indexOf(activeTab)
      const btn = tabBtnRefs.current[i]
      const list = tabListRef.current
      if (!btn || !list) return
      const lr = list.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      setTabInk({
        left: br.left - lr.left + list.scrollLeft,
        width: br.width,
        top: br.top - lr.top + list.scrollTop,
        height: br.height,
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeTab])

  const heroGalleryImages = useMemo(() => {
    const fallback = '/img/fav.png'
    if (!restaurant) {
      return [fallback, fallback, fallback, fallback]
    }
    const banner =
      typeof restaurant.banner_url === 'string' && restaurant.banner_url.trim() !== ''
        ? restaurant.banner_url.trim()
        : typeof restaurant.store_img === 'string' && restaurant.store_img.trim() !== ''
          ? restaurant.store_img.trim()
          : null
    const gallery = Array.isArray(restaurant.gallery_images)
      ? restaurant.gallery_images
          .filter((g): g is string => typeof g === 'string' && g.trim() !== '')
          .map((g) => g.trim())
      : []
    const withoutBanner = banner ? gallery.filter((g) => g !== banner) : gallery
    const img0 = banner ?? withoutBanner[0] ?? fallback
    const sideTiles = banner ? withoutBanner : withoutBanner.slice(1)
    const img1 = sideTiles[0] ?? img0
    const img2 = sideTiles[1] ?? img0
    const img3 = sideTiles[2] ?? img0
    return [img0, img1, img2, img3]
  }, [restaurant])

  /** Photos tab: banner + store gallery only (no menu item images) */
  const photosTabImageUrls = useMemo(() => {
    if (!restaurant) return [] as string[]
    const urls: string[] = []
    const add = (u?: string | null) => {
      if (typeof u !== 'string') return
      const t = u.trim()
      if (t === '' || urls.includes(t)) return
      urls.push(t)
    }
    if (Array.isArray(restaurant.gallery_images)) {
      restaurant.gallery_images.forEach((g) => add(g))
    }
    add(typeof restaurant.banner_url === 'string' ? restaurant.banner_url : null)
    add(restaurant.store_img ?? null)
    return urls
  }, [restaurant])

  /** First row: wide banner + 3 gallery thumbs; rest: dense grid (banner deduped from rest) */
  const galleryLayout = useMemo(() => {
    if (!restaurant) {
      return { banner: null as string | null, firstRowExtras: [] as string[], rest: [] as string[] }
    }
    const b =
      typeof restaurant.banner_url === 'string' && restaurant.banner_url.trim() !== ''
        ? restaurant.banner_url.trim()
        : null
    if (!b) {
      return { banner: null, firstRowExtras: [], rest: photosTabImageUrls }
    }
    const withoutBanner = photosTabImageUrls.filter((u) => u !== b)
    return {
      banner: b,
      firstRowExtras: withoutBanner.slice(0, 3),
      rest: withoutBanner.slice(3),
    }
  }, [restaurant, photosTabImageUrls])

  if (showSkeleton) {
    return <RestaurantSkeleton />;
  }
  // Only show error after loading completes and data is missing
  if (!loadingRestaurant && !restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
        <img src="/img/ndf.png" alt="Not found" style={{ maxWidth: 320, width: '100%', height: 'auto', opacity: 0.9 }} />
        <p className="mt-4 text-text-light text-sm">This store could not be loaded.</p>
      </div>
    );
  }
  if (!loadingRestaurant && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <p className="text-lg font-medium text-pink">{error}</p>
      </div>
    );
  }

  if (!restaurant) {
    return <RestaurantSkeleton />
  }

  // Calculate open/closed status

  const cuisineChips =
    restaurant.cuisine_types && restaurant.cuisine_types.length > 0
      ? restaurant.cuisine_types
      : restaurant.cuisine_type
        ? restaurant.cuisine_type.split(',').map((s) => s.trim()).filter(Boolean)
        : []

  /** Header me zyada lambi list nahi — baaki Info → Cuisines par */
  const HEADER_CUISINE_LIMIT = 16
  const headerCuisinePreview = cuisineChips.slice(0, HEADER_CUISINE_LIMIT)
  const headerCuisineMoreCount =
    cuisineChips.length > HEADER_CUISINE_LIMIT ? cuisineChips.length - HEADER_CUISINE_LIMIT : 0

  const heroHoursSnippet = (() => {
    const os = restaurant.operational_status
    const osu = os != null ? String(os).toUpperCase() : ''
    const openLabel = osu === 'OPEN' ? 'Open now' : os != null && String(os).trim() !== '' ? String(os) : 'Hours'

    // Prefer live merchant_store_operating_hours (today in IST). Legacy
    // merchant_stores.opening_time/closing_time are registration-era and never
    // updated when the store changes schedule — using them first caused stale times.
    const todayLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kolkata',
    }).format(new Date())
    const todayOh = restaurant.operating_hours?.find((d) => d.day === todayLabel)
    if (todayOh) {
      if (!todayOh.open) return `${openLabel} · Closed today`
      if (todayOh.slots.length > 0) return `${openLabel} · ${todayOh.slots.join(', ')}`
    }
    const anyOpenDay = restaurant.operating_hours?.find((d) => d.open && d.slots.length > 0)
    if (anyOpenDay) return `${openLabel} · ${anyOpenDay.slots.join(', ')}`

    if (restaurant.opening_time && restaurant.closing_time) {
      return `${openLabel} · ${restaurant.opening_time} – ${restaurant.closing_time}`
    }
    if (osu === 'OPEN') return 'Open now'
    if (os != null && String(os).trim() !== '') return String(os)
    return null
  })()

  const shareStore = async () => {
    const publicSlug = String(
      (restaurant as { public_slug?: string }).public_slug ||
        restaurantId ||
        ''
    ).trim()
    const deepLink = buildMerchantDeepLink(publicSlug)
    const title = restaurant.restaurant_name || 'GatiMitra'
    const message = buildMerchantShareMessage(title, deepLink, {
      cuisines: cuisineChips,
      rating: restaurant.avg_rating ?? restaurant.rating ?? null,
      location: restaurant.full_address || restaurant.address || restaurant.location || null,
    })
    try {
      if (navigator.share) {
        // text-only: WhatsApp/etc. stay clickable without duplicating url.
        await navigator.share({ title, text: message })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message)
      }
    } catch {
      /* cancelled or unsupported */
    }
  }

  const goToReviews = () => {
    setActiveTab('reviews')
    setTimeout(() => scrollToSection(reviewsSectionRef), 80)
  }

  const goToGallery = () => {
    setActiveTab('photos')
    setTimeout(() => scrollToSection(photosSectionRef), 80)
  }

  const goToInfoCuisines = () => {
    setActiveTab('info')
    setTimeout(() => {
      if (cuisinesSectionRef.current) {
        cuisinesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        scrollToSection(infoSectionRef)
      }
    }, 120)
  }

  const crumbMiddle = getRestaurantBreadcrumbMiddle(entryFrom)
  const isOpenNow = String(restaurant.operational_status ?? '').toUpperCase() === 'OPEN'

  const img0 = heroGalleryImages[0] ?? '/img/fav.png'
  const img1 = heroGalleryImages[1] ?? img0
  const img2 = heroGalleryImages[2] ?? img0
  const img3 = heroGalleryImages[3] ?? img0

  return (
    <div className="min-h-screen bg-bg text-text relative overflow-x-clip">
      {/* Ambient mesh */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-90"
        style={{
          background: `
            radial-gradient(900px 500px at 85% -10%, rgba(75, 42, 212, 0.12), transparent 55%),
            radial-gradient(700px 400px at 0% 40%, rgba(22, 194, 165, 0.14), transparent 50%),
            radial-gradient(500px 300px at 70% 90%, rgba(255, 77, 141, 0.08), transparent 45%)
          `,
        }}
      />

      {showNotification && (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in">
          <div className="gm-glass-dark px-5 py-4 rounded-2xl flex items-center gap-3 border border-white/10 shadow-[0_20px_60px_-15px_rgba(75,42,212,0.55)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-mint to-purple text-white">
              <i className="fas fa-check text-sm" />
            </span>
            <div>
              <p className="font-semibold text-white text-sm tracking-tight">Added to cart</p>
              <p className="text-xs text-white/65">Your picks are saved.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main restaurant header (no extra bar above it) */}
      <div className="bg-white border-b border-neutral-200/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-2 pb-2 sm:pt-2.5 sm:pb-2">
          <div className="flex sm:hidden items-center justify-between gap-2 mb-2">
            <nav className="text-[11px] text-text-light flex flex-wrap items-center gap-1 min-w-0" aria-label="Breadcrumb">
              <a href="/order" className="hover:text-purple transition-colors">Home</a>
              <span className="text-border/80">/</span>
              <a href={crumbMiddle.href} className="hover:text-purple transition-colors">{crumbMiddle.label}</a>
            </nav>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-text-light hover:text-purple transition-colors"
            >
              <i className="fas fa-arrow-left text-[10px]" />
              Back
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-2">
            <div className="min-w-0 flex-1">
              <nav className="hidden sm:flex text-[11px] sm:text-xs text-text-light flex-wrap items-center gap-1" aria-label="Breadcrumb">
                <a href="/order" className="hover:text-purple transition-colors">
                  Home
                </a>
                <span className="text-border/80">/</span>
                <a href={crumbMiddle.href} className="hover:text-purple transition-colors">
                  {crumbMiddle.label}
                </a>
                <span className="text-border/80">/</span>
                <span className="text-text font-medium truncate max-w-[min(100%,200px)]">{restaurant.restaurant_name}</span>
              </nav>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-[2.5rem] font-bold text-text tracking-tight leading-[1.12] mt-3 sm:mt-4 mb-2 sm:mb-2.5">
                {restaurant.restaurant_name}
              </h1>
              {headerCuisinePreview.length > 0 ? (
                <p className="text-xs sm:text-[13px] text-text-light leading-relaxed min-w-0 [overflow-wrap:anywhere]">
                  <span>{headerCuisinePreview.join(', ')}</span>
                  {headerCuisineMoreCount > 0 ? (
                    <span className="whitespace-nowrap">
                      {' '}
                      <span className="text-border/50" aria-hidden>
                        ·
                      </span>{' '}
                      <button
                        type="button"
                        onClick={goToInfoCuisines}
                        className="inline p-0 m-0 border-0 bg-transparent cursor-pointer align-baseline text-inherit font-semibold text-purple hover:text-pink underline decoration-purple/30 underline-offset-2 transition-colors"
                      >
                        +{headerCuisineMoreCount} more
                      </button>
                    </span>
                  ) : null}
                </p>
              ) : null}
              {(restaurant.full_address || restaurant.address) ? (
                <p
                  className="text-[11px] sm:text-xs text-text-light leading-snug mt-1 line-clamp-2 sm:line-clamp-3 max-w-3xl"
                  title={restaurant.full_address || restaurant.address || undefined}
                >
                  {restaurant.full_address || restaurant.address}
                </p>
              ) : null}
            </div>

            <div className="hidden sm:flex flex-col items-end gap-3 shrink-0 sm:pt-0.5">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-text-light hover:text-purple transition-colors"
              >
                <i className="fas fa-arrow-left text-[10px]" />
                Back
              </button>
              {restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
                <div className="flex flex-col items-end gap-0.5 px-0.5 text-right">
                  <div className="inline-flex items-baseline gap-1 leading-none">
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-text">
                      {Number(restaurant.avg_rating).toFixed(1)}
                    </span>
                    <i className="fas fa-star text-sm text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]" aria-hidden />
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-light/80">
                    Store rating
                  </p>
                  <p className="text-[11px] text-text-light tabular-nums">
                    {formatReviewCount(Number(restaurant.total_reviews ?? 0))} ratings
                  </p>
                </div>
              ) : (
                <div className="max-w-[9rem] text-right">
                  <p className="text-[11px] sm:text-xs font-semibold text-text leading-tight">New on GatiMitra</p>
                  <p className="text-[10px] text-text-light mt-0.5 leading-tight">Ratings after first orders</p>
                </div>
              )}
            </div>
          </div>

          <div className="sm:hidden flex justify-end mb-2">
            {restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
              <div className="flex flex-col items-end gap-0.5 px-0.5 text-right">
                <div className="inline-flex items-baseline gap-1 leading-none">
                  <span className="text-xl font-bold tabular-nums tracking-tight text-text">
                    {Number(restaurant.avg_rating).toFixed(1)}
                  </span>
                  <i className="fas fa-star text-xs text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]" aria-hidden />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-light/80">
                  Store rating
                </p>
                <p className="text-[11px] text-text-light tabular-nums">
                  {formatReviewCount(Number(restaurant.total_reviews ?? 0))} ratings
                </p>
              </div>
            ) : (
              <div className="max-w-[9rem] text-right">
                <p className="text-[11px] font-semibold text-text leading-tight">New on GatiMitra</p>
                <p className="text-[10px] text-text-light mt-0.5 leading-tight">Ratings after first orders</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-text-light mb-2">
            {heroHoursSnippet ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <i className="fas fa-clock text-mint text-[11px] sm:text-xs" aria-hidden />
                  {isOpenNow ? (
                    <span className="text-text">
                      <span className="text-orange-500 font-semibold">Open now</span>
                      <span className="text-text">
                        {heroHoursSnippet.replace(/^open\s*now\s*·\s*/i, ' · ')}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text">{heroHoursSnippet}</span>
                  )}
                </span>
                {(restaurant.min_order_amount != null || restaurant.phone) ? (
                  <span className="hidden sm:inline text-neutral-300 select-none" aria-hidden>
                    |
                  </span>
                ) : null}
              </>
            ) : null}
            {restaurant.min_order_amount != null && (
              <span className="inline-flex items-center gap-2">
                <i className="fas fa-wallet text-purple/80" aria-hidden />
                <span>
                  Min order <span className="font-semibold text-text">₹{Number(restaurant.min_order_amount)}</span>
                </span>
              </span>
            )}
            {restaurant.min_order_amount != null && restaurant.phone ? (
              <span className="hidden sm:inline text-neutral-300 select-none" aria-hidden>
                |
              </span>
            ) : null}
            {restaurant.phone ? (
              <a href={`tel:${restaurant.phone}`} className="inline-flex items-center gap-2 text-pink font-medium hover:opacity-80 transition-opacity">
                <i className="fas fa-phone" aria-hidden />
                {restaurant.phone}
              </a>
            ) : null}
            {(restaurant.is_verified ?? restaurant.approval_status === 'APPROVED') && (
              <>
                <span className="hidden sm:inline text-neutral-300 select-none" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint">
                  <i className="fas fa-circle-check" aria-hidden />
                  Verified
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {restaurant.latitude != null && restaurant.longitude != null ? (
              <button
                type="button"
                onClick={() =>
                  openGoogleMapsDirections(Number(restaurant.latitude), Number(restaurant.longitude))
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-[11px] sm:text-xs font-medium text-text hover:border-pink/50 hover:bg-neutral-50 transition-colors"
              >
                <i className="fas fa-diamond-turn-right text-pink text-[11px]" aria-hidden />
                Direction
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void shareStore()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-[11px] sm:text-xs font-medium text-text hover:border-pink/50 hover:bg-neutral-50 transition-colors"
            >
              <i className="fas fa-share-nodes text-pink text-[11px]" aria-hidden />
              Share
            </button>
            <button
              type="button"
              onClick={goToReviews}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-[11px] sm:text-xs font-medium text-text hover:border-pink/50 hover:bg-neutral-50 transition-colors"
            >
              <i className="fas fa-message text-pink text-[11px]" aria-hidden />
              Reviews
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 pb-0.5">
            <div
              ref={tabsRef}
              className={`relative min-w-0 ${activeTab === 'menu' ? 'flex-1' : 'w-full flex flex-1 justify-center'}`}
            >
              <div
                ref={tabListRef}
                className="relative inline-flex p-0.5 rounded-full bg-neutral-100/90 border border-neutral-200/80 shadow-sm overflow-x-auto no-scrollbar w-full sm:w-auto max-w-full"
              >
                <span
                  className="absolute rounded-full bg-gradient-to-r from-purple to-mint shadow-[0_4px_24px_-4px_rgba(75,42,212,0.55)] transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] pointer-events-none z-[1]"
                  style={{
                    left: tabInk.left,
                    width: Math.max(tabInk.width, 0),
                    top: tabInk.top,
                    height: Math.max(tabInk.height, 0),
                  }}
                />
                {TAB_KEYS.map((tab, i) => (
                  <button
                    key={tab}
                    type="button"
                    ref={(el) => {
                      tabBtnRefs.current[i] = el
                    }}
                    onClick={() => {
                      setActiveTab(tab)
                      if (tab === 'menu') scrollToSection(menuSectionRef)
                      else if (tab === 'photos') scrollToSection(photosSectionRef)
                      else if (tab === 'reviews') scrollToSection(reviewsSectionRef)
                      else if (tab === 'info') scrollToSection(infoSectionRef)
                    }}
                    className={`relative z-[2] flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-colors duration-200 whitespace-nowrap ${
                      activeTab === tab ? 'text-white' : 'text-text-light hover:text-text'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {tab === 'menu' && <i className="fas fa-utensils text-[11px] opacity-80" />}
                      {tab === 'photos' && <i className="fas fa-images text-[11px] opacity-80" />}
                      {tab === 'reviews' && <i className="fas fa-star text-[11px] opacity-80" />}
                      {tab === 'info' && <i className="fas fa-info-circle text-[11px] opacity-80" />}
                      <span className="capitalize">{tab}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'menu' && (
              <div className="relative w-full lg:w-60 shrink-0 lg:hidden">
                <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-mint/20 via-purple/20 to-pink/15 blur-md opacity-50 pointer-events-none" />
                <div className="relative flex items-center rounded-xl bg-white border border-neutral-200/90 shadow-sm">
                  <i className="fas fa-search text-text-light/50 pl-2.5 text-xs" />
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    placeholder="Search dishes by name…"
                    value={searchQuery}
                    onChange={(e) => handleMenuSearchChange(e.target.value)}
                    className="w-full bg-transparent py-2 pl-2 pr-8 text-xs placeholder:text-text-light/45 focus:outline-none"
                    aria-label="Search menu items"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearMenuSearch}
                      className="absolute right-2 text-text-light/50 hover:text-purple transition-colors p-0.5"
                      aria-label="Clear search"
                    >
                      <i className="fas fa-times text-xs" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo mosaic scrolls away under sticky header */}
      <div className="bg-white border-b border-neutral-200/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-4">
          <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 shadow-sm">
            <div className="md:hidden flex flex-col gap-0">
              <div className="relative aspect-[16/11] max-h-[220px] w-full bg-neutral-200">
                <ProtectedImage
                  src={img0}
                  alt={restaurant.restaurant_name}
                  fill
                  priority
                  imgClassName="object-cover"
                />
              </div>
              <div className="grid grid-cols-2 gap-0 border-t border-white/90">
                <div className="relative aspect-[4/3] border-r border-white/90 bg-neutral-200">
                  <ProtectedImage src={img1} alt="" fill imgClassName="object-cover" />
                </div>
                <div className="relative aspect-[4/3] bg-neutral-200">
                  <ProtectedImage src={img2} alt="" fill imgClassName="object-cover" />
                </div>
              </div>
              <button
                type="button"
                onClick={goToGallery}
                className="relative aspect-[16/9] w-full border-t border-white/90 bg-neutral-900 group text-left"
              >
                <ProtectedImage
                  src={img3}
                  alt=""
                  fill
                  imgClassName="object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center pointer-events-none">
                  <span className="text-white text-sm font-semibold tracking-wide">View gallery</span>
                </div>
              </button>
            </div>

            <div
              className="hidden md:grid w-full gap-0 min-h-[200px] lg:min-h-[260px]"
              style={{
                gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
                gridTemplateRows: '1fr 1fr',
              }}
            >
              <div className="relative row-span-2 col-start-1 row-start-1 bg-neutral-200 min-h-0">
                <ProtectedImage
                  src={img0}
                  alt={restaurant.restaurant_name}
                  fill
                  priority
                  imgClassName="object-cover"
                />
              </div>
              <div className="relative col-start-2 row-start-1 border-l border-white/80 bg-neutral-200 min-h-0">
                <ProtectedImage src={img1} alt="" fill priority imgClassName="object-cover" />
              </div>
              <div className="relative col-start-2 row-start-2 border-l border-t border-white/80 bg-neutral-200 min-h-0">
                <ProtectedImage src={img2} alt="" fill priority imgClassName="object-cover" />
              </div>
              <button
                type="button"
                onClick={goToGallery}
                className="relative row-span-2 col-start-3 row-start-1 border-l border-white/80 bg-neutral-900 group text-left min-h-0 overflow-hidden"
              >
                <ProtectedImage
                  src={img3}
                  alt=""
                  fill
                  imgClassName="object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                />
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center pointer-events-none">
                  <span className="text-white text-sm sm:text-base font-semibold tracking-wide drop-shadow-md">View gallery</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* —— Fluid metrics strip (scrolls with page — not sticky) —— */}
      <div ref={overviewStripRef} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 mt-1 mb-5">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-0 sm:gap-x-1 py-3 border-b border-border/40">
            {(restaurant.avg_preparation_time_minutes != null && restaurant.avg_preparation_time_minutes > 0) && (
              <>
                <div className="group flex items-center gap-2 px-3 sm:px-4 py-1 rounded-full hover:bg-white/40 transition-colors duration-300">
                  <i className="fas fa-clock text-mint text-sm group-hover:drop-shadow-[0_0_8px_rgba(22,194,165,0.7)] transition-all" />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-text-light font-semibold">Prep</p>
                    <p className="text-sm font-semibold text-text tabular-nums leading-tight">{restaurant.avg_preparation_time_minutes} min</p>
                  </div>
                </div>
                <span className="hidden sm:block w-px h-7 bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden />
              </>
            )}
            {restaurant.min_order_amount != null && (
              <>
                <div className="group flex items-center gap-2 px-3 sm:px-4 py-1 rounded-full hover:bg-white/40 transition-colors duration-300">
                  <i className="fas fa-basket-shopping text-purple text-sm group-hover:drop-shadow-[0_0_8px_rgba(75,42,212,0.5)] transition-all" />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-text-light font-semibold">Min order</p>
                    <p className="text-sm font-semibold text-text tabular-nums leading-tight">₹{Number(restaurant.min_order_amount)}</p>
                  </div>
                </div>
                <span className="hidden sm:block w-px h-7 bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden />
              </>
            )}
            <div className="group flex items-center gap-2 px-3 sm:px-4 py-1 rounded-full hover:bg-white/40 transition-colors duration-300">
              <i className="fas fa-star text-gold text-sm group-hover:drop-shadow-[0_0_10px_rgba(255,193,7,0.55)] transition-all" />
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-text-light font-semibold">Rating</p>
                {restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
                  <p className="text-sm font-semibold text-text tabular-nums leading-tight">
                    {Number(restaurant.avg_rating).toFixed(1)}{' '}
                    <span className="text-xs font-normal text-text-light">
                      · {restaurant.total_reviews ?? 0} reviews
                    </span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-text-light leading-tight">Awaiting first reviews</p>
                )}
              </div>
            </div>
          </div>
      </div>

      {/* —— Main: asymmetric columns —— */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-24 md:pb-16 pt-2">
        <div
          className={`min-w-0 [overflow-anchor:none] ${
            activeTab === 'menu'
              ? groceryMenu
                ? 'flex flex-col'
                : 'flex flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:items-start'
              : 'flex flex-col gap-4'
          }`}
        >
          {activeTab === 'menu' && !groceryMenu && (
            <aside
              ref={sidebarRef}
              className="order-1 lg:order-none shrink-0 flex flex-col space-y-6 lg:sticky lg:top-0 lg:z-50 lg:self-start lg:w-full lg:bg-bg lg:pb-6 lg:pt-4 lg:pr-2 [overflow-anchor:none]"
            >
              {!groceryMenu ? (
              <div className="shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-light mb-2.5">Diet</p>
                <button
                  type="button"
                  onClick={() => setLocalVegOnly(!localVegOnly)}
                  className={`group flex w-full items-center justify-between gap-3 py-2 border-b border-transparent hover:border-mint/25 transition-all ${
                    localVegOnly ? 'text-mint' : 'text-text'
                  }`}
                >
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_10px_#16c2a5] group-hover:scale-125 transition-transform" />
                    Veg only
                  </span>
                  <span
                    className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 ${
                      localVegOnly ? 'bg-gradient-to-r from-mint to-emerald-600' : 'bg-border/70'
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        localVegOnly ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </div>
              ) : null}
              <div className="flex flex-col min-h-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-light mb-2.5 shrink-0">Browse</p>
                <nav
                  ref={sidebarNavRef}
                  className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-2 -mx-1 px-1 lg:mx-0 lg:px-0 no-scrollbar lg:overflow-x-hidden"
                >
                  {browseCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`shrink-0 text-left px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent ${
                        selectedCategory === cat
                          ? 'text-purple bg-purple-light/50 border-border/40'
                          : 'text-text-light hover:text-text hover:bg-white/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}

          <main
            className={
              activeTab === 'menu'
                ? 'order-2 lg:order-none relative z-10 min-w-0 flex-1 isolate'
                : activeTab === 'photos'
                  ? 'w-full min-w-0'
                  : activeTab === 'info'
                    ? 'w-full min-w-0 max-w-7xl mx-auto'
                    : 'w-full min-w-0 max-w-3xl mx-auto'
            }
          >
            <div className={`${activeTab === 'menu' ? '' : 'gm-tab-panel '}min-w-0 w-full`}>
              {/* Menu Tab – 100% DB-driven: show menu only if exists, else "Menu Not Available" */}
              <div ref={menuSectionRef}>
                {activeTab === 'menu' && (
                  <div>
                    {loadingMenu ? (
                      <div className="py-12 text-center text-text-light">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                          <span className="h-2 w-2 rounded-full bg-purple animate-pulse [animation-delay:150ms]" />
                          <span className="h-2 w-2 rounded-full bg-pink animate-pulse [animation-delay:300ms]" />
                          <span className="ml-2 font-medium">{groceryMenu ? 'Loading products…' : 'Loading menu…'}</span>
                        </span>
                      </div>
                    ) : groceryMenu ? (
                      <GroceryStoreMenuSection
                        loading={false}
                        error={groceryLoadError}
                        filteredProducts={filteredGroceryProducts}
                        totalCount={groceryProducts.length}
                        categories={browseCategories}
                        searchQuery={searchQuery}
                        selectedCategory={selectedCategory}
                        onSearchChange={handleMenuSearchChange}
                        onClearSearch={clearMenuSearch}
                        onSelectCategory={setSelectedCategory}
                        menuSelectionsHeaderRef={menuSelectionsHeaderRef}
                        menuColumnRef={menuColumnRef}
                        searchListMinHeightRef={searchListMinHeightRef}
                      />
                    ) : menuLoadError ? (
                      <div className="py-20 text-center px-4">
                        <p className="text-text-light text-sm max-w-sm mx-auto mb-4">{menuLoadError}</p>
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="rounded-full bg-mint px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          Retry
                        </button>
                      </div>
                    ) : menuItems.length === 0 ? (
                      <div className="py-20 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mint mb-3">Menu</p>
                        <h3 className="text-2xl font-semibold text-text tracking-tight mb-2">Nothing listed yet</h3>
                        <p className="text-text-light text-sm max-w-xs mx-auto leading-relaxed">This store has no menu items in the catalog right now.</p>
                      </div>
                    ) : (
                      <>
                    {/* Popular Items Section - Enhanced */}
                    {popularItems.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h2 className="text-2xl font-black text-text flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink to-purple flex items-center justify-center shadow-lg shadow-pink/20">
                                <i className="fas fa-fire text-white text-lg"></i>
                              </div>
                              Popular dishes
                            </h2>
                            <p className="text-xs text-text-light">Customer favorites</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {popularItems.map((item) => (
                            <div key={item.id} className="group relative bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden border border-gray-200 transform hover:-translate-y-1">
                              <div className="absolute top-4 left-4 z-10">
                                {item.isPopular && (
                                  <span className="bg-gradient-to-r from-pink to-purple text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                                    <i className="fas fa-crown"></i>
                                    Popular
                                  </span>
                                )}
                              </div>
                              {item.image && (
                                <div className="relative h-40 w-full overflow-hidden">
                                  <ProtectedImage
                                    src={item.image}
                                    alt={item.name}
                                    fill
                                    objectFit="cover"
                                    imgClassName="group-hover:scale-110 transition-transform duration-500"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                                  <div className="absolute top-4 right-4">
                                    {item.isVeg ? (
                                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                                        <i className="fas fa-leaf text-white text-lg"></i>
                                      </div>
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                                        <i className="fas fa-drumstick-bite text-white text-lg"></i>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{item.name}</h3>
                                  <span className="text-xl font-black text-purple">₹{item.price}</span>
                                </div>
                                <p className="text-gray-600 text-xs mb-3 line-clamp-2">{item.description}</p>
                                
                                <div className="flex items-center gap-4 mb-4">
                                  {item.spiceLevel !== undefined && (
                                    <div className="flex items-center gap-1">
                                      {[...Array(3)].map((_, i) => (
                                        <i key={i} className={`fas fa-pepper-hot ${i < item.spiceLevel! ? 'text-red-500' : 'text-gray-300'}`}></i>
                                      ))}
                                      <span className="text-xs text-gray-600 ml-1">{item.spiceLevel}/3 spicy</span>
                                    </div>
                                  )}
                                  {item.prepTime && (
                                    <div className="flex items-center gap-1 text-gray-600">
                                      <i className="fas fa-clock text-sm"></i>
                                      <span className="text-xs">{item.prepTime} min</span>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div className="text-sm text-gray-500">
                                    <i className="fas fa-tag mr-1"></i>
                                    {item.category}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Menu header sticks with sidebar; dishes scroll with the page (no forced viewport height) */}
                    <div
                      ref={menuColumnRef}
                      className="w-full min-w-0"
                      style={
                        searchQuery.trim() && searchListMinHeightRef.current
                          ? { minHeight: searchListMinHeightRef.current }
                          : undefined
                      }
                    >
                      <div
                        ref={menuSelectionsHeaderRef}
                        className="sticky top-0 z-30 w-full shrink-0 isolate bg-bg pb-4 pt-4"
                      >
                        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0 shrink-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-purple/80 mb-2.5">
                              Selections
                            </p>
                            <h2 className="text-3xl sm:text-4xl font-semibold text-text tracking-tight leading-tight">
                              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple via-mint to-pink">
                                Menu
                              </span>
                              <span className="text-text-light font-normal text-lg sm:text-xl ml-2 tabular-nums">
                                {filteredMenuItems.length} dishes
                              </span>
                            </h2>
                          </div>

                          <div className="relative flex w-full min-w-0 flex-1 items-center rounded-lg border border-neutral-200/90 bg-white shadow-sm sm:mx-2 sm:max-w-md">
                            <i
                              className="fas fa-search shrink-0 pl-3 text-xs text-text-light/50"
                              aria-hidden
                            />
                            <input
                              type="text"
                              inputMode="search"
                              enterKeyHint="search"
                              placeholder="Search dishes by name…"
                              value={searchQuery}
                              onChange={(e) => handleMenuSearchChange(e.target.value)}
                              className="w-full min-w-0 bg-transparent py-2 pl-2 pr-8 text-sm placeholder:text-text-light/45 focus:outline-none"
                              aria-label="Search menu items"
                            />
                            {searchQuery ? (
                              <button
                                type="button"
                                onClick={clearMenuSearch}
                                className="absolute right-2 p-0.5 text-text-light/50 transition-colors hover:text-purple"
                                aria-label="Clear search"
                              >
                                <i className="fas fa-times text-xs" />
                              </button>
                            ) : null}
                          </div>

                          <p className="shrink-0 text-sm text-text-light">
                            {searchQuery.trim() ? (
                              <>
                                Showing{' '}
                                <span className="font-medium text-text">
                                  {filteredMenuItems.length} match
                                  {filteredMenuItems.length === 1 ? '' : 'es'} for &ldquo;
                                  {searchQuery.trim()}&rdquo;
                                </span>
                              </>
                            ) : (
                              <>
                                Showing{' '}
                                <span className="font-medium text-text">{selectedCategory}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div ref={menuScrollContainerRef} className="relative z-0 [overflow-anchor:none]">
                        {filteredMenuItems.length > 0 ? (
                          <ul className="divide-y divide-border/25">
                          {filteredMenuItems.map((item) => (
                            <li key={item.id} className="group relative py-7">
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-0 group-hover:h-3/5 bg-gradient-to-b from-transparent via-mint to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-full" aria-hidden />
                              <div className="flex gap-5 sm:gap-8 pl-0 sm:pl-2">
                                {item.image_url ? (
                                  <div className="shrink-0 rounded-2xl overflow-hidden ring-1 ring-border/40 shadow-[0_12px_40px_-20px_rgba(75,42,212,0.35)] group-hover:ring-mint/50 group-hover:shadow-[0_16px_48px_-16px_rgba(22,194,165,0.25)] transition-all duration-500">
                                    <ProtectedImage
                                      src={item.image_url}
                                      alt={item.item_name || 'Menu item'}
                                      width={104}
                                      height={104}
                                      fixedSize
                                      objectFit="cover"
                                      imgClassName="rounded-2xl"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] shrink-0 rounded-2xl bg-gradient-to-br from-purple-light/50 to-mint-light/40 flex items-center justify-center ring-1 ring-border/30 group-hover:from-purple-light group-hover:to-mint-light/60 transition-colors">
                                    <i className="fas fa-utensils text-2xl text-text-light/30" aria-hidden />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="font-semibold text-lg text-text tracking-tight group-hover:text-purple transition-colors">
                                        {item.item_name}
                                      </h3>
                                      {item.category_item && (
                                        <span
                                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-bold ${
                                            item.category_item.toUpperCase() === 'VEG'
                                              ? 'text-mint bg-mint/10'
                                              : 'text-pink bg-pink/10'
                                          }`}
                                        >
                                          {item.category_item}
                                        </span>
                                      )}
                                      {item.offer_price != null && item.offer_price < item.price && (
                                        <span className="text-[10px] tracking-wide text-gold font-bold">
                                          {Math.max(
                                            1,
                                            Math.round((1 - Number(item.offer_price) / Number(item.price)) * 100)
                                          )}
                                          % Off - Great Deals
                                        </span>
                                      )}
                                    </div>
                                    {item.category ? (
                                      <p className="text-xs text-text-light/80">{item.category}</p>
                                    ) : null}
                                    {item.description ? (
                                      <p className="text-sm text-text-light leading-relaxed max-w-xl">{item.description}</p>
                                    ) : null}
                                    {item.in_stock === false && (
                                      <p className="text-xs font-medium text-text-light">Currently unavailable</p>
                                    )}
                                  </div>
                                  <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
                                    <div className="text-right tabular-nums">
                                      {item.offer_price != null && item.offer_price < item.price ? (
                                        <>
                                          <span className="block text-sm text-text-light line-through">₹{item.price}</span>
                                          <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple to-mint">
                                            ₹{item.offer_price}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-xl font-bold text-text">₹{item.price}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="py-16 text-center space-y-4">
                          <p className="text-text-light text-sm">No dishes match your filters.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory('All')
                              clearMenuSearch()
                              setLocalVegOnly(false)
                            }}
                            className="text-sm font-semibold text-purple hover:text-mint transition-colors underline underline-offset-4 decoration-border hover:decoration-mint"
                          >
                            Reset filters
                          </button>
                        </div>
                      )}
                      </div>
                    </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Photos Tab - from gallery_images */}
              <div ref={photosSectionRef}>
                {activeTab === 'photos' && (
                  <div className="gm-tab-panel">
                    <header className="mb-10 max-w-2xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-pink/80 mb-2">Visual</p>
                      <h2 className="text-3xl sm:text-4xl font-semibold text-text tracking-tight">Gallery</h2>
                      <p className="text-text-light text-sm mt-2 leading-relaxed">A glimpse inside — swipe the hero above or explore stills here.</p>
                    </header>
                    {photosTabImageUrls.length > 0 ? (
                      <div className="w-full max-w-full space-y-3 sm:space-y-3.5">
                        {galleryLayout.banner ? (
                          <>
                            {/* Row 1: one grid → equal gaps; banner wider via fr; bordered boxes */}
                            <div className="grid w-full max-w-full grid-cols-3 gap-3 sm:grid-cols-[minmax(0,1.28fr)_repeat(3,minmax(0,1fr))] sm:gap-3 md:gap-3.5">
                              <div className="col-span-3 flex min-h-[120px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-white/75 p-2 shadow-sm dark:border-border/45 dark:bg-white/[0.06] sm:col-span-1 sm:min-h-[148px] md:min-h-[160px]">
                                <ProtectedImage
                                  src={galleryLayout.banner}
                                  alt={`${restaurant.restaurant_name} banner`}
                                  width={320}
                                  height={160}
                                  fixedSize
                                  objectFit="contain"
                                  imgClassName="max-h-[160px] max-w-full w-auto h-auto object-contain"
                                />
                              </div>
                              {galleryLayout.firstRowExtras.map((img, idx) => (
                                <div
                                  key={`row1-${img}-${idx}`}
                                  className="group flex aspect-square min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-white/75 p-2 shadow-sm dark:border-border/45 dark:bg-white/[0.06]"
                                >
                                  <ProtectedImage
                                    src={img}
                                    alt={`${restaurant.restaurant_name} photo ${idx + 1}`}
                                    width={140}
                                    height={140}
                                    fixedSize
                                    objectFit="contain"
                                    imgClassName="max-h-[140px] max-w-[140px] object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3 md:gap-3.5">
                              {galleryLayout.rest.map((img, idx) => (
                                <div
                                  key={`grid-${img}-${idx}`}
                                  className="group flex min-h-0 aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-white/75 p-2 shadow-sm dark:border-border/45 dark:bg-white/[0.06]"
                                >
                                  <ProtectedImage
                                    src={img}
                                    alt={`${restaurant.restaurant_name} photo ${idx + 1}`}
                                    width={120}
                                    height={120}
                                    fixedSize
                                    objectFit="contain"
                                    imgClassName="max-h-[120px] max-w-[120px] object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3 md:gap-3.5">
                            {photosTabImageUrls.map((img, idx) => (
                              <div
                                key={`${img}-${idx}`}
                                className="group flex min-h-0 aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-white/75 p-2 shadow-sm dark:border-border/45 dark:bg-white/[0.06]"
                              >
                                <ProtectedImage
                                  src={img}
                                  alt={`${restaurant.restaurant_name} photo ${idx + 1}`}
                                  width={120}
                                  height={120}
                                  fixedSize
                                  objectFit="contain"
                                  imgClassName="max-h-[120px] max-w-[120px] object-contain"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-text-light text-sm py-12 border-t border-border/20">No photos yet for this store.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Reviews Tab - ratings + written reviews from merchant_store_ratings */}
              <div ref={reviewsSectionRef}>
                {activeTab === 'reviews' && (
                  <div className="gm-tab-panel max-w-3xl">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-gold mb-3">Reputation</p>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-6">
                      {restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
                        <>
                          <span className="text-6xl sm:text-7xl font-semibold text-text tabular-nums tracking-tighter">
                            {Number(restaurant.avg_rating).toFixed(1)}
                          </span>
                          <span className="text-text-light text-sm">
                            from <span className="text-text font-medium">{restaurant.total_reviews ?? 0}</span> reviews
                          </span>
                        </>
                      ) : (
                        <span className="text-2xl font-medium text-text">Fresh on the platform</span>
                      )}
                    </div>
                    {restaurant.avg_rating != null && restaurant.avg_rating > 0 && (
                      <div className="flex gap-1 mb-10">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <i
                            key={i}
                            className={`fas fa-star text-xl ${i <= Math.round(restaurant.avg_rating!) ? 'text-gold drop-shadow-[0_0_12px_rgba(255,193,7,0.35)]' : 'text-border/40'}`}
                            aria-hidden
                          />
                        ))}
                      </div>
                    )}

                    {(restaurant.written_reviews?.length ?? 0) > 0 ? (
                      <ul className="space-y-6 border-t border-border/25 pt-8">
                        {restaurant.written_reviews!.map((review) => (
                          <li key={review.id} className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <i
                                    key={i}
                                    className={`fas fa-star text-xs ${i <= review.rating ? 'text-gold' : 'text-border/40'}`}
                                    aria-hidden
                                  />
                                ))}
                              </div>
                              {review.is_verified ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-mint">
                                  Verified
                                </span>
                              ) : null}
                              {review.created_at ? (
                                <span className="text-xs text-text-light">{formatReviewDate(review.created_at)}</span>
                              ) : null}
                            </div>
                            {review.review_title ? (
                              <p className="text-sm font-semibold text-text tracking-tight">{review.review_title}</p>
                            ) : null}
                            <p className="text-sm text-text-light leading-relaxed whitespace-pre-wrap">
                              {review.review_text}
                            </p>
                            {review.merchant_response ? (
                              <div className="mt-2 rounded-lg border border-border/30 bg-white/60 px-3 py-2.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple/80 mb-1">
                                  Restaurant reply
                                </p>
                                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                                  {review.merchant_response}
                                </p>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
                      <p className="text-text-light text-sm leading-relaxed border-t border-border/25 pt-8">
                        Customers have rated this store, but no written reviews are available yet.
                      </p>
                    ) : (
                      <p className="text-text-light text-sm leading-relaxed border-t border-border/25 pt-8">
                        No ratings yet for this store.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Info Tab — plain text, two columns on large screens (no cards) */}
              <div ref={infoSectionRef}>
                {activeTab === 'info' && (
                  <div className="gm-tab-panel w-full min-w-0 max-w-7xl mx-auto space-y-10 px-0 sm:px-1">
                    <header className="border-b border-border/25 pb-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-mint mb-2">Details</p>
                      <h2 className="text-3xl sm:text-4xl font-semibold text-text tracking-tight">Store information</h2>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 lg:gap-x-24 xl:gap-x-32 2xl:gap-x-40 gap-y-10 min-w-0">
                      <section className="space-y-4 min-w-0">
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-light flex items-center gap-2">
                          <span className="h-px flex-1 max-w-[2rem] bg-gradient-to-r from-mint to-transparent" aria-hidden />
                          Hours
                        </h3>
                        {restaurant.operational_status != null && (
                          <p className="text-sm text-text-light">
                            Status{' '}
                            <span
                              className={`font-semibold ${
                                String(restaurant.operational_status).toUpperCase() === 'OPEN'
                                  ? 'text-orange-500'
                                  : 'text-text'
                              }`}
                            >
                              {String(restaurant.operational_status)}
                            </span>
                          </p>
                        )}
                        {(restaurant.operating_hours && restaurant.operating_hours.length > 0) ? (
                          <ul className="space-y-0">
                            {restaurant.operating_hours.map((d, i) => (
                              <li
                                key={i}
                                className="flex flex-wrap justify-between gap-2 py-2.5 border-b border-border/20 last:border-0 text-sm"
                              >
                                <span className="font-medium text-text">{d.day}</span>
                                <span className="text-text-light text-right">
                                  {d.open ? (d.slots.length > 0 ? d.slots.join(', ') : 'Open') : 'Closed'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (restaurant.opening_time != null || restaurant.closing_time != null) ? (
                          <div className="space-y-2 text-sm">
                            {restaurant.opening_time != null && (
                              <p className="text-text">
                                <span className="text-text-light mr-2">Opens</span>
                                {restaurant.opening_time}
                              </p>
                            )}
                            {restaurant.closing_time != null && (
                              <p className="text-text">
                                <span className="text-text-light mr-2">Closes</span>
                                {restaurant.closing_time}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-text-light">Hours are not listed for this store yet.</p>
                        )}
                      </section>

                      <section className="space-y-6 min-w-0">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-light flex items-center gap-2 mb-3">
                            <span className="h-px flex-1 max-w-[2rem] bg-gradient-to-r from-purple to-transparent" aria-hidden />
                            Contact
                          </h3>
                          {restaurant.phone ? (
                            <a
                              href={`tel:${restaurant.phone}`}
                              className="inline-flex items-center gap-2 text-lg font-medium text-text hover:text-mint transition-colors"
                            >
                              <i className="fas fa-phone text-mint text-sm" aria-hidden />
                              {restaurant.phone}
                            </a>
                          ) : (
                            <p className="text-sm text-text-light">No phone listed.</p>
                          )}
                          {restaurant.min_order_amount != null && (
                            <p className="text-sm text-text-light mt-3">
                              Min order <span className="font-semibold text-text">₹{Number(restaurant.min_order_amount)}</span>
                            </p>
                          )}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-light mb-3">Address</h3>
                          <p className="text-text leading-relaxed text-base sm:text-lg">
                            {restaurant.full_address || restaurant.address || '—'}
                          </p>
                          {restaurant.latitude != null && restaurant.longitude != null && (
                            <button
                              type="button"
                              onClick={() =>
                                openGoogleMapsDirections(
                                  Number(restaurant.latitude),
                                  Number(restaurant.longitude)
                                )
                              }
                              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple hover:text-pink transition-colors"
                            >
                              Directions on Maps <i className="fas fa-external-link-alt text-xs" aria-hidden />
                            </button>
                          )}
                        </div>
                      </section>
                    </div>

                    {(cuisineChips.length > 0 || restaurant.fssai_license) && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 lg:gap-x-24 xl:gap-x-32 2xl:gap-x-40 gap-y-8 pt-4 border-t border-border/20 min-w-0">
                        {cuisineChips.length > 0 && (
                          <section
                            id="store-info-cuisines"
                            ref={cuisinesSectionRef}
                            className={`scroll-mt-28 space-y-3 min-w-0 max-w-full ${!restaurant.fssai_license ? 'lg:col-span-2' : ''}`}
                          >
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-light">Cuisines</h3>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 text-sm sm:text-base leading-relaxed text-text min-w-0 max-w-full [overflow-wrap:anywhere]">
                              {cuisineChips.map((c, idx) => (
                                <Fragment key={`${c}-${idx}`}>
                                  {idx > 0 ? (
                                    <span className="text-border/60 select-none shrink-0" aria-hidden>
                                      ·
                                    </span>
                                  ) : null}
                                  <span className="text-purple font-medium break-words">{c}</span>
                                </Fragment>
                              ))}
                            </div>
                          </section>
                        )}
                        {restaurant.fssai_license ? (
                          <section className="space-y-2 min-w-0">
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-light">FSSAI</h3>
                            <p className="font-mono text-sm text-text tracking-wide break-all">{restaurant.fssai_license}</p>
                          </section>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Fixed download module — above sticky overview so its border never cuts the card */}
      <div className={`${activeTab === 'menu' ? 'hidden md:block' : 'hidden'} fixed bottom-6 right-6 z-[80]`}>
        {floatingDownloadExpanded ? (
          <div className="relative w-[320px] rounded-2xl overflow-hidden border border-neutral-900/10 bg-[#171a20] shadow-[0_26px_52px_-22px_rgba(0,0,0,0.65)]">
            <button
              type="button"
              onClick={() => setFloatingDownloadExpanded(false)}
              aria-label="Hide app download card"
              className="absolute top-2.5 left-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="grid grid-cols-[1.65fr_1fr] min-h-[168px] isolate">
              <div className="relative z-[1] flex flex-col justify-between bg-[#171a20] p-5 pr-3 text-white">
                <p className="pl-8 pt-0.5 text-[14px] font-semibold leading-[1.35] tracking-tight">
                  For a better experience, please order through our mobile app
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAppDownloadPopup()}
                  className="gm-promo-download-btn mt-3 inline-flex w-fit items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-100"
                >
                  Download the App
                </button>
              </div>

              <div className="relative flex min-h-[168px] items-center justify-center overflow-hidden bg-[#18d4b3]">
                {FLOATING_PROMO_SLIDES.map((slide, i) => {
                  const active = floatingPromoSlide === i
                  const typedLines =
                    active && slide.kind === 'text'
                      ? floatingPromoTyped.split('\n')
                      : []
                  return (
                    <div
                      key={i}
                      className={`absolute inset-0 z-[2] flex items-center justify-center px-2 ${
                        active ? 'gm-promo-slide-in' : 'gm-promo-slide-out'
                      }`}
                      aria-hidden={!active}
                    >
                      {slide.kind === 'image' ? (
                        <div
                          className={`relative flex h-full w-full items-center justify-center ${
                            active ? `gm-promo-img gm-promo-img--${slide.anim}` : ''
                          }`}
                        >
                          <AppAssetImage
                            key={active ? `promo-img-${i}-${floatingPromoSlide}` : `promo-img-${i}`}
                            assetKey={slide.assetKey}
                            alt=""
                            className="h-[152px] w-auto max-w-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.22)]"
                            decoding="async"
                            fetchPriority="high"
                          />
                        </div>
                      ) : (
                        <p className="min-h-[2.6em] w-full text-center text-[11px] font-extrabold leading-[1.25] tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.28)] [font-family:var(--font-montserrat),system-ui,sans-serif]">
                          {active
                            ? typedLines.map((line, li) => (
                                <span key={li} className="block">
                                  {line}
                                  {li === typedLines.length - 1 ? (
                                    <span className="gm-promo-caret" aria-hidden>
                                      |
                                    </span>
                                  ) : null}
                                </span>
                              ))
                            : null}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFloatingDownloadExpanded(true)}
            aria-label="Show app download card"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-900/10 bg-[#171a20] text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] hover:bg-[#22262e] hover:scale-105 active:scale-95 transition-all"
          >
            <Smartphone className="h-6 w-6" strokeWidth={2} />
          </button>
        )}
      </div>

      {showAppDownloadModal && (
        <AppDownloadModal
          isOpen={showAppDownloadModal}
          onClose={() => setShowAppDownloadModal(false)}
          variant="customer"
          title="Get the GatiMitra App"
          description={
            downloadContextItem
              ? `To order "${downloadContextItem}", please use our mobile app for the best experience.`
              : 'For a better experience, please order through our mobile app.'
          }
          onLinkSent={() => setShowAppLinkToast(true)}
        />
      )}
      <AppLinkSentToast open={showAppLinkToast} onClose={() => setShowAppLinkToast(false)} />

      {/* Add custom styles for animations */}
      <CustomizeModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        item={customItem ? { id: customItem.id, name: customItem.item_name, basePrice: customItem.price, sizes: customItem.sizes, addons: customItem.addons, image: toAbsoluteImageUrl(customItem.image_url) ?? undefined } : undefined}
        onConfirm={handleConfirmCustomization}
      />
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes gm-sparkle-pulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @keyframes gm-float-y {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        /* Image enters (unique per slot) then slow fade — no clip-path (avoids PNG layer seams) */
        @keyframes gm-promo-img-rise {
          0% {
            opacity: 0;
            transform: translate3d(0, 22px, 0) scale(0.94);
          }
          22% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          68% {
            opacity: 1;
            transform: translate3d(0, -2px, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, -8px, 0) scale(0.98);
          }
        }

        @keyframes gm-promo-img-zoom {
          0% {
            opacity: 0;
            transform: scale(0.78);
          }
          24% {
            opacity: 1;
            transform: scale(1.03);
          }
          40% {
            transform: scale(1);
          }
          68% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.06);
          }
        }

        @keyframes gm-promo-img-tilt {
          0% {
            opacity: 0;
            transform: rotate(-8deg) scale(0.9) translate3d(-10px, 8px, 0);
          }
          26% {
            opacity: 1;
            transform: rotate(1.5deg) scale(1.02) translate3d(0, 0, 0);
          }
          40% {
            transform: rotate(0deg) scale(1);
          }
          68% {
            opacity: 1;
            transform: rotate(0deg) scale(1);
          }
          100% {
            opacity: 0;
            transform: rotate(5deg) scale(0.96) translate3d(8px, -4px, 0);
          }
        }

        @keyframes gm-promo-img-drop {
          0% {
            opacity: 0;
            transform: translate3d(0, -26px, 0) scale(0.92);
          }
          20% {
            opacity: 1;
            transform: translate3d(0, 4px, 0) scale(1.02);
          }
          32% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          68% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 12px, 0) scale(0.97);
          }
        }

        @keyframes gm-promo-img-soft {
          0% {
            opacity: 0;
            transform: scale(1.08);
            filter: blur(6px);
          }
          28% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          68% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.96);
            filter: blur(4px);
          }
        }

        .gm-promo-img img {
          will-change: transform, opacity, filter;
        }

        .gm-promo-img--rise img {
          animation: gm-promo-img-rise 4.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .gm-promo-img--zoom img {
          animation: gm-promo-img-zoom 4.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .gm-promo-img--tilt img {
          animation: gm-promo-img-tilt 4.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .gm-promo-img--drop img {
          animation: gm-promo-img-drop 4.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .gm-promo-img--soft img {
          animation: gm-promo-img-soft 4.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes gm-promo-caret-blink {
          0%,
          45% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }

        .gm-promo-caret {
          display: inline-block;
          margin-left: 1px;
          font-weight: 700;
          animation: gm-promo-caret-blink 0.9s steps(1) infinite;
        }

        @keyframes gm-promo-download-pulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35);
          }
          40% {
            transform: scale(1.04);
            box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
          }
          70% {
            transform: scale(1.015);
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
          }
        }

        .gm-promo-download-btn {
          animation: gm-promo-download-pulse 2.4s ease-in-out infinite;
          will-change: transform, box-shadow;
        }

        .gm-promo-download-btn:hover {
          animation-play-state: paused;
          transform: scale(1.03);
        }

        .gm-promo-slide-in {
          opacity: 1;
          transform: none;
          filter: none;
          pointer-events: auto;
          transition: opacity 0.45s ease;
        }

        .gm-promo-slide-out {
          opacity: 0;
          transform: none;
          filter: none;
          pointer-events: none;
          transition: opacity 0.35s ease;
        }

        /* Opacity-only: a lingering transform on .gm-tab-panel breaks position:sticky
           against the viewport (overlap at end of scroll). */
        @keyframes gm-tab-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }

        .gm-glass-dark {
          background: rgba(12, 12, 22, 0.55);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .gm-sparkle {
          animation: gm-sparkle-pulse 3.5s ease-in-out infinite;
        }

        .gm-sparkle-delay {
          animation-delay: 1.1s;
        }

        .gm-sparkle-delay2 {
          animation-delay: 2.2s;
        }

        .gm-float {
          animation: gm-float-y 5s ease-in-out infinite;
        }

        .gm-chip {
          animation: gm-float-y 6s ease-in-out infinite;
        }

        .gm-tab-panel {
          animation: gm-tab-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .line-clamp-1 {
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
        }

        .line-clamp-2 {
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
      `}</style>

      {/* Restaurant Switch Confirmation Modal */}
      <RestaurantSwitchModal
        isOpen={showSwitchModal}
        onClose={handleCancelSwitch}
        onConfirm={handleConfirmSwitch}
        currentRestaurantName={currentCartRestaurantName || 'Previous Restaurant'}
        newRestaurantName={restaurant.name}
      />
    </div>
  )
}

export default RestaurantPage;