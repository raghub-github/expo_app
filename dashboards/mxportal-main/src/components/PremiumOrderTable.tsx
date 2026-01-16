'use client'

import React from 'react'
import { FoodOrder, OrderStatus } from '@/lib/types'
import { ORDER_STATUS_CONFIG, PAYMENT_METHOD_LABELS, MAX_ITEMS_PREVIEW } from '@/lib/constants'
import { Clock, MapPin, Utensils, IndianRupee, ChevronDown } from 'lucide-react'

interface OrderTableProps {
  orders: FoodOrder[]
  onStatusChange?: (orderId: string, status: OrderStatus) => void
  isLoading?: boolean
}

const StatusBadge: React.FC<{ status: OrderStatus | string | undefined }> = ({ status }) => {
  // Ensure status is a string and handle undefined
  const statusString = String(status || 'pending').toLowerCase().trim()
  const config = ORDER_STATUS_CONFIG[statusString as OrderStatus]
  
  // Fallback if status is undefined or not in config
  if (!config) {
    console.warn('⚠️ Status not found in config:', status, '- Using fallback')
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700">
        <span className="text-lg">❓</span>
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{statusString || 'Unknown'}</span>
      </div>
    )
  }
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bg}`}>
      <span className="text-lg">{config.icon}</span>
      <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
    </div>
  )
}

const PaymentBadge: React.FC<{ method: string; status: string }> = ({ method, status }) => {
  const label = PAYMENT_METHOD_LABELS[method] || method
  const statusColor = status === 'paid' ? 'text-green-600 bg-green-50' : 'text-yellow-600 bg-yellow-50'
  
  return (
    <div className={`px-3 py-1.5 rounded-lg ${statusColor} text-sm font-medium`}>
      {label}
    </div>
  )
}

const ItemsList: React.FC<{ items: any[] }> = ({ items }) => {
  const displayItems = items.slice(0, MAX_ITEMS_PREVIEW)
  const hasMore = items.length > MAX_ITEMS_PREVIEW

  return (
    <div className="space-y-1">
      {displayItems.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2 text-sm">
          <span className="text-slate-400 mt-0.5">•</span>
          <div>
            <div className="text-slate-200 font-medium">{item.name}</div>
            <div className="text-slate-500 text-xs">Qty: {item.quantity}</div>
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="text-xs text-slate-400 ml-4">+{items.length - MAX_ITEMS_PREVIEW} more items</div>
      )}
    </div>
  )
}

export const OrderTable: React.FC<OrderTableProps> = ({ orders, onStatusChange, isLoading }) => {
  const [expandedOrder, setExpandedOrder] = React.useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 mb-4">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-400">Loading orders...</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-12 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-slate-700/50 mb-4">
          <Utensils size={24} className="text-slate-400" />
        </div>
        <h3 className="text-slate-300 font-semibold mb-2">No orders yet</h3>
        <p className="text-slate-400 text-sm">New orders will appear here when customers place them</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div
          key={order.id}
          className="bg-gradient-to-r from-slate-800 to-slate-750 rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-200 overflow-hidden shadow-lg hover:shadow-xl"
        >
          {/* Order Header */}
          <button
            onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-start gap-4 flex-1 text-left">
              {/* Order Number & Restaurant */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg font-bold text-white">{order.order_number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-slate-400 text-sm">{order.restaurant_name}</p>
              </div>

              {/* Customer Info */}
              <div className="hidden md:flex flex-col gap-1">
                <p className="text-sm font-medium text-slate-300">{order.user_name}</p>
                <p className="text-xs text-slate-500">{order.user_phone}</p>
              </div>

              {/* Price */}
              <div className="hidden lg:flex flex-col items-end gap-1 min-w-fit">
                <div className="flex items-center gap-1 text-lg font-bold text-orange-400">
                  <IndianRupee size={16} />
                  {order.total_amount.toFixed(2)}
                </div>
                <PaymentBadge method={order.payment_method} status={order.payment_status} />
              </div>
            </div>

            {/* Expand Chevron */}
            <ChevronDown
              size={20}
              className={`text-slate-400 transition-transform duration-200 ml-4 ${
                expandedOrder === order.id ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Order Details (Expanded) */}
          {expandedOrder === order.id && (
            <div className="border-t border-slate-700 bg-slate-900/50 px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Items */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Items</h4>
                  <ItemsList items={order.items} />
                </div>

                {/* Delivery Address */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
                    <MapPin size={14} />
                    Delivery
                  </h4>
                  <div className="text-sm space-y-1">
                    <p className="text-slate-300">{order.delivery_address.address}</p>
                    <p className="text-slate-500 text-xs">
                      {order.delivery_address.city}, {order.delivery_address.pincode}
                    </p>
                    {order.delivery_address.landmark && (
                      <p className="text-slate-500 text-xs">Landmark: {order.delivery_address.landmark}</p>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
                    <Clock size={14} />
                    Timeline
                  </h4>
                  <div className="text-sm space-y-1">
                    <div className="text-slate-400">Ordered</div>
                    <p className="text-slate-300 text-xs">{new Date(order.created_at).toLocaleTimeString()}</p>
                    {order.confirmed_at && (
                      <>
                        <div className="text-slate-400 mt-2">Confirmed</div>
                        <p className="text-slate-300 text-xs">{new Date(order.confirmed_at).toLocaleTimeString()}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Price Breakdown */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Price Breakdown</h4>
                  <div className="text-sm space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal</span>
                      <span className="text-slate-300">₹{order.subtotal.toFixed(2)}</span>
                    </div>
                    {order.delivery_fee > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Delivery</span>
                        <span className="text-slate-300">₹{order.delivery_fee.toFixed(2)}</span>
                      </div>
                    )}
                    {order.taxes > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Taxes</span>
                        <span className="text-slate-300">₹{order.taxes.toFixed(2)}</span>
                      </div>
                    )}
                    {order.discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount</span>
                        <span>-₹{order.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-700 pt-1.5 flex justify-between font-bold">
                      <span className="text-slate-300">Total</span>
                      <span className="text-orange-400">₹{order.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Instructions */}
              {order.delivery_instructions && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Special Instructions</p>
                  <p className="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">
                    {order.delivery_instructions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default OrderTable
