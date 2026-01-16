'use client'

import React, { useState, useEffect } from 'react'
import { Dialog } from '@headlessui/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MXLayoutWhite } from '@/components/MXLayoutWhite'
import { fetchRestaurantById as fetchStoreById, fetchRestaurantByName as fetchStoreByName } from '@/lib/database'
import { MerchantStore } from '@/lib/merchantStore'
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants'
import {
  Power,
  Truck,
  Clock,
  AlertCircle,
  BarChart3,
  Package,
  TrendingUp,
  Users
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { Suspense } from 'react'


import { useSession } from 'next-auth/react';
import Image from 'next/image';

export const dynamic = 'force-dynamic'

// Helper Component: Stat Card
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: 'orange' | 'blue' | 'emerald' | 'purple'
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    orange: 'bg-orange-500/10 border-orange-200',
    blue: 'bg-blue-500/10 border-blue-200',
    emerald: 'bg-emerald-500/10 border-emerald-200',
    purple: 'bg-purple-500/10 border-purple-200'
  }

  const textColors = {
    orange: 'text-orange-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700'
  }

  return (
    <div className={`backdrop-blur-sm bg-white/30 rounded-xl border ${colorClasses[color]} p-5 shadow-sm hover:shadow-md transition-all hover:scale-[1.02]`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-600 font-medium mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${textColors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter()
  const searchParams = useSearchParams()
  const [store, setStore] = useState<MerchantStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  
  // Store Status & Delivery Mode
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('23:00')
  
  // Store toggle dropdown & modal states
  const [showToggleDropdown, setShowToggleDropdown] = useState(false)
  const [toggleClosureType, setToggleClosureType] = useState<'temporary' | 'today' | null>(null)
  const [closureTime, setClosureTime] = useState<string>('12:00')
  const [tempClosedUntil, setTempClosedUntil] = useState<Date | null>(null)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: '', reason: '' })
  
  const [pendingOrders, setPendingOrders] = useState(5)
  const [preparingOrders, setPreparingOrders] = useState(2)
  const [deliveredToday, setDeliveredToday] = useState(45)
  const [revenueToday, setRevenueToday] = useState(45200)

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

        if (storeData && (storeData as any).notFound) {
          setStore(null)
          toast.error('Your store is not in our database. Please check your registration or contact support.')
          setIsLoading(false)
          return
        }

        if (!storeData && !storeId.match(/^GMM\d{4}$/)) {
          storeData = await fetchStoreByName(storeId)
        }

        if (storeData) {
          setStore(storeData)
          // Modal logic: if not APPROVED, show modal
          if (storeData.approval_status !== 'APPROVED') {
            setModalStatus({ status: storeData.approval_status, reason: storeData.approval_reason })
            setShowStatusModal(true)
          }
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStore()
  }, [storeId])
  
  // Status Modal Component
  const StatusModal = () => {
    if (!showStatusModal) return null
    
    // Determine color based on status
    const getStatusColor = () => {
      switch(modalStatus.status) {
        case 'SUBMITTED': return 'text-blue-600'
        case 'UNDER_VERIFICATION': return 'text-yellow-600'
        case 'REJECTED': return 'text-red-600'
        case 'ERROR': return 'text-red-600'
        default: return 'text-gray-700'
      }
    }
    
    return (
      <Dialog 
        open={showStatusModal} 
        onClose={() => {}} 
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white/95 backdrop-blur-md p-8 shadow-2xl border border-gray-200">
            {/* Store Status Title with Color */}
            <Dialog.Title className={`text-2xl font-bold mb-4 ${getStatusColor()}`}>
              Store Status
            </Dialog.Title>
            
            <div className="mb-6">
              {modalStatus.status === 'SUBMITTED' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-blue-700">📋 Submission Received</span>
                  <p className="text-sm text-gray-600">Your store is submitted and under review. We'll notify you once verified.</p>
                </div>
              )}
              {modalStatus.status === 'UNDER_VERIFICATION' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-yellow-700">🔍 Verification in Progress</span>
                  <p className="text-sm text-gray-600">Our team is currently verifying your store details. This usually takes 24-48 hours.</p>
                </div>
              )}
              {modalStatus.status === 'REJECTED' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-red-700">❌ Registration Rejected</span>
                  <p className="text-sm text-gray-600">Your store registration could not be approved.</p>
                </div>
              )}
              {modalStatus.status === 'ERROR' && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-red-700">⚠️ Error Occurred</span>
                  <p className="text-sm text-gray-600">{modalStatus.reason}</p>
                </div>
              )}
              
              {/* Fallback for unknown status */}
              {modalStatus.status && !['SUBMITTED','UNDER_VERIFICATION','REJECTED','ERROR'].includes(modalStatus.status) && (
                <div className="space-y-2">
                  <span className="text-lg font-semibold text-gray-700">📊 Status: {modalStatus.status}</span>
                  {modalStatus.reason && (
                    <p className="text-sm text-gray-600">{modalStatus.reason}</p>
                  )}
                </div>
              )}
              
              {modalStatus.reason && modalStatus.status === 'REJECTED' && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800">Reason for rejection:</p>
                  <p className="text-sm text-red-700 mt-1">{modalStatus.reason}</p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                setShowStatusModal(false)
                router.push('/auth/search')
              }}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
            >
              Back to Home
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    )
  }

  const handleStoreToggle = () => {
    if (isStoreOpen) {
      setShowToggleDropdown(!showToggleDropdown)
    } else {
      setShowToggleOnWarning(true)
    }
  }

  const handleConfirmToggleOn = () => {
    setIsStoreOpen(true)
    setTempClosedUntil(null)
    setToggleClosureType(null)
    setShowToggleDropdown(false)
    setShowToggleOnWarning(false)
    toast.success('🟢 Store is now OPEN. Orders are being accepted!')
  }

  const handleConfirmToggle = () => {
    if (!toggleClosureType) {
      toast.error('❌ Please select closure type')
      return
    }

    if (toggleClosureType === 'temporary' && !closureTime) {
      toast.error('❌ Please select a time')
      return
    }

    setShowConfirmationModal(true)
  }

  const handleFinalConfirm = () => {
    if (!toggleClosureType) return

    let closedUntilDate: Date

    if (toggleClosureType === 'temporary') {
      const [hours, mins] = closureTime.split(':').map(Number)
      closedUntilDate = new Date()
      closedUntilDate.setHours(hours, mins, 0, 0)

      if (closedUntilDate < new Date()) {
        closedUntilDate.setDate(closedUntilDate.getDate() + 1)
      }

      const minutesRemaining = Math.max(0, Math.floor((closedUntilDate.getTime() - new Date().getTime()) / (1000 * 60)))
      const hoursRemaining = Math.floor(minutesRemaining / 60)
      const minsRemaining = minutesRemaining % 60

      toast.success(
        `⏱️ Store closed temporarily until ${closureTime} (${hoursRemaining}h ${minsRemaining}m remaining)`
      )
    } else {
      closedUntilDate = new Date()
      const [hours, mins] = openingTime.split(':').map(Number)
      closedUntilDate.setHours(hours, mins, 0, 0)
      closedUntilDate.setDate(closedUntilDate.getDate() + 1)

      toast.success(
        `📅 Store closed for today. Will reopen tomorrow at ${openingTime}`
      )
    }

    setIsStoreOpen(false)
    setTempClosedUntil(closedUntilDate)
    setShowToggleDropdown(false)
    setShowConfirmationModal(false)
    setToggleClosureType(null)
  }

  const handleCancelToggle = () => {
    setShowConfirmationModal(false)
    setToggleClosureType(null)
    setClosureTime('12:00')
  }

  const handleMXDeliveryToggle = () => {
    const newValue = !mxDeliveryEnabled
    setMxDeliveryEnabled(newValue)
    if (newValue) {
      toast.success('✅ MX Self Delivery enabled - Will use your riders')
    } else {
      toast.success('✅ GatiMitra Delivery enabled - External partners handle deliveries')
    }
  }

  if (isLoading) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="bg-white/50 border-b border-gray-200/50 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="space-y-6">
                <div className="h-8 bg-gray-200/50 rounded w-1/3 animate-pulse"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-28 bg-gray-100/50 rounded-xl animate-pulse backdrop-blur-sm"></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    )
  }

  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          className: 'backdrop-blur-sm bg-white/95',
          duration: 4000,
        }}
      />
      <StatusModal />
      <MXLayoutWhite
        restaurantName={store?.store_name || 'Dashboard'}
        restaurantId={storeId || DEMO_STORE_ID}
      >
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 px-4 sm:px-6 lg:px-8 py-8">
          {/* User Info Top Right removed as per request */}
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="space-y-3">
              <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Manage your store and monitor operations</p>
            </div>

            {/* ═══ MAIN CONTROLS ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Store Control Card */}
              <div className={`backdrop-blur-sm bg-gradient-to-br ${
                isStoreOpen 
                  ? 'from-emerald-50/80 to-green-50/60' 
                  : 'from-red-50/80 to-rose-50/60'
              } rounded-2xl border-2 ${
                isStoreOpen ? 'border-emerald-200' : 'border-red-200'
              } p-6 shadow-lg hover:shadow-xl transition-all duration-300`}>
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Store Status</h3>
                      <p className="text-sm text-gray-600 mt-1">Manage store availability</p>
                    </div>
                    <button
                      onClick={handleStoreToggle}
                      className={`p-3 rounded-xl transition-all shadow-lg ${
                        isStoreOpen
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700'
                          : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                      }`}
                    >
                      <Power size={22} />
                    </button>
                  </div>

                  {/* Operating Hours */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Operating Hours</p>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/50 border border-gray-100">
                      <Clock size={18} className="text-blue-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-900">
                        {openingTime} - {closingTime}
                      </span>
                    </div>
                  </div>

                  {/* Current Status */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Current Status</p>
                    <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${
                      isStoreOpen 
                        ? 'bg-emerald-100/30 border-emerald-300' 
                        : 'bg-red-100/30 border-red-300'
                    }`}>
                      <div className={`w-3 h-3 rounded-full ${isStoreOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-sm font-bold ${isStoreOpen ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isStoreOpen ? '🟢 OPEN & ACCEPTING ORDERS' : '🔴 CLOSED'}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Dropdown Menu */}
                  {showToggleDropdown && isStoreOpen && (
                    <div className="p-4 rounded-xl bg-white/80 border-2 border-orange-300 space-y-4 backdrop-blur-sm">
                      <p className="text-sm font-semibold text-gray-900">How would you like to close your store?</p>
                      
                      {/* Temporary Option */}
                      <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        toggleClosureType === 'temporary' ? 'bg-orange-50 border-orange-400' : 'bg-white/50 border-gray-200 hover:border-orange-200'
                      }`}>
                        <input
                          type="radio"
                          name="closureType"
                          checked={toggleClosureType === 'temporary'}
                          onChange={() => setToggleClosureType('temporary')}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">⏱️ Temporary</p>
                          <p className="text-xs text-gray-600">Close until a specific time</p>
                        </div>
                      </label>

                      {/* Time Input - Temporary */}
                      {toggleClosureType === 'temporary' && (
                        <div className="ml-7 p-4 rounded-lg bg-orange-50/50 border-2 border-orange-300 space-y-3 backdrop-blur-sm">
                          <label className="text-xs font-bold text-orange-900 block uppercase tracking-wide">Close until:</label>
                          <input
                            type="time"
                            value={closureTime}
                            onChange={(e) => setClosureTime(e.target.value)}
                            className="w-full px-4 py-2.5 border-2 border-orange-400 rounded-lg bg-white text-gray-900 font-semibold text-lg focus:ring-2 focus:ring-orange-500 focus:outline-none"
                          />
                          <p className="text-xs text-orange-800 font-medium">⏱️ Store will reopen at this time</p>
                        </div>
                      )}

                      {/* For Today Option */}
                      <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        toggleClosureType === 'today' ? 'bg-red-50 border-red-400' : 'bg-white/50 border-gray-200 hover:border-red-200'
                      }`}>
                        <input
                          type="radio"
                          name="closureType"
                          checked={toggleClosureType === 'today'}
                          onChange={() => setToggleClosureType('today')}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">📅 Close for Today</p>
                          <p className="text-xs text-gray-600">Reopen tomorrow at {openingTime}</p>
                        </div>
                      </label>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setShowToggleDropdown(false)
                            setToggleClosureType(null)
                          }}
                          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50/50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmToggle}
                          disabled={!toggleClosureType}
                          className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
                            toggleClosureType
                              ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                              : 'bg-gray-300 cursor-not-allowed'
                          }`}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Mode Card */}
              <div className="backdrop-blur-sm bg-white/30 rounded-2xl border border-gray-200/50 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Delivery Mode</h3>
                      <p className="text-sm text-gray-600 mt-1">Choose delivery method</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50">
                      <Truck size={20} className="text-purple-600" />
                    </div>
                  </div>

                  {/* MX Self Delivery Toggle */}
                  <div className="p-4 rounded-xl border border-gray-200/50 hover:border-orange-300/50 transition-colors bg-white/50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">📦 MX Self Delivery</p>
                        <p className="text-xs text-gray-600">Use own riders</p>
                      </div>
                      <button
                        onClick={handleMXDeliveryToggle}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                          mxDeliveryEnabled ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
                            mxDeliveryEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* GatiMitra Delivery */}
                  <div className={`p-4 rounded-xl border-2 ${
                    mxDeliveryEnabled 
                      ? 'border-gray-200/50 bg-gray-50/30' 
                      : 'border-purple-300 bg-gradient-to-br from-purple-50/50 to-purple-100/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">🚴 GatiMitra Delivery</p>
                        <p className="text-xs text-gray-600">Partner delivery network</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        mxDeliveryEnabled 
                          ? 'bg-gray-200/50 text-gray-700' 
                          : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                      }`}>
                        {mxDeliveryEnabled ? 'Off' : 'Active'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ STATS CARDS WITH BLUR EFFECT ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="Pending Orders"
                value={pendingOrders}
                icon={<Package size={24} />}
                color="orange"
              />
              <StatCard
                title="Preparing"
                value={preparingOrders}
                icon={<Users size={24} />}
                color="blue"
              />
              <StatCard
                title="Delivered Today"
                value={deliveredToday}
                icon={<TrendingUp size={24} />}
                color="emerald"
              />
              <StatCard
                title="Today's Revenue"
                value={`₹${revenueToday.toLocaleString('en-IN')}`}
                icon={<BarChart3 size={24} />}
                color="purple"
              />
            </div>

            {/* Order Status Summary */}
            <div className="backdrop-blur-sm bg-white/30 rounded-2xl border border-gray-200/50 p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Order Status Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { label: 'Pending', value: 5, color: 'orange', icon: '⏳' },
                  { label: 'Confirmed', value: 8, color: 'blue', icon: '✅' },
                  { label: 'Preparing', value: 2, color: 'yellow', icon: '👨‍🍳' },
                  { label: 'Ready', value: 3, color: 'cyan', icon: '📦' },
                  { label: 'Delivered', value: 45, color: 'emerald', icon: '🚚' },
                  { label: 'Cancelled', value: 2, color: 'red', icon: '❌' }
                ].map((status, idx) => (
                  <div
                    key={idx}
                    className="backdrop-blur-sm bg-white/40 rounded-xl border border-gray-200/50 p-4 text-center hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="text-2xl mb-2">{status.icon}</div>
                    <p className="text-xs text-gray-600 mb-1">{status.label}</p>
                    <p className={`text-2xl font-bold ${
                      status.color === 'orange' ? 'text-orange-600' : 
                      status.color === 'blue' ? 'text-blue-600' : 
                      status.color === 'yellow' ? 'text-yellow-600' : 
                      status.color === 'cyan' ? 'text-cyan-600' : 
                      status.color === 'emerald' ? 'text-emerald-600' : 
                      'text-red-600'
                    }`}>
                      {status.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Orders */}
            <div className="backdrop-blur-sm bg-white/30 rounded-2xl border border-gray-200/50 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">Recent Orders</h3>
                <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  View All →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Order ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Customer</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Amount</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: '#ORD001', customer: 'John Doe', amount: '₹850', status: 'Delivered', time: '2:30 PM' },
                      { id: '#ORD002', customer: 'Jane Smith', amount: '₹1,200', status: 'Preparing', time: '2:15 PM' },
                      { id: '#ORD003', customer: 'Mike Johnson', amount: '₹650', status: 'Confirmed', time: '2:05 PM' },
                      { id: '#ORD004', customer: 'Sarah Davis', amount: '₹950', status: 'Pending', time: '1:50 PM' },
                      { id: '#ORD005', customer: 'Robert Wilson', amount: '₹1,100', status: 'Delivered', time: '1:30 PM' }
                    ].map((order, idx) => (
                      <tr key={idx} className="border-b border-gray-100/50 hover:bg-white/30">
                        <td className="py-3 px-4 font-medium text-gray-900">{order.id}</td>
                        <td className="py-3 px-4 text-gray-700">{order.customer}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">{order.amount}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                              order.status === 'Delivered'
                                ? 'bg-emerald-100/70 text-emerald-700'
                                : order.status === 'Preparing'
                                  ? 'bg-yellow-100/70 text-yellow-700'
                                  : order.status === 'Confirmed'
                                    ? 'bg-blue-100/70 text-blue-700'
                                    : 'bg-orange-100/70 text-orange-700'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{order.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle ON Warning Modal */}
        {showToggleOnWarning && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="backdrop-blur-md bg-white/95 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-emerald-200">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 flex items-center justify-center">
                  <Power size={28} className="text-emerald-600" />
                </div>
              </div>

              <div className="text-center space-y-2 mb-6">
                <h3 className="text-lg font-bold text-gray-900">Turn Store ON?</h3>
                <p className="text-sm text-gray-600">
                  Your store will be OPEN and customers can place orders. Make sure you're ready to accept orders!
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 mb-6">
                <p className="text-xs text-amber-800 font-medium">
                  ⚠️ <strong>Orders will start coming immediately!</strong> Be prepared to receive and process them.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowToggleOnWarning(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmToggleOn}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg"
                >
                  Yes, Turn ON
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmationModal && (
          <div className="fixed inset-0 flex items-end justify-center z-50 p-4 pb-32">
            <div className="backdrop-blur-md bg-white/95 rounded-2xl shadow-2xl max-w-sm w-full p-5 border-2 border-red-200">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-red-100 to-red-50 flex items-center justify-center">
                  <AlertCircle size={24} className="text-red-600" />
                </div>
              </div>

              <div className="text-center mb-6 space-y-2">
                <h3 className="text-lg font-bold text-gray-900">Close Store?</h3>
                <p className="text-sm text-gray-600">
                  {toggleClosureType === 'temporary' 
                    ? `Your store will be closed until ${closureTime}`
                    : `Your store will be closed for today until ${openingTime} tomorrow`
                  }
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCancelToggle}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFinalConfirm}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all shadow-md hover:shadow-lg"
                >
                  Yes, Close
                </button>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/30">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}