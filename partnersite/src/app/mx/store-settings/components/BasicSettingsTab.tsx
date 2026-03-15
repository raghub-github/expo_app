'use client'

import { Power, Settings, Package, Globe, Users, Zap, Save } from 'lucide-react'
import { toast } from 'sonner'

interface BasicSettingsTabProps {
  isStoreOpen: boolean
  manualCloseUntil: string | null
  storeName: string
  phone: string
  storeAddress: string
  storeDescription: string
  latitude: string
  longitude: string
  mxDeliveryEnabled: boolean
  isSaving: boolean
  onStoreToggle: () => void
  onViewStore: () => void
  onStoreNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onAddressChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onLatitudeChange: (value: string) => void
  onLongitudeChange: (value: string) => void
  onMXDeliveryToggle: () => void
  onSave: () => Promise<void>
}

export function BasicSettingsTab({
  isStoreOpen,
  manualCloseUntil,
  storeName,
  phone,
  storeAddress,
  storeDescription,
  latitude,
  longitude,
  mxDeliveryEnabled,
  isSaving,
  onStoreToggle,
  onViewStore,
  onStoreNameChange,
  onPhoneChange,
  onAddressChange,
  onDescriptionChange,
  onLatitudeChange,
  onLongitudeChange,
  onMXDeliveryToggle,
  onSave,
}: BasicSettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Store Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-gradient-to-br from-orange-50 to-amber-50">
            <Power size={20} className="text-orange-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Store Status</h3>
                <p className="text-sm text-gray-600">Control your store availability</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${isStoreOpen ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  <span className={`text-sm font-semibold ${isStoreOpen ? 'text-emerald-700' : 'text-red-700'}`}>
                    {isStoreOpen ? 'STORE OPEN' : 'STORE CLOSED'}
                  </span>
                </div>
                {manualCloseUntil && !isStoreOpen && (
                  <p className="text-xs text-gray-500">
                    Reopens at {new Date(manualCloseUntil).toLocaleTimeString()} {new Date(manualCloseUntil) > new Date() ? '(auto if within hours)' : ''}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={onStoreToggle}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  isStoreOpen
                    ? 'bg-gradient-to-r from-red-50 to-orange-50 text-red-700 hover:from-red-100 hover:to-orange-100 border-2 border-red-200 hover:border-red-300'
                    : 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 hover:from-emerald-100 hover:to-green-100 border-2 border-emerald-200 hover:border-emerald-300'
                }`}
              >
                <Power size={16} />
                {isStoreOpen ? 'Close Store Temporarily' : 'Open Store'}
              </button>
              <button
                onClick={onViewStore}
                className="py-3 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-lg font-semibold hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 transition-all"
              >
                View Store on GatiMitra
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Store Information Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-blue-50">
            <Settings size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Store Information</h3>
              <button
                onClick={async () => {
                  await onSave()
                  toast.success('Store information saved!')
                }}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Store Name</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => onStoreNameChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter store name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Phone Number *</label>
                <div className="flex gap-2">
                  <div className="flex items-center px-4 border border-gray-300 rounded-lg bg-gray-50">
                    <Globe size={16} className="text-gray-500" />
                    <span className="ml-2 text-gray-700">+91</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Address</label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => onAddressChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter store address"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
                <textarea
                  value={storeDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter store description"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Latitude *</label>
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => onLatitudeChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter latitude"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Longitude *</label>
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => onLongitudeChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter longitude"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Configuration Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-orange-50">
            <Package size={20} className="text-orange-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Delivery Configuration</h3>
              <button
                onClick={async () => {
                  await onSave()
                  toast.success('Delivery configuration saved!')
                }}
                disabled={isSaving}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border-2 transition-colors ${
                mxDeliveryEnabled 
                  ? 'border-orange-300 bg-orange-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={16} className="text-orange-600" />
                      <p className="font-semibold text-gray-900">MX Self Delivery</p>
                    </div>
                    <p className="text-sm text-gray-600">Use your own delivery staff</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mxDeliveryEnabled}
                      onChange={onMXDeliveryToggle}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>
              </div>

              <div className={`p-4 rounded-lg border-2 transition-colors ${
                !mxDeliveryEnabled 
                  ? 'border-purple-300 bg-purple-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={16} className="text-purple-600" />
                      <p className="font-semibold text-gray-900">GatiMitra Delivery</p>
                    </div>
                    <p className="text-sm text-gray-600">Partner with external delivery service</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    !mxDeliveryEnabled 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {!mxDeliveryEnabled ? 'Active' : 'Inactive'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
