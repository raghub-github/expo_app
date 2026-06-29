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

import { useState, useEffect, useRef, useLayoutEffect, useMemo, Fragment } from 'react'
import { Smartphone, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import ProtectedImage from '@/components/common/ProtectedImage'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import { useRouter } from 'next/navigation'
import { getRestaurantBreadcrumbMiddle } from '@/lib/restaurantDetailLink'
import { useCart } from '@/lib/hooks/useCart'
import { useCartAnimation, triggerCartAnimation } from '@/components/cart/CartAnimation'
import CustomizeModal from '@/components/cart/CustomizeModal'
import RestaurantSwitchModal from '@/components/cart/RestaurantSwitchModal'
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

// Main component function
function RestaurantPage({
  restaurantId,
  entryFrom,
}: {
  restaurantId: string
  entryFrom?: string
}) {
  // Create Supabase client (move inside component)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
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
  const [downloadContextItem, setDownloadContextItem] = useState<string | null>(null)
  const [downloadMode, setDownloadMode] = useState<'phone' | 'email'>('phone')
  const [downloadValue, setDownloadValue] = useState('')

  // State for restaurant switch confirmation
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [pendingAddItem, setPendingAddItem] = useState<any | null>(null)
  const [pendingItemElement, setPendingItemElement] = useState<HTMLElement | null>(null)

  // Refs for scrolling and animations
  const tabsRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const compactHeaderRef = useRef<HTMLDivElement>(null)
  const cartButtonRef = useRef<HTMLButtonElement>(null)
  const menuSectionRef = useRef<HTMLDivElement>(null)
  const menuStickySentinelRef = useRef<HTMLDivElement>(null)
  const menuPinnedShellRef = useRef<HTMLDivElement>(null)
  const menuScrollContainerRef = useRef<HTMLDivElement>(null)
  const menuSelectionsHeaderRef = useRef<HTMLDivElement>(null)
  const sidebarNavRef = useRef<HTMLElement>(null)
  const isMenuPanelPinnedRef = useRef(false)
  const [isMenuPanelPinned, setIsMenuPanelPinned] = useState(false)
  const photosSectionRef = useRef<HTMLDivElement>(null)
  const reviewsSectionRef = useRef<HTMLDivElement>(null)
  const infoSectionRef = useRef<HTMLDivElement>(null)
  const cuisinesSectionRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const tabBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [tabInk, setTabInk] = useState({ left: 0, width: 0, top: 0, height: 0 })

  const TAB_KEYS = ['menu', 'photos', 'reviews', 'info'] as const

  const readMenuStickyTopPx = () => {
    const compact = compactHeaderRef.current
    if (!compact) return 16
    const rect = compact.getBoundingClientRect()
    if (rect.bottom > 8) {
      return Math.ceil(rect.bottom) + 12
    }
    if (isTabsStickyRef.current && compact.offsetHeight > 0) {
      return compact.offsetHeight + 12
    }
    return 16
  }

  const syncMenuStickyTopVar = () => {
    document.documentElement.style.setProperty(
      '--gm-restaurant-sticky-top',
      `${readMenuStickyTopPx()}px`
    )
  }

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

    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}`, { signal: restaurantAc.signal })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setRestaurant(data);
        setLoadingRestaurant(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Restaurant not found');
        setLoadingRestaurant(false);
      });

    // Menu: fetch from merchant_menu_items for this store only (by store_id or id)
    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu`, { signal: menuAc.signal })
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
  }, [restaurantId]);

  // Sidebar: All + unique category names + VEG/NON_VEG
  const categories = ['All', ...Array.from(new Set([...menuItems.map(i => i.category), ...menuItems.map(i => i.category_item)].filter(Boolean)))]

  // Filtered menu items
  const filteredMenuItems = menuItems.filter(item => {
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

  // Compact header visibility + sticky offset (sidebar / menu header sit below it)
  useLayoutEffect(() => {
    const syncStickyTop = () => {
      syncMenuStickyTopVar()
    }

    const onScroll = () => {
      const sticky = window.scrollY > 8
      if (isTabsStickyRef.current !== sticky) {
        isTabsStickyRef.current = sticky
        setIsTabsSticky(sticky)
      }
      syncStickyTop()
    }

    onScroll()
    window.addEventListener('resize', syncStickyTop)
    window.addEventListener('scroll', onScroll, { passive: true })
    const compact = compactHeaderRef.current
    const ro = typeof ResizeObserver !== 'undefined' && compact
      ? new ResizeObserver(() => syncStickyTop())
      : null
    if (compact && ro) ro.observe(compact)
    const t = window.setTimeout(syncStickyTop, 320)
    return () => {
      window.removeEventListener('resize', syncStickyTop)
      window.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      window.clearTimeout(t)
    }
  }, [showSkeleton])

  useLayoutEffect(() => {
    syncMenuStickyTopVar()
  }, [isTabsSticky, activeTab, showSkeleton, searchQuery])

  useLayoutEffect(() => {
    const el = menuSelectionsHeaderRef.current
    const sync = () => {
      const h = el?.offsetHeight ?? 120
      document.documentElement.style.setProperty('--gm-menu-selections-h', `${h}px`)
    }
    sync()
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(sync) : null
    if (el && ro) ro.observe(el)
    return () => ro?.disconnect()
  }, [isMenuPanelPinned, filteredMenuItems.length, searchQuery, activeTab, showSkeleton])

  // Internal menu scroll only after sidebar + Selections header have pinned (lg+)
  useEffect(() => {
    if (activeTab !== 'menu' || showSkeleton) {
      isMenuPanelPinnedRef.current = false
      setIsMenuPanelPinned(false)
      return
    }

    const getStickyTopPx = () => {
      syncMenuStickyTopVar()
      return readMenuStickyTopPx()
    }

    const PIN_HYSTERESIS_PX = 20

    const checkPin = () => {
      if (window.innerWidth < 1024) {
        if (isMenuPanelPinnedRef.current) {
          isMenuPanelPinnedRef.current = false
          setIsMenuPanelPinned(false)
        }
        return
      }

      const sentinel = menuStickySentinelRef.current
      if (!sentinel) return

      const topPx = getStickyTopPx()
      const sentinelTop = sentinel.getBoundingClientRect().top
      const pinned = isMenuPanelPinnedRef.current

      if (!pinned && sentinelTop <= topPx) {
        isMenuPanelPinnedRef.current = true
        setIsMenuPanelPinned(true)
        requestAnimationFrame(() => {
          syncMenuStickyTopVar()
          const s = menuStickySentinelRef.current
          if (!s) return
          const liveTop = readMenuStickyTopPx()
          const drift = s.getBoundingClientRect().top - liveTop
          if (Math.abs(drift) > 1) {
            window.scrollBy({ top: drift, behavior: 'auto' })
          }
        })
      } else if (pinned && sentinelTop > topPx + PIN_HYSTERESIS_PX) {
        isMenuPanelPinnedRef.current = false
        setIsMenuPanelPinned(false)
      }
    }

    checkPin()
    window.addEventListener('scroll', checkPin, { passive: true })
    window.addEventListener('resize', checkPin)
    return () => {
      window.removeEventListener('scroll', checkPin)
      window.removeEventListener('resize', checkPin)
    }
  }, [activeTab, showSkeleton, isTabsSticky])

  // Scroll chaining: at list edges, return scroll to the page (hero/gallery) instead of trapping
  useEffect(() => {
    if (!isMenuPanelPinned || activeTab !== 'menu' || showSkeleton) return

    const attachScrollChain = (el: HTMLElement | null) => {
      if (!el) return () => {}

      const onWheel = (e: WheelEvent) => {
        if (window.innerWidth < 1024) return

        const { scrollTop, scrollHeight, clientHeight } = el
        if (scrollHeight <= clientHeight + 2) return

        const atTop = scrollTop <= 1
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1
        const dy = e.deltaY

        if (atTop && dy < 0) {
          e.preventDefault()
          window.scrollBy({ top: dy, behavior: 'auto' })
        } else if (atBottom && dy > 0) {
          e.preventDefault()
          window.scrollBy({ top: -dy, behavior: 'auto' })
        }
      }

      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    }

    const cleanList = attachScrollChain(menuScrollContainerRef.current)
    const cleanNav = attachScrollChain(sidebarNavRef.current)
    return () => {
      cleanList()
      cleanNav()
    }
  }, [isMenuPanelPinned, activeTab, showSkeleton, filteredMenuItems.length])

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
    setDownloadMode('phone')
    setDownloadValue('')
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
    if (restaurant.opening_time && restaurant.closing_time) {
      return `${openLabel} · ${restaurant.opening_time} – ${restaurant.closing_time}`
    }
    const oh = restaurant.operating_hours?.find((d) => d.open && d.slots.length > 0)
    if (oh) return `${openLabel} · ${oh.slots.join(', ')}`
    if (osu === 'OPEN') return 'Open now'
    if (os != null && String(os).trim() !== '') return String(os)
    return null
  })()

  const shareStore = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = restaurant.restaurant_name
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
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

      {/* Compact sticky header: title, breadcrumb, menu search, back (vertically centered) */}
      <div
        ref={compactHeaderRef}
        className={`fixed top-0 left-0 right-0 z-[70] bg-white/95 backdrop-blur-md border-b border-neutral-200/90 transition-all duration-300 ${
          isTabsSticky
            ? 'translate-y-0 opacity-100 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12)]'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="text-xs sm:text-sm font-semibold text-text truncate shrink-0 max-w-[min(34%,11rem)] sm:max-w-[13rem] lg:max-w-[15rem]">
              {restaurant.restaurant_name}
            </p>
            {activeTab === 'menu' && (
              <div className="flex-1 min-w-0 px-0.5 sm:px-1">
                <div className="relative flex items-center rounded-lg bg-white border border-neutral-200/90 shadow-sm mx-auto max-w-md">
                  <i className="fas fa-search text-text-light/50 pl-2.5 text-xs shrink-0" aria-hidden />
                  <input
                    type="search"
                    placeholder="Search dishes by name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full min-w-0 bg-transparent py-1.5 pl-2 pr-8 text-xs placeholder:text-text-light/45 focus:outline-none"
                    aria-label="Search menu items"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-text-light/50 hover:text-purple transition-colors p-0.5"
                      aria-label="Clear search"
                    >
                      <i className="fas fa-times text-xs" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {activeTab !== 'menu' && <div className="flex-1 min-w-0" aria-hidden />}
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-full border border-neutral-300/90 bg-white text-[11px] font-semibold text-text hover:border-purple/40 hover:text-purple hover:bg-purple-light/30 transition-colors"
            >
              <i className="fas fa-arrow-left text-[10px]" />
              Back
            </button>
          </div>
          <nav
            className="mt-1 text-[10px] sm:text-[11px] text-text-light flex flex-wrap items-center gap-1 min-w-0"
            aria-label="Breadcrumb"
          >
            <a href="/order" className="hover:text-purple transition-colors">
              Home
            </a>
            <span className="text-border/80">/</span>
            <a href={crumbMiddle.href} className="hover:text-purple transition-colors">
              {crumbMiddle.label}
            </a>
            <span className="text-border/80">/</span>
            <span className="text-text font-medium truncate max-w-[min(100%,200px)]">
              {restaurant.restaurant_name}
            </span>
          </nav>
        </div>
      </div>

      {/* Main header scrolls normally */}
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
                <div className="rounded-md bg-mint text-white px-2.5 py-1.5 min-w-[5.25rem] sm:min-w-[5.75rem] text-center shadow-sm">
                  <div className="text-base sm:text-lg font-bold leading-none tabular-nums">{Number(restaurant.avg_rating).toFixed(1)}★</div>
                  <div className="text-[9px] font-medium opacity-95 mt-0.5 leading-tight">Store rating</div>
                  <div className="text-[9px] opacity-90 leading-tight">
                    {formatReviewCount(Number(restaurant.total_reviews ?? 0))} ratings
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-bg px-2.5 py-2 text-center max-w-[9rem]">
                  <p className="text-[11px] sm:text-xs font-semibold text-text leading-tight">New on GatiMitra</p>
                  <p className="text-[10px] text-text-light mt-0.5 leading-tight">Ratings after first orders</p>
                </div>
              )}
            </div>
          </div>

          <div className="sm:hidden flex justify-end mb-2">
            {restaurant.avg_rating != null && restaurant.avg_rating > 0 ? (
              <div className="rounded-md bg-mint text-white px-2.5 py-1.5 min-w-[5.25rem] text-center shadow-sm">
                <div className="text-base font-bold leading-none tabular-nums">{Number(restaurant.avg_rating).toFixed(1)}★</div>
                <div className="text-[9px] font-medium opacity-95 mt-0.5 leading-tight">Store rating</div>
                <div className="text-[9px] opacity-90 leading-tight">
                  {formatReviewCount(Number(restaurant.total_reviews ?? 0))} ratings
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-bg px-2.5 py-2 text-center max-w-[9rem]">
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
              <div className="relative w-full lg:w-60 shrink-0">
                <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-mint/20 via-purple/20 to-pink/15 blur-md opacity-50 pointer-events-none" />
                <div className="relative flex items-center rounded-xl bg-white border border-neutral-200/90 shadow-sm">
                  <i className="fas fa-search text-text-light/50 pl-2.5 text-xs" />
                  <input
                    type="search"
                    placeholder="Search dishes by name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent py-2 pl-2 pr-8 text-xs placeholder:text-text-light/45 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
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

      {/* —— Fluid metrics strip (no cards) —— */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 mt-1 mb-5">
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
        {activeTab === 'menu' && (
          <div ref={menuStickySentinelRef} className="h-px w-full pointer-events-none" aria-hidden />
        )}
        <div
          ref={menuPinnedShellRef}
          className={`min-w-0 flex flex-col ${
            activeTab === 'menu' ? 'lg:flex-row lg:gap-10' : 'gap-4'
          } ${
            isMenuPanelPinned
              ? 'lg:sticky lg:top-[var(--gm-restaurant-sticky-top,4rem)] lg:z-[55] lg:items-start'
              : 'lg:items-start'
          }`}
        >
          {activeTab === 'menu' && (
            <aside
              ref={sidebarRef}
              className={`lg:w-56 shrink-0 flex flex-col lg:space-y-4 space-y-6 ${
                isMenuPanelPinned
                  ? 'lg:max-h-[calc(100vh-var(--gm-restaurant-sticky-top,4rem))] lg:min-h-0 lg:overflow-hidden'
                  : ''
              }`}
            >
              <div className="shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-light mb-2">Diet</p>
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
              <div className={`flex flex-col ${isMenuPanelPinned ? 'min-h-0 flex-1 lg:overflow-hidden' : ''}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-light mb-2 shrink-0">Browse</p>
                <nav
                  ref={sidebarNavRef}
                  className={`flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-2 -mx-1 px-1 lg:mx-0 lg:px-0 no-scrollbar lg:overflow-x-hidden ${
                    isMenuPanelPinned ? 'lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:pr-1' : ''
                  }`}
                >
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`shrink-0 text-left px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent ${
                        selectedCategory === cat
                          ? 'text-purple bg-purple-light/50 border-border/40 shadow-[0_0_20px_-8px_rgba(75,42,212,0.35)]'
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
                ? 'flex-1 min-w-0'
                : activeTab === 'photos'
                  ? 'w-full min-w-0'
                  : activeTab === 'info'
                    ? 'w-full min-w-0 max-w-7xl mx-auto'
                    : 'w-full min-w-0 max-w-3xl mx-auto'
            }
          >
            <div className="gm-tab-panel min-w-0 w-full">
              {/* Menu Tab – 100% DB-driven: show menu only if exists, else "Menu Not Available" */}
              <div ref={menuSectionRef}>
                {activeTab === 'menu' && (
                  <div className="gm-tab-panel">
                    {loadingMenu ? (
                      <div className="py-12 text-center text-text-light">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                          <span className="h-2 w-2 rounded-full bg-purple animate-pulse [animation-delay:150ms]" />
                          <span className="h-2 w-2 rounded-full bg-pink animate-pulse [animation-delay:300ms]" />
                          <span className="ml-2 font-medium">Loading menu…</span>
                        </span>
                      </div>
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

                    {/* Selections chrome (fixed) + dish list scroll when pinned */}
                    <div className="w-full">
                      <div
                        ref={menuSelectionsHeaderRef}
                        className="shrink-0 border-b border-border/30 bg-bg pb-4 pt-1"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-purple/80 mb-2">Selections</p>
                            <h2 className="text-3xl sm:text-4xl font-semibold text-text tracking-tight leading-tight">
                              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple via-mint to-pink">Menu</span>
                              <span className="text-text-light font-normal text-lg sm:text-xl ml-2 tabular-nums">
                                {filteredMenuItems.length} dishes
                              </span>
                            </h2>
                          </div>
                          <p className="text-sm text-text-light shrink-0">
                            {searchQuery.trim() ? (
                              <>
                                Showing{' '}
                                <span className="text-text font-medium">
                                  {filteredMenuItems.length} match{filteredMenuItems.length === 1 ? '' : 'es'} for &ldquo;{searchQuery.trim()}&rdquo;
                                </span>
                              </>
                            ) : (
                              <>
                                Showing <span className="text-text font-medium">{selectedCategory}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div
                        ref={menuScrollContainerRef}
                        className={
                          isMenuPanelPinned
                            ? 'lg:overflow-y-auto lg:overscroll-contain lg:pr-1 [scrollbar-gutter:stable] lg:max-h-[calc(100vh-var(--gm-restaurant-sticky-top,4rem)-var(--gm-menu-selections-h,7.5rem)-0.5rem)]'
                            : ''
                        }
                      >
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
                                        <span className="text-[10px] uppercase tracking-wider text-gold font-bold">Offer</span>
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
                              setSearchQuery('')
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

              {/* Reviews Tab - real rating when available, no dummy content */}
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
                    <p className="text-text-light text-sm leading-relaxed border-t border-border/25 pt-8">
                      Individual written reviews will appear here when the service enables them.
                    </p>
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

      {/* Fixed download module (Browse menu position) - menu tab only */}
      <div className={`${activeTab === 'menu' ? 'hidden md:block' : 'hidden'} fixed bottom-6 right-6 z-40`}>
        {floatingDownloadExpanded ? (
          <div className="relative w-[304px] rounded-2xl overflow-hidden border border-neutral-900/10 bg-[#171a20] text-white shadow-[0_26px_52px_-22px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setFloatingDownloadExpanded(false)}
              aria-label="Hide app download card"
              className="absolute top-2.5 left-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="grid grid-cols-[1.8fr_0.82fr] min-h-[132px]">
              <div className="p-5 flex flex-col justify-between">
                <p className="text-[14px] leading-[1.15] font-semibold tracking-tight pl-8 pt-0.5">
                  For a better experience, please order through our mobile app
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAppDownloadPopup()}
                  className="mt-3 inline-flex w-fit items-center justify-center rounded-lg bg-white text-neutral-900 text-sm font-semibold px-4 py-2 hover:bg-neutral-100 transition-colors"
                >
                  Download the App
                </button>
              </div>
              <div className="relative bg-gradient-to-b from-mint to-[#27d8b9] flex items-end justify-center">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-black/70" />
                <div className="w-[78%] h-[90%] rounded-t-[16px] border-2 border-black/70 bg-[#2ee7c6] flex items-center justify-center overflow-hidden">
                  <div className="inline-flex rounded-md bg-black shadow-[0_4px_14px_-6px_rgba(0,0,0,0.55)]">
                    <GatiMitraLogo
                      alt="GatiMitra"
                      width={132}
                      height={56}
                      className="w-[84px] h-auto object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]"
                    />
                  </div>
                </div>
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
          <div className="relative w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white text-text shadow-[0_30px_100px_-30px_rgba(0,0,0,0.6)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAppDownloadModal(false)}
              className="absolute right-4 top-4 h-8 w-8 rounded-full border border-border/40 text-text-light hover:text-text hover:border-border/70 transition-colors z-10"
              aria-label="Close download app popup"
            >
              <i className="fas fa-xmark" />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-0">
              <div className="hidden md:flex items-center justify-center bg-gradient-to-br from-neutral-50 to-white p-8">
                <div className="relative h-[360px] w-[190px] rounded-[32px] border border-neutral-200 bg-white shadow-[0_16px_45px_-18px_rgba(0,0,0,0.45)]">
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-neutral-300" />
                  <div className="absolute inset-3 rounded-[24px] bg-gradient-to-b from-mint to-[#22d0b5] flex items-center justify-center p-3">
                    <GatiMitraLogo
                      alt="GatiMitra logo"
                      width={130}
                      height={56}
                      className="w-full h-auto object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.35)]"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8">
                <h3 className="text-3xl font-semibold tracking-tight">Get the GatiMitra App</h3>
                <p className="mt-3 text-sm text-text-light max-w-xl">
                  {downloadContextItem
                    ? `To order "${downloadContextItem}", A download link is on the way. Open it on your phone to install the app .`
                    : 'A download link is on the way. Open it on your phone to install the app .'}
                </p>

                <div className="mt-6 flex items-center gap-6 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadMode"
                      checked={downloadMode === 'phone'}
                      onChange={() => setDownloadMode('phone')}
                      className="accent-pink"
                    />
                    <span>Phone</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadMode"
                      checked={downloadMode === 'email'}
                      onChange={() => setDownloadMode('email')}
                      className="accent-pink"
                    />
                    <span>Email</span>
                  </label>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-2.5">
                  <div className="flex w-full">
                    {downloadMode === 'phone' && (
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border/60 bg-neutral-50 text-sm text-text-light">
                        +91
                      </span>
                    )}
                    <input
                      value={downloadValue}
                      onChange={(e) => setDownloadValue(e.target.value)}
                      placeholder={downloadMode === 'phone' ? 'type here...' : 'you@example.com'}
                      className={`w-full h-11 border border-border/60 rounded-md px-3 text-sm outline-none focus:ring-2 focus:ring-pink/25 focus:border-pink/40 ${
                        downloadMode === 'phone' ? 'rounded-l-none' : ''
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    className="h-11 px-4 rounded-md bg-pink text-white text-sm font-semibold hover:bg-pink/90 transition-colors whitespace-nowrap"
                  >
                    Share App Link
                  </button>
                </div>

                <p className="mt-5 text-xs text-text-light">Download app from</p>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <a
                    href={process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || 'https://play.google.com/store'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-[#1f2937] text-white px-3 py-2 text-xs font-medium"
                  >
                    <i className="fab fa-google-play text-base" />
                    <span>GET IT ON Google Play</span>
                  </a>
                  <a
                    href={process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || 'https://www.apple.com/app-store/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-[#1f2937] text-white px-3 py-2 text-xs font-medium"
                  >
                    <i className="fab fa-apple text-base" />
                    <span>Download on the App Store</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

        @keyframes gm-tab-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
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