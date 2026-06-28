'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { ServiceCategory, switchUserToCategory } from '@/lib/slices/authSlice'

interface ServiceSwitchModalProps {
  isOpen: boolean
  onClose: () => void
  targetService: ServiceCategory
  onContinue: () => void
}

interface ToastState {
  show: boolean
  message: string
  type: 'success' | 'error'
}

const serviceLabels: Record<ServiceCategory, { name: string; icon: string; color: string; description: string; path: string }> = {
  food: { name: 'Food Delivery', icon: 'fas fa-utensils', color: 'from-orange-500 to-red-500', description: 'Order food from restaurants', path: '/order' },
  person: { name: 'Ride Service', icon: 'fas fa-car', color: 'from-blue-500 to-indigo-500', description: 'Book rides for travel', path: '/ride' },
  parcel: { name: 'Courier Service', icon: 'fas fa-box', color: 'from-green-500 to-teal-500', description: 'Send parcels and packages', path: '/parcel' },
}

export default function ServiceSwitchModal({ 
  isOpen, 
  onClose, 
  targetService, 
  onContinue 
}: ServiceSwitchModalProps) {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user, isLoading, currentService } = useAppSelector(state => state.auth)
  const [isSwitching, setIsSwitching] = useState(false)
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' })

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsSwitching(false)
      setToast({ show: false, message: '', type: 'success' })
    }
  }, [isOpen])

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }))
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toast.show])

  if (!isOpen) return null

  const currentServiceInfo = serviceLabels[currentService]
  const targetServiceInfo = serviceLabels[targetService]

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
  }

  const handleContinue = async () => {
    if (!user) {
      showToast('Please log in first to switch services', 'error')
      return
    }
    
    setIsSwitching(true)
    
    try {
      // Switch user to the new category
      const result = await dispatch(switchUserToCategory(user.phone, user.name, targetService))
      
      if (result.success) {
        showToast(`Successfully switched to ${targetServiceInfo.name}!`, 'success')
        
        // Set a timestamp in sessionStorage to prevent modal from showing for 5 seconds
        sessionStorage.setItem('lastServiceSwitch', Date.now().toString())
        
        // Small delay to show success message before redirecting
        setTimeout(() => {
          onContinue()
          onClose()
          // Navigate to the appropriate service page
          router.push(targetServiceInfo.path)
        }, 500)
      } else {
        showToast(result.error || 'Failed to switch service. Please try again.', 'error')
        setIsSwitching(false)
      }
    } catch (error: any) {
      showToast(error.message || 'An error occurred. Please try again.', 'error')
      setIsSwitching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      {/* Toast Notification */}
      {toast.show && (
        <div 
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[10001] px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}
        >
          <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button 
          onClick={onClose}
          disabled={isSwitching}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors disabled:opacity-50"
        >
          <i className="fas fa-times"></i>
        </button>

        {/* Switch icon */}
        <div className="flex items-center justify-center gap-4 mb-6">
          {/* Current service */}
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${currentServiceInfo.color} flex items-center justify-center shadow-lg`}>
            <i className={`${currentServiceInfo.icon} text-white text-xl`}></i>
          </div>
          
          {/* Arrow */}
          <div className="flex flex-col items-center">
            <i className="fas fa-arrow-right text-gray-400 text-xl"></i>
            <span className="text-xs text-gray-400 mt-1">Switching</span>
          </div>
          
          {/* Target service */}
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${targetServiceInfo.color} flex items-center justify-center shadow-lg ring-2 ring-offset-2 ring-purple-400`}>
            <i className={`${targetServiceInfo.icon} text-white text-xl`}></i>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          Switch to {targetServiceInfo.name}
        </h2>

        {/* Description */}
        <p className="text-gray-500 text-center text-sm mb-4">
          {targetServiceInfo.description}
        </p>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6 leading-relaxed">
          You are switching from <span className="font-semibold text-gray-900">{currentServiceInfo.name}</span> to{' '}
          <span className="font-semibold text-gray-900">{targetServiceInfo.name}</span>.
        </p>

        {/* Info box */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
            <div>
              <p className="text-sm text-blue-700 font-medium mb-1">Single Login, Multiple Services</p>
              <p className="text-xs text-blue-600">
                Your account works seamlessly across Food, Ride, and Courier services. No need to log in again!
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleContinue}
            disabled={isLoading || isSwitching}
            className={`w-full px-4 py-3.5 bg-gradient-to-r ${targetServiceInfo.color} text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSwitching ? (
              <>
                <i className="fas fa-spinner animate-spin"></i>
                Switching...
              </>
            ) : (
              <>
                <i className="fas fa-check"></i>
                Continue to {targetServiceInfo.name}
              </>
            )}
          </button>
          
          <button
            onClick={onClose}
            disabled={isSwitching}
            className="w-full px-4 py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
