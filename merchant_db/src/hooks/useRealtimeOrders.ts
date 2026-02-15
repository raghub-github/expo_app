'use client'

import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Order, OrderStatus } from '@/lib/types'
import { useOrderStore } from '@/lib/store'
import { useNotifications } from './useNotifications'

export function useRealtimeOrders(merchantId: string) {
  const { addOrder, updateOrder, setOrders } = useOrderStore()
  const { notify } = useNotifications()

  useEffect(() => {
    if (!merchantId) return

    // Subscribe to order changes
    const subscription = supabase
      .channel(`merchant_orders_${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const newOrder = payload.new as Order
          addOrder(newOrder)
          notify({
            type: 'NEW_ORDER',
            order_id: newOrder.order_number,
            message: `Order ${newOrder.order_number} from ${newOrder.user_name}`,
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'food_orders',
          filter: `restaurant_id=eq.${merchantId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as Order
          updateOrder(updatedOrder.id, updatedOrder)

          // Notify on specific status changes
          if (updatedOrder.status === 'out_for_delivery') {
            notify({
              type: 'RIDER_PICKUP',
              order_id: updatedOrder.order_number,
              message: `Order ${updatedOrder.order_number} is out for delivery`,
            })
          } else if (updatedOrder.status === 'delivered') {
            notify({
              type: 'ORDER_DELIVERED',
              order_id: updatedOrder.order_number,
              message: `Order ${updatedOrder.order_number} delivered`,
            })
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [merchantId, addOrder, updateOrder, notify])
}
