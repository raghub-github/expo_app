'use server'

import { supabase } from '@/lib/supabase'
import { isValidTransition } from '@/lib/constants'
import { OrderStatus } from '@/lib/types'

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus, restaurantId: string) {
  try {
    // Fetch current order to validate transition
    const { data: order, error: fetchError } = await supabase
      .from('food_orders')
      .select('*')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    // Validate state transition
    if (!isValidTransition(order.status, newStatus)) {
      return {
        success: false,
        error: `Cannot transition from ${order.status} to ${newStatus}`,
      }
    }

    // Update order
    const { error } = await supabase
      .from('food_orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error updating order status:', error)
    return { success: false, error: 'An error occurred' }
  }
}

export async function cancelOrder(orderId: string, restaurantId: string, reason: string) {
  try {
    const { data: order, error: fetchError } = await supabase
      .from('food_orders')
      .select('*')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    // Can only cancel before out_for_delivery
    if (order.status === 'out_for_delivery' || order.status === 'delivered' || order.status === 'cancelled') {
      return { success: false, error: 'Cannot cancel order after it is out for delivery' }
    }

    const { error } = await supabase
      .from('food_orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error cancelling order:', error)
    return { success: false, error: 'An error occurred' }
  }
}
