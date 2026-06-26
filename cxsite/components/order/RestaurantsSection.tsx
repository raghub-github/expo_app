'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'

interface RestaurantCard {
  id: string
  name: string
  cuisines: string[]
  rating: number
  reviews: number
  deliveryTime: number
  deliveryFee: number
  image: string
  isVeg?: boolean
  discount?: number
  fssaiLicense: string
  category?: string
}

const RestaurantListPage = ({ 
  onSelectRestaurant, 
  onBackToCategories,
  vegOnly 
}: {
  onSelectRestaurant: (id: number) => void
  onBackToCategories: () => void
  vegOnly: boolean
}) => {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category')
  
  const [localVegOnly, setLocalVegOnly] = useState(vegOnly)
  const [sortBy, setSortBy] = useState<'rating' | 'delivery' | 'name'>('rating')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam)

  // Dummy restaurant data
  const restaurants: RestaurantCard[] = [
    {
      id: '1',
      name: 'Bikkhane Biryani',
      cuisines: ['Biryani', 'Hyderabadi'],
      rating: 4.3,
      reviews: 33100,
      deliveryTime: 34,
      deliveryFee: 40,
      image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a104?w=400&h=300&fit=crop',
      discount: 20,
      fssaiLicense: '10421000001362',
      category: 'Biryani'
    },
    {
      id: '2',
      name: 'Biryanis & More',
      cuisines: ['Biryani', 'Lucknowi', 'Mughlai'],
      rating: 4.5,
      reviews: 28500,
      deliveryTime: 28,
      deliveryFee: 30,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
      discount: 15,
      fssaiLicense: '10421000001450',
      category: 'Biryani'
    },
    {
      id: '3',
      name: 'Spice Corner',
      cuisines: ['Indian', 'North Indian', 'South Indian'],
      rating: 4.2,
      reviews: 19800,
      deliveryTime: 35,
      deliveryFee: 45,
      image: 'https://images.unsplash.com/photo-1535521066927-ab7c9ab60908?w=400&h=300&fit=crop',
      isVeg: true,
      fssaiLicense: '10421000001389',
      category: 'South Indian'
    },
    {
      id: '4',
      name: 'The Maharaja Restaurant',
      cuisines: ['Biryani', 'Mughlai', 'Hyderabadi'],
      rating: 4.4,
      reviews: 42300,
      deliveryTime: 32,
      deliveryFee: 40,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
      discount: 25,
      fssaiLicense: '10421000001520',
      category: 'Biryani'
    },
    {
      id: '5',
      name: 'Royal Biryani House',
      cuisines: ['Biryani', 'Andhra', 'Lucknowi'],
      rating: 4.6,
      reviews: 51200,
      deliveryTime: 30,
      deliveryFee: 35,
      image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a104?w=400&h=300&fit=crop',
      discount: 30,
      fssaiLicense: '10421000001678',
      category: 'Biryani'
    },
    {
      id: '6',
      name: 'Garden Fresh Veg Paradise',
      cuisines: ['Vegetarian', 'North Indian', 'Rajasthani'],
      rating: 4.1,
      reviews: 16700,
      deliveryTime: 25,
      deliveryFee: 25,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
      isVeg: true,
      fssaiLicense: '10421000001234',
      category: 'North Indian'
    },
  ]

  const filteredRestaurants = restaurants.filter(r => {
    const vegMatch = !localVegOnly || r.isVeg
    const categoryMatch = !selectedCategory || r.category === selectedCategory
    return vegMatch && categoryMatch
  })
  
  const sortedRestaurants = [...filteredRestaurants].sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return b.rating - a.rating
      case 'delivery':
        return a.deliveryTime - b.deliveryTime
      case 'name':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#f9fafb] to-[#f3f4f6]">
      {/* Header */}
      <div className="bg-white shadow-md border-b border-[#e9ecef] sticky top-14 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          {/* Title Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {selectedCategory && (
                  <>
                    <Link 
                      href="/"
                      className="inline-flex items-center gap-1 text-[#16c2a5] hover:text-[#0fa589] font-bold text-sm transition-colors"
                    >
                      <i className="fas fa-home"></i>
                      Home
                    </Link>
                    <span className="text-gray-400">/</span>
                    <Link 
                      href="/restaurants"
                      className="inline-flex items-center gap-1 text-[#16c2a5] hover:text-[#0fa589] font-bold text-sm transition-colors"
                    >
                      <i className="fas fa-arrow-left"></i>
                      All
                    </Link>
                  </>
                )}
                {!selectedCategory && (
                  <Link 
                    href="/"
                    className="inline-flex items-center gap-1 text-[#16c2a5] hover:text-[#0fa589] font-bold text-sm transition-colors"
                  >
                    <i className="fas fa-home"></i>
                    Home
                  </Link>
                )}
                <h1 className="text-3xl md:text-4xl font-black text-[#1A1A2E]">
                  {selectedCategory ? `${selectedCategory} Restaurants` : 'Restaurants Near You'}
                </h1>
              </div>
              <p className="text-sm text-gray-600 font-medium">
                <i className="fas fa-check-circle text-green-600 mr-1.5"></i>
                {sortedRestaurants.length} restaurants available
              </p>
            </div>
            
            {/* Veg Toggle */}
            <button
              onClick={() => setLocalVegOnly(!localVegOnly)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                localVegOnly
                  ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 shadow-md'
                  : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300'
              }`}
            >
              <i className="fas fa-leaf text-lg"></i>
              <span>{localVegOnly ? 'Veg Only' : 'All Cuisines'}</span>
            </button>
          </div>

          {/* Sort Options */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(['rating', 'delivery', 'name'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                  sortBy === option
                    ? 'bg-gradient-to-r from-[#16c2a5] to-[#0fa589] text-white shadow-lg'
                    : 'bg-white border-2 border-[#e9ecef] text-gray-700 hover:border-[#16c2a5] hover:text-[#16c2a5]'
                }`}
              >
                {option === 'rating' && '⭐ Highest Rating'}
                {option === 'delivery' && '⚡ Fastest Delivery'}
                {option === 'name' && '📝 A - Z'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Restaurants Grid */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        {sortedRestaurants.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {sortedRestaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                href={restaurantDetailHref(restaurant.id, 'order')}
                className="group block no-underline h-full"
              >
                <div className="h-full bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 flex flex-col hover:-translate-y-2 border border-gray-200 hover:border-[#16c2a5]">
                  {/* Image Section - Fixed Height with Better Badge Layout */}
                  <div className="relative w-full h-44 overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 flex-shrink-0">
                    <Image
                      src={restaurant.image}
                      alt={restaurant.name}
                      fill
                      priority={false}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                    />
                    
                    {/* Top Badge Area */}
                    <div className="absolute inset-0 top-0 pt-3 px-3 flex justify-between items-start pointer-events-none">
                      {/* Left: Veg Badge */}
                      {restaurant.isVeg && (
                        <div className="bg-white px-2.5 py-1 rounded-full text-green-700 font-bold text-xs shadow-md flex items-center gap-1 border border-green-300 pointer-events-auto">
                          <div className="w-2 h-2 bg-green-700 rounded-full"></div>
                          Pure Veg
                        </div>
                      )}
                      
                      {/* Right: Discount Badge */}
                      {restaurant.discount && (
                        <div className="bg-gradient-to-r from-[#ff6b35] to-[#ff8451] text-white px-2.5 py-1 rounded-full font-bold text-xs shadow-md flex items-center gap-0.5 pointer-events-auto">
                          <i className="fas fa-fire text-white text-sm"></i>
                          {restaurant.discount}% OFF
                        </div>
                      )}
                    </div>

                    {/* Bottom: Rating Badge */}
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex items-end justify-start p-2">
                      <div className="bg-gradient-to-r from-[#16c2a5] to-[#0fa589] text-white px-2.5 py-1 rounded-full font-bold text-xs flex items-center gap-1 shadow-md">
                        <i className="fas fa-star text-white text-sm"></i>
                        <span>{restaurant.rating}</span>
                      </div>
                    </div>
                  </div>

                  {/* Content Section - More Spacious */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    {/* Header with name and cuisine */}
                    <div className="mb-3">
                      <h3 className="font-black text-sm text-[#1A1A2E] group-hover:text-[#16c2a5] transition-colors line-clamp-2 mb-1">
                        {restaurant.name}
                      </h3>
                      <p className="text-xs text-gray-600 line-clamp-1 font-medium">
                        {restaurant.cuisines.join(', ')}
                      </p>
                    </div>

                    {/* Reviews Count */}
                    <div className="mb-3 pb-3 border-b border-gray-150">
                      <p className="text-xs text-gray-700 font-semibold flex items-center gap-2">
                        <span className="text-[#ff6b35] text-sm">★</span>
                        <span className="text-[#1A1A2E] font-bold">{restaurant.reviews.toLocaleString()}</span>
                        <span className="text-gray-500">ratings</span>
                      </p>
                    </div>

                    {/* FSSAI License - Trust Builder */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-2 mb-3">
                      <div className="text-green-700 font-black text-xs flex items-center gap-2">
                        <i className="fas fa-certificate text-green-600 text-sm"></i>
                        <span>FSSAI Verified</span>
                      </div>
                      <p className="text-green-700 font-mono text-[8px] mt-1.5 truncate">{restaurant.fssaiLicense}</p>
                    </div>

                    {/* Delivery Info - Bottom Section */}
                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200">
                      {/* Delivery Time */}
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#16c2a5] to-[#0fa589] flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-clock text-white text-xs"></i>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[#1A1A2E]">{restaurant.deliveryTime}m</span>
                          <span className="text-[8px] text-gray-500">Delivery</span>
                        </div>
                      </div>

                      {/* Delivery Fee */}
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8451] flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-rupee-sign text-white text-xs"></i>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[#1A1A2E]">₹{restaurant.deliveryFee}</span>
                          <span className="text-[8px] text-gray-500">Fee</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
              <i className="fas fa-inbox text-4xl text-gray-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No restaurants found</h3>
            <p className="text-gray-600 mb-6">Try adjusting your filters or explore other categories</p>
            <Link href="/order" className="inline-block bg-gradient-to-r from-[#16c2a5] to-[#0fa589] text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg transition-all">
              <i className="fas fa-arrow-left mr-2"></i>
              Back to Categories
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default RestaurantListPage
