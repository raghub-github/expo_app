'use client'

import { useState } from 'react'
import Image from 'next/image'
import RatingCard from './RatingCard'
import { CartItem } from './OrderPage'

interface RestaurantDetailPageProps {
  restaurantId: number
  onBack: () => void
  onAddToCart?: (item: CartItem) => void
}

const restaurantData = {
  1: {
    id: 1,
    name: "Delhi Darbar Dhaba",
    image: "https://images.unsplash.com/photo-1552566626-52f8b828add9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    rating: 4.2,
    totalRatings: 1245,
    cuisine: "North Indian, Mughlai, Tandoor",
    distance: "4 km",
    price: "₹500 for two",
    deliveryTime: "30-40 mins",
    isVeg: false,
    tags: ["Fast Delivery", "Family Friendly"],
    description: "Authentic North Indian cuisine with a modern twist. Famous for our butter chicken and naan.",
    ratingDetails: { food: 4.5, service: 4.2, ambiance: 4.0, value: 4.3 },
    topSelling: [
      { name: "Butter Chicken", price: 320, orders: 1240 },
      { name: "Garlic Naan", price: 60, orders: 980 },
      { name: "Paneer Butter Masala", price: 280, orders: 850 },
      { name: "Chicken Biryani", price: 300, orders: 780 },
      { name: "Dal Makhani", price: 200, orders: 650 },
    ],
    menu: {
      recommended: [
        { name: "Paneer Butter Masala", desc: "Cottage cheese in rich tomato and butter gravy", price: 280, isVeg: true },
        { name: "Chicken Tikka Masala", desc: "Grilled chicken chunks in creamy tomato gravy", price: 320, isVeg: false },
      ],
      mainCourse: [
        { name: "Palak Paneer", desc: "Cottage cheese in spinach gravy", price: 260, isVeg: true },
        { name: "Dal Makhani", desc: "Black lentils slow cooked with butter and cream", price: 200, isVeg: true },
      ],
    }
  }
}

export default function RestaurantDetailPage({ restaurantId, onBack, onAddToCart }: RestaurantDetailPageProps) {
  const [localVegOnly, setLocalVegOnly] = useState(false)
  const restaurant = restaurantData[restaurantId as keyof typeof restaurantData]

  if (!restaurant) {
    return <div>Restaurant not found</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f9fa] via-white to-[#f0f0f0] pt-20">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-[5%] py-6 sm:py-8">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 sm:mb-8 text-[#FF6B6B] cursor-pointer font-semibold px-4 py-2.5 rounded-full transition-all hover:bg-[#FFE6E6] group"
        >
          <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i> 
          <span className="hidden sm:inline">Back to Restaurants</span>
          <span className="sm:hidden">Back</span>
        </button>

        {/* Restaurant Hero */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-8 sm:mb-10 border border-[#e9ecef]">
          <div className="flex gap-6 sm:gap-8 items-start flex-col lg:flex-row">
            {/* Image */}
            <div className="w-full lg:w-96 h-64 sm:h-80 lg:h-96 relative flex-shrink-0 group overflow-hidden rounded-b-3xl lg:rounded-r-3xl">
              <Image
                src={restaurant.image}
                alt={restaurant.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
            </div>

            {/* Info */}
            <div className="flex-1 p-6 sm:p-8">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex-1">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1A2E] mb-3">
                    {restaurant.name}
                  </h1>
                  <div className="text-[#6C757D] text-sm sm:text-base mb-5 font-medium">
                    {restaurant.cuisine}
                  </div>
                </div>
                {/* Veg Toggle */}
                <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] rounded-full transition-all hover:bg-[#f0f0f0]">
                  <span className="text-xs font-bold text-[#1A1A2E] whitespace-nowrap">🥬 Veg</span>
                  <label className="relative inline-block w-9 h-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localVegOnly}
                      onChange={(e) => setLocalVegOnly(e.target.checked)}
                      className="opacity-0 w-0 h-0"
                    />
                    <span className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-all duration-300 ${
                      localVegOnly 
                        ? 'bg-gradient-to-r from-[#16c2a5] to-[#0fa589]' 
                        : 'bg-[#ccc]'
                    }`}>
                      <span className={`absolute h-4 w-4 left-0.5 top-0.5 bg-white rounded-full transition-all duration-300 shadow-lg ${
                        localVegOnly ? 'translate-x-4' : ''
                      }`}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Rating and Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-gradient-to-br from-[#FFE6E6] to-[#FFF0F0] rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-star text-[#FF6B6B] text-lg"></i>
                    <span className="text-2xl sm:text-3xl font-bold text-[#1A1A2E]">{restaurant.rating}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-[#6C757D]">{restaurant.totalRatings}+ ratings</div>
                </div>

                <div className="bg-gradient-to-br from-[#E0AAFF] to-[#F0DCFF] rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-clock text-[#9D4EDD] text-lg"></i>
                    <span className="text-xl font-bold text-[#1A1A2E]">{restaurant.deliveryTime}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-[#6C757D]">Delivery time</div>
                </div>

                <div className="bg-gradient-to-br from-[#A8F0E8] to-[#D5F9F3] rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-location-dot text-[#4ECDC4] text-lg"></i>
                    <span className="text-xl font-bold text-[#1A1A2E]">{restaurant.distance}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-[#6C757D]">Distance</div>
                </div>

                <div className="bg-gradient-to-br from-[#FFD3A5] to-[#FFE8CC] rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-rupee-sign text-[#FFD166] text-lg"></i>
                    <span className="text-lg font-bold text-[#1A1A2E]">{restaurant.price}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-[#6C757D]">For two</div>
                </div>
              </div>

              {/* Description */}
              <p className="text-[#6C757D] text-sm sm:text-base mb-6 leading-relaxed">
                {restaurant.description}
              </p>

              {/* Tags */}
              <div className="flex gap-2 flex-wrap">
                {restaurant.tags.map((tag, index) => (
                  <span key={index} className="bg-[#FFE6E6] text-[#FF6B6B] px-4 py-2 rounded-full text-xs sm:text-sm font-semibold">
                    <i className="fas fa-check-circle mr-1"></i>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rating Card */}
        <RatingCard
          rating={restaurant.rating}
          totalRatings={restaurant.totalRatings}
          showDetails={true}
          ratingDetails={restaurant.ratingDetails}
        />

        {/* Top Selling Items */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg mb-8 sm:mb-10 border border-[#e9ecef]">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <i className="fas fa-fire text-[#FF6B6B] text-2xl"></i>
            <h3 className="text-2xl sm:text-3xl font-bold text-[#1A1A2E]">Top Selling Items</h3>
            <span className="ml-auto bg-[#FFE6E6] text-[#FF6B6B] px-3 py-1 rounded-full text-sm font-bold">
              ⭐ Must Try
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {restaurant.topSelling.map((item, index) => (
              <div key={index} className="bg-gradient-to-br from-[#f8f9fa] to-white rounded-2xl p-4 sm:p-5 text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg border border-[#e9ecef] hover:border-[#FF6B6B]">
                <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold mx-auto mb-3 text-lg sm:text-xl">
                  {index + 1}
                </div>
                <div className="font-bold text-[#1A1A2E] mb-2 text-sm sm:text-base">{item.name}</div>
                <div className="text-[#FF6B6B] font-bold mb-2 text-lg sm:text-2xl">₹{item.price}</div>
                <div className="text-xs text-[#6C757D] flex items-center justify-center gap-1">
                  <i className="fas fa-shopping-bag"></i>
                  {item.orders}+ orders
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Menu Filter */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg mb-8 sm:mb-10 border border-[#e9ecef]">
          <h3 className="text-2xl sm:text-3xl font-bold mb-6 text-[#1A1A2E]">Browse Menu</h3>
          <div className="flex gap-3 flex-wrap overflow-x-auto pb-2">
            {['All', 'Veg', 'Non Veg', 'Recommended', 'Best Seller'].map((filter) => (
              <button
                key={filter}
                className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-full cursor-pointer transition-all font-medium text-sm sm:text-base whitespace-nowrap bg-[#f0f0f0] text-[#1A1A2E] hover:bg-gradient-to-r hover:from-[#FF6B6B] hover:to-[#FF8E8E] hover:text-white border-2 border-transparent hover:border-[#FF6B6B]"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Sections */}
        <div className="space-y-8">
          {/* Recommended Section */}
          <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-[#e9ecef]">
            <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] px-6 sm:px-8 py-5 sm:py-6">
              <h3 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                <i className="fas fa-star"></i>
                Recommended
              </h3>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              {restaurant.menu.recommended.map((item, index) => (
                <div key={index} className="flex justify-between items-start py-4 border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#f8f9fa] px-4 sm:px-5 -mx-4 sm:-mx-5 rounded-lg transition-colors">
                  <div className="flex-1">
                    <h4 className="text-lg sm:text-xl font-bold text-[#1A1A2E] mb-2 flex items-center gap-2">
                      {item.name}
                      <span className="text-xl">{item.isVeg ? '🥬' : '🍗'}</span>
                    </h4>
                    <div className="text-[#6C757D] text-sm sm:text-base mb-2">{item.desc}</div>
                    <div className="font-bold text-[#FF6B6B] text-lg">₹{item.price}</div>
                  </div>
                  <button 
                    onClick={() => {
                      onAddToCart?.({
                        id: `${restaurant.id}-recommended-${index}`,
                        name: item.name,
                        price: item.price,
                        image: restaurant.image,
                        quantity: 1,
                        restaurantName: restaurant.name
                      })
                    }}
                    className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full cursor-pointer font-bold transition-all hover:shadow-lg hover:-translate-y-1 active:scale-95 ml-4 whitespace-nowrap text-sm sm:text-base"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Main Course Section */}
          <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-[#e9ecef]">
            <div className="bg-gradient-to-r from-[#4ECDC4] to-[#6BE0D8] px-6 sm:px-8 py-5 sm:py-6">
              <h3 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                <i className="fas fa-utensils"></i>
                Main Course
              </h3>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              {restaurant.menu.mainCourse.map((item, index) => (
                <div key={index} className="flex justify-between items-start py-4 border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#f8f9fa] px-4 sm:px-5 -mx-4 sm:-mx-5 rounded-lg transition-colors">
                  <div className="flex-1">
                    <h4 className="text-lg sm:text-xl font-bold text-[#1A1A2E] mb-2 flex items-center gap-2">
                      {item.name}
                      <span className="text-xl">{item.isVeg ? '🥬' : '🍗'}</span>
                    </h4>
                    <div className="text-[#6C757D] text-sm sm:text-base mb-2">{item.desc}</div>
                    <div className="font-bold text-[#FF6B6B] text-lg">₹{item.price}</div>
                  </div>
                  <button 
                    onClick={() => {
                      onAddToCart?.({
                        id: `${restaurant.id}-mainCourse-${index}`,
                        name: item.name,
                        price: item.price,
                        image: restaurant.image,
                        quantity: 1,
                        restaurantName: restaurant.name
                      })
                    }}
                    className="bg-gradient-to-r from-[#4ECDC4] to-[#6BE0D8] text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full cursor-pointer font-bold transition-all hover:shadow-lg hover:-translate-y-1 active:scale-95 ml-4 whitespace-nowrap text-sm sm:text-base"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

