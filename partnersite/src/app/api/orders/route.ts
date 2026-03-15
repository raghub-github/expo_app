import { NextRequest, NextResponse } from 'next/server'
import { FoodOrder } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate required fields
    const requiredFields = ['order_number', 'user_id', 'user_name', 'user_phone', 'restaurant_id', 'restaurant_name', 'items', 'total_amount', 'delivery_address']
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }

    // Import supabase only when needed
    const { supabase } = await import('@/lib/supabase')

    const newOrder: Omit<FoodOrder, 'id'> = {
      order_number: body.order_number,
      user_id: body.user_id,
      user_name: body.user_name,
      user_phone: body.user_phone,
      user_email: body.user_email,
      restaurant_id: body.restaurant_id,
      restaurant_name: body.restaurant_name,
      items: body.items,
      subtotal: body.subtotal,
      delivery_fee: body.delivery_fee || 0,
      taxes: body.taxes || 0,
      discount: body.discount || 0,
      total_amount: body.total_amount,
      delivery_address: body.delivery_address,
      delivery_instructions: body.delivery_instructions,
      status: 'pending',
      payment_method: body.payment_method || 'cash',
      payment_status: body.payment_status || 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('food_orders')
      .insert([newOrder])
      .select()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    return NextResponse.json({ success: true, order: data?.[0] }, { status: 201 })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const restaurantId = request.nextUrl.searchParams.get('restaurant_id')
    
    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurant_id' }, { status: 400 })
    }

    // Import supabase only when needed
    const { supabase } = await import('@/lib/supabase')

    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    return NextResponse.json({ success: true, orders: data })
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
