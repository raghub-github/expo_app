'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { useOrderServiceArea } from '@/lib/hooks/useOrderServiceArea'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import CategoriesSection from './CategoriesSection'
import RestaurantDetailPage from './RestaurantDetailPage'
import Footer from '@/components/layout/Footer'

export interface CartItem {
  id: string
  name: string
  price: number
  image: string
  quantity: number
  restaurantName: string
}

export default function OrderPage() {
  const router = useRouter()
  const { location } = useLocationContext()
  const locationCommitted = location.locationCommittedByUser === true
  const { items, total, addToCart, removeFromCart, updateItemQuantity, restaurantName } = useCart()

  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null)
  const [vegOnly, setVegOnly] = useState(false)
  const serviceAreaMode = useOrderServiceArea()

  const cartCount = items.length

  const handleAddToCart = (item: CartItem) => {
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      restaurantId: selectedRestaurantId?.toString(),
      restaurantName: item.restaurantName,
      image: item.image, // Include product image
    })
  }

  const handleRemoveFromCart = (itemId: string) => {
    removeFromCart(itemId)
  }

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    updateItemQuantity(itemId, quantity)
  }


  if (selectedRestaurantId) {
    return (
      <>
        <RestaurantDetailPage 
          restaurantId={selectedRestaurantId}
          onBack={() => setSelectedRestaurantId(null)}
          onAddToCart={handleAddToCart}
        />
        <Footer />
      </>
    )
  }

  return (
    <>
      <CategoriesSection
        onViewRestaurants={() => {
          if (!locationCommitted) {
            router.push('/restaurants')
            return
          }
          const carry = new URLSearchParams()
          if (location.displayName) carry.set('location', location.displayName)
          if (location.lat != null && location.lon != null) {
            carry.set('lat', String(location.lat))
            carry.set('lon', String(location.lon))
          }
          const geoQs = getRestaurantGeoQueryString(location)
          if (geoQs) {
            for (const [key, value] of new URLSearchParams(geoQs)) {
              carry.set(key, value)
            }
          }
          const qs = carry.toString()
          router.push(qs ? `/restaurants?${qs}` : '/restaurants')
        }}
        vegOnly={vegOnly}
        onAddToCart={handleAddToCart}
        serviceAreaMode={serviceAreaMode}
      />
      <Footer />
    </>
  )
}

