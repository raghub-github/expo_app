import { useState, useCallback } from 'react'
import { useAppSelector } from '@/lib/hooks'

export type ServiceType = 'food' | 'person' | 'parcel'
export type OrderStatus = 'placed' | 'confirmed' | 'preparing' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled' | 'searching' | 'driver_assigned' | 'scheduled'

export interface BaseOrder {
  id: string
  order_id: string
  user_id: string
  user_phone: string
  user_name: string | null
  status: OrderStatus
  status_history: Array<{ status: string; timestamp: string }>
  payment_method: string
  payment_status: string
  total_amount: number
  discount: number
  created_at: string
  updated_at: string
  serviceType: ServiceType
}

export interface FoodOrder extends BaseOrder {
  serviceType: 'food'
  restaurant_id: string
  restaurant_name: string
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
  delivery_fee: number
  taxes: number
  delivery_address: {
    address: string
    landmark?: string
    lat?: number
    lng?: number
  }
  delivery_instructions: string | null
  estimated_delivery_time: string | null
  delivered_at: string | null
  delivery_partner_name: string | null
  delivery_partner_phone: string | null
}

export interface PersonOrder extends BaseOrder {
  serviceType: 'person'
  ride_type: string
  passengers: number
  pickup_location: {
    address: string
    lat?: number
    lng?: number
  }
  dropoff_location: {
    address: string
    lat?: number
    lng?: number
  }
  distance_km: number | null
  estimated_duration_mins: number | null
  base_fare: number
  distance_fare: number
  time_fare: number
  surge_multiplier: number
  is_scheduled: boolean
  scheduled_at: string | null
  pickup_time: string | null
  dropoff_time: string | null
  driver_name: string | null
  driver_phone: string | null
  driver_photo: string | null
  vehicle_number: string | null
  vehicle_model: string | null
  driver_rating: number | null
  user_rating: number | null
  user_feedback: string | null
}

export interface ParcelOrder extends BaseOrder {
  serviceType: 'parcel'
  parcel_type: string
  weight_range: string | null
  description: string | null
  is_fragile: boolean
  pickup_location: {
    address: string
    lat?: number
    lng?: number
  }
  dropoff_location: {
    address: string
    lat?: number
    lng?: number
  }
  distance_km: number | null
  receiver_name: string
  receiver_phone: string
  base_price: number
  weight_charge: number
  distance_charge: number
  insurance_fee: number
  is_scheduled: boolean
  scheduled_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  estimated_delivery_time: string | null
  tracking_number: string | null
  delivery_partner_name: string | null
  delivery_partner_phone: string | null
  delivery_proof_image: string | null
  user_rating: number | null
  user_feedback: string | null
}

export type Order = FoodOrder | PersonOrder | ParcelOrder

interface OrdersResponse {
  success: boolean
  orders: Order[]
  counts?: {
    food: number
    person: number
    parcel: number
    total: number
  }
  error?: string
}

interface PlaceOrderResponse {
  success: boolean
  orderId: string
  order: Order
  message: string
  error?: string
}

interface FoodOrderData {
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

interface PersonOrderData {
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

interface ParcelOrderData {
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

export function useOrders() {
  const { user, isAuthenticated } = useAppSelector(state => state.auth)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ food: number; person: number; parcel: number; total: number } | null>(null)

  // Fetch orders
  const fetchOrders = useCallback(async (options?: {
    serviceType?: ServiceType
    status?: OrderStatus
    limit?: number
  }) => {
    if (!isAuthenticated || !user) {
      setError('User not authenticated')
      return []
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      
      if (user.id) {
        params.set('userId', user.id)
      } else if (user.phone) {
        params.set('userPhone', user.phone)
      }

      if (options?.serviceType) {
        params.set('serviceType', options.serviceType)
      }
      if (options?.status) {
        params.set('status', options.status)
      }
      if (options?.limit) {
        params.set('limit', options.limit.toString())
      }

      const response = await fetch(`/api/orders?${params.toString()}`)
      const data: OrdersResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch orders')
      }

      setOrders(data.orders)
      if (data.counts) {
        setCounts(data.counts)
      }
      return data.orders
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orders'
      setError(errorMessage)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user])

  // Place a food order
  const placeFoodOrder = useCallback(async (orderData: FoodOrderData): Promise<PlaceOrderResponse> => {
    if (!isAuthenticated || !user) {
      return { success: false, orderId: '', order: {} as Order, message: '', error: 'User not authenticated' }
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: 'food',
          orderData: {
            userId: user.id,
            userPhone: user.phone,
            userName: user.name,
            ...orderData
          }
        })
      })

      const data: PlaceOrderResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to place order')
      }

      // Refresh orders list
      await fetchOrders()

      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to place order'
      setError(errorMessage)
      return { success: false, orderId: '', order: {} as Order, message: '', error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user, fetchOrders])

  // Place a person/ride order
  const placePersonOrder = useCallback(async (orderData: PersonOrderData): Promise<PlaceOrderResponse> => {
    if (!isAuthenticated || !user) {
      return { success: false, orderId: '', order: {} as Order, message: '', error: 'User not authenticated' }
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: 'person',
          orderData: {
            userId: user.id,
            userPhone: user.phone,
            userName: user.name,
            ...orderData
          }
        })
      })

      const data: PlaceOrderResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to book ride')
      }

      await fetchOrders()
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to book ride'
      setError(errorMessage)
      return { success: false, orderId: '', order: {} as Order, message: '', error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user, fetchOrders])

  // Place a parcel order
  const placeParcelOrder = useCallback(async (orderData: ParcelOrderData): Promise<PlaceOrderResponse> => {
    if (!isAuthenticated || !user) {
      return { success: false, orderId: '', order: {} as Order, message: '', error: 'User not authenticated' }
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: 'parcel',
          orderData: {
            userId: user.id,
            userPhone: user.phone,
            userName: user.name,
            ...orderData
          }
        })
      })

      const data: PlaceOrderResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send parcel')
      }

      await fetchOrders()
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send parcel'
      setError(errorMessage)
      return { success: false, orderId: '', order: {} as Order, message: '', error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user, fetchOrders])

  return {
    orders,
    isLoading,
    error,
    counts,
    fetchOrders,
    placeFoodOrder,
    placePersonOrder,
    placeParcelOrder
  }
}
