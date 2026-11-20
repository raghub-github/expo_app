'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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
  paymentStatus?: string | null
  pickupAddress?: string | null
  dropAddress?: string | null
  deliveryAddress?: string | null
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
    paymentStatus: order.paymentStatus,
    pickupAddress: order.pickupAddress,
    dropAddress: order.dropAddress,
    deliveryAddress: order.deliveryAddress,
    cancelReason: order.cancellationReason ?? undefined,
    cancelledByLabel: order.cancelledByLabel ?? undefined,
    raw: order as unknown as FoodOrder,
  }
}

function formatPaymentMethod(method: string | null | undefined): string {
  const m = (method || 'cod').trim().toLowerCase()
  if (m === 'cod' || m === 'cash') return 'Cash on delivery'
  if (m === 'upi') return 'UPI'
  if (m === 'card' || m === 'credit_card' || m === 'debit_card') return 'Card'
  if (m === 'wallet' || m === 'gaticash') return 'GatiCash wallet'
  if (m === 'razorpay' || m === 'online' || m === 'prepaid') return 'Online payment'
  return method?.replace(/_/g, ' ').toUpperCase() || 'Cash on delivery'
}

function formatPaymentStatus(status: string | null | undefined): { label: string; ok: boolean } {
  const s = (status || '').trim().toUpperCase()
  if (!s) return { label: 'Pending', ok: false }
  if (s === 'PAID' || s === 'SUCCESS' || s === 'CAPTURED' || s === 'COMPLETED') {
    return { label: 'Paid', ok: true }
  }
  if (s === 'FAILED' || s === 'PAYMENT_FAILED') return { label: 'Failed', ok: false }
  if (s === 'REFUNDED' || s === 'PARTIAL_REFUND') return { label: 'Refunded', ok: false }
  if (s === 'PENDING' || s === 'CREATED' || s === 'INCOMPLETE') {
    return { label: 'Payment incomplete', ok: false }
  }
  return { label: status!.replace(/_/g, ' '), ok: false }
}

function serviceTypeLabel(t: 'food' | 'person' | 'parcel'): string {
  if (t === 'food') return 'Food delivery'
  if (t === 'person') return 'Ride'
  return 'Parcel'
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
  // Default: all dates so every order shows
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
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

  const formatOrderedOnCard = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      if (Number.isNaN(d.getTime())) return dateStr
      const date = d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      const time = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      return `${date} at ${time}`
    } catch {
      return formatDate(dateStr)
    }
  }

  const itemsLineForCard = (order: UnifiedOrder) => {
    if (order.serviceType === 'food' && order.items?.length) {
      return order.items.map((i) => `${i.quantity} x ${i.name}`).join(', ')
    }
    const route = getRouteParts(order)
    if (route) return `${route.pickup} → ${route.drop}`
    return order.subtitle || '—'
  }

  const locationForCard = (order: UnifiedOrder) => {
    if (order.serviceType === 'food') {
      const drop = (order.dropAddress || '').trim()
      if (drop) {
        const parts = drop.split(',').map((p) => p.trim()).filter(Boolean)
        return parts.slice(-2).join(', ') || 'Food delivery'
      }
      return 'Food delivery'
    }
    const drop = (order.dropAddress || '').trim()
    if (drop) {
      const parts = drop.split(',').map((p) => p.trim()).filter(Boolean)
      return parts.slice(-2).join(', ') || drop
    }
    return order.serviceType === 'person' ? 'Ride' : 'Parcel'
  }

  return (
    <div className="min-h-screen w-full bg-[#f4f6f5]">
      {/* Top bar — search inline (no separate row) */}
      <header className="sticky top-0 z-20 w-full border-b border-black/[0.06] bg-white/95 backdrop-blur">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-10 xl:px-14">
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(backNavigationUrl)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#1c1c1c] transition hover:bg-[#f0f4f1]"
              aria-label="Go back"
            >
              <i className="fas fa-arrow-left text-sm" />
            </button>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-[#1c1c1c]">My Orders</p>
              {!isLoading && (
                <p className="text-xs text-[#6b7a70]">{orders.length} total orders</p>
              )}
            </div>
          </div>

          <div className="relative min-w-0 flex-1 order-3 w-full sm:order-none sm:w-auto">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8a968e]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders…"
              className="w-full rounded-xl border border-[#d8e0db] bg-[#f4f6f5] py-2.5 pl-9 pr-3 text-sm text-[#1c1c1c] outline-none transition placeholder:text-[#8a968e] focus:border-[#109D4C] focus:bg-white focus:ring-2 focus:ring-[#109D4C]/15"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/reviews"
              className="inline-flex rounded-xl bg-[#109D4C] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0d7a3c]"
            >
              Reviews
            </Link>
          </div>
        </div>
      </header>

      {/* Brand banner */}
      <section className="relative w-full overflow-hidden bg-[#109D4C]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 120% at 0% 0%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 100%, rgba(8,90,45,0.55), transparent 50%)',
          }}
        />
        <div className="relative flex w-full flex-col gap-4 px-4 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-9 lg:px-10 xl:px-14">
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">My Orders</h1>
            <p className="mt-1 text-sm text-white/85">
              Track food, rides, and parcels in one place
            </p>
          </div>
          <div ref={datePickerRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setDraftDateFrom(dateFrom)
                setDraftDateTo(dateTo)
                setShowDatePicker((v) => !v)
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
            >
              <i className="far fa-calendar" />
              {formatDateRangeLabel(dateFrom, dateTo)}
              <i className={`fas fa-chevron-down text-[10px] transition ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full z-30 mt-2 w-[min(100vw-2rem,18rem)] rounded-xl border border-[#e2e8e4] bg-white p-4 shadow-lg">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6b7a70]">Date range</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#3d4a42]">From</span>
                    <input
                      type="date"
                      value={draftDateFrom}
                      max={draftDateTo || undefined}
                      onChange={(e) => setDraftDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-[#d8e0db] px-3 py-2 text-sm outline-none focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#3d4a42]">To</span>
                    <input
                      type="date"
                      value={draftDateTo}
                      min={draftDateFrom || undefined}
                      onChange={(e) => setDraftDateTo(e.target.value)}
                      className="w-full rounded-lg border border-[#d8e0db] px-3 py-2 text-sm outline-none focus:border-[#109D4C] focus:ring-2 focus:ring-[#109D4C]/20"
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
                    className="rounded-lg bg-[#eef2ef] px-2.5 py-1 text-xs font-medium text-[#3d4a42] hover:bg-[#e2e8e4]"
                  >
                    Last 7 days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDateFrom(toDateInputValue(new Date(Date.now() - 30 * 86400000)))
                      setDraftDateTo(toDateInputValue(new Date()))
                    }}
                    className="rounded-lg bg-[#eef2ef] px-2.5 py-1 text-xs font-medium text-[#3d4a42] hover:bg-[#e2e8e4]"
                  >
                    Last 30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDateFrom('')
                      setDraftDateTo('')
                    }}
                    className="rounded-lg bg-[#eef2ef] px-2.5 py-1 text-xs font-medium text-[#3d4a42] hover:bg-[#e2e8e4]"
                  >
                    All dates
                  </button>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 rounded-lg border border-[#d8e0db] py-2 text-sm font-medium text-[#3d4a42] hover:bg-[#f4f6f5]"
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
                    className="flex-1 rounded-lg bg-[#109D4C] py-2 text-sm font-semibold text-white hover:bg-[#0d7a3c]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-10 xl:px-14">
        {/* One toolbar row: service + status (search is in header) */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {(['all', 'food', 'person', 'parcel'] as SidebarFilter[]).map((key) => {
            const label = key === 'all' ? 'All' : key === 'person' ? 'Rides' : FILTER_META[key].label
            const count =
              key === 'all' ? orders.length : sidebarCounts[key as keyof typeof sidebarCounts]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSidebarFilter(key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  sidebarFilter === key
                    ? 'bg-[#109D4C] text-white'
                    : 'border border-[#d8e0db] bg-white text-[#3d4a42] hover:bg-[#eef2ef]'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    sidebarFilter === key ? 'bg-white/25' : 'bg-[#eef2ef]'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}

          <span className="mx-1 hidden h-5 w-px bg-[#d8e0db] sm:block" aria-hidden />

          {(
            [
              { id: 'all' as StatusTab, label: 'All Orders' },
              { id: 'completed' as StatusTab, label: 'Completed' },
              { id: 'cancelled' as StatusTab, label: 'Cancelled' },
            ] as const
          ).map((tab) => {
            const active = statusTab === tab.id
            const count = statusCounts[tab.id]
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-[#142018] text-white'
                    : 'border border-[#d8e0db] bg-white text-[#3d4a42] hover:bg-[#eef2ef]'
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    active ? 'bg-white/20' : 'bg-[#eef2ef]'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#109D4C] border-t-transparent" />
            <p className="text-sm text-[#6b7a70]">Loading your orders…</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="w-full rounded-2xl border border-[#e2e8e4] bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef2ef]">
              <i
                className={`text-2xl ${
                  statusTab === 'cancelled' ? 'fas fa-ban text-red-400' : 'fas fa-receipt text-[#c5cdc8]'
                }`}
              />
            </div>
            <h2 className="mb-1 text-lg font-bold text-[#142018]">
              {statusTab === 'cancelled'
                ? 'No cancelled orders'
                : statusTab === 'completed'
                  ? 'No completed orders'
                  : searchQuery.trim()
                    ? 'No matching orders'
                    : 'No orders found'}
            </h2>
            <p className="mx-auto mb-6 max-w-sm text-sm text-[#6b7a70]">
              {searchQuery.trim()
                ? 'Try a different search term or clear the search box.'
                : statusTab === 'all'
                  ? 'Your orders will appear here once you place them.'
                  : `No ${statusTab} orders for the selected service.`}
            </p>
            {statusTab === 'all' && !searchQuery.trim() ? (
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
                      sidebarFilter === 'person'
                        ? '/ride'
                        : sidebarFilter === 'parcel'
                          ? '/parcel'
                          : '/order'
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#109D4C] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d7a3c]"
                >
                  <i className="fas fa-plus text-xs" />
                  {sidebarFilter === 'person'
                    ? 'Book a ride'
                    : sidebarFilter === 'parcel'
                      ? 'Send a parcel'
                      : 'Start ordering'}
                </button>
              )
            ) : null}
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredOrders.map((order) => {
              const serviceConfig = serviceIcons[order.serviceType]
              const cancelled = isCancelledStatus(order.status)
              const active = isOrderActive(order.status)
              const canCancel = canCancelOrder(order.status)
              const isDelivered = isCompletedStatus(order.status)
              const cancelNote = formatCancellationDisplay(
                order.cancelReason,
                order.cancelledByLabel
              )
              const statusLabel = isDelivered
                ? 'Delivered'
                : cancelled
                  ? 'Cancelled'
                  : getStatusConfig(order.status, order.serviceType).label

              return (
                <article
                  key={order.id}
                  className="flex w-full flex-col rounded-2xl border border-[#e2e8e4] bg-white p-4 shadow-[0_1px_3px_rgba(16,60,40,0.04)] transition hover:border-[#109D4C]/35 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#eef2ef] text-[#6b7a70]">
                      <i className={`${serviceConfig.icon} text-lg`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-[#142018]">
                            {formatServiceTitle(order)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[#6b7a70]">
                            {locationForCard(order)}
                          </p>
                        </div>
                        <span className="shrink-0 pt-0.5 text-right text-xs font-semibold text-[#6b7a70]">
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="my-3.5 border-t border-[#eef2ef]" />

                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a968e]">
                        Order number
                      </p>
                      <button
                        type="button"
                        onClick={() => copyOrderId(order.orderNumber)}
                        className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#142018] hover:text-[#109D4C]"
                      >
                        {displayOrderId(order.orderNumber).replace(/^#/, '')}
                        <i
                          className={`text-[10px] ${
                            copiedOrderId === order.orderNumber
                              ? 'fas fa-check text-[#109D4C]'
                              : 'far fa-copy text-[#8a968e]'
                          }`}
                        />
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a968e]">
                        Total amount
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[#142018]">
                        {formatOrderMoney(order.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a968e]">
                        {order.serviceType === 'food' ? 'Items' : 'Route'}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-[#142018]">
                        {itemsLineForCard(order)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a968e]">
                        Ordered on
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-[#142018]">
                        {formatOrderedOnCard(order.createdAt)}
                      </p>
                    </div>
                  </div>

                  {cancelled && cancelNote ? (
                    <p className="mt-3 text-xs text-red-600">
                      <span className="font-semibold">Reason:</span> {cancelNote}
                    </p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
                    {active ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#109D4C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d7a3c]"
                        >
                          Track
                        </button>
                        {canCancel ? (
                          <button
                            type="button"
                            onClick={() => handleCancelClick(order)}
                            className="inline-flex items-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="inline-flex items-center rounded-lg border border-[#109D4C] px-3.5 py-1.5 text-xs font-semibold text-[#109D4C] transition hover:bg-[#e8f3ec]"
                    >
                      View Details
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

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
      {selectedOrder && (() => {
        const st = getStatusConfig(selectedOrder.status, selectedOrder.serviceType)
        const pay = formatPaymentStatus(selectedOrder.paymentStatus)
        const cancelled = isCancelledStatus(selectedOrder.status)
        const completed = isCompletedStatus(selectedOrder.status)
        const active = isOrderActive(selectedOrder.status)
        const canCancel = canCancelOrder(selectedOrder.status)
        const cancelNote = formatCancellationDisplay(
          selectedOrder.cancelReason,
          selectedOrder.cancelledByLabel
        )
        const idLabel =
          selectedOrder.serviceType === 'food'
            ? 'Order ID'
            : selectedOrder.serviceType === 'person'
              ? 'Booking ID'
              : 'Tracking ID'
        const deliveryLine =
          selectedOrder.serviceType === 'food'
            ? selectedOrder.deliveryAddress || selectedOrder.dropAddress
            : null
        const itemSubtotal = selectedOrder.items.reduce((sum, item) => {
          const line = item.lineTotal ?? item.price * item.quantity
          return sum + (Number.isFinite(line) ? line : 0)
        }, 0)

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              onClick={() => setSelectedOrder(null)}
            />
            <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
              {/* Header */}
              <div className="shrink-0 bg-[#109D4C] px-5 pb-5 pt-4 text-white">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
                      {idLabel}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyOrderId(selectedOrder.orderNumber)}
                      className="mt-0.5 inline-flex items-center gap-2 text-left"
                    >
                      <span className="truncate text-xl font-bold">
                        {displayOrderId(selectedOrder.orderNumber)}
                      </span>
                      <i
                        className={`text-xs ${
                          copiedOrderId === selectedOrder.orderNumber
                            ? 'fas fa-check text-white'
                            : 'far fa-copy text-white/70'
                        }`}
                      />
                    </button>
                    <p className="mt-1 text-xs text-white/80">
                      {serviceTypeLabel(selectedOrder.serviceType)} ·{' '}
                      {formatDate(selectedOrder.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition hover:bg-white/30"
                    aria-label="Close"
                  >
                    <i className="fas fa-times text-sm" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                      completed
                        ? 'bg-white text-[#0d7a3c]'
                        : cancelled
                          ? 'bg-red-500 text-white'
                          : 'bg-white/20 text-white'
                    }`}
                  >
                    <i className={`${completed ? 'fas fa-check-circle' : st.icon} text-[10px]`} />
                    {selectedOrder.statusLabel}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      pay.ok ? 'bg-white/20 text-white' : 'bg-amber-400/90 text-[#3a2a00]'
                    }`}
                  >
                    {pay.label}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {/* Store / service */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ec] text-[#109D4C]">
                    <i className={`${serviceIcons[selectedOrder.serviceType].icon} text-lg`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-[#142018]">
                      {formatServiceTitle(selectedOrder)}
                    </p>
                    <p className="text-xs text-[#6b7a70]">
                      {selectedOrder.serviceType === 'food'
                        ? selectedOrder.subtitle
                        : serviceTypeLabel(selectedOrder.serviceType)}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    <p className="text-lg font-bold text-[#142018]">
                      {formatOrderMoney(selectedOrder.amount)}
                    </p>
                  </div>
                </div>

                {/* Food items */}
                {selectedOrder.serviceType === 'food' ? (
                  <div className="rounded-2xl border border-[#e2e8e4] bg-[#f8faf8] p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b7a70]">
                      Items ({selectedOrder.items.length || 0})
                    </p>
                    {selectedOrder.items.length > 0 ? (
                      <ul className="space-y-2.5">
                        {selectedOrder.items.map((item, index) => (
                          <li key={index} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-[#142018]">
                                <span className="font-semibold text-[#109D4C]">
                                  {item.quantity}×
                                </span>{' '}
                                {item.name}
                              </p>
                              {item.variantName ? (
                                <p className="text-xs text-[#6b7a70]">{item.variantName}</p>
                              ) : null}
                              {item.customization ? (
                                <p className="text-xs text-[#6b7a70]">{item.customization}</p>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-[#142018]">
                              {formatLineItemMoney(item)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#6b7a70]">Item details unavailable</p>
                    )}
                    {selectedOrder.items.length > 0 ? (
                      <div className="mt-3 flex justify-between border-t border-[#e2e8e4] pt-3 text-sm">
                        <span className="text-[#6b7a70]">Items total</span>
                        <span className="font-semibold text-[#142018]">
                          ₹{Math.round(itemSubtotal)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Route — ride / parcel */}
                {(selectedOrder.serviceType === 'person' ||
                  selectedOrder.serviceType === 'parcel') && (
                  <div className="rounded-2xl border border-[#e2e8e4] bg-[#f8faf8] p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b7a70]">
                      Route
                    </p>
                    <div className="relative space-y-4 pl-1">
                      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[#d8e0db]" aria-hidden />
                      <div className="relative flex gap-3">
                        <span className="relative z-[1] mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#109D4C] bg-white" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#109D4C]">
                            Pickup
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-[#142018]">
                            {selectedOrder.pickupAddress || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="relative flex gap-3">
                        <span className="relative z-[1] mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-[#ef4f5f]" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#ef4f5f]">
                            {selectedOrder.serviceType === 'person' ? 'Drop-off' : 'Delivery'}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-[#142018]">
                            {selectedOrder.dropAddress || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Food delivery address */}
                {selectedOrder.serviceType === 'food' && deliveryLine ? (
                  <div className="rounded-2xl border border-[#e2e8e4] bg-[#f8faf8] p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b7a70]">
                      Deliver to
                    </p>
                    <div className="flex gap-2">
                      <i className="fas fa-map-marker-alt mt-0.5 text-xs text-[#109D4C]" />
                      <p className="text-sm leading-snug text-[#142018]">{deliveryLine}</p>
                    </div>
                  </div>
                ) : null}

                {/* Payment & summary */}
                <div className="rounded-2xl border border-[#e2e8e4] p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b7a70]">
                    Payment
                  </p>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-[#6b7a70]">Method</span>
                      <span className="font-semibold text-[#142018]">
                        {formatPaymentMethod(selectedOrder.paymentMethod)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#6b7a70]">Status</span>
                      <span
                        className={`font-semibold ${
                          pay.ok ? 'text-[#109D4C]' : 'text-amber-700'
                        }`}
                      >
                        {pay.label}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-[#eef2ef] pt-2.5">
                      <span className="font-bold text-[#142018]">Order total</span>
                      <span className="text-lg font-bold text-[#109D4C]">
                        {formatOrderMoney(selectedOrder.amount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cancellation */}
                {cancelled && (cancelNote || selectedOrder.refundAmount != null) ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-red-600">
                      Cancellation
                    </p>
                    {cancelNote ? (
                      <p className="text-sm text-red-700">
                        <span className="font-semibold">Reason:</span> {cancelNote}
                      </p>
                    ) : null}
                    {selectedOrder.refundPercentage != null ? (
                      <p className="mt-1 text-sm text-red-700">
                        Refund: {selectedOrder.refundPercentage}%
                        {selectedOrder.refundAmount != null
                          ? ` (${formatOrderMoney(selectedOrder.refundAmount)})`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Footer actions */}
              <div className="shrink-0 border-t border-[#eef2ef] bg-white px-5 py-4">
                <div className="flex gap-2">
                  {active ? (
                    <>
                      <button
                        type="button"
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#109D4C] py-3 text-sm font-bold text-white hover:bg-[#0d7a3c]"
                      >
                        <i className="fas fa-location-arrow text-xs" />
                        Track order
                      </button>
                      {canCancel ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrder(null)
                            handleCancelClick(selectedOrder)
                          }}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(null)}
                      className="flex w-full items-center justify-center rounded-xl bg-[#109D4C] py-3 text-sm font-bold text-white hover:bg-[#0d7a3c]"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
