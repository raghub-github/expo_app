import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, status, riderId } = body

    if (!orderId || !status || !riderId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify this is a valid status
    const validStatuses = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Import supabase only when needed
    const { supabase } = await import('@/lib/supabase')

    // Update order
    const { error } = await supabase
      .from('orders')
      .update({
        order_status: status,
        updated_at: new Date().toISOString(),
        delivered_at: status === 'DELIVERED' ? new Date().toISOString() : null,
      })
      .eq('id', orderId)
      .eq('rider_id', riderId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Order updated successfully' })
  } catch (error) {
    console.error('Error handling webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
