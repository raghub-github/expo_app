'use client'

import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { useOrderServiceArea } from '@/lib/hooks/useOrderServiceArea'
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
  const searchParams = useSearchParams()
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
          const carry = new URLSearchParams()
          const location = searchParams.get('location')
          const lat = searchParams.get('lat')
          const lon = searchParams.get('lon')
          if (location) carry.set('location', location)
          if (lat && lon) {
            carry.set('lat', lat)
            carry.set('lon', lon)
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

