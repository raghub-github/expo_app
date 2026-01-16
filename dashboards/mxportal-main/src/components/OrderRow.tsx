'use client'

import { Order } from '@/lib/types'
import { PAYMENT_STATUS_CONFIG } from '@/lib/constants'
import { StatusBadge } from './StatusBadge'
import { ActionButtons } from './ActionButtons'

interface OrderRowProps {
  order: Order
  onStatusChange: (orderId: string, newStatus: string) => void
  isLoading?: boolean
}

export function OrderRow({ order, onStatusChange, isLoading = false }: OrderRowProps) {
  const itemsSummary = order.items
    .slice(0, 2)
    .map((item) => `${item.name} x${item.quantity}`)
    .join(', ')
  const hasMore = order.items.length > 2

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 text-sm font-medium text-gray-900">{order.order_number}</td>
      <td className="px-6 py-4 text-sm text-gray-700">{order.user_name}</td>
      <td className="px-6 py-4 text-sm text-gray-600">
        <div className="max-w-xs">
          <p className="truncate">{itemsSummary}</p>
          {hasMore && <p className="text-xs text-gray-500">+{order.items.length - 2} more</p>}
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-semibold text-gray-900">₹{order.total_amount.toFixed(2)}</td>
      <td className="px-6 py-4 text-sm">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            order.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {PAYMENT_STATUS_CONFIG[order.payment_status]?.label || order.payment_status}
        </span>
      </td>
      <td className="px-6 py-4 text-sm">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-6 py-4 text-sm">
        <ActionButtons order={order} onStatusChange={onStatusChange} isLoading={isLoading} />
      </td>
    </tr>
  )
}
