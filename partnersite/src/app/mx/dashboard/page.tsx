'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '@headlessui/react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext'
import { MerchantStore } from '@/lib/merchantStore'
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord'
import { useApprovedPartnerStores } from '@/hooks/usePartnerResolveSession'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import {
  PARTNER_STORE_OPERATIONS_REFRESH_EVENT,
  type PartnerStoreOperationsRefreshDetail,
  emitPartnerStoreOperationsRefresh,
} from '@/lib/partnerStoreOperationsRefresh'
import { toastStoreOperationsPostFailure, isOutsideOperatingHoursStoreOpsError } from '@/lib/storeOperationsPostFeedback'
import { OutsideOperatingHoursModal } from '@/components/OutsideOperatingHoursModal'
import {
  Power,
  Loader2,
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
  CalendarClock,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Suspense } from 'react'

import { UI_STRINGS, useLocalStoreStatusEngineStore } from '@/lib/localStoreStatusEngineStore'
import { formatCloseReasonForCard } from '@/lib/formatCloseReasonForCard'
import { formatStoreActionSourceLabel } from '@/lib/storeActionSource'

import { MerchantMarketInsightsCard } from '@/components/merchant/MerchantMarketInsightsCard';
import { MerchantWeatherBanner } from '@/components/merchant/MerchantWeatherBanner';
import { LivePreviewInsightsPanel, mapInsightsDatePreset } from '@/components/merchant/LivePreviewInsightsPanel';
import { PartnerDashboardDeliveryCard } from '@/components/merchant/PartnerDashboardDeliveryCard';
import { PartnerSelfDeliveryRidersSheet } from '@/components/merchant/PartnerSelfDeliveryRidersSheet';
import { PartnerDashboardStoreOverviewCard } from '@/components/merchant/PartnerDashboardStoreOverviewCard';
import { PartnerDashboardStoreStatusSkeleton } from '@/components/merchant/PartnerDashboardCardSkeletons';
import {
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS,
} from '@/components/merchant/partner-dashboard-card-styles';
import { BusinessReportsPanel } from '@/components/merchant/BusinessReportsPanel';
import { prefetchBusinessInsights, warmLivePreviewCache } from '@/lib/merchant-growth/growth-insights-cache';
import { warmDashboardWalletCache } from '@/lib/partner-dashboard-cache';
import { createClient } from '@/lib/supabase/client';
import { useMerchantWallet, useStoreOperations, useStoreSettings, useSelfDeliveryRiders, fetchSelfDeliveryRiders } from '@/hooks/useMerchantApi'
import { merchantKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query';
import { PlanExpiredWarningModal } from '@/components/merchant/PlanExpiredWarningModal';
import { shouldShowPlanExpiredWarning } from '@/lib/plan-expired-warning';
import {
  deriveStoreOperationsUiPatch,
  readCachedStoreOpenFromEngine,
  type ActiveRushRow,
  type ScheduledTimeOffRow,
} from '@/lib/applyStoreOperationsResponse';

export const dynamic = 'force-dynamic'

function VerificationLockedCardOverlay({ locked }: { locked: boolean }) {
  if (!locked) return null
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[10px] bg-white/60 backdrop-blur-[3px] ring-1 ring-inset ring-slate-200/60"
      role="presentation"
      aria-hidden
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg">
        <Lock className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-900">Locked</p>
      <p className="mt-0.5 max-w-[11rem] px-2 text-center text-[10px] leading-snug text-slate-600">
        Unlocks after store verification
      </p>
    </div>
  )
}

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

function resolveStoreIdFromUrl(searchStoreId?: string | null): string | null {
  const id = (searchStoreId ?? '').trim()
  if (!id || id.toLowerCase() === DEMO_STORE_ID.toLowerCase()) return null
  return id
}

function resolveStoreIdFromClient(searchStoreId?: string | null): string | null {
  const fromUrl = resolveStoreIdFromUrl(searchStoreId)
  if (fromUrl) return fromUrl
  const fromStorage = (localStorage.getItem('selectedStoreId') ?? '').trim()
  if (!fromStorage || fromStorage.toLowerCase() === DEMO_STORE_ID.toLowerCase()) return null
  return fromStorage
}

function DashboardContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const queriesEnabled = !!storeId
  const { data: storeRecord } = usePartnerStoreRecord(storeId, {
    enabled: queriesEnabled,
  })
  const { approvedStores } = useApprovedPartnerStores()
  const outletList = useMemo(
    () =>
      approvedStores.map((s) => ({
        store_id: String(s.store_id),
        store_name: String(s.store_name || s.store_id || 'Store'),
      })),
    [approvedStores]
  )
  // Store Status & Delivery Mode — card follows GET /api/store-operations (same effective OPEN as dashboard); engine for modals + persistence.
  const engine = useLocalStoreStatusEngineStore()
  const queryClient = useQueryClient()
  const [storeOpsPainted, setStoreOpsPainted] = useState(false)
  const {
    data: storeOpsData,
    refetch: refetchStoreOperations,
    isFetching: storeOpsFetching,
  } = useStoreOperations(storeId, { enabled: queriesEnabled, refetchInterval: false })
  const storeOpsReady = storeOpsPainted || !!storeOpsData
  const boundarySyncInFlightRef = useRef(false)
  const boundarySyncAttemptsRef = useRef(0)
  const [deliveryToggleLoading, setDeliveryToggleLoading] = useState(false)
  const [ridersSheetOpen, setRidersSheetOpen] = useState(false)
  const { data: storeSettingsData, refetch: refetchStoreSettings } = useStoreSettings(storeId, {
    enabled: queriesEnabled,
  })
  const mxDeliveryEnabled = storeSettingsData?.self_delivery === true
  const { data: selfDeliveryRiders = [], isFetching: selfDeliveryRidersLoading, refetch: refetchSelfDeliveryRiders } =
    useSelfDeliveryRiders(storeId, { enabled: queriesEnabled })
  const [isStoreOpen, setIsStoreOpen] = useState(false)
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
  const [licenseBlockedForOps, setLicenseBlockedForOps] = useState(false)
  /** From GET /api/store-operations — close reason line (dashboard parity). */
  const [closeReasonFromOps, setCloseReasonFromOps] = useState<string | null>(null)
  const [schedulePhase, setSchedulePhase] = useState<string | null>(null)
  const [scheduleStatusLabel, setScheduleStatusLabel] = useState<string | null>(null)
  const [isTodayScheduledClosed, setIsTodayScheduledClosed] = useState(false)
  const [configuredTodaySlots, setConfiguredTodaySlots] = useState<{ start: string; end: string }[]>([])
  const [nextScheduleTransitionAt, setNextScheduleTransitionAt] = useState<string | null>(null)
  const [withinOperatingHours, setWithinOperatingHours] = useState<boolean | null>(null)
  const [countdownAt, setCountdownAt] = useState<string | null>(null)
  const [countdownKind, setCountdownKind] = useState<string | null>(null)
  const [countdownWallLabel, setCountdownWallLabel] = useState<string | null>(null)
  const [scheduledTimeOffs, setScheduledTimeOffs] = useState<ScheduledTimeOffRow[]>([])
  const [activeRush, setActiveRush] = useState<ActiveRushRow | null>(null)

  const storeTimeZone = useMemo(() => {
    const tz = (store as { timezone?: string | null } | null)?.timezone
    const t = typeof tz === 'string' ? tz.trim() : ''
    return t !== '' ? t : 'Asia/Kolkata'
  }, [store])

  const closeReasonDisplay = useMemo(() => {
    const r = closeReasonFromOps != null && String(closeReasonFromOps).trim() !== '' ? String(closeReasonFromOps).trim() : null
    return formatCloseReasonForCard(r)
  }, [closeReasonFromOps])

  const cardDisplaySlots = useMemo(() => {
    if (configuredTodaySlots.length > 0) return configuredTodaySlots
    if (todaySlots.length > 0) return todaySlots
    return []
  }, [configuredTodaySlots, todaySlots])

  const cardBreakGapLabel = useMemo(() => {
    if (cardDisplaySlots.length < 2) return null
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return (h ?? 0) * 60 + (m ?? 0)
    }
    const end1 = toMin(cardDisplaySlots[0].end)
    const start2 = toMin(cardDisplaySlots[1].start)
    if (start2 > end1) {
      return `${formatTimeHMS(cardDisplaySlots[0].end)} – ${formatTimeHMS(cardDisplaySlots[1].start)}`
    }
    return null
  }, [cardDisplaySlots])

  /** Prefer server countdown; fallback to opens_at, then next_schedule_transition_at so closed stores always get a target when the API provides one. */
  const activeCountdownAt = countdownAt ?? opensAt ?? nextScheduleTransitionAt ?? null

  const showScheduleCountdown =
    !isStoreOpen && !withinHoursButRestricted && !!activeCountdownAt

  const opensCountdownLabel = useMemo(() => {
    if (countdownKind === 'break_starts_in') return 'Break starts in'
    if (countdownKind === 'reopens_in') return 'Reopens in'
    if (isTodayScheduledClosed || schedulePhase === 'OFF_DAY' || countdownKind === 'next_online_in') {
      return 'Next online in'
    }
    if (schedulePhase === 'BREAK') return 'Reopens in'
    if (schedulePhase === 'PRE_BREAK') return 'Break starts in'
    if (!isStoreOpen && schedulePhase === 'OUTSIDE_HOURS') return 'Opens in'
    if (!isStoreOpen && countdownKind == null && activeCountdownAt) return 'Opens in'
    return 'Opens in'
  }, [countdownKind, isTodayScheduledClosed, schedulePhase, isStoreOpen, activeCountdownAt])

  const countdownSubtitleWallLabel = useMemo(() => {
    if (countdownWallLabel && String(countdownWallLabel).trim() !== '') return countdownWallLabel
    if (!activeCountdownAt) return null
    try {
      return new Date(activeCountdownAt).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return null
    }
  }, [countdownWallLabel, activeCountdownAt])

  const formatHmsCountdown = React.useCallback((ms: number) => {
    if (ms <= 0) return '00:00:00'
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  const formatScheduledTimeOffWindow = React.useCallback(
    (startsAt: string, endsAt: string) => {
      try {
        const s = new Date(startsAt)
        const e = new Date(endsAt)
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
          return { primary: `${startsAt} – ${endsAt}`, secondary: null as string | null }
        }
        const dOpts: Intl.DateTimeFormatOptions = {
          timeZone: storeTimeZone,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }
        const tOpts: Intl.DateTimeFormatOptions = {
          timeZone: storeTimeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }
        const d1 = s.toLocaleDateString('en-IN', dOpts)
        const d2 = e.toLocaleDateString('en-IN', dOpts)
        const t1 = s.toLocaleTimeString('en-IN', tOpts)
        const t2 = e.toLocaleTimeString('en-IN', tOpts)
        if (d1 === d2) return { primary: d1, secondary: `${t1} – ${t2}` }
        return { primary: `${d1}, ${t1} → ${d2}, ${t2}`, secondary: null }
      } catch {
        return { primary: `${startsAt} – ${endsAt}`, secondary: null }
      }
    },
    [storeTimeZone]
  )

  const storeStatusBadge = useMemo(() => {
    if (scheduledTimeOffs.some((x) => x.phase === 'active')) {
      return {
        label: 'Sheduled-off Active',
        dot: 'bg-rose-600',
        pill: 'bg-rose-500/10 text-rose-950 ring-1 ring-rose-500/25',
      }
    }
    if (isTodayScheduledClosed || schedulePhase === 'OFF_DAY') {
      return {
        label: 'Scheduled Off',
        dot: 'bg-slate-500',
        pill: 'bg-slate-500/10 text-slate-800 ring-1 ring-slate-500/20',
      }
    }
    if (restrictionType === 'MANUAL_HOLD') {
      return {
        label: 'Waiting manual activation',
        dot: 'bg-amber-500',
        pill: 'bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25',
      }
    }
    if (schedulePhase === 'BREAK' || (!isStoreOpen && countdownKind === 'reopens_in')) {
      return {
        label: 'Break Time',
        dot: 'bg-amber-500',
        pill: 'bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25',
      }
    }
    if (schedulePhase === 'PRE_BREAK' || countdownKind === 'break_starts_in') {
      return {
        label: 'Open',
        dot: 'bg-emerald-500 animate-pulse',
        pill: 'bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20',
      }
    }
    if (isStoreOpen) {
      const hasUpcoming = scheduledTimeOffs.some((x) => x.phase === 'upcoming')
      return {
        label: hasUpcoming ? 'Open ' : 'Open',
        dot: 'bg-emerald-500 animate-pulse',
        pill: hasUpcoming
          ? 'bg-emerald-500/10 text-emerald-900 ring-1 ring-amber-400/50'
          : 'bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20',
      }
    }
    return {
      label: 'Closed',
      dot: 'bg-red-500',
      pill: 'bg-red-500/10 text-red-800 ring-1 ring-red-500/20',
    }
  }, [
    scheduledTimeOffs,
    isTodayScheduledClosed,
    schedulePhase,
    restrictionType,
    isStoreOpen,
    countdownKind,
  ])

  /** Earliest upcoming scheduled time-off start (relative to now), live via countdownTick */
  const showScheduledOffStartsCountdown =
    isStoreOpen &&
    !scheduledTimeOffs.some((x) => x.phase === 'active') &&
    scheduledTimeOffs.some((x) => x.phase === 'upcoming')

  const scheduledOffStartsInMs = useMemo(() => {
    void countdownTick
    let bestTs: number | null = null
    const now = Date.now()
    for (const row of scheduledTimeOffs) {
      if (row.phase !== 'upcoming') continue
      const t = new Date(row.starts_at).getTime()
      if (Number.isNaN(t) || t <= now) continue
      if (bestTs === null || t < bestTs) bestTs = t
    }
    return bestTs == null ? null : bestTs - now
  }, [scheduledTimeOffs, countdownTick])

  // Store close: popup modal (no in-card expansion)
  const [showClosePopup, setShowClosePopup] = useState(false)
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false)
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null)
  const [closureDate, setClosureDate] = useState<string>('')
  const [closureTime, setClosureTime] = useState<string>('12:00')
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false)
  const [showOutsideHoursModal, setShowOutsideHoursModal] = useState(false)
  const [toggleOnLoading, setToggleOnLoading] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: '', reason: '' })
  /** After status modal is dismissed, show under-verification marquee until store is approved. */
  const [statusNoticeDismissed, setStatusNoticeDismissed] = useState(false)
  const statusNoticeDismissedRef = useRef(false)
  // Manual close: reason is mandatory
  const [closeReason, setCloseReason] = useState<string>('')
  const [closeReasonOther, setCloseReasonOther] = useState<string>('')
  const [statusLog, setStatusLog] = useState<{ id: string | number; action: string; action_field?: string | null; restriction_type?: string | null; close_reason?: string | null; performed_by_name: string | null; performed_by_id: string | number | null; performed_by_email: string | null; created_at: string; type?: 'status' | 'settings' }[]>([])

  const { data: walletData, isPending: walletPending } = useMerchantWallet(storeId, {
    enabled: queriesEnabled,
    lite: true,
  })

  const [showPlanExpiredWarning, setShowPlanExpiredWarning] = useState(false)
  const [expiredPlanMeta, setExpiredPlanMeta] = useState<{
    planName?: string
    expiredAt?: string | null
    subscriptionId?: number | string | null
    autoRenew?: boolean
  }>({})

  /** Approved outlets (same source as sidebar) for quick switch + filter sheet */
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedStoreId', id)
        void import('@/lib/partner-selected-store').then((m) => m.notifyPartnerSelectedStoreChanged(id))
      }
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('storeId', id)
      const base = pathname || '/mx/dashboard'
      router.push(`${base.split('?')[0]}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

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

  // Resolve store id after mount (localStorage is client-only — keeps SSR/client HTML in sync).
  useEffect(() => {
    const id = resolveStoreIdFromClient(searchParams?.get('storeId'))
    setStoreId(id)
    if (id) {
      localStorage.setItem('selectedStoreId', id)
      void import('@/lib/partner-selected-store').then((m) => m.notifyPartnerSelectedStoreChanged(id))
    }
  }, [searchParams])

  useEffect(() => {
    if (!storeId) return
    warmDashboardWalletCache(storeId)
    warmLivePreviewCache(storeId, mapInsightsDatePreset(appliedDatePreset))
  }, [storeId, appliedDatePreset])

  useEffect(() => {
    if (!storeId || insightsTab !== 'reports') return
    const period = mapInsightsDatePreset(appliedDatePreset)
    void prefetchBusinessInsights(storeId, period === 'today' ? 'week' : period)
  }, [storeId, appliedDatePreset, insightsTab])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    void fetch(`/api/merchant/subscription?storeId=${encodeURIComponent(storeId)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const expiredSub = data.expiredSubscription as Record<string, unknown> | null | undefined
        const plan = (data.plan ?? expiredSub?.merchant_plans) as { plan_name?: string; price?: number } | null
        const subscriptionId = expiredSub?.id as number | string | undefined
        const autoRenew = Boolean(expiredSub?.auto_renew)
        const expiredAt = String(expiredSub?.billing_end_at ?? expiredSub?.expiry_date ?? '')
        if (
          shouldShowPlanExpiredWarning({
            storeId,
            isActive: data.isActive === true,
            isExpired: data.isExpired === true,
            autoRenew,
            planPrice: Number(plan?.price ?? 0),
            subscriptionId,
          })
        ) {
          setExpiredPlanMeta({
            planName: plan?.plan_name,
            expiredAt: expiredAt || null,
            subscriptionId,
            autoRenew,
          })
          setShowPlanExpiredWarning(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [storeId])

  // Sync store record from shared cache
  useEffect(() => {
    if (!storeRecord) return

    if ((storeRecord as { notFound?: boolean }).notFound) {
      setStore(null)
      toast.error('Your store is not in our database. Please check your registration or contact support.')
      return
    }

    setStore(storeRecord)
    const approval = String(storeRecord.approval_status || '').toUpperCase()
    if (approval === 'APPROVED') {
      setShowStatusModal(false)
      setStatusNoticeDismissed(false)
      statusNoticeDismissedRef.current = false
      return
    }
    if (!approval) return
    setModalStatus({
      status: storeRecord.approval_status ?? '',
      reason: storeRecord.approval_reason ?? '',
    })
    // Do not re-open modal / wipe dismissed flag on every storeRecord refresh.
    if (statusNoticeDismissedRef.current) {
      setShowStatusModal(false)
      setStatusNoticeDismissed(true)
      return
    }
    setShowStatusModal(true)
  }, [storeRecord])

  // Instant paint from last-known local status while network fetch runs.
  useEffect(() => {
    if (!storeId) {
      setStoreOpsPainted(false)
      return
    }
    useLocalStoreStatusEngineStore.getState().hydrate(storeId)
    const cachedOpen = readCachedStoreOpenFromEngine(storeId)
    if (cachedOpen !== null) {
      setIsStoreOpen(cachedOpen)
      setStoreOpsPainted(true)
    }
  }, [storeId])

  useEffect(() => {
    if (storeOpsData) setStoreOpsPainted(true)
  }, [storeOpsData])

  useEffect(() => {
    if (!storeOpsData) return
    const patch = deriveStoreOperationsUiPatch(storeOpsData)
    setIsStoreOpen(patch.isStoreOpen)
    setOpensAt(patch.opensAt)
    setTodaySlots(patch.todaySlots)
    setOpeningTime(patch.openingTime)
    setClosingTime(patch.closingTime)
    setSchedulePhase(patch.schedulePhase)
    setWithinOperatingHours(patch.withinOperatingHours)
    setScheduleStatusLabel(patch.scheduleStatusLabel)
    setIsTodayScheduledClosed(patch.isTodayScheduledClosed)
    setConfiguredTodaySlots(patch.configuredTodaySlots)
    setLastToggleBy(patch.lastToggleBy)
    setLastToggleType(patch.lastToggleType)
    setLastToggledByName(patch.lastToggledByName)
    setLastToggledById(patch.lastToggledById)
    setRestrictionType(patch.restrictionType)
    setWithinHoursButRestricted(patch.withinHoursButRestricted)
    setLastToggledAt(patch.lastToggledAt)
    setManualActivationLock(patch.manualActivationLock)
    setLicenseBlockedForOps(patch.licenseBlockedForOps)
    setCloseReasonFromOps(patch.closeReasonFromOps)
    setNextScheduleTransitionAt(patch.nextScheduleTransitionAt)
    setCountdownAt(patch.countdownAt)
    setCountdownKind(patch.countdownKind)
    setCountdownWallLabel(patch.countdownWallLabel)
    setScheduledTimeOffs(patch.scheduledTimeOffs)
    setActiveRush(patch.activeRush)
    setStoreOpsPainted(true)
  }, [storeOpsData])

  const fetchStoreOperations = React.useCallback(async () => {
    if (!storeId) return
    await refetchStoreOperations()
  }, [storeId, refetchStoreOperations])

  // Skip self-emitted refresh events from forceStoreOperationsSync (already refetched).
  const skipRefreshEventRef = useRef(false)

  /** Hard refresh at schedule boundaries — invalidate + refetch so countdown 0 flips Open without a page reload. */
  const forceStoreOperationsSync = React.useCallback(async () => {
    if (!storeId) return
    await queryClient.invalidateQueries({ queryKey: merchantKeys.storeOperations(storeId) })
    await queryClient.refetchQueries({
      queryKey: merchantKeys.storeOperations(storeId),
      type: 'active',
    })
    // Keep header Offline/Online chip in sync; skip our own listener (already refetched).
    skipRefreshEventRef.current = true
    emitPartnerStoreOperationsRefresh(storeId)
    queueMicrotask(() => {
      skipRefreshEventRef.current = false
    })
  }, [storeId, queryClient])

  // Header / schedule sheet updates store-operations fetch there first — mirror here without reload.
  useEffect(() => {
    if (!storeId || typeof window === 'undefined') return
    const onRefresh = (ev: Event) => {
      if (skipRefreshEventRef.current) return
      const ce = ev as CustomEvent<PartnerStoreOperationsRefreshDetail>
      const sid = ce.detail?.storeId
      if (sid && sid === storeId) void fetchStoreOperations()
    }
    window.addEventListener(PARTNER_STORE_OPERATIONS_REFRESH_EVENT, onRefresh as EventListener)
    return () => window.removeEventListener(PARTNER_STORE_OPERATIONS_REFRESH_EVENT, onRefresh as EventListener)
  }, [storeId, fetchStoreOperations])

  // Poll store-operations: faster near slot/break boundaries (including just after one passes,
  // so the store flips OPEN/CLOSED on its own without a manual refresh), otherwise every 30s.
  useEffect(() => {
    if (!storeId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const boundaryIso = activeCountdownAt ?? nextScheduleTransitionAt
    const nextDelay = () => {
      const transitionMs = boundaryIso
        ? new Date(boundaryIso).getTime() - Date.now()
        : null
      // Near boundary: approaching OR just past (tab backgrounded / slow GET).
      const nearBoundary = transitionMs != null && transitionMs > -120_000 && transitionMs <= 120_000
      // When already past due, poll every 2s until status catches up.
      if (transitionMs != null && transitionMs <= 0 && transitionMs > -120_000) return 2_000
      return nearBoundary ? Math.max(2_000, Math.min(Math.max(transitionMs!, 0) + 250, 8_000)) : 30_000
    }
    const schedulePoll = () => {
      void refetchStoreOperations().finally(() => {
        timer = setTimeout(schedulePoll, nextDelay())
      })
    }
    // If already past the open time, sync immediately (don't wait for nextDelay).
    const firstDelay =
      boundaryIso && new Date(boundaryIso).getTime() - Date.now() <= 0 ? 0 : nextDelay()
    timer = setTimeout(schedulePoll, firstDelay)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [storeId, refetchStoreOperations, nextScheduleTransitionAt, activeCountdownAt])

  // Exact timer: fire at opens_at / transition (±250ms) so we don't sit on 00:00:00 waiting for a 30s poll.
  useEffect(() => {
    if (!storeId || !activeCountdownAt || isStoreOpen) {
      boundarySyncAttemptsRef.current = 0
      return
    }
    const targetMs = new Date(activeCountdownAt).getTime()
    if (Number.isNaN(targetMs)) return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const runSyncBurst = async () => {
      if (cancelled || boundarySyncInFlightRef.current) return
      if (boundarySyncAttemptsRef.current >= 8) return
      boundarySyncInFlightRef.current = true
      boundarySyncAttemptsRef.current += 1
      try {
        await forceStoreOperationsSync()
      } catch {
        /* ignore — retries below */
      } finally {
        boundarySyncInFlightRef.current = false
      }
    }

    const msUntil = targetMs - Date.now()
    if (msUntil > 0) {
      // Wake ~250ms after the scheduled open so server wall-clock is inside the slot.
      timers.push(setTimeout(() => void runSyncBurst(), msUntil + 250))
      // Also nudge just before so GET is already in flight when the second hits.
      if (msUntil > 1_500) {
        timers.push(setTimeout(() => void runSyncBurst(), Math.max(0, msUntil - 400)))
      }
    } else if (msUntil > -120_000) {
      // Already past due (e.g. 00:00:00 stuck) — sync now + short retries.
      void runSyncBurst()
      timers.push(setTimeout(() => void runSyncBurst(), 1_500))
      timers.push(setTimeout(() => void runSyncBurst(), 3_500))
      timers.push(setTimeout(() => void runSyncBurst(), 7_000))
    }

    return () => {
      cancelled = true
      for (const t of timers) clearTimeout(t)
    }
  }, [storeId, activeCountdownAt, isStoreOpen, forceStoreOperationsSync])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_store_operating_hours', filter: `store_id=eq.${storeInternalId}` }, () => { fetchStoreOperations() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_store_scheduled_closures', filter: `store_id=eq.${storeInternalId}` }, () => { fetchStoreOperations() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_store_holidays', filter: `store_id=eq.${storeInternalId}` }, () => { fetchStoreOperations() })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [storeInternalId, storeId, fetchStoreOperations])

  // Live countdown: 1s tick for closed-store opens/break countdown + badge countdown until scheduled time-off starts
  useEffect(() => {
    const needClosedCountdown = showScheduleCountdown && !!activeCountdownAt
    const needsUpcomingScheduledOffTick =
      isStoreOpen &&
      !scheduledTimeOffs.some((x) => x.phase === 'active') &&
      scheduledTimeOffs.some((x) => x.phase === 'upcoming')
    if (!needClosedCountdown && !needsUpcomingScheduledOffTick) return
    let hitZeroSync = false
    const t = setInterval(() => {
      if (needClosedCountdown && activeCountdownAt) {
        const ms = new Date(activeCountdownAt).getTime() - Date.now()
        if (ms <= 0) {
          if (!hitZeroSync) {
            hitZeroSync = true
            void forceStoreOperationsSync()
          }
          setCountdownTick((n) => n + 1)
          return
        }
        hitZeroSync = false
      }
      if (needsUpcomingScheduledOffTick) {
        const now = Date.now()
        let best: number | null = null
        for (const row of scheduledTimeOffs) {
          if (row.phase !== 'upcoming') continue
          const st = new Date(row.starts_at).getTime()
          if (Number.isNaN(st) || st <= now) continue
          if (best === null || st < best) best = st
        }
        if (best === null || best <= now) void forceStoreOperationsSync()
      }
      setCountdownTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [showScheduleCountdown, activeCountdownAt, forceStoreOperationsSync, isStoreOpen, scheduledTimeOffs])

  // Re-sync when store shows OPEN but schedule says outside hours (break / before slot),
  // OR stuck CLOSED while still within today's operating hours (auto-open lag),
  // OR countdown already elapsed (00:00:00) but card still Closed.
  useEffect(() => {
    const countdownPastDue =
      !isStoreOpen &&
      !!activeCountdownAt &&
      !Number.isNaN(new Date(activeCountdownAt).getTime()) &&
      new Date(activeCountdownAt).getTime() <= Date.now()
    const needsScheduleSync =
      (isStoreOpen &&
        (withinOperatingHours === false ||
          schedulePhase === 'BREAK' ||
          schedulePhase === 'PRE_BREAK' ||
          schedulePhase === 'OUTSIDE_HOURS')) ||
      (!isStoreOpen &&
        withinOperatingHours === true &&
        schedulePhase === 'WITHIN_SLOT' &&
        !manualActivationLock) ||
      countdownPastDue
    if (!needsScheduleSync) return
    const pollMs =
      countdownPastDue || schedulePhase === 'BREAK' || (!isStoreOpen && withinOperatingHours)
        ? 2_000
        : 15_000
    const t = setInterval(() => {
      void forceStoreOperationsSync()
    }, pollMs)
    // Kick once immediately when past due / stuck closed.
    if (countdownPastDue || (!isStoreOpen && withinOperatingHours === true)) {
      void forceStoreOperationsSync()
    }
    return () => clearInterval(t)
  }, [
    isStoreOpen,
    withinOperatingHours,
    schedulePhase,
    forceStoreOperationsSync,
    manualActivationLock,
    activeCountdownAt,
  ])

  // Delivery mode stays in sync via useStoreSettings (refetches on focus / mount).

  // Save manual activation lock to database
  const saveManualActivationLock = React.useCallback(async (enabled: boolean) => {
    if (!storeId) return;
    if (licenseBlockedForOps) {
      toast.error(
        'Manual activation lock cannot be changed while the store is closed due to an expired licence. Upload and verify your licence first.'
      );
      return;
    }
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
  }, [storeId, fetchStoreOperations, licenseBlockedForOps]);

  // Audit log lines for store card (e.g. last close reason)
  useEffect(() => {
    if (!storeId) return
    fetch(`/api/merchant/audit-logs?storeId=${encodeURIComponent(storeId)}&limit=30`)
      .then((res) => res.json())
      .then((data) => { if (data.logs) setStatusLog(data.logs); })
      .catch(() => setStatusLog([]))
  }, [storeId, isStoreOpen])

  // Status Modal Component
  const dismissStatusModal = () => {
    statusNoticeDismissedRef.current = true
    setShowStatusModal(false)
    setStatusNoticeDismissed(true)
  }

  const approvalStatusUpper = String(store?.approval_status || modalStatus.status || '').toUpperCase()
  const opsCardsLockedUntilVerified =
    !!approvalStatusUpper && approvalStatusUpper !== 'APPROVED' && approvalStatusUpper !== 'DRAFT'

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
        onClose={dismissStatusModal} 
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="relative mx-auto max-w-md rounded-2xl bg-white/95 backdrop-blur-md p-8 shadow-2xl border border-gray-200">
            <button
              type="button"
              onClick={dismissStatusModal}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2} />
            </button>
            {/* Store Status Title with Color */}
            <Dialog.Title className={`text-2xl font-bold mb-4 pr-8 ${getStatusColor()}`}>
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
              type="button"
              onClick={dismissStatusModal}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
            >
              Got It
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    )
  }

  const handleStoreToggle = () => {
    const approval = String(store?.approval_status || '').toUpperCase()
    if (approval !== 'APPROVED') {
      toast.error('Store status is locked until your store is verified.')
      return
    }
    if (!isStoreOpen && isTodayScheduledClosed) {
      toast.error('Today is scheduled closed. Update Outlet Timings to open on this day.')
      return
    }
    if (!isStoreOpen && withinOperatingHours === false) {
      setShowOutsideHoursModal(true)
      return
    }
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
        if (isOutsideOperatingHoursStoreOpsError(data)) {
          setShowToggleOnWarning(false)
          setShowOutsideHoursModal(true)
        } else {
          toastStoreOperationsPostFailure(res, data, 'Failed to open store')
        }
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

  const patchDeliveryMode = React.useCallback(
    async (selfDelivery: boolean) => {
      if (!storeId) return false
      const res = await fetch('/api/merchant/store-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          self_delivery: selfDelivery,
          platform_delivery: !selfDelivery,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        toast.error(data.error || 'Failed to update delivery mode')
        return false
      }
      await queryClient.invalidateQueries({ queryKey: merchantKeys.storeSettings(storeId) })
      void refetchStoreSettings()
      return true
    },
    [storeId, queryClient, refetchStoreSettings],
  )

  const handleMXDeliveryToggle = async () => {
    if (deliveryToggleLoading || opsCardsLockedUntilVerified) return

    if (mxDeliveryEnabled) {
      setDeliveryToggleLoading(true)
      try {
        const ok = await patchDeliveryMode(false)
        if (ok) toast.success('GatiMitra delivery enabled')
      } finally {
        setDeliveryToggleLoading(false)
      }
      return
    }

    setDeliveryToggleLoading(true)
    try {
      let riders = selfDeliveryRiders
      if (storeId) {
        riders = await queryClient.fetchQuery({
          queryKey: merchantKeys.selfDeliveryRiders(storeId),
          queryFn: () => fetchSelfDeliveryRiders(storeId),
        })
      }

      if (riders.length === 0) {
        toast.error('Please add rider first, then turn on toggle')
        return
      }

      const hasActiveRider = riders.some((r) => r.is_active !== false)
      if (!hasActiveRider) {
        toast.error('Please activate a rider first, then turn on toggle')
        return
      }

      const ok = await patchDeliveryMode(true)
      if (ok) toast.success('Self delivery enabled')
    } finally {
      setDeliveryToggleLoading(false)
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
                  onClick={async () => {
                    if (!storeId) return
                    engine.closeScheduleEndModal()
                    const res = await fetch('/api/store-operations', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ store_id: storeId, action: 'schedule_end_stay_online' }),
                    })
                    if (res.ok) await fetchStoreOperations()
                    else toast.error('Could not keep store online')
                  }}
                >
                  Stay Online
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                  onClick={async () => {
                    if (!storeId) return
                    engine.closeScheduleEndModal()
                    const res = await fetch('/api/store-operations', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ store_id: storeId, action: 'schedule_end_go_offline' }),
                    })
                    if (res.ok) await fetchStoreOperations()
                    else toast.error('Could not close store')
                  }}
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
      <OutsideOperatingHoursModal
        open={showOutsideHoursModal}
        onClose={() => setShowOutsideHoursModal(false)}
        storeId={storeId}
      />
      <MXLayoutWhite
        restaurantName={store?.store_name || 'Dashboard'}
        restaurantId={storeId || ''}
      >
        <PartnerPageHeader title="Dashboard" subtitle="GatiMitra · Operations command center" />
        {(() => {
          const approval = String(store?.approval_status || modalStatus.status || '').toUpperCase()
          const showMarquee =
            statusNoticeDismissed &&
            !showStatusModal &&
            approval !== 'APPROVED' &&
            approval !== '' &&
            approval !== 'DRAFT'
          if (!showMarquee) return null
          const marqueeText =
            approval === 'REJECTED'
              ? 'Store registration rejected — online/offline controls stay locked until you fix and get verified.'
              : 'Under verification — our team is reviewing your store. Online/offline controls stay locked until verified.'
          return (
            <div
              className="shrink-0 overflow-hidden border-b border-amber-200 bg-amber-50 py-2"
              role="status"
              aria-live="polite"
            >
              <div className="flex w-max animate-store-closed-marquee">
                {[0, 1].map((copy) => (
                  <span
                    key={copy}
                    className="shrink-0 px-6 text-xs sm:text-sm font-semibold text-amber-950 whitespace-nowrap"
                    aria-hidden={copy === 1}
                  >
                    {marqueeText} · {marqueeText} ·{' '}
                  </span>
                ))}
              </div>
            </div>
          )
        })()}
        <MerchantWeatherBanner storeId={storeId} />
        <div className="bg-[#f8fafc] w-full">
          <div className="px-3 sm:px-5 lg:px-8 pt-3 sm:pt-4 pb-4">
            <div className="max-w-[1600px] mx-auto">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch pb-1">
                {/* Store status — primary card (reference layout) */}
                <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                  {!storeId || (!storeOpsReady && storeOpsFetching) ? (
                    <PartnerDashboardStoreStatusSkeleton />
                  ) : (
                  <div
                    className={`${PARTNER_DASHBOARD_TOP_CARD_CLASS} ${
                      isStoreOpen
                        ? 'border-emerald-200/70'
                        : restrictionType === 'MANUAL_HOLD'
                          ? 'border-amber-200/70'
                          : 'border-red-200/70'
                    }`}
                  >
                    <VerificationLockedCardOverlay locked={opsCardsLockedUntilVerified} />
                    <>
                    <div className="flex items-start justify-between gap-2 shrink-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
                            <Store className="h-[16px] w-[16px]" strokeWidth={2} />
                          </span>
                          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Store status</h2>
                          <span
                            className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${storeStatusBadge.pill}`}
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${storeStatusBadge.dot}`} />
                              <span className="min-w-0">{storeStatusBadge.label}</span>
                            </span>
                            {showScheduledOffStartsCountdown && scheduledOffStartsInMs != null ? (
                              <span
                                className="inline-flex shrink-0 items-center border-l border-current/20 pl-2 tabular-nums text-[10px] font-semibold opacity-95"
                                aria-live="polite"
                              >
                                {scheduledOffStartsInMs <= 0
                                  ? 'Starting soon'
                                  : `Starts in ${formatHmsCountdown(scheduledOffStartsInMs)}`}
                              </span>
                            ) : null}
                          </span>
                        </div>
                        {cardDisplaySlots.length === 0 ? (
                          <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
                            <p className="text-sm font-semibold text-slate-500">—</p>
                          </div>
                        ) : cardDisplaySlots.length === 1 ? (
                          <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
                            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 mb-0.5">
                              Today&apos;s hours
                            </p>
                            <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums leading-tight tracking-tight">
                              {formatTimeHMS(cardDisplaySlots[0].start)} – {formatTimeHMS(cardDisplaySlots[0].end)}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-1 space-y-1">
                            {cardDisplaySlots.map((slot, idx) => (
                              <div
                                key={`${slot.start}-${slot.end}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-md bg-slate-50/90 px-2 py-1 ring-1 ring-slate-200/70"
                              >
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 shrink-0">
                                  {idx === 0 ? 'Slot 1' : 'Slot 2'}
                                </span>
                                <span className="text-[11px] font-semibold tabular-nums text-slate-900 text-right">
                                  {formatTimeHMS(slot.start)} – {formatTimeHMS(slot.end)}
                                </span>
                              </div>
                            ))}
                            {cardBreakGapLabel && (
                              <p className="text-[9px] font-medium text-amber-700 pl-0.5">
                                Break {cardBreakGapLabel}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleStoreToggle}
                        disabled={String(store?.approval_status || '').toUpperCase() !== 'APPROVED'}
                        title={
                          String(store?.approval_status || '').toUpperCase() !== 'APPROVED'
                            ? 'Available after store is verified'
                            : undefined
                        }
                        className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 ${
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
                    <div className="flex flex-col gap-1.5 mt-2">
                      {scheduledTimeOffs.length > 0 && (
                        <div className="rounded-lg bg-amber-50/95 px-2.5 py-2 ring-1 ring-amber-200/80">
                          <div className="flex items-start gap-2">
                            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950">
                                Scheduled time-off
                              </p>
                              <ul className="mt-1.5 space-y-1.5">
                                {scheduledTimeOffs.map((row) => {
                                  const { primary, secondary } = formatScheduledTimeOffWindow(
                                    row.starts_at,
                                    row.ends_at
                                  )
                                  return (
                                    <li key={row.id} className="text-[11px] leading-snug text-amber-950">
                                      <span
                                        className={`font-semibold ${
                                          row.phase === 'active' ? 'text-rose-800' : 'text-amber-900'
                                        }`}
                                      >
                                        {row.phase === 'active' ? 'Active' : 'Upcoming'}
                                      </span>
                                      <span className="text-amber-950/90">
                                        {' '}
                                        · {primary}
                                        {secondary ? ` · ${secondary}` : ''}
                                        {row.reason ? ` · ${row.reason}` : ''}
                                        {row.marked_from
                                          ? ` · via ${formatStoreActionSourceLabel(row.marked_from) ?? row.marked_from}`
                                          : ''}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      {activeRush && activeRush.remaining_minutes > 0 && (
                        <div className="rounded-lg bg-orange-50/95 px-2.5 py-2 ring-1 ring-orange-200/80">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-950">Rush hour</p>
                          <p className="mt-1 text-[11px] leading-snug text-orange-950">
                            <span className="font-semibold text-orange-900">Active</span>
                            <span className="text-orange-950/90">
                              {' '}
                              · ~{activeRush.remaining_minutes} min left
                              {activeRush.marked_from
                                ? ` · via ${formatStoreActionSourceLabel(activeRush.marked_from) ?? activeRush.marked_from}`
                                : ''}
                            </span>
                          </p>
                        </div>
                      )}
                      {!isTodayScheduledClosed && scheduleStatusLabel && !isStoreOpen && schedulePhase !== 'BREAK' && (
                        <p className="text-[10px] font-medium text-slate-500">{scheduleStatusLabel}</p>
                      )}
                      {showScheduleCountdown && activeCountdownAt && (() => {
                        void countdownTick
                        const ms = new Date(activeCountdownAt).getTime() - Date.now()
                        const countdownText = formatHmsCountdown(ms)
                        const isPreBreak =
                          countdownKind === 'break_starts_in' || schedulePhase === 'PRE_BREAK'
                        const boxClass = isPreBreak
                          ? 'rounded-lg bg-amber-50/90 px-2.5 py-2 ring-1 ring-amber-200/80'
                          : 'rounded-lg bg-red-50/90 px-2.5 py-2 ring-1 ring-red-200/80'
                        const textClass = isPreBreak ? 'text-amber-900' : 'text-red-800'
                        const subClass = isPreBreak ? 'text-amber-700/90' : 'text-red-600/90'
                        const dotClass = isPreBreak ? 'text-amber-400/90' : 'text-red-400/90'
                        return (
                          <div className={boxClass}>
                            <p className={`flex flex-nowrap items-center gap-x-2 text-[11px] ${textClass} leading-snug`}>
                              <span className="font-semibold shrink-0 whitespace-nowrap">
                                {opensCountdownLabel}{' '}
                                <span className="tabular-nums">{countdownText}</span>
                              </span>
                              {countdownSubtitleWallLabel && ms > 0 && (
                                <>
                                  <span className={`${dotClass} shrink-0`} aria-hidden>
                                    ·
                                  </span>
                                  <span className={`text-[10px] font-medium whitespace-nowrap ${subClass}`}>
                                    {countdownKind === 'reopens_in' || schedulePhase === 'BREAK'
                                      ? `Next slot at ${countdownSubtitleWallLabel}`
                                      : `At ${countdownSubtitleWallLabel}`}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        )
                      })()}
                      {!isStoreOpen && closeReasonDisplay && (
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-3" title={closeReasonDisplay}>
                          <span className="font-semibold text-slate-700">Close reason: </span>
                          {closeReasonDisplay}
                        </p>
                      )}
                      {(lastToggledByName || lastToggleBy || lastToggleType) && lastToggledAt && (
                        <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 mb-0.5">
                            Last activity
                          </p>
                          <p className="text-[11px] text-slate-600 leading-snug">
                            {(() => {
                              const typeUp = String(lastToggleType || '').toUpperCase()
                              const toggledAtDate = new Date(lastToggledAt)
                              const timeStr = toggledAtDate.toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true,
                              })
                              const dateStr = toggledAtDate.toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                              const email = lastToggleBy || ''
                              const emailNorm = String(email).toLowerCase()
                              const isGatiMitraAgent =
                                emailNorm.includes('gatimitra') || emailNorm.endsWith('@gatimitra.in') || emailNorm.endsWith('@gatimitra.com')
                              if (typeUp.startsWith('AUTO')) {
                                return `${isStoreOpen ? 'Auto on' : 'Auto closed'} · ${timeStr} · ${dateStr}`
                              }
                              if (isGatiMitraAgent) {
                                return `${isStoreOpen ? 'Opened' : 'Closed'} by GatiMitra (agent: ${email || 'unknown'}) · ${timeStr} · ${dateStr}`
                              }
                              const who = lastToggledByName || lastToggleBy || 'Owner'
                              return `${isStoreOpen ? 'Opened' : 'Closed'} by ${who}${storeId ? ` (ID: ${storeId})` : ''} · ${timeStr} · ${dateStr}`
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 shrink-0">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-800">Manual activation lock</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                          {licenseBlockedForOps
                            ? 'Locked while licence is expired — upload & verify first'
                            : 'Prevents automatic opening'}
                        </p>
                      </div>
                      <label
                        className={`relative inline-flex shrink-0 items-center ${
                          licenseBlockedForOps ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                        }`}
                        title={
                          licenseBlockedForOps
                            ? 'Cannot change while store is closed due to expired licence'
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={manualActivationLock}
                          disabled={licenseBlockedForOps}
                          onChange={async (e) => {
                            if (licenseBlockedForOps) return;
                            const newValue = e.target.checked
                            setManualActivationLock(newValue)
                            await saveManualActivationLock(newValue)
                          }}
                          className="peer sr-only"
                        />
                        <div className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:border after:border-slate-200/80 after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-checked:bg-red-600 peer-checked:after:translate-x-[22px]" />
                      </label>
                    </div>
                    </>
                  </div>
                  )}
                </section>

                <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                  <PartnerDashboardDeliveryCard
                    storeId={storeId}
                    mxDeliveryEnabled={mxDeliveryEnabled}
                    toggleLoading={deliveryToggleLoading}
                    showViewRiders={mxDeliveryEnabled && selfDeliveryRiders.length > 0}
                    onViewRiders={() => {
                      void refetchSelfDeliveryRiders()
                      setRidersSheetOpen(true)
                    }}
                    onToggle={handleMXDeliveryToggle}
                    locked={opsCardsLockedUntilVerified}
                    overlay={<VerificationLockedCardOverlay locked={opsCardsLockedUntilVerified} />}
                  />
                </section>

                <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                  <PartnerDashboardStoreOverviewCard
                    storeId={storeId}
                    wallet={walletData ?? null}
                    walletLoading={walletPending && !walletData}
                  />
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

                {insightsTab === 'live' ? (
                  <LivePreviewInsightsPanel
                    storeId={storeId}
                    periodPreset={appliedDatePreset}
                  />
                ) : null}

                {insightsTab === 'reports' ? (
                  <BusinessReportsPanel
                    storeId={storeId}
                    periodPreset={appliedDatePreset}
                    subview={reportsSubview}
                    enabled
                  />
                ) : null}

              </div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>

      {storeId ? (
        <PlanExpiredWarningModal
          open={showPlanExpiredWarning}
          onClose={() => setShowPlanExpiredWarning(false)}
          storeId={storeId}
          subscriptionId={expiredPlanMeta.subscriptionId}
          planName={expiredPlanMeta.planName}
          expiredAt={expiredPlanMeta.expiredAt}
        />
      ) : null}

      <PartnerSelfDeliveryRidersSheet
        open={ridersSheetOpen}
        onClose={() => setRidersSheetOpen(false)}
        riders={selfDeliveryRiders}
        loading={selfDeliveryRidersLoading}
        storeName={store?.store_name ?? undefined}
      />

      {filterSheetOpen &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => setFilterSheetOpen(false)}
          />
          <aside
            className="relative flex h-dvh min-h-0 w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mx-filter-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
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
          </aside>
        </div>,
        document.body,
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