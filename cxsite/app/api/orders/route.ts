import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Generate unique order ID
function generateOrderId(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

// Type definitions
interface FoodOrderRequest {
  userId: string
  userPhone: string
  userName?: string
  restaurantId: string
  restaurantName: string
  items: Array<{
    id: string
    name: string
    quantity: number
    price: number
    image?: string
    size?: { name: string; price: number }
    addons?: Array<{ name: string; price: number }>
  }>
  subtotal: number
  deliveryFee: number
  taxes: number
  discount: number
  totalAmount: number
  deliveryAddress: {
    address: string
    landmark?: string
    lat?: number
    lng?: number
  }
  deliveryInstructions?: string
  paymentMethod: string
}

interface PersonOrderRequest {
  userId: string
  userPhone: string
  userName?: string
  rideType: string
  passengers: number
  pickupLocation: {
    address: string
    lat?: number
    lng?: number
  }
  dropoffLocation: {
    address: string
    lat?: number
    lng?: number
  }
  distanceKm?: number
  estimatedDurationMins?: number
  baseFare: number
  distanceFare: number
  timeFare: number
  surgeMultiplier?: number
  discount: number
  totalAmount: number
  isScheduled?: boolean
  scheduledAt?: string
  paymentMethod: string
}

interface ParcelOrderRequest {
  userId: string
  userPhone: string
  userName?: string
  parcelType: string
  weightRange?: string
  description?: string
  isFragile?: boolean
  pickupLocation: {
    address: string
    lat?: number
    lng?: number
  }
  dropoffLocation: {
    address: string
    lat?: number
    lng?: number
  }
  distanceKm?: number
  receiverName: string
  receiverPhone: string
  basePrice: number
  weightCharge: number
  distanceCharge: number
  insuranceFee?: number
  discount: number
  totalAmount: number
  isScheduled?: boolean
  scheduledAt?: string
  paymentMethod: string
}

// POST - Create a new order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serviceType, orderData } = body

    if (!serviceType || !orderData) {
      return NextResponse.json(
        { error: 'Missing required fields: serviceType and orderData' },
        { status: 400 }
      )
    }

    let result
    let orderId

    switch (serviceType) {
      case 'food':
        orderId = generateOrderId('GM-F-')
        result = await createFoodOrder(orderId, orderData as FoodOrderRequest)
        break
      case 'person':
        orderId = generateOrderId('GM-R-')
        result = await createPersonOrder(orderId, orderData as PersonOrderRequest)
        break
      case 'parcel':
        orderId = generateOrderId('GM-P-')
        result = await createParcelOrder(orderId, orderData as ParcelOrderRequest)
        break
      default:
        return NextResponse.json(
          { error: 'Invalid service type. Must be: food, person, or parcel' },
          { status: 400 }
        )
    }

    if (result.error) {
      console.error(`Error creating ${serviceType} order:`, result.error)
      return NextResponse.json(
        { error: `Failed to create order: ${result.error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      orderId,
      order: result.data,
      message: 'Order placed successfully'
    })

  } catch (error) {
    console.error('Order creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Create food order
async function createFoodOrder(orderId: string, data: FoodOrderRequest) {
  const estimatedDeliveryTime = new Date()
  estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + 45)

  return await supabase.from('food_orders').insert({
    order_id: orderId,
    user_id: data.userId,
    user_phone: data.userPhone,
    user_name: data.userName || null,
    restaurant_id: data.restaurantId,
    restaurant_name: data.restaurantName,
    items: data.items,
    subtotal: data.subtotal,
    delivery_fee: data.deliveryFee,
    taxes: data.taxes,
    discount: data.discount,
    total_amount: data.totalAmount,
    delivery_address: data.deliveryAddress,
    delivery_instructions: data.deliveryInstructions || null,
    payment_method: data.paymentMethod,
    payment_status: data.paymentMethod === 'cod' ? 'pending' : 'paid',
    status: 'placed',
    status_history: [{ status: 'placed', timestamp: new Date().toISOString() }],
    estimated_delivery_time: estimatedDeliveryTime.toISOString()
  }).select().single()
}

// Create person/ride order
async function createPersonOrder(orderId: string, data: PersonOrderRequest) {
  return await supabase.from('person_orders').insert({
    order_id: orderId,
    user_id: data.userId,
    user_phone: data.userPhone,
    user_name: data.userName || null,
    ride_type: data.rideType,
    passengers: data.passengers,
    pickup_location: data.pickupLocation,
    dropoff_location: data.dropoffLocation,
    distance_km: data.distanceKm || null,
    estimated_duration_mins: data.estimatedDurationMins || null,
    base_fare: data.baseFare,
    distance_fare: data.distanceFare,
    time_fare: data.timeFare,
    surge_multiplier: data.surgeMultiplier || 1.00,
    discount: data.discount,
    total_amount: data.totalAmount,
    is_scheduled: data.isScheduled || false,
    scheduled_at: data.scheduledAt || null,
    payment_method: data.paymentMethod,
    payment_status: data.paymentMethod === 'cod' ? 'pending' : 'paid',
    status: data.isScheduled ? 'scheduled' : 'searching',
    status_history: [{ status: data.isScheduled ? 'scheduled' : 'searching', timestamp: new Date().toISOString() }]
  }).select().single()
}

// Create parcel order
async function createParcelOrder(orderId: string, data: ParcelOrderRequest) {
  const estimatedDeliveryTime = new Date()
  estimatedDeliveryTime.setHours(estimatedDeliveryTime.getHours() + 2)

  const trackingNumber = `TRK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`

  return await supabase.from('parcel_orders').insert({
    order_id: orderId,
    user_id: data.userId,
    user_phone: data.userPhone,
    user_name: data.userName || null,
    parcel_type: data.parcelType,
    weight_range: data.weightRange || null,
    description: data.description || null,
    is_fragile: data.isFragile || false,
    pickup_location: data.pickupLocation,
    dropoff_location: data.dropoffLocation,
    distance_km: data.distanceKm || null,
    receiver_name: data.receiverName,
    receiver_phone: data.receiverPhone,
    base_price: data.basePrice,
    weight_charge: data.weightCharge,
    distance_charge: data.distanceCharge,
    insurance_fee: data.insuranceFee || 0,
    discount: data.discount,
    total_amount: data.totalAmount,
    is_scheduled: data.isScheduled || false,
    scheduled_at: data.scheduledAt || null,
    payment_method: data.paymentMethod,
    payment_status: data.paymentMethod === 'cod' ? 'pending' : 'paid',
    status: 'placed',
    status_history: [{ status: 'placed', timestamp: new Date().toISOString() }],
    tracking_number: trackingNumber,
    estimated_delivery_time: estimatedDeliveryTime.toISOString()
  }).select().single()
}

// GET - Fetch orders for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const userPhone = searchParams.get('userPhone')
    const serviceType = searchParams.get('serviceType')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!userId && !userPhone) {
      return NextResponse.json(
        { error: 'Either userId or userPhone is required' },
        { status: 400 }
      )
    }

    const filterColumn = userId ? 'user_id' : 'user_phone'
    const filterValue = userId || userPhone

    // If specific service type is requested
    if (serviceType && ['food', 'person', 'parcel'].includes(serviceType)) {
      const tableName = `${serviceType}_orders`
      let query = supabase
        .from(tableName)
        .select('*')
        .eq(filterColumn, filterValue)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        orders: data.map(order => ({ ...order, serviceType }))
      })
    }

    // Fetch all orders from all tables
    const [foodOrders, personOrders, parcelOrders] = await Promise.all([
      supabase
        .from('food_orders')
        .select('*')
        .eq(filterColumn, filterValue)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('person_orders')
        .select('*')
        .eq(filterColumn, filterValue)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('parcel_orders')
        .select('*')
        .eq(filterColumn, filterValue)
        .order('created_at', { ascending: false })
        .limit(limit)
    ])

    // Combine and sort all orders
    const allOrders = [
      ...(foodOrders.data || []).map(o => ({ ...o, serviceType: 'food' })),
      ...(personOrders.data || []).map(o => ({ ...o, serviceType: 'person' })),
      ...(parcelOrders.data || []).map(o => ({ ...o, serviceType: 'parcel' }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Apply status filter if provided
    const filteredOrders = status
      ? allOrders.filter(o => o.status === status)
      : allOrders

    return NextResponse.json({
      success: true,
      orders: filteredOrders.slice(0, limit),
      counts: {
        food: (foodOrders.data || []).length,
        person: (personOrders.data || []).length,
        parcel: (parcelOrders.data || []).length,
        total: allOrders.length
      }
    })

  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
