'use client'

import { Order } from '@/lib/types'
import { VALID_STATUS_TRANSITIONS } from '@/lib/constants'
import { useState } from 'react'

interface ActionButtonsProps {
  order: Order
  onStatusChange: (orderId: string, newStatus: string) => void
  isLoading?: boolean
}

export function ActionButtons({ order, onStatusChange, isLoading = false }: ActionButtonsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status] || []
  const hasActions = validTransitions.length > 0 && !order.status.includes('delivered') && order.status !== 'cancelled'

  if (!hasActions) {
    return <span className="text-xs text-gray-500">No actions</span>
  }

  const getButtonColor = (status: string) => {
    if (status === 'cancelled') return 'text-red-600 hover:bg-red-50'
    return 'text-blue-600 hover:bg-blue-50'
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        Actions
        <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-300 rounded-md shadow-lg z-10">
          {validTransitions.map((status) => (
            <button
              key={status}
              onClick={() => {
                onStatusChange(order.id, status)
                setIsOpen(false)
              }}
              disabled={isLoading}
              className={`w-full text-left px-4 py-2 text-sm ${getButtonColor(status)} border-b last:border-b-0 disabled:opacity-50`}
            >
              {status === 'confirmed' ? '✓ Confirm Order' : 
               status === 'preparing' ? '⏱ Start Preparing' :
               status === 'ready' ? '📦 Mark Ready' :
               status === 'out_for_delivery' ? '🏍 Out for Delivery' :
               status === 'cancelled' ? '❌ Cancel Order' : status}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
