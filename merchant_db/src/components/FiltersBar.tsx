"use client";
import React from 'react';
import { useState } from 'react'
import { OrderStatus } from '@/lib/types'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

interface FiltersBarProps {
  onFilterChange: (filters: { search: string; status?: OrderStatus; dateRange?: { from: string; to: string } }) => void
  activeTab: string
}

export function FiltersBar({ onFilterChange, activeTab }: FiltersBarProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    onFilterChange({ search: value, status: status || undefined })
  }

  const handleStatusChange = (value: string) => {
    const newStatus = value as OrderStatus | ''
    setStatus(newStatus)
    onFilterChange({ search, status: newStatus || undefined })
  }

  // Only show status filter on active orders tab
  const shouldShowStatusFilter = activeTab === 'active'

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex flex-col gap-4">
        {/* Search Bar */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by Order ID or Customer Name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters Row */}
        {shouldShowStatusFilter && (
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="NEW_ORDER">New Order</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="PREPARING">Preparing</option>
                <option value="READY_FOR_DISPATCH">Ready for Dispatch</option>
                <option value="PICKED_UP">Picked Up</option>
                <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
