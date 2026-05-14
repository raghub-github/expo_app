'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Dialog } from '@headlessui/react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug'
import { toastStoreOperationsPostFailure } from '@/lib/storeOperationsPostFeedback'
import {
  Power,
  Loader2,
  Wallet,
  Truck,
  Store,
  BarChart3,
  Star,
  Filter,
  ArrowRight,
  Info,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  Check,
  X,
  LineChart,
  Table2,
  Download,
  Funnel,
} from 'lucide-react'
import { toast } from 'sonner'
import { Suspense } from 'react'

import { UI_STRINGS, useLocalStoreStatusEngineStore } from '@/lib/localStoreStatusEngineStore'
import { formatCloseReasonForCard } from '@/lib/formatCloseReasonForCard'

import { PageSkeletonDashboard } from '@/components/PageSkeleton';
import { createClient } from '@/lib/supabase/client';
import { useMerchantWallet, useSelfDeliveryRiders } from '@/hooks/useMerchantApi';

export const dynamic = 'force-dynamic'

/** Show time with hours, minutes, seconds (no 00:00); HH:MM becomes HH:MM:00 */
function formatTimeHMS(t: string): string {
  if (!t) return '00:00:00'
  const parts = t.split(':')
  if (parts.length === 2) return `${t}:00`
  if (parts.length === 1) return `${t.padStart(2, '0')}:00:00`
  return t
}

/** Inline SVG sparkline — no card, no chart deps; unique gradient id per instance */
function MiniSparkline({ values, className = '' }: { values: readonly number[]; className?: string }) {
  const gid = React.useId().replace(/:/g, '')
  const w = 128
  const h = 32
  const pad = 3
  const nums = values.length ? [...values] : [0]
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const points = nums.map((v, i) => {
    const x = pad + (nums.length <= 1 ? innerW / 2 : (i / (nums.length - 1)) * innerW)
    const y = pad + innerH - ((v - min) / range) * innerH
    return { x, y }
  })
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const last = points[points.length - 1]
  const first = points[0]
  const areaD = last && first ? `${d} L ${last.x.toFixed(2)} ${h - pad} L ${first.x.toFixed(2)} ${h - pad} Z` : ''

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`sf-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaD ? <path d={areaD} fill={`url(#sf-${gid})`} /> : null}
      <path
        d={d}
        fill="none"
        stroke="rgb(37 99 235)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill="rgb(37 99 235)" />
      ))}
    </svg>
  )
}

function DeltaBadge({ pct }: { pct: number }) {
  const neg = pct < 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
        neg ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {neg ? <TrendingDown size={12} strokeWidth={2.5} aria-hidden /> : <TrendingUp size={12} strokeWidth={2.5} aria-hidden />}
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  )
}

const INSIGHTS_DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
] as const

const FILTER_SHEET_CATEGORIES = [
  { id: 'date' as const, label: 'Date' },
  { id: 'outlet' as const, label: 'Outlet' },
  { id: 'legal' as const, label: 'Legal entity' },
  { id: 'chain' as const, label: 'Chain' },
  { id: 'city' as const, label: 'City' },
  { id: 'zone' as const, label: 'Zone' },
  { id: 'subzone' as const, label: 'Subzone' },
]

type FilterCategoryId = (typeof FILTER_SHEET_CATEGORIES)[number]['id']

function DashboardContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  
  // Store Status & Delivery Mode — card follows GET /api/store-operations (same effective OPEN as dashboard); engine for modals + persistence.
  const engine = useLocalStoreStatusEngineStore()
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const { data: selfDeliveryRidersData = [], isLoading: selfDeliveryRidersLoading } = useSelfDeliveryRiders(storeId, mxDeliveryEnabled)
  const selfDeliveryRiders = selfDeliveryRidersData
  const [todaySlots, setTodaySlots] = useState<{ start: string; end: string }[]>([])
  const [openingTime, setOpeningTime] = useState<string | null>(null)
  const [closingTime, setClosingTime] = useState<string | null>(null)
  const [lastToggleBy, setLastToggleBy] = useState<string | null>(null)
  const [lastToggleType, setLastToggleType] = useState<string | null>(null)
  const [lastToggledByName, setLastToggledByName] = useState<string | null>(null)
  const [lastToggledById, setLastToggledById] = useState<string | null>(null)
  const [restrictionType, setRestrictionType] = useState<string | null>(null)
  const [withinHoursButRestricted, setWithinHoursButRestricted] = useState(false)
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null)
  const [opensAt, setOpensAt] = useState<string | null>(null)
  const [countdownTick, setCountdownTick] = useState(0)
  const [manualActivationLock, setManualActivationLock] = useState(false)
  /** From GET /api/store-operations — close reason line (dashboard parity). */
  const [closeReasonFromOps, setCloseReasonFromOps] = useState<string | null>(null)

  const closeReasonDisplay = useMemo(() => {
    const r = closeReasonFromOps != null && String(closeReasonFromOps).trim() !== '' ? String(closeReasonFromOps).trim() : null
    return formatCloseReasonForCard(r)
  }, [closeReasonFromOps])

  // Store close: popup modal (no in-card expansion)
  const [showClosePopup, setShowClosePopup] = useState(false)
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false)
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null)
  const [closureDate, setClosureDate] = useState<string>('')
  const [closureTime, setClosureTime] = useState<string>('12:00')
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false)
  const [toggleOnLoading, setToggleOnLoading] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: '', reason: '' })
  // Manual close: reason is mandatory
  const [closeReason, setCloseReason] = useState<string>('')
  const [closeReasonOther, setCloseReasonOther] = useState<string>('')
  const [statusLog, setStatusLog] = useState<{ id: string | number; action: string; action_field?: string | null; restriction_type?: string | null; close_reason?: string | null; performed_by_name: string | null; performed_by_id: string | number | null; performed_by_email: string | null; created_at: string; type?: 'status' | 'settings' }[]>([])

  const { data: walletData, isLoading: walletLoading } = useMerchantWallet(storeId)
  const walletAvailableBalance = walletData?.available_balance ?? null
  const walletTodayEarning = walletData?.today_earning ?? 0
  const walletYesterdayEarning = walletData?.yesterday_earning ?? 0
  const walletPendingBalance = walletData?.pending_balance ?? 0

  /** Approved outlets (same source as sidebar) for quick switch + filter sheet */
  const [outletList, setOutletList] = useState<{ store_id: string; store_name: string }[]>([])
  const [insightsTab, setInsightsTab] = useState<'live' | 'reports'>('live')
  const [reportsSubview, setReportsSubview] = useState<'table' | 'chart'>('table')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<FilterCategoryId>('date')
  const [appliedDatePreset, setAppliedDatePreset] = useState<string>('today')
  const [draftDatePreset, setDraftDatePreset] = useState<string>('today')
  const [appliedOutletIds, setAppliedOutletIds] = useState<Set<string>>(new Set())
  const [draftOutletIds, setDraftOutletIds] = useState<Set<string>>(new Set())
  const [appliedLegalIds, setAppliedLegalIds] = useState<Set<string>>(new Set(['le1']))
  const [draftLegalIds, setDraftLegalIds] = useState<Set<string>>(new Set(['le1']))
  const [appliedChainIds, setAppliedChainIds] = useState<Set<string>>(new Set(['c1']))
  const [draftChainIds, setDraftChainIds] = useState<Set<string>>(new Set(['c1']))
  const [appliedCityIds, setAppliedCityIds] = useState<Set<string>>(new Set(['chennai']))
  const [draftCityIds, setDraftCityIds] = useState<Set<string>>(new Set(['chennai']))
  const [appliedZoneIds, setAppliedZoneIds] = useState<Set<string>>(new Set(['z1']))
  const [draftZoneIds, setDraftZoneIds] = useState<Set<string>>(new Set(['z1']))
  const [appliedSubzoneIds, setAppliedSubzoneIds] = useState<Set<string>>(new Set(['sz1']))
  const [draftSubzoneIds, setDraftSubzoneIds] = useState<Set<string>>(new Set(['sz1']))

  const switchOutlet = React.useCallback(
    (id: string) => {
      if (typeof window !== 'undefined') localStorage.setItem('selectedStoreId', id)
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('storeId', id)
      const base = pathname || '/mx/dashboard'
      router.push(`${base.split('?')[0]}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !Array.isArray((data as { stores?: unknown }).stores)) return
        const approved = ((data as { stores: { store_id?: string; store_name?: string; approval_status?: string }[] }).stores).filter(
          (s) => String(s.approval_status || '').toUpperCase() === 'APPROVED'
        )
        setOutletList(
          approved.map((s) => ({
            store_id: String(s.store_id),
            store_name: String(s.store_name || s.store_id || 'Store'),
          }))
        )
      } catch {
        /* ignore */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!outletList.length) return
    setAppliedOutletIds((prev) => {
      if (prev.size > 0) return prev
      return new Set(outletList.map((o) => o.store_id))
    })
  }, [outletList])

  const openFilterSheet = React.useCallback(() => {
    setDraftDatePreset(appliedDatePreset)
    setDraftOutletIds(new Set(appliedOutletIds))
    setDraftLegalIds(new Set(appliedLegalIds))
    setDraftChainIds(new Set(appliedChainIds))
    setDraftCityIds(new Set(appliedCityIds))
    setDraftZoneIds(new Set(appliedZoneIds))
    setDraftSubzoneIds(new Set(appliedSubzoneIds))
    setFilterCategory('date')
    setFilterSheetOpen(true)
  }, [
    appliedDatePreset,
    appliedOutletIds,
    appliedLegalIds,
    appliedChainIds,
    appliedCityIds,
    appliedZoneIds,
    appliedSubzoneIds,
  ])

  const applyFilterSheet = React.useCallback(() => {
    setAppliedDatePreset(draftDatePreset)
    setAppliedOutletIds(new Set(draftOutletIds))
    setAppliedLegalIds(new Set(draftLegalIds))
    setAppliedChainIds(new Set(draftChainIds))
    setAppliedCityIds(new Set(draftCityIds))
    setAppliedZoneIds(new Set(draftZoneIds))
    setAppliedSubzoneIds(new Set(draftSubzoneIds))
    setFilterSheetOpen(false)
    toast.success('Filters applied')
  }, [draftDatePreset, draftOutletIds, draftLegalIds, draftChainIds, draftCityIds, draftZoneIds, draftSubzoneIds])

  const clearAllFilterDraft = React.useCallback(() => {
    setDraftDatePreset('today')
    setDraftOutletIds(outletList.length ? new Set(outletList.map((o) => o.store_id)) : new Set())
    setDraftLegalIds(new Set(['le1']))
    setDraftChainIds(new Set(['c1']))
    setDraftCityIds(new Set(['chennai']))
    setDraftZoneIds(new Set(['z1']))
    setDraftSubzoneIds(new Set(['sz1']))
  }, [outletList])

  const chainLabel = store?.store_name ? `${store.store_name} (1)` : 'Your chain (1)'
  const outletRowLabel = (o: { store_id: string; store_name: string }) =>
    `${o.store_name} (Id: ${o.store_id})`

  const filterLegalOptions = [{ id: 'le1', label: 'Amitkumar (1)' }] as const
  const filterChainOptions = [{ id: 'c1', label: chainLabel }] as const
  const filterCityOptions = [{ id: 'chennai', label: 'Chennai (1)' }] as const
  const filterZoneOptions = [{ id: 'z1', label: 'South Chennai (1)' }] as const
  const filterSubzoneOptions = [{ id: 'sz1', label: 'Thiruporur, South Chennai (1)' }] as const

  // Resolve store id (URL param, localStorage, or demo)
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null

      if (!id) {
        id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      }

      if (!id) {
        id = DEMO_STORE_ID
      }

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

        if (storeData && (storeData as any).notFound) {
          setStore(null)
          toast.error('Your store is not in our database. Please check your registration or contact support.')
          setIsLoading(false)
          return
        }

        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchStoreByName(storeId)
        }

        if (storeData) {
          setStore(storeData as MerchantStore)
          // Modal logic: if not APPROVED, show modal
          if (storeData.approval_status !== 'APPROVED') {
            setModalStatus({ status: storeData.approval_status ?? '', reason: storeData.approval_reason ?? '' })
            setShowStatusModal(true)
          }
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStore()
  }, [storeId])

  // Local engine hydration + tick (independent engine; identical spec across platforms)
  useEffect(() => {
    if (!storeId) return;
    engine.hydrate(String(storeId));
    engine.startTick();
    return () => engine.stopTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  // Fetch store operations (same API as Food Orders header) – open/closed, today's slots, activity
  const fetchStoreOperations = React.useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`)
      const data = await res.json()
      if (res.ok) {
        clientStoreOpsDebugLog('dashboard fetchStoreOperations', {
          storeId,
          operational_status: data.operational_status,
          last_toggle_type: data.last_toggle_type,
          last_toggled_at: data.last_toggled_at,
          restriction_type: data.restriction_type,
          within_hours_but_restricted: data.within_hours_but_restricted,
        })
        setIsStoreOpen(data.operational_status === 'OPEN')
        setOpensAt(data.opens_at ?? null)
        const slots = (data.today_slots || []) as { start: string; end: string }[]
        setTodaySlots(slots)
        if (slots.length > 0) {
          setOpeningTime(slots[0].start ?? null)
          setClosingTime(slots[0].end ?? null)
        } else {
          setOpeningTime(null)
          setClosingTime(null)
        }
        setLastToggleBy(data.last_toggled_by_email || null)
        setLastToggleType(data.last_toggle_type || null)
        setLastToggledByName(data.last_toggled_by_name || null)
        setLastToggledById(data.last_toggled_by_id || null)
        const rt = data.restriction_type != null ? String(data.restriction_type).toLowerCase() : ''
        setRestrictionType(rt === 'manual_hold' ? 'MANUAL_HOLD' : data.restriction_type || null)
        setWithinHoursButRestricted(data.within_hours_but_restricted === true)
        setLastToggledAt(data.last_toggled_at || null)
        setManualActivationLock(data.block_auto_open === true)
        setCloseReasonFromOps(
          typeof data.close_reason === 'string' && data.close_reason.trim() !== '' ? data.close_reason.trim() : null
        )
        const manualUntil =
          typeof data.manual_close_until === 'string' && data.manual_close_until.trim() !== ''
            ? data.manual_close_until.trim()
            : null
        const closeReason =
          typeof data.close_reason === 'string' && data.close_reason.trim() !== '' ? data.close_reason.trim() : null
        useLocalStoreStatusEngineStore.getState().syncFromStoreOperations({
          operationalOpen: data.operational_status === 'OPEN',
          manualCloseUntil: manualUntil,
          manualCloseReason: closeReason,
        })
      } else {
        setTodaySlots([])
        setCloseReasonFromOps(null)
      }
    } catch {
      // keep current state
    }
  }, [storeId])

  useEffect(() => {
    if (storeId) fetchStoreOperations()
  }, [storeId, fetchStoreOperations])

  // When close popup opens, set default date (today, local) and time (now + 10 min) for Temporary Closed
  useEffect(() => {
    if (showClosePopup) {
      const now = new Date()
      const y = now.getFullYear()
      const m = (now.getMonth() + 1).toString().padStart(2, '0')
      const d = now.getDate().toString().padStart(2, '0')
      setClosureDate(`${y}-${m}-${d}`)
      const in10 = new Date(now.getTime() + 10 * 60 * 1000)
      setClosureTime(`${in10.getHours().toString().padStart(2, '0')}:${in10.getMinutes().toString().padStart(2, '0')}`)
    }
  }, [showClosePopup])

  // Realtime: update store status when DB changes (no refresh)
  const storeInternalId = (store as { id?: number } | null)?.id ?? null
  useEffect(() => {
    if (!storeInternalId || !storeId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`dashboard_store:${storeInternalId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merchant_stores', filter: `id=eq.${storeInternalId}` }, () => { fetchStoreOperations() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merchant_store_availability', filter: `store_id=eq.${storeInternalId}` }, () => { fetchStoreOperations() })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [storeInternalId, storeId, fetchStoreOperations])

  // Live countdown: update every 1s; when it hits zero, refetch so status flips to Open without refresh
  useEffect(() => {
    if (!isStoreOpen && opensAt && !withinHoursButRestricted) {
      const t = setInterval(() => {
        const ms = new Date(opensAt).getTime() - Date.now()
        if (ms <= 0) {
          fetchStoreOperations()
          return
        }
        setCountdownTick((n) => n + 1)
      }, 1000)
      return () => clearInterval(t)
    }
  }, [isStoreOpen, opensAt, withinHoursButRestricted, fetchStoreOperations])

  // Delivery mode from merchant_store_settings (self_delivery)
  const fetchDeliverySettings = React.useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`)
      const data = await res.json()
      if (res.ok) setMxDeliveryEnabled(data.self_delivery === true)
    } catch {
      // keep default false
    }
  }, [storeId])

  useEffect(() => {
    fetchDeliverySettings()
  }, [fetchDeliverySettings])

  // Save manual activation lock to database
  const saveManualActivationLock = React.useCallback(async (enabled: boolean) => {
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
        // Refresh store operations to get updated state
        fetchStoreOperations();
      }
    } catch (error) {
      console.error('Error saving manual activation lock:', error);
      toast.error('Failed to save manual activation lock setting');
      // Revert toggle on error
      setManualActivationLock(!enabled);
    }
  }, [storeId, fetchStoreOperations]);

  // Audit log lines for store card (e.g. last close reason)
  useEffect(() => {
    if (!storeId) return
    fetch(`/api/merchant/audit-logs?storeId=${encodeURIComponent(storeId)}&limit=30`)
      .then((res) => res.json())
      .then((data) => { if (data.logs) setStatusLog(data.logs); })
      .catch(() => setStatusLog([]))
  }, [storeId, isStoreOpen])

  // Status Modal Component
  const StatusModal = () => {
    if (!showStatusModal) return null
    
    // Determine color based on status
    const getStatusColor = () => {
      switch(modalStatus.status) {
        case 'SUBMITTED': return 'text-blue-600'
        case 'UNDER_VERIFICATION': return 'text-yellow-600'
        case 'REJECTED': return 'text-red-600'
        case 'ERROR': return 'text-red-600'
        default: return 'text-gray-700'
      }
    }
    
    return (
      <Dialog 
        open={showStatusModal} 
        onClose={() => {}} 
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white/95 backdrop-blur-md p-8 shadow-2xl border border-gray-200">
            {/* Store Status Title with Color */}
            <Dialog.Title className={`text-2xl font-bold mb-4 ${getStatusColor()}`}>
              Store Status
            </Dialog.Title>
            
            <div className="mb-6">
              {modalStatus.status === 'SUBMITTED' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-blue-700">📋 Submission Received</span>
                  <p className="text-sm text-gray-600">Your store is submitted and under review. We'll notify you once verified.</p>
                </div>
              )}
              {modalStatus.status === 'UNDER_VERIFICATION' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-yellow-700">🔍 Verification in Progress</span>
                  <p className="text-sm text-gray-600">Our team is currently verifying your store details. This usually takes 24-48 hours.</p>
                </div>
              )}
              {modalStatus.status === 'REJECTED' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-red-700">❌ Registration Rejected</span>
                  <p className="text-sm text-gray-600">Your store registration could not be approved.</p>
                </div>
              )}
              {modalStatus.status === 'ERROR' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-red-700">⚠️ Error Occurred</span>
                  <p className="text-sm text-gray-600">{modalStatus.reason}</p>
                </div>
              )}
              
              {/* Fallback for unknown status */}
              {modalStatus.status && !['SUBMITTED','UNDER_VERIFICATION','REJECTED','ERROR'].includes(modalStatus.status) && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-gray-700">📊 Status: {modalStatus.status}</span>
                  {modalStatus.reason && (
                    <p className="text-sm text-gray-600">{modalStatus.reason}</p>
                  )}
                </div>
              )}
              
              {modalStatus.reason && modalStatus.status === 'REJECTED' && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800">Reason for rejection:</p>
                  <p className="text-sm text-red-700 mt-1">{modalStatus.reason}</p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                setShowStatusModal(false)
                router.push('/auth/search')
              }}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
            >
              Back to Home
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    )
  }

  const handleStoreToggle = () => {
    if (isStoreOpen) {
      setShowClosePopup(true)
      setToggleClosureType(null)
    } else {
      setShowToggleOnWarning(true)
    }
  }

  const handleConfirmToggleOn = async () => {
    if (!storeId) return
    setToggleOnLoading(true)
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, action: 'manual_open' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && (data as { success?: boolean }).success) {
        setShowToggleOnWarning(false)
        toast.success('Store is now OPEN. Orders are being accepted!')
        await fetchStoreOperations()
      } else {
        toastStoreOperationsPostFailure(res, data, 'Failed to open store')
        await fetchStoreOperations()
      }
    } catch {
      toast.error('Failed to open store')
      await fetchStoreOperations()
    } finally {
      setToggleOnLoading(false)
    }
  }

  const handleClosePopupConfirm = () => {
    if (!toggleClosureType) {
      toast.error('Please select closure type')
      return
    }
    if (toggleClosureType === 'temporary') {
      if (!closureDate || !closureTime) {
        toast.error('Please select date and time for reopening')
        return
      }
      const closedUntil = new Date(`${closureDate}T${closureTime}:00`)
      if (closedUntil.getTime() <= Date.now()) {
        toast.error('Reopening date and time must be in the future')
        return
      }
    }
    if (!closeReason || closeReason.trim() === '') {
      toast.error('Please select a reason for closing')
      return
    }
    if (closeReason === 'Other' && (!closeReasonOther || closeReasonOther.trim() === '')) {
      toast.error('Please enter the reason in "Other"')
      return
    }
    void handleFinalCloseConfirm()
  }

  const handleFinalCloseConfirm = async () => {
    if (!storeId || !toggleClosureType) return
    setCloseConfirmLoading(true)

    let manualCloseUntilIso: string | undefined
    if (toggleClosureType === 'temporary') {
      const closedUntil = new Date(`${closureDate}T${closureTime}:00`)
      manualCloseUntilIso = closedUntil.toISOString()
    }

    const reasonText = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason
    const body: {
      store_id: string
      action: string
      closure_type: string
      manual_close_until?: string
      close_reason?: string
    } = {
      store_id: storeId,
      action: 'manual_close',
      closure_type: toggleClosureType,
      close_reason: reasonText,
    }
    if (manualCloseUntilIso) body.manual_close_until = manualCloseUntilIso

    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok && (result as { success?: boolean }).success) {
        setShowClosePopup(false)
        setToggleClosureType(null)
        setCloseReason('')
        setCloseReasonOther('')
        toast.success('Store closed.')
        await fetchStoreOperations()
      } else {
        toast.error((result as { error?: string }).error || 'Failed to close store')
      }
    } catch {
      toast.error('Failed to close store')
    } finally {
      setCloseConfirmLoading(false)
    }
  }

  const handleCancelClosePopup = () => {
    if (closeConfirmLoading) return
    setShowClosePopup(false)
    setToggleClosureType(null)
    setClosureDate('')
    setClosureTime('12:00')
    setCloseReason('')
    setCloseReasonOther('')
  }

  const handleMXDeliveryToggle = async () => {
    const newValue = !mxDeliveryEnabled
    try {
      const res = await fetch('/api/merchant/store-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: storeId || '', self_delivery: newValue }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMxDeliveryEnabled(newValue)
        toast.success(newValue ? '✅ Self Delivery enabled' : '✅ GatiMitra Delivery enabled')
      } else {
        toast.error(data.error || 'Failed to update delivery mode')
      }
    } catch {
      toast.error('Failed to update delivery mode')
    }
  }

  return (
    <>
      <StatusModal />
      {engine.scheduleEndModalOpen && (
        <Dialog open={engine.scheduleEndModalOpen} onClose={() => {}} className="relative z-[120]">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <Dialog.Title className="text-base font-bold text-gray-900">{UI_STRINGS.scheduleEndTitle}</Dialog.Title>
              <p className="mt-2 text-sm text-gray-700">{UI_STRINGS.scheduleEndBody}</p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  onClick={() => engine.scheduleEndRespond('stay_online')}
                >
                  Stay Online
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                  onClick={() => engine.scheduleEndRespond('go_offline')}
                >
                  Go Offline
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
      {/* Store close options – popup; z-[100] so overlay covers and blurs sidebar */}
      {showClosePopup && (
        <Dialog open={showClosePopup} onClose={handleCancelClosePopup} className="relative z-[100]">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <Dialog.Title className="text-lg font-bold text-gray-900 mb-4">How would you like to close your store?</Dialog.Title>
              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === 'temporary' ? 'bg-orange-50 border-orange-400' : 'border-gray-200 hover:border-orange-200'}`}>
                  <input type="radio" name="closureType" checked={toggleClosureType === 'temporary'} onChange={() => setToggleClosureType('temporary')} className="w-4 h-4" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                    <p className="text-xs text-gray-600">Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.</p>
                  </div>
                </label>
                {toggleClosureType === 'temporary' && (
                  <div className="ml-7 space-y-3 p-3 rounded-lg bg-orange-50/50 border border-orange-200">
                    <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">Date</label>
                        <input
                          type="date"
                          value={closureDate}
                          onChange={(e) => setClosureDate(e.target.value)}
                          min={(() => {
                            const n = new Date()
                            return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, '0')}-${n.getDate().toString().padStart(2, '0')}`
                          })()}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">Time</label>
                        <input
                          type="time"
                          value={closureTime}
                          onChange={(e) => setClosureTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600">Store stays closed until this date & time, or until you turn it ON manually.</p>
                  </div>
                )}
                <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === 'today' ? 'bg-red-50 border-red-400' : 'border-gray-200 hover:border-red-200'}`}>
                  <input type="radio" name="closureType" checked={toggleClosureType === 'today'} onChange={() => setToggleClosureType('today')} className="w-4 h-4" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                    <p className="text-xs text-gray-600">Closed until end of today (India time). Schedule can resume tomorrow.</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === 'manual_hold' ? 'bg-amber-50 border-amber-400' : 'border-gray-200 hover:border-amber-200'}`}>
                  <input type="radio" name="closureType" checked={toggleClosureType === 'manual_hold'} onChange={() => setToggleClosureType('manual_hold')} className="w-4 h-4" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Until I manually turn it ON</p>
                    <p className="text-xs text-gray-600">Store stays OFF even during operating hours until you turn it ON</p>
                  </div>
                </label>
              </div>
              {/* Reason for closing (mandatory when manually closing) */}
              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold text-gray-700 block">
                  Reason for closing <span className="text-red-500">*</span>
                </label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                >
                  <option value="">Select reason</option>
                  <option value="Staff shortage">Staff shortage</option>
                  <option value="Inventory restock">Inventory restock</option>
                  <option value="Device issue / electricity">Device issue / electricity</option>
                  <option value="Run out of Gas">Run out of Gas</option>
                  <option value="Payment issue">Payment issue</option>
                  <option value="Rush of offline orders">Rush of offline orders</option>
                  <option value="Equipment issue">Equipment issue</option>
                  <option value="Holiday / Off">Holiday / Off</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Personal / Emergency">Personal / Emergency</option>
                  <option value="Kitchen / Prep area issue">Kitchen / Prep area issue</option>
                  <option value="Supplier delay">Supplier delay</option>
                  <option value="Other">Other</option>
                </select>
                {closeReason === 'Other' && (
                  <input
                    type="text"
                    value={closeReasonOther}
                    onChange={(e) => setCloseReasonOther(e.target.value)}
                    placeholder="Enter reason"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                )}
              </div>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={handleCancelClosePopup} disabled={closeConfirmLoading} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={handleClosePopupConfirm} disabled={!toggleClosureType || !closeReason?.trim() || (closeReason === 'Other' && !closeReasonOther?.trim()) || (toggleClosureType === 'temporary' && (!closureDate || !closureTime)) || closeConfirmLoading} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
                  {closeConfirmLoading ? <><Loader2 size={18} className="animate-spin" /> Confirming...</> : 'Confirm'}
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
      {/* Turn Store ON modal: outside layout so overlay covers full viewport (including sidebar) */}
      {showToggleOnWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[100] p-4" aria-hidden="true">
          <div className="backdrop-blur-md bg-white/95 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-emerald-200">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 flex items-center justify-center">
                <Power size={28} className="text-emerald-600" />
              </div>
            </div>

            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-bold text-gray-900">Turn Store ON?</h3>
              <p className="text-sm text-gray-600">
                Your store will be OPEN and customers can place orders. Make sure you&apos;re ready to accept orders!
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 mb-6">
              <p className="text-xs text-amber-800 font-medium">
                ⚠️ <strong>Orders will start coming immediately!</strong> Be prepared to receive and process them.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => !toggleOnLoading && setShowToggleOnWarning(false)}
                disabled={toggleOnLoading}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmToggleOn}
                disabled={toggleOnLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg disabled:opacity-80 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {toggleOnLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Turning ON...
                  </>
                ) : (
                  'Yes, Turn ON'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <MXLayoutWhite
        restaurantName={store?.store_name || 'Dashboard'}
        restaurantId={storeId || DEMO_STORE_ID}
      >
        {isLoading ? (
          <PageSkeletonDashboard />
        ) : (
          <>
        <PartnerPageHeader title="Dashboard" subtitle="GatiMitra · Operations command center" />
        <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full">
          <div className="dashboard-scroll hide-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-5 lg:px-8 py-3 sm:py-4">
            <div className="max-w-[1600px] mx-auto">
              {/* Wallet | Store | Delivery — flat on page bg, column dividers on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch pb-1">
                {/* Wallet & Earnings */}
                <section className="min-w-0 flex flex-col h-full">
                  <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                    <div className="flex items-start gap-2 mb-3 shrink-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.08] text-emerald-600 ring-1 ring-emerald-500/15">
                        <Wallet className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Wallet &amp; earnings</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Balances at a glance</p>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-h-0">
                      {walletLoading ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-9 rounded-md bg-slate-200/50 animate-pulse" />
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <div className="min-w-0">
                            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Available</p>
                            <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-emerald-700">
                              ₹{walletAvailableBalance != null ? Number(walletAvailableBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Today</p>
                            <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-orange-600">
                              ₹{Number(walletTodayEarning).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Yesterday</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
                              ₹{Number(walletYesterdayEarning).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-violet-600">
                              ₹{Number(walletPendingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Store status — full border; color reflects state when closed */}
                <section className="min-w-0 flex flex-col h-full">
                  <div
                    className={`flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 bg-white/40 p-3 sm:p-3.5 ${
                      isStoreOpen
                        ? 'border-teal-500'
                        : restrictionType === 'MANUAL_HOLD'
                          ? 'border-amber-500'
                          : 'border-red-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 shrink-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/[0.06] text-slate-700 ring-1 ring-slate-900/10">
                            <Store className="h-[15px] w-[15px]" strokeWidth={2} />
                          </span>
                          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Store status</h2>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                          {openingTime && closingTime
                            ? `${formatTimeHMS(openingTime)} – ${formatTimeHMS(closingTime)}`
                            : todaySlots.length
                              ? todaySlots.map((s) => `${s.start}–${s.end}`).join(', ')
                              : '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStoreToggle}
                        className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                          isStoreOpen
                            ? 'bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-500'
                            : restrictionType === 'MANUAL_HOLD'
                              ? 'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500'
                              : 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-500'
                        }`}
                        aria-label={isStoreOpen ? 'Close store' : 'Open store'}
                      >
                        <Power size={18} strokeWidth={2.25} />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col gap-1.5 mt-2">
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isStoreOpen
                              ? 'bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20'
                              : restrictionType === 'MANUAL_HOLD'
                                ? 'bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25'
                                : 'bg-red-500/10 text-red-800 ring-1 ring-red-500/20'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isStoreOpen ? 'bg-emerald-500 animate-pulse' : restrictionType === 'MANUAL_HOLD' ? 'bg-amber-500' : 'bg-red-500'}`} />
                          {isStoreOpen ? 'Open' : restrictionType === 'MANUAL_HOLD' ? 'Waiting manual activation' : 'Closed'}
                        </span>
                      </div>
                      {!isStoreOpen && opensAt && !withinHoursButRestricted && (() => {
                        void countdownTick
                        const ms = new Date(opensAt).getTime() - Date.now()
                        if (ms <= 0) {
                          return <p className="text-[11px] font-medium text-red-600">Opens now</p>
                        }
                        const h = Math.floor(ms / 3600000)
                        const m = Math.floor((ms % 3600000) / 60000)
                        const s = Math.floor((ms % 60000) / 1000)
                        if (h === 0 && m === 0 && s === 0) {
                          return <p className="text-[11px] font-medium text-red-600">Opens now</p>
                        }
                        return (
                          <p
                            className="text-[11px] font-medium text-red-700"
                            title="Updates every second. Store will open automatically at zero."
                          >
                            Opens in {h}h {m}m {s}s
                          </p>
                        )
                      })()}
                      {!isStoreOpen && closeReasonDisplay && (
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-3" title={closeReasonDisplay}>
                          <span className="font-semibold text-slate-700">Close reason: </span>
                          {closeReasonDisplay}
                        </p>
                      )}
                      {(lastToggledByName || lastToggleBy || lastToggleType) && lastToggledAt && (
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Last:{' '}
                          {(() => {
                            const typeUp = String(lastToggleType || '').toUpperCase()
                            const timeStr = new Date(lastToggledAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true,
                            })
                            const email = lastToggleBy || ''
                            const emailNorm = String(email).toLowerCase()
                            const isGatiMitraAgent =
                              emailNorm.includes('gatimitra') || emailNorm.endsWith('@gatimitra.in') || emailNorm.endsWith('@gatimitra.com')
                            if (typeUp.startsWith('AUTO')) {
                              return `${isStoreOpen ? 'Auto on' : 'Auto closed'} · ${timeStr}`
                            }
                            if (isGatiMitraAgent) {
                              return `${isStoreOpen ? 'Opened' : 'Closed'} by GatiMitra (agent: ${email || 'unknown'}) · ${timeStr}`
                            }
                            const who = lastToggledByName || lastToggleBy || 'Owner'
                            return `${isStoreOpen ? 'Opened' : 'Closed'} by ${who}${storeId ? ` (ID: ${storeId})` : ''} · ${timeStr}`
                          })()}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 shrink-0">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-800">Manual activation lock</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Prevents automatic opening</p>
                      </div>
                      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={manualActivationLock}
                          onChange={async (e) => {
                            const newValue = e.target.checked
                            setManualActivationLock(newValue)
                            await saveManualActivationLock(newValue)
                          }}
                          className="peer sr-only"
                        />
                        <div className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:border after:border-slate-200/80 after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-checked:bg-red-600 peer-checked:after:translate-x-[22px]" />
                      </label>
                    </div>
                  </div>
                </section>

                {/* Delivery */}
                <section className="min-w-0 flex flex-col h-full">
                  <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                    <div className="flex items-start gap-2 mb-2 shrink-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/[0.08] text-orange-600 ring-1 ring-orange-500/15">
                        <Truck className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery mode</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">{mxDeliveryEnabled ? 'Your riders' : 'Platform riders'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold transition-colors ${!mxDeliveryEnabled ? 'text-violet-700' : 'text-slate-400'}`}>GatiMitra</span>
                      <button
                        type="button"
                        onClick={handleMXDeliveryToggle}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${mxDeliveryEnabled ? 'bg-orange-500' : 'bg-slate-300'}`}
                        aria-label={mxDeliveryEnabled ? 'Switch to GatiMitra delivery' : 'Switch to Self delivery'}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${mxDeliveryEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </button>
                      <span className={`text-xs font-semibold transition-colors ${mxDeliveryEnabled ? 'text-orange-600' : 'text-slate-400'}`}>Self</span>
                    </div>
                    {mxDeliveryEnabled ? (
                      <div className="mt-3 flex flex-1 min-h-0 flex-col border-t border-slate-200/80 pt-2.5">
                        {selfDeliveryRidersLoading ? (
                          <p className="text-[11px] text-slate-500">Loading riders…</p>
                        ) : selfDeliveryRiders.length === 0 ? (
                          <div className="flex flex-1 flex-col gap-2">
                            <p className="text-xs text-amber-800 leading-snug">Add your first rider to use self delivery.</p>
                            <Link
                              href={storeId ? `/mx/store-settings?storeId=${encodeURIComponent(storeId)}&tab=delivery` : '/mx/store-settings'}
                              className="text-xs font-semibold text-orange-600 hover:text-orange-700 mt-auto"
                            >
                              Add rider in Settings →
                            </Link>
                          </div>
                        ) : (
                          <div className="flex flex-1 min-h-0 flex-col gap-2">
                            <ul className="space-y-1.5">
                              {selfDeliveryRiders.slice(0, 2).map((r) => (
                                <li
                                  key={r.id}
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-800"
                                >
                                  <span className="font-mono text-[10px] font-medium text-slate-400 tabular-nums">#{r.id}</span>
                                  <span className="font-semibold text-slate-900">{r.rider_name}</span>
                                  <span className="text-slate-500 tabular-nums">{r.rider_mobile}</span>
                                </li>
                              ))}
                            </ul>
                            {selfDeliveryRiders.length > 2 && (
                              <p className="text-[11px] text-slate-500">+{selfDeliveryRiders.length - 2} more</p>
                            )}
                            <Link
                              href={storeId ? `/mx/store-settings?storeId=${encodeURIComponent(storeId)}&tab=delivery` : '/mx/store-settings'}
                              className="inline-flex items-center text-xs font-semibold text-orange-600 hover:text-orange-700 mt-auto"
                            >
                              Manage all riders →
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[1px]" aria-hidden />
                    )}
                  </div>
                </section>
              </div>

              {/* Business insights — plain page bg only (no cards / shadows) */}
              <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-slate-200/90">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                  <div className="flex flex-col gap-3 min-w-0">
                    <div
                      className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit"
                      role="tablist"
                      aria-label="Dashboard view"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={insightsTab === 'live'}
                        onClick={() => setInsightsTab('live')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          insightsTab === 'live'
                            ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Live preview
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={insightsTab === 'reports'}
                        onClick={() => setInsightsTab('reports')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          insightsTab === 'reports'
                            ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Business reports
                      </button>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-600 max-w-2xl leading-relaxed">
                      See how your store is performing today and how it stacks up against recent periods—so you can spot trends early and act quickly.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap shrink-0">
                    <label className="sr-only" htmlFor="dashboard-outlet-select">
                      Switch outlet
                    </label>
                    <select
                      id="dashboard-outlet-select"
                      value={storeId || ''}
                      onChange={(e) => switchOutlet(e.target.value)}
                      className="min-w-[200px] max-w-[min(100%,280px)] text-xs font-medium text-slate-800 bg-transparent border border-slate-200/90 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    >
                      {outletList.length === 0 ? (
                        <option value={storeId || ''}>{store?.store_name || 'Current store'}</option>
                      ) : (
                        outletList.map((o) => (
                          <option key={o.store_id} value={o.store_id}>
                            {o.store_name}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={openFilterSheet}
                      className="inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-700 border border-slate-200/90 rounded-lg px-3 py-2 bg-transparent hover:bg-slate-100/70 transition-colors"
                    >
                      <Filter size={14} className="text-slate-500 shrink-0" aria-hidden />
                      All outlets
                      <ChevronDown size={14} className="text-slate-400 shrink-0" aria-hidden />
                    </button>
                  </div>
                </div>

                {insightsTab === 'reports' && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-5 mb-4 pb-3 border-b border-slate-200/70">
                    <div
                      className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit"
                      role="tablist"
                      aria-label="Report layout"
                    >
                      <button
                        type="button"
                        aria-selected={reportsSubview === 'table'}
                        onClick={() => setReportsSubview('table')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          reportsSubview === 'table'
                            ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Table2 size={14} aria-hidden />
                        Table
                      </button>
                      <button
                        type="button"
                        aria-selected={reportsSubview === 'chart'}
                        onClick={() => setReportsSubview('chart')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          reportsSubview === 'chart'
                            ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LineChart size={14} aria-hidden />
                        Charts
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled
                      title="Export coming soon"
                      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 border border-dashed border-slate-200 rounded-lg px-3 py-2 cursor-not-allowed opacity-80"
                    >
                      <Download size={14} aria-hidden />
                      Generate report
                    </button>
                  </div>
                )}

                {insightsTab === 'live' && (
                <>
                {/* Sales overview */}
                <div className="mb-10">
                  <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                    <BarChart3 className="text-emerald-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">Sales overview</h2>
                    <span className="text-slate-400" title="Info">
                      <Info size={15} strokeWidth={2} aria-hidden />
                    </span>
                    <Link
                      href="/mx/payments"
                      className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View details
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                  <div className="divide-y divide-slate-200/70">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Sales</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[42, 55, 48, 62, 58, 45, 38, 33, 28, 25]} />
                      </div>
                      <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {walletLoading
                            ? '…'
                            : `₹${Number(walletTodayEarning).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        </span>
                        <DeltaBadge pct={-12} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Delivered orders</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[18, 22, 20, 24, 21, 19, 16, 14, 12, 11]} />
                      </div>
                      <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">—</span>
                        <DeltaBadge pct={-8} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">AOV</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[280, 295, 288, 310, 305, 298, 292, 285, 278, 272]} />
                      </div>
                      <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">₹318</span>
                        <DeltaBadge pct={-5} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer experience */}
                <div className="mb-10">
                  <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                    <Star className="text-amber-500 shrink-0" size={18} strokeWidth={2} aria-hidden />
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer experience</h2>
                    <span className="text-slate-400">
                      <Info size={15} strokeWidth={2} aria-hidden />
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/70">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Ratings</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[4.1, 4.0, 4.05, 3.95, 3.9, 3.88, 3.85, 3.82, 3.8, 3.78]} />
                      </div>
                      <div className="sm:col-span-4 flex justify-start sm:justify-end">
                        <Link href="/mx/user-insights" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          View business reports
                        </Link>
                      </div>
                    </div>
                    <div className="py-2">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 pl-0.5">Bad orders</p>
                      <div className="divide-y divide-slate-200/60">
                        {[
                          { label: 'Rejected orders', v: [0.2, 0.1, 0.15, 0.1, 0.08, 0.05, 0.04, 0.03, 0.02, 0] },
                          { label: 'Delayed orders', v: [1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] },
                          { label: 'Poor rated orders', v: [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.08] },
                        ].map((row) => (
                          <div
                            key={row.label}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-2.5 pl-2 sm:pl-3 border-l-2 border-slate-200/80"
                          >
                            <div className="sm:col-span-3 text-xs sm:text-sm text-slate-600">{row.label}</div>
                            <div className="sm:col-span-5 flex justify-start sm:justify-center">
                              <MiniSparkline values={row.v} />
                            </div>
                            <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                              <span className="text-xs text-slate-500 tabular-nums">0.0%</span>
                              <span className="text-[11px] font-medium tabular-nums text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-full">
                                0%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Total complaints</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[2, 1, 2, 1, 1, 0, 1, 0, 0, 0]} />
                      </div>
                      <div className="sm:col-span-4 flex justify-start sm:justify-end">
                        <Link href="/mx/user-insights" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          View business reports
                        </Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Lost sales</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} />
                      </div>
                      <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">₹0</span>
                        <span className="text-[11px] font-medium tabular-nums text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-full">
                          0%
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Online %</div>
                      <div className="sm:col-span-5 flex justify-start sm:justify-center">
                        <MiniSparkline values={[98, 97, 99, 98, 96, 95, 97, 98, 99, 97]} />
                      </div>
                      <div className="sm:col-span-4 flex justify-start sm:justify-end">
                        <Link href="/mx/user-insights" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          View business reports
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer funnel */}
                <div className="pb-4">
                  <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                    <Funnel className="text-violet-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer funnel</h2>
                    <span className="text-slate-400">
                      <Info size={15} strokeWidth={2} aria-hidden />
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/70">
                    {[
                      { label: 'Impressions', icon: ChevronDown, spark: [120, 132, 128, 140, 135, 118, 105, 92, 78, 65], val: '48', pct: -18 },
                      { label: 'Impressions to menu', icon: ChevronDown, spark: [45, 48, 44, 50, 46, 40, 35, 30, 26, 22], val: '8.3%', pct: -12 },
                      { label: 'Menu to cart', icon: ChevronDown, spark: [22, 24, 21, 23, 22, 19, 17, 15, 13, 11], val: '25.0%', pct: -9 },
                      { label: 'Cart to order', icon: Check, spark: [8, 9, 8, 9, 8, 7, 6, 5, 4, 3], val: '0.0%', pct: -22 },
                    ].map((row, idx) => {
                      const StageIcon = row.icon
                      return (
                      <div
                        key={row.label}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5"
                      >
                        <div className="sm:col-span-3 flex items-center gap-2 text-sm text-slate-700 font-medium">
                          <span className="flex w-6 shrink-0 flex-col items-center text-slate-400" aria-hidden>
                            <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 0 ? 0 : 1 }} />
                            <StageIcon size={14} className="text-blue-600 my-0.5" strokeWidth={2.5} />
                            <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 3 ? 0 : 1 }} />
                          </span>
                          {row.label}
                        </div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={row.spark} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">{row.val}</span>
                          <DeltaBadge pct={row.pct} />
                        </div>
                      </div>
                      )
                    })}
                    {(['New users', 'Repeat users', 'Lapsed users'] as const).map((label) => (
                      <div
                        key={label}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5"
                      >
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">{label}</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[40, 42, 41, 44, 43, 40, 38, 36, 35, 34]} />
                        </div>
                        <div className="sm:col-span-4 flex justify-start sm:justify-end">
                          <Link href="/mx/user-insights" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            View business reports
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </>
                )}

                {insightsTab === 'reports' && reportsSubview === 'table' && (
                  <div className="mt-2 pb-8">
                    <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
                      <table className="min-w-full text-xs text-slate-800">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100/80 text-left text-[10px] uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2.5 font-semibold">Metric</th>
                            <th className="px-3 py-2.5 font-semibold">Trend</th>
                            <th className="px-3 py-2.5 font-semibold tabular-nums">This week</th>
                            <th className="px-3 py-2.5 font-semibold tabular-nums">Last week</th>
                            <th className="px-3 py-2.5 font-semibold">vs prior</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[
                            { m: 'Gross sales', tw: 128400, lw: 118200, spark: [42, 55, 48, 62, 58, 45, 38, 33, 28, 25] as const },
                            { m: 'Orders', tw: 312, lw: 298, spark: [18, 22, 20, 24, 21, 19, 16, 14, 12, 11] as const },
                            { m: 'AOV', tw: 412, lw: 396, spark: [280, 295, 288, 310, 305, 298, 292, 285, 278, 272] as const },
                          ].map((row) => {
                            const pct = row.lw ? Math.round(((row.tw - row.lw) / row.lw) * 100) : 0
                            return (
                              <tr key={row.m}>
                                <td className="px-3 py-2.5 font-medium text-slate-900">{row.m}</td>
                                <td className="px-3 py-2.5">
                                  <MiniSparkline values={row.spark} />
                                </td>
                                <td className="px-3 py-2.5 tabular-nums font-semibold">
                                  {row.m === 'Gross sales' ? `₹${row.tw.toLocaleString('en-IN')}` : row.tw}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-slate-600">
                                  {row.m === 'Gross sales' ? `₹${row.lw.toLocaleString('en-IN')}` : row.lw}
                                </td>
                                <td className="px-3 py-2.5">
                                  <DeltaBadge pct={pct} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                      Sample figures for layout preview; connect your analytics source to populate this table.
                    </p>
                  </div>
                )}

                {insightsTab === 'reports' && reportsSubview === 'chart' && (
                  <div className="mt-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { title: 'Gross sales', bars: [42, 55, 48, 62, 58, 45, 38] as const },
                      { title: 'Orders', bars: [18, 22, 20, 24, 21, 19, 16] as const },
                      { title: 'AOV', bars: [72, 78, 75, 82, 80, 76, 70] as const },
                      { title: 'Repeat rate', bars: [55, 58, 56, 60, 59, 57, 54] as const },
                    ].map((block) => (
                      <div key={block.title} className="rounded-lg border border-slate-200/80 bg-white/70 p-4">
                        <p className="text-xs font-semibold text-slate-900 mb-3">{block.title}</p>
                        <div className="flex items-end gap-1.5 h-28">
                          {block.bars.map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 min-w-[6px] rounded-t-md bg-blue-600/85"
                              style={{ height: `${Math.max(12, h)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="sm:col-span-2 text-[11px] text-slate-500 leading-relaxed">
                      Chart view preview; wire up real series when reporting endpoints are ready.
                    </p>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
          </>
        )}

      </MXLayoutWhite>

      {filterSheetOpen && (
        <div className="fixed inset-0 z-[220] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="mx-filter-sheet-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close filters"
            onClick={() => setFilterSheetOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
              <h2 id="mx-filter-sheet-title" className="text-sm font-semibold text-slate-900">
                Filter
              </h2>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1">
              <nav className="w-[38%] shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-100/95 py-1" aria-label="Filter categories">
                {FILTER_SHEET_CATEGORIES.map((c) => {
                  const active = filterCategory === c.id
                  const badge =
                    c.id === 'date'
                      ? 1
                      : c.id === 'outlet' &&
                          outletList.length > 0 &&
                          draftOutletIds.size > 0 &&
                          draftOutletIds.size < outletList.length
                        ? draftOutletIds.size
                        : 0
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFilterCategory(c.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-xs font-medium transition-colors ${
                        active
                          ? 'border-r-[3px] border-blue-600 bg-white text-slate-900'
                          : 'border-r-[3px] border-transparent text-slate-700 hover:bg-slate-200/40'
                      }`}
                    >
                      <span>{c.label}</span>
                      {badge > 0 ? (
                        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </nav>
              <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
                {filterCategory === 'date' && (
                  <div className="space-y-1" role="radiogroup" aria-label="Date range">
                    {INSIGHTS_DATE_PRESETS.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <input
                          type="radio"
                          name="mx-insights-date"
                          checked={draftDatePreset === p.id}
                          onChange={() => setDraftDatePreset(p.id)}
                          className="h-4 w-4 accent-blue-600"
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                )}
                {filterCategory === 'outlet' && (
                  <div className="space-y-2">
                    {outletList.length === 0 ? (
                      <p className="text-xs text-slate-500">No approved outlets loaded yet.</p>
                    ) : (
                      outletList.map((o) => (
                        <label
                          key={o.store_id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={draftOutletIds.has(o.store_id)}
                            onChange={(e) => {
                              const on = e.target.checked
                              setDraftOutletIds((prev) => {
                                const next = new Set(prev)
                                if (on) next.add(o.store_id)
                                else next.delete(o.store_id)
                                return next
                              })
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                          />
                          <span className="leading-snug">{outletRowLabel(o)}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
                {filterCategory === 'legal' &&
                  filterLegalOptions.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draftLegalIds.has(o.id)}
                        onChange={(e) => {
                          const on = e.target.checked
                          setDraftLegalIds((prev) => {
                            const next = new Set(prev)
                            if (on) next.add(o.id)
                            else next.delete(o.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {o.label}
                    </label>
                  ))}
                {filterCategory === 'chain' &&
                  filterChainOptions.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draftChainIds.has(o.id)}
                        onChange={(e) => {
                          const on = e.target.checked
                          setDraftChainIds((prev) => {
                            const next = new Set(prev)
                            if (on) next.add(o.id)
                            else next.delete(o.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {o.label}
                    </label>
                  ))}
                {filterCategory === 'city' &&
                  filterCityOptions.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draftCityIds.has(o.id)}
                        onChange={(e) => {
                          const on = e.target.checked
                          setDraftCityIds((prev) => {
                            const next = new Set(prev)
                            if (on) next.add(o.id)
                            else next.delete(o.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {o.label}
                    </label>
                  ))}
                {filterCategory === 'zone' &&
                  filterZoneOptions.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draftZoneIds.has(o.id)}
                        onChange={(e) => {
                          const on = e.target.checked
                          setDraftZoneIds((prev) => {
                            const next = new Set(prev)
                            if (on) next.add(o.id)
                            else next.delete(o.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {o.label}
                    </label>
                  ))}
                {filterCategory === 'subzone' &&
                  filterSubzoneOptions.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draftSubzoneIds.has(o.id)}
                        onChange={(e) => {
                          const on = e.target.checked
                          setDraftSubzoneIds((prev) => {
                            const next = new Set(prev)
                            if (on) next.add(o.id)
                            else next.delete(o.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {o.label}
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={clearAllFilterDraft}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={applyFilterSheet}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/30">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}