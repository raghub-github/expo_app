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
    // For stores open across midnight
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
  const [phone, setPhone] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [showTempOffModal, setShowTempOffModal] = useState(false)
  const [tempOffDurationMins, setTempOffDurationMins] = useState(30)
  const [tempClosedUntil, setTempClosedUntil] = useState<Date | null>(null)
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false)
  const [minutesRemaining, setMinutesRemaining] = useState(0)

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

  // Auto-reopen store and update timer effect
  useEffect(() => {
    if (!tempClosedUntil || isStoreOpen) return

    const interval = setInterval(() => {
      const remaining = getMinutesRemaining(tempClosedUntil)
      setMinutesRemaining(remaining)
      
      if (remaining <= 0) {
        setIsStoreOpen(true)
        setTempClosedUntil(null)
        toast.success('🟢 Store automatically reopened!')
        clearInterval(interval)
      }
    }, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [tempClosedUntil, isStoreOpen])

  const handleSaveSettings = async () => {
    if (!phone || !latitude || !longitude) {
      toast.error('⚠️ Please fill in all required fields')
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

  const handleDeliveryModeChange = (mode: 'MX_SELF' | 'GATIMITRA') => {
    if (deliveryMode === mode) return
    
    setDeliveryMode(mode)
    const modeName = mode === 'MX_SELF' ? 'MX Self Delivery' : 'GatiMitra Delivery'
    toast.success(`✅ Delivery mode set to ${modeName}`)
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

            {/* Store Status Section - IMPROVED */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-emerald-50">
                  {/* Icon removed: Toggle2 does not exist in lucide-react */}
                </div>
                <h3 className="text-lg font-bold text-gray-900">Store Status</h3>
              </div>

              {/* Main Status Card */}
              <div className={`rounded-lg border-2 p-6 transition-all ${
                isStoreOpen
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-25'
                  : 'border-red-200 bg-gradient-to-br from-red-50 to-orange-25'
              }`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${isStoreOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                      <p className={`text-2xl font-bold ${isStoreOpen ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isStoreOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                      </p>
                    </div>
                    {tempClosedUntil && !isStoreOpen && (
                      <p className="text-sm font-medium text-red-600 flex items-center gap-1 mb-2">
                        <Timer size={14} />
                        Reopens in {minutesRemaining} minutes
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => {
                      if (!isStoreOpen) {
                        setShowTempOffModal(false)
                        setIsStoreOpen(true)
                        setTempClosedUntil(null)
                        toast.success('🟢 Store reopened!')
                      } else {
                        setShowTempOffModal(true)
                      }
                    }}
                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                      isStoreOpen
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {isStoreOpen ? 'Close Store' : 'Reopen Now'}
                  </button>
                </div>

                {/* Store Timing Card */}
                <div className="bg-white rounded-lg p-4 border border-gray-100 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-blue-600" />
                    <p className="font-semibold text-gray-900 text-sm">Store Timing Today</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Opens At</p>
                      <p className="text-lg font-bold text-gray-900">{openingTime}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Closes At</p>
                      <p className="text-lg font-bold text-gray-900">{closingTime}</p>
                    </div>
                  </div>
                  {isWithinOperatingHours(openingTime, closingTime) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        Store closes in: <span className="font-bold text-orange-600">{getTimeUntilClosing(closingTime)} mins</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Temporary Close Section */}
                {showTempOffModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-in">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">Temporarily Close Store</h4>
                        <button
                          onClick={() => setShowTempOffModal(false)}
                          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X size={20} className="text-gray-600" />
                        </button>
                      </div>

                      <p className="text-sm text-gray-600 mb-4">
                        Select how long you want to close the store. It will automatically reopen after the selected time.
                      </p>

                      <div className="space-y-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Close for (minutes)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="5"
                              max="1440"
                              value={tempOffDurationMins}
                              onChange={(e) => setTempOffDurationMins(Math.max(5, parseInt(e.target.value) || 5))}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                            />
                            <span className="text-sm font-medium text-gray-600">mins</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            Will reopen at: <span className="font-bold text-gray-900">
                              {new Date(Date.now() + tempOffDurationMins * 60000).toLocaleTimeString('en-US', { 
                                hour: '2-digit', 
                                minute: '2-digit',
                                hour12: true 
                              })}
                            </span>
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex gap-2">
                          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700">
                            Your store will automatically reopen after {tempOffDurationMins} minutes
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            if (tempOffDurationMins <= 0) {
                              toast.error('⚠️ Please enter a valid duration (minimum 5 minutes)')
                              return
                            }
                            const closeUntil = new Date(Date.now() + tempOffDurationMins * 60000)
                            setTempClosedUntil(closeUntil)
                            setMinutesRemaining(tempOffDurationMins)
                            setIsStoreOpen(false)
                            toast.success(`⏱️ Store closed for ${tempOffDurationMins} minutes`)
                            setShowTempOffModal(false)
                          }}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                        >
                          Close Store
                        </button>
                        <button
                          onClick={() => setShowTempOffModal(false)}
                          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-close Checkbox */}
              <label className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 accent-orange-600 cursor-pointer" 
                  checked={autoCloseEnabled}
                  onChange={(e) => setAutoCloseEnabled(e.target.checked)}
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">Auto-close at closing time</p>
                  <p className="text-xs text-gray-600">Store will automatically close at {closingTime}</p>
                </div>
              </label>
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
                  {/* Icon removed: Toggle2 does not exist in lucide-react */}
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
                        🚗 MX Self Delivery
                      </p>
                      <p className="text-xs text-gray-600">Your own riders deliver orders</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      deliveryMode === 'MX_SELF' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                    }`}>
                      {deliveryMode === 'MX_SELF' && <CheckCircle2 size={14} className="text-white" />}
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
                        🚚 GatiMitra Delivery
                      </p>
                      <p className="text-xs text-gray-600">Partner handles all deliveries</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      deliveryMode === 'GATIMITRA' ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {deliveryMode === 'GATIMITRA' && <CheckCircle2 size={14} className="text-white" />}
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
          </div>
        </div>
      </MXLayoutWhite>
    </>
  )
}

export default function StoreSettingsPage() {
  return <StoreSettingsContent />
}
