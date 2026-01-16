'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import { Clock, Phone, Save, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Toaster, toast } from 'sonner'

export const dynamic = 'force-dynamic'

function StoreSettingsContent() {
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [tempOffDuration, setTempOffDuration] = useState<number | null>(null)
  const [showTempOffModal, setShowTempOffModal] = useState(false)
  const [tempOffDurationInput, setTempOffDurationInput] = useState('30')
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false)
  const [phone, setPhone] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null
      if (!id) id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null
      if (!id) id = DEMO_STORE_ID
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

  const handleStoreToggle = () => {
    if (isStoreOpen) {
      setShowTempOffModal(true)
    } else {
      setIsStoreOpen(true)
      setTempOffDuration(null)
      toast.success('🟢 Store is now OPEN')
    }
  }

  const handleTempOff = () => {
    const duration = parseInt(tempOffDurationInput)
    if (duration <= 0) {
      toast.error('⚠️ Please enter a valid duration')
      return
    }
    setIsStoreOpen(false)
    setTempOffDuration(duration)
    toast.success(`⏱️ Store closed temporarily for ${duration} minutes`)
    setShowTempOffModal(false)
    setTempOffDurationInput('30')
  }

  const handleMXDeliveryToggle = () => {
    const newValue = !mxDeliveryEnabled
    setMxDeliveryEnabled(newValue)
    if (newValue) {
      toast.success('✅ MX Self Delivery enabled - GatiMitra delivery disabled')
    } else {
      toast.success('✅ GatiMitra Delivery will handle all deliveries')
    }
  }

  const handleSaveSettings = async () => {
    if (!phone || !latitude || !longitude) {
      toast.error('⚠️ Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
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
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || DEMO_STORE_ID}>
        <div className="min-h-screen bg-white px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-gray-900">Store Settings</h1>
              <p className="text-sm text-gray-600">Manage your store and delivery configuration</p>
            </div>

            {/* Store Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Store Status</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-gray-50 to-white border border-gray-200">
                  <div>
                    <p className="font-semibold text-gray-900">Store Status</p>
                    <p className="text-sm text-gray-600">Enable or disable store for customers</p>
                  </div>
                  <button
                    onClick={handleStoreToggle}
                    className={`px-5 py-2.5 rounded-lg font-semibold transition-all ${
                      isStoreOpen
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-sm'
                        : 'bg-red-100 text-red-700 hover:bg-red-200 shadow-sm'
                    }`}
                  >
                    {isStoreOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                  </button>
                </div>

                {!isStoreOpen && tempOffDuration && (
                  <div className="p-4 rounded-lg bg-orange-50 border border-orange-200 flex items-start gap-3">
                    <AlertCircle size={18} className="text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-orange-700">⏱️ Temporarily Closed</p>
                      <p className="text-orange-600">Will reopen in {tempOffDuration} minutes</p>
                    </div>
                  </div>
                )}

                {/* Auto-close */}
                <label className="flex items-center gap-3 p-4 rounded-lg bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={autoCloseEnabled}
                    onChange={(e) => setAutoCloseEnabled(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Auto-close Store Daily</p>
                    <p className="text-sm text-gray-600">Automatically close at closing time</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Operating Hours */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Clock size={18} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Operating Hours</h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Opening Time</label>
                    <input
                      type="time"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Closing Time</label>
                    <input
                      type="time"
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Store Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-purple-50">
                  <Phone size={18} className="text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Store Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="10-digit number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Address</label>
                  <div className="px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
                    {store?.city || 'Not set'}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Read-only - set during registration</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Latitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="28.6139"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Longitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="77.2090"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Management */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-orange-50">
                  {/* Icon removed: Toggle2 does not exist in lucide-react */}
                </div>
                <h3 className="text-lg font-bold text-gray-900">Delivery Management</h3>
              </div>

              <p className="text-sm text-gray-600 mb-4 font-medium">Enable MX Self Delivery or use GatiMitra (mutually exclusive)</p>

              <div className="space-y-3">
                {/* MX Self Delivery Toggle */}
                <div className="p-4 rounded-lg border-2 border-gray-200 hover:border-orange-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">📦 MX Self Delivery</p>
                      <p className="text-sm text-gray-600">Use own riders for delivery</p>
                    </div>
                    <button
                      onClick={handleMXDeliveryToggle}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                        mxDeliveryEnabled ? 'bg-orange-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          mxDeliveryEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* GatiMitra Delivery (Default) */}
                <div className="p-4 rounded-lg border-2 border-purple-300 bg-purple-50 hover:border-purple-400 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">🚴 GatiMitra Delivery</p>
                      <p className="text-sm text-gray-600">Partner with external delivery service</p>
                      <p className="text-xs text-purple-600 font-semibold mt-1">Default - Enabled when MX is off</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-semibold">
                      {mxDeliveryEnabled ? 'Off' : 'On'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <p className="font-semibold">Smart Delivery Logic:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>When MX Delivery is ON → Uses your riders, GatiMitra is OFF</li>
                    <li>When MX Delivery is OFF → GatiMitra automatically handles deliveries</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 sticky bottom-4 bg-white rounded-lg border border-gray-200 p-4 shadow-lg">
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Temp Off Modal */}
        {showTempOffModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-sm w-full">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Close Store Temporarily</h2>
                <button onClick={() => setShowTempOffModal(false)} className="text-gray-500 hover:text-gray-900">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">For how many minutes do you want to close the store?</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={tempOffDurationInput}
                    onChange={(e) => setTempOffDurationInput(e.target.value)}
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default: 30 minutes</p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleTempOff}
                    className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold transition-colors"
                  >
                    ✓ Close for {parseInt(tempOffDurationInput) || 30} Minutes
                  </button>
                  <button
                    onClick={() => setShowTempOffModal(false)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>
    </>
  )
}

export default function StoreSettingsPage() {
  return <StoreSettingsContent />
}
