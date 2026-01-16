'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChefHat, ArrowLeft, MapPin, Clock, Phone, Mail, Star, DollarSign, CheckCircle, AlertCircle, Loader, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { fetchRestaurantById } from '@/lib/database'
import { Restaurant } from '@/lib/types'

export default function StorePage() {
  const router = useRouter()
  const params = useParams()
  const restaurantId = params.id as string

  const [store, setStore] = useState<Restaurant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStore = async () => {
      try {
        setIsLoading(true)
        const data = await fetchRestaurantById(restaurantId)
        if (data) {
          setStore(data)
        } else {
          setError('Store not found')
          toast.error('Store not found')
        }
      } catch (err) {
        console.error('Error loading store:', err)
        setError('Failed to load store details')
        toast.error('Error loading store details')
      } finally {
        setIsLoading(false)
      }
    }

    if (restaurantId) {
      loadStore()
    }
  }, [restaurantId])

  const handleLogin = () => {
    // Store the restaurant ID in localStorage or session
    localStorage.setItem('selectedRestaurantId', restaurantId)
    // Redirect to MX dashboard
    router.push('/mx/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">Store Details</h1>
        </div>
        <div className="w-20"></div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="ml-3 text-slate-600">Loading store details...</span>
          </div>
        ) : store ? (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-slate-900">
                      {store.restaurant_name}
                    </h1>
                    {store.is_verified && (
                      <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-slate-600 mb-4">{store.description}</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                      {store.cuisine_type}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      store.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {store.is_active ? '🟢 Active' : '⚫ Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Store ID</p>
                  <p className="text-lg font-bold text-slate-900 font-mono">{store.restaurant_id}</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Rating</p>
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                    <p className="text-lg font-bold text-slate-900">
                      {store.avg_rating.toFixed(1)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600">({store.total_reviews} reviews)</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Total Orders</p>
                  <p className="text-lg font-bold text-slate-900">{store.total_orders}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Min Order</p>
                  <p className="text-lg font-bold text-slate-900">₹{store.min_order_amount}</p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Mail className="w-6 h-6 text-blue-600" />
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Owner Name</p>
                  <p className="text-lg font-semibold text-slate-900">{store.owner_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Store Email</p>
                  <a href={`mailto:${store.email}`} className="text-lg font-semibold text-blue-600 hover:underline">
                    {store.email}
                  </a>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Store Phone</p>
                  <a href={`tel:${store.phone}`} className="text-lg font-semibold text-blue-600 hover:underline flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    {store.phone}
                  </a>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-blue-600" />
                Location
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Full Address</p>
                  <p className="text-lg font-semibold text-slate-900">{store.address}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">City</p>
                    <p className="font-semibold text-slate-900">{store.city}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">State</p>
                    <p className="font-semibold text-slate-900">{store.state}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Postal Code</p>
                    <p className="font-semibold text-slate-900">{store.pincode}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Operating Hours */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Clock className="w-6 h-6 text-blue-600" />
                Operating Hours
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Opening Time</p>
                  <p className="text-2xl font-bold text-slate-900">{store.opening_time}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Closing Time</p>
                  <p className="text-2xl font-bold text-slate-900">{store.closing_time}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Avg Delivery Time</p>
                  <p className="text-2xl font-bold text-slate-900">{store.delivery_time_minutes} min</p>
                </div>
              </div>
            </div>

            {/* Business Information */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-blue-600" />
                Business Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {store.gstin && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">GST Number</p>
                    <p className="font-semibold text-slate-900 font-mono">{store.gstin}</p>
                  </div>
                )}
                {store.fssai_license && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">FSSAI License</p>
                    <p className="font-semibold text-slate-900 font-mono">{store.fssai_license}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={handleLogin}
                className="flex-1 px-6 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold text-white transition-all flex items-center justify-center gap-2 text-lg"
              >
                <LogIn className="w-5 h-5" />
                Login to Store
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
