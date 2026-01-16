'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById, fetchRestaurantByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { Order, OrderStatus } from '@/lib/types'
import { updateOrderStatus, cancelOrder } from '@/app/actions/orders'
import { Toaster, toast } from 'sonner'
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  Package,
  CheckCircle,
  X,
  Eye,
  HelpCircle,
  Printer,
  AlertCircle,
  ChevronRight,
  Store,
  ArrowLeftRight
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function OrdersPageContent() {
  const searchParams = useSearchParams()
  
  // सभी Hook top-level पर (All Hooks at top level)
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('active')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null)
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [showRefundAcceptModal, setShowRefundAcceptModal] = useState(false)
  const [showRefundRejectModal, setShowRefundRejectModal] = useState(false)
  const [refundPercentage, setRefundPercentage] = useState(100)
  const [rejectionReason, setRejectionReason] = useState('')
  
  // Store toggle state - यहाँ top-level पर (Store toggle state - here at top level)
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null)
  
  // Marquee state
  const [marqueeItems, setMarqueeItems] = useState<string[]>([])
  const [isMarqueePaused, setIsMarqueePaused] = useState(false)
  
  // Orders state
  const [orders, setOrders] = useState<Order[]>([])
  const [complaints, setComplaints] = useState<any[]>([])

  // Initialize marquee items
  useEffect(() => {
    const items = [
      "Out of an item? Mark it OUT OF STOCK to keep orders running smoothly.",
      "Update your menu regularly to attract more customers.",
      "Keep track of inventory to avoid order cancellations.",
      "Respond to customer complaints within 24 hours for better ratings.",
      "Use high-quality packaging for better customer experience."
    ]
    setMarqueeItems(items)
  }, [])

  // Get restaurant ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams.get('storeId') || searchParams.get('restaurantId')
      if (!id) {
        id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      }
      if (!id) {
        id = DEMO_RESTAURANT_ID
      }
      setStoreId(id)
    }
    getStoreId()
  }, [searchParams])

  // Load restaurant data
  useEffect(() => {
    if (!storeId) return
    const loadStore = async () => {
      setIsLoading(true)
      try {
        let storeData = await fetchRestaurantById(storeId)
        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchRestaurantByName(storeId)
        }
        if (storeData) {
          setStore(storeData)
          // Store status सेट करें (Set store status)
          setIsStoreOpen(storeData.operational_status === 'OPEN' || storeData.is_accepting_orders)
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadStore()
  }, [storeId])

  // Load orders
  useEffect(() => {
    async function loadOrders() {
      if (!storeId) return
      const { data, error } = await supabase
        .from('food_orders')
        .select('*')
        .eq('restaurant_id', storeId)
        .order('created_at', { ascending: false })
      if (!error && data) {
        setOrders(data as Order[])
      }
    }
    loadOrders()
  }, [storeId])

  // Load complaints
  useEffect(() => {
    async function loadComplaints() {
      if (!storeId) return
      // Fetch complaints from database if available
      // For now, using empty array as we don't have complaints table yet
      setComplaints([])
    }
    loadComplaints()
  }, [storeId])

  // Toggle handler - अलग function में (Toggle handler - in separate function)
  const handleStoreToggle = async () => {
    if (!storeId) return;
    const newStatus = isStoreOpen ? 'CLOSED' : 'OPEN';
    const updates: any = {
      operational_status: newStatus,
      is_accepting_orders: !isStoreOpen,
    };
    try {
      // Dynamic import to avoid loading issues
      const { updateStoreInfo } = await import('@/lib/database');
      const ok = await updateStoreInfo(storeId, updates);
      if (ok) {
        setIsStoreOpen(!isStoreOpen);
        setStore((prev) => prev ? { 
          ...prev, 
          operational_status: newStatus, 
          is_accepting_orders: !isStoreOpen 
        } : prev);
        toast.success(`Store ${!isStoreOpen ? 'opened' : 'closed'} successfully`);
      } else {
        toast.error('Failed to update store status');
      }
    } catch (error) {
      console.error('Error updating store status:', error);
      toast.error('Failed to update store status');
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      if (newStatus === 'CANCELLED') {
        await cancelOrder(orderId, storeId || DEMO_RESTAURANT_ID, 'Merchant cancelled')
        toast.success('Order cancelled successfully')
      } else {
        await updateOrderStatus(orderId, newStatus as OrderStatus, storeId || DEMO_RESTAURANT_ID)
        toast.success(`Order status updated to ${newStatus}`)
      }
      // Refresh orders
      if (storeId) {
        const { data } = await supabase
          .from('food_orders')
          .select('*')
          .eq('restaurant_id', storeId)
          .order('created_at', { ascending: false })
        if (data) setOrders(data as Order[])
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      toast.error('Failed to update order status')
    }
  }

  const getOrdersByTab = () => {
    switch (activeTab) {
      case 'active':
        return orders.filter((o) => !['delivered', 'cancelled'].includes(o.status.toLowerCase()))
      case 'completed':
        return orders.filter((o) => o.status.toLowerCase() === 'delivered')
      case 'cancelled':
        return orders.filter((o) => o.status.toLowerCase() === 'cancelled')
      default:
        return []
    }
  }

  const filteredOrders = getOrdersByTab()

  if (isLoading) {
    return (
      <MXLayoutWhite 
        restaurantName={store?.store_name} 
        restaurantId={storeId || ''}
      >
        <div className="min-h-screen bg-gray-50">
          {/* Header Skeleton */}
          <div className="bg-white border-b border-gray-200 p-6">
            <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>

          {/* Filter Skeleton */}
          <div className="bg-white border-b border-gray-200 p-6 flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-200 rounded-lg w-24 animate-pulse"></div>
            ))}
          </div>

          {/* Table Skeleton */}
          <div className="p-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gray-50 grid grid-cols-6 gap-4 p-6 border-b border-gray-200">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-4 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
              {/* Rows */}
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="grid grid-cols-6 gap-4 p-6 border-b border-gray-100 items-center">
                  {[1, 2, 3, 4, 5, 6].map((col) => (
                    <div key={col} className="h-4 bg-gray-100 rounded animate-pulse"></div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    )
  }

  return (
    <MXLayoutWhite
      restaurantName={store?.store_name || 'Store'}
      restaurantId={storeId || DEMO_RESTAURANT_ID}
    >
      <Toaster />
      <div className="min-h-screen bg-white">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            {/* Nav Tabs */}
            <div className="flex space-x-8">
              {[
                { id: 'active', label: 'Active Orders', icon: Clock },
                { id: 'completed', label: 'Completed', icon: CheckCircle2 },
                { id: 'cancelled', label: 'Cancelled', icon: XCircle },
                { id: 'complaints', label: 'Complaints', icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-1 py-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            
            {/* Store Toggle Button - हमेशा दिखेगा (Always visible) */}
            <div className="flex items-center ml-4">
              <button
                onClick={handleStoreToggle}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-xs shadow border transition-colors focus:outline-none ${
                  isStoreOpen 
                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' 
                    : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                } ${isStoreOpen === null ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                disabled={isStoreOpen === null}
                title={isStoreOpen === null ? 'Loading store status...' : isStoreOpen ? 'Click to close store' : 'Click to open store'}
              >
                <Store className="w-4 h-4" />
                {isStoreOpen === null ? 'Loading...' : isStoreOpen ? 'Store Open' : 'Store Closed'}
                <ArrowLeftRight className="w-4 h-4 opacity-60" />
              </button>
            </div>
          </div>
        </div>

        {/* Marquee Notification Bar - Mint Green (Slower speed) */}
        <div
          className="w-full bg-green-50 border-b border-green-200 py-2 px-2 relative overflow-hidden"
          style={{ minHeight: 34 }}
        >
          <div
            className="flex items-center gap-12 marquee-track"
            onMouseEnter={() => setIsMarqueePaused(true)}
            onMouseLeave={() => setIsMarqueePaused(false)}
            style={{
              whiteSpace: 'nowrap',
              width: 'max-content',
              animation: isMarqueePaused
                ? 'none'
                : 'marquee-scroll 60s linear infinite', // Slower marquee (60 seconds)
              fontWeight: 500,
              fontSize: '14px',
              color: '#2d3748',
              cursor: 'pointer',
            }}
          >
            {[...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, index) => (
              <span key={index} className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>
                  <span className="text-green-700 font-semibold">Tip:</span> {item}
                </span>
                {index < marqueeItems.length * 3 - 1 && (
                  <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
                )}
              </span>
            ))}
          </div>

          <style>{`
            @keyframes marquee-scroll {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-33.33%);
              }
            }
          `}</style>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Active Orders */}
          {activeTab === 'active' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Active Orders</h2>
                <p className="text-gray-600 mt-1">Manage your live orders and fulfill customer requests</p>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Clock size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No active orders</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.order_number}
                      className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow bg-white flex flex-col gap-2"
                    >
                      {/* Card Header with Order ID */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-gray-500 font-medium">Order ID</span>
                          <span className="font-bold text-gray-900 text-sm tracking-tight">{order.order_number ? order.order_number.substring(0, 12) : ''}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'preparing' ? 'bg-purple-100 text-purple-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {order.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 mb-1">
                        <Clock className="w-3 h-3" />
                        <span>2 hours ago</span>
                        <Package className="w-3 h-3 ml-2" />
                        <span className="text-blue-600 font-medium">Delivery</span>
                      </div>

                      {/* Customer & Delivery Info */}
                      <div className="flex flex-col gap-0.5 pb-2 border-b border-gray-100">
                        <span className="font-semibold text-gray-900 text-[13px] leading-tight">{order.user_name}</span>
                        {order.delivery_address && (
                          <span className="text-xs text-gray-600 leading-snug">
                            {typeof order.delivery_address === 'string' 
                              ? order.delivery_address 
                              : `${order.delivery_address?.address || ''}, ${order.delivery_address?.city || ''} - ${order.delivery_address?.pincode || ''}`}
                          </span>
                        )}
                        {order.user_phone && (
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <span className="text-gray-400">📞</span> {order.user_phone}
                          </span>
                        )}
                      </div>

                      {/* Amount and Items */}
                      <div className="flex items-center justify-between mb-1 mt-1">
                        <div>
                          <span className="text-xs text-gray-500">Amount</span>
                          <div className="text-base font-bold text-gray-900 leading-tight">₹{order.total_amount}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500">Items</span>
                          <div className="text-base font-bold text-gray-900 leading-tight">{order.items?.length || 0}</div>
                        </div>
                      </div>

                      {/* View Order Button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order)
                          setShowDetailModal(true)
                        }}
                        className="w-full px-2.5 py-1.5 bg-gray-100 text-gray-900 rounded-md hover:bg-gray-200 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        View Order
                      </button>

                      {/* Action Buttons */}
                      <div className="flex flex-row gap-2 w-full">
                        {(order.status === 'pending' || order.status === 'confirmed') && (
                          <>
                            <button
                              onClick={() => handleStatusChange(order.id, order.status === 'pending' ? 'confirmed' : 'preparing')}
                              className="flex-1 px-2.5 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              {order.status === 'pending' ? 'Confirm Order' : 'Mark Ready for Dispatch'}
                            </button>
                            <button
                              onClick={() => handleStatusChange(order.id, 'CANCELLED')}
                              className="flex-1 px-2.5 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              Reject Order
                            </button>
                          </>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'ready')}
                            className="w-full px-2.5 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                          >
                            <Package className="w-3 h-3" />
                            Mark Ready
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'delivered')}
                            className="w-full px-2.5 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Mark Delivered
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed Orders */}
          {activeTab === 'completed' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Completed Orders</h2>
                <p className="text-gray-600 mt-1">Orders successfully delivered to customers</p>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No completed orders</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.order_number}
                      className="border border-green-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-green-50"
                    >
                      {/* Card Header with Order ID */}
                      <div className="mb-3 pb-3 border-b border-green-200">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <p className="text-xs text-gray-600">Order ID:</p>
                            <h3 className="font-bold text-gray-900 text-base">{order.order_number ? order.order_number.substring(0, 12) : ''}</h3>
                          </div>
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            DELIVERED
                          </span>
                        </div>
                      </div>

                      {/* Customer & Delivery Info */}
                      <div className="mb-4 pb-3 border-b border-green-200">
                        <p className="font-semibold text-gray-900 text-sm mb-2">{order.user_name}</p>
                        {order.delivery_address && (
                          <p className="text-xs text-gray-600 mb-2 leading-snug">
                            {typeof order.delivery_address === 'string' 
                              ? order.delivery_address 
                              : `${order.delivery_address?.address || ''}, ${order.delivery_address?.city || ''} - ${order.delivery_address?.pincode || ''}`}
                          </p>
                        )}
                      </div>

                      {/* Amount and Items */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-gray-600">Amount</p>
                          <p className="text-lg font-bold text-gray-900">₹{order.total_amount}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">Items</p>
                          <p className="text-lg font-bold text-gray-900">{order.items?.length || 0}</p>
                        </div>
                      </div>

                      {/* View Order Button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order)
                          setShowDetailModal(true)
                        }}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors flex items-center justify-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View Order
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cancelled Orders */}
          {activeTab === 'cancelled' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Cancelled Orders</h2>
                <p className="text-gray-600 mt-1">Orders that were cancelled</p>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <XCircle size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No cancelled orders</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.order_number}
                      className="border border-red-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-red-50"
                    >
                      {/* Card Header with Order ID */}
                      <div className="mb-3 pb-3 border-b border-red-200">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <p className="text-xs text-gray-600">Order ID:</p>
                            <h3 className="font-bold text-gray-900 text-base">{order.order_number ? order.order_number.substring(0, 12) : ''}</h3>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              CANCELLED
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Customer & Delivery Info */}
                      <div className="mb-4 pb-3 border-b border-red-200">
                        <p className="font-semibold text-gray-900 text-sm mb-2">{order.user_name}</p>
                        {order.delivery_address && (
                          <p className="text-xs text-gray-600 mb-2 leading-snug">
                            {typeof order.delivery_address === 'string' 
                              ? order.delivery_address 
                              : `${order.delivery_address?.address || ''}, ${order.delivery_address?.city || ''} - ${order.delivery_address?.pincode || ''}`}
                          </p>
                        )}
                      </div>

                      {/* Amount and Items */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-gray-600">Amount</p>
                          <p className="text-lg font-bold text-gray-900">₹{order.total_amount}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">Items</p>
                          <p className="text-lg font-bold text-gray-900">{order.items?.length || 0}</p>
                        </div>
                      </div>

                      {/* View Order Button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order)
                          setShowDetailModal(true)
                        }}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors flex items-center justify-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View Order
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Complaints */}
          {activeTab === 'complaints' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Customer Complaints</h2>
                <p className="text-gray-600 mt-1">
                  {complaints.filter(c => c.status === 'open').length} active complaint(s) requiring response
                </p>
              </div>

              {complaints.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No complaints found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {complaints.map((complaint) => (
                    <div
                      key={complaint.id}
                      className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                        complaint.status === 'open'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="mb-3 pb-3 border-b"
                        style={{borderBottomColor: complaint.status === 'open' ? '#fcd34d' : '#86efac'}}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-900 text-base">{complaint.orderId}</h3>
                            <p className="text-xs text-gray-600">{complaint.customerName}</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            {complaint.status === 'open' && (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                PENDING
                              </span>
                            )}
                            {complaint.status === 'resolved' && (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 whitespace-nowrap flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                RESOLVED
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Complaint Details */}
                      <div className="mb-4">
                        <p className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          Issue
                        </p>
                        <p className="text-xs text-gray-700 leading-snug">{complaint.complaint}</p>
                      </div>

                      {/* Date */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b"
                        style={{borderBottomColor: complaint.status === 'open' ? '#fde68a' : '#d1fae5'}}
                      >
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {complaint.date}
                        </p>
                      </div>

                      {/* Action Button */}
                      {complaint.status === 'open' && (
                        <button
                          onClick={() => {
                            setSelectedComplaint(complaint)
                            setShowComplaintModal(true)
                          }}
                          className="w-full px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium text-sm transition-colors flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Resolve Complaint
                        </button>
                      )}
                      {complaint.status === 'resolved' && (
                        <button
                          disabled
                          className="w-full px-3 py-2 bg-green-100 text-green-700 rounded-lg font-medium text-sm cursor-not-allowed flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Resolved
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedOrder && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none"
          onClick={() => setShowDetailModal(false)}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl pointer-events-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <style>{`
              .modal-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedOrder.order_number}</h2>
                <p className="text-xs text-gray-600">{selectedOrder.user_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => alert('Help: Contact support for assistance')}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-xs transition-colors flex items-center gap-1"
                >
                  <HelpCircle className="w-4 h-4" />
                  Help
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-xs transition-colors flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  Print Bill
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-500 hover:text-gray-700 ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-3 space-y-3 overflow-y-auto modal-scroll flex-1"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Order Status */}
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs text-gray-600 font-semibold uppercase">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className={`text-sm font-bold ${
                    selectedOrder.status === 'pending' ? 'text-yellow-700' :
                    selectedOrder.status === 'confirmed' ? 'text-blue-700' :
                    selectedOrder.status === 'preparing' ? 'text-purple-700' :
                    selectedOrder.status === 'ready' ? 'text-green-700' :
                    selectedOrder.status === 'delivered' ? 'text-emerald-700' :
                    'text-red-700'
                  }`}>
                    {selectedOrder.status.toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Order Details */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 p-2 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold uppercase">Amount</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹{selectedOrder.total_amount}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold uppercase">Items</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{selectedOrder.items?.length || 0} items</p>
                </div>
              </div>

              {/* Order Items */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Order Items</p>
                  <div className="space-y-1 bg-gray-50 p-2 rounded-lg">
                    {selectedOrder.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm border-b border-gray-200 pb-2 last:border-0">
                        <span className="text-gray-900">{item.name || item.item_name}</span>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">×{item.quantity}</p>
                          <p className="text-xs text-gray-600">₹{item.price || item.item_price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payout Info */}
              <div className="border-t border-gray-200 pt-2">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900 font-medium">₹{selectedOrder.subtotal || selectedOrder.total_amount}</span>
                  </div>
                  {selectedOrder.delivery_fee && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Fee</span>
                      <span className="text-gray-900 font-medium">₹{selectedOrder.delivery_fee}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-gray-200 pt-1">
                    <span>Total</span>
                    <span className="text-gray-900">₹{selectedOrder.total_amount}</span>
                  </div>
                </div>
              </div>

              {/* Order Meta */}
              <div className="space-y-1 bg-blue-50 p-2 rounded-lg text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Order ID (from DB)</span>
                  <span className="font-mono font-bold text-gray-900 text-xs">{selectedOrder.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Order Number</span>
                  <span className="font-bold text-gray-900">{selectedOrder.order_number}</span>
                </div>
                {selectedOrder.created_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created</span>
                    <span className="text-gray-900 text-xs">{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="border-t border-gray-200 pt-2 flex gap-2 flex-shrink-0">
                {selectedOrder.status === 'pending' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'confirmed')
                      setShowDetailModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Confirm Order
                  </button>
                )}
                {selectedOrder.status === 'confirmed' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'preparing')
                      setShowDetailModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center justify-center gap-1"
                  >
                    <Package className="w-4 h-4" />
                    Start Preparing
                  </button>
                )}
                {selectedOrder.status === 'preparing' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'ready')
                      setShowDetailModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Ready
                  </button>
                )}
                {selectedOrder.status === 'ready' && (
                  <button
                    onClick={() => {
                      handleStatusChange(selectedOrder.id, 'delivered')
                      setShowDetailModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Delivered
                  </button>
                )}
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complaint Detail Modal */}
      {showComplaintModal && selectedComplaint && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none"
          onClick={() => setShowComplaintModal(false)}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl pointer-events-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <style>{`
              .complaint-modal-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedComplaint.orderId}</h2>
                <p className="text-xs text-gray-600">{selectedComplaint.customerName}</p>
              </div>
              <button
                onClick={() => setShowComplaintModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3 space-y-3 overflow-y-auto complaint-modal-scroll flex-1"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Issue Section */}
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                <p className="text-xs text-gray-600 font-semibold uppercase mb-2 flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  Issue
                </p>
                <p className="text-sm text-gray-900 leading-snug">{selectedComplaint.complaint}</p>
              </div>

              {/* Complaint Details */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Date
                  </span>
                  <span className="font-semibold text-gray-900">📅 {selectedComplaint.date}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Status</span>
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    PENDING
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-gray-200 pt-2 p-3 flex gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  alert(`Complaint resolved for ${selectedComplaint.orderId}`)
                  setShowComplaintModal(false)
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Resolved
              </button>
              <button
                onClick={() => {
                  setShowComplaintModal(false)
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </MXLayoutWhite>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading orders...</div>
      </div>
    }>
      <OrdersPageContent />
    </Suspense>
  )
}