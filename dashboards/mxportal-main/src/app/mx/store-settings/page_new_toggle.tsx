'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import {
  Clock,
  MapPin,
  Phone,
  ToggleRight,
  Save,
  AlertCircle,
  CheckCircle2,
  X,
  Timer
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

export const dynamic = 'force-dynamic'

// Helper function to check if store is within operating hours
const isWithinOperatingHours = (openTime: string, closeTime: string): boolean => {
  const now = new Date()
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
  
  if (openTime < closeTime) {
    return currentTime >= openTime && currentTime < closeTime
  } else {
    return currentTime >= openTime || currentTime < closeTime
  }
}

// Helper function to get minutes remaining
const getMinutesRemaining = (until: Date): number => {
  const now = new Date()
  const diffMs = until.getTime() - now.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60)))
}

// Helper function to get time until closing
const getTimeUntilClosing = (closeTime: string): number => {
  const now = new Date()
  const [hours, mins] = closeTime.split(':').map(Number)
  const closeDate = new Date()
  closeDate.setHours(hours, mins, 0, 0)
  
  if (closeDate < now) {
    closeDate.setDate(closeDate.getDate() + 1)
  }
  
  const diffMs = closeDate.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

function StoreSettingsContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [deliveryMode, setDeliveryMode] = useState<'MX_SELF' | 'GATIMITRA'>('MX_SELF')
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  const [autoCloseTime, setAutoCloseTime] = useState('23:00')
  const [phone, setPhone] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  
  // Store toggle modal states
  const [showStoreToggleModal, setShowStoreToggleModal] = useState(false)
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | null>(null)
  const [closureTime, setClosureTime] = useState<string>('12:00')
  const [tempClosedUntil, setTempClosedUntil] = useState<Date | null>(null)

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null

      if (!id) {
        id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      }

      if (!id) {
        id = DEMO_STORE_ID
      }

      setStoreId(id)
    }

    getStoreId()
  }, [searchParams])

  // Load store data
  useEffect(() => {
    if (!storeId) return

    const loadStore = async () => {
      setIsLoading(true)
      try {
        let storeData = await fetchStoreById(storeId)

        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchStoreByName(storeId)
        }

        if (storeData) {
          setStore(storeData)
          setIsStoreOpen(true)
          setPhone(storeData.am_mobile || '')
          setLatitude('')
          setLongitude('')
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStore()
  }, [storeId])

  // Auto-reopen store effect
  useEffect(() => {
    if (!tempClosedUntil || isStoreOpen) return

    const interval = setInterval(() => {
      const remaining = getMinutesRemaining(tempClosedUntil)
      
      if (remaining <= 0) {
        setIsStoreOpen(true)
        setTempClosedUntil(null)
        toast.success('🟢 Store automatically reopened!')
        clearInterval(interval)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [tempClosedUntil, isStoreOpen])

  const handleStoreToggle = () => {
    if (isStoreOpen) {
      // If trying to close, show modal
      setShowStoreToggleModal(true)
      setToggleClosureType(null)
      setClosureTime('12:00')
    } else {
      // If trying to open, open directly
      setIsStoreOpen(true)
      setTempClosedUntil(null)
      setToggleClosureType(null)
      toast.success('🟢 Store is now OPEN. Ready to receive orders!')
    }
  }

  const handleConfirmClosure = () => {
    if (!toggleClosureType) {
      toast.error('❌ Please select closure type')
      return
    }

    if (toggleClosureType === 'temporary' && !closureTime) {
      toast.error('❌ Please select a time')
      return
    }

    let closedUntilDate: Date

    if (toggleClosureType === 'temporary') {
      // Parse the time and create a date for today
      const [hours, mins] = closureTime.split(':').map(Number)
      closedUntilDate = new Date()
      closedUntilDate.setHours(hours, mins, 0, 0)

      // If the time is in the past, set it for tomorrow
      if (closedUntilDate < new Date()) {
        closedUntilDate.setDate(closedUntilDate.getDate() + 1)
      }

      const minutesRemaining = getMinutesRemaining(closedUntilDate)
      const hoursRemaining = Math.floor(minutesRemaining / 60)
      const minsRemaining = minutesRemaining % 60

      toast.success(
        `⏱️ Store closed temporarily until ${closureTime} (${hoursRemaining}h ${minsRemaining}m remaining)`
      )
    } else {
      // For today - close until next opening time
      closedUntilDate = new Date()
      const [hours, mins] = openingTime.split(':').map(Number)
      closedUntilDate.setHours(hours, mins, 0, 0)
      closedUntilDate.setDate(closedUntilDate.getDate() + 1) // Next day

      toast.success(
        `📅 Store closed for today. Will reopen tomorrow at ${openingTime}`
      )
    }

    setIsStoreOpen(false)
    setTempClosedUntil(closedUntilDate)
    setShowStoreToggleModal(false)
  }

  const handleCancelClosure = () => {
    setShowStoreToggleModal(false)
    setToggleClosureType(null)
    setClosureTime('12:00')
  }

  const handleDeliveryModeChange = (mode: 'MX_SELF' | 'GATIMITRA') => {
    if (deliveryMode === mode) return
    
    setDeliveryMode(mode)
    const modeName = mode === 'MX_SELF' ? 'MX Self Delivery' : 'GatiMitra Delivery'
    toast.success(`✅ Delivery mode set to ${modeName}`)
  }

  const handleSaveSettings = async () => {
    if (!phone || !latitude || !longitude) {
      toast.error('❌ Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))
      
      toast.success('✅ Settings saved successfully!')
    } catch (error) {
      toast.error('❌ Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Loading settings...</div>
        </div>
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster />
      <MXLayoutWhite
        restaurantName={store?.store_name || 'Settings'}
        restaurantId={storeId || DEMO_STORE_ID}
      >
        <div className="min-h-screen bg-white px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-gray-900">Store Settings</h1>
              <p className="text-sm text-gray-600">Configure your store details and delivery modes</p>
            </div>

            {/* Store Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <ToggleRight size={18} className="text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Store Status</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Store Operation</p>
                    <p className="text-sm text-gray-600">Enable or disable store for customers</p>
                    {tempClosedUntil && !isStoreOpen && (
                      <p className="text-xs text-orange-600 mt-2 font-semibold">
                        ⏱️ Closed until {tempClosedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleStoreToggle}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      isStoreOpen
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {isStoreOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                  </button>
                </div>

                {/* Auto-close Checkbox */}
                <label className="flex items-center gap-3 p-4 rounded-lg bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" className="w-4 h-4" defaultChecked={false} />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">Auto-close at specific time</p>
                    <p className="text-xs text-gray-600">Automatically close store at selected time</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Operating Hours Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Clock size={18} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Operating Hours</h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Opening Time</label>
                    <input
                      type="time"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Closing Time</label>
                    <input
                      type="time"
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Auto-close Time (Optional)</label>
                  <input
                    type="time"
                    value={autoCloseTime}
                    onChange={(e) => setAutoCloseTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                  <p className="text-xs text-gray-600 mt-1">Store will automatically close at this time if enabled</p>
                </div>
              </div>
            </div>

            {/* Store Information Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-purple-50">
                  <Phone size={18} className="text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Store Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit phone number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Address</label>
                  <input
                    type="text"
                    value={store?.city || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                  />
                  <p className="text-xs text-gray-600 mt-1">Read-only - set during registration</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Latitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="e.g., 28.6139"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Longitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="e.g., 77.2090"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Mode Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-orange-50">
                  <ToggleRight size={18} className="text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Delivery Mode</h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">Select your primary delivery method (mutually exclusive)</p>

              <div className="space-y-3">
                {/* MX Self Delivery */}
                <button
                  onClick={() => handleDeliveryModeChange('MX_SELF')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    deliveryMode === 'MX_SELF'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold ${deliveryMode === 'MX_SELF' ? 'text-orange-700' : 'text-gray-900'}`}>
                        🚶 MX Self Delivery
                      </p>
                      <p className="text-xs text-gray-600">Customers pick up orders from store</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      deliveryMode === 'MX_SELF' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                    }`}>
                      {deliveryMode === 'MX_SELF' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                </button>

                {/* GatiMitra Delivery */}
                <button
                  onClick={() => handleDeliveryModeChange('GATIMITRA')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    deliveryMode === 'GATIMITRA'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold ${deliveryMode === 'GATIMITRA' ? 'text-purple-700' : 'text-gray-900'}`}>
                        🚗 GatiMitra Delivery
                      </p>
                      <p className="text-xs text-gray-600">Auto-assign delivery partners</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      deliveryMode === 'GATIMITRA' ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {deliveryMode === 'GATIMITRA' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <p className="font-semibold">Only one delivery mode can be active</p>
                  <p>Switching modes will automatically disable the previous one</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 sticky bottom-4 bg-white rounded-lg border border-gray-200 p-4 shadow-md">
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                disabled={isSaving}
                className="px-6 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {/* Store Closure Modal */}
            {showStoreToggleModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">Close Store</h2>
                    <button
                      onClick={handleCancelClosure}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X size={20} className="text-gray-600" />
                    </button>
                  </div>

                  <p className="text-sm text-gray-600 mb-6">
                    How would you like to close your store?
                  </p>

                  {/* Temporary Option */}
                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => {
                        setToggleClosureType('temporary')
                      }}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                        toggleClosureType === 'temporary'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-orange-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            toggleClosureType === 'temporary'
                              ? 'border-orange-500 bg-orange-500'
                              : 'border-gray-300'
                          }`}
                        >
                          {toggleClosureType === 'temporary' && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <div>
                          <p className={`font-semibold ${
                            toggleClosureType === 'temporary' ? 'text-orange-700' : 'text-gray-900'
                          }`}>
                            ⏱️ Temporary Closure
                          </p>
                          <p className="text-xs text-gray-600">Close until a specific time today</p>
                        </div>
                      </div>
                    </button>

                    {/* Time Picker - shows when Temporary is selected */}
                    {toggleClosureType === 'temporary' && (
                      <div className="ml-8 p-4 rounded-lg bg-orange-50 border border-orange-200">
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Close until (time):
                        </label>
                        <input
                          type="time"
                          value={closureTime}
                          onChange={(e) => setClosureTime(e.target.value)}
                          className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-600 mt-2">
                          Store will remain closed until this time, then automatically reopen
                        </p>
                      </div>
                    )}
                  </div>

                  {/* For Today Option */}
                  <div className="mb-6">
                    <button
                      onClick={() => {
                        setToggleClosureType('today')
                      }}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                        toggleClosureType === 'today'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 bg-white hover:border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            toggleClosureType === 'today'
                              ? 'border-red-500 bg-red-500'
                              : 'border-gray-300'
                          }`}
                        >
                          {toggleClosureType === 'today' && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <div>
                          <p className={`font-semibold ${
                            toggleClosureType === 'today' ? 'text-red-700' : 'text-gray-900'
                          }`}>
                            📅 Close for Today
                          </p>
                          <p className="text-xs text-gray-600">
                            Closed until tomorrow at {openingTime}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Info Box */}
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 mb-6">
                    <p className="text-xs text-blue-700">
                      <strong>💡 Tip:</strong> You can reopen the store anytime by clicking the toggle again, even during a temporary closure.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancelClosure}
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmClosure}
                      disabled={!toggleClosureType}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-white font-medium transition-colors ${
                        toggleClosureType
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                    >
                      Confirm Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </MXLayoutWhite>
    </>
  )
}

export default function StoreSettingsPage() {
  return <StoreSettingsContent />
}
