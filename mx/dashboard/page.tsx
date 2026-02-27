'use client'

import React, { useState, useEffect } from 'react'
import { Dialog } from '@headlessui/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import {
  Power,
  Truck,
  Clock,
  AlertCircle,
  BarChart3,
  Package,
  TrendingUp,
  Users,
  Monitor,
  Smartphone,
  Activity,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  SlidersHorizontal,
  ChevronUp,
  Wallet,
  IndianRupee
} from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Legend
} from 'recharts'
import { Toaster, toast } from 'sonner'
import { Suspense } from 'react'


import { useMerchantSession } from '@/context/MerchantSessionContext';
import { PageSkeletonDashboard } from '@/components/PageSkeleton';
import { createClient } from '@/lib/supabase/client';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { useMerchantWallet, useSelfDeliveryRiders } from '@/hooks/useMerchantApi';

export const dynamic = 'force-dynamic'

// Helper Component: Stat Card
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: 'orange' | 'blue' | 'emerald' | 'purple'
}

/** Show time with hours, minutes, seconds (no 00:00); HH:MM becomes HH:MM:00 */
function formatTimeHMS(t: string): string {
  if (!t) return '00:00:00'
  const parts = t.split(':')
  if (parts.length === 2) return `${t}:00`
  if (parts.length === 1) return `${t.padStart(2, '0')}:00:00`
  return t
}

/** Compact chart card header: title, date range, optional filter button (hidden when hideFilterButton) */
function ChartCardHeader({
  title,
  dateRange,
  onFilterClick,
  filterOpen,
  hideFilterButton = false,
  children,
}: {
  title: string
  dateRange: string
  onFilterClick: () => void
  filterOpen: boolean
  hideFilterButton?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3 min-h-[28px]">
      <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-gray-500 tabular-nums">{dateRange}</span>
        {!hideFilterButton && (
          <button
            type="button"
            onClick={onFilterClick}
            className={`p-1.5 rounded-lg transition-colors ${filterOpen ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'}`}
            aria-label="Filter chart"
          >
            <SlidersHorizontal size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** Compact filter popover for chart cards */
function ChartFilterPopover({
  open,
  onClose,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  orderType,
  onOrderTypeChange,
  onApply,
}: {
  open: boolean
  onClose: () => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  orderType: string
  onOrderTypeChange: (v: string) => void
  onApply: () => void
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        style={{ minWidth: '200px' }}
      >
        <p className="text-xs font-semibold text-gray-700 mb-2">Filter</p>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Date range</label>
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Order type</label>
            <select
              value={orderType}
              onChange={(e) => onOrderTypeChange(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="all">All</option>
              <option value="veg">Veg</option>
              <option value="non_veg">Non-Veg</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onClose} className="flex-1 text-xs py-1.5 border border-gray-300 rounded text-gray-700">
            Cancel
          </button>
          <button type="button" onClick={() => { onApply(); onClose(); }} className="flex-1 text-xs py-1.5 bg-orange-600 text-white rounded font-medium">
            Apply
          </button>
        </div>
      </div>
    </>
  )
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    orange: 'bg-orange-500/10 border-orange-200',
    blue: 'bg-blue-500/10 border-blue-200',
    emerald: 'bg-emerald-500/10 border-emerald-200',
    purple: 'bg-purple-500/10 border-purple-200'
  }
  const textColors = {
    orange: 'text-orange-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700'
  }
  return (
    <div className={`bg-white rounded-xl border ${colorClasses[color]} p-3 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">{value}</p>
        </div>
        <div className={`p-1.5 rounded-lg flex-shrink-0 ${textColors[color]}`}>{icon}</div>
      </div>
    </div>
  )
}

function DashboardContent() {
  const merchantSession = useMerchantSession();
  const router = useRouter()
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  
  // Store Status & Delivery Mode (synced with store-operations API / merchant_store_availability)
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const { data: selfDeliveryRidersData = [], isLoading: selfDeliveryRidersLoading } = useSelfDeliveryRiders(storeId, mxDeliveryEnabled)
  const selfDeliveryRiders = selfDeliveryRidersData
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  const [todayDate, setTodayDate] = useState('')
  const [todaySlots, setTodaySlots] = useState<{ start: string; end: string }[]>([])
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
  const [isTodayScheduledClosed, setIsTodayScheduledClosed] = useState(false)

  // Store close: popup modal (no in-card expansion)
  const [showClosePopup, setShowClosePopup] = useState(false)
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false)
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null)
  const [closureDate, setClosureDate] = useState<string>('')
  const [closureTime, setClosureTime] = useState<string>('12:00')
  const [statsDate, setStatsDate] = useState<string>('')
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false)
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false)
  const [toggleOnLoading, setToggleOnLoading] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: '', reason: '' })
  // Manual close: reason is mandatory
  const [closeReason, setCloseReason] = useState<string>('')
  const [closeReasonOther, setCloseReasonOther] = useState<string>('')
  
  const [pendingOrders, setPendingOrders] = useState(0)
  const [acceptedCount, setAcceptedCount] = useState(0)
  const [preparingOrders, setPreparingOrders] = useState(0)
  const [outForDelivery, setOutForDelivery] = useState(0)
  const [deliveredToday, setDeliveredToday] = useState(0)
  const [cancelledOrders, setCancelledOrders] = useState(0)
  const [revenueToday, setRevenueToday] = useState(0)
  const [avgPrepTime, setAvgPrepTime] = useState(0)
  const [acceptanceRate, setAcceptanceRate] = useState(0)
  const [orderMode, setOrderMode] = useState<'dashboard' | 'pos'>('dashboard')
  const [posIntegrationActive, setPosIntegrationActive] = useState(false)
  const [showPosIntegrateModal, setShowPosIntegrateModal] = useState(false)
  const [ordersTrend, setOrdersTrend] = useState<{ day: string; orders: number }[]>([])
  const [revenueByDay, setRevenueByDay] = useState<{ d: string; rev: number }[]>([])
  const [categoryDistribution, setCategoryDistribution] = useState<{ name: string; value: number; color: string }[]>([])
  const [hourlyHeatmap, setHourlyHeatmap] = useState<{ hour: number; count: number; pct: number }[]>([])
  const [weeklyPerformance, setWeeklyPerformance] = useState<{ w: string; orders: number }[]>([])
  const [deliverySuccessRate, setDeliverySuccessRate] = useState<{ d: string; rate: number }[]>([])
  const [stackedTrend, setStackedTrend] = useState<{ day: string; orders: number; revenue: number; cancellations: number }[]>([])
  const [funnelData, setFunnelData] = useState<{ stage: string; value: number; fill: string }[]>([])
  const [donutVegNonVeg, setDonutVegNonVeg] = useState<{ name: string; value: number; color: string; pct?: number }[]>([])
  const [dateRangeLabel, setDateRangeLabel] = useState('')
  const [salesTotal, setSalesTotal] = useState(0)
  const [salesGrowth, setSalesGrowth] = useState(0)
  const [viewsTotal, setViewsTotal] = useState(0)
  const [viewsGrowth, setViewsGrowth] = useState(0)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [chartFilterOpen, setChartFilterOpen] = useState<string | null>(null)
  const [chartDateFrom, setChartDateFrom] = useState('')
  const [chartDateTo, setChartDateTo] = useState('')
  const [chartOrderType, setChartOrderType] = useState('all')
  const [statusLog, setStatusLog] = useState<{ id: string | number; action: string; action_field?: string | null; restriction_type?: string | null; close_reason?: string | null; performed_by_name: string | null; performed_by_id: string | number | null; performed_by_email: string | null; created_at: string; type?: 'status' | 'settings' }[]>([])

  const { data: walletData, isLoading: walletLoading } = useMerchantWallet(storeId)
  const walletAvailableBalance = walletData?.available_balance ?? null
  const walletTodayEarning = walletData?.today_earning ?? 0
  const walletYesterdayEarning = walletData?.yesterday_earning ?? 0
  const walletPendingBalance = walletData?.pending_balance ?? 0

  // Get store ID and default stats date (today)
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

  useEffect(() => {
    if (statsDate === '' && typeof window !== 'undefined') {
      setStatsDate(new Date().toISOString().slice(0, 10))
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && chartDateFrom === '' && chartDateTo === '') {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 29)
      setChartDateFrom(start.toISOString().slice(0, 10))
      setChartDateTo(end.toISOString().slice(0, 10))
    }
  }, [chartDateFrom, chartDateTo])

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

  // Fetch store operations (same API as Food Orders header) – open/closed, today's slots, activity
  const fetchStoreOperations = React.useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`)
      const data = await res.json()
      if (res.ok) {
        setIsStoreOpen(data.operational_status === 'OPEN')
        setOpensAt(data.opens_at ?? null)
        setTodayDate(data.today_date || '')
        setTodaySlots(data.today_slots || [])
        setLastToggleBy(data.last_toggled_by_email || null)
        setLastToggleType(data.last_toggle_type || null)
        setLastToggledByName(data.last_toggled_by_name || null)
        setLastToggledById(data.last_toggled_by_id || null)
        setRestrictionType(data.restriction_type || null)
        setWithinHoursButRestricted(data.within_hours_but_restricted === true)
        setLastToggledAt(data.last_toggled_at || null)
        setManualActivationLock(data.block_auto_open === true)
        setIsTodayScheduledClosed(data.is_today_scheduled_closed === true)
        if ((data.today_slots?.length ?? 0) > 0) {
          const first = data.today_slots[0]
          setOpeningTime(first.start || '09:00')
          setClosingTime(first.end || '23:00')
        }
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

  // Store status log for Recent activities & Audit log (now uses combined audit logs API)
  useEffect(() => {
    if (!storeId) return
    fetch(`/api/merchant/audit-logs?storeId=${encodeURIComponent(storeId)}&limit=30`)
      .then((res) => res.json())
      .then((data) => { if (data.logs) setStatusLog(data.logs); })
      .catch(() => setStatusLog([]))
  }, [storeId, isStoreOpen])

  // KPIs from same source as Orders page: /api/food-orders/stats (orders_food); optional date filter
  const fetchStats = React.useCallback(async () => {
    if (!storeId) return
    try {
      const url = statsDate
        ? `/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}&date=${encodeURIComponent(statsDate)}`
        : `/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setPendingOrders(data.pendingCount ?? 0)
        setAcceptedCount(data.acceptedTodayCount ?? 0)
        setPreparingOrders(data.preparingCount ?? 0)
        setOutForDelivery(data.outForDeliveryCount ?? 0)
        setDeliveredToday(data.deliveredTodayCount ?? 0)
        setCancelledOrders(data.cancelledTodayCount ?? 0)
        setRevenueToday(data.totalRevenueToday ?? 0)
        setAvgPrepTime(data.avgPreparationTimeMinutes ?? 0)
        setAcceptanceRate(data.acceptanceRatePercent ?? 0)
      }
    } catch {
      // keep current state
    }
  }, [storeId, statsDate])

  // Charts from dashboard-analytics (orders_food)
  const fetchCharts = React.useCallback(async () => {
    if (!storeId) return
    setAnalyticsLoading(true)
    const params = new URLSearchParams({ store_id: storeId })
    if (chartDateFrom) params.set('date_from', chartDateFrom)
    if (chartDateTo) params.set('date_to', chartDateTo)
    fetch(`/api/dashboard-analytics?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setOrdersTrend(Array.isArray(data.ordersTrend) ? data.ordersTrend : [])
        setRevenueByDay(Array.isArray(data.revenueByDay) ? data.revenueByDay : [])
        setCategoryDistribution(Array.isArray(data.categoryDistribution) ? data.categoryDistribution : [])
        setHourlyHeatmap(Array.isArray(data.hourlyHeatmap) ? data.hourlyHeatmap : [])
        setWeeklyPerformance(Array.isArray(data.weeklyPerformance) ? data.weeklyPerformance : [])
        setDeliverySuccessRate(Array.isArray(data.deliverySuccessRate) ? data.deliverySuccessRate : [])
        setStackedTrend(Array.isArray(data.stackedTrend) ? data.stackedTrend : [])
        setFunnelData(Array.isArray(data.funnelData) ? data.funnelData : [])
        setDonutVegNonVeg(Array.isArray(data.donutVegNonVeg) ? data.donutVegNonVeg : [])
        setDateRangeLabel(data.dateRangeLabel || '')
        setSalesTotal(data.salesTotal ?? 0)
        setSalesGrowth(data.salesGrowth ?? 0)
        setViewsTotal(data.viewsTotal ?? 0)
        setViewsGrowth(data.viewsGrowth ?? 0)
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false))
  }, [storeId, chartDateFrom, chartDateTo])

  useEffect(() => {
    fetchStats()
    const t = setInterval(fetchStats, 15000)
    return () => clearInterval(t)
  }, [fetchStats])

  useEffect(() => {
    fetchCharts()
  }, [fetchCharts])

  // Fetch POS integration status for this store (and refetch when window regains focus, e.g. after returning from Store Settings)
  useEffect(() => {
    if (!storeId) return
    const checkPos = async () => {
      try {
        const res = await fetch(`/api/merchant/pos-integration?storeId=${encodeURIComponent(storeId)}`)
        if (res.ok) {
          const data = await res.json()
          setPosIntegrationActive(data?.active === true)
        }
      } catch {
        setPosIntegrationActive(false)
      }
    }
    checkPos()
    const onFocus = () => checkPos()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [storeId])
  
  const handleSwitchOrderMode = () => {
    if (orderMode === 'dashboard') {
      if (!posIntegrationActive) {
        setShowPosIntegrateModal(true)
        return
      }
      setOrderMode('pos')
      toast.success('Switched to POS. Orders will be managed via your POS.')
    } else {
      setOrderMode('dashboard')
      toast.success('Switched to GatiMitra Dashboard orders.')
    }
  }
  
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
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchStoreOperations()
        setShowToggleOnWarning(false)
        toast.success('Store is now OPEN. Orders are being accepted!')
      } else {
        toast.error(data.error || 'Failed to open store')
      }
    } catch {
      toast.error('Failed to open store')
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

    const now = new Date()
    let durationMinutes: number | undefined

    if (toggleClosureType === 'temporary') {
      const closedUntil = new Date(`${closureDate}T${closureTime}:00`)
      durationMinutes = Math.max(1, Math.round((closedUntil.getTime() - now.getTime()) / (1000 * 60)))
    } else if (toggleClosureType === 'today') {
      const [h, m] = openingTime.split(':').map(Number)
      const tomorrowOpen = new Date(now)
      tomorrowOpen.setDate(tomorrowOpen.getDate() + 1)
      tomorrowOpen.setHours(h, m, 0, 0)
      durationMinutes = Math.max(1, Math.round((tomorrowOpen.getTime() - now.getTime()) / (1000 * 60)))
    }
    // manual_hold: no duration; API will set block_auto_open

    const reasonText = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason
    const body: { store_id: string; action: string; closure_type: string; duration_minutes?: number; close_reason?: string } = {
      store_id: storeId,
      action: 'manual_close',
      closure_type: toggleClosureType,
      close_reason: reasonText,
    }
    if (durationMinutes != null) body.duration_minutes = durationMinutes

    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchStoreOperations()
        setShowClosePopup(false)
        setToggleClosureType(null)
        setCloseReason('')
        setCloseReasonOther('')
        if (toggleClosureType === 'manual_hold') toast.success('Store closed. It will only open when you turn it ON.')
        else if (toggleClosureType === 'temporary') {
          const until = new Date(`${closureDate}T${closureTime}:00`)
          toast.success(`Store closed until ${until.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. You can also turn it ON manually anytime.`)
        } else toast.success(`Store closed for today. Reopens tomorrow at ${openingTime}`)
      } else {
        toast.error(data.error || 'Failed to close store')
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

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <PageSkeletonDashboard />
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          className: 'backdrop-blur-sm bg-white/95',
          duration: 4000,
        }}
      />
      <StatusModal />
      {/* POS not integrated – block switch until integration is active */}
      {showPosIntegrateModal && (
        <Dialog open={showPosIntegrateModal} onClose={() => setShowPosIntegrateModal(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-amber-100">
                  <Smartphone size={24} className="text-amber-600" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-bold text-gray-900">Integrate POS first</Dialog.Title>
                  <p className="text-sm text-gray-600">Switch to POS only after integration is active</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mb-4">
                Complete POS registration in Store Settings and ask your POS partner to initiate the integration. Once it is active, you can switch to &quot;Orders managed via POS&quot; from the dashboard.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPosIntegrateModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPosIntegrateModal(false)
                    router.push('/mx/store-settings?tab=pos')
                  }}
                  className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700"
                >
                  Go to POS setup
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
                    <p className="text-xs text-gray-600">Reopen tomorrow at {formatTimeHMS(openingTime)}</p>
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
        <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full">
          <div className="dashboard-scroll hide-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-5">
            <div className="max-w-[1600px] mx-auto space-y-5">
              {/* Compact header – minimal height */}
              <div className="shrink-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2.5 sm:py-3 bg-white border-b border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Hamburger menu on left (mobile) */}
                  <MobileHamburgerButton />
                  {/* Heading - properly aligned */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">GatiMitra · Operations command center</p>
                  </div>
                </div>
              </div>

              {/* Three compact cards: Wallet (replaces Ordering mode) | Store Status | Delivery status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Wallet & Earnings – in place of Ordering mode card */}
                <div className="bg-gradient-to-br from-emerald-50/90 to-green-50/70 rounded-xl border border-emerald-200/80 shadow-sm hover:shadow-md transition-shadow p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20">
                      <Wallet size={16} className="text-emerald-700" />
                    </div>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase">Wallet &amp; Earnings</p>
                  </div>
                  {walletLoading ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <p className="text-[9px] font-medium text-gray-500 uppercase">Available</p>
                        <p className="text-sm font-bold text-emerald-800">
                          ₹{walletAvailableBalance != null ? Number(walletAvailableBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium text-gray-500 uppercase">Today</p>
                        <p className="text-sm font-bold text-orange-700">
                          ₹{Number(walletTodayEarning).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium text-gray-500 uppercase">Yesterday</p>
                        <p className="text-sm font-bold text-slate-700">
                          ₹{Number(walletYesterdayEarning).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium text-gray-500 uppercase">Pending</p>
                        <p className="text-sm font-bold text-violet-700">
                          ₹{Number(walletPendingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Store Status – accountability, restriction badges, color coding */}
                <div className={`rounded-xl border-2 shadow-sm hover:shadow-md transition-all p-4 ${
                  isStoreOpen
                    ? 'bg-gradient-to-br from-emerald-50/90 to-green-50/70 border-emerald-200'
                    : restrictionType === 'MANUAL_HOLD'
                      ? 'bg-gradient-to-br from-amber-50/90 to-orange-50/70 border-amber-300'
                      : 'bg-gradient-to-br from-red-50/90 to-rose-50/70 border-red-200'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Store Status</p>
                      <p className="text-xs font-bold text-gray-900">{formatTimeHMS(openingTime)} – {formatTimeHMS(closingTime)}</p>
                    </div>
                    <button
                      onClick={handleStoreToggle}
                      className={`p-2 rounded-xl shadow-md ${
                        isStoreOpen ? 'bg-emerald-500 text-white hover:bg-emerald-600' : restrictionType === 'MANUAL_HOLD' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-red-500 text-white hover:bg-red-600'
                      }`}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                  <div className={`flex items-center gap-1.5 mt-2 p-2 rounded-lg border ${
                    isStoreOpen ? 'bg-emerald-100/40 border-emerald-300' : restrictionType === 'MANUAL_HOLD' ? 'bg-amber-100/40 border-amber-300' : 'bg-red-100/40 border-red-300'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${isStoreOpen ? 'bg-emerald-500 animate-pulse' : restrictionType === 'MANUAL_HOLD' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <span className={`text-xs font-bold ${
                      isStoreOpen ? 'text-emerald-700' : restrictionType === 'MANUAL_HOLD' ? 'text-amber-800' : 'text-red-700'
                    }`}>
                      {isStoreOpen ? 'Open' : restrictionType === 'MANUAL_HOLD' ? 'Waiting manual activation' : 'Closed'}
                    </span>
                  </div>
                  {!isStoreOpen && restrictionType && (
                    <p className="text-[10px] font-medium mt-1.5">
                      {restrictionType === 'TEMPORARY' && <span className="text-orange-700">Temporarily closed</span>}
                      {restrictionType === 'CLOSED_TODAY' && <span className="text-red-700">Closed for today</span>}
                      {restrictionType === 'MANUAL_HOLD' && <span className="text-amber-700">Waiting manual activation</span>}
                    </p>
                  )}
                  {!isStoreOpen && (() => {
                    const lastClosed = statusLog.find((l) => l.action === 'CLOSED' || l.action === 'Store closed')
                    return lastClosed?.close_reason ? (
                      <p className="text-[10px] font-medium mt-1.5 text-gray-700 bg-white/60 rounded px-2 py-1 border border-gray-200/80">
                        Reason: <span className="font-semibold text-gray-900">{lastClosed.close_reason}</span>
                      </p>
                    ) : null
                  })()}
                  {(lastToggledByName || lastToggleBy || lastToggleType) && lastToggledAt && (
                    <p className="text-[10px] text-gray-600 mt-1.5">
                      Last: {lastToggleType === 'AUTO_OPEN' ? 'Auto on' : lastToggleType === 'AUTO_CLOSE' ? 'Auto closed' : (
                        <>{isStoreOpen ? 'Opened' : 'Closed'} by {lastToggledByName || lastToggleBy || 'Merchant'}{lastToggledById ? ` (ID: ${lastToggledById})` : ''} · {new Date(lastToggledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</>
                      )}
                    </p>
                  )}
                  {withinHoursButRestricted && (
                    <p className="text-[10px] text-amber-800 mt-1.5 font-medium bg-amber-100/60 rounded px-2 py-1">Store is within operating hours but remains OFF due to manual restriction.</p>
                  )}
                  {!isStoreOpen && isTodayScheduledClosed && (
                    <p className="text-[10px] text-gray-700 mt-1.5 font-medium bg-gray-100/60 rounded px-2 py-1 border border-gray-200">
                      Today Closed (Scheduled Closed)
                    </p>
                  )}
                  {!isStoreOpen && !isTodayScheduledClosed && opensAt && !withinHoursButRestricted && (() => {
                    const ms = new Date(opensAt).getTime() - Date.now()
                    if (ms <= 0) return <p className="text-[10px] text-red-600 mt-1 font-medium">Opens now</p>
                    const h = Math.floor(ms / 3600000)
                    const m = Math.floor((ms % 3600000) / 60000)
                    const s = Math.floor((ms % 60000) / 1000)
                    if (h === 0 && m === 0 && s === 0) return <p className="text-[10px] text-red-600 mt-1 font-medium">Opens now</p>
                    return (
                      <p className="text-[10px] text-red-700 mt-1 font-medium" title="Updates every second. Store will open automatically at zero.">
                        Opens in {h}h {m}m {s}s
                      </p>
                    )
                  })()}
                  {todayDate && (isStoreOpen || !opensAt) && !withinHoursButRestricted && (
                    <p className="text-[10px] text-gray-500 mt-1 truncate">
                      {todaySlots.length > 0 ? todaySlots.map((s) => `${formatTimeHMS(s.start)}–${formatTimeHMS(s.end)}`).join(', ') : 'No slots'}
                    </p>
                  )}
                  
                  {/* Manual Activation Lock Toggle */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/60">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-gray-700">Manual Activation Lock</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">Prevent automatic store opening</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualActivationLock}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setManualActivationLock(newValue);
                          await saveManualActivationLock(newValue);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                    </label>
                  </div>
                </div>

                {/* Delivery mode: clear GatiMitra (default) vs Self delivery toggle + riders when Self */}
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow p-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Delivery mode</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-semibold shrink-0 ${!mxDeliveryEnabled ? 'text-violet-700' : 'text-gray-400'}`}>GatiMitra</span>
                      <button
                        type="button"
                        onClick={handleMXDeliveryToggle}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${mxDeliveryEnabled ? 'bg-orange-500' : 'bg-gray-300'}`}
                        aria-label={mxDeliveryEnabled ? 'Switch to GatiMitra delivery' : 'Switch to Self delivery'}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${mxDeliveryEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <span className={`text-xs font-semibold shrink-0 ${mxDeliveryEnabled ? 'text-orange-700' : 'text-gray-400'}`}>Self</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">
                      {mxDeliveryEnabled ? 'Your riders' : 'Platform riders'}
                    </p>
                  </div>
                  {mxDeliveryEnabled && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {selfDeliveryRidersLoading ? (
                        <p className="text-[10px] text-gray-500">Loading riders…</p>
                      ) : selfDeliveryRiders.length === 0 ? (
                        <>
                          <p className="text-xs text-amber-700 mb-1">Add your first rider to use self delivery.</p>
                          <Link
                            href={storeId ? `/mx/store-settings?storeId=${encodeURIComponent(storeId)}&tab=riders` : '/mx/store-settings'}
                            className="text-xs font-medium text-orange-600 hover:text-orange-700"
                          >
                            Add rider in Settings →
                          </Link>
                        </>
                      ) : (
                        <>
                          <ul className="space-y-1.5">
                            {selfDeliveryRiders.slice(0, 2).map((r) => (
                              <li key={r.id} className="text-[10px] text-gray-700 flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-gray-500">#{r.id}</span>
                                <span className="font-medium">{r.rider_name}</span>
                                <span className="text-gray-500">{r.rider_mobile}</span>
                              </li>
                            ))}
                          </ul>
                          {selfDeliveryRiders.length > 2 && (
                            <p className="text-[10px] text-gray-500 mt-1">+{selfDeliveryRiders.length - 2} more</p>
                          )}
                          <Link
                            href={storeId ? `/mx/store-settings?storeId=${encodeURIComponent(storeId)}&tab=riders` : '/mx/store-settings'}
                            className="text-[10px] font-medium text-orange-600 hover:text-orange-700 mt-1 inline-block"
                          >
                            Manage all riders →
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ DATE FILTER + ORDER FLOW (one horizontal line, order flow full width right) ═══ */}
              <div className="flex flex-wrap items-stretch gap-4 mb-2">
                <div className="flex items-center gap-2 shrink-0">
                  <Calendar size={16} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">Date:</span>
                  <input
                    type="date"
                    value={statsDate}
                    onChange={(e) => setStatsDate(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={() => setStatsDate(new Date().toISOString().slice(0, 10))}
                    className="text-xs font-medium text-orange-600 hover:text-orange-700"
                  >
                    Today
                  </button>
                </div>
                <div className="flex-1 min-w-[280px] bg-gradient-to-r from-white to-slate-50/80 rounded-xl border border-orange-200/60 shadow-md hover:shadow-lg transition-shadow px-4 py-3">
                  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-4 rounded-full bg-orange-500" />
                    Order flow {statsDate ? `(${statsDate})` : ''}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 py-1">
                    {['Placed', 'Accepted', 'Preparing', 'Delivered'].map((step, i) => (
                      <React.Fragment key={step}>
                        <div className="flex items-center gap-2 group">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm transition-transform group-hover:scale-105 ${i === 0 ? 'bg-orange-500 text-white ring-2 ring-orange-200' : i === 3 ? 'bg-emerald-500 text-white ring-2 ring-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                            {[pendingOrders, acceptedCount, preparingOrders, deliveredToday][i]}
                          </div>
                          <span className="text-xs font-semibold text-gray-800">{step}</span>
                        </div>
                        {i < 3 && <ArrowRight size={14} className="text-orange-300 flex-shrink-0" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* ═══ TOP KPI METRICS (8 compact cards) ═══ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <StatCard title="Pending" value={pendingOrders} icon={<Package size={18} />} color="orange" />
                <StatCard title="Preparing" value={preparingOrders} icon={<Users size={18} />} color="blue" />
                <StatCard title="Out for Delivery" value={outForDelivery} icon={<Truck size={18} />} color="purple" />
                <StatCard title="Delivered Today" value={deliveredToday} icon={<TrendingUp size={18} />} color="emerald" />
                <StatCard title="Cancelled" value={cancelledOrders} icon={<XCircle size={18} />} color="orange" />
                <StatCard title="Today's Revenue" value={`₹${(revenueToday / 1000).toFixed(0)}k`} icon={<BarChart3 size={18} />} color="purple" />
                <StatCard title="Avg Prep (min)" value={avgPrepTime} icon={<Clock size={18} />} color="blue" />
                <StatCard title="Acceptance %" value={`${acceptanceRate}%`} icon={<CheckCircle2 size={18} />} color="emerald" />
              </div>

              {/* ═══ SALES & VIEWS (image-style advanced charts) ═══ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                  <div className="relative">
                    <ChartCardHeader
                      title="Sales"
                      dateRange={dateRangeLabel || '—'}
                      onFilterClick={() => setChartFilterOpen(prev => prev === 'sales' ? null : 'sales')}
                      filterOpen={chartFilterOpen === 'sales'}
                    />
                    {chartFilterOpen === 'sales' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  </div>
                  <p className="text-2xl font-bold text-gray-900">₹{salesTotal.toLocaleString('en-IN')}</p>
                  <p className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${salesGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <ChevronUp size={12} className={salesGrowth < 0 ? 'rotate-180' : ''} /> {salesGrowth >= 0 ? '+' : ''}{salesGrowth}% Growth in the last {chartDateFrom && chartDateTo ? Math.ceil((new Date(chartDateTo).getTime() - new Date(chartDateFrom).getTime()) / 86400000) + 1 : 30} days
                  </p>
                  <div className="h-[140px] mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDay.length ? revenueByDay : [{ d: '—', rev: 0 }]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="salesBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} /></linearGradient></defs>
                        <XAxis dataKey="d" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}k`} />
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => [`₹${Number(v) * 1000}`, 'Revenue']} />
                        <Bar dataKey="rev" fill="url(#salesBar)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                  <div className="relative">
                    <ChartCardHeader
                      title="Views"
                      dateRange={dateRangeLabel || '—'}
                      onFilterClick={() => setChartFilterOpen(prev => prev === 'views' ? null : 'views')}
                      filterOpen={chartFilterOpen === 'views'}
                    />
                    {chartFilterOpen === 'views' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{viewsTotal.toLocaleString('en-IN')}</p>
                  <p className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${viewsGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <ChevronUp size={12} className={viewsGrowth < 0 ? 'rotate-180' : ''} /> {viewsGrowth >= 0 ? '+' : ''}{viewsGrowth}% Growth in the last {chartDateFrom && chartDateTo ? Math.ceil((new Date(chartDateTo).getTime() - new Date(chartDateFrom).getTime()) / 86400000) + 1 : 30} days
                  </p>
                  <div className="h-[140px] mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ordersTrend.length ? ordersTrend : [{ day: '—', orders: 0 }]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="viewsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="orders" stroke="#8b5cf6" fill="url(#viewsArea)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ═══ ANALYTICS & GRAPHS (from orders_food) ═══ */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Orders trend"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'orders' ? null : 'orders')}
                    filterOpen={chartFilterOpen === 'orders'}
                  />
                  {chartFilterOpen === 'orders' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ordersTrend.length ? ordersTrend : [{ day: 'Mon', orders: 0 }, { day: 'Tue', orders: 0 }, { day: 'Wed', orders: 0 }, { day: 'Thu', orders: 0 }, { day: 'Fri', orders: 0 }, { day: 'Sat', orders: 0 }, { day: 'Sun', orders: 0 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Line type="monotone" dataKey="orders" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Revenue analytics"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'revenue' ? null : 'revenue')}
                    filterOpen={chartFilterOpen === 'revenue'}
                  />
                  {chartFilterOpen === 'revenue' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueByDay.length ? revenueByDay : [{ d: 'Mon', rev: 0 }, { d: 'Tue', rev: 0 }, { d: 'Wed', rev: 0 }, { d: 'Thu', rev: 0 }, { d: 'Fri', rev: 0 }, { d: 'Sat', rev: 0 }, { d: 'Sun', rev: 0 }]}>
                        <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="d" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Area type="monotone" dataKey="rev" stroke="#8b5cf6" fill="url(#revGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Order category (Veg/Non-Veg)"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'category' ? null : 'category')}
                    filterOpen={chartFilterOpen === 'category'}
                  />
                  {chartFilterOpen === 'category' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryDistribution.length ? categoryDistribution : [{ name: 'No data', value: 1, color: '#e2e8f0' }]} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                          {(categoryDistribution.length ? categoryDistribution : [{ name: 'No data', value: 1, color: '#e2e8f0' }]).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Hourly order heatmap"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'heatmap' ? null : 'heatmap')}
                    filterOpen={chartFilterOpen === 'heatmap'}
                  />
                  {chartFilterOpen === 'heatmap' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="flex items-end gap-1 h-[100px]">
                    {(hourlyHeatmap.length ? hourlyHeatmap : [10,11,12,13,14,15,16,17,18,19,20,21].map((hour) => ({ hour, count: 0, pct: 0 }))).map((item, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                        <div className="w-full rounded-t bg-orange-400 min-h-[6px]" style={{ height: `${item.pct || 0}%` }} title={`${item.hour}:00 · ${item.count || 0} orders`} />
                        <span className="text-[9px] text-gray-500">{item.hour}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Weekly performance"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'weekly' ? null : 'weekly')}
                    filterOpen={chartFilterOpen === 'weekly'}
                  />
                  {chartFilterOpen === 'weekly' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyPerformance.length ? weeklyPerformance : [{ w: 'W1', orders: 0 }, { w: 'W2', orders: 0 }, { w: 'W3', orders: 0 }, { w: 'W4', orders: 0 }]} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <XAxis dataKey="w" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="orders" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                <ChartCardHeader
                  title="Delivery success rate"
                  dateRange={dateRangeLabel || '—'}
                  onFilterClick={() => setChartFilterOpen(prev => prev === 'delivery' ? null : 'delivery')}
                  filterOpen={chartFilterOpen === 'delivery'}
                />
                {chartFilterOpen === 'delivery' && (
                  <ChartFilterPopover
                    open
                    onClose={() => setChartFilterOpen(null)}
                    dateFrom={chartDateFrom}
                    dateTo={chartDateTo}
                    onDateFromChange={setChartDateFrom}
                    onDateToChange={setChartDateTo}
                    orderType={chartOrderType}
                    onOrderTypeChange={setChartOrderType}
                    onApply={() => fetchCharts()}
                  />
                )}
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={deliverySuccessRate.length ? deliverySuccessRate : [{ d: 'Mon', rate: 100 }, { d: 'Tue', rate: 100 }, { d: 'Wed', rate: 100 }, { d: 'Thu', rate: 100 }, { d: 'Fri', rate: 100 }, { d: 'Sat', rate: 100 }, { d: 'Sun', rate: 100 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: unknown) => [String(v) + '%', 'Success rate']} />
                      <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ═══ ADVANCED ANALYTICS (Stacked Area, Exploded Pie, Donut, Funnel) ═══ */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Multi-metric trends"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'multi' ? null : 'multi')}
                    filterOpen={chartFilterOpen === 'multi'}
                  />
                  {chartFilterOpen === 'multi' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stackedTrend.length ? stackedTrend : [{ day: 'Mon', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Tue', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Wed', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Thu', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Fri', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Sat', orders: 0, revenue: 0, cancellations: 0 }, { day: 'Sun', orders: 0, revenue: 0, cancellations: 0 }]}>
                        <defs>
                          <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.5} /><stop offset="100%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                          <linearGradient id="cancGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: unknown, name?: string) => { const n = name ?? ''; const disp = n === 'revenue' ? `₹${Number(v) * 1000}` : String(v); const label = n === 'revenue' ? 'Revenue (₹k)' : n.charAt(0).toUpperCase() + n.slice(1); return [disp, label] as [React.ReactNode, string]; }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area yAxisId="left" type="monotone" dataKey="orders" stroke="#f97316" fill="url(#ordersGrad)" strokeWidth={2} name="Orders" />
                        <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#8b5cf6" fill="url(#revenueGrad)" strokeWidth={2} name="Revenue (₹k)" />
                        <Area yAxisId="left" type="monotone" dataKey="cancellations" stroke="#ef4444" fill="url(#cancGrad)" strokeWidth={2} name="Cancellations" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Order type distribution"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'orderType' ? null : 'orderType')}
                    filterOpen={chartFilterOpen === 'orderType'}
                    hideFilterButton
                  />
                  {chartFilterOpen === 'orderType' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryDistribution.length ? categoryDistribution : [{ name: 'No data', value: 1, color: '#e2e8f0' }]}
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {(categoryDistribution.length ? categoryDistribution : [{ name: 'No data', value: 1, color: '#e2e8f0' }]).map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: unknown, name?: string, props?: { payload?: { value?: number } }) => [`${props?.payload?.value ?? v} (${props?.payload?.value ?? v} orders)`, name ?? '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Veg / Non-Veg breakdown"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'donut' ? null : 'donut')}
                    filterOpen={chartFilterOpen === 'donut'}
                    hideFilterButton
                  />
                  {chartFilterOpen === 'donut' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[180px] flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutVegNonVeg.length ? donutVegNonVeg : [{ name: 'No data', value: 1, color: '#e2e8f0' }]}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {(donutVegNonVeg.length ? donutVegNonVeg : [{ name: 'No data', value: 1, color: '#e2e8f0' }]).map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: unknown, name?: string, props?: { payload?: { pct?: number } }) => [`${v} (${props?.payload?.pct ?? 0}%)`, name ?? '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 relative">
                  <ChartCardHeader
                    title="Order lifecycle funnel"
                    dateRange={dateRangeLabel || '—'}
                    onFilterClick={() => setChartFilterOpen(prev => prev === 'funnel' ? null : 'funnel')}
                    filterOpen={chartFilterOpen === 'funnel'}
                  />
                  {chartFilterOpen === 'funnel' && (
                    <ChartFilterPopover
                      open
                      onClose={() => setChartFilterOpen(null)}
                      dateFrom={chartDateFrom}
                      dateTo={chartDateTo}
                      onDateFromChange={setChartDateFrom}
                      onDateToChange={setChartDateTo}
                      orderType={chartOrderType}
                      onOrderTypeChange={setChartOrderType}
                      onApply={() => fetchCharts()}
                    />
                  )}
                  <div className="h-[180px] flex flex-col justify-center gap-1">
                    {(funnelData.length ? funnelData : [
                      { stage: 'Placed', value: 0, fill: '#f97316' },
                      { stage: 'Accepted', value: 0, fill: '#3b82f6' },
                      { stage: 'Preparing', value: 0, fill: '#8b5cf6' },
                      { stage: 'Out for Delivery', value: 0, fill: '#06b6d4' },
                      { stage: 'Delivered', value: 0, fill: '#10b981' },
                    ]).map((item) => {
                      const data = funnelData.length ? funnelData : [
                        { stage: 'Placed', value: 0, fill: '#f97316' },
                        { stage: 'Accepted', value: 0, fill: '#3b82f6' },
                        { stage: 'Preparing', value: 0, fill: '#8b5cf6' },
                        { stage: 'Out for Delivery', value: 0, fill: '#06b6d4' },
                        { stage: 'Delivered', value: 0, fill: '#10b981' },
                      ]
                      const topVal = data[0]?.value ?? 1
                      const pct = topVal > 0 ? (item.value / topVal) * 100 : 0
                      return (
                        <div key={item.stage} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700 w-24 shrink-0">{item.stage}</span>
                          <div className="flex-1 h-6 rounded bg-gray-100 overflow-hidden">
                            <div className="h-full rounded transition-all duration-500 flex items-center justify-end pr-1" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: item.fill }}>
                              <span className="text-[10px] font-bold text-white">{item.value}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ═══ RECENT ACTIVITIES (from merchant_store_status_log) ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Recent activities</h3>
                  <div className="overflow-x-auto max-h-[260px] overflow-y-auto hide-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="py-2 px-2 font-semibold text-gray-600 w-16">Time</th>
                          <th className="py-2 px-2 font-semibold text-gray-600">Action</th>
                          <th className="py-2 px-2 font-semibold text-gray-600">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusLog.length === 0 ? (
                          <tr><td colSpan={3} className="py-4 px-2 text-gray-500 text-center">No activity yet. Store open/close will appear here.</td></tr>
                        ) : (
                          [...statusLog]
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((log, index) => (
                            <tr key={`${log.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                              <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                              <td className="py-2 px-2">
                                <span className={log.action === 'Store opened' || log.action === 'OPEN' ? 'text-emerald-600 font-medium' : log.action === 'Store closed' || log.action === 'CLOSED' ? 'text-red-600 font-medium' : 'text-gray-700 font-medium'}>{log.action}</span>
                                {log.restriction_type && <span className="text-gray-500 ml-1">({log.restriction_type.replace(/_/g, ' ')})</span>}
                                {log.action_field && <span className="text-gray-500 ml-1">· {log.action_field.replace(/_/g, ' ')}</span>}
                                {(log.action === 'CLOSED' || log.action === 'Store closed') && log.close_reason && <span className="text-gray-500 ml-1">· {log.close_reason}</span>}
                              </td>
                              <td className="py-2 px-2 text-gray-700">{log.performed_by_name || log.performed_by_email || '—'}{log.performed_by_id ? ` (${log.performed_by_id})` : ''}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900">Audit log snapshot</h3>
                    <Link href={storeId ? `/mx/audit-logs?storeId=${encodeURIComponent(storeId)}` : '/mx/audit-logs'} className="text-xs font-semibold text-orange-600 hover:text-orange-700">View full audit logs</Link>
                  </div>
                  <div className="overflow-x-auto max-h-[260px] overflow-y-auto hide-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="py-2 px-2 font-semibold text-gray-600">Who</th>
                          <th className="py-2 px-2 font-semibold text-gray-600">Action</th>
                          <th className="py-2 px-2 font-semibold text-gray-600">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusLog.length === 0 ? (
                          <tr><td colSpan={3} className="py-4 px-2 text-gray-500 text-center">No audit entries yet.</td></tr>
                        ) : (
                          [...statusLog]
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .slice(0, 15)
                            .map((log, index) => (
                            <tr key={`${log.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                              <td className="py-2 px-2 font-medium text-gray-900">{log.performed_by_name || log.performed_by_email || 'System'}{log.performed_by_id ? ` (ID: ${log.performed_by_id})` : ''}</td>
                              <td className="py-2 px-2 text-gray-700">{log.action}{log.action_field ? ` · ${log.action_field.replace(/_/g, ' ')}` : log.restriction_type ? ` · ${log.restriction_type.replace(/_/g, ' ')}` : ''}</td>
                              <td className="py-2 px-2 text-gray-500">{new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ═══ PERFORMANCE INSIGHTS (from orders_food KPIs) ═══ */}
              <div>
                <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Performance insights</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="py-2 px-2 text-left font-semibold text-gray-600">Metric</th>
                          <th className="py-2 px-2 text-right font-semibold text-gray-600">Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Pending orders</td><td className="py-2 px-2 text-right font-medium">{pendingOrders}</td></tr>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Preparing</td><td className="py-2 px-2 text-right font-medium">{preparingOrders}</td></tr>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Delivered today</td><td className="py-2 px-2 text-right font-medium text-emerald-600">{deliveredToday}</td></tr>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Cancelled today</td><td className="py-2 px-2 text-right font-medium text-red-600">{cancelledOrders}</td></tr>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Revenue today</td><td className="py-2 px-2 text-right font-medium">₹{revenueToday.toLocaleString()}</td></tr>
                        <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Avg prep (min)</td><td className="py-2 px-2 text-right font-medium">{avgPrepTime}</td></tr>
                        <tr><td className="py-2 px-2 text-gray-700">Acceptance rate</td><td className="py-2 px-2 text-right font-medium text-emerald-600">{acceptanceRate}%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </MXLayoutWhite>
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