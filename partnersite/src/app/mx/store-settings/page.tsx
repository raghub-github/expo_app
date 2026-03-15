'use client'

import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react'
import dynamicImport from 'next/dynamic'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { supabase } from '@/lib/supabase';
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import { Clock, Phone, Save, AlertCircle, CheckCircle2, X, Zap, Shield, BarChart3, Bell, Crown, Star, Check, MapPin, Calendar, Copy, Power, Plus, Trash2, ChevronDown, ChevronUp, Gift, Target, Globe, Users, Package, CreditCard, Sparkles, Smartphone, Lock, Unlock, Activity, FileText, Mail, MessageSquare, Radio, TrendingUp, Database, Eye, EyeOff, ShoppingBag, ChefHat, CheckCircle, XCircle, Image, Layers, BarChart2, Headphones, UserCheck } from 'lucide-react'
import { PageSkeletonGeneric } from '@/components/PageSkeleton'
import { Toaster, toast } from 'sonner'
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton'
import { SettingsSidebar } from './components/SettingsSidebar'

const StoreLocationMapboxGL = dynamicImport(() => import('@/components/StoreLocationMapboxGL'), { ssr: false })
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export const dynamic = 'force-dynamic'

// Day types
type DayType = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

interface TimeSlot {
  id: string
  openingTime: string
  closingTime: string
}

interface DaySchedule {
  day: DayType
  label: string
  isOpen: boolean
  slots: TimeSlot[]
  is24Hours: boolean
  isOutletClosed: boolean
  duration: string
  operationalHours: number
  operationalMinutes: number
}

function StoreSettingsContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'plans' | 'premium' | 'timings' | 'operations' | 'menu-capacity' | 'delivery' | 'address' | 'pos' | 'notifications' | 'audit' | 'gatimitra'>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab')
      const validTabs = ['plans', 'premium', 'timings', 'operations', 'menu-capacity', 'delivery', 'address', 'pos', 'notifications', 'audit', 'gatimitra']
      if (urlTab === 'packaging' || urlTab === 'riders') return 'delivery'
      if (urlTab && validTabs.includes(urlTab)) return urlTab as any
    }
    return 'plans'
  })

  const validTabsList = ['plans', 'premium', 'timings', 'operations', 'menu-capacity', 'delivery', 'address', 'pos', 'notifications', 'audit', 'gatimitra']
  useEffect(() => {
    const urlTab = searchParams?.get('tab') || 'plans'
    if (urlTab === 'packaging' || urlTab === 'riders') {
      if (activeTab !== 'delivery') setActiveTab('delivery')
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        params.set('tab', 'delivery')
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
      }
      return
    }
    if (validTabsList.includes(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab as typeof activeTab)
    }
  }, [searchParams])

  // Sync tab TO URL when activeTab changes (so sidebar clicks update URL)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (activeTab !== (params.get('tab') || 'plans')) {
        params.set('tab', activeTab)
        const newUrl = `${window.location.pathname}?${params.toString()}`
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [activeTab])

  // POS integration state
  const [posPartner, setPosPartner] = useState('')
  const [posStoreId, setPosStoreId] = useState('')
  const [posStatus, setPosStatus] = useState<string | null>(null)
  const [posSaving, setPosSaving] = useState(false)
  const [posIntegrationActive, setPosIntegrationActive] = useState(false)
  
  const [showStoreTimingModal, setShowStoreTimingModal] = useState(false)
  const [expandedDay, setExpandedDay] = useState<DayType | null>(null)

  // Form state
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [manualCloseUntil, setManualCloseUntil] = useState<string | null>(null)
  const [showTempOffModal, setShowTempOffModal] = useState(false)
  const [tempOffDurationInput, setTempOffDurationInput] = useState('30')
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false)
  const [phone, setPhone] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storeDescription, setStoreDescription] = useState('')
  // Address (change address) tab state
  const [fullAddress, setFullAddress] = useState('')
  const [addressLandmark, setAddressLandmark] = useState('')
  const [addressState, setAddressState] = useState('')
  const [addressPostalCode, setAddressPostalCode] = useState('')
  const [addressSearchQuery, setAddressSearchQuery] = useState('')
  const [addressSearchResults, setAddressSearchResults] = useState<any[]>([])
  const [isAddressSearching, setIsAddressSearching] = useState(false)
  const addressMapRef = useRef<{ flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => void } | null>(null)
  const addressSearchRef = useRef<HTMLDivElement>(null)
  /** Snapshot of address when last loaded or saved; used to enable Save only when something changed */
  const initialAddressRef = useRef<{ full_address: string; landmark: string; city: string; state: string; postal_code: string; latitude: string; longitude: string } | null>(null)

  // Plans & Subscription state
  const [plans, setPlans] = useState<any[]>([])
  const [currentSubscription, setCurrentSubscription] = useState<any>(null)
  const [currentPlan, setCurrentPlan] = useState<any>(null)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [upgradingPlanId, setUpgradingPlanId] = useState<number | null>(null)
  const [pendingSubscriptionOrderId, setPendingSubscriptionOrderId] = useState<string | null>(null)
  const [onboardingPayments, setOnboardingPayments] = useState<any[]>([])
  const [autoRenew, setAutoRenew] = useState(false)
  const [showAutoRenewConfirm, setShowAutoRenewConfirm] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  
  // Premium Benefits state
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false)
  const [smartPricing, setSmartPricing] = useState(false)
  const [prioritySupport, setPrioritySupport] = useState(false)
  const [advancedSecurity, setAdvancedSecurity] = useState(false)
  const [promoNotifications, setPromoNotifications] = useState(true)
  const [marketingAutomation, setMarketingAutomation] = useState(false)
  const [subscriptionPlan, setSubscriptionPlan] = useState<'free' | 'pro' | 'enterprise'>('pro')
  
  // Store Operations state
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false)
  const [preparationBufferMinutes, setPreparationBufferMinutes] = useState(15)
  const [manualActivationLock, setManualActivationLock] = useState(false)
  
  // Menu & Capacity Controls state
  const [currentMenuItemsCount, setCurrentMenuItemsCount] = useState(0)
  const [currentCuisinesCount, setCurrentCuisinesCount] = useState(0)
  const [maxMenuItems, setMaxMenuItems] = useState<number | null>(null)
  const [maxCuisines, setMaxCuisines] = useState<number | null>(null)
  const [imageUploadAllowed, setImageUploadAllowed] = useState(false)
  
  // Packaging charge (store-level; editable once per 30 days)
  const [packagingChargeAmount, setPackagingChargeAmount] = useState<string>('')
  const [packagingChargeLastUpdatedAt, setPackagingChargeLastUpdatedAt] = useState<string | null>(null)
  const [canEditPackagingCharge, setCanEditPackagingCharge] = useState(true)
  const [nextPackagingEditableAt, setNextPackagingEditableAt] = useState<string | null>(null)
  const [packagingSaving, setPackagingSaving] = useState(false)

  // Delivery Settings state
  const [gatimitraDeliveryEnabled, setGatimitraDeliveryEnabled] = useState(true)
  const [selfDeliveryEnabled, setSelfDeliveryEnabled] = useState(false)
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(5)
  const [showSelfDeliveryConfirm, setShowSelfDeliveryConfirm] = useState(false)
  // Delivery charge per km (₹10–₹15, editable once per 30 days) for merchant self-delivery
  const [deliveryChargePerKm, setDeliveryChargePerKm] = useState<string>('')
  const [deliveryChargePerKmLastUpdatedAt, setDeliveryChargePerKmLastUpdatedAt] = useState<string | null>(null)
  const [canEditDeliveryChargePerKm, setCanEditDeliveryChargePerKm] = useState(true)
  const [nextDeliveryChargeEditableAt, setNextDeliveryChargeEditableAt] = useState<string | null>(null)

  // Self-delivery riders (Settings > Riders tab)
  type RiderRow = { id: number; rider_name: string; rider_mobile: string; rider_email: string | null; vehicle_number: string | null; is_primary: boolean; is_active: boolean; has_active_orders: boolean; created_at: string; updated_at: string }
  const [riders, setRiders] = useState<RiderRow[]>([])
  const [ridersLoading, setRidersLoading] = useState(false)
  const [riderForm, setRiderForm] = useState<{ rider_name: string; rider_mobile: string; rider_email: string; vehicle_number: string }>({ rider_name: '', rider_mobile: '', rider_email: '', vehicle_number: '' })
  const [riderEditId, setRiderEditId] = useState<number | null>(null)
  const [riderSaving, setRiderSaving] = useState(false)
  const [riderDeleteId, setRiderDeleteId] = useState<number | null>(null)
  const [riderDeleting, setRiderDeleting] = useState(false)
  
  // Notifications & Alerts state
  const [smsAlerts, setSmsAlerts] = useState(true)
  const [appAlerts, setAppAlerts] = useState(true)
  const [operationalWarnings, setOperationalWarnings] = useState(true)
  
  // Audit & Activity state
  const [actionTrackingEnabled, setActionTrackingEnabled] = useState(true)
  const [staffPermissionsEnabled, setStaffPermissionsEnabled] = useState(false)

  // Outlet timings state - Loaded from Supabase
  const [applyMondayToAll, setApplyMondayToAll] = useState(false)
  const [force24Hours, setForce24Hours] = useState(false)
  const [closedDay, setClosedDay] = useState<DayType | null>(null)

  // Calculate total operational time for a day
  const calculateOperationalTime = (slots: TimeSlot[]) => {
    if (slots.length === 0) return { hours: 0, minutes: 0 }
    
    let totalMinutes = 0
    slots.forEach(slot => {
      const [openHour, openMinute] = slot.openingTime.split(':').map(Number)
      const [closeHour, closeMinute] = slot.closingTime.split(':').map(Number)
      
      let openingMinutes = openHour * 60 + openMinute
      let closingMinutes = closeHour * 60 + closeMinute
      
      // Handle next day closing (e.g., 1:00 AM)
      if (closingMinutes < openingMinutes) {
        closingMinutes += 24 * 60
      }
      
      totalMinutes += closingMinutes - openingMinutes
    })
    
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    
    return { hours, minutes }
  }

  // Initial store schedule
  const initialSchedule: DaySchedule[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ].map(day => ({
    day: day as DayType,
    label: day.toUpperCase(),
    isOpen: false,
    slots: [],
    is24Hours: false,
    isOutletClosed: false,
    duration: '0.0 hrs',
    operationalHours: 0,
    operationalMinutes: 0
  }))

  // Store timing schedule state
  const [storeSchedule, setStoreSchedule] = useState<DaySchedule[]>(initialSchedule)
  
  // Track manual time changes per day (to show save button)
  const [manualTimeChanges, setManualTimeChanges] = useState<Set<DayType>>(new Set())
  
  // Last updated info state
  const [lastUpdatedBy, setLastUpdatedBy] = useState<{ email?: string; at?: string } | null>(null)

  // Load timings from merchant_store_operating_hours on page load
  const fetchTimings = async () => {
    if (!storeId) return;
    try {
      // Get store bigint id from merchant_stores
      const storeRes = await fetch(`/api/store-id?store_id=${storeId}`);
      if (!storeRes.ok) return;
      let storeData;
      try {
        storeData = await storeRes.json();
      } catch (jsonError) {
        console.error('Failed to parse store data JSON:', jsonError);
        return;
      }
      if (!storeData || !storeData.id) return;
      const storeBigIntId = storeData.id;

      // Fetch timings from merchant_store_operating_hours
      const res = await fetch(`/api/outlet-timings?store_id=${storeBigIntId}`);
      if (!res.ok) return;
      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        console.error('Failed to parse timings data JSON:', jsonError);
        return;
      }
      if (!data || data.error) return;

      // Debug: Log fetched timings
      console.log('Fetched timings from /api/operating-hours:', data);

      // Map DB data to DaySchedule[]
      const days: DayType[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const loadedSchedule: DaySchedule[] = days.map(day => {
        const isOpen = !!data[`${day}_open`];
        const isOutletClosed = (data.closed_days || []).includes(day);
        const slots = [];
        let is24Hours = false;

        const toHHMM = (v: string | null) => {
          if (!v) return null;
          const parts = v.split(':');
          return parts.length >= 2 ? `${parts[0].padStart(2, '0')}:${parts[1]}` : v;
        };
        const s1Start = toHHMM(data[`${day}_slot1_start`]);
        const s1End = toHHMM(data[`${day}_slot1_end`]);
        const s2Start = toHHMM(data[`${day}_slot2_start`]);
        const s2End = toHHMM(data[`${day}_slot2_end`]);

        if (s1Start && s1End) {
          slots.push({ id: '1', openingTime: s1Start, closingTime: s1End });
          if (s1Start === '00:00' && (s1End === '23:59' || s1End === '00:00')) {
            is24Hours = true;
          }
        }
        if (s2Start && s2End) {
          slots.push({ id: '2', openingTime: s2Start, closingTime: s2End });
        }

        // Calculate duration
        let minutes = data[`${day}_total_duration_minutes`] || 0;
        let hours = Math.floor(minutes / 60);
        let mins = minutes % 60;

        return {
          day,
          label: day.toUpperCase(),
          isOpen: isOpen && !isOutletClosed,
          slots,
          is24Hours,
          isOutletClosed,
          duration: is24Hours ? '24.0 hrs' : `${hours}.${mins.toString().padStart(2, '0')} hrs`,
          operationalHours: is24Hours ? 24 : hours,
          operationalMinutes: is24Hours ? 0 : mins
        };
      });

      setStoreSchedule(loadedSchedule);
      setApplyMondayToAll(!!data.same_for_all_days);
      setForce24Hours(!!data.is_24_hours);
      setClosedDay((data.closed_days && data.closed_days.length > 0) ? data.closed_days[0] : null);
      
      // Set last updated info
      if (data.updated_by_email || data.updated_by_at) {
        setLastUpdatedBy({
          email: data.updated_by_email,
          at: data.updated_by_at,
        });
      }
      // Do NOT override toggles based on other logic, always use DB values
    } catch (error) {
      console.error('Error loading timings:', error);
    }
  };

  useEffect(() => {
    if (storeId) {
      fetchTimings();
    }
  }, [storeId]);

  // Add a manual refresh button for debugging
  const handleRefreshTimings = () => {
    fetchTimings();
    toast.info('Refetched timings from database. Check console for details.');
  };

  // Update duration when slots change
  useEffect(() => {
    const updateDurations = () => {
      setStoreSchedule(prev => prev.map(day => {
        if (day.is24Hours) {
          return { ...day, duration: '24.0 hrs', operationalHours: 24, operationalMinutes: 0 }
        }
        if (day.isOutletClosed) {
          return { ...day, duration: '0.0 hrs', operationalHours: 0, operationalMinutes: 0 }
        }
        
        const { hours, minutes } = calculateOperationalTime(day.slots)
        return {
          ...day,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }))
    }
    
    updateDurations()
  }, [])

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null
      if (!id) id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      if (!id) id = DEMO_STORE_ID
      setStoreId(id)
    }
    getStoreId()
  }, [searchParams])

  // Load store data
  useEffect(() => {
    if (!storeId) return

    const loadStore = async () => {
      setIsLoading(true)
      try {
        let storeData = await fetchStoreById(storeId)
        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchStoreByName(storeId)
        }
        if (storeData) {
          const s = storeData as MerchantStore
          setStore(s)
          setPhone(s.am_mobile || '')
          setStoreName(s.store_name || '')
          setStoreAddress(s.city || '')
          setStoreDescription(s.store_description || '')
          const latStr = s.latitude != null && !isNaN(Number(s.latitude)) ? String(s.latitude) : ''
          const lngStr = s.longitude != null && !isNaN(Number(s.longitude)) ? String(s.longitude) : ''
          setLatitude(latStr)
          setLongitude(lngStr)
          setFullAddress(s.full_address ?? '')
          setAddressLandmark(s.landmark ?? '')
          setAddressState(s.state ?? '')
          setAddressPostalCode(s.postal_code ?? '')
          setAddressSearchQuery(s.full_address ?? '')
          initialAddressRef.current = {
            full_address: s.full_address ?? '',
            landmark: s.landmark ?? '',
            city: s.city ?? '',
            state: s.state ?? '',
            postal_code: s.postal_code ?? '',
            latitude: latStr,
            longitude: lngStr,
          }
          const radius = typeof s.delivery_radius_km === 'number' && !isNaN(s.delivery_radius_km) ? s.delivery_radius_km : 5
          setDeliveryRadiusKm(radius)
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadStore()
  }, [storeId])

  // Load store operations (open/closed, manual_close_until, block_auto_open)
  const fetchStoreOperations = async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`)
      let data;
      try {
        data = await res.json()
      } catch (jsonError) {
        console.error('Failed to parse store operations JSON:', jsonError);
        // fallback from store if loaded
        if (store) {
          setIsStoreOpen((store as MerchantStore).operational_status === 'OPEN' || !!(store as MerchantStore).is_accepting_orders)
        }
        return;
      }
      if (res.ok) {
        setIsStoreOpen(data.operational_status === 'OPEN')
        setManualCloseUntil(data.manual_close_until || null)
        // Load manual activation lock state from block_auto_open
        setManualActivationLock(data.block_auto_open === true)
      }
    } catch {
      // fallback from store if loaded
      if (store) {
        setIsStoreOpen((store as MerchantStore).operational_status === 'OPEN' || !!(store as MerchantStore).is_accepting_orders)
      }
    }
  }
  useEffect(() => {
    if (storeId) fetchStoreOperations()
  }, [storeId])

  // Load delivery settings (toggles + radius comes from store in loadStore)
  useEffect(() => {
    if (!storeId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setGatimitraDeliveryEnabled(data.platform_delivery !== false)
          setSelfDeliveryEnabled(data.self_delivery === true)
          if (typeof data.delivery_radius_km === 'number' && !isNaN(data.delivery_radius_km)) {
            setDeliveryRadiusKm(data.delivery_radius_km)
          }
          if (data.delivery_charge_per_km != null && !isNaN(Number(data.delivery_charge_per_km))) {
            setDeliveryChargePerKm(String(data.delivery_charge_per_km))
          } else {
            setDeliveryChargePerKm('')
          }
          if (data.delivery_charge_per_km_last_updated_at != null) {
            setDeliveryChargePerKmLastUpdatedAt(data.delivery_charge_per_km_last_updated_at)
          } else {
            setDeliveryChargePerKmLastUpdatedAt(null)
          }
          setCanEditDeliveryChargePerKm(data.can_edit_delivery_charge_per_km !== false)
          if (data.next_delivery_charge_editable_at) {
            setNextDeliveryChargeEditableAt(data.next_delivery_charge_editable_at)
          } else {
            setNextDeliveryChargeEditableAt(null)
          }
          if (typeof data.auto_accept_orders === 'boolean') {
            setAutoAcceptOrders(data.auto_accept_orders)
          }
          if (typeof data.preparation_buffer_minutes === 'number' && !isNaN(data.preparation_buffer_minutes)) {
            setPreparationBufferMinutes(data.preparation_buffer_minutes)
          }
          if (data.packaging_charge_amount != null && !isNaN(Number(data.packaging_charge_amount))) {
            setPackagingChargeAmount(String(data.packaging_charge_amount))
          } else {
            setPackagingChargeAmount('')
          }
          if (data.packaging_charge_last_updated_at != null) {
            setPackagingChargeLastUpdatedAt(data.packaging_charge_last_updated_at)
          } else {
            setPackagingChargeLastUpdatedAt(null)
          }
          setCanEditPackagingCharge(data.can_edit_packaging_charge !== false)
          if (data.next_packaging_editable_at) {
            setNextPackagingEditableAt(data.next_packaging_editable_at)
          } else {
            setNextPackagingEditableAt(null)
          }
          if (data.address) {
            const addr = data.address
            if (addr.full_address != null) setFullAddress(addr.full_address)
            if (addr.landmark != null) setAddressLandmark(addr.landmark)
            if (addr.city != null) setStoreAddress(addr.city)
            if (addr.state != null) setAddressState(addr.state)
            if (addr.postal_code != null) setAddressPostalCode(addr.postal_code)
            if (addr.latitude != null) setLatitude(String(addr.latitude))
            if (addr.longitude != null) setLongitude(String(addr.longitude))
            if (addr.full_address != null) setAddressSearchQuery(addr.full_address)
            initialAddressRef.current = {
              full_address: addr.full_address ?? '',
              landmark: addr.landmark ?? '',
              city: addr.city ?? '',
              state: addr.state ?? '',
              postal_code: addr.postal_code ?? '',
              latitude: addr.latitude != null ? String(addr.latitude) : '',
              longitude: addr.longitude != null ? String(addr.longitude) : '',
            }
          }
        }
      } catch {
        // keep defaults
      }
    }
    load()
  }, [storeId])

  // Address tab: enable Save only when address or coordinates have changed from initial
  const hasAddressChanges = useMemo(() => {
    const init = initialAddressRef.current
    if (!init) return false
    return (
      (fullAddress || '').trim() !== (init.full_address || '').trim() ||
      (addressLandmark || '').trim() !== (init.landmark || '').trim() ||
      (storeAddress || '').trim() !== (init.city || '').trim() ||
      (addressState || '').trim() !== (init.state || '').trim() ||
      (addressPostalCode || '').trim() !== (init.postal_code || '').trim() ||
      (latitude || '').trim() !== (init.latitude || '').trim() ||
      (longitude || '').trim() !== (init.longitude || '').trim()
    )
  }, [fullAddress, addressLandmark, storeAddress, addressState, addressPostalCode, latitude, longitude])

  // Address search: click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addressSearchRef.current && !addressSearchRef.current.contains(event.target as Node)) {
        setAddressSearchResults([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addressSearchLocation = useCallback(async () => {
    if (!addressSearchQuery.trim() || !mapboxToken) return
    setIsAddressSearching(true)
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressSearchQuery)}.json?access_token=${mapboxToken}&country=IN&limit=10&language=en&types=address,place,postcode,poi,neighborhood,locality&proximity=77.1025,28.7041&autocomplete=true`
      const res = await fetch(url)
      const json = await res.json()
      if (json.features?.length > 0) {
        const unique = json.features.filter((r: any, i: number, self: any[]) => self.findIndex((x: any) => x.place_name === r.place_name) === i)
        setAddressSearchResults(unique)
      } else {
        setAddressSearchResults([])
      }
    } catch {
      setAddressSearchResults([])
    } finally {
      setIsAddressSearching(false)
    }
  }, [addressSearchQuery])

  useEffect(() => {
    const t = setTimeout(() => {
      if (addressSearchQuery.length > 2) addressSearchLocation()
      else setAddressSearchResults([])
    }, 500)
    return () => clearTimeout(t)
  }, [addressSearchQuery, addressSearchLocation])

  const addressSelectLocation = useCallback((result: any) => {
    const [lng, lat] = result.center
    const context = result.context || []
    let city = ''
    let state = ''
    let postal_code = ''
    context.forEach((item: any) => {
      if (item.id?.includes('postcode')) postal_code = item.text
      else if (item.id?.includes('place') || item.id?.includes('locality') || item.id?.includes('district')) city = item.text
      else if (item.id?.includes('region')) state = item.text
    })
    if (!postal_code && result.place_name) {
      const m = result.place_name.match(/\b\d{6}\b/)
      if (m) postal_code = m[0]
    }
    if (!city) city = result.text || ''
    setFullAddress(result.place_name || '')
    setStoreAddress(city)
    setAddressState(state)
    setAddressPostalCode(postal_code)
    setLatitude(String(lat))
    setLongitude(String(lng))
    setAddressSearchQuery(result.place_name || '')
    setAddressSearchResults([])
    if (addressMapRef.current) {
      addressMapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1.4 })
    }
  }, [])

  const addressReverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!mapboxToken) return
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&country=IN&limit=1&language=en`)
      const json = await res.json()
      const best = json.features?.[0]
      if (best) {
        const context = best.context || []
        let city = ''
        let state = ''
        let postal_code = ''
        context.forEach((item: any) => {
          if (item.id?.includes('postcode')) postal_code = item.text
          else if (item.id?.includes('place') || item.id?.includes('locality') || item.id?.includes('district')) city = item.text
          else if (item.id?.includes('region')) state = item.text
        })
        setFullAddress(best.place_name || '')
        setStoreAddress(city || storeAddress)
        setAddressState(state || addressState)
        setAddressPostalCode(postal_code || addressPostalCode)
        setAddressSearchQuery(best.place_name || '')
      }
    } catch {
      // ignore
    }
  }, [storeAddress, addressState, addressPostalCode])

  const handleAddressMapClick = useCallback(async (e: { lngLat: { lat: number; lng: number } }) => {
    const { lat, lng } = e.lngLat
    setLatitude(String(lat))
    setLongitude(String(lng))
    if (addressMapRef.current) addressMapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1.2 })
    addressReverseGeocode(lat, lng)
  }, [addressReverseGeocode])

  // Add/remove body class when modal opens/closes to blur sidebar
  useEffect(() => {
    if (showAutoRenewConfirm) {
      document.body.classList.add('modal-open-blur')
    } else {
      document.body.classList.remove('modal-open-blur')
    }
    return () => {
      document.body.classList.remove('modal-open-blur')
    }
  }, [showAutoRenewConfirm])

  useEffect(() => {
    if (!storeId || isStoreOpen || !manualCloseUntil) return
    const t = setInterval(() => fetchStoreOperations(), 30000)
    return () => clearInterval(t)
  }, [storeId, isStoreOpen, manualCloseUntil])

  // Load POS integration when storeId is set
  useEffect(() => {
    if (!storeId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/merchant/pos-integration?storeId=${encodeURIComponent(storeId)}`)
        let data;
        try {
          data = await res.json()
        } catch (jsonError) {
          console.error('Failed to parse POS integration JSON:', jsonError);
          setPosStatus(null)
          setPosIntegrationActive(false)
          return;
        }
        if (res.ok) {
          setPosPartner(data.pos_partner || '')
          setPosStoreId(data.pos_store_id || '')
          setPosStatus(data.status || null)
          setPosIntegrationActive(data.active === true)
        }
      } catch {
        setPosStatus(null)
        setPosIntegrationActive(false)
      }
    }
    load()
  }, [storeId])

  // Load plans and subscription
  useEffect(() => {
    if (!storeId) return
    const loadPlansAndSubscription = async () => {
      setLoadingPlans(true)
      try {
        // Load available plans
        const plansRes = await fetch('/api/merchant/plans')
        let plansData;
        try {
          plansData = await plansRes.json()
        } catch (jsonError) {
          console.error('Failed to parse plans JSON:', jsonError);
        }
        if (plansRes.ok && plansData?.plans) {
          setPlans(plansData.plans)
        }

        // Load current subscription
        const subRes = await fetch(`/api/merchant/subscription?storeId=${encodeURIComponent(storeId)}`)
        let subData;
        try {
          subData = await subRes.json()
        } catch (jsonError) {
          console.error('Failed to parse subscription JSON:', jsonError);
        }
        if (subRes.ok && subData) {
          setCurrentSubscription(subData.subscription)
          setCurrentPlan(subData.plan)
          // Auto-renew should be off by default
          setAutoRenew(subData.subscription?.auto_renew === true ? true : false)
          if (subData.plan?.plan_code) {
            setSubscriptionPlan(subData.plan.plan_code.toLowerCase() as 'free' | 'pro' | 'enterprise')
            setMaxMenuItems(subData.plan.max_menu_items)
            setMaxCuisines(subData.plan.max_cuisines)
            setImageUploadAllowed(subData.plan.image_upload_allowed || false)
            setAnalyticsEnabled(subData.plan.analytics_access || false)
            setAdvancedSecurity(subData.plan.advanced_analytics || false)
            setPrioritySupport(subData.plan.priority_support || false)
            setMarketingAutomation(subData.plan.marketing_automation || false)
          }
        }

        // Load payment history
        const paymentsRes = await fetch(`/api/merchant/subscription/payments?storeId=${encodeURIComponent(storeId)}`)
        let paymentsData;
        try {
          paymentsData = await paymentsRes.json()
        } catch (jsonError) {
          console.error('Failed to parse payments JSON:', jsonError);
        }
        if (paymentsRes.ok && paymentsData?.payments) {
          setPaymentHistory(paymentsData.payments)
        }

        // Load onboarding payments
        const onboardingRes = await fetch(`/api/merchant/onboarding-payments?storeId=${encodeURIComponent(storeId)}`)
        let onboardingData;
        try {
          onboardingData = await onboardingRes.json()
        } catch (jsonError) {
          console.error('Failed to parse onboarding payments JSON:', jsonError);
        }
        if (onboardingRes.ok && onboardingData?.payments) {
          setOnboardingPayments(onboardingData.payments)
        }
      } catch (error) {
        console.error('Error loading plans/subscription:', error)
      } finally {
        setLoadingPlans(false)
      }
    }
    loadPlansAndSubscription()
  }, [storeId])

  // Load menu items count for capacity display
  useEffect(() => {
    if (!storeId) return
    const loadMenuStats = async () => {
      try {
        const res = await fetch(`/api/menu?storeId=${encodeURIComponent(storeId)}`)
        if (!res.ok) {
          console.warn('Menu API returned non-ok status:', res.status);
          return;
        }
        
        // Check if response has content before parsing
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Menu API response is not JSON');
          return;
        }
        
        const text = await res.text();
        if (!text || text.trim().length === 0) {
          console.warn('Menu API returned empty response');
          return;
        }
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (jsonError) {
          console.error('Failed to parse menu JSON:', jsonError, 'Response text:', text.substring(0, 100));
          return;
        }
        
        if (data?.items && Array.isArray(data.items)) {
          setCurrentMenuItemsCount(data.items.length || 0)
          // Count unique cuisines
          const cuisines = new Set(data.items.map((item: any) => item.cuisine_type).filter(Boolean))
          setCurrentCuisinesCount(cuisines.size)
        }
      } catch (error) {
        console.error('Error loading menu stats:', error)
      }
    }
    loadMenuStats()
  }, [storeId])

  // Load self-delivery riders when Delivery tab is active (delivery includes riders)
  useEffect(() => {
    if (!storeId || activeTab !== 'delivery') return
    setRidersLoading(true)
    fetch(`/api/merchant/self-delivery-riders?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.riders) setRiders(data.riders)
        else setRiders([])
      })
      .catch(() => setRiders([]))
      .finally(() => setRidersLoading(false))
  }, [storeId, activeTab])

  const fetchRiders = () => {
    if (!storeId) return
    setRidersLoading(true)
    fetch(`/api/merchant/self-delivery-riders?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => res.json())
      .then((data) => { if (data.riders) setRiders(data.riders) })
      .finally(() => setRidersLoading(false))
  }

  const saveRider = async (editId: number | null) => {
    if (!storeId) return
    const name = riderForm.rider_name.trim()
    const mobile = riderForm.rider_mobile.trim()
    if (!name || !mobile) {
      toast.error('Name and mobile are required')
      return
    }
    setRiderSaving(true)
    try {
      if (editId !== null) {
        const res = await fetch(`/api/merchant/self-delivery-riders/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, rider_name: name, rider_mobile: mobile, rider_email: riderForm.rider_email.trim() || undefined, vehicle_number: riderForm.vehicle_number.trim() || undefined }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success('Rider updated')
          setRiderEditId(null)
          setRiderForm({ rider_name: '', rider_mobile: '', rider_email: '', vehicle_number: '' })
          fetchRiders()
        } else {
          toast.error(data.error || 'Failed to update rider')
        }
      } else {
        const res = await fetch('/api/merchant/self-delivery-riders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, rider_name: name, rider_mobile: mobile, rider_email: riderForm.rider_email.trim() || undefined, vehicle_number: riderForm.vehicle_number.trim() || undefined }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success('Rider added')
          setRiderForm({ rider_name: '', rider_mobile: '', rider_email: '', vehicle_number: '' })
          fetchRiders()
        } else {
          toast.error(data.error || 'Failed to add rider')
        }
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setRiderSaving(false)
    }
  }

  const deleteRider = async (id: number) => {
    if (!storeId) return
    setRiderDeleting(true)
    try {
      const res = await fetch(`/api/merchant/self-delivery-riders/${id}?storeId=${encodeURIComponent(storeId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Rider removed')
        setRiderDeleteId(null)
        fetchRiders()
      } else {
        toast.error(data.error || 'Failed to delete rider')
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setRiderDeleting(false)
    }
  }

  const savePosIntegration = async () => {
    if (!storeId || !posPartner.trim()) {
      toast.error('Please choose your partner POS')
      return
    }
    setPosSaving(true)
    try {
      const res = await fetch('/api/merchant/pos-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          pos_partner: posPartner.trim(),
          pos_store_id: posStoreId.trim() || undefined,
        }),
      })
      let data;
      try {
        data = await res.json()
      } catch (jsonError) {
        console.error('Failed to parse POS save JSON:', jsonError);
        toast.error('Failed to save POS integration - invalid response')
        return;
      }
      if (res.ok && data.success) {
        setPosStatus('PENDING')
        setPosIntegrationActive(false)
        toast.success(data.message || 'POS registration saved.')
      } else {
        toast.error(data.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save POS integration')
    } finally {
      setPosSaving(false)
    }
  }

  const markPosActive = async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/merchant/pos-integration?storeId=${encodeURIComponent(storeId)}&status=ACTIVE`, { method: 'PATCH' })
      let data;
      try {
        data = await res.json()
      } catch (jsonError) {
        console.error('Failed to parse POS status JSON:', jsonError);
        toast.error('Failed to update status - invalid response')
        return;
      }
      if (res.ok && data.success) {
        setPosStatus('ACTIVE')
        setPosIntegrationActive(true)
        toast.success('POS integration marked active. You can now switch to POS mode on the dashboard.')
      } else {
        toast.error(data.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleStoreToggle = async () => {
    if (isStoreOpen) {
      setShowTempOffModal(true)
    } else {
      try {
        const res = await fetch('/api/store-operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, action: 'manual_open' }),
        })
        let data;
        try {
          data = await res.json()
        } catch (jsonError) {
          console.error('Failed to parse store open JSON:', jsonError);
          toast.error('Failed to open store - invalid response')
          return;
        }
        if (res.ok && data.success) {
          setIsStoreOpen(true)
          setManualCloseUntil(null)
          setStore((prev) => prev ? { ...prev, operational_status: 'OPEN', is_accepting_orders: true } : prev)
          toast.success('🟢 Store is now OPEN')
        } else {
          toast.error(data.error || 'Failed to open store')
        }
      } catch {
        toast.error('Failed to open store')
      }
    }
  }

  const handleTempOff = async () => {
    const duration = parseInt(tempOffDurationInput, 10)
    if (duration <= 0) {
      toast.error('⚠️ Please enter a valid duration (1–1440 minutes)')
      return
    }
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, action: 'manual_close', duration_minutes: duration }),
      })
      let data;
      try {
        data = await res.json()
      } catch (jsonError) {
        console.error('Failed to parse store close JSON:', jsonError);
        toast.error('Failed to close store - invalid response')
        return;
      }
      if (res.ok && data.success) {
        setIsStoreOpen(false)
        setManualCloseUntil(data.manual_close_until || null)
        setStore((prev) => prev ? { ...prev, operational_status: 'CLOSED', is_accepting_orders: false } : prev)
        toast.success(`⏱️ Store closed for ${duration} minutes. Will reopen at ${data.reopens_at ? new Date(data.reopens_at).toLocaleTimeString() : 'scheduled time'}.`)
        setShowTempOffModal(false)
        setTempOffDurationInput('30')
      } else {
        toast.error(data.error || 'Failed to close store')
      }
    } catch {
      toast.error('Failed to close store')
    }
  }

  const handleMXDeliveryToggle = () => {
    const newValue = !mxDeliveryEnabled
    setMxDeliveryEnabled(newValue)
    if (newValue) {
      toast.success('✅ MX Self Delivery enabled - GatiMitra delivery disabled')
    } else {
      toast.success('✅ GatiMitra Delivery will handle all deliveries')
    }
  }

  const handleSavePackaging = async () => {
    if (!storeId || !canEditPackagingCharge) return
    const amount = packagingChargeAmount.trim() === '' ? NaN : parseFloat(packagingChargeAmount)
    if (isNaN(amount) || amount < 5 || amount > 15) {
      toast.error('Packaging charge must be between ₹5 and ₹15.')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/merchant/store-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, packaging_charge_amount: amount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || '❌ Failed to save packaging charge')
        return
      }
      toast.success('✅ Packaging charge saved. You can edit it again after 30 days.')
      setPackagingChargeLastUpdatedAt(new Date().toISOString())
      setCanEditPackagingCharge(false)
      setNextPackagingEditableAt(data.next_editable_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    if (activeTab === 'address' && (!fullAddress?.trim() || !storeAddress?.trim() || !addressState?.trim() || !addressPostalCode?.trim())) {
      toast.error('⚠️ Please fill in full address, city, state and postal code')
      return
    }

    setIsSaving(true)
    try {
      if (activeTab === 'operations' && storeId) {
        const res = await fetch('/api/merchant/store-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            auto_accept_orders: autoAcceptOrders,
            preparation_buffer_minutes: typeof preparationBufferMinutes === 'number' && !isNaN(preparationBufferMinutes) ? preparationBufferMinutes : 15,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || '❌ Failed to save store operations')
          return
        }
        toast.success('✅ Store operations saved successfully!')
        return
      }
      if (activeTab === 'delivery' && storeId) {
        const payload: Record<string, unknown> = {
          storeId,
          self_delivery: selfDeliveryEnabled,
          platform_delivery: gatimitraDeliveryEnabled,
          delivery_radius_km: typeof deliveryRadiusKm === 'number' && !isNaN(deliveryRadiusKm) ? deliveryRadiusKm : 5,
        }
        const perKmStr = deliveryChargePerKm.trim()
        if (perKmStr !== '') {
          const perKm = parseFloat(perKmStr)
          if (isNaN(perKm) || perKm < 10 || perKm > 15) {
            toast.error('Delivery charge per km must be between ₹10 and ₹15.')
            return
          }
          payload.delivery_charge_per_km = perKm
        }
        const res = await fetch('/api/merchant/store-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || '❌ Failed to save delivery settings')
          return
        }
        if (payload.delivery_charge_per_km != null) {
          setDeliveryChargePerKmLastUpdatedAt(new Date().toISOString())
          setCanEditDeliveryChargePerKm(false)
          setNextDeliveryChargeEditableAt(data.next_editable_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
        }
        toast.success('✅ Delivery settings saved successfully!')
        return
      }
      if (activeTab === 'address' && storeId) {
        const latNum = latitude ? parseFloat(latitude) : undefined
        const lngNum = longitude ? parseFloat(longitude) : undefined
        const res = await fetch('/api/merchant/store-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            address: {
              full_address: fullAddress.trim(),
              landmark: addressLandmark.trim() || undefined,
              city: storeAddress.trim(),
              state: addressState.trim(),
              postal_code: addressPostalCode.trim(),
              latitude: latNum != null && !isNaN(latNum) ? latNum : undefined,
              longitude: lngNum != null && !isNaN(lngNum) ? lngNum : undefined,
            },
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || '❌ Failed to save address')
          return
        }
        toast.success('✅ Address saved successfully!')
        if (store) setStore({ ...store, full_address: fullAddress, landmark: addressLandmark, city: storeAddress, state: addressState, postal_code: addressPostalCode, latitude: latNum, longitude: lngNum })
        initialAddressRef.current = {
          full_address: fullAddress.trim(),
          landmark: addressLandmark.trim(),
          city: storeAddress.trim(),
          state: addressState.trim(),
          postal_code: addressPostalCode.trim(),
          latitude: latitude,
          longitude: longitude,
        }
        return
      }
      await new Promise(resolve => setTimeout(resolve, 800))
      toast.success('✅ Settings saved successfully!')
    } catch (error) {
      toast.error('❌ Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePremiumFeatureToggle = (feature: string, value: boolean) => {
    if (subscriptionPlan === 'free') {
      toast.error('💎 Upgrade to Pro plan to access this feature')
      return false
    }
    toast.success(`✅ ${feature} ${value ? 'enabled' : 'disabled'}`)
    return true
  }

  // Load Razorpay script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleAutoRenewToggle = async (value: boolean) => {
    if (!storeId) return;
    
    // If turning ON, show confirmation popup
    if (value && !autoRenew) {
      setShowAutoRenewConfirm(true);
      return;
    }
    
    // If turning OFF, proceed directly
    await updateAutoRenew(value);
  };

  const updateAutoRenew = async (value: boolean) => {
    if (!storeId) return;
    try {
      const res = await fetch('/api/merchant/subscription/auto-renew', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, autoRenew: value }),
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        console.error('Failed to parse auto-renew JSON:', jsonError);
        toast.error('Failed to update auto-renew');
        return;
      }
      if (res.ok && data.success) {
        setAutoRenew(value);
        toast.success(`Auto-renew ${value ? 'enabled' : 'disabled'}`);
        setShowAutoRenewConfirm(false);
      } else {
        toast.error(data.error || 'Failed to update auto-renew');
      }
    } catch (error) {
      console.error('Error updating auto-renew:', error);
      toast.error('Failed to update auto-renew');
    }
  };

  const reloadSubscriptionData = async () => {
    if (!storeId) return;
    try {
      const subRes = await fetch(`/api/merchant/subscription?storeId=${encodeURIComponent(storeId)}`);
      let subData;
      try {
        subData = await subRes.json();
      } catch (jsonError) {
        console.error('Failed to parse subscription reload JSON:', jsonError);
        return;
      }
      if (subRes.ok && subData) {
        setCurrentSubscription(subData.subscription);
        setCurrentPlan(subData.plan);
        // Auto-renew should be off by default
        setAutoRenew(subData.subscription?.auto_renew === true ? true : false);
        if (subData.plan?.plan_code) {
          setSubscriptionPlan(subData.plan.plan_code.toLowerCase() as 'free' | 'pro' | 'enterprise');
          setMaxMenuItems(subData.plan.max_menu_items);
          setMaxCuisines(subData.plan.max_cuisines);
          setImageUploadAllowed(subData.plan.image_upload_allowed || false);
        }
      }

      // Reload payment history
      const paymentsRes = await fetch(`/api/merchant/subscription/payments?storeId=${encodeURIComponent(storeId)}`);
      let paymentsData;
      try {
        paymentsData = await paymentsRes.json();
      } catch (jsonError) {
        console.error('Failed to parse payments JSON:', jsonError);
      }
      if (paymentsRes.ok && paymentsData?.payments) {
        setPaymentHistory(paymentsData.payments);
      }
    } catch (error) {
      console.error('Error reloading subscription data:', error);
    }
  };

  // Poll subscription order status when user may have paid but closed tab (or webhook completed)
  const SUB_POLL_INTERVAL_MS = 3000;
  const SUB_POLL_MAX = 100;
  useEffect(() => {
    if (!pendingSubscriptionOrderId) return;
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      if (attempts > SUB_POLL_MAX) {
        clearInterval(t);
        setPendingSubscriptionOrderId(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/merchant/subscription/order-status?orderId=${encodeURIComponent(pendingSubscriptionOrderId)}`
        );
        const data = await res.json();
        if (data.success && data.captured) {
          clearInterval(t);
          setPendingSubscriptionOrderId(null);
          toast.success('Payment confirmed. Your subscription is active.');
          await reloadSubscriptionData();
        }
      } catch {
        // ignore
      }
    }, SUB_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pendingSubscriptionOrderId]);

  useEffect(() => {
    if (!pendingSubscriptionOrderId || document.visibilityState !== 'visible') return;
    const check = async () => {
      try {
        const res = await fetch(
          `/api/merchant/subscription/order-status?orderId=${encodeURIComponent(pendingSubscriptionOrderId)}`
        );
        const data = await res.json();
        if (data.success && data.captured) {
          setPendingSubscriptionOrderId(null);
          toast.success('Payment confirmed. Your subscription is active.');
          await reloadSubscriptionData();
        }
      } catch {
        // ignore
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !pendingSubscriptionOrderId) return;
      check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pendingSubscriptionOrderId]);

  const handleUpgradePlan = async (planId: number) => {
    if (!storeId) return;
    
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) {
      toast.error('Plan not found');
      return;
    }

    // Prevent downgrading to free plan if there's an active paid subscription
    if ((selectedPlan.price === 0 || selectedPlan.price === null) && currentPlan && currentPlan.price > 0) {
      const expiryDate = currentSubscription?.expiry_date ? new Date(currentSubscription.expiry_date) : null;
      const isExpired = expiryDate ? expiryDate < new Date() : false;
      
      if (!isExpired) {
        toast.error(`⚠️ आपका ${currentPlan.plan_name} plan अभी भी active है। Free plan पर move करने के लिए पहले current plan expire होना चाहिए।`);
        toast.error(`⚠️ Your ${currentPlan.plan_name} plan is still active. Please wait until it expires to move to Free plan.`);
        return;
      }
    }

    // If plan is free, activate directly without payment
    if (selectedPlan.price === 0 || selectedPlan.price === null) {
      setUpgradingPlanId(planId);
      try {
        const res = await fetch('/api/merchant/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            planId,
            paymentGatewayId: `free_${Date.now()}`,
          }),
        });
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          console.error('Failed to parse subscription activation JSON:', jsonError);
          toast.error('Failed to activate subscription - invalid response');
          return;
        }
        if (res.ok && data.success) {
          toast.success('🎉 Subscription activated successfully!');
          await reloadSubscriptionData();
        } else {
          const errorMsg = data.errorEn || data.error || 'Failed to activate subscription';
          toast.error(errorMsg);
        }
      } catch (error) {
        console.error('Error activating subscription:', error);
        toast.error('Failed to activate subscription');
      } finally {
        setUpgradingPlanId(null);
      }
      return;
    }

    // For paid plans, use Razorpay
    setUpgradingPlanId(planId);
    try {
      // Load Razorpay script
      await loadRazorpayScript();

      // Create payment order
      const orderRes = await fetch('/api/merchant/subscription/create-payment-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, planId }),
      });

      let orderData;
      try {
        orderData = await orderRes.json();
      } catch (jsonError) {
        console.error('Failed to parse order JSON:', jsonError);
        toast.error('Failed to create payment order');
        setUpgradingPlanId(null);
        return;
      }

      if (!orderRes.ok || !orderData.success) {
        toast.error(orderData.error || 'Failed to create payment order');
        setUpgradingPlanId(null);
        return;
      }

      // Zero-amount upgrade (proration covers full price): confirm upgrade without Razorpay
      if (orderData.skipPayment) {
        const upgradeRes = await fetch('/api/merchant/subscription/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, newPlanId: planId, skipPayment: true }),
        });
        const upgradeData = await upgradeRes.json().catch(() => ({}));
        if (upgradeRes.ok && upgradeData.success) {
          toast.success('🎉 Upgrade complete! Your new plan is active.');
          await reloadSubscriptionData();
        } else {
          toast.error(upgradeData.error || 'Upgrade failed');
        }
        setUpgradingPlanId(null);
        return;
      }

      const isUpgrade = !!orderData.isUpgrade;
      if (isUpgrade && orderData.amountToCharge != null) {
        toast.info(`You will be charged ₹${Number(orderData.amountToCharge).toFixed(2)} after adjusting unused time from your current plan.`, { duration: 5000 });
      }

      const clearProcessing = () => {
        setUpgradingPlanId((current) => (current === planId ? null : current));
      };
      setPendingSubscriptionOrderId(orderData.orderId);

      // Open Razorpay checkout
      const rzp = new (window as any).Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        order_id: orderData.orderId,
        name: 'GatiMitra Growth Plans ⭐',
        description: isUpgrade
          ? `${selectedPlan.plan_name} – ₹${Number(orderData.amountToCharge || 0).toFixed(2)} (credit applied)`
          : `${selectedPlan.plan_name} - ₹${selectedPlan.price}/${selectedPlan.billing_cycle?.toLowerCase() || 'month'}`,
        theme: {
          color: '#f97316',
        },
        modal: {
          ondismiss: () => {
            toast.info('ℹ️ Payment cancelled by user');
            clearProcessing();
          },
        },
        handler: async (response: any) => {
          try {
            const apiUrl = isUpgrade ? '/api/merchant/subscription/upgrade' : '/api/merchant/subscription/verify-payment';
            const body = isUpgrade
              ? { storeId, newPlanId: planId, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }
              : { storeId, planId, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature };
            const verifyRes = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            let verifyData;
            try {
              verifyData = await verifyRes.json();
            } catch (jsonError) {
              console.error('Failed to parse verification JSON:', jsonError);
              toast.error('Payment verification failed');
              clearProcessing();
              return;
            }

            if (verifyRes.ok && verifyData.success) {
              setPendingSubscriptionOrderId(null);
              toast.success(isUpgrade ? '🎉 Upgrade successful! Your new plan is active.' : '🎉 Payment successful! Subscription activated.');
              await reloadSubscriptionData();
            } else {
              toast.error(verifyData.error || 'Payment verification failed');
            }
          } catch (error) {
            console.error('Error verifying payment:', error);
            toast.error('Payment verification failed');
          } finally {
            clearProcessing();
          }
        },
        prefill: {
          email: store?.store_email || '',
          contact: store?.store_phones?.[0] ?? '',
        },
      });

      rzp.on('payment.failed', (response: any) => {
        toast.error(`Payment failed: ${response.error?.description || 'Unknown error'}`);
        clearProcessing();
      });

      rzp.on('modal.close', () => clearProcessing());

      rzp.open();

      // Safety: clear "Processing..." and pending order after 5 min if modal was closed without events
      setTimeout(() => {
        clearProcessing();
        setPendingSubscriptionOrderId((id) => (id === orderData.orderId ? null : id));
      }, 300000);
    } catch (error) {
      console.error('Error initiating payment:', error);
      toast.error('Failed to initiate payment');
      setUpgradingPlanId(null);
    }
  }

  // Helper function to log activities
  const logActivity = async (activityType: string, description: string, metadata?: any) => {
    if (!storeId) return;
    try {
      await fetch('/api/merchant/store-settings-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          activityType,
          description,
          metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't show error to user, just log it
    }
  };

  // Save manual activation lock to database
  const saveManualActivationLock = async (enabled: boolean) => {
    if (!storeId) return;
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          action: 'update_manual_lock',
          block_auto_open: enabled,
        }),
      });

      if (!res.ok) {
        let errorText = 'Failed to save';
        try {
          const errorData = await res.json();
          errorText = errorData.error || errorText;
        } catch (e) {
          errorText = await res.text() || errorText;
        }
        console.error('Failed to save manual activation lock:', errorText);
        toast.error('Failed to save manual activation lock setting');
        // Revert toggle on error
        setManualActivationLock(!enabled);
        return;
      }

      const result = await res.json();
      if (result.success) {
        toast.success(enabled ? '🔒 Manual activation lock enabled' : '🔓 Manual activation lock disabled');
        // Log activity
        await logActivity('MANUAL_LOCK_TOGGLE', `Manual activation lock ${enabled ? 'enabled' : 'disabled'}`, {
          enabled,
          block_auto_open: enabled,
        });
      }
    } catch (error) {
      console.error('Error saving manual activation lock:', error);
      toast.error('Failed to save manual activation lock setting');
      // Revert toggle on error
      setManualActivationLock(!enabled);
    }
  };

  // Helper function to save complete timings state
  const saveCompleteTimings = async (overrideSchedule?: DaySchedule[], overrideSameForAll?: boolean, override24Hours?: boolean, overrideClosedDay?: DayType | null) => {
    if (!storeId) return false;
    try {
      const scheduleToUse = overrideSchedule || storeSchedule;
      const sameForAllToUse = overrideSameForAll !== undefined ? overrideSameForAll : applyMondayToAll;
      const force24HoursToUse = override24Hours !== undefined ? override24Hours : force24Hours;
      const closedDayToUse = overrideClosedDay !== undefined ? overrideClosedDay : closedDay;
      
      // Calculate closed_days array from all closed days
      const closedDaysArray: string[] = [];
      scheduleToUse.forEach(day => {
        if (!day.isOpen || day.isOutletClosed) {
          closedDaysArray.push(day.day);
        }
      });
      
      const timings: any = { 
        store_id: storeId,
        same_for_all: sameForAllToUse,
        force_24_hours: force24HoursToUse,
        closed_day: closedDayToUse, // Keep for backward compatibility
        closed_days: closedDaysArray.length > 0 ? closedDaysArray : null, // New: array of all closed days
      };
      
      // Add all day states
      scheduleToUse.forEach(day => {
        const prefix = day.day;
        timings[`${prefix}_open`] = day.isOpen && !day.isOutletClosed;
        if (day.is24Hours) {
          // For 24 hours, use 00:00 to 23:59 to satisfy the constraint (end > start)
          // Alternatively, we could set both to NULL, but using actual times is clearer
          timings[`${prefix}_slot1_start`] = '00:00';
          timings[`${prefix}_slot1_end`] = '23:59';
          timings[`${prefix}_slot2_start`] = null;
          timings[`${prefix}_slot2_end`] = null;
          timings[`${prefix}_total_duration_minutes`] = 24 * 60;
        } else if (day.isOutletClosed) {
          timings[`${prefix}_slot1_start`] = null;
          timings[`${prefix}_slot1_end`] = null;
          timings[`${prefix}_slot2_start`] = null;
          timings[`${prefix}_slot2_end`] = null;
          timings[`${prefix}_total_duration_minutes`] = 0;
        } else {
          timings[`${prefix}_slot1_start`] = day.slots[0]?.openingTime || null;
          timings[`${prefix}_slot1_end`] = day.slots[0]?.closingTime || null;
          timings[`${prefix}_slot2_start`] = day.slots[1]?.openingTime || null;
          timings[`${prefix}_slot2_end`] = day.slots[1]?.closingTime || null;
          timings[`${prefix}_total_duration_minutes`] = (day.operationalHours * 60 + day.operationalMinutes);
        }
      });
      
      const { data: { user } } = await supabase.auth.getUser();
      timings.updated_by_email = user?.email || '';
      timings.updated_by_at = new Date().toISOString();

      const res = await fetch('/api/outlet-timings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timings),
      });

      if (!res.ok) {
        let errorText = 'Failed to save';
        try {
          const errorData = await res.json();
          errorText = errorData.error || errorText;
        } catch (e) {
          try {
            errorText = await res.text() || errorText;
          } catch (e2) {
            errorText = `HTTP ${res.status} ${res.statusText}`;
          }
        }
        
        console.error('Failed to save timings:', errorText);
        toast.error(errorText);
        return false;
      }

      const result = await res.json();
      const success = result.success !== false;
      if (result.warnings?.length) {
        result.warnings.forEach((w: string) => toast.warning(w));
      }
      
      // Log successful save
      if (success) {
        await logActivity('TIMING_SAVE_SUCCESS', 'Timings saved successfully', {
          scheduleState: {
            sameForAll: sameForAllToUse,
            force24Hours: force24HoursToUse,
            closedDay: closedDayToUse,
          },
        });
      }
      
      return success;
    } catch (error) {
      console.error('Failed to save timings:', error);
      return false;
    }
  };

  // Store timing functions
  const toggleDayExpansion = (day: DayType) => {
    setExpandedDay(expandedDay === day ? null : day)
  }

  const handleDayToggle = async (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day);
    if (!daySchedule) return;
    
    const oldValue = daySchedule.isOpen;
    const newIsOpen = !oldValue;
    
    // Remove from manual changes since this is a toggle (auto-save)
    setManualTimeChanges(prev => {
      const newSet = new Set(prev);
      newSet.delete(day);
      return newSet;
    });
    
    const newSchedule = storeSchedule.map(d => {
      if (d.day === day) {
        const newSlots = (newIsOpen && !d.is24Hours && !d.isOutletClosed) ? [] : d.slots;
        const { hours, minutes } = calculateOperationalTime(newSlots);
        
        return {
          ...d,
          isOpen: newIsOpen,
          isOutletClosed: false,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    });
    
    // Update state
    setStoreSchedule(newSchedule);
    
    // Disable same for all when any day is modified
    const newSameForAll = false; // Always false when individual day is modified
    if (applyMondayToAll) {
      setApplyMondayToAll(false);
    }
    
    // Disable 24 hours when any day is modified
    const newForce24Hours = false; // Always false when individual day is modified
    if (force24Hours) {
      setForce24Hours(false);
    }
    
    // If day is being opened, remove from closed day
    const newClosedDay = (newIsOpen && closedDay === day) ? null : closedDay;
    if (newIsOpen && closedDay === day) {
      setClosedDay(null);
    }
    
    // Auto-save complete state immediately with updated values
    const saved = await saveCompleteTimings(newSchedule, newSameForAll, newForce24Hours, newClosedDay);
    if (saved) {
          await logActivity('DAY_TOGGLE', `${day.toUpperCase()} ${newIsOpen ? 'opened' : 'closed'}`, {
            day,
            oldValue,
            newValue: newIsOpen,
          });
          await fetchLastUpdatedInfo(); // Refresh last updated info
    } else {
      toast.error('Failed to save toggle state');
    }
    
    toast.success(`${day.charAt(0).toUpperCase() + day.slice(1)} ${newIsOpen ? 'opened' : 'closed'}`)
  }

  const handle24HoursToggle = async (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day);
    if (!daySchedule) return;
    
    const oldValue = daySchedule.is24Hours;
    const new24Hours = !oldValue;
    
    // Remove from manual changes since this is a toggle (auto-save)
    setManualTimeChanges(prev => {
      const newSet = new Set(prev);
      newSet.delete(day);
      return newSet;
    });
    
    const newSchedule = storeSchedule.map(d => {
      if (d.day === day) {
        return {
          ...d,
          is24Hours: new24Hours,
          isOutletClosed: false,
          slots: new24Hours ? [{ id: '1', openingTime: '00:00', closingTime: '23:59' }] : [],
          duration: new24Hours ? '24.0 hrs' : '0.0 hrs',
          operationalHours: new24Hours ? 24 : 0,
          operationalMinutes: 0
        }
      }
      return d
    });
    
    setStoreSchedule(newSchedule);
    
    // Disable same for all when individual day is modified
    const newSameForAll = false; // Always false when individual day is modified
    if (applyMondayToAll) {
      setApplyMondayToAll(false);
    }
    
    // Disable force24Hours when individual day is modified
    const newForce24Hours = false; // Always false when individual day is modified
    if (force24Hours) {
      setForce24Hours(false);
    }
    
    // Remove from closed day if enabling 24 hours
    const newClosedDay = (new24Hours && closedDay === day) ? null : closedDay;
    if (new24Hours && closedDay === day) {
      setClosedDay(null);
    }
    
    // Auto-save complete state immediately with updated values
    const saved = await saveCompleteTimings(newSchedule, newSameForAll, newForce24Hours, newClosedDay);
    if (saved) {
      await logActivity('24H_TOGGLE', `24 Hours ${new24Hours ? 'enabled' : 'disabled'} for ${day.toUpperCase()}`, {
        day,
        oldValue,
        newValue: new24Hours,
      });
      await fetchLastUpdatedInfo(); // Refresh last updated info
    } else {
      toast.error('Failed to save toggle state');
    }
    
    toast.success(`24 Hours ${new24Hours ? 'enabled' : 'disabled'} for ${day}`)
  }

  const handleOutletClosedToggle = async (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (!daySchedule) return
    
    const oldValue = daySchedule.isOutletClosed;
    const newOutletClosed = !oldValue
    
    // Remove from manual changes since this is a toggle (auto-save)
    setManualTimeChanges(prev => {
      const newSet = new Set(prev);
      newSet.delete(day);
      return newSet;
    });
    
    const newSchedule = storeSchedule.map(d => {
      if (d.day === day) {
        return {
          ...d,
          isOutletClosed: newOutletClosed,
          is24Hours: false,
          slots: [],
          duration: '0.0 hrs',
          operationalHours: 0,
          operationalMinutes: 0
        }
      }
      return d
    });
    
    setStoreSchedule(newSchedule);
    
    const newClosedDay = newOutletClosed ? day : (closedDay === day ? null : closedDay);
    if (newOutletClosed) {
      setClosedDay(day)
    } else if (closedDay === day) {
      setClosedDay(null)
    }
    
    // Disable same for all and 24 hours when any day is closed
    const newSameForAll = newOutletClosed ? false : applyMondayToAll;
    const newForce24Hours = newOutletClosed ? false : force24Hours;
    if (newOutletClosed) {
      if (applyMondayToAll) {
        setApplyMondayToAll(false);
      }
      if (force24Hours) {
        setForce24Hours(false);
      }
    }
    
    // Auto-save complete state immediately with updated values
    const saved = await saveCompleteTimings(newSchedule, newSameForAll, newForce24Hours, newClosedDay);
    if (saved) {
      await logActivity('OUTLET_CLOSED_TOGGLE', `Outlet ${newOutletClosed ? 'closed' : 'opened'} on ${day.toUpperCase()}`, {
        day,
        oldValue,
        newValue: newOutletClosed,
      });
      await fetchLastUpdatedInfo(); // Refresh last updated info
    } else {
      toast.error('Failed to save toggle state');
    }
    
    toast.success(`Outlet ${newOutletClosed ? 'closed' : 'opened'} on ${day}`)
  }

  const addTimeSlot = (day: DayType) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (!daySchedule || daySchedule.slots.length >= 2) {
      toast.error('Maximum 2 slots allowed per day')
      return
    }
    
    setManualTimeChanges(prev => new Set(prev).add(day))
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);
    
    const newSlot: TimeSlot = {
      id: Date.now().toString(),
      openingTime: '14:00',
      closingTime: '18:00'
    }
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newSlots = [...d.slots, newSlot]
        const { hours, minutes } = calculateOperationalTime(newSlots)
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }))
    toast.success('New time slot added')
  }

  const removeTimeSlot = (day: DayType, slotId: string) => {
    const daySchedule = storeSchedule.find(d => d.day === day)
    if (daySchedule?.slots.length === 1) {
      toast.error('At least one time slot is required')
      return
    }
    
    setManualTimeChanges(prev => new Set(prev).add(day))
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newSlots = d.slots.filter(s => s.id !== slotId)
        const { hours, minutes } = calculateOperationalTime(newSlots)
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }))
    toast.success('Time slot removed')
  }

  // Fetch last updated info from timings
  const fetchLastUpdatedInfo = async () => {
    if (!storeId) return;
    try {
      // Get store bigint id
      const storeRes = await fetch(`/api/store-id?store_id=${storeId}`);
      if (!storeRes.ok) return;
      const storeData = await storeRes.json();
      if (!storeData?.id) return;
      const storeBigIntId = storeData.id;

      // Fetch timings to get last updated info
      const res = await fetch(`/api/outlet-timings?store_id=${storeBigIntId}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.updated_by_email || data?.updated_by_at) {
          setLastUpdatedBy({
            email: data.updated_by_email,
            at: data.updated_by_at,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch last updated info:', error);
    }
  };

  useEffect(() => {
    if (storeId && activeTab === 'timings') {
      fetchLastUpdatedInfo();
    }
  }, [storeId, activeTab]);

  const updateTimeSlot = (day: DayType, slotId: string, field: 'openingTime' | 'closingTime', value: string) => {
    setManualTimeChanges(prev => new Set(prev).add(day))
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);
    
    setStoreSchedule(prev => prev.map(d => {
      if (d.day === day) {
        const newSlots = d.slots.map(slot => 
          slot.id === slotId ? { ...slot, [field]: value } : slot
        )
        const { hours, minutes } = calculateOperationalTime(newSlots)
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, '0')} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes
        }
      }
      return d
    }));
  }

  const copyToAllDays = () => {
    const mondaySchedule = storeSchedule.find(d => d.day === 'monday')
    if (mondaySchedule) {
      setStoreSchedule(prev => prev.map(day => ({
        ...mondaySchedule,
        day: day.day,
        label: day.label,
        isOutletClosed: false // Reset outlet closed when copying
      })))
      
      // Enable same for all
      setApplyMondayToAll(true);
      // Reset closed day
      setClosedDay(null);
      toast.success('Timings copied to all days')
    }
  }

  const saveStoreTimings = async () => {
    if (!storeId) {
      toast.error('Store ID not found!');
      return;
    }
    
    setIsSaving(true);
    
    // Prepare timings object for API
    const timings: any = { 
      store_id: storeId,
      same_for_all: applyMondayToAll,
      force_24_hours: force24Hours,
      closed_day: closedDay
    };
    
    // If 24 hours is enabled for all, set all days to 24 hours
    if (force24Hours) {
      setApplyMondayToAll(true); // Auto-enable same for all
      timings.same_for_all = true;
      storeSchedule.forEach(day => {
        const prefix = day.day;
        timings[`${prefix}_open`] = true;
        timings[`${prefix}_slot1_start`] = '00:00';
        timings[`${prefix}_slot1_end`] = '00:00';
        timings[`${prefix}_slot2_start`] = null;
        timings[`${prefix}_slot2_end`] = null;
        timings[`${prefix}_total_duration_minutes`] = 24 * 60;
      });
    } 
    // If same for all is enabled, copy Monday's schedule to all days
    else if (applyMondayToAll) {
      const monday = storeSchedule.find(d => d.day === 'monday');
      if (monday) {
        storeSchedule.forEach(day => {
          const prefix = day.day;
          timings[`${prefix}_open`] = !monday.isOutletClosed;
          timings[`${prefix}_slot1_start`] = monday.slots[0]?.openingTime || null;
          timings[`${prefix}_slot1_end`] = monday.slots[0]?.closingTime || null;
          timings[`${prefix}_slot2_start`] = monday.slots[1]?.openingTime || null;
          timings[`${prefix}_slot2_end`] = monday.slots[1]?.closingTime || null;
          timings[`${prefix}_total_duration_minutes`] = monday.is24Hours ? 24 * 60 : (monday.operationalHours * 60 + monday.operationalMinutes);
        });
        timings.closed_day = monday.isOutletClosed ? 'monday' : null;
      }
    } 
    // Otherwise, save each day individually
    else {
      storeSchedule.forEach(day => {
        const prefix = day.day;
        timings[`${prefix}_open`] = day.isOpen && !day.isOutletClosed;
        if (day.is24Hours) {
          timings[`${prefix}_slot1_start`] = '00:00';
          timings[`${prefix}_slot1_end`] = '23:59';
          timings[`${prefix}_slot2_start`] = null;
          timings[`${prefix}_slot2_end`] = null;
          timings[`${prefix}_total_duration_minutes`] = 24 * 60;
        } else if (day.isOutletClosed) {
          timings[`${prefix}_slot1_start`] = null;
          timings[`${prefix}_slot1_end`] = null;
          timings[`${prefix}_slot2_start`] = null;
          timings[`${prefix}_slot2_end`] = null;
          timings[`${prefix}_total_duration_minutes`] = 0;
        } else {
          timings[`${prefix}_slot1_start`] = day.slots[0]?.openingTime || null;
          timings[`${prefix}_slot1_end`] = day.slots[0]?.closingTime || null;
          timings[`${prefix}_slot2_start`] = day.slots[1]?.openingTime || null;
          timings[`${prefix}_slot2_end`] = day.slots[1]?.closingTime || null;
          timings[`${prefix}_total_duration_minutes`] = (day.operationalHours * 60 + day.operationalMinutes);
        }
      });
    }
    
    // Get user email from Supabase Auth
    let userEmail = '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email || '';
    } catch (e) {
      userEmail = '';
    }
    timings.updated_by_email = userEmail;
    timings.updated_by_at = new Date().toISOString();

    try {
      const res = await fetch('/api/outlet-timings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timings),
      });
      
      if (res.ok) {
        const result = await res.json().catch(() => ({}));
        if (result.warnings?.length) {
          result.warnings.forEach((w: string) => toast.warning(w));
        }
        toast.success('✅ Store timings saved successfully!');
        await fetchTimings();
      } else {
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          console.error('Failed to parse timings save error JSON:', jsonError);
          toast.error('Failed to save timings: Invalid response');
          return;
        }
        toast.error('Failed to save timings: ' + (data?.error || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error('Failed to save timings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  const formatTimeForDisplay = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const handleClosedDayChange = async (day: DayType) => {
    const oldClosedDay = closedDay;
    
    // Clear manual changes since this is a dropdown change (auto-save)
    setManualTimeChanges(new Set());
    
    // First, open all days
    const updatedSchedule = storeSchedule.map(d => ({
      ...d,
      isOutletClosed: false
    }))
    
    // Then close the selected day if not empty
    const finalSchedule = updatedSchedule.map(d => 
      d.day === day ? { 
        ...d, 
        isOutletClosed: true,
        is24Hours: false,
        slots: [],
        duration: '0.0 hrs',
        operationalHours: 0,
        operationalMinutes: 0
      } : d
    )
    
    setStoreSchedule(finalSchedule)
    setClosedDay(day)
    
    // Disable same for all and 24 hours when a day is closed
    const newSameForAll = false; // Always false when day is closed
    const newForce24Hours = false; // Always false when day is closed
    if (applyMondayToAll) {
      setApplyMondayToAll(false);
    }
    if (force24Hours) {
      setForce24Hours(false);
    }
    
    // Auto-save complete state immediately with updated values
    const saved = await saveCompleteTimings(finalSchedule, newSameForAll, newForce24Hours, day);
    if (saved) {
      await logActivity('CLOSED_DAY_CHANGE', `Outlet closed on ${day.toUpperCase()}`, {
        day,
        oldClosedDay,
        newClosedDay: day,
      });
      await fetchLastUpdatedInfo(); // Refresh last updated info
    } else {
      toast.error('Failed to save toggle state');
    }
    
    toast.success(`Outlet closed on ${day.toUpperCase()}`)
  }

  const toggle24HoursForAll = async () => {
    const oldValue = force24Hours;
    const newForce24Hours = !oldValue;
    
    // Clear manual changes since this is a toggle (auto-save)
    setManualTimeChanges(new Set());
    
    if (newForce24Hours) {
      // Set all days to 24 hours (00:00-00:00)
      const newSchedule = storeSchedule.map(d => ({
        ...d,
        is24Hours: true,
        isOutletClosed: false,
        isOpen: true,
        slots: [{ id: '1', openingTime: '00:00', closingTime: '23:59' }],
        duration: '24.0 hrs',
        operationalHours: 24,
        operationalMinutes: 0
      }));
      
      setStoreSchedule(newSchedule);
      setClosedDay(null);
      setApplyMondayToAll(true); // Auto-enable same for all
      setForce24Hours(true);
      
      // Auto-save complete state immediately with updated values
      const saved = await saveCompleteTimings(newSchedule, true, true, null);
      if (saved) {
        await logActivity('24H_TOGGLE_ALL', '24 hours enabled for all days', {
          reason: '24_hours_enabled',
        });
        await fetchLastUpdatedInfo(); // Refresh last updated info
        toast.success('24 hours enabled for all days');
      } else {
        toast.error('Failed to save toggle state');
      }
    } else {
      // Disable 24 hours for all
      setForce24Hours(false);
      
      // Auto-save complete state immediately with updated values
      const saved = await saveCompleteTimings(undefined, applyMondayToAll, false, closedDay);
      if (saved) {
        await logActivity('24H_TOGGLE_ALL', '24 hours disabled for all days', {
          reason: '24_hours_disabled',
        });
        await fetchLastUpdatedInfo(); // Refresh last updated info
        toast.success('24 hours disabled for all days');
      } else {
        toast.error('Failed to save toggle state');
      }
      // Don't reset schedule, let user modify individually
    }
  }

  const toggleSameForAllDays = async () => {
    const oldValue = applyMondayToAll;
    const newSameForAll = !oldValue;
    
    // Clear manual changes since this is a toggle (auto-save)
    setManualTimeChanges(new Set());
    
    if (newSameForAll) {
      const monday = storeSchedule.find(d => d.day === 'monday');
      if (monday) {
        const newSchedule = storeSchedule.map(d => ({
          ...d,
          slots: monday.slots,
          is24Hours: monday.is24Hours,
          isOutletClosed: monday.isOutletClosed,
          isOpen: monday.isOpen,
          duration: monday.duration,
          operationalHours: monday.operationalHours,
          operationalMinutes: monday.operationalMinutes
        }));
        
        setStoreSchedule(newSchedule);
        
        // If Monday is closed, set closed day
        const newClosedDay = monday.isOutletClosed ? 'monday' : null;
        if (monday.isOutletClosed) {
          setClosedDay('monday');
        } else {
          setClosedDay(null);
        }
        
        // If Monday is 24 hours, enable force24Hours
        const newForce24Hours = monday.is24Hours;
        if (monday.is24Hours) {
          setForce24Hours(true);
        } else {
          setForce24Hours(false);
        }
        
        setApplyMondayToAll(true);
        
        // Auto-save complete state immediately with updated values
        const saved = await saveCompleteTimings(newSchedule, true, newForce24Hours, newClosedDay);
        if (saved) {
        await logActivity('SAME_FOR_ALL_TOGGLE', 'Same timings applied to all days', {
          reason: 'same_for_all_enabled',
        });
        await fetchLastUpdatedInfo(); // Refresh last updated info
          toast.success('Same timings applied to all days');
        } else {
          toast.error('Failed to save toggle state');
        }
      }
    } else {
      setApplyMondayToAll(false);
      
      // Auto-save complete state immediately with updated values
      const saved = await saveCompleteTimings(undefined, false, force24Hours, closedDay);
      if (saved) {
        await logActivity('SAME_FOR_ALL_TOGGLE', 'Same timings disabled', {
          reason: 'same_for_all_disabled',
        });
        await fetchLastUpdatedInfo(); // Refresh last updated info
        toast.success('Same timings disabled');
      } else {
        toast.error('Failed to save toggle state');
      }
    }
  }

  const handleViewStore = () => {
    window.open('https://gatimitra.com', '_blank', 'noopener,noreferrer')
  }

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <PageSkeletonGeneric />
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster />
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || DEMO_STORE_ID}>
        <div className="flex h-full min-h-0 bg-gray-50 overflow-hidden">
          {/* Left: header + main content */}
          <div className="flex flex-1 min-w-0 flex-col">
            {/* Compact header – matches Orders page height */}
            <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shrink-0 shadow-sm">
              <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="flex items-center gap-3">
                  {/* Hamburger menu on left (mobile) */}
                  <MobileHamburgerButton />
                  {/* Heading - properly aligned */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">Store Settings</h1>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5 hidden sm:block">Manage store configuration and preferences</p>
                  </div>
                </div>
              </div>
            </header>
            {/* Main Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar min-h-0">
            <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
              <div className="max-w-6xl mx-auto w-full">
              {/* Mobile Tabs */}
              <div className="lg:hidden mb-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                <div className="flex border-b border-gray-200 overflow-x-auto hide-scrollbar gap-2 pb-2">
                  <button
                    onClick={() => setActiveTab('plans')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'plans'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Crown size={14} />
                    Plans
                  </button>
                  <button
                    onClick={() => setActiveTab('timings')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'timings'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Clock size={14} />
                    Timings
                  </button>
                  <button
                    onClick={() => setActiveTab('operations')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'operations'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Power size={14} />
                    Operations
                  </button>
                  <button
                    onClick={() => setActiveTab('menu-capacity')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'menu-capacity'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <ChefHat size={14} />
                    Menu
                  </button>
                  <button
                    onClick={() => setActiveTab('delivery')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'delivery'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Package size={14} />
                    Delivery
                  </button>
                  <button
                    onClick={() => setActiveTab('address')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'address'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <MapPin size={14} />
                    Address
                  </button>
                  <button
                    onClick={() => setActiveTab('pos')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'pos'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Smartphone size={14} />
                    POS
                  </button>
                  <button
                    onClick={() => setActiveTab('notifications')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'notifications'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Bell size={14} />
                    Alerts
                  </button>
                  <button
                    onClick={() => setActiveTab('audit')}
                    className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'audit'
                        ? 'border-orange-600 text-orange-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Activity size={14} />
                    Audit
                  </button>
                </div>
              </div>

            {activeTab === 'plans' && (
              <div className="space-y-3 sm:space-y-4">
                {/* Current Plan Card - Compact */}
                {currentPlan && (
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border-2 border-orange-200 p-3 sm:p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Crown className="text-orange-600" size={18} />
                        <div>
                          <h2 className="text-base sm:text-lg font-bold text-gray-900">{currentPlan.plan_name}</h2>
                          <p className="text-xs sm:text-sm text-gray-600">
                            {currentPlan.price === 0 ? 'Free Plan' : `₹${currentPlan.price}/${currentPlan.billing_cycle.toLowerCase()}`}
                          </p>
                          {currentSubscription && (
                            <p className="text-xs text-gray-500 mt-1">
                              Activated: {new Date(currentSubscription.start_date).toLocaleDateString()} • 
                              Expires: {new Date(currentSubscription.expiry_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="bg-white px-3 py-1 rounded-lg border border-orange-200">
                        <span className="text-orange-700 font-bold text-xs">ACTIVE</span>
                      </div>
                    </div>
                    {/* Auto Renew Toggle */}
                    {currentPlan.price > 0 && (
                      <div className="flex items-center justify-between pt-3 border-t border-orange-200">
                        <div>
                          <p className="text-xs sm:text-sm font-semibold text-gray-900">Auto Renew</p>
                          <p className="text-xs text-gray-600">Automatically renew subscription</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoRenew}
                            onChange={(e) => handleAutoRenewToggle(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Plans Comparison - Premium SaaS-style */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">Available Plans</h3>
                    <Link href={storeId ? `/mx/refund-policy?storeId=${encodeURIComponent(storeId)}` : '/mx/refund-policy'} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2">
                      View refund policy
                    </Link>
                  </div>
                  {loadingPlans ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent mx-auto"></div>
                      <p className="text-gray-600 mt-3 text-sm">Loading plans...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {plans.map((plan) => {
                        const isFreePlan = plan.price === 0 || plan.price === null;
                        const hasActivePaidPlan = currentPlan && currentPlan.price > 0 && currentSubscription && new Date(currentSubscription.expiry_date) > new Date();
                        const currentPrice = Number(currentPlan?.price ?? 0);
                        const planPrice = Number(plan.price ?? 0);
                        const isLowerThanCurrent = hasActivePaidPlan && plan.id !== currentPlan?.id && planPrice < currentPrice;
                        const isDisabled = (isFreePlan && hasActivePaidPlan) || isLowerThanCurrent;
                        const planCode = (plan.plan_code || '').toUpperCase();
                        const isEnterprise = planCode === 'ENTERPRISE' || planCode === 'PRO';
                        const isPremium = planCode === 'PREMIUM' || planCode === 'GROWTH' || (plan.price > 0 && !isEnterprise);
                        const tier = isEnterprise ? 'enterprise' : isPremium ? 'premium' : 'free';

                        const cardStyles = {
                          free: {
                            wrapper: `rounded-2xl border-2 bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300 hover:scale-[1.02] transition-all duration-300 ${selectedPlanId === plan.id ? 'ring-2 ring-gray-400 ring-offset-2' : ''} ${currentPlan?.id === plan.id ? 'ring-2 ring-gray-500 ring-offset-2' : ''}`,
                            badge: null,
                            priceColor: 'text-gray-800',
                            featureValue: 'text-gray-700 font-semibold',
                            cta: 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 active:scale-[0.98] transition-all duration-200',
                          },
                          premium: {
                            wrapper: `rounded-2xl border-2 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 border-orange-400 shadow-lg shadow-orange-100 hover:shadow-xl hover:shadow-orange-200 hover:border-orange-500 hover:scale-[1.02] transition-all duration-300 relative ${selectedPlanId === plan.id ? 'ring-2 ring-orange-500 ring-offset-2' : ''} ${currentPlan?.id === plan.id ? 'ring-2 ring-orange-500 ring-offset-2' : ''}`,
                            badge: 'absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md',
                            priceColor: 'text-orange-700',
                            featureValue: 'text-orange-700 font-semibold',
                            cta: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-0 shadow-md shadow-orange-200/60 hover:from-orange-600 hover:to-amber-600 hover:shadow-lg hover:shadow-orange-300/70 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200',
                          },
                          enterprise: {
                            wrapper: `rounded-2xl border-2 bg-gradient-to-br from-indigo-50 to-purple-100 border-purple-400 shadow-lg shadow-purple-100 hover:shadow-xl hover:shadow-purple-200 hover:border-purple-500 hover:scale-[1.02] transition-all duration-300 relative ${selectedPlanId === plan.id ? 'ring-2 ring-purple-500 ring-offset-2' : ''} ${currentPlan?.id === plan.id ? 'ring-2 ring-purple-500 ring-offset-2' : ''}`,
                            badge: 'absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md',
                            priceColor: 'text-purple-800',
                            featureValue: 'text-purple-700 font-semibold',
                            cta: 'bg-transparent border-2 border-purple-600 text-purple-700 hover:bg-purple-600 hover:text-white hover:shadow-md hover:shadow-purple-200/50 active:scale-[0.98] transition-all duration-200',
                          },
                        };
                        const style = cardStyles[tier];

                        const imageCount = plan.max_image_uploads != null
                          ? plan.max_image_uploads
                          : plan.image_upload_allowed
                          ? '∞'
                          : 0;

                        return (
                        <div
                          key={plan.id}
                          onClick={() => {
                            if (!isDisabled && currentPlan?.id !== plan.id) {
                              setSelectedPlanId((prev) => (prev === plan.id ? null : plan.id));
                            }
                          }}
                          className={`relative p-4 sm:p-4 cursor-pointer ${isDisabled ? 'opacity-70 cursor-not-allowed' : ''} ${style.wrapper}`}
                        >
                          {style.badge && (
                            <span className={style.badge}>
                              {tier === 'premium' ? '⭐ MOST POPULAR' : '🚀 ENTERPRISE'}
                            </span>
                          )}

                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={selectedPlanId === plan.id || currentPlan?.id === plan.id}
                                onChange={() => {
                                  if (!isDisabled && currentPlan?.id !== plan.id) {
                                    setSelectedPlanId((prev) => (prev === plan.id ? null : plan.id));
                                  }
                                }}
                                disabled={isDisabled || currentPlan?.id === plan.id}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer disabled:opacity-50"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-[11px] font-medium text-gray-600">
                                {currentPlan?.id === plan.id ? 'Current Plan' : 'Select Plan'}
                              </span>
                            </div>
                          </div>

                          <h4 className="text-base font-bold text-gray-900 mb-0.5">{plan.plan_name}</h4>
                          <div className="mb-3 pb-3 border-b border-gray-200/80">
                            <span className={`text-xl sm:text-2xl font-extrabold tracking-tight ${style.priceColor}`}>
                              ₹{plan.price ?? 0}
                            </span>
                            <span className="text-xs text-gray-500 font-normal ml-0.5">/month</span>
                          </div>

                          <div className="space-y-1.5 text-xs mb-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Layers className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Menu items</span>
                              </div>
                              <span className={style.featureValue}>{plan.max_menu_items != null ? plan.max_menu_items : '∞'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ChefHat className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Cuisines</span>
                              </div>
                              <span className={style.featureValue}>{plan.max_cuisines != null ? plan.max_cuisines : '∞'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Layers className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Menu categories</span>
                              </div>
                              <span className={style.featureValue}>{plan.max_menu_categories != null ? plan.max_menu_categories : '∞'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Image className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Images</span>
                              </div>
                              <span className={`font-semibold ${(plan.max_image_uploads ?? 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                {imageCount}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <BarChart2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Analytics</span>
                              </div>
                              {plan.analytics_access ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <BarChart3 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Advanced Analytics</span>
                              </div>
                              {plan.advanced_analytics ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Headphones className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Priority Support</span>
                              </div>
                              {plan.priority_support ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <UserCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Dedicated Manager</span>
                              </div>
                              {plan.dedicated_account_manager ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedPlanId === plan.id || currentPlan?.id !== plan.id) {
                                handleUpgradePlan(plan.id);
                              }
                            }}
                            disabled={
                              currentPlan?.id === plan.id ||
                              upgradingPlanId === plan.id ||
                              isDisabled ||
                              (selectedPlanId !== plan.id && currentPlan?.id !== plan.id)
                            }
                            className={`w-full py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 ${style.cta} ${
                              currentPlan?.id === plan.id ? '!bg-gray-100 !text-gray-700 !border !border-gray-300 cursor-not-allowed hover:!scale-100' : ''
                            } ${upgradingPlanId === plan.id ? '!bg-orange-400 !text-white cursor-wait' : ''} ${
                              isDisabled || (selectedPlanId !== plan.id && currentPlan?.id !== plan.id) ? '!bg-gray-100 !text-gray-700 !border !border-gray-300 cursor-not-allowed hover:!scale-100' : ''
                            }`}
                            title={
                              isDisabled
                                ? isLowerThanCurrent
                                  ? 'Lower plan — available after your current plan ends'
                                  : 'Active paid plan expire होने तक Free plan पर move नहीं कर सकते'
                                : selectedPlanId !== plan.id && currentPlan?.id !== plan.id
                                ? 'Please select this plan first'
                                : undefined
                            }
                          >
                            {upgradingPlanId === plan.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Processing...
                              </>
                            ) : currentPlan?.id === plan.id ? (
                              'Current Plan'
                            ) : isDisabled ? (
                              'Not Available'
                            ) : selectedPlanId === plan.id ? (
                              'Upgrade Selected'
                            ) : (
                              'Select to Upgrade'
                            )}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Payment History - Store Specific */}
                {paymentHistory.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 shadow-sm">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">Plan Purchase History</h3>
                    <div className="space-y-2">
                      {paymentHistory.slice(0, 10).map((payment: any) => (
                        <div key={payment.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-sm text-gray-900">
                                {payment.merchant_plans?.plan_name || 'Plan Payment'}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                Purchased: {new Date(payment.payment_date).toLocaleDateString('en-IN', { 
                                  day: 'numeric', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                                {payment.billing_period_start && (
                                  <span className="ml-2">• Activated: {new Date(payment.billing_period_start).toLocaleDateString('en-IN', { 
                                    day: 'numeric', 
                                    month: 'short', 
                                    year: 'numeric' 
                                  })}</span>
                                )}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className="font-bold text-sm text-gray-900">₹{payment.amount}</p>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                payment.payment_status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {payment.payment_status}
                              </span>
                            </div>
                          </div>
                          {/* Payment Transaction Details */}
                          {(payment.payment_gateway_id || payment.payment_gateway_response) && (
                            <div className="pt-2 border-t border-gray-200 mt-2">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                                {payment.payment_gateway_id && (
                                  <div>
                                    <span className="font-semibold">Transaction ID:</span>{' '}
                                    <span className="font-mono">{payment.payment_gateway_id}</span>
                                  </div>
                                )}
                                {payment.payment_gateway_response?.razorpay_payment_id && (
                                  <div>
                                    <span className="font-semibold">Payment ID:</span>{' '}
                                    <span className="font-mono">{payment.payment_gateway_response.razorpay_payment_id}</span>
                                  </div>
                                )}
                                {payment.payment_gateway_response?.razorpay_order_id && (
                                  <div>
                                    <span className="font-semibold">Order ID:</span>{' '}
                                    <span className="font-mono">{payment.payment_gateway_response.razorpay_order_id}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Onboarding Payments - Store Specific */}
                {onboardingPayments.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 shadow-sm">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">Onboarding Fee</h3>
                    <div className="space-y-2">
                      {onboardingPayments.slice(0, 5).map((payment: any) => (
                        <div key={payment.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-gray-900">
                              {payment.plan_name || 'Onboarding Fee'}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Paid: {new Date(payment.created_at).toLocaleDateString('en-IN', { 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                              {payment.captured_at && (
                                <span className="ml-2">• Confirmed: {new Date(payment.captured_at).toLocaleDateString('en-IN', { 
                                  day: 'numeric', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}</span>
                              )}
                              {payment.razorpay_payment_id && (
                                <span className="ml-2 text-gray-500">• {payment.razorpay_payment_id.slice(-8)}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            <p className="font-bold text-sm text-gray-900">₹{(payment.amount_paise / 100).toFixed(2)}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              payment.status === 'captured' ? 'bg-green-100 text-green-700' :
                              payment.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {payment.status === 'captured' ? 'PAID' : payment.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'operations' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Store Operations</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Auto Accept Orders</p>
                        <p className="text-sm text-gray-600">Automatically accept incoming orders</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoAcceptOrders}
                          onChange={(e) => setAutoAcceptOrders(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                      </label>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Preparation Buffer Time (minutes)
                      </label>
                      <input
                        type="number"
                        value={preparationBufferMinutes}
                        onChange={(e) => setPreparationBufferMinutes(parseInt(e.target.value) || 15)}
                        min="0"
                        max="120"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Extra time added to estimated preparation time</p>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Manual Activation Lock</p>
                        <p className="text-sm text-gray-600">Prevent automatic store opening</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={manualActivationLock}
                          onChange={async (e) => {
                            const newValue = e.target.checked;
                            setManualActivationLock(newValue);
                            // Save to database immediately
                            await saveManualActivationLock(newValue);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'menu-capacity' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Menu & Capacity Controls</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">Menu Items</span>
                        <span className={`text-sm font-bold ${
                          maxMenuItems && currentMenuItemsCount >= maxMenuItems ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {currentMenuItemsCount} / {maxMenuItems || '∞'}
                        </span>
                      </div>
                      {maxMenuItems && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              currentMenuItemsCount >= maxMenuItems ? 'bg-red-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min((currentMenuItemsCount / maxMenuItems) * 100, 100)}%` }}
                          ></div>
                        </div>
                      )}
                      {maxMenuItems && currentMenuItemsCount >= maxMenuItems && (
                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                          <Lock size={12} />
                          Limit reached. Upgrade plan to add more items.
                        </p>
                      )}
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">Cuisines</span>
                        <span className={`text-sm font-bold ${
                          maxCuisines && currentCuisinesCount >= maxCuisines ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {currentCuisinesCount} / {maxCuisines || '∞'}
                        </span>
                      </div>
                      {maxCuisines && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              currentCuisinesCount >= maxCuisines ? 'bg-red-500' : 'bg-purple-500'
                            }`}
                            style={{ width: `${Math.min((currentCuisinesCount / maxCuisines) * 100, 100)}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Image Uploads</p>
                        <p className="text-sm text-gray-600">Upload images for menu items</p>
                      </div>
                      {imageUploadAllowed ? (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          Enabled
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium flex items-center gap-1">
                          <Lock size={14} />
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'delivery' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Delivery Settings</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border-2 transition-colors ${
                      gatimitraDeliveryEnabled ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">GatiMitra Delivery</p>
                          <p className="text-sm text-gray-600">Use platform delivery service</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={gatimitraDeliveryEnabled}
                            onChange={(e) => {
                              setGatimitraDeliveryEnabled(e.target.checked)
                              if (e.target.checked) setSelfDeliveryEnabled(false)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                    </div>
                    <div className={`p-4 rounded-lg border-2 transition-colors ${
                      selfDeliveryEnabled ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">Self Delivery</p>
                          <p className="text-sm text-gray-600">Use your own delivery staff</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selfDeliveryEnabled}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setShowSelfDeliveryConfirm(true)
                              } else {
                                setSelfDeliveryEnabled(false)
                                setGatimitraDeliveryEnabled(true)
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                        </label>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Delivery Radius (km)
                      </label>
                      <input
                        type="number"
                        value={deliveryRadiusKm}
                        onChange={(e) => setDeliveryRadiusKm(parseInt(e.target.value) || 5)}
                        min="1"
                        max="50"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 max-w-xs">
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Delivery charge per km (₹10 – ₹15)
                      </label>
                      <p className="text-xs text-gray-600 mb-2">
                        When you deliver with your own riders, customers are charged this amount per km. Editable <strong>once in 30 days</strong>.
                      </p>
                      <input
                        type="number"
                        min={10}
                        max={15}
                        step="0.01"
                        value={deliveryChargePerKm}
                        onChange={(e) => setDeliveryChargePerKm(e.target.value)}
                        disabled={!canEditDeliveryChargePerKm}
                        placeholder="10–15"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">Must be between ₹10 and ₹15 per km.</p>
                      {deliveryChargePerKmLastUpdatedAt && (
                        <p className="text-xs text-gray-500 mt-2">
                          Last updated: {new Date(deliveryChargePerKmLastUpdatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      )}
                      {!canEditDeliveryChargePerKm && nextDeliveryChargeEditableAt && (
                        <p className="text-xs text-amber-700 mt-2 font-medium">
                          You can edit again from {new Date(nextDeliveryChargeEditableAt).toLocaleDateString('en-IN')}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Packaging Charge (same page) */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Packaging Charge</h3>
                    <button
                      onClick={handleSavePackaging}
                      disabled={isSaving || !canEditPackagingCharge}
                      title={!canEditPackagingCharge && nextPackagingEditableAt ? `Editable again from ${new Date(nextPackagingEditableAt).toLocaleDateString('en-IN')}` : undefined}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Set a fixed packaging charge (₹) for your store. Amount must be <strong>between ₹5 and ₹15</strong>. This amount can be applied to specific menu items by the agent from the agent dashboard. You can change this value <strong>once in 30 days</strong>.
                  </p>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 max-w-xs">
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Packaging charge amount (₹5 – ₹15)</label>
                      <input
                        type="number"
                        min={5}
                        max={15}
                        step="0.01"
                        value={packagingChargeAmount}
                        onChange={(e) => setPackagingChargeAmount(e.target.value)}
                        disabled={!canEditPackagingCharge}
                        placeholder="5–15"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">Must be between ₹5 and ₹15.</p>
                      {packagingChargeLastUpdatedAt && (
                        <p className="text-xs text-gray-500 mt-2">
                          Last updated: {new Date(packagingChargeLastUpdatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      )}
                      {!canEditPackagingCharge && nextPackagingEditableAt && (
                        <p className="text-xs text-amber-700 mt-2 font-medium">
                          You can edit again from {new Date(nextPackagingEditableAt).toLocaleDateString('en-IN')}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Self-Delivery Riders (same page) */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Self-Delivery Riders</h3>
                  <p className="text-sm text-gray-600 mb-4">Add and manage riders for self delivery. Edit and delete are disabled when a rider has an active order.</p>
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                    <p className="text-sm font-semibold text-gray-800">{riderEditId !== null ? 'Edit rider' : 'Add new rider'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Rider name *"
                        value={riderForm.rider_name}
                        onChange={(e) => setRiderForm((f) => ({ ...f, rider_name: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Mobile *"
                        value={riderForm.rider_mobile}
                        onChange={(e) => setRiderForm((f) => ({ ...f, rider_mobile: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Email (optional)"
                        value={riderForm.rider_email}
                        onChange={(e) => setRiderForm((f) => ({ ...f, rider_email: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Vehicle number (optional)"
                        value={riderForm.vehicle_number}
                        onChange={(e) => setRiderForm((f) => ({ ...f, vehicle_number: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveRider(riderEditId)}
                        disabled={riderSaving}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                      >
                        {riderSaving ? 'Saving...' : riderEditId !== null ? 'Update rider' : 'Add rider'}
                      </button>
                      {riderEditId !== null && (
                        <button
                          type="button"
                          onClick={() => { setRiderEditId(null); setRiderForm({ rider_name: '', rider_mobile: '', rider_email: '', vehicle_number: '' }); }}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {ridersLoading ? (
                    <p className="text-sm text-gray-500">Loading riders…</p>
                  ) : riders.length === 0 ? (
                    <p className="text-sm text-gray-500">No riders added yet. Add one above.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left">
                            <th className="py-2 pr-4 font-semibold text-gray-700">ID</th>
                            <th className="py-2 pr-4 font-semibold text-gray-700">Name</th>
                            <th className="py-2 pr-4 font-semibold text-gray-700">Mobile</th>
                            <th className="py-2 pr-4 font-semibold text-gray-700">Email</th>
                            <th className="py-2 pr-4 font-semibold text-gray-700">Status</th>
                            <th className="py-2 text-right font-semibold text-gray-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {riders.map((r) => (
                            <tr key={r.id} className="border-b border-gray-100">
                              <td className="py-2 pr-4 font-mono text-gray-600">{r.id}</td>
                              <td className="py-2 pr-4 font-medium">{r.rider_name}</td>
                              <td className="py-2 pr-4">{r.rider_mobile}</td>
                              <td className="py-2 pr-4 text-gray-600">{r.rider_email || '—'}</td>
                              <td className="py-2 pr-4">
                                {r.has_active_orders ? <span className="text-amber-600 font-medium">Active order</span> : <span className="text-gray-500">—</span>}
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => { setRiderEditId(r.id); setRiderForm({ rider_name: r.rider_name, rider_mobile: r.rider_mobile, rider_email: r.rider_email || '', vehicle_number: r.vehicle_number || '' }); }}
                                  disabled={r.has_active_orders}
                                  className="mr-2 text-orange-600 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRiderDeleteId(r.id)}
                                  disabled={r.has_active_orders}
                                  className="text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {riderDeleteId !== null && (
                    <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-800">Delete this rider?</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => deleteRider(riderDeleteId)}
                          disabled={riderDeleting}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {riderDeleting ? 'Deleting...' : 'Yes, delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRiderDeleteId(null)}
                          disabled={riderDeleting}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'address' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Change Address</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving || !hasAddressChanges}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">Update your store address. Search or click on the map to set location. Existing address is shown below.</p>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-sm font-semibold text-gray-800 mb-2">GPS Coordinates</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Latitude</div>
                            <input
                              type="number"
                              step="any"
                              value={latitude}
                              onChange={(e) => setLatitude(e.target.value)}
                              className="font-mono w-full text-sm bg-white p-2 rounded-lg border border-gray-300"
                              placeholder="e.g. 22.5726"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Longitude</div>
                            <input
                              type="number"
                              step="any"
                              value={longitude}
                              onChange={(e) => setLongitude(e.target.value)}
                              className="font-mono w-full text-sm bg-white p-2 rounded-lg border border-gray-300"
                              placeholder="e.g. 88.3639"
                            />
                          </div>
                        </div>
                      </div>
                      <div ref={addressSearchRef} className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Search Location</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={addressSearchQuery}
                            onChange={(e) => setAddressSearchQuery(e.target.value)}
                            placeholder="Enter address, postal code, city..."
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white min-w-0"
                          />
                          <button
                            type="button"
                            onClick={addressSearchLocation}
                            disabled={isAddressSearching}
                            className="px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {isAddressSearching ? 'Searching...' : 'Search'}
                          </button>
                        </div>
                        {addressSearchResults.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full max-w-md border border-gray-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
                            {addressSearchResults.map((result: any, idx: number) => (
                              <div
                                key={idx}
                                onClick={() => { addressSelectLocation(result); setAddressSearchResults([]); }}
                                className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-sm"
                              >
                                <div className="font-medium text-gray-800">{result.text}</div>
                                <div className="text-xs text-gray-600 truncate mt-1">{result.place_name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Address *</label>
                        <textarea
                          value={fullAddress}
                          onChange={(e) => setFullAddress(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                          placeholder="Complete address with landmarks"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                          <input
                            type="text"
                            value={storeAddress}
                            onChange={(e) => setStoreAddress(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                          <input
                            type="text"
                            value={addressState}
                            onChange={(e) => setAddressState(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code *</label>
                          <input
                            type="text"
                            value={addressPostalCode}
                            onChange={(e) => setAddressPostalCode(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                          <input
                            type="text"
                            value={addressLandmark}
                            onChange={(e) => setAddressLandmark(e.target.value)}
                            placeholder="Nearby landmark"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        </div>
                      </div>
                      {/* <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-sm font-semibold text-gray-800 mb-2">GPS Coordinates</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Latitude</div>
                            <input
                              type="number"
                              step="any"
                              value={latitude}
                              onChange={(e) => setLatitude(e.target.value)}
                              className="font-mono w-full text-sm bg-white p-2 rounded-lg border border-gray-300"
                              placeholder="e.g. 22.5726"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Longitude</div>
                            <input
                              type="number"
                              step="any"
                              value={longitude}
                              onChange={(e) => setLongitude(e.target.value)}
                              className="font-mono w-full text-sm bg-white p-2 rounded-lg border border-gray-300"
                              placeholder="e.g. 88.3639"
                            />
                          </div>
                        </div>
                      </div> */}
                    </div>
                    <div className="min-h-[280px] h-[280px] sm:h-[360px] xl:min-h-0 xl:h-[360px]">
                      <div className="h-full rounded-lg overflow-hidden border border-gray-300 bg-gray-50">
                        {!mapboxToken ? (
                          <div className="h-full flex items-center justify-center text-sm text-gray-500 p-4 text-center">
                            Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to use the map.
                          </div>
                        ) : (
                          <StoreLocationMapboxGL
                            ref={(r) => { addressMapRef.current = r }}
                            latitude={latitude !== '' && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null}
                            longitude={longitude !== '' && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null}
                            mapboxToken={mapboxToken}
                            onLocationChange={(lat, lng) => { setLatitude(String(lat)); setLongitude(String(lng)); }}
                            onMapClick={handleAddressMapClick}
                          />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Drag marker or click on map to set location. Search above for exact address.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Notifications & Alerts</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">SMS Alerts</p>
                        <p className="text-sm text-gray-600">Receive SMS notifications for orders</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smsAlerts}
                          onChange={(e) => setSmsAlerts(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">App Alerts</p>
                        <p className="text-sm text-gray-600">Push notifications in the app</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appAlerts}
                          onChange={(e) => setAppAlerts(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Operational Warnings</p>
                        <p className="text-sm text-gray-600">Alerts for store status changes</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={operationalWarnings}
                          onChange={(e) => setOperationalWarnings(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Audit & Activity Settings</h3>
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Action Tracking</p>
                        <p className="text-sm text-gray-600">Track all store actions and changes</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={actionTrackingEnabled}
                          onChange={(e) => setActionTrackingEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Staff Permissions</p>
                        <p className="text-sm text-gray-600">Enable role-based access control</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staffPermissionsEnabled}
                          onChange={(e) => setStaffPermissionsEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'premium' && (
              <div className="space-y-8">
                {/* Subscription Plans */}
                <div className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-2xl p-6 mb-0" style={{ marginBottom: '0', paddingBottom: '0.1875rem' }}>
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Crown className="text-amber-600" size={24} />
                        <h2 className="text-2xl font-bold text-gray-900">Premium Benefits</h2>
                      </div>
                      <p className="text-gray-600">Unlock powerful Benefits to grow your business</p>
                    </div>
                    <div className="bg-gradient-to-r from-orange-100 to-amber-100 px-4 py-2 rounded-full border border-orange-300">
                      <span className="text-orange-700 font-bold text-sm flex items-center gap-2">
                        <Star size={14} className="fill-orange-700" />
                        Current: {subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)} Plan
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Free Plan */}
                    <div className={`bg-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto ${
                      subscriptionPlan === 'free' ? 'border-orange-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                    } transition-all`}>
                      <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Free</h3>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹0<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">Perfect for getting started</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Basic Store Management</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Standard Delivery Integration</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Email Support</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <X size={16} className="text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-400">Advanced Analytics</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <X size={16} className="text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-400">Priority Support</span>
                        </div>
                      </div>
                      
                      <button
                        disabled={subscriptionPlan === 'free'}
                        onClick={() => setSubscriptionPlan('free')}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'free'
                            ? 'bg-gray-100 text-gray-700 cursor-default'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {subscriptionPlan === 'free' ? 'Current Plan' : 'Select Free Plan'}
                      </button>
                    </div>

                    {/* Pro Plan */}
                    <div className={`bg-gradient-to-b from-orange-50 to-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto relative ${
                      subscriptionPlan === 'pro' ? 'border-orange-500 shadow-xl' : 'border-orange-300 hover:border-orange-400'
                    } transition-all`}>
                      {subscriptionPlan === 'pro' && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md">
                            RECOMMENDED
                          </div>
                        </div>
                      )}
                      
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Star size={16} className="text-amber-600 fill-amber-600" />
                          <h3 className="text-xl font-bold text-gray-900">Pro</h3>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹999<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">For growing businesses</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Everything in Free</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Advanced Analytics Dashboard</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Smart Dynamic Pricing</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Priority 24/7 Support</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Promotion & Marketing Tools</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          const proPlan = plans.find(p => p.plan_code === 'PREMIUM')
                          if (proPlan) handleUpgradePlan(proPlan.id)
                        }}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'pro'
                            ? 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700'
                            : 'bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-700 hover:to-amber-700'
                        }`}
                      >
                        {subscriptionPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro →'}
                      </button>
                    </div>

                    {/* Enterprise Plan */}
                    <div className={`bg-gradient-to-b from-purple-50 to-white rounded-xl px-3 py-2 md:px-4 md:py-3 border-2 max-w-[270px] mx-auto ${
                      subscriptionPlan === 'enterprise' ? 'border-purple-500 shadow-xl' : 'border-purple-300 hover:border-purple-400'
                    } transition-all`}>
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Crown size={16} className="text-purple-600" />
                          <h3 className="text-xl font-bold text-gray-900">Enterprise</h3>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">₹2,499<span className="text-sm text-gray-500 font-normal">/month</span></div>
                        <p className="text-sm text-gray-600">For established businesses</p>
                      </div>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Everything in Pro</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Advanced Security Suite</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Marketing Automation</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Dedicated Account Manager</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-green-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">Custom API Integrations</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          const enterprisePlan = plans.find(p => p.plan_code === 'ENTERPRISE')
                          if (enterprisePlan) handleUpgradePlan(enterprisePlan.id)
                        }}
                        className={`w-full py-3 rounded-lg font-semibold transition-all ${
                          subscriptionPlan === 'enterprise'
                            ? 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700'
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                        }`}
                      >
                        {subscriptionPlan === 'enterprise' ? 'Current Plan' : 'Upgrade to Enterprise →'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Premium Benefits Grid */}
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-6 mt-2" style={{ marginTop: '8px' }}>Premium Benefits</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Analytics */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-50">
                            <BarChart3 size={18} className="text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Advanced Analytics</h4>
                            <p className="text-xs text-gray-500">Real-time insights & reports</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={analyticsEnabled}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Advanced Analytics', e.target.checked)
                              if (success) setAnalyticsEnabled(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Smart Pricing */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-50">
                            <Sparkles size={18} className="text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Smart Pricing</h4>
                            <p className="text-xs text-gray-500">Dynamic pricing automation</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={smartPricing}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Smart Pricing', e.target.checked)
                              if (success) setSmartPricing(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Priority Support */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-50">
                            <Bell size={18} className="text-amber-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Priority Support</h4>
                            <p className="text-xs text-gray-500">24/7 dedicated assistance</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prioritySupport}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Priority Support', e.target.checked)
                              if (success) setPrioritySupport(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {subscriptionPlan === 'free' ? 'Pro Plan Required' : 'Available'}
                      </div>
                    </div>

                    {/* Advanced Security */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-50">
                            <Shield size={18} className="text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Advanced Security</h4>
                            <p className="text-xs text-gray-500">Enhanced protection Benefits</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={advancedSecurity}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Advanced Security', e.target.checked)
                              if (success) setAdvancedSecurity(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan !== 'enterprise' ? 'bg-gray-100 text-gray-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {subscriptionPlan !== 'enterprise' ? 'Enterprise Only' : 'Available'}
                      </div>
                    </div>

                    {/* Marketing Automation */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-pink-50">
                            <Target size={18} className="text-pink-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Marketing Automation</h4>
                            <p className="text-xs text-gray-500">Automated campaigns</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={marketingAutomation}
                            onChange={(e) => {
                              const success = handlePremiumFeatureToggle('Marketing Automation', e.target.checked)
                              if (success) setMarketingAutomation(e.target.checked)
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                        </label>
                      </div>
                      <div className={`text-xs px-3 py-1.5 rounded-full w-fit ${
                        subscriptionPlan !== 'enterprise' ? 'bg-gray-100 text-gray-700' : 'bg-pink-100 text-pink-700'
                      }`}>
                        {subscriptionPlan !== 'enterprise' ? 'Enterprise Only' : 'Available'}
                      </div>
                    </div>

                    {/* Promo Notifications */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-50">
                            <Gift size={18} className="text-emerald-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">Promotion Notifications</h4>
                            <p className="text-xs text-gray-500">Platform promotions & deals</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={promoNotifications}
                            onChange={(e) => setPromoNotifications(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                      <div className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 w-fit">
                        All Plans
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'timings' && (
              <div className="space-y-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm space-y-3">
                  {/* Last Updated Info */}
                  {lastUpdatedBy && (lastUpdatedBy.email || lastUpdatedBy.at) && (
                    <div className="flex items-center justify-between text-xs text-gray-500 pb-2 border-b border-gray-100">
                      <span>Last updated:</span>
                      <span className="font-medium text-gray-700">
                        {lastUpdatedBy.email ? `${lastUpdatedBy.email.split('@')[0]}` : 'System'}
                        {lastUpdatedBy.at && ` • ${new Date(lastUpdatedBy.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex flex-row flex-wrap gap-3 items-center">
                    {/* Same Timing Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Same for all days
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyMondayToAll}
                          onChange={toggleSameForAllDays}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${applyMondayToAll ? 'bg-blue-600' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${applyMondayToAll ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>

                    {/* 24 Hours Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Open 24 hours (all days)
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={force24Hours}
                          onChange={toggle24HoursForAll}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${force24Hours ? 'bg-blue-600' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${force24Hours ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>

                    {/* Closed Day Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Outlet closed on
                      </span>
                      <select
                        value={closedDay || ''}
                        onChange={(e) => {
                          const value = e.target.value as DayType
                          if (value) {
                            handleClosedDayChange(value)
                          } else {
                            // Reset closed day
                            setStoreSchedule(prev =>
                              prev.map(d => ({ ...d, isOutletClosed: false }))
                            )
                            setClosedDay(null)
                          }
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select day</option>
                        {storeSchedule.map(day => (
                          <option key={day.day} value={day.day}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Weekly Summary */}
                    <div className="flex items-center gap-2">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded border border-blue-200 p-2 min-w-[160px] flex flex-col justify-center">
                        <div className="flex flex-row items-center justify-between gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-900 text-[10px] leading-tight mb-0">Weekly Summary</h4>
                            <p className="text-[9px] text-gray-600 leading-tight mb-0">Total hours this week</p>
                          </div>
                          <div className="text-center">
                            <div className="text-base font-bold text-blue-700 leading-tight">
                              {storeSchedule.reduce((total, day) => total + day.operationalHours, 0)}h
                            </div>
                            <div className="text-[9px] text-gray-600 leading-tight">
                              {storeSchedule.reduce((total, day) => total + day.operationalMinutes, 0)}m
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compact Days Grid - 7 Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {storeSchedule.map((daySchedule) => (
                    <div key={daySchedule.day} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-all">
                      {/* Day Header with Open Store Toggle */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-7 h-7 rounded flex items-center justify-center ${
                            daySchedule.isOutletClosed ? 'bg-red-100' : daySchedule.is24Hours ? 'bg-blue-100' : daySchedule.isOpen ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {daySchedule.isOutletClosed ? (
                              <X size={12} className="text-red-600" />
                            ) : daySchedule.is24Hours ? (
                              <Clock size={12} className="text-blue-600" />
                            ) : daySchedule.isOpen ? (
                              <CheckCircle2 size={12} className="text-emerald-600" />
                            ) : (
                              <X size={12} className="text-red-600" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-xs">{daySchedule.label}</h3>
                            <p className="text-[10px] text-gray-500">{daySchedule.duration}</p>
                          </div>
                        </div>
                        {/* Open Store Toggle */}
                        <label className="relative inline-flex items-center cursor-pointer ml-1">
                          <input
                            type="checkbox"
                            checked={daySchedule.isOpen && !daySchedule.isOutletClosed}
                            onChange={() => handleDayToggle(daySchedule.day)}
                            className="sr-only peer"
                          />
                          <div className="w-7 h-3.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>

                      {/* Status Badge */}
                      <div className="mb-2">
                        {daySchedule.isOutletClosed ? (
                          <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-medium border border-red-200">
                            🔴 CLOSED
                          </span>
                        ) : daySchedule.is24Hours ? (
                          <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium border border-blue-200">
                            ⚡ 24H
                          </span>
                        ) : daySchedule.isOpen ? (
                          <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-medium border border-emerald-200">
                            🟢 OPEN
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-medium border border-red-200">
                            🔴 CLOSED
                          </span>
                        )}
                      </div>

                      {/* Time Slots - Direct Editing */}
                      {!daySchedule.isOutletClosed && !daySchedule.is24Hours && daySchedule.isOpen && (
                        <div className="space-y-1.5 mb-2">
                          {daySchedule.slots.map((slot, index) => (
                            <div key={slot.id} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium text-gray-500">Slot {index + 1}</span>
                                {daySchedule.slots.length > 1 && (
                                  <button
                                    onClick={() => removeTimeSlot(daySchedule.day, slot.id)}
                                    className="text-gray-400 hover:text-red-600 text-[10px]"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[10px] text-gray-600 mb-0.5 block">From</label>
                                  <input
                                    type="time"
                                    value={slot.openingTime}
                                    onChange={(e) => updateTimeSlot(daySchedule.day, slot.id, 'openingTime', e.target.value)}
                                    className="w-full px-1.5 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-600 mb-0.5 block">To</label>
                                  <input
                                    type="time"
                                    value={slot.closingTime}
                                    onChange={(e) => updateTimeSlot(daySchedule.day, slot.id, 'closingTime', e.target.value)}
                                    className="w-full px-1.5 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Slot Button */}
                      {!daySchedule.isOutletClosed && !daySchedule.is24Hours && daySchedule.isOpen && daySchedule.slots.length < 2 && (
                        <button
                          onClick={() => addTimeSlot(daySchedule.day)}
                          className="w-full mb-2 text-[10px] px-2 py-1 border border-dashed border-gray-300 rounded hover:border-blue-400 hover:bg-blue-50 text-blue-600 flex items-center justify-center gap-1"
                        >
                          <Plus size={10} />
                          Add Slot (Max 2)
                        </button>
                      )}

                      {/* Save Button - Only show when manual time changes */}
                      {manualTimeChanges.has(daySchedule.day) && (
                        <button
                          onClick={async () => {
                            setIsSaving(true)
                            try {
                              // Save only this day's timings
                              const dayData = storeSchedule.find(d => d.day === daySchedule.day)
                              if (dayData && storeId) {
                                // Client-side validation for slot times
                                if (dayData.isOpen && !dayData.isOutletClosed && !dayData.is24Hours) {
                                  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
                                  const s1o = dayData.slots[0]?.openingTime
                                  const s1c = dayData.slots[0]?.closingTime
                                  if (s1o && s1c && toMin(s1c) <= toMin(s1o)) {
                                    toast.error(`${daySchedule.label}: Slot 1 end time must be after start time`)
                                    setIsSaving(false)
                                    return
                                  }
                                  const s2o = dayData.slots[1]?.openingTime
                                  const s2c = dayData.slots[1]?.closingTime
                                  if (s2o && s2c && toMin(s2c) <= toMin(s2o)) {
                                    toast.error(`${daySchedule.label}: Slot 2 end time must be after start time`)
                                    setIsSaving(false)
                                    return
                                  }
                                  if (s1c && s2o && toMin(s2o) <= toMin(s1c)) {
                                    toast.error(`${daySchedule.label}: Slot 2 must start after Slot 1 ends (${s1c})`)
                                    setIsSaving(false)
                                    return
                                  }
                                }

                                const timings: any = {
                                  store_id: storeId,
                                  same_for_all: applyMondayToAll,
                                  force_24_hours: force24Hours,
                                }
                                const prefix = dayData.day
                                timings[`${prefix}_open`] = dayData.isOpen && !dayData.isOutletClosed
                                if (dayData.is24Hours) {
                                  timings[`${prefix}_slot1_start`] = '00:00'
                                  timings[`${prefix}_slot1_end`] = '23:59'
                                  timings[`${prefix}_slot2_start`] = null
                                  timings[`${prefix}_slot2_end`] = null
                                  timings[`${prefix}_total_duration_minutes`] = 24 * 60
                                } else if (dayData.isOutletClosed) {
                                  timings[`${prefix}_slot1_start`] = null
                                  timings[`${prefix}_slot1_end`] = null
                                  timings[`${prefix}_slot2_start`] = null
                                  timings[`${prefix}_slot2_end`] = null
                                  timings[`${prefix}_total_duration_minutes`] = 0
                                } else {
                                  timings[`${prefix}_slot1_start`] = dayData.slots[0]?.openingTime || null
                                  timings[`${prefix}_slot1_end`] = dayData.slots[0]?.closingTime || null
                                  timings[`${prefix}_slot2_start`] = dayData.slots[1]?.openingTime || null
                                  timings[`${prefix}_slot2_end`] = dayData.slots[1]?.closingTime || null
                                  timings[`${prefix}_total_duration_minutes`] = (dayData.operationalHours * 60 + dayData.operationalMinutes)
                                }
                                
                                const { data: { user } } = await supabase.auth.getUser()
                                timings.updated_by_email = user?.email || ''
                                timings.updated_by_at = new Date().toISOString()

                                const res = await fetch('/api/outlet-timings', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(timings),
                                })
                                
                                if (res.ok) {
                                  const result = await res.json().catch(() => ({}))
                                  if (result.warnings?.length) {
                                    result.warnings.forEach((w: string) => toast.warning(w))
                                  }
                                  toast.success(`✅ ${daySchedule.label} saved!`)
                                  setManualTimeChanges(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(daySchedule.day);
                                    return newSet;
                                  });
                                  await fetchTimings()
                                  await fetchLastUpdatedInfo()
                                } else {
                                  let errMsg = 'Failed to save timings'
                                  try {
                                    const errData = await res.json()
                                    if (errData?.error) errMsg = errData.error
                                  } catch {}
                                  toast.error(errMsg)
                                }
                              }
                            } catch (error) {
                              toast.error('Failed to save timings')
                            } finally {
                              setIsSaving(false)
                            }
                          }}
                          disabled={isSaving}
                          className="w-full mt-2 px-2 py-1.5 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                          <Save size={12} />
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      )}

                      {/* Quick Actions */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <button
                          onClick={() => toggleDayExpansion(daySchedule.day)}
                          className="flex-1 text-[10px] px-1.5 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                        >
                          {expandedDay === daySchedule.day ? 'Hide' : 'More'}
                        </button>
                      </div>

                      {/* Expanded Options */}
                      {expandedDay === daySchedule.day && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">24 Hours Mode</p>
                              <p className="text-xs text-gray-500">Open for 24 hours</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.is24Hours}
                                onChange={() => handle24HoursToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">Close Outlet</p>
                              <p className="text-xs text-gray-500">Mark outlet as closed</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.isOutletClosed}
                                onChange={() => handleOutletClosedToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium text-gray-700">Open Store</p>
                              <p className="text-xs text-gray-500">Toggle store open/closed</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={daySchedule.isOpen && !daySchedule.isOutletClosed}
                                onChange={() => handleDayToggle(daySchedule.day)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            )}

            {activeTab === 'gatimitra' && (
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-gray-200 py-12">
                <img src="/gstore.png" alt="Store" className="w-64 h-64 mb-8" style={{ maxWidth: '320px', maxHeight: '320px' }} />
                <p className="text-xl font-semibold text-center mb-6" style={{ color: '#08a353ff' }}>Experience your store from a customer's perspective on <span style={{ color: '#a89a03ff' }}>GatiMitra</span>.</p>
                <a
                  href="https://gatimitra.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-12 py-4 rounded-xl bg-gradient-to-r from-indigo-400 to-red-400 text-white font-semibold text-lg shadow-md hover:from-indigo-500 hover:to-purple-500 transition text-center"
                  style={{ display: 'inline-block' }}
                >
                  View store now
                </a>
              </div>
            )}

            {activeTab === 'pos' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl border border-sky-200/80 shadow-sm overflow-hidden">
                  <div className="p-6 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-gray-900">Point of sale system [POS]</h3>
                        <button
                          onClick={savePosIntegration}
                          disabled={posSaving || !posPartner.trim()}
                          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Save size={16} />
                          {posSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      <p className="text-sm text-gray-600">Configure and integrate your external POS</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-sky-100">
                      <Smartphone size={22} className="text-sky-600" />
                    </div>
                  </div>
                  <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Choose your partner POS</label>
                      <select
                        value={posPartner}
                        onChange={(e) => setPosPartner(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Choose your partner POS</option>
                        <option value="PetPooja">PetPooja</option>
                        <option value="UrbanPiper">UrbanPiper</option>
                        <option value="RistaApps">RistaApps</option>
                        <option value="Posist">Posist</option>
                        <option value="Limetray">Limetray</option>
                        <option value="WeraFoods">WeraFoods</option>
                        <option value="Possier">Possier</option>
                        <option value="Froogal">Froogal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">POS store ID (optional)</label>
                      <input
                        type="text"
                        value={posStoreId}
                        onChange={(e) => setPosStoreId(e.target.value)}
                        placeholder="POS store ID (optional)"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <div className="px-6 pb-6">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-teal-50 border border-teal-200">
                      <AlertCircle size={18} className="text-teal-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-teal-900">
                        <strong>NOTE:</strong> Please ask your POS partner to initiate the integration once you complete registration.
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        onClick={savePosIntegration}
                        disabled={posSaving || !posPartner.trim()}
                        className="px-4 py-2.5 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {posSaving ? 'Saving...' : 'Save'}
                      </button>
                      {posStatus === 'PENDING' && (
                        <button
                          onClick={markPosActive}
                          className="px-4 py-2.5 border border-emerald-300 bg-emerald-50 text-emerald-700 rounded-lg font-semibold hover:bg-emerald-100"
                        >
                          Partner has initiated – mark active
                        </button>
                      )}
                      {posIntegrationActive && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-medium">
                          <CheckCircle2 size={16} /> Integration active – you can switch to POS on dashboard
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
              </div>
            </div>
          </div>
          </div>

          {/* Right Sidebar Navigation - uses shared list so Packaging Charge is always visible */}
          <div className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-l border-gray-200">
            <SettingsSidebar
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
            />
          </div>
        </div>

        {/* Temp Off Modal - portaled so backdrop blurs sidebar */}
        {typeof document !== 'undefined' && showTempOffModal && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 10000 }}>
            <div
              className="fixed inset-0 bg-black/50 pointer-events-auto"
              onClick={() => setShowTempOffModal(false)}
              style={{
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                zIndex: 9999
              }}
            />
            <div className="bg-white rounded-xl max-w-sm w-full pointer-events-auto relative z-[10001]">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Close Store Temporarily</h2>
                <button onClick={() => setShowTempOffModal(false)} className="text-gray-500 hover:text-gray-900">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">For how many minutes do you want to close the store?</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={tempOffDurationInput}
                    onChange={(e) => setTempOffDurationInput(e.target.value)}
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default: 30 minutes</p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleTempOff}
                    className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors"
                  >
                    ✓ Close for {parseInt(tempOffDurationInput) || 30} Minutes
                  </button>
                  <button
                    onClick={() => setShowTempOffModal(false)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Auto Renew Confirmation Modal - portaled so backdrop blurs sidebar */}
        {typeof document !== 'undefined' && showAutoRenewConfirm && createPortal(
          (
            <>
              <div
                className="fixed inset-0 bg-black/50"
                onClick={() => setShowAutoRenewConfirm(false)}
                style={{
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  zIndex: 9999
                }}
              />
              <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 10000 }}>
                <div className="bg-white rounded-xl max-w-md w-full pointer-events-auto shadow-2xl">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Enable Auto Renew</h2>
                    <button onClick={() => setShowAutoRenewConfirm(false)} className="text-gray-500 hover:text-gray-900">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <AlertCircle className="text-orange-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">Auto-Debit Notice</p>
                        <p className="text-sm text-gray-700">
                          If you enable Auto Renew, the amount will be automatically debited as soon as the bill is generated.
                          You can turn it off anytime later.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => updateAutoRenew(true)}
                        className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors"
                      >
                        ✓ Enable Auto Renew
                      </button>
                      <button
                        onClick={() => setShowAutoRenewConfirm(false)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ),
          document.body
        )}

        {/* Self Delivery Confirmation Modal - portaled so backdrop blurs sidebar too */}
        {typeof document !== 'undefined' && showSelfDeliveryConfirm && createPortal(
          (
            <>
              <div
                className="fixed inset-0 bg-black/50"
                onClick={() => setShowSelfDeliveryConfirm(false)}
                style={{
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  zIndex: 9999
                }}
              />
              <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 10000 }}>
                <div className="bg-white rounded-xl max-w-md w-full pointer-events-auto shadow-2xl">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Enable Self Delivery</h2>
                    <button onClick={() => setShowSelfDeliveryConfirm(false)} className="text-gray-500 hover:text-gray-900">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <AlertCircle className="text-orange-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">Self Delivery</p>
                        <p className="text-sm text-gray-700">
                          GatiMitra delivery will be disabled. You will use your own delivery staff and manage deliveries yourself. You can switch back to GatiMitra delivery anytime.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setSelfDeliveryEnabled(true);
                          setGatimitraDeliveryEnabled(false);
                          setShowSelfDeliveryConfirm(false);
                        }}
                        className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors"
                      >
                        Confirm — Enable Self Delivery
                      </button>
                      <button
                        onClick={() => setShowSelfDeliveryConfirm(false)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ),
          document.body
        )}
      </MXLayoutWhite>
    </>
  )
}

export default function StoreSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading store settings...</p>
        </div>
      </div>
    }>
      <StoreSettingsContent />
    </Suspense>
  )
}