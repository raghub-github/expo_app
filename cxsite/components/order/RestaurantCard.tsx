'use client'

import Image from 'next/image'
import Link from 'next/link'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'
import RatingCard from './RatingCard'

interface Restaurant {
  id: number
  name: string
  image: string
  rating: number
  totalRatings: number
  cuisine: string
  distance: string
  price: string
  deliveryTime: string
  isVeg: boolean
  tags: string[]
  description: string
  ratingDetails: {
    food: number
    service: number
    ambiance: number
    value: number
  }
}

interface RestaurantCardProps {
  restaurant: Restaurant
  onClick?: () => void
}

export default function RestaurantCard({ restaurant, onClick }: RestaurantCardProps) {
  const cardContent = (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-lg transition-all duration-300 cursor-pointer relative hover:-translate-y-3 hover:shadow-2xl border border-[#f0f0f0] hover:border-[#FF6B6B]"
    >
      {/* Image Container */}
      <div className="relative h-56 sm:h-48 w-full overflow-hidden bg-gradient-to-br from-[#f0f0f0] to-[#e0e0e0]">
        <Image
          src={restaurant.image}
          alt={restaurant.name}
          fill
          className="object-cover group-hover:scale-110 transition-transform duration-300"
        />
        
        {/* Veg/Non-Veg Badge */}
        <div className={`absolute top-3 sm:top-4 left-3 sm:left-4 px-3 sm:px-3.5 py-1.5 rounded-full text-white text-xs font-bold z-10 shadow-lg flex items-center gap-1.5 ${
          restaurant.isVeg 
            ? 'bg-gradient-to-r from-[#06D6A0] to-[#00BF9A]' 
            : 'bg-gradient-to-r from-[#EF476F] to-[#E83B5C]'
        }`}>
          <span>{restaurant.isVeg ? '🥬' : '🍗'}</span>
          {restaurant.isVeg ? 'Pure Veg' : 'Non Veg'}
        </div>

        {/* Offers Badge */}
        <div className="absolute top-3 sm:top-4 right-3 sm:right-4 bg-gradient-to-r from-[#FFD166] to-[#FFC94D] text-[#1A1A2E] px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold z-10 shadow-lg flex items-center gap-1">
          <i className="fas fa-star text-yellow-500"></i>
          {restaurant.rating}
        </div>

        {/* Delivery Time Overlay */}
        <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 bg-black bg-opacity-70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
          <i className="fas fa-clock"></i>
          {restaurant.deliveryTime}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        {/* Name and Rating */}
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="text-lg sm:text-xl font-bold text-[#1A1A2E] line-clamp-1 group-hover:text-[#FF6B6B] transition-colors">
            {restaurant.name}
          </h3>
        </div>

        {/* Cuisine Type */}
        <p className="text-[#6C757D] text-xs sm:text-sm mb-3 line-clamp-1 font-medium">
          {restaurant.cuisine}
        </p>

        {/* Distance and Price */}
        <div className="flex items-center gap-2 mb-4 text-xs sm:text-sm text-[#6C757D] flex-wrap">
          <span className="flex items-center gap-1">
            <i className="fas fa-location-dot text-[#FF6B6B]"></i>
            {restaurant.distance}
          </span>
          <span className="w-1 h-1 bg-[#ddd] rounded-full"></span>
          <span className="font-semibold text-[#1A1A2E]">{restaurant.price}</span>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {restaurant.tags.slice(0, 2).map((tag, index) => (
            <span key={index} className="bg-[#f0f0f0] text-[#1A1A2E] px-2.5 py-1 rounded-full text-xs font-medium group-hover:bg-[#FFE6E6] group-hover:text-[#FF6B6B] transition-colors">
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[#f0f0f0] group-hover:border-[#FFE6E6] transition-colors">
          <div className="text-[#6C757D] text-xs sm:text-sm font-medium">
            <span className="text-[#FF6B6B] font-bold">★</span> {restaurant.totalRatings.toLocaleString()} reviews
          </div>
          <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] text-white px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all hover:shadow-lg group-hover:scale-105">
            View Menu
          </div>
        </div>
      </div>
    </div>
  )

  return onClick ? (
    <div onClick={onClick}>
      {cardContent}
    </div>
  ) : (
    <Link href={restaurantDetailHref({ public_slug: (restaurant as { public_slug?: string }).public_slug, store_id: String((restaurant as { store_id?: string }).store_id ?? restaurant.id), id: restaurant.id }, 'order')} className="no-underline">
      {cardContent}
    </Link>
  )
}

