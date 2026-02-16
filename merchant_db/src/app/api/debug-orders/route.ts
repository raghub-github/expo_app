import { NextResponse } from 'next/server'
import { getAllOrdersInDatabase, getOrdersForRestaurantName, fetchFoodOrdersByRestaurant, fetchOrderStats } from '@/lib/database'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId') || 'GMM0001'
    const restaurantName = searchParams.get('restaurantName') || 'Hot Chappathis Veg And Non Veg'

    console.log('🔍 Debug endpoint called with:', { restaurantId, restaurantName })

    // Get all orders
    const allOrders = await getAllOrdersInDatabase()
    
    // Get orders by ID
    const ordersByID = await fetchFoodOrdersByRestaurant(restaurantId)
    
    // Get orders by name
    const ordersByName = await getOrdersForRestaurantName(restaurantName)
    
    // Get stats
    const stats = await fetchOrderStats(restaurantId)

    return NextResponse.json({
      debug: {
        restaurantId,
        restaurantName,
      },
      results: {
        totalOrdersInDatabase: allOrders.length,
        ordersByRestaurantID: {
          count: ordersByID.length,
          data: ordersByID.slice(0, 3),
        },
        ordersByRestaurantName: {
          count: ordersByName.length,
          data: ordersByName.slice(0, 3),
        },
        stats: stats,
      },
      allOrdersSample: allOrders.slice(0, 5).map(o => ({
        id: o.order_number, // Use order_number as unique id
        order_number: o.order_number,
        restaurant_id: o.restaurant_id,
        restaurant_name: o.restaurant_name,
        status: o.status,
        created_at: o.created_at,
      })),
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
