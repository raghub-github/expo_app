'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { NotificationPayload } from '@/lib/types'

export function useNotifications() {
  const hasNotified = useRef(new Set<string>())

  const notify = (payload: NotificationPayload) => {
    // Prevent duplicate notifications
    if (hasNotified.current.has(payload.order_id)) {
      return
    }
    hasNotified.current.add(payload.order_id)

    switch (payload.type) {
      case 'NEW_ORDER':
        toast.success(`New Order: ${payload.message}`, {
          duration: 5000,
        })
        break
      case 'RIDER_PICKUP':
        toast.info(`Rider Pickup: ${payload.message}`, {
          duration: 4000,
        })
        break
      case 'ORDER_DELIVERED':
        toast.success(`Order Delivered: ${payload.message}`, {
          duration: 4000,
        })
        break
    }
  }

  return { notify }
}
