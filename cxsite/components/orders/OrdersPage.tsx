'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import { supabase } from '@/lib/supabase'
import OrdersPageLoading from '@/components/orders/OrdersPageLoading'
import { useParcelServiceEnabled } from '@/components/common/ParcelServiceControl'
import { SoonBadge } from '@/components/common/SoonBadge'

type ServiceType = 'all' | 'food' | 'person' | 'parcel' | 'cancelled' | 'completed'

type ApiOrderLineItem = {
  name: string
  quantity: number
  price: number
  lineTotal?: number | null
  variantName?: string | null
  customization?: string | null
}

type ApiOrderSummary = {
  orderId: string
  coreOrderId: number
  formattedOrderId: string | null
  status: string
  orderType: string
  serviceType: 'food' | 'person' | 'parcel'
  merchantName: string | null
  rideType: string | null
  parcelType: string | null
  pickupAddress: string | null
  dropAddress: string | null
  deliveryAddress: string | null
  totalAmount: number | null
  createdAt: string
  paymentStatus: string | null
  paymentMethod: string | null
  cancellationReason: string | null
  cancelledByLabel: string | null
  items: ApiOrderLineItem[]
}

interface FoodOrderItem {
  id: string
  name: string
  price: number
  quantity: number
  image?: string
}

interface FoodOrder {
  id: string
  order_number: string
  restaurant_name: string
  restaurant_image?: string
  items: FoodOrderItem[]
  subtotal: number
  delivery_fee: number
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  cancel_reason?: string
  refund_percentage?: number
  refund_amount?: number
  cancelled_at?: string
}

interface PersonOrder {
  id: string
  booking_number: string
  vehicle_name: string
  vehicle_type: string
  pickup_location: { address: string }
  dropoff_location: { address: string }
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  driver_name?: string
  estimated_arrival_time?: string
  cancel_reason?: string
  refund_percentage?: number
  refund_amount?: number
  cancelled_at?: string
}

interface ParcelOrder {
  id: string
  tracking_number: string
  parcel_type_name: string
  recipient_name: string
  recipient_phone: string
  pickup_address: { address: string }
  delivery_address: { address: string }
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  partner_name?: string
  cancel_reason?: string
  refund_percentage?: number
  refund_amount?: number
  cancelled_at?: string
}

interface UnifiedOrder {
  id: string
  orderNumber: string
  serviceType: 'food' | 'person' | 'parcel'
  title: string
  subtitle: string
  status: string
  statusLabel: string
  amount: number
  createdAt: string
  icon: string
  color: string
  items: ApiOrderLineItem[]
  paymentMethod?: string | null
  pickupAddress?: string | null
  dropAddress?: string | null
  cancelReason?: string
  cancelledByLabel?: string
  refundPercentage?: number
  refundAmount?: number
  cancelledAt?: string
  raw: FoodOrder | PersonOrder | ParcelOrder
}

/** Match customer app orders list: ₹{totalAmount.toFixed(2)} */
function formatOrderMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '₹0.00'
  return `₹${value.toFixed(2)}`
}

/** Match customer app order detail line: Math.round(lineTotal) */
function formatLineItemMoney(item: ApiOrderLineItem): string {
  const lineTotal = item.lineTotal ?? item.price * item.quantity
  return `₹${Math.round(lineTotal)}`
}

// Cancellation reasons
const cancellationReasons = [
  { id: 'mistake', label: 'Ordered by mistake' },
  { id: 'better_option', label: 'Found a better option' },
  { id: 'delay', label: 'Delivery taking too long' },
  { id: 'changed_mind', label: 'Changed my mind' },
  { id: 'other', label: 'Other' },
]

// Refund logic based on status
const normalizeStatusKey = (status: string) =>
  status.trim().toLowerCase().replace(/[\s-]+/g, '_')

const isCancelledStatus = (status: string) => {
  const s = status.trim().toUpperCase()
  return s === 'CANCELLED' || normalizeStatusKey(status) === 'cancelled'
}

const isCompletedStatus = (status: string) => {
  const s = status.trim().toUpperCase()
  return (
    s === 'DELIVERED' ||
    s === 'COMPLETED' ||
    normalizeStatusKey(status) === 'delivered' ||
    normalizeStatusKey(status) === 'completed'
  )
}

const getRefundInfo = (status: string) => {
  const key = normalizeStatusKey(status)
  const upper = status.trim().toUpperCase()

  const noRefundStatuses = [
    'delivered', 'completed', 'out_for_delivery', 'in_transit', 'driver_arrived',
    'out_for_delivery', 'picked_up', 'on_the_way', 'ride_in_progress',
  ]
  const halfRefundStatuses = [
    'confirmed', 'preparing', 'driver_assigned', 'pickup_assigned', 'picked_up', 'accepted',
    'accepted', 'preparing', 'rider_assigned', 'ready_for_pickup', 'reached_store',
  ]
  const fullRefundStatuses = ['pending', 'order_placed', 'placed', 'created', 'searching_rider']

  if (noRefundStatuses.includes(key) || upper === 'DELIVERED' || upper === 'OUT_FOR_DELIVERY' || upper === 'PICKED_UP') {
    return { percentage: 0, message: 'This order is not eligible for a refund as it is already in progress or delivered.' }
  }
  if (halfRefundStatuses.includes(key) || upper === 'PREPARING' || upper === 'ACCEPTED') {
    return { percentage: 50, message: 'You are eligible for a 50% refund for this order.' }
  }
  if (fullRefundStatuses.includes(key) || upper === 'ORDER_PLACED') {
    return { percentage: 100, message: 'You are eligible for a 100% refund for this order.' }
  }
  return { percentage: 0, message: 'This order is not eligible for a refund.' }
}

// Check if cancellation is allowed
const canCancelOrder = (status: string) => {
  if (isCancelledStatus(status) || isCompletedStatus(status)) return false
  const key = normalizeStatusKey(status)
  const nonCancellableStatuses = ['delivered', 'completed', 'cancelled', 'returned', 'failed', 'payment_failed']
  return !nonCancellableStatuses.includes(key)
}

const sharedStatusLabels: Record<string, { label: string; color: string; icon: string }> = {
  order_placed: { label: 'Order Placed', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
  placed: { label: 'Order Placed', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
  created: { label: 'Order Placed', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
  accepted: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: 'fas fa-check-circle' },
  preparing: { label: 'Preparing', color: 'bg-orange-100 text-orange-700', icon: 'fas fa-utensils' },
  ready_for_pickup: { label: 'Ready for Pickup', color: 'bg-orange-100 text-orange-700', icon: 'fas fa-utensils' },
  rider_assigned: { label: 'Rider Assigned', color: 'bg-cyan-100 text-cyan-700', icon: 'fas fa-user-check' },
  searching_rider: { label: 'Finding Rider', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-search' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-motorcycle' },
  on_the_way: { label: 'On the Way', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-motorcycle' },
  picked_up: { label: 'Picked Up', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-box' },
  in_transit: { label: 'In Transit', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-truck' },
  ride_in_progress: { label: 'Ride in Progress', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-road' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-double' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-double' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
  payment_failed: { label: 'Payment Failed', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
}

const getStatusConfig = (status: string, serviceType: 'food' | 'person' | 'parcel') => {
  const key = normalizeStatusKey(status)
  if (sharedStatusLabels[key]) return sharedStatusLabels[key]

  const configs: Record<string, Record<string, { label: string; color: string; icon: string }>> = {
    food: {
      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
      confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: 'fas fa-check-circle' },
      preparing: { label: 'Preparing', color: 'bg-orange-100 text-orange-700', icon: 'fas fa-utensils' },
      out_for_delivery: { label: 'Out for Delivery', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-motorcycle' },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-double' },
      cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
    },
    person: {
      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
      confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: 'fas fa-check-circle' },
      driver_assigned: { label: 'Driver Assigned', color: 'bg-cyan-100 text-cyan-700', icon: 'fas fa-user-check' },
      driver_arrived: { label: 'Driver Arrived', color: 'bg-indigo-100 text-indigo-700', icon: 'fas fa-car' },
      in_transit: { label: 'In Transit', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-road' },
      completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-double' },
      cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
    },
    parcel: {
      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: 'fas fa-clock' },
      pickup_assigned: { label: 'Pickup Assigned', color: 'bg-blue-100 text-blue-700', icon: 'fas fa-user-check' },
      picked_up: { label: 'Picked Up', color: 'bg-cyan-100 text-cyan-700', icon: 'fas fa-box' },
      in_transit: { label: 'In Transit', color: 'bg-purple-100 text-purple-700', icon: 'fas fa-truck' },
      out_for_delivery: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-700', icon: 'fas fa-motorcycle' },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-double' },
      cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: 'fas fa-times-circle' },
      returned: { label: 'Returned', color: 'bg-gray-100 text-gray-700', icon: 'fas fa-undo' },
    }
  }
  return configs[serviceType]?.[key] || {
    label: status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    color: 'bg-gray-100 text-gray-700',
    icon: 'fas fa-circle',
  }
}

const serviceIcons: Record<string, { icon: string; color: string; bg: string; accent: string; label: string }> = {
  food: { icon: 'fas fa-utensils', color: 'text-orange-600', bg: 'bg-orange-50', accent: 'border-l-orange-500', label: 'Food' },
  person: { icon: 'fas fa-car', color: 'text-sky-600', bg: 'bg-sky-50', accent: 'border-l-sky-500', label: 'Ride' },
  parcel: { icon: 'fas fa-box', color: 'text-violet-600', bg: 'bg-violet-50', accent: 'border-l-violet-500', label: 'Parcel' },
}

const FILTER_META: Record<ServiceType, { label: string; icon: string }> = {
  all: { label: 'All', icon: 'fas fa-layer-group' },
  food: { label: 'Food', icon: 'fas fa-utensils' },
  person: { label: 'Rides', icon: 'fas fa-car' },
  parcel: { label: 'Parcel', icon: 'fas fa-box' },
  cancelled: { label: 'Cancelled', icon: 'fas fa-ban' },
  completed: { label: 'Completed', icon: 'fas fa-check-circle' },
}

function isOrderActive(status: string): boolean {
  return !isTerminalStatus(status)
}

function isTerminalStatus(status: string): boolean {
  const s = status.trim().toUpperCase()
  return (
    isCancelledStatus(status) ||
    isCompletedStatus(status) ||
    s === 'PAYMENT_FAILED' ||
    s === 'FAILED'
  )
}

function displayOrderId(orderNumber: string): string {
  const id = orderNumber.trim()
  return id.startsWith('#') ? id : `#${id}`
}

function formatCancellationDisplay(cancelReason?: string, cancelledByLabel?: string): string | null {
  const label = cancelledByLabel?.trim()
  if (label) return label

  const raw = cancelReason?.trim()
  if (!raw) return null

  const withoutPrefix = raw.replace(/^[A-Z_]+\s*-\s*/i, '').trim()
  if (!withoutPrefix) return raw
  return withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1)
}

const VALID_FILTERS: ServiceType[] = ['all', 'food', 'person', 'parcel', 'cancelled', 'completed']

function parseInitialFilter(raw?: string): ServiceType {
  if (raw && VALID_FILTERS.includes(raw as ServiceType)) return raw as ServiceType
  return 'all'
}

type StatusTab = 'all' | 'completed' | 'cancelled'
type SidebarFilter = 'all' | 'food' | 'person' | 'parcel'

function parseInitialStatusTab(filter?: string): StatusTab {
  if (filter === 'cancelled') return 'cancelled'
  if (filter === 'completed') return 'completed'
  return 'all'
}

function parseInitialSidebar(filter?: string): SidebarFilter {
  if (filter === 'food' || filter === 'person' || filter === 'parcel') return filter
  return 'all'
}

function formatServiceTitle(order: UnifiedOrder): string {
  if (order.serviceType === 'food') return order.title
  if (order.serviceType === 'person') {
    const raw = order.title.trim().replace(/_/g, ' ')
    const capped = raw.replace(/\b\w/g, (c) => c.toUpperCase())
    return /\bride\b/i.test(capped) ? capped : `${capped} Ride`
  }
  return order.title.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getRouteParts(order: UnifiedOrder): { pickup: string; drop: string } | null {
  if (order.serviceType === 'food') return null
  const pickup = order.pickupAddress?.trim()
  const drop = order.dropAddress?.trim()
  if (pickup && drop) return { pickup, drop }
  if (order.serviceType === 'person' || order.serviceType === 'parcel') {
    const parts = order.subtitle.split('→').map((s) => s.trim())
    if (parts.length >= 2 && parts[0] && parts[1]) return { pickup: parts[0], drop: parts[1] }
  }
  return null
}

function matchesOrderSearch(order: UnifiedOrder, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    order.title.toLowerCase().includes(q) ||
    order.orderNumber.toLowerCase().includes(q) ||
    order.subtitle.toLowerCase().includes(q) ||
    order.statusLabel.toLowerCase().includes(q) ||
    (order.pickupAddress?.toLowerCase().includes(q) ?? false) ||
    (order.dropAddress?.toLowerCase().includes(q) ?? false)
  )
}

function formatDateRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'All dates'
  const fmt = (s: string) => {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `From ${fmt(from)}`
  return `Until ${fmt(to)}`
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function orderInDateRange(order: UnifiedOrder, from: string, to: string): boolean {
  if (!from && !to) return true
  const created = new Date(order.createdAt)
  if (Number.isNaN(created.getTime())) return true
  if (from) {
    const start = new Date(from)
    start.setHours(0, 0, 0, 0)
    if (created < start) return false
  }
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    if (created > end) return false
  }
  return true
}

function mapApiOrderToUnified(order: ApiOrderSummary): UnifiedOrder {
  const serviceType = order.serviceType
  const statusCfg = getStatusConfig(order.status, serviceType)
  const itemCount = order.items?.length ?? 0

  let title = 'Order'
  let subtitle = order.formattedOrderId ?? order.orderId

  if (serviceType === 'food') {
    title = order.merchantName ?? 'Food Order'
    subtitle = itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : subtitle
  } else if (serviceType === 'person') {
    title = order.rideType?.replace(/_/g, ' ') ?? 'Ride'
    subtitle = `${order.pickupAddress ?? 'Pickup'} → ${order.dropAddress ?? 'Drop'}`
  } else {
    title = order.parcelType?.replace(/_/g, ' ') ?? 'Parcel'
    subtitle = `${order.pickupAddress ?? 'Pickup'} → ${order.dropAddress ?? 'Drop'}`
  }

  return {
    id: String(order.coreOrderId),
    orderNumber: order.formattedOrderId ?? order.orderId,
    serviceType,
    title,
    subtitle,
    status: order.status,
    statusLabel: statusCfg.label,
    amount: order.totalAmount ?? 0,
    createdAt: order.createdAt,
    icon: serviceIcons[serviceType].icon,
    color: serviceType === 'food' ? 'orange' : serviceType === 'person' ? 'blue' : 'purple',
    items: order.items ?? [],
    paymentMethod: order.paymentMethod,
    pickupAddress: order.pickupAddress,
    dropAddress: order.dropAddress,
    cancelReason: order.cancellationReason ?? undefined,
    cancelledByLabel: order.cancelledByLabel ?? undefined,
    raw: order as unknown as FoodOrder,
  }
}

function OrdersPageClient({
  initialFilter,
  initialFrom,
}: {
  initialFilter?: string
  initialFrom?: string
}) {
  const router = useRouter()
  const { isAuthenticated, user, isLoading: authLoading } = useAppSelector(state => state.auth)
  const { enabled: parcelEnabled } = useParcelServiceEnabled()
  const [hasMounted, setHasMounted] = useState(false)
  const [orders, setOrders] = useState<UnifiedOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>(() => parseInitialSidebar(initialFilter))
  const [statusTab, setStatusTab] = useState<StatusTab>(() => parseInitialStatusTab(initialFilter))
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(() => toDateInputValue(new Date(Date.now() - 7 * 86400000)))
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [draftDateFrom, setDraftDateFrom] = useState(dateFrom)
  const [draftDateTo, setDraftDateTo] = useState(dateTo)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<{ orderIds: string[], total: number, restaurantCount: number } | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<UnifiedOrder | null>(null)
  const [backNavigationUrl, setBackNavigationUrl] = useState<string>(() => initialFrom || '/')
  
  // Cancellation flow states
  const [showCancelWarning, setShowCancelWarning] = useState(false)
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState<UnifiedOrder | null>(null)
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [otherReason, setOtherReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelSuccess, setShowCancelSuccess] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    setSidebarFilter(parseInitialSidebar(initialFilter))
    setStatusTab(parseInitialStatusTab(initialFilter))
    setBackNavigationUrl(initialFrom || '/')
  }, [initialFilter, initialFrom])

  useEffect(() => {
    if (!showDatePicker) return
    const onPointerDown = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showDatePicker])

  // Fetch orders for the logged-in customer (orders_core — same DB as customer app)
  useEffect(() => {
    if (!hasMounted || authLoading) return

    const fetchAllOrders = async () => {
      if (!isAuthenticated || !user?.phone) {
        setOrders([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        const params = new URLSearchParams({ phone: user.phone })
        if (user.id && /^\d+$/.test(String(user.id))) {
          params.set('customerId', String(user.id))
        }

        const res = await fetch(`/api/orders/my?${params.toString()}`)
        const data = (await res.json().catch(() => ({}))) as {
          orders?: ApiOrderSummary[]
          error?: string
        }

        if (!res.ok) {
          console.error('[Orders] API error:', data.error)
          setOrders([])
          return
        }

        const unifiedOrders = (data.orders ?? [])
          .map(mapApiOrderToUnified)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        setOrders(unifiedOrders)
      } catch (error) {
        console.error('Error fetching orders:', error)
        setOrders([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllOrders()
    
    // Check for success message
    const successStr = sessionStorage.getItem('orderSuccess')
    if (successStr) {
      setSuccessData(JSON.parse(successStr))
      setShowSuccess(true)
      sessionStorage.removeItem('orderSuccess')
    }
  }, [hasMounted, authLoading, isAuthenticated, user])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const servicePool =
    sidebarFilter === 'all'
      ? orders
      : orders.filter((o) => o.serviceType === sidebarFilter)

  const statusPool =
    statusTab === 'completed'
      ? servicePool.filter((o) => isCompletedStatus(o.status))
      : statusTab === 'cancelled'
      ? servicePool.filter((o) => isCancelledStatus(o.status))
      : servicePool

  const filteredOrders = statusPool
    .filter((o) => orderInDateRange(o, dateFrom, dateTo))
    .filter((o) => matchesOrderSearch(o, searchQuery))

  const sidebarCounts = {
    food: orders.filter((o) => o.serviceType === 'food').length,
    person: orders.filter((o) => o.serviceType === 'person').length,
    parcel: orders.filter((o) => o.serviceType === 'parcel').length,
  }

  const statusCounts = {
    all: servicePool.length,
    completed: servicePool.filter((o) => isCompletedStatus(o.status)).length,
    cancelled: servicePool.filter((o) => isCancelledStatus(o.status)).length,
  }

  const copyOrderId = async (orderNumber: string) => {
    const text = displayOrderId(orderNumber).replace(/^#/, '')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedOrderId(orderNumber)
      setTimeout(() => setCopiedOrderId(null), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  // Cancel order handlers
  const handleCancelClick = (order: UnifiedOrder) => {
    setCancellingOrder(order)
    setShowCancelWarning(true)
  }

  const handleCancelWarningContinue = () => {
    setShowCancelWarning(false)
    setShowCancelReason(true)
  }

  const handleReasonSubmit = () => {
    if (!selectedReason) return
    setShowCancelReason(false)
    setShowCancelConfirm(true)
  }

  const handleConfirmCancel = async () => {
    if (!cancellingOrder || !selectedReason) return
    
    setIsCancelling(true)
    
    try {
      const refundInfo = getRefundInfo(cancellingOrder.status)
      const refundAmount = (cancellingOrder.amount * refundInfo.percentage) / 100
      const finalReason = selectedReason === 'other' ? otherReason : 
        cancellationReasons.find(r => r.id === selectedReason)?.label || selectedReason
      
      // Determine the table based on service type
      let tableName = ''
      if (cancellingOrder.serviceType === 'food') {
        tableName = 'food_orders'
      } else if (cancellingOrder.serviceType === 'person') {
        tableName = 'person_orders'
      } else {
        tableName = 'parcel_orders'
      }
      
      // Update order in Supabase
      const { error } = await supabase
        .from(tableName)
        .update({
          status: 'cancelled',
          cancel_reason: finalReason,
          refund_percentage: refundInfo.percentage,
          refund_amount: refundAmount,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', cancellingOrder.id)
      
      if (error) {
        console.error('Error cancelling order:', error)
        alert('Failed to cancel order. Please try again.')
        return
      }
      
      // Update local state
      setOrders(prevOrders => prevOrders.map(o => 
        o.id === cancellingOrder.id 
          ? { 
              ...o, 
              status: 'cancelled', 
              statusLabel: 'Cancelled',
              cancelReason: finalReason,
              refundPercentage: refundInfo.percentage,
              refundAmount: refundAmount,
              cancelledAt: new Date().toISOString()
            } 
          : o
      ))
      
      setShowCancelConfirm(false)
      setShowCancelSuccess(true)
      
    } catch (error) {
      console.error('Error cancelling order:', error)
      alert('Failed to cancel order. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  const resetCancelFlow = () => {
    setShowCancelWarning(false)
    setShowCancelReason(false)
    setShowCancelConfirm(false)
    setShowCancelSuccess(false)
    setCancellingOrder(null)
    setSelectedReason('')
    setOtherReason('')
  }

  // Redirect to home if not authenticated (after auth restore on client)
  useEffect(() => {
    if (!hasMounted || authLoading) return
    if (!isAuthenticated && !isLoading) {
      router.push('/')
    }
  }, [hasMounted, authLoading, isAuthenticated, isLoading, router])

  if (!hasMounted || authLoading) {
    return <OrdersPageLoading />
  }

  if (!isAuthenticated) {
    return <OrdersPageLoading />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F2F5]">
        {/* Sidebar — desktop, sticky full height */}
        <aside className="hidden h-screen w-56 shrink-0 flex-col border-r border-gray-200/80 bg-white lg:flex">
          <div className="border-b border-gray-100 px-4 py-4">
            <button
              type="button"
              onClick={() => router.push(backNavigationUrl)}
              className="flex items-center gap-2 text-sm text-gray-500 transition hover:text-gray-800"
            >
              <i className="fas fa-arrow-left text-xs" />
              Back
            </button>
          </div>
          <nav className="flex-1 px-3 py-4">
            <div className="rounded-xl bg-[#16c2a5]/10 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#16c2a5]">
                <i className="fas fa-shopping-bag text-sm" />
                Orders
                <i className="fas fa-chevron-down ml-auto text-[10px] opacity-70" />
              </div>
            </div>
            <ul className="relative mt-2 space-y-0.5 pl-4 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-px before:bg-gray-200">
              {(['food', 'person', 'parcel'] as const).map((key) => {
                const meta = FILTER_META[key]
                const active = sidebarFilter === key
                return (
                  <li key={key} className="relative pl-5">
                    <span className="absolute left-0 top-1/2 h-px w-3 bg-gray-200" />
                    <button
                      type="button"
                      onClick={() => setSidebarFilter(key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                        active
                          ? 'bg-[#16c2a5]/10 font-semibold text-[#16c2a5]'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <i className={`${meta.icon} w-4 text-center text-xs`} />
                      <span>{key === 'person' ? 'Person' : meta.label}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-[#16c2a5]/20 text-[#16c2a5]' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sidebarCounts[key]}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={() => setSidebarFilter('all')}
              className={`mt-3 w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                sidebarFilter === 'all' ? 'text-[#16c2a5]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Show all services
            </button>
          </nav>
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile back + title — sticky */}
          <div className="shrink-0 border-b border-gray-200/80 bg-white px-4 py-3 lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push(backNavigationUrl)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600"
                aria-label="Go back"
              >
                <i className="fas fa-arrow-left text-xs" />
              </button>
              <div>
                <h1 className="text-base font-bold text-[#1C1C1C]">My Orders</h1>
                {!isLoading && (
                  <p className="text-xs text-gray-500">{orders.length} total orders</p>
                )}
              </div>
            </div>
          </div>

          {/* Sticky header: title, tabs, search */}
          <div ref={datePickerRef} className="relative shrink-0 border-b border-gray-200/60 bg-[#F0F2F5] px-4 py-4 sm:px-6 lg:px-8">
            {/* Header row — desktop */}
            <div className="mb-4 hidden items-start justify-between gap-4 lg:flex">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#1C1C1C]">My Orders</h1>
                {!isLoading && (
                  <p className="mt-0.5 text-sm text-gray-500">{orders.length} total orders</p>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setDraftDateFrom(dateFrom)
                    setDraftDateTo(dateTo)
                    setShowDatePicker((v) => !v)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm transition hover:border-gray-300"
                >
                  <i className="far fa-calendar text-[#16c2a5]" />
                  {formatDateRangeLabel(dateFrom, dateTo)}
                  <i className={`fas fa-chevron-down text-[10px] text-gray-400 transition ${showDatePicker ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mobile: date */}
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                onClick={() => {
                  setDraftDateFrom(dateFrom)
                  setDraftDateTo(dateTo)
                  setShowDatePicker((v) => !v)
                }}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600"
              >
                <i className="far fa-calendar shrink-0 text-[#16c2a5]" />
                <span className="truncate">{formatDateRangeLabel(dateFrom, dateTo)}</span>
                <i className={`fas fa-chevron-down text-[10px] text-gray-400 transition ${showDatePicker ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {showDatePicker && (
              <div className="absolute right-4 top-full z-30 mt-2 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-lg sm:right-6 lg:right-8 lg:w-72">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Date range</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">From</span>
                    <input
                      type="date"
                      value={draftDateFrom}
                      max={draftDateTo || undefined}
                      onChange={(e) => setDraftDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#16c2a5] focus:ring-2 focus:ring-[#16c2a5]/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">To</span>
                    <input
                      type="date"
                      value={draftDateTo}
                      min={draftDateFrom || undefined}
                      onChange={(e) => setDraftDateTo(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#16c2a5] focus:ring-2 focus:ring-[#16c2a5]/20"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDateFrom(toDateInputValue(new Date(Date.now() - 7 * 86400000)))
                      setDraftDateTo(toDateInputValue(new Date()))
                    }}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  >
                    Last 7 days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDateFrom(toDateInputValue(new Date(Date.now() - 30 * 86400000)))
                      setDraftDateTo(toDateInputValue(new Date()))
                    }}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  >
                    Last 30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDateFrom('')
                      setDraftDateTo('')
                    }}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  >
                    All dates
                  </button>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom(draftDateFrom)
                      setDateTo(draftDateTo)
                      setShowDatePicker(false)
                    }}
                    className="flex-1 rounded-lg bg-[#16c2a5] py-2 text-sm font-semibold text-white hover:bg-[#14b095]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Mobile service chips */}
            <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 lg:hidden scrollbar-hide">
              {(['all', 'food', 'person', 'parcel'] as SidebarFilter[]).map((key) => {
                const label = key === 'all' ? 'All' : key === 'person' ? 'Rides' : FILTER_META[key].label
                const count =
                  key === 'all'
                    ? orders.length
                    : sidebarCounts[key as keyof typeof sidebarCounts]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSidebarFilter(key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                      sidebarFilter === key
                        ? 'bg-[#16c2a5] text-white'
                        : 'border border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 text-[10px] ${sidebarFilter === key ? 'bg-white/25' : 'bg-gray-100'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Status tabs */}
            <div className="mb-3 flex gap-6 overflow-x-auto border-b border-gray-200 scrollbar-hide">
              {([
                { id: 'all' as StatusTab, label: 'All Orders', icon: 'fas fa-shopping-bag' },
                { id: 'completed' as StatusTab, label: 'Completed', icon: 'fas fa-check-circle' },
                { id: 'cancelled' as StatusTab, label: 'Cancelled', icon: 'fas fa-times-circle' },
              ]).map((tab) => {
                const active = statusTab === tab.id
                const count = statusCounts[tab.id]
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusTab(tab.id)}
                    className={`relative flex shrink-0 items-center gap-2 pb-3 text-sm font-medium transition ${
                      active ? 'text-[#16c2a5]' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <i className={`${tab.icon} text-sm ${tab.id === 'cancelled' && !active ? 'text-red-400' : ''}`} />
                    {tab.label}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      active ? 'bg-[#16c2a5]/15 text-[#16c2a5]' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {count}
                    </span>
                    {active && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#16c2a5]" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-800 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-[#16c2a5] focus:ring-2 focus:ring-[#16c2a5]/20"
              />
            </div>
          </div>

          {/* Scrollable order list only */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#16c2a5] border-t-transparent" />
                <p className="text-sm text-gray-500">Loading your orders…</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
                  <i className={`text-2xl ${statusTab === 'cancelled' ? 'fas fa-ban text-red-400' : 'fas fa-receipt text-gray-300'}`} />
                </div>
                <h2 className="mb-1 text-lg font-bold text-[#1C1C1C]">
                  {statusTab === 'cancelled'
                    ? 'No cancelled orders'
                    : statusTab === 'completed'
                    ? 'No completed orders'
                    : searchQuery.trim()
                    ? 'No matching orders'
                    : 'No orders found'}
                </h2>
                <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500">
                  {searchQuery.trim()
                    ? 'Try a different search term or clear the search box.'
                    : statusTab === 'all'
                    ? 'Your orders will appear here once you place them.'
                    : `No ${statusTab} orders for the selected service.`}
                </p>
                {statusTab === 'all' && !searchQuery.trim() && (
                  sidebarFilter === 'parcel' && !parcelEnabled ? (
                    <span
                      className="relative inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-500"
                      title="Parcel — Coming soon in your area"
                    >
                      <i className="fas fa-plus text-xs" />
                      Send a parcel
                      <SoonBadge placement="inline" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          sidebarFilter === 'person' ? '/ride' : sidebarFilter === 'parcel' ? '/courier' : '/order'
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-[#16c2a5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#14b095]"
                    >
                      <i className="fas fa-plus text-xs" />
                      {sidebarFilter === 'person' ? 'Book a ride' : sidebarFilter === 'parcel' ? 'Send a parcel' : 'Start ordering'}
                    </button>
                  )
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const statusConfig = getStatusConfig(order.status, order.serviceType)
                  const serviceConfig = serviceIcons[order.serviceType]
                  const cancelled = isCancelledStatus(order.status)
                  const active = isOrderActive(order.status)
                  const canCancel = canCancelOrder(order.status)
                  const route = getRouteParts(order)
                  const isDelivered = isCompletedStatus(order.status)

                  const cancelNote = formatCancellationDisplay(order.cancelReason, order.cancelledByLabel)

                  return (
                    <article
                      key={order.id}
                      className="flex overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                    >
                      <div
                        className={`w-1 shrink-0 ${cancelled ? 'bg-red-400' : 'bg-[#16c2a5]'}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#16c2a5]/10">
                            <i className={`${serviceConfig.icon} text-lg text-[#16c2a5]`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-[#1C1C1C]">{formatServiceTitle(order)}</p>
                                <p className="mt-0.5 text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-lg font-bold text-[#1C1C1C]">{formatOrderMoney(order.amount)}</p>
                                <span
                                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    isDelivered
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : cancelled
                                      ? 'bg-red-50 text-red-600'
                                      : statusConfig.color
                                  }`}
                                >
                                  <i className={`${isDelivered ? 'fas fa-check-circle' : statusConfig.icon} text-[9px]`} />
                                  {statusConfig.label}
                                </span>
                              </div>
                            </div>

                            {route && (
                              <div className="mt-4 rounded-xl bg-[#F5F7FA] px-4 py-3">
                                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                                  <div className="flex min-w-0 flex-1 items-start gap-2">
                                    <i className="fas fa-map-marker-alt mt-0.5 shrink-0 text-xs text-[#16c2a5]" />
                                    <span className="line-clamp-2 text-xs leading-relaxed text-gray-600">{route.pickup}</span>
                                  </div>
                                  <i className="fas fa-arrow-right hidden shrink-0 text-[10px] text-gray-300 sm:block" />
                                  <div className="flex min-w-0 flex-1 items-start gap-2">
                                    <i className="fas fa-map-marker-alt mt-0.5 shrink-0 text-xs text-[#16c2a5]" />
                                    <span className="line-clamp-2 text-xs leading-relaxed text-gray-600">{route.drop}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {!route && order.serviceType === 'food' && order.subtitle && (
                              <p className="mt-3 text-xs text-gray-500">{order.subtitle}</p>
                            )}

                            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                              <button
                                type="button"
                                onClick={() => copyOrderId(order.orderNumber)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 font-mono text-[11px] text-gray-500 transition hover:bg-gray-100"
                              >
                                {displayOrderId(order.orderNumber)}
                                <i className={`text-[10px] ${copiedOrderId === order.orderNumber ? 'fas fa-check text-emerald-500' : 'far fa-copy'}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                className="text-xs font-semibold text-[#16c2a5] transition hover:text-[#14b095]"
                              >
                                View details <i className="fas fa-chevron-right ml-0.5 text-[9px]" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {cancelled && cancelNote && (
                        <div className="border-t border-red-50 bg-red-50/40 px-5 py-3">
                          <p className="text-xs text-red-600">
                            <span className="font-semibold">Reason:</span> {cancelNote}
                          </p>
                        </div>
                      )}

                      {active && (
                        <div className="border-t border-gray-100 px-5 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16c2a5] py-2.5 text-sm font-semibold text-white transition hover:bg-[#14b095]"
                            >
                              <i className="fas fa-map-marker-alt text-xs" />
                              Track order
                            </button>
                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => handleCancelClick(order)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                <i className="fas fa-times-circle text-xs" />
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      {/* Success Modal */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSuccess(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            {/* Success animation */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check-circle text-green-500 text-4xl animate-bounce"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              Order Placed Successfully! 🎉
            </h2>
            <p className="text-gray-600 text-center mb-4">
              {successData.restaurantCount > 1 
                ? `${successData.restaurantCount} orders have been placed.` 
                : 'Your order has been placed.'}
            </p>
            <div className="bg-green-50 rounded-xl p-4 mb-6 text-center">
              <p className="text-sm text-gray-500">Total Amount</p>
              <p className="text-2xl font-bold text-green-600">₹{successData.total}</p>
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg transition-all"
            >
              View My Orders
            </button>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className={`sticky top-0 px-6 py-4 text-white ${
              selectedOrder.serviceType === 'food' ? 'bg-orange-500' :
              selectedOrder.serviceType === 'person' ? 'bg-sky-500' :
              'bg-violet-500'
            }`}>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
              <p className="text-sm text-white/80">
                {selectedOrder.serviceType === 'food' ? 'Order ID' : 
                 selectedOrder.serviceType === 'person' ? 'Booking ID' : 'Tracking ID'}
              </p>
              <p className="font-bold">{selectedOrder.orderNumber}</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Title & Icon */}
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${serviceIcons[selectedOrder.serviceType].bg}`}>
                  <i className={`${serviceIcons[selectedOrder.serviceType].icon} ${serviceIcons[selectedOrder.serviceType].color}`}></i>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{selectedOrder.title}</p>
                  <p className="text-sm text-gray-500">{formatDate(selectedOrder.createdAt)}</p>
                </div>
              </div>

              {/* Status */}
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getStatusConfig(selectedOrder.status, selectedOrder.serviceType).color}`}>
                <i className={getStatusConfig(selectedOrder.status, selectedOrder.serviceType).icon}></i>
                <span className="font-medium text-sm">{selectedOrder.statusLabel}</span>
              </div>

              {/* Service-specific details */}
              {selectedOrder.serviceType === 'food' && selectedOrder.items.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Order Items</p>
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="flex justify-between py-2 border-b border-gray-200 last:border-0">
                      <div>
                        <span className="text-gray-600">{item.quantity}x </span>
                        <span className="text-gray-900">{item.name}</span>
                        {item.variantName ? (
                          <p className="text-xs text-gray-500 mt-0.5">{item.variantName}</p>
                        ) : null}
                        {item.customization ? (
                          <p className="text-xs text-gray-500 mt-0.5">{item.customization}</p>
                        ) : null}
                      </div>
                      <span className="font-medium">{formatLineItemMoney(item)}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedOrder.serviceType === 'person' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Pickup</p>
                      <p className="font-medium text-gray-900">{selectedOrder.pickupAddress ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Drop-off</p>
                      <p className="font-medium text-gray-900">{selectedOrder.dropAddress ?? '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.serviceType === 'parcel' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Pickup</p>
                      <p className="font-medium text-gray-900">{selectedOrder.pickupAddress ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Delivery</p>
                      <p className="font-medium text-gray-900">{selectedOrder.dropAddress ?? '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between text-lg font-bold text-gray-900 pt-4 border-t">
                <span>Total</span>
                <span>{formatOrderMoney(selectedOrder.amount)}</span>
              </div>

              {/* Payment Method */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <i className="fas fa-credit-card"></i>
                <span>Payment: {(selectedOrder.paymentMethod ?? 'cod').toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Warning Modal */}
      {showCancelWarning && cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetCancelFlow}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-exclamation-triangle text-yellow-500 text-2xl"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Cancel Order?</h2>
            <p className="text-gray-600 text-center mb-4 leading-relaxed">
              Before cancelling, please note that refund eligibility depends on the order status.
              <span className="block mt-2 font-medium text-gray-700">
                If the order is already prepared or dispatched, a full refund may not be possible.
              </span>
            </p>
            <div className="p-3 bg-gray-50 rounded-xl mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${serviceIcons[cancellingOrder.serviceType].bg} flex items-center justify-center`}>
                  <i className={`${serviceIcons[cancellingOrder.serviceType].icon} ${serviceIcons[cancellingOrder.serviceType].color}`}></i>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{cancellingOrder.orderNumber}</p>
                  <p className="text-sm text-gray-500">{cancellingOrder.title}</p>
                </div>
                <div className="ml-auto font-bold text-gray-900">{formatOrderMoney(cancellingOrder.amount)}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetCancelFlow}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelWarningContinue}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reason Modal */}
      {showCancelReason && cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetCancelFlow}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Why are you cancelling?</h2>
            <p className="text-gray-500 text-center mb-4 text-sm">Please select a reason to help us improve</p>
            
            <div className="space-y-2 mb-4">
              {cancellationReasons.map((reason) => (
                <label
                  key={reason.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    selectedReason === reason.id
                      ? 'bg-red-50 border-2 border-red-300'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason.id}
                    checked={selectedReason === reason.id}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-4 h-4 text-red-500 focus:ring-red-500"
                  />
                  <span className="font-medium text-gray-700">{reason.label}</span>
                </label>
              ))}
            </div>
            
            {selectedReason === 'other' && (
              <textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Please specify your reason..."
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-red-300 focus:outline-none mb-4 resize-none"
                rows={3}
              />
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelReason(false); setShowCancelWarning(true); }}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleReasonSubmit}
                disabled={!selectedReason || (selectedReason === 'other' && !otherReason.trim())}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetCancelFlow}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-gray-900 text-center mb-4">Refund Information</h2>
            
            {(() => {
              const refundInfo = getRefundInfo(cancellingOrder.status)
              const refundAmount = (cancellingOrder.amount * refundInfo.percentage) / 100
              
              return (
                <>
                  <div className={`p-4 rounded-xl mb-4 ${
                    refundInfo.percentage === 100 ? 'bg-green-50 border border-green-200' :
                    refundInfo.percentage === 50 ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      <i className={`fas ${
                        refundInfo.percentage === 100 ? 'fa-check-circle text-green-500' :
                        refundInfo.percentage === 50 ? 'fa-exclamation-circle text-yellow-500' :
                        'fa-times-circle text-red-500'
                      } text-xl`}></i>
                      <span className={`font-bold text-lg ${
                        refundInfo.percentage === 100 ? 'text-green-700' :
                        refundInfo.percentage === 50 ? 'text-yellow-700' :
                        'text-red-700'
                      }`}>
                        {refundInfo.percentage}% Refund
                      </span>
                    </div>
                    <p className={`text-sm ${
                      refundInfo.percentage === 100 ? 'text-green-600' :
                      refundInfo.percentage === 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {refundInfo.message}
                    </p>
                    {refundAmount > 0 && (
                      <p className="mt-2 text-lg font-bold text-gray-900">
                        Refund Amount: ₹{refundAmount.toFixed(0)}
                      </p>
                    )}
                  </div>
                  
                  <p className="text-gray-600 text-center mb-4">
                    Are you sure you want to cancel this order?
                  </p>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowCancelConfirm(false); setShowCancelReason(true); }}
                      disabled={isCancelling}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleConfirmCancel}
                      disabled={isCancelling}
                      className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isCancelling ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Cancelling...
                        </>
                      ) : (
                        'Confirm Cancel'
                      )}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Cancel Success Modal */}
      {showCancelSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetCancelFlow}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check-circle text-green-500 text-3xl"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Order Cancelled</h2>
            <p className="text-gray-600 text-center mb-6">
              Your order has been cancelled successfully.
            </p>
            <button
              onClick={resetCancelFlow}
              className="w-full py-3 bg-[#16c2a5] text-white font-bold rounded-xl hover:bg-[#14b095] transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrdersPageClient
