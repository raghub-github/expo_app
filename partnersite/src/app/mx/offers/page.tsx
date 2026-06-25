'use client'

import React, { useState, useEffect, Suspense, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PageSkeletonGeneric } from '@/components/PageSkeleton'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import type { Offer as DbOffer, OfferType, ApplicabilityType } from '@/lib/database'
import { fetchStoreById, fetchStoreByName, fetchMenuCategories } from '@/lib/database'
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord'
import { Plus, Edit2, Trash2, Zap, X, Calendar, Percent, DollarSign, Tag, Gift, User, Clock, ChevronDown, Copy, Search, Check, Sparkles, Truck, Layers, Package } from 'lucide-react'
import { toast } from 'sonner'
import { OfferTrackCard } from './offer-track-card'
import {
  countOffersForTrackFilter,
  formatOfferActorDisplay,
  offerMatchesTrackFilter,
  offerWasUpdated,
  type OfferTrackFilter,
} from './offer-lifecycle'
import {
  normalizeOfferFromApi,
  campaignDateToValidFromIso,
  campaignDateToValidTillIso,
  toLocalDateInputValue,
  normalizeTimeColumnForInput,
} from './offer-utils'

export const dynamic = 'force-dynamic'

type Offer = DbOffer

interface MerchantStore {
  id: string;
  store_name: string;
}

interface MenuItem {
  item_id: string;
  item_name: string;
  category_type: string;
  food_category_item: string;
  actual_price: number;
  in_stock: boolean;
  category_id?: number;
}

/** Upload offer banner image to R2 via API (one image per offer; design path docs/merchants/{parent}/stores/{storeId}/offers/{offerId}.ext) */
async function uploadOfferImageViaApi(
  storeId: string,
  offerId: string,
  file: File,
  currentImageUrl?: string | null
): Promise<string | null> {
  const form = new FormData();
  form.set('file', file);
  form.set('storeId', storeId);
  form.set('offerId', offerId);
  if (currentImageUrl) form.set('currentImageUrl', currentImageUrl);
  const res = await fetch('/api/merchant/offers/upload-image', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.url ?? null;
}

/** Fetch offers via API (service role + merchant auth — same merchant_offers table as agent dashboard). */
async function fetchOffersViaApi(
  storeId: string
): Promise<{ offers: DbOffer[]; storeName: string | null; storeCode: string | null }> {
  try {
    const res = await fetch(
      `/api/merchant/offers?storeId=${encodeURIComponent(storeId)}`,
      { credentials: 'include', cache: 'no-store' }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[offers] API load failed:', err?.error ?? res.status);
      return { offers: [], storeName: null, storeCode: null };
    }
    const data = await res.json();
    const raw = Array.isArray(data?.offers) ? data.offers : [];
    return {
      offers: raw.map((row: Record<string, unknown>) =>
        normalizeOfferFromApi(row as unknown as DbOffer)
      ),
      storeName: (data?.store_name as string) ?? null,
      storeCode: (data?.store_id as string) ?? null,
    };
  } catch (e) {
    console.error('[offers] fetchOffersViaApi', e);
    return { offers: [], storeName: null, storeCode: null };
  }
}

/** Fetch menu items via API (same as menu page; bypasses RLS and returns consistent shape) */
async function fetchMenuItemsForOffers(storeId: string): Promise<MenuItem[]> {
  try {
    const res = await fetch(`/api/merchant/menu-items?storeId=${encodeURIComponent(storeId)}`, { credentials: 'include' });
    if (!res.ok) return [];
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    return list.map((item: Record<string, unknown>) => ({
      item_id: String(item.item_id ?? item.id ?? ''),
      item_name: String(item.item_name ?? ''),
      category_type: String(item.food_type ?? item.category_type ?? 'VEG'),
      food_category_item: String(item.food_type ?? item.cuisine_type ?? '-'),
      actual_price: Number(item.selling_price ?? item.base_price ?? 0),
      in_stock: item.in_stock !== false,
      category_id: item.category_id != null ? Number(item.category_id) : undefined,
    })).filter((m: MenuItem) => m.item_id);
  } catch {
    return [];
  }
}

interface MenuCategory {
  id: number;
  category_name: string;
  display_order?: number;
}

const OFFER_TYPES: { type: OfferType | 'BUY_N_GET_M' | 'COUPON'; label: string; icon: React.ReactNode }[] = [
  { type: 'PERCENTAGE', label: 'Percentage discount', icon: <Percent size={18} className="text-emerald-600" /> },
  { type: 'FLAT', label: 'Flat discount', icon: <DollarSign size={18} className="text-blue-600" /> },
  { type: 'BUY_X_GET_Y', label: 'Buy X Get Y', icon: <Gift size={18} className="text-violet-600" /> },
  { type: 'BUY_N_GET_M', label: 'Buy N Get M', icon: <Gift size={18} className="text-purple-600" /> },
  { type: 'TIERED', label: 'Tiered (spend more, save more)', icon: <Layers size={18} className="text-amber-600" /> },
  { type: 'FREE_DELIVERY', label: 'Free delivery', icon: <Truck size={18} className="text-teal-600" /> },
  { type: 'FREE_ITEM', label: 'Free item', icon: <Package size={18} className="text-orange-600" /> },
  { type: 'COUPON', label: 'Coupon code', icon: <Tag size={18} className="text-rose-600" /> },
]

const APPLICABILITY_OPTIONS: { value: ApplicabilityType | 'ALL_ORDERS' | 'SPECIFIC_ITEM'; label: string }[] = [
  { value: 'ALL', label: 'All items' },
  { value: 'SPECIFIC_ITEMS_SET', label: 'Specific items' },
  { value: 'CATEGORY', label: 'Categories' },
  { value: 'CART', label: 'Cart level' },
  { value: 'DELIVERY', label: 'Delivery' },
]

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const
type Step = 'basic' | 'type' | 'applicability' | 'conditions' | 'stackability'
const STEPS: Step[] = ['basic', 'type', 'applicability', 'conditions', 'stackability']
const STEP_LABELS: Record<Step, string> = { basic: 'Basic info', type: 'Offer type', applicability: 'Where it applies', conditions: 'Conditions', stackability: 'Stacking & priority' }

function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

function OffersContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const { data: storeRecord } = usePartnerStoreRecord(storeId)
  const [isLoading, setIsLoading] = useState(true)
  const [offers, setOffers] = useState<Offer[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [pageTab, setPageTab] = useState<"create" | "track">("track")
  const [storeName, setStoreName] = useState<string | null>(null)
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null)
  const [trackFilter, setTrackFilter] = useState<OfferTrackFilter>("all")
  const [expandedOfferCards, setExpandedOfferCards] = useState<Record<string, boolean>>({})
  
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [step, setStep] = useState<Step>('basic')
  const [activeTab, setActiveTab] = useState<'basic' | 'type' | 'applicability' | 'conditions' | 'stackability'>('basic')
  const [sheetVisible, setSheetVisible] = useState(false)
  
  const [formData, setFormData] = useState({
    offer_title: '',
    offer_description: '',
    offer_type: 'PERCENTAGE' as OfferType | 'BUY_N_GET_M' | 'COUPON',
    offer_sub_type: 'ALL_ORDERS' as string,
    applicability_type: 'ALL' as ApplicabilityType,
    menu_item_ids: [] as string[],
    category_ids: [] as number[],
    discount_value: '',
    discount_percentage: '',
    max_discount_amount: '',
    min_order_amount: '',
    max_order_amount: '',
    buy_quantity: '',
    get_quantity: '',
    valid_from: '',
    valid_till: '',
    coupon_code: '',
    auto_apply: true,
    first_order_only: false,
    max_uses_total: '',
    max_uses_per_user: '',
    applicable_on_days: [] as string[],
    applicable_time_start: '',
    applicable_time_end: '',
    is_stackable: false,
    priority: '0',
    tiered_tiers: [] as { min: string; discount: string }[],
  })
  
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showOfferTypeDropdown, setShowOfferTypeDropdown] = useState(false)
  const [showApplyToDropdown, setShowApplyToDropdown] = useState(false)
  const [menuItemSearch, setMenuItemSearch] = useState('')
  const [showMenuItemSuggestions, setShowMenuItemSuggestions] = useState(false)
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItem[]>([])
  const [generatedCouponCode, setGeneratedCouponCode] = useState<string>('')
  const [isGeneratingCoupon, setIsGeneratingCoupon] = useState(false)
  
  // Refs for handling clicks outside
  const menuItemSuggestionsRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const modalContentRef = useRef<HTMLDivElement>(null)
  const offerTypeRef = useRef<HTMLDivElement>(null)
  const applyToRef = useRef<HTMLDivElement>(null)

  // FIX: Create controlled input handlers to prevent overwriting
  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }))
  }

  const handleNumberInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow empty string or valid numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  useEffect(() => {
    const getStoreId = () => {
      let id = searchParams?.get('storeId') ?? searchParams?.get('store_id')
      if (!id && typeof window !== 'undefined') {
        id =
          localStorage.getItem('selectedStoreId') ??
          localStorage.getItem('selectedRestaurantId')
      }
      setStoreId(id ?? null)
    }
    getStoreId()

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId' || e.key === 'selectedRestaurantId') {
        getStoreId()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [searchParams])

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    const loadData = async () => {
      if (!storeRecord) setIsLoading(true)
      try {
        // Load store (reuse shared cache when available)
        let storeData = storeRecord ?? (await fetchStoreById(storeId))
        if (!storeData) {
          storeData = await fetchStoreByName(storeId)
        }
        const { offers: offersData, storeName: apiStoreName, storeCode: apiStoreCode } =
          await fetchOffersViaApi(storeId)

        const resolvedName =
          apiStoreName ??
          (storeData as { store_name?: string; store_display_name?: string } | null)?.store_display_name ??
          (storeData as { store_name?: string } | null)?.store_name ??
          null
        if (cancelled) return
        setStoreName(resolvedName)

        if (storeData) {
          setStore(storeData as unknown as MerchantStore)
        } else if (apiStoreName || apiStoreCode) {
          setStore({
            id: apiStoreCode ?? storeId,
            store_name: apiStoreName ?? apiStoreCode ?? 'Store',
          })
        }

        if (cancelled) return
        setOffers(offersData)

        const [items, categories] = await Promise.all([
          fetchMenuItemsForOffers(storeId),
          fetchMenuCategories(storeId),
        ])
        if (cancelled) return
        setMenuItems(items || [])
        setFilteredMenuItems(items || [])
        setMenuCategories(categories || [])
      } catch (error) {
        if (cancelled) return
        console.error('Error loading offers:', error)
        toast.error('Failed to load offers')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [storeId, storeRecord])

  useEffect(() => {
    let cancelled = false
    const loadOwner = async () => {
      try {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !(data as { success?: boolean }).success) return
        const owner =
          typeof (data as { ownerName?: string }).ownerName === 'string'
            ? (data as { ownerName: string }).ownerName.trim()
            : ''
        setOwnerDisplayName(owner || null)
      } catch {
        /* ignore */
      }
    }
    void loadOwner()
    return () => {
      cancelled = true
    }
  }, [])

  const offersByItemId = useMemo(() => {
    const now = new Date();
    const map = new Map<
      string,
      { totalCount: number; activeCount: number }
    >();
    offers.forEach((offer) => {
      const itemIds =
        (offer.menu_item_ids ?? (offer.offer_metadata as { menu_item_ids?: string[] })?.menu_item_ids) ??
        [];
      if (!itemIds.length) return;
      const isWithinDates =
        new Date(offer.valid_from) <= now && now <= new Date(offer.valid_till);
      const isActive = Boolean(offer.is_active && isWithinDates);
      itemIds.forEach((itemId) => {
        const prev = map.get(itemId) ?? { totalCount: 0, activeCount: 0 };
        prev.totalCount += 1;
        if (isActive) prev.activeCount += 1;
        map.set(itemId, prev);
      });
    });
    return map;
  }, [offers]);

  const trackFilterCounts = useMemo(
    () => ({
      active: countOffersForTrackFilter(offers, "active"),
      scheduled: countOffersForTrackFilter(offers, "scheduled"),
      inactive: countOffersForTrackFilter(offers, "inactive"),
      all: offers.length,
    }),
    [offers]
  );

  const filteredTrackOffers = useMemo(
    () => offers.filter((o) => offerMatchesTrackFilter(o, trackFilter)),
    [offers, trackFilter]
  );

  const toggleOfferCardExpanded = (offerKey: string) =>
    setExpandedOfferCards((prev) => ({ ...prev, [offerKey]: !(prev[offerKey] ?? true) }));

  const editingOffer = useMemo(() => {
    if (!editingId) return null
    return offers.find((o) => o.offer_id === editingId) ?? null
  }, [editingId, offers])

  const displayStoreName = storeName ?? store?.store_name ?? null

  const offerActorDisplayOpts = useMemo(
    () => ({ ownerDisplayName }),
    [ownerDisplayName]
  )

  const offerHeaderBreadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; href?: string }> = [
      { label: 'Partner', href: '/partners/dashboard' },
    ]
    if (displayStoreName) crumbs.push({ label: displayStoreName })
    const sid = storeId?.trim()
    if (sid) crumbs.push({ label: sid })
    return crumbs
  }, [displayStoreName, storeId])

  // Filter menu items based on search
  useEffect(() => {
    if (menuItemSearch.trim() === '') {
      setFilteredMenuItems(menuItems)
    } else {
      const filtered = menuItems.filter(item =>
        item.item_name.toLowerCase().includes(menuItemSearch.toLowerCase())
      )
      setFilteredMenuItems(filtered)
    }
  }, [menuItemSearch, menuItems])

  const isItemEligibleForCurrentOffer = (item: MenuItem): boolean => {
    if (formData.offer_type !== 'FLAT') {
      return true;
    }
    // For flat offers, only freeze items that are already mapped to any offer.
    const stats = offersByItemId.get(item.item_id);
    if (stats && stats.totalCount > 0) return false;
    return true;
  };

  // Handle clicks outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close offer type dropdown
      if (showOfferTypeDropdown && 
          offerTypeRef.current && 
          !offerTypeRef.current.contains(event.target as Node)) {
        setShowOfferTypeDropdown(false)
      }
      
      // Close apply to dropdown
      if (showApplyToDropdown && 
          applyToRef.current && 
          !applyToRef.current.contains(event.target as Node)) {
        setShowApplyToDropdown(false)
      }
      
      // Close menu item suggestions
      if (showMenuItemSuggestions && 
          menuItemSuggestionsRef.current && 
          !menuItemSuggestionsRef.current.contains(event.target as Node)) {
        setShowMenuItemSuggestions(false)
      }
      
      // Do NOT close modal on outside click anymore
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOfferTypeDropdown, showApplyToDropdown, showMenuItemSuggestions, showModal])

  useEffect(() => {
    if (showModal) {
      setSheetVisible(true)
      return
    }
    const t = setTimeout(() => setSheetVisible(false), 220)
    return () => clearTimeout(t)
  }, [showModal])

  useEffect(() => {
    if (!showModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false)
        resetForm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showModal])

  const generateCoupon = () => {
    setIsGeneratingCoupon(true)

    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let coupon = ''
    const storePrefix = store?.store_name ? store.store_name.substring(0, 3).toUpperCase() : 'OFF'

    for (let i = 0; i < 8; i++) {
      coupon += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    coupon = coupon.slice(0, 4) + '-' + coupon.slice(4)
    const finalCoupon = `${storePrefix}-${coupon}`

    return window.setTimeout(() => {
      setGeneratedCouponCode(finalCoupon)
      setIsGeneratingCoupon(false)
      toast.success('Coupon code generated!')
    }, 500)
  }

  useEffect(() => {
    if (formData.offer_type !== 'COUPON' || generatedCouponCode || editingId) return
    setIsGeneratingCoupon(true)
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let coupon = ''
    const storePrefix = store?.store_name ? store.store_name.substring(0, 3).toUpperCase() : 'OFF'
    for (let i = 0; i < 8; i++) {
      coupon += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    coupon = coupon.slice(0, 4) + '-' + coupon.slice(4)
    const finalCoupon = `${storePrefix}-${coupon}`
    const timer = window.setTimeout(() => {
      setGeneratedCouponCode(finalCoupon)
      setIsGeneratingCoupon(false)
      toast.success('Coupon code generated!')
    }, 500)
    return () => {
      window.clearTimeout(timer)
      setIsGeneratingCoupon(false)
    }
  }, [formData.offer_type, generatedCouponCode, editingId, store?.store_name])

  const offerImageInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleRemoveOfferImage = () => {
    setImageFile(null)
    setImagePreview(null)
    offerImageInputRef.current?.value && (offerImageInputRef.current.value = '')
  }

  const handleOpenModal = (offer?: Offer) => {
    if (offer) {
      setEditingId(offer.offer_id)
      const meta = (offer.offer_metadata || {}) as { category_ids?: number[]; tiers?: { min: number; discount: number }[]; menu_item_ids?: string[] }
      setFormData({
        offer_title: offer.offer_title,
        offer_description: offer.offer_description || '',
        offer_type: offer.offer_type as OfferType | 'BUY_N_GET_M' | 'COUPON',
        offer_sub_type: offer.offer_sub_type || 'ALL_ORDERS',
        applicability_type: (offer.offer_sub_type === 'SPECIFIC_ITEM' ? 'SPECIFIC_ITEMS_SET' : offer.offer_sub_type === 'ALL_ORDERS' ? 'ALL' : (offer as any).applicability_type) || 'ALL',
        menu_item_ids: offer.menu_item_ids ?? meta.menu_item_ids ?? [],
        category_ids: meta.category_ids || [],
        discount_value: offer.discount_value?.toString() ?? '',
        discount_percentage: offer.discount_percentage?.toString() ?? '',
        max_discount_amount: offer.max_discount_amount?.toString() ?? '',
        min_order_amount: offer.min_order_amount?.toString() ?? '',
        max_order_amount: offer.max_order_amount?.toString() ?? '',
        buy_quantity: offer.buy_quantity?.toString() ?? '',
        get_quantity: offer.get_quantity?.toString() ?? '',
        valid_from: toLocalDateInputValue(offer.valid_from),
        valid_till: toLocalDateInputValue(offer.valid_till),
        coupon_code: offer.coupon_code ?? '',
        auto_apply: offer.auto_apply ?? true,
        first_order_only: offer.first_order_only ?? false,
        max_uses_total: offer.max_uses_total?.toString() ?? '',
        max_uses_per_user: offer.max_uses_per_user?.toString() ?? '',
        applicable_on_days: offer.applicable_on_days || [],
        applicable_time_start: normalizeTimeColumnForInput(offer.applicable_time_start),
        applicable_time_end: normalizeTimeColumnForInput(offer.applicable_time_end),
        is_stackable: offer.is_stackable ?? false,
        priority: offer.priority?.toString() ?? '0',
        tiered_tiers: (meta.tiers || []).map((t: { min: number; discount: number }) => ({ min: String(t.min), discount: String(t.discount) })),
      })
      setImagePreview(offer.image_url ?? offer.offer_image_url ?? null)
      if (offer.offer_type === 'COUPON' || offer.coupon_code) {
        setGeneratedCouponCode(offer.coupon_code || '')
      }
    } else {
      setEditingId(null)
      setFormData({
        offer_title: '',
        offer_description: '',
        offer_type: 'PERCENTAGE',
        offer_sub_type: 'ALL_ORDERS',
        applicability_type: 'ALL',
        menu_item_ids: [],
        category_ids: [],
        discount_value: '',
        discount_percentage: '',
        max_discount_amount: '',
        min_order_amount: '',
        max_order_amount: '',
        buy_quantity: '',
        get_quantity: '',
        valid_from: '',
        valid_till: '',
        coupon_code: '',
        auto_apply: true,
        first_order_only: false,
        max_uses_total: '',
        max_uses_per_user: '',
        applicable_on_days: [],
        applicable_time_start: '',
        applicable_time_end: '',
        is_stackable: false,
        priority: '0',
        tiered_tiers: [],
      })
      setImagePreview(null)
      setGeneratedCouponCode('')
    }
    setImageFile(null)
    setShowOfferTypeDropdown(false)
    setShowApplyToDropdown(false)
    setShowMenuItemSuggestions(false)
    setMenuItemSearch('')
    setShowModal(true)
    setActiveTab('basic')
    setStep('basic')
    // Refetch menu items when opening modal so "Specific items" selection has fresh data
    if (storeId) {
      void fetchMenuItemsForOffers(storeId)
        .then((items) => {
          setMenuItems(items)
          setFilteredMenuItems(items)
        })
        .catch(() => {})
    }
  }

  const handleSaveOffer = async () => {
    if (!store || !store.id) {
      toast.error('Store context not loaded. Please reload the page.')
      return
    }

    // Validation
    if (!formData.offer_title.trim()) {
      toast.error('Offer title is required')
      return
    }
    
    if (!formData.valid_from || !formData.valid_till) {
      toast.error('Valid dates are required')
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const validFrom = new Date(formData.valid_from)
    if (validFrom < today) {
      toast.error('Offer start date cannot be before today')
      return
    }

    if (new Date(formData.valid_till) < validFrom) {
      toast.error('End date must be after start date')
      return
    }

    // Applicability validation
    const applicabilityType = formData.applicability_type || (formData.offer_sub_type === 'SPECIFIC_ITEM' ? 'SPECIFIC_ITEMS_SET' : 'ALL')
    if ((applicabilityType === 'SPECIFIC_ITEMS_SET' || formData.offer_sub_type === 'SPECIFIC_ITEM') && formData.menu_item_ids.length === 0) {
      toast.error('Please select at least one menu item when applying to specific items')
      return
    }
    if (applicabilityType === 'CATEGORY' && formData.category_ids.length === 0) {
      toast.error('Please select at least one category when applying to categories')
      return
    }

    // Type-specific validation
    let isValid = true
    let errorMessage = ''

    switch (formData.offer_type) {
      case 'BUY_N_GET_M':
        if (!formData.buy_quantity || !formData.get_quantity) {
          isValid = false
          errorMessage = 'Buy quantity and Get quantity are required'
        }
        break
      case 'PERCENTAGE':
        if (!formData.discount_value) {
          isValid = false
          errorMessage = 'Discount percentage is required'
        }
        if (parseFloat(formData.discount_value) < 0 || parseFloat(formData.discount_value) > 100) {
          isValid = false
          errorMessage = 'Discount percentage must be between 0 and 100'
        }
        break
      case 'FLAT':
      case 'COUPON':
        if (!formData.discount_value) {
          isValid = false
          errorMessage = 'Discount amount is required'
        }
        if (parseFloat(formData.discount_value) <= 0) {
          isValid = false
          errorMessage = 'Discount amount must be greater than 0'
        }
        break
      case 'FREE_ITEM':
        if (!formData.min_order_amount) {
          isValid = false
          errorMessage = 'Minimum order amount is required for free item offers'
        }
        break
      case 'TIERED':
        if (!formData.tiered_tiers.length || formData.tiered_tiers.some(t => !t.min || !t.discount)) {
          isValid = false
          errorMessage = 'Add at least one tier (min amount and discount) for tiered offers'
        }
        break
    }

    // Coupon validation
    if (formData.offer_type === 'COUPON' && !generatedCouponCode) {
      isValid = false
      errorMessage = 'Please generate a coupon code'
    }

    if (!isValid) {
      toast.error(errorMessage)
      return
    }

    setIsSaving(true)

    try {
      const applicabilityType = formData.applicability_type || (formData.offer_sub_type === 'SPECIFIC_ITEM' ? 'SPECIFIC_ITEMS_SET' : 'ALL')
      const offerPayload: any = {
        store_id: storeId || store.id,
        offer_title: formData.offer_title,
        offer_description: formData.offer_description || null,
        offer_type: formData.offer_type,
        offer_sub_type: formData.offer_sub_type,
        menu_item_ids: (applicabilityType === 'SPECIFIC_ITEMS_SET' || formData.offer_sub_type === 'SPECIFIC_ITEM') && formData.menu_item_ids.length > 0 ? formData.menu_item_ids : null,
        discount_value: formData.discount_value !== '' ? formData.discount_value : null,
        discount_percentage: formData.offer_type === 'PERCENTAGE' && formData.discount_value !== '' ? formData.discount_value : null,
        max_discount_amount: formData.max_discount_amount !== '' ? formData.max_discount_amount : null,
        min_order_amount: formData.min_order_amount !== '' ? formData.min_order_amount : null,
        max_order_amount: formData.max_order_amount !== '' ? formData.max_order_amount : null,
        buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity, 10) : null,
        get_quantity: formData.get_quantity ? parseInt(formData.get_quantity, 10) : null,
        coupon_code: (formData.offer_type === 'COUPON' ? generatedCouponCode : formData.coupon_code) || null,
        valid_from: campaignDateToValidFromIso(formData.valid_from),
        valid_till: campaignDateToValidTillIso(formData.valid_till),
        is_active: true,
        auto_apply: formData.auto_apply,
        is_stackable: formData.is_stackable,
        priority: parseInt(formData.priority, 10) || 0,
        per_order_limit: 1,
        first_order_only: formData.first_order_only,
        max_uses_total: formData.max_uses_total !== '' ? parseInt(formData.max_uses_total, 10) : null,
        max_uses_per_user: formData.max_uses_per_user !== '' ? parseInt(formData.max_uses_per_user, 10) : null,
        applicable_on_days: formData.applicable_on_days.length > 0 ? formData.applicable_on_days : null,
        applicable_time_start: formData.applicable_time_start || null,
        applicable_time_end: formData.applicable_time_end || null,
        max_discount_per_order: formData.max_discount_amount !== '' ? formData.max_discount_amount : null,
        offer_metadata: formData.offer_type === 'TIERED' && formData.tiered_tiers.length > 0
          ? { tiers: formData.tiered_tiers.map(t => ({ min: Number(t.min), discount: Number(t.discount) })), category_ids: formData.category_ids.length ? formData.category_ids : undefined }
          : (formData.category_ids.length ? { category_ids: formData.category_ids } : {}),
      }

      let result: Offer | null = null

      if (editingId) {
        // Edit: upload new image first if selected (one image per offer; API replaces/deletes old in R2)
        if (imageFile && storeId) {
          const existingOffer = offers.find((o) => o.offer_id === editingId)
          const currentImageUrl = existingOffer?.offer_image_url ?? existingOffer?.image_url ?? null
          const imageUrl = await uploadOfferImageViaApi(storeId, editingId, imageFile, currentImageUrl)
          if (imageUrl) offerPayload.offer_image_url = imageUrl
        } else {
          // No new file: keep current or clear (when user removed image, imagePreview is null)
          offerPayload.offer_image_url = imagePreview ?? null
        }
        const res = await fetch(`/api/merchant/offers/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(offerPayload),
          credentials: 'include',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Update failed')
        }
        result = (await res.json()) as Offer
      } else {
        // Create: save offer first, then upload image and PATCH offer_image_url (design: one image per offer)
        const res = await fetch('/api/merchant/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(offerPayload),
          credentials: 'include',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Create failed')
        }
        result = (await res.json()) as Offer
        if (result && imageFile && storeId) {
          const imageUrl = await uploadOfferImageViaApi(storeId, result.offer_id, imageFile)
          if (imageUrl) {
            const patchRes = await fetch(`/api/merchant/offers/${encodeURIComponent(result.offer_id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ offer_image_url: imageUrl }),
              credentials: 'include',
            })
            if (patchRes.ok) {
              const patched = (await patchRes.json()) as Offer
              result = { ...result, ...patched, offer_image_url: imageUrl }
            }
          }
        }
      }

      if (result) {
        const normalized = normalizeOfferFromApi(result as unknown as Record<string, unknown>);
        setOffers((prev) => {
          if (editingId) {
            return prev.map((offer) => (offer.offer_id === editingId ? normalized : offer));
          }
          return [normalized, ...prev];
        });
        toast.success(editingId ? 'Offer updated successfully!' : 'Offer created successfully!');
        setPageTab('track');
        setShowModal(false);
        resetForm();
      } else {
        toast.error('Failed to save offer');
      }
    } catch (error) {
      console.error('Error saving offer:', error)
      toast.error('Error saving offer')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOffer = async (offerId: string) => {
    if (!confirm('Are you sure you want to delete this offer?')) return
    try {
      const res = await fetch(`/api/merchant/offers/${encodeURIComponent(offerId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
      }
      setOffers(prev => prev.filter(offer => offer.offer_id !== offerId))
      toast.success('Offer deleted successfully!')
    } catch (e) {
      console.error('Delete offer:', e)
      toast.error('Failed to delete offer')
    }
  }

  const resetForm = () => {
    setFormData({
      offer_title: '',
      offer_description: '',
      offer_type: 'PERCENTAGE',
      offer_sub_type: 'ALL_ORDERS',
      applicability_type: 'ALL',
      menu_item_ids: [],
      category_ids: [],
      discount_value: '',
      discount_percentage: '',
      max_discount_amount: '',
      min_order_amount: '',
      max_order_amount: '',
      buy_quantity: '',
      get_quantity: '',
      valid_from: '',
      valid_till: '',
      coupon_code: '',
      auto_apply: true,
      first_order_only: false,
      max_uses_total: '',
      max_uses_per_user: '',
      applicable_on_days: [],
      applicable_time_start: '',
      applicable_time_end: '',
      is_stackable: false,
      priority: '0',
      tiered_tiers: [],
    })
    setImageFile(null)
    setImagePreview(null)
    setEditingId(null)
    setActiveTab('basic')
    setStep('basic')
    setShowOfferTypeDropdown(false)
    setShowApplyToDropdown(false)
    setShowMenuItemSuggestions(false)
    setMenuItemSearch('')
    setGeneratedCouponCode('')
  }

  const toggleMenuItemSelection = (itemId: string) => {
    setFormData(prev => {
      const isSelected = prev.menu_item_ids.includes(itemId)
      if (isSelected) {
        return {
          ...prev,
          menu_item_ids: prev.menu_item_ids.filter(id => id !== itemId)
        }
      } else {
        return {
          ...prev,
          menu_item_ids: [...prev.menu_item_ids, itemId]
        }
      }
    })
  }

  const getMenuItemName = (itemId: string) => {
    const item = menuItems.find(mi => mi.item_id === itemId)
    return item ? item.item_name : 'Unknown Item'
  }

  const getOfferIcon = (offerType: Offer['offer_type']) => {
    switch (offerType) {
      case 'BUY_N_GET_M': case 'BUY_X_GET_Y':
        return <Gift size={16} className="text-purple-600" />
      case 'PERCENTAGE':
        return <Percent size={16} className="text-green-600" />
      case 'FLAT':
        return <DollarSign size={16} className="text-blue-600" />
      case 'COUPON':
        return <Tag size={16} className="text-red-600" />
      case 'FREE_ITEM':
        return <Package size={16} className="text-orange-600" />
      case 'TIERED':
        return <Layers size={16} className="text-amber-600" />
      case 'FREE_DELIVERY':
        return <Truck size={16} className="text-teal-600" />
      default:
        return <Zap size={16} className="text-yellow-600" />
    }
  }

  const getOfferDescription = (offer: Offer) => {
    switch (offer.offer_type) {
      case 'BUY_N_GET_M':
        return `Buy ${offer.buy_quantity} Get ${offer.get_quantity}`
      case 'PERCENTAGE':
        return `${offer.discount_value}% OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      case 'FLAT':
        return `Flat ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      case 'COUPON':
        return `Coupon: ${offer.coupon_code} - ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on min. order of ₹${offer.min_order_amount}` : ''}`
      case 'FREE_ITEM':
        return `Free Item for New Users${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ''}`
      default:
        return offer.offer_description || ''
    }
  }

  const getOfferTypeDisplay = (type: Offer['offer_type']) => {
    switch (type) {
      case 'PERCENTAGE': return 'Percentage discount'
      case 'FLAT': return 'Flat discount'
      case 'COUPON': return 'Coupon code'
      case 'BUY_N_GET_M': case 'BUY_X_GET_Y': return 'Buy X Get Y'
      case 'FREE_ITEM': return 'Free item'
      case 'TIERED': return 'Tiered (spend more, save more)'
      case 'FREE_DELIVERY': return 'Free delivery'
      default: return String(type)
    }
  }

  const getApplyToDisplay = (type: Offer['offer_sub_type'] | ApplicabilityType) => {
    switch (type) {
      case 'ALL_ORDERS': case 'ALL': return 'All items'
      case 'SPECIFIC_ITEM': case 'SPECIFIC_ITEMS_SET': return 'Specific items'
      case 'CATEGORY': return 'Categories'
      case 'CART': return 'Cart level'
      case 'DELIVERY': return 'Delivery'
      default: return 'All items'
    }
  }

  const toggleApplicability = (value: ApplicabilityType) => {
    setFormData(prev => ({
      ...prev,
      applicability_type: value,
      offer_sub_type: value === 'ALL' ? 'ALL_ORDERS' : value === 'SPECIFIC_ITEMS_SET' ? 'SPECIFIC_ITEM' : prev.offer_sub_type,
    }))
    setShowApplyToDropdown(false)
  }

  const toggleCategory = (id: number) => {
    setFormData(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(id) ? prev.category_ids.filter(c => c !== id) : [...prev.category_ids, id],
    }))
  }

  const addTieredTier = () => {
    setFormData(prev => ({
      ...prev,
      tiered_tiers: [...prev.tiered_tiers, { min: '', discount: '' }],
    }))
  }
  const removeTieredTier = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tiered_tiers: prev.tiered_tiers.filter((_, i) => i !== index),
    }))
  }
  const updateTieredTier = (index: number, field: 'min' | 'discount', value: string) => {
    setFormData(prev => {
      const next = [...prev.tiered_tiers]
      next[index] = { ...next[index], [field]: value }
      return { ...prev, tiered_tiers: next }
    })
  }

  const toggleDay = (day: string) => {
    setFormData(prev => ({
      ...prev,
      applicable_on_days: prev.applicable_on_days.includes(day)
        ? prev.applicable_on_days.filter(d => d !== day)
        : [...prev.applicable_on_days, day],
    }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  const handleOfferTypeChange = (type: OfferType | 'BUY_N_GET_M' | 'COUPON') => {
    setFormData(prev => ({ ...prev, offer_type: type }))
    setShowOfferTypeDropdown(false)
    
    // Reset coupon code if switching away from COUPON type
    if (type !== 'COUPON') {
      setGeneratedCouponCode('')
    }
  }

  const handleApplyToChange = (type: string) => {
    setFormData(prev => ({ ...prev, offer_sub_type: type || 'ALL_ORDERS' }))
    setShowApplyToDropdown(false)
  }

  if (isLoading && !storeRecord && !store) {
    return (
      <MXLayoutWhite restaurantName={displayStoreName || "Loading..."} restaurantId={storeId || ""}>
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <MXLayoutWhite restaurantName={displayStoreName || store?.store_name || "Offers"} restaurantId={storeId || ""}>
        <PartnerPageHeader title="Offers" breadcrumbs={offerHeaderBreadcrumbs} />
        <div className="flex h-full min-h-0 flex-col bg-white overflow-hidden">
          <div className="shrink-0 border-b border-gray-200 bg-white px-4 pt-4 sm:px-5 sm:pt-5 md:px-6 md:pt-6">
            <div className="mt-1 flex gap-8 text-sm">
              <button
                type="button"
                onClick={() => setPageTab("create")}
                className={`pb-3 border-b-2 transition-colors ${
                  pageTab === "create"
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Create offers
              </button>
              <button
                type="button"
                onClick={() => setPageTab("track")}
                className={`pb-3 border-b-2 transition-colors ${
                  pageTab === "track"
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Track offers
              </button>
            </div>

            {pageTab === "track" && offers.length > 0 ? (
              <div className="pb-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase shrink-0">
                    Offer campaigns
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {(
                    [
                      { id: "active" as const, label: "Active" },
                      { id: "scheduled" as const, label: "Scheduled" },
                      { id: "inactive" as const, label: "Inactive" },
                      { id: "all" as const, label: "All" },
                    ] as const
                  ).map(({ id, label }) => {
                    const selected = trackFilter === id;
                    const n = trackFilterCounts[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTrackFilter(id)}
                        className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        {label}
                        {n > 0 ? ` (${n})` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-4 sm:px-5 md:px-6 py-4 sm:py-6 w-full min-w-0">
            {pageTab === "create" ? (
              <div className="py-6">
                <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-3xl mx-auto">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-gray-700 font-medium">Create offers</p>
                    <p className="text-sm text-gray-500">
                      Click below to start creating a new offer for {displayStoreName || "your store"}.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenModal()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={16} className="shrink-0" />
                      Create offer
                    </button>
                  </div>
                </div>
              </div>
            ) : offers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 py-12 text-center max-w-xl mx-auto">
                <p className="text-sm font-medium text-gray-700">No offers yet</p>
                <p className="text-xs text-gray-500 mt-1">Create your first campaign to start tracking performance.</p>
                <button
                  type="button"
                  onClick={() => setPageTab("create")}
                  className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus size={16} className="shrink-0" />
                  Create offer
                </button>
              </div>
            ) : filteredTrackOffers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 py-12 text-center max-w-xl mx-auto">
                <p className="text-sm font-medium text-gray-700">No offers in this filter</p>
                <p className="text-xs text-gray-500 mt-1">Try another campaign filter above.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full min-w-0">
                {filteredTrackOffers.map((offer, index) => {
                  const offerKey = offer.offer_id || String(index);
                  return (
                    <OfferTrackCard
                      key={offerKey}
                      offer={offer}
                      storeName={displayStoreName}
                      ownerDisplayName={ownerDisplayName}
                      expanded={expandedOfferCards[offerKey] ?? true}
                      onToggleExpand={() => toggleOfferCardExpanded(offerKey)}
                      onEdit={() => handleOpenModal(offer)}
                      onDelete={() => handleDeleteOffer(offer.offer_id)}
                      onCopyCoupon={copyToClipboard}
                      getMenuItemName={getMenuItemName}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>


        {/* Create/Edit Right Sheet — 5-step enterprise offer wizard */}
        {(showModal || sheetVisible) && (
          <BodyPortal>
            <div className="fixed inset-0 z-[9999]">
              {/* Overlay */}
              <button
                type="button"
                aria-label="Close"
                onClick={() => { setShowModal(false); resetForm(); }}
                className={`fixed inset-0 bg-black/35 backdrop-blur-md transition-opacity duration-200 ${
                  showModal ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Sheet */}
              <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`fixed right-0 top-0 h-dvh w-full sm:max-w-lg bg-white border-l border-gray-200 shadow-2xl flex flex-col overflow-hidden transition-transform duration-200 will-change-transform ${
                  showModal ? "translate-x-0" : "translate-x-full"
                }`}
              >
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Offer' : 'Create Offer'}</h2>
                  {editingId && editingOffer ? (
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <p>
                        <span className="text-gray-500">Created by:</span>{' '}
                        <strong className="text-gray-800">
                          {formatOfferActorDisplay(
                            editingOffer.created_source_platform,
                            editingOffer.created_by_name,
                            offerActorDisplayOpts
                          )}
                        </strong>
                      </p>
                      <p>
                        <span className="text-gray-500">Updated by:</span>{' '}
                        <strong className="text-gray-800">
                          {offerWasUpdated(editingOffer)
                            ? formatOfferActorDisplay(
                                editingOffer.updated_source_platform ?? editingOffer.created_source_platform,
                                editingOffer.updated_by_name,
                                offerActorDisplayOpts
                              )
                            : 'Not updated yet'}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-0.5">Creating from Merchant Portal</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Step progress (scrollable to avoid overlap) */}
              <div className="flex-shrink-0 px-4 pt-3 pb-2 bg-white border-b border-gray-100 overflow-x-auto hide-scrollbar">
                <div className="flex gap-1 min-w-max">
                  {STEPS.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setActiveTab(s)
                        // Refetch menu items when entering applicability step so selection list is current
                        if (s === 'applicability' && storeId) {
                          fetchMenuItemsForOffers(storeId).then((items) => {
                            setMenuItems(items)
                            setFilteredMenuItems(items)
                          }).catch(() => {})
                        }
                      }}
                      className={`flex-none min-w-[120px] max-w-[140px] py-2 px-2 rounded-lg text-[10px] font-semibold transition-all whitespace-nowrap overflow-hidden text-ellipsis ${
                        activeTab === s
                          ? 'bg-orange-500 text-white shadow-md'
                          : i < STEPS.indexOf(activeTab)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span className="block truncate">
                        {i + 1}. {STEP_LABELS[s]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Content - Scrollable */}
              <div ref={modalContentRef} className="flex-1 overflow-y-auto hide-scrollbar">
                <form className="px-5 py-4" autoComplete="off" onSubmit={e => { e.preventDefault(); handleSaveOffer(); }}>
                  {/* Step 1: Basic info */}
                  {activeTab === 'basic' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 p-3 mb-2">
                        <h3 className="text-sm font-bold text-amber-900 mb-0.5">Basic information</h3>
                        <p className="text-xs text-amber-700">Title, description, image, and validity</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer title *</label>
                        <input type="text" value={formData.offer_title} onChange={handleInputChange('offer_title')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="e.g. Summer Special" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (optional)</label>
                        <textarea value={formData.offer_description} onChange={handleInputChange('offer_description')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="Describe your offer" rows={2} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer image (optional)</label>
                        {imagePreview ? (
                          <div className="space-y-2">
                            <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-100" style={{ aspectRatio: '800/400', maxHeight: 200 }}>
                              <img src={imagePreview} alt="Offer banner" className="w-full h-full object-contain" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <input ref={offerImageInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                              <button type="button" onClick={() => offerImageInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-200 transition-colors border border-amber-200">
                                Replace image
                              </button>
                              <button type="button" onClick={handleRemoveOfferImage} className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-xl hover:bg-red-100 transition-colors border border-red-200">
                                Remove image
                              </button>
                            </div>
                            <p className="text-xs text-gray-400">One image per offer. Recommended: 800×400px</p>
                          </div>
                        ) : (
                          <div>
                            <input ref={offerImageInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                            <button type="button" onClick={() => offerImageInputRef.current?.click()} className="inline-flex px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-md">
                              Choose image
                            </button>
                            <p className="text-xs text-gray-400 mt-1">Recommended: 800×400px. One image per offer.</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-semibold text-gray-700">Auto-apply (no code needed)</span>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, auto_apply: !prev.auto_apply }))} className={`relative w-11 h-6 rounded-full transition-colors ${formData.auto_apply ? 'bg-orange-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.auto_apply ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      {!formData.auto_apply && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Coupon code (optional)</label>
                          <input type="text" value={formData.coupon_code || (formData.offer_type === 'COUPON' ? generatedCouponCode : '')} onChange={e => { if (formData.offer_type === 'COUPON') setGeneratedCouponCode(e.target.value); else setFormData(prev => ({ ...prev, coupon_code: e.target.value })); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:border-orange-500 text-sm font-mono" placeholder="e.g. SAVE20" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start date *</label>
                          <input type="date" value={formData.valid_from} onChange={handleInputChange('valid_from')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" min={new Date().toISOString().split('T')[0]} required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">End date *</label>
                          <input type="date" value={formData.valid_till} onChange={handleInputChange('valid_till')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" min={formData.valid_from || new Date().toISOString().split('T')[0]} required />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Step 2: Offer type */}
                  {activeTab === 'type' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200/80 p-3 mb-2">
                        <h3 className="text-sm font-bold text-violet-900 mb-0.5">Offer type</h3>
                        <p className="text-xs text-violet-700">Choose how the discount is applied</p>
                      </div>
                      <div className="relative" ref={offerTypeRef}>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Offer type *</label>
                        <button type="button" onClick={() => { setShowOfferTypeDropdown(!showOfferTypeDropdown); setShowApplyToDropdown(false); setShowMenuItemSuggestions(false); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-full bg-gray-100">{getOfferIcon(formData.offer_type)}</div>
                            <span className="text-sm font-medium text-gray-900">{getOfferTypeDisplay(formData.offer_type)}</span>
                          </div>
                          <ChevronDown size={16} className={`text-gray-500 transition-transform ${showOfferTypeDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showOfferTypeDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                            {OFFER_TYPES.map((opt) => (
                              <div
                                key={opt.type}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOfferTypeChange(opt.type);
                                }}
                                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${formData.offer_type === opt.type ? 'bg-orange-50' : ''}`}
                              >
                                <div className="p-1.5 rounded-full bg-gray-100">{opt.icon}</div>
                                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                                {formData.offer_type === opt.type && <Check size={16} className="ml-auto text-green-600" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Dynamic form by type */}
                      {(formData.offer_type === 'PERCENTAGE' || formData.offer_type === 'FLAT' || formData.offer_type === 'COUPON') && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Discount value *</label>
                            <div className="relative flex items-center">
                              {formData.offer_type !== 'PERCENTAGE' && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold pointer-events-none z-10">₹</span>
                              )}
                              <input
                                type="text"
                                value={formData.discount_value}
                                onChange={handleNumberInputChange('discount_value')}
                                className={`w-full py-2.5 border border-gray-300 rounded-xl text-sm bg-white ${
                                  formData.offer_type === 'PERCENTAGE' ? 'px-3 pr-9' : 'pl-9 pr-3'
                                }`}
                                placeholder={formData.offer_type === 'PERCENTAGE' ? 'e.g. 10 for 10%' : 'e.g. 50'}
                              />
                              {formData.offer_type === 'PERCENTAGE' && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold pointer-events-none">%</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Max discount per order (optional)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                              <input type="text" value={formData.max_discount_amount} onChange={handleNumberInputChange('max_discount_amount')} className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm" placeholder="Cap amount" />
                            </div>
                          </div>
                        </>
                      )}
                      {formData.offer_type === 'BUY_X_GET_Y' || formData.offer_type === 'BUY_N_GET_M' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Buy quantity *</label>
                            <input type="number" min={1} value={formData.buy_quantity} onChange={handleNumberInputChange('buy_quantity')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Get quantity *</label>
                            <input type="number" min={1} value={formData.get_quantity} onChange={handleNumberInputChange('get_quantity')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" />
                          </div>
                        </div>
                      ) : null}
                      {formData.offer_type === 'TIERED' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-gray-700">Tiers (spend min → discount)</label>
                            <button type="button" onClick={addTieredTier} className="text-xs font-bold text-orange-600 hover:text-orange-700">+ Add tier</button>
                          </div>
                          {formData.tiered_tiers.map((tier, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₹</span>
                                <input type="text" value={tier.min} onChange={e => updateTieredTier(i, 'min', e.target.value)} placeholder="Min" className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm" />
                              </div>
                              <span className="text-gray-400">→</span>
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₹</span>
                                <input type="text" value={tier.discount} onChange={e => updateTieredTier(i, 'discount', e.target.value)} placeholder="Discount" className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm" />
                              </div>
                              <button type="button" onClick={() => removeTieredTier(i)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><X size={14} /></button>
                            </div>
                          ))}
                          {formData.tiered_tiers.length === 0 && <p className="text-xs text-gray-500">Add at least one tier (e.g. spend 500 → ₹50 off)</p>}
                        </div>
                      )}
                      {formData.offer_type === 'FREE_DELIVERY' && <p className="text-xs text-gray-600 rounded-xl bg-teal-50 border border-teal-200 p-3">Delivery fee will be waived when this offer applies.</p>}
                      {formData.offer_type === 'FREE_ITEM' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Minimum order amount *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                            <input type="text" value={formData.min_order_amount} onChange={handleNumberInputChange('min_order_amount')} className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm" placeholder="e.g. 300" />
                          </div>
                        </div>
                      )}
                      {formData.offer_type === 'COUPON' && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                          <label className="block text-xs font-bold text-rose-800 mb-2">Coupon code *</label>
                          {generatedCouponCode ? (
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-sm font-bold text-rose-900 font-mono">{generatedCouponCode}</code>
                              <button type="button" onClick={() => copyToClipboard(generatedCouponCode)} className="text-xs font-medium text-rose-700">Copy</button>
                              <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon} className="text-xs font-medium text-rose-700">Regenerate</button>
                            </div>
                          ) : (
                            <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon} className="w-full py-2 px-4 rounded-lg bg-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2">
                              {isGeneratingCoupon ? 'Generating...' : <><Sparkles size={14} /> Generate code</>}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Applicability */}
                  {activeTab === 'applicability' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 p-3 mb-2">
                        <h3 className="text-sm font-bold text-emerald-900 mb-0.5">Where it applies</h3>
                        <p className="text-xs text-emerald-700">All items, specific items, categories, cart, or delivery</p>
                      </div>
                      <div className="relative" ref={applyToRef}>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Apply to *</label>
                        <button type="button" onClick={() => { setShowApplyToDropdown(!showApplyToDropdown); setShowOfferTypeDropdown(false); setShowMenuItemSuggestions(false); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-left flex items-center justify-between bg-white hover:bg-gray-50">
                          <span className="text-sm font-medium text-gray-900">{getApplyToDisplay(formData.applicability_type)}</span>
                          <ChevronDown size={16} className={`text-gray-500 ${showApplyToDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showApplyToDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-xl">
                            {APPLICABILITY_OPTIONS.map((opt) => (
                              <div key={opt.value} onClick={() => toggleApplicability(opt.value as ApplicabilityType)} className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${formData.applicability_type === opt.value ? 'bg-orange-50' : ''}`}>
                                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                                {formData.applicability_type === opt.value && <Check size={16} className="text-green-600" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {(formData.applicability_type === 'SPECIFIC_ITEMS_SET' || formData.offer_sub_type === 'SPECIFIC_ITEM') && (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Select Menu Items *
                          </label>
                          
                          {/* Selected Items Display */}
                          {formData.menu_item_ids.length > 0 && (
                            <div className="mb-2">
                              <div className="text-xs font-semibold text-gray-600 mb-1">Selected Items ({formData.menu_item_ids.length}):</div>
                              <div className="flex flex-wrap gap-1">
                                {formData.menu_item_ids.map(itemId => (
                                  <div
                                    key={itemId}
                                    className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs"
                                  >
                                    <span>{getMenuItemName(itemId)}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleMenuItemSelection(itemId)
                                      }}
                                      className="text-green-800 hover:text-green-900"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Search Input */}
                          <div className="relative">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                value={menuItemSearch}
                                onChange={(e) => {
                                  setMenuItemSearch(e.target.value)
                                  setShowMenuItemSuggestions(true)
                                }}
                                onFocus={() => setShowMenuItemSuggestions(true)}
                                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                                placeholder="Search menu items..."
                              />
                            </div>
                            
                            {/* Combined Suggestions Dropdown */}
                            {showMenuItemSuggestions && (
                              <div 
                                ref={menuItemSuggestionsRef}
                                className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl hide-scrollbar max-h-60 overflow-y-auto"
                              >
                                {filteredMenuItems.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                                    No menu items found
                                  </div>
                                ) : (
                                  filteredMenuItems.map(item => {
                                    const isSelected = formData.menu_item_ids.includes(item.item_id)
                                    const stats = offersByItemId.get(item.item_id)
                                    const hasActiveOffer = (stats?.activeCount ?? 0) > 0
                                    if (!isItemEligibleForCurrentOffer(item)) {
                                      // Skip ineligible items for current flat discount configuration.
                                      return null
                                    }
                                    return (
                                      <div
                                        key={item.item_id}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleMenuItemSelection(item.item_id)
                                          if (!menuItemSearch) {
                                            // Only close if not searching
                                            setShowMenuItemSuggestions(false)
                                          }
                                        }}
                                        className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${
                                          isSelected ? 'bg-green-50' : ''
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0 mr-2">
                                          <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium text-gray-900 truncate">
                                              {item.item_name}
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-500">
                                              #{item.item_id}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                              item.category_type === 'NON_VEG' 
                                                ? 'bg-red-100 text-red-800' 
                                                : item.category_type === 'VEG'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {item.category_type}
                                            </span>
                                          </div>
                                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-600">
                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                                              ₹{item.actual_price}
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5">
                                              {item.food_category_item}
                                            </span>
                                            {stats && stats.totalCount > 0 && (
                                              <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                                                  hasActiveOffer
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-emerald-50 text-emerald-700'
                                                }`}
                                              >
                                                {hasActiveOffer
                                                  ? `${stats.activeCount} active offer${stats.activeCount > 1 ? 's' : ''}`
                                                  : `${stats.totalCount} mapped offer${stats.totalCount > 1 ? 's' : ''}`}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check size={16} className="text-green-600 flex-shrink-0 ml-2" />
                                        )}
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Instructions + refresh when empty */}
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {menuItems.length > 0 ? `Found ${menuItems.length} menu items. Search or click to select.` : 'No menu items available for this store.'}
                            </p>
                            {menuItems.length === 0 && storeId && (
                              <button
                                type="button"
                                onClick={() => fetchMenuItemsForOffers(storeId).then((items) => { setMenuItems(items); setFilteredMenuItems(items); }).catch(() => toast.error('Could not load menu items'))}
                                className="text-xs font-medium text-orange-600 hover:text-orange-700"
                              >
                                Refresh items
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {formData.applicability_type === 'CATEGORY' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Select categories *</label>
                          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                            {menuCategories.map(cat => (
                              <label key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={formData.category_ids.includes(cat.id)} onChange={() => toggleCategory(cat.id)} className="rounded border-gray-300 text-orange-500" />
                                <span className="text-sm font-medium text-gray-900">{cat.category_name}</span>
                              </label>
                            ))}
                            {menuCategories.length === 0 && <p className="text-xs text-gray-500 p-2">No categories found.</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 4: Conditions */}
                  {activeTab === 'conditions' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200/80 p-3 mb-2">
                        <h3 className="text-sm font-bold text-sky-900 mb-0.5">Conditions</h3>
                        <p className="text-xs text-sky-700">Min order, first order, usage limits, time & days</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Minimum order value (₹)</label>
                        <input type="text" value={formData.min_order_amount} onChange={handleNumberInputChange('min_order_amount')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" placeholder="Optional" />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-semibold text-gray-700">First order only</span>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, first_order_only: !prev.first_order_only }))} className={`relative w-11 h-6 rounded-full transition-colors ${formData.first_order_only ? 'bg-orange-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.first_order_only ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Max uses total</label>
                          <input type="text" value={formData.max_uses_total} onChange={handleNumberInputChange('max_uses_total')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" placeholder="Optional" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Max per user</label>
                          <input type="text" value={formData.max_uses_per_user} onChange={handleNumberInputChange('max_uses_per_user')} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" placeholder="Optional" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Applicable days</label>
                        <div className="flex flex-wrap gap-1">
                          {DAYS_OF_WEEK.map(d => (
                            <button key={d} type="button" onClick={() => toggleDay(d)} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${formData.applicable_on_days.includes(d) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                              {d.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Leave empty for all days</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Time start</label>
                          <input type="time" value={formData.applicable_time_start} onChange={e => setFormData(prev => ({ ...prev, applicable_time_start: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Time end</label>
                          <input type="time" value={formData.applicable_time_end} onChange={e => setFormData(prev => ({ ...prev, applicable_time_end: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 5: Stackability */}
                  {activeTab === 'stackability' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200/80 p-3 mb-2">
                        <h3 className="text-sm font-bold text-indigo-900 mb-0.5">Stacking & priority</h3>
                        <p className="text-xs text-indigo-700">Allow combining with other offers and set priority</p>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-semibold text-gray-700">Allow stacking with other offers</span>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, is_stackable: !prev.is_stackable }))} className={`relative w-11 h-6 rounded-full transition-colors ${formData.is_stackable ? 'bg-orange-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.is_stackable ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority (higher = applied first when non-stackable)</label>
                        <input type="number" value={formData.priority} onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm" min={0} placeholder="0" />
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-hidden bg-gradient-to-br from-white to-gray-50">
                        <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                          <h4 className="text-sm font-bold text-gray-900">Summary</h4>
                        </div>
                        <div className="p-4 space-y-2 text-sm">
                          <div className="flex justify-between"><span className="text-gray-600">Title</span><span className="font-semibold">{formData.offer_title || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">Type</span><span className="font-semibold">{getOfferTypeDisplay(formData.offer_type)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">Applies to</span><span className="font-semibold">{getApplyToDisplay(formData.applicability_type)}</span></div>
                          {formData.valid_from && formData.valid_till && <div className="flex justify-between"><span className="text-gray-600">Valid</span><span className="font-semibold">{formData.valid_from} → {formData.valid_till}</span></div>}
                          {formData.is_stackable && <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-semibold">Stackable</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-6 mt-6 border-t border-gray-200">
                    <div>
                      {activeTab !== 'basic' && (
                        <button
                          type="button"
                          className="px-4 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 transition-all text-xs font-bold"
                          onClick={() => setActiveTab(STEPS[STEPS.indexOf(activeTab) - 1])}
                        >
                          ← Previous
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {activeTab !== 'stackability' && (
                        <button
                          type="button"
                          className="px-4 py-2.5 rounded-xl bg-gray-800 text-white hover:bg-gray-900 transition-all text-xs font-bold"
                          onClick={() => setActiveTab(STEPS[STEPS.indexOf(activeTab) + 1])}
                        >
                          Next →
                        </button>
                      )}
                      {activeTab === 'stackability' && (
                        <button
                          type="submit"
                          disabled={isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till ||
                            (formData.applicability_type === 'SPECIFIC_ITEMS_SET' && formData.menu_item_ids.length === 0) ||
                            (formData.applicability_type === 'CATEGORY' && formData.category_ids.length === 0) ||
                            (formData.offer_type === 'COUPON' && !generatedCouponCode)}
                          className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all text-xs ${
                            isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till ||
                            (formData.applicability_type === 'SPECIFIC_ITEMS_SET' && formData.menu_item_ids.length === 0) ||
                            (formData.applicability_type === 'CATEGORY' && formData.category_ids.length === 0) ||
                            (formData.offer_type === 'COUPON' && !generatedCouponCode)
                              ? 'bg-orange-300 cursor-not-allowed'
                              : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl'
                          }`}
                        >
                          {isSaving ? (
                            <span className="flex items-center gap-1">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                              Saving...
                            </span>
                          ) : (
                            editingId ? 'Update Offer' : 'Create Offer'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            </div>
            </div>
          </BodyPortal>
        )}

        <style jsx global>{`
          .hide-scrollbar {
            -ms-overflow-style: none; /* IE and Edge */
            scrollbar-width: none; /* Firefox */
          }

          .hide-scrollbar::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
          }
        `}</style>
      </MXLayoutWhite>
    </>
  )
}

export default function OffersPage() {
  return (
    <Suspense fallback={
      <MXLayoutWhite restaurantName="Loading..." restaurantId="">
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    }>
      <OffersContent />
    </Suspense>
  )
}