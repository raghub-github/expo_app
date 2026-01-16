'use server'

import { supabase } from '@/lib/supabase'
import { OrderStatus } from '@/lib/types'

export async function handleRiderUpdate(orderId: string, riderStatus: OrderStatus, riderId: string) {
  try {
    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    // Verify rider ownership
    if (order.rider_id !== riderId) {
      return { success: false, error: 'Rider not assigned to this order' }
    }

    // Update order status from rider
    const { error } = await supabase
      .from('orders')
      .update({
        order_status: riderStatus,
        updated_at: new Date().toISOString(),
        delivered_at: riderStatus === 'delivered' ? new Date().toISOString() : null,
      })
      .eq('id', orderId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error updating from rider:', error)
    return { success: false, error: 'An error occurred' }
  }
}
