'use client'

import React, { useState, useEffect } from 'react'
import { MXHeader } from '@/components/MXHeader'
import {
  fetchRestaurantByName,
  getRestaurantStats,
  subscribeToRestaurantData,
} from '@/lib/database'
import { Restaurant } from '@/lib/types'
import {
  MapPin,
  Clock,
  Phone,
  Mail,
  Star,
  Users,
  ShoppingCart,
  CheckCircle,
  AlertCircle,
  Edit2,
  Settings,
} from 'lucide-react'
import { Toaster } from 'sonner'

export const dynamic = 'force-dynamic'

export default function RestaurantManagementPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load restaurant on mount
  useEffect(() => {
    const loadRestaurant = async () => {
      setIsLoading(true)
      try {
        const restaurantData = await fetchRestaurantByName('hot chappathis')
        if (!restaurantData) {
          setError(
            'Hot Chappathis restaurant not found. Please check Supabase.'
          )
          setIsLoading(false)
          return
        }
        setRestaurant(restaurantData)
        setError(null)
      } catch (err) {
        console.error('Error loading restaurant:', err)
        setError('Failed to load restaurant data')
        setIsLoading(false)
      } finally {
        setIsLoading(false)
      }
    }

    loadRestaurant()
  }, [])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!restaurant?.restaurant_id) return

    const subscription = subscribeToRestaurantData(
      restaurant.restaurant_id,
      (updatedRestaurant) => {
        setRestaurant(updatedRestaurant)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [restaurant?.restaurant_id])

  if (isLoading) {
    return (
      <>
        <Toaster />
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          <MXHeader
            restaurantName="Loading..."
            restaurantId="---"
            unreadCount={0}
          />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-4 border-orange-400 border-t-transparent animate-spin mx-auto mb-4"></div>
              <p className="text-slate-400">Loading restaurant data...</p>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Toaster />
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Header */}
        <MXHeader
          restaurantName={restaurant?.restaurant_name || 'Restaurant'}
          restaurantId={restaurant?.restaurant_id || '---'}
          unreadCount={0}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Error Banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-red-400" />
                <p className="text-red-400 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Welcome Section */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              Restaurant Management
            </h1>
            <p className="text-slate-400">
              Manage and monitor {restaurant?.restaurant_name || 'your restaurant'}'s
              information
            </p>
          </div>

          {restaurant && (
            <>
              {/* Restaurant Header Card */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-750 rounded-xl border border-slate-700 p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                  {/* Restaurant Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
                        {restaurant.restaurant_name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">
                          {restaurant.restaurant_name}
                        </h2>
                        <p className="text-slate-400 text-sm">
                          ID: {restaurant.restaurant_id}
                        </p>
                        {restaurant.is_verified && (
                          <div className="flex items-center gap-2 mt-2">
                            <CheckCircle size={16} className="text-emerald-400" />
                            <span className="text-emerald-400 text-sm font-medium">
                              Verified Restaurant
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                      <Edit2 size={18} />
                      <span>Edit Info</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                      <Settings size={18} />
                      <span>Settings</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  icon={<Star size={24} className="text-yellow-400" />}
                  label="Average Rating"
                  value={`${restaurant.avg_rating || 0} ⭐`}
                  subtitle={`${restaurant.total_reviews || 0} reviews`}
                  color="bg-yellow-500/10"
                />
                <MetricCard
                  icon={<ShoppingCart size={24} className="text-blue-400" />}
                  label="Total Orders"
                  value={restaurant.total_orders || 0}
                  subtitle="All time"
                  color="bg-blue-500/10"
                />
                <MetricCard
                  icon={<Users size={24} className="text-purple-400" />}
                  label="Registered Customers"
                  value={restaurant.total_reviews || 0}
                  subtitle="Customer reviews"
                  color="bg-purple-500/10"
                />
                <MetricCard
                  icon={
                    restaurant.is_active ? (
                      <CheckCircle size={24} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={24} className="text-red-400" />
                    )
                  }
                  label="Status"
                  value={restaurant.is_active ? 'Active' : 'Inactive'}
                  subtitle={
                    restaurant.is_verified
                      ? 'Verified & Active'
                      : 'Pending Verification'
                  }
                  color={
                    restaurant.is_active
                      ? 'bg-emerald-500/10'
                      : 'bg-red-500/10'
                  }
                />
              </div>

              {/* Restaurant Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Contact Information */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Phone size={20} className="text-orange-400" />
                    Contact Information
                  </h3>
                  <div className="space-y-4">
                    <DetailRow
                      label="Owner Name"
                      value={restaurant.owner_name || 'N/A'}
                    />
                    <DetailRow
                      label="Owner Phone"
                      value={restaurant.owner_phone || 'N/A'}
                    />
                    <DetailRow
                      label="Owner Email"
                      value={restaurant.owner_email || 'N/A'}
                    />
                    <DetailRow
                      label="Restaurant Email"
                      value={restaurant.email || 'N/A'}
                    />
                    <DetailRow
                      label="Restaurant Phone"
                      value={restaurant.phone || 'N/A'}
                    />
                  </div>
                </div>

                {/* Location Information */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <MapPin size={20} className="text-orange-400" />
                    Location Details
                  </h3>
                  <div className="space-y-4">
                    <DetailRow
                      label="City"
                      value={restaurant.city || 'N/A'}
                    />
                    <DetailRow
                      label="State"
                      value={restaurant.state || 'N/A'}
                    />
                    <DetailRow
                      label="Pincode"
                      value={restaurant.pincode || 'N/A'}
                    />
                    <DetailRow
                      label="Cuisine Type"
                      value={restaurant.cuisine_type || 'N/A'}
                    />
                    {restaurant.address && (
                      <DetailRow
                        label="Full Address"
                        value={restaurant.address}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Business Hours & Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Operating Hours */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Clock size={20} className="text-orange-400" />
                    Operating Hours
                  </h3>
                  <div className="space-y-4">
                    <DetailRow
                      label="Opening Time"
                      value={restaurant.opening_time || 'N/A'}
                    />
                    <DetailRow
                      label="Closing Time"
                      value={restaurant.closing_time || 'N/A'}
                    />
                    <DetailRow
                      label="Delivery Time"
                      value={`${restaurant.delivery_time_minutes || 30} minutes`}
                    />
                    <DetailRow
                      label="Min Order Amount"
                      value={`₹${restaurant.min_order_amount || 0}`}
                    />
                  </div>
                </div>

                {/* Business Information */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Settings size={20} className="text-orange-400" />
                    Business Information
                  </h3>
                  <div className="space-y-4">
                    <DetailRow
                      label="GSTIN"
                      value={restaurant.gstin || 'Not Provided'}
                    />
                    <DetailRow
                      label="FSSAI License"
                      value={restaurant.fssai_license || 'Not Provided'}
                    />
                    <DetailRow
                      label="PAN Number"
                      value={restaurant.pan_number || 'Not Provided'}
                    />
                    <DetailRow
                      label="Registration Date"
                      value={
                        restaurant.created_at
                          ? new Date(
                              restaurant.created_at
                            ).toLocaleDateString()
                          : 'N/A'
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              {restaurant.description && (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    About Restaurant
                  </h3>
                  <p className="text-slate-300 leading-relaxed">
                    {restaurant.description}
                  </p>
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-700 bg-slate-900/50 mt-16 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-slate-400 text-sm">
              Last updated: {new Date().toLocaleTimeString()} • Realtime sync
              enabled
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

// Component: Metric Card
interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  subtitle?: string
  color: string
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  subtitle,
  color,
}) => (
  <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-all duration-200">
    <div className={`inline-flex items-center justify-center h-12 w-12 rounded-lg ${color} mb-4`}>
      {icon}
    </div>
    <p className="text-slate-400 text-sm font-medium mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
    {subtitle && <p className="text-slate-500 text-xs mt-2">{subtitle}</p>}
  </div>
)

// Component: Detail Row
interface DetailRowProps {
  label: string
  value: string
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 border-b border-slate-700/50 last:border-0">
    <span className="text-slate-400 text-sm font-medium">{label}</span>
    <span className="text-white font-semibold mt-1 sm:mt-0">{value}</span>
  </div>
)
