'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChefHat, ArrowLeft, MapPin, Clock, Phone, Mail, Star, DollarSign, CheckCircle, AlertCircle, Loader, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { fetchRestaurantById } from '@/lib/database'

/** Map DB store (store_id, store_name, full_address, etc.) to display shape with safe defaults */
function mapStoreToDisplay(raw: any) {
  if (!raw) return null
  const phones = raw.store_phones ?? (raw.phone ? [raw.phone] : [])
  const phone = Array.isArray(phones) ? phones[0] : phones
  return {
    restaurant_id: raw.store_id ?? raw.restaurant_id ?? '—',
    restaurant_name: raw.store_name ?? raw.restaurant_name ?? raw.store_id ?? 'Store',
    description: raw.store_description ?? raw.description ?? '',
    owner_name: raw.owner_name ?? raw.store_name ?? '—',
    email: raw.store_email ?? raw.email ?? '',
    phone: phone ?? '',
    address: raw.full_address ?? raw.address ?? '—',
    city: raw.city ?? '—',
    state: raw.state ?? '—',
    pincode: raw.postal_code ?? raw.pincode ?? '—',
    cuisine_type: Array.isArray(raw.cuisine_types) ? raw.cuisine_types.join(', ') : (raw.cuisine_type ?? raw.store_type ?? '—'),
    is_active: raw.is_active ?? true,
    is_verified: raw.approval_status === 'APPROVED',
    avg_rating: typeof raw.avg_rating === 'number' ? raw.avg_rating : 0,
    total_reviews: typeof raw.total_reviews === 'number' ? raw.total_reviews : 0,
    total_orders: typeof raw.total_orders === 'number' ? raw.total_orders : 0,
    min_order_amount: typeof raw.min_order_amount === 'number' ? raw.min_order_amount : 0,
    opening_time: raw.opening_time ?? '—',
    closing_time: raw.closing_time ?? '—',
    delivery_time_minutes: typeof raw.avg_preparation_time_minutes === 'number' ? raw.avg_preparation_time_minutes : 30,
    gstin: raw.gst_number ?? raw.gstin,
    fssai_license: raw.fssai_number ?? raw.fssai_license,
  }
}

export default function StorePage() {
  const router = useRouter()
  const params = useParams()
  const restaurantId = params?.id as string

  const [rawStore, setRawStore] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const store = useMemo(() => mapStoreToDisplay(rawStore), [rawStore])

  useEffect(() => {
    const loadStore = async () => {
      try {
        setIsLoading(true)
        setError('')
        const data = await fetchRestaurantById(restaurantId)
        if (data) {
          setRawStore(data)
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
      {/* Header - responsive */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 sm:gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm sm:text-base"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          <span className="font-medium">Back</span>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
          <h1 className="text-base sm:text-xl font-bold text-slate-900 truncate">Store Details</h1>
        </div>
        <div className="w-14 sm:w-20 shrink-0" />
      </div>

      {/* Main Content - responsive padding and max-width */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-start gap-3 mb-4 sm:mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col sm:flex-row items-center justify-center py-16 sm:py-20 gap-3">
            <Loader className="w-8 h-8 text-blue-600 animate-spin shrink-0" />
            <span className="text-slate-600 text-sm sm:text-base">Loading store details...</span>
          </div>
        ) : store ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Header Card */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4 sm:mb-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 truncate">
                      {store.restaurant_name}
                    </h1>
                    {store.is_verified && (
                      <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                  {store.description ? (
                    <p className="text-slate-600 text-sm sm:text-base mb-3 sm:mb-4 line-clamp-3">{store.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 sm:gap-4">
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs sm:text-sm font-semibold">
                      {store.cuisine_type}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold ${
                      store.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {store.is_active ? '🟢 Active' : '⚫ Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Stats - responsive grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Store ID</p>
                  <p className="text-sm sm:text-lg font-bold text-slate-900 font-mono break-all">{store.restaurant_id}</p>
                </div>
                <div className="p-3 sm:p-4 bg-yellow-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Rating</p>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 fill-yellow-500 shrink-0" />
                    <p className="text-sm sm:text-lg font-bold text-slate-900">{(store.avg_rating ?? 0).toFixed(1)}</p>
                  </div>
                  <p className="text-xs text-slate-600">({store.total_reviews ?? 0} reviews)</p>
                </div>
                <div className="p-3 sm:p-4 bg-purple-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Total Orders</p>
                  <p className="text-sm sm:text-lg font-bold text-slate-900">{store.total_orders ?? 0}</p>
                </div>
                <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Min Order</p>
                  <p className="text-sm sm:text-lg font-bold text-slate-900">₹{store.min_order_amount ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-sm">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                Contact Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Owner Name</p>
                  <p className="text-base sm:text-lg font-semibold text-slate-900">{store.owner_name}</p>
                </div>
                {store.email ? (
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">Store Email</p>
                    <a href={`mailto:${store.email}`} className="text-base sm:text-lg font-semibold text-blue-600 hover:underline break-all">
                      {store.email}
                    </a>
                  </div>
                ) : null}
                {store.phone ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">Store Phone</p>
                    <a href={`tel:${store.phone}`} className="text-base sm:text-lg font-semibold text-blue-600 hover:underline flex items-center gap-2">
                      <Phone className="w-5 h-5 shrink-0" />
                      {store.phone}
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Location */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-sm">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                Location
              </h2>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Full Address</p>
                  <p className="text-sm sm:text-lg font-semibold text-slate-900">{store.address}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">City</p>
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">{store.city}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">State</p>
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">{store.state}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">Postal Code</p>
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">{store.pincode}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Operating Hours */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-sm">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                Operating Hours
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Opening Time</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900">{store.opening_time}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Closing Time</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900">{store.closing_time}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-1">Avg Delivery Time</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900">{store.delivery_time_minutes} min</p>
                </div>
              </div>
            </div>

            {/* Business Information - only if we have data */}
            {(store.gstin || store.fssai_license) ? (
              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-sm">
                <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                  Business Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {store.gstin ? (
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">GST Number</p>
                      <p className="font-semibold text-slate-900 font-mono text-sm sm:text-base break-all">{store.gstin}</p>
                    </div>
                  ) : null}
                  {store.fssai_license ? (
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">FSSAI License</p>
                      <p className="font-semibold text-slate-900 font-mono text-sm sm:text-base break-all">{store.fssai_license}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Action Buttons - responsive */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
              <button
                onClick={handleLogin}
                className="w-full sm:flex-1 px-4 sm:px-6 py-3 sm:py-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold text-white transition-all flex items-center justify-center gap-2 text-base sm:text-lg"
              >
                <LogIn className="w-5 h-5 shrink-0" />
                Login to Store
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
