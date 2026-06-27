'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import { supabase } from '@/lib/supabase'

type ServiceType = 'all' | 'food' | 'person' | 'parcel' | 'cancelled' | 'completed'

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
  cancelReason?: string
  refundPercentage?: number
  refundAmount?: number
  cancelledAt?: string
  raw: FoodOrder | PersonOrder | ParcelOrder
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
const getRefundInfo = (status: string) => {
  const noRefundStatuses = ['delivered', 'completed', 'out_for_delivery', 'in_transit', 'driver_arrived']
  const halfRefundStatuses = ['confirmed', 'preparing', 'driver_assigned', 'pickup_assigned', 'picked_up', 'accepted']
  const fullRefundStatuses = ['pending']
  
  if (noRefundStatuses.includes(status)) {
    return { percentage: 0, message: 'This order is not eligible for a refund as it is already in progress or delivered.' }
  } else if (halfRefundStatuses.includes(status)) {
    return { percentage: 50, message: 'You are eligible for a 50% refund for this order.' }
  } else if (fullRefundStatuses.includes(status)) {
    return { percentage: 100, message: 'You are eligible for a 100% refund for this order.' }
  }
  return { percentage: 0, message: 'This order is not eligible for a refund.' }
}

// Check if cancellation is allowed
const canCancelOrder = (status: string) => {
  const nonCancellableStatuses = ['delivered', 'completed', 'cancelled', 'returned']
  return !nonCancellableStatuses.includes(status)
}

const getStatusConfig = (status: string, serviceType: 'food' | 'person' | 'parcel') => {
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
  return configs[serviceType]?.[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: 'fas fa-circle' }
}

const serviceIcons: Record<string, { icon: string; color: string; bg: string }> = {
  food: { icon: 'fas fa-utensils', color: 'text-orange-600', bg: 'bg-orange-100' },
  person: { icon: 'fas fa-car', color: 'text-blue-600', bg: 'bg-blue-100' },
  parcel: { icon: 'fas fa-box', color: 'text-purple-600', bg: 'bg-purple-100' },
}

function OrdersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user } = useAppSelector(state => state.auth)
  const [orders, setOrders] = useState<UnifiedOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<ServiceType>('all')
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<{ orderIds: string[], total: number, restaurantCount: number } | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<UnifiedOrder | null>(null)
  const [backNavigationUrl, setBackNavigationUrl] = useState<string>('/')
  
  // Cancellation flow states
  const [showCancelWarning, setShowCancelWarning] = useState(false)
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState<UnifiedOrder | null>(null)
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [otherReason, setOtherReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelSuccess, setShowCancelSuccess] = useState(false)

  // Initialize query params on mount only
  useEffect(() => {
    if (!searchParams) return
    
    const filterParam = searchParams.get('filter')
    const backUrl = searchParams.get('from') || '/'
    
    if (filterParam && ['all', 'food', 'person', 'parcel', 'cancelled', 'completed'].includes(filterParam)) {
      setActiveFilter(filterParam as ServiceType)
    }
    setBackNavigationUrl(backUrl)
  }, [])

  // Fetch orders from all three tables
  useEffect(() => {
    const fetchAllOrders = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        // Use user_id (GMMS ID) if available, otherwise fall back to id
        const userId = user.user_id || user.id
        
        console.log('[Orders] Fetching orders for user:', userId)

        // Fetch from all three tables in parallel
        const [foodResult, personResult, parcelResult] = await Promise.all([
          supabase
            .from('food_orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('person_orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('parcel_orders')
            .select('*')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false })
        ])
        
        console.log('[Orders] Food orders:', foodResult.data?.length || 0, foodResult.error)
        console.log('[Orders] Person orders:', personResult.data?.length || 0, personResult.error)
        console.log('[Orders] Parcel orders:', parcelResult.data?.length || 0, parcelResult.error)

        const unifiedOrders: UnifiedOrder[] = []

        // Process food orders
        if (foodResult.data) {
          foodResult.data.forEach((order: FoodOrder) => {
            const status = getStatusConfig(order.status, 'food')
            unifiedOrders.push({
              id: order.id,
              orderNumber: order.order_number,
              serviceType: 'food',
              title: order.restaurant_name,
              subtitle: `${(order.items as FoodOrderItem[])?.length || 0} items`,
              status: order.status,
              statusLabel: status.label,
              amount: order.total_amount,
              createdAt: order.created_at,
              icon: 'fas fa-utensils',
              color: 'orange',
              cancelReason: order.cancel_reason,
              refundPercentage: order.refund_percentage,
              refundAmount: order.refund_amount,
              cancelledAt: order.cancelled_at,
              raw: order
            })
          })
        }

        // Process person orders (rides)
        if (personResult.data) {
          personResult.data.forEach((order: PersonOrder) => {
            const status = getStatusConfig(order.status, 'person')
            unifiedOrders.push({
              id: order.id,
              orderNumber: order.booking_number,
              serviceType: 'person',
              title: order.vehicle_name,
              subtitle: `${order.pickup_location?.address || 'Pickup'} → ${order.dropoff_location?.address || 'Drop'}`,
              status: order.status,
              statusLabel: status.label,
              amount: order.total_amount,
              createdAt: order.created_at,
              icon: 'fas fa-car',
              color: 'blue',
              cancelReason: order.cancel_reason,
              refundPercentage: order.refund_percentage,
              refundAmount: order.refund_amount,
              cancelledAt: order.cancelled_at,
              raw: order
            })
          })
        }

        // Process parcel orders
        if (parcelResult.data) {
          parcelResult.data.forEach((order: ParcelOrder) => {
            const status = getStatusConfig(order.status, 'parcel')
            unifiedOrders.push({
              id: order.id,
              orderNumber: order.tracking_number,
              serviceType: 'parcel',
              title: order.parcel_type_name,
              subtitle: `To: ${order.recipient_name}`,
              status: order.status,
              statusLabel: status.label,
              amount: order.total_amount,
              createdAt: order.created_at,
              icon: 'fas fa-box',
              color: 'purple',
              cancelReason: order.cancel_reason,
              refundPercentage: order.refund_percentage,
              refundAmount: order.refund_amount,
              cancelledAt: order.cancelled_at,
              raw: order
            })
          })
        }

        // Sort all orders by date (newest first)
        unifiedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        
        setOrders(unifiedOrders)
      } catch (error) {
        console.error('Error fetching orders:', error)
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
  }, [user])

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

  // Filter orders by service type (including cancelled and completed filters)
  const filteredOrders = activeFilter === 'all' 
    ? orders.filter(o => o.status !== 'cancelled')
    : activeFilter === 'cancelled'
    ? orders.filter(o => o.status === 'cancelled')
    : activeFilter === 'completed'
    ? orders.filter(o => ['completed', 'delivered'].includes(o.status))
    : orders.filter(order => order.serviceType === activeFilter && order.status !== 'cancelled')

  // Count orders by type
  const orderCounts = {
    all: orders.filter(o => o.status !== 'cancelled').length,
    food: orders.filter(o => o.serviceType === 'food' && o.status !== 'cancelled').length,
    person: orders.filter(o => o.serviceType === 'person' && o.status !== 'cancelled').length,
    parcel: orders.filter(o => o.serviceType === 'parcel' && o.status !== 'cancelled').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    completed: orders.filter(o => ['completed', 'delivered'].includes(o.status)).length,
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

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.push('/')
    }
  }, [isAuthenticated, isLoading, router])

  // Show loading spinner while checking auth (redirect happens automatically)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B35]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-r from-[#FF6B35] to-orange-500 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button 
            onClick={() => {
              router.push(backNavigationUrl)
            }}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h1 className="text-xl font-bold text-white">My Orders</h1>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white shadow-sm sticky top-[72px] z-30">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-2 py-3 overflow-x-auto scrollbar-hide">
            {(['all', 'food', 'person', 'parcel', 'cancelled', 'completed'] as ServiceType[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeFilter === filter
                    ? filter === 'cancelled' 
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md'
                      : filter === 'completed'
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                      : 'bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter === 'all' && <i className="fas fa-list"></i>}
                {filter === 'food' && <i className="fas fa-utensils"></i>}
                {filter === 'person' && <i className="fas fa-car"></i>}
                {filter === 'parcel' && <i className="fas fa-box"></i>}
                {filter === 'cancelled' && <i className="fas fa-times-circle"></i>}
                {filter === 'completed' && <i className="fas fa-check-circle"></i>}
                <span className="capitalize">
                  {filter === 'person' ? 'Rides' : filter === 'all' ? 'All Orders' : filter === 'cancelled' ? 'Cancelled' : filter === 'completed' ? 'Completed' : filter}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeFilter === filter ? 'bg-white/20' : 'bg-gray-200'
                }`}>
                  {orderCounts[filter]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Completed Orders Stats - Show when viewing all orders */}
      {activeFilter === 'all' && (
        <div suppressHydrationWarning className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Completed Orders by Service</p>
            <div className="grid grid-cols-3 gap-3">
              {/* Food Completed */}
              <button
                onClick={() => setActiveFilter('completed')}
                className="group relative overflow-hidden rounded-lg bg-white p-3 text-left shadow-sm hover:shadow-md transition-all border border-green-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-100 to-orange-50 opacity-0 group-hover:opacity-100 transition-all"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <i className="fas fa-utensils text-orange-600 text-sm"></i>
                    <span className="text-xs text-gray-500 group-hover:text-orange-600 transition-colors">Food</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {orders.filter(o => o.serviceType === 'food' && ['completed', 'delivered'].includes(o.status)).length}
                  </p>
                  <p className="text-xs text-gray-500">completed</p>
                </div>
              </button>

              {/* Rides Completed */}
              <button
                onClick={() => setActiveFilter('completed')}
                className="group relative overflow-hidden rounded-lg bg-white p-3 text-left shadow-sm hover:shadow-md transition-all border border-green-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-blue-50 opacity-0 group-hover:opacity-100 transition-all"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <i className="fas fa-car text-blue-600 text-sm"></i>
                    <span className="text-xs text-gray-500 group-hover:text-blue-600 transition-colors">Rides</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {orders.filter(o => o.serviceType === 'person' && ['completed', 'delivered'].includes(o.status)).length}
                  </p>
                  <p className="text-xs text-gray-500">completed</p>
                </div>
              </button>

              {/* Parcel Completed */}
              <button
                onClick={() => setActiveFilter('completed')}
                className="group relative overflow-hidden rounded-lg bg-white p-3 text-left shadow-sm hover:shadow-md transition-all border border-green-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-100 to-purple-50 opacity-0 group-hover:opacity-100 transition-all"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <i className="fas fa-box text-purple-600 text-sm"></i>
                    <span className="text-xs text-gray-500 group-hover:text-purple-600 transition-colors">Parcel</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {orders.filter(o => o.serviceType === 'parcel' && ['completed', 'delivered'].includes(o.status)).length}
                  </p>
                  <p className="text-xs text-gray-500">completed</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6 py-5">
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
              selectedOrder.serviceType === 'food' ? 'bg-gradient-to-r from-[#FF6B35] to-orange-500' :
              selectedOrder.serviceType === 'person' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
              'bg-gradient-to-r from-purple-500 to-pink-500'
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
              {selectedOrder.serviceType === 'food' && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Order Items</p>
                  {((selectedOrder.raw as FoodOrder).items as FoodOrderItem[])?.map((item, index) => (
                    <div key={index} className="flex justify-between py-2 border-b border-gray-200 last:border-0">
                      <div>
                        <span className="text-gray-600">{item.quantity}x </span>
                        <span className="text-gray-900">{item.name}</span>
                      </div>
                      <span className="font-medium">₹{item.price * item.quantity}</span>
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
                      <p className="font-medium text-gray-900">{(selectedOrder.raw as PersonOrder).pickup_location?.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Drop-off</p>
                      <p className="font-medium text-gray-900">{(selectedOrder.raw as PersonOrder).dropoff_location?.address}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.serviceType === 'parcel' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Recipient</p>
                    <p className="font-medium text-gray-900">{(selectedOrder.raw as ParcelOrder).recipient_name}</p>
                    <p className="text-sm text-gray-600">{(selectedOrder.raw as ParcelOrder).recipient_phone}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Pickup</p>
                      <p className="font-medium text-gray-900">{(selectedOrder.raw as ParcelOrder).pickup_address?.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-gray-500">Delivery</p>
                      <p className="font-medium text-gray-900">{(selectedOrder.raw as ParcelOrder).delivery_address?.address}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between text-lg font-bold text-gray-900 pt-4 border-t">
                <span>Total</span>
                <span>₹{selectedOrder.amount}</span>
              </div>

              {/* Payment Method */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <i className="fas fa-credit-card"></i>
                <span>Payment: {(selectedOrder.raw as { payment_method: string }).payment_method?.toUpperCase() || 'CASH'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600">Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <i className={`${activeFilter === 'cancelled' ? 'fas fa-times-circle text-red-400' : 'fas fa-receipt text-gray-400'} text-2xl`}></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {activeFilter === 'cancelled' ? 'No Cancelled Orders' : activeFilter === 'all' ? 'No Orders Yet' : `No ${activeFilter === 'person' ? 'Ride' : activeFilter} Orders`}
            </h2>
            <p className="text-gray-600 mb-6">
              {activeFilter === 'cancelled' 
                ? "You haven't cancelled any orders"
                : activeFilter === 'all' 
                ? "You haven't placed any orders yet"
                : `You haven't made any ${activeFilter === 'person' ? 'ride bookings' : activeFilter + ' orders'} yet`}
            </p>
            {activeFilter !== 'cancelled' && (
              <button
                onClick={() => router.push(activeFilter === 'person' ? '/ride' : activeFilter === 'parcel' ? '/courier' : '/order')}
                className={`px-6 py-3 text-white font-bold rounded-lg hover:shadow-lg transition-all ${
                  activeFilter === 'person' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                  activeFilter === 'parcel' ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                  'bg-gradient-to-r from-[#FF6B35] to-orange-500'
                }`}
              >
                {activeFilter === 'person' ? 'Book a Ride' : activeFilter === 'parcel' ? 'Send a Parcel' : 'Start Ordering'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const statusConfig = getStatusConfig(order.status, order.serviceType)
              const serviceConfig = serviceIcons[order.serviceType]
              const isCancelled = order.status === 'cancelled'
              const canCancel = canCancelOrder(order.status)
              
              return (
                <div 
                  key={order.id}
                  className={`bg-white rounded-2xl shadow-lg overflow-hidden transition-all hover:shadow-xl ${
                    isCancelled ? 'border-l-4 border-red-500' : ''
                  }`}
                >
                  {/* Order Header */}
                  <div className="p-4 cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${serviceConfig.bg}`}>
                          <i className={`${serviceConfig.icon} ${serviceConfig.color}`}></i>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{order.title}</p>
                          <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">₹{order.amount?.toFixed(0) || 0}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          <i className={`${statusConfig.icon} text-[10px]`}></i>
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>

                    {/* Subtitle */}
                    <div className="text-sm text-gray-600 mb-3 truncate">
                      {order.subtitle}
                    </div>

                    {/* Order Number */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <p className="text-sm font-mono text-gray-500">{order.orderNumber}</p>
                    </div>
                  </div>
                  
                  {/* Cancelled Order Info */}
                  {isCancelled && (
                    <div className="px-4 pb-4">
                      <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                        <div className="flex items-start gap-2">
                          <i className="fas fa-info-circle text-red-500 mt-0.5"></i>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-700">Cancellation Reason:</p>
                            <p className="text-sm text-red-600">{order.cancelReason || 'Not specified'}</p>
                            {order.refundPercentage !== undefined && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  order.refundPercentage === 100 ? 'bg-green-100 text-green-700' :
                                  order.refundPercentage === 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {order.refundPercentage}% Refund
                                </span>
                                {order.refundAmount !== undefined && order.refundAmount > 0 && (
                                  <span className="text-sm font-medium text-green-600">
                                    ₹{order.refundAmount.toFixed(0)} refunded
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  {!isCancelled && (
                    <div className="px-4 pb-4 flex gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); }}
                        className="flex-1 py-2.5 bg-gradient-to-r from-[#16c2a5] to-[#0fa589] text-white font-semibold rounded-xl text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-map-marker-alt"></i>
                        Track Order
                      </button>
                      {canCancel && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancelClick(order); }}
                          className="flex-1 py-2.5 border-2 border-red-200 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-times-circle"></i>
                          Cancel Order
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>

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
                <div className="ml-auto font-bold text-gray-900">₹{cancellingOrder.amount?.toFixed(0)}</div>
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
              className="w-full py-3 bg-gradient-to-r from-[#FF6B35] to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
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
