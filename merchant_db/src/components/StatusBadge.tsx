"use client";
import React from 'react';
import { OrderStatus } from '@/lib/types'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

interface StatusBadgeProps {
  status: OrderStatus
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = ORDER_STATUS_CONFIG[status]

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.color} ${className}`}
    >
      {config.label}
    </span>
  )
}
