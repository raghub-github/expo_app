"use client";
import React from 'react';
import { Order, OrderStatus } from '@/lib/types'
import { OrderRow } from './OrderRow'

interface OrderTableProps {
  orders: Order[]
  onStatusChange: (orderId: string, newStatus: string) => void
  isLoading?: boolean
  emptyMessage?: string
}

export function OrderTable({
  orders,
  onStatusChange,
  isLoading = false,
  emptyMessage = 'No orders found',
}: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Items</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Payment</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} onStatusChange={onStatusChange} isLoading={isLoading} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
