'use client'

import { useState, useEffect } from 'react'

interface AccountRemovedModalProps {
  isOpen: boolean
  onRegister: () => void
}

export default function AccountRemovedModal({ isOpen, onRegister }: AccountRemovedModalProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
      
      {/* Modal */}
      <div 
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header with gentle gradient */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-8 text-center">
          <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
            <i className="fas fa-user-circle text-white text-3xl"></i>
          </div>
          <h2 className="text-xl font-bold text-white">Session Expired</h2>
        </div>
        
        {/* Content */}
        <div className="p-6 text-center">
          <div className="mb-6">
            <p className="text-gray-700 text-base leading-relaxed mb-3">
              It looks like your account is no longer associated with this organization.
            </p>
            <p className="text-gray-500 text-sm">
              Please create your account again to continue using our services. 
              We apologize for any inconvenience.
            </p>
          </div>
          
          {/* Info box */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
              <p className="text-sm text-blue-700 text-left">
                Your previous session data has been cleared for security. 
                Registering again will only take a moment.
              </p>
            </div>
          </div>
          
          {/* Action button */}
          <button
            onClick={onRegister}
            className="w-full py-3.5 bg-gradient-to-r from-purple to-mint text-white font-semibold rounded-xl hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
          >
            <i className="fas fa-user-plus"></i>
            Register Again
          </button>
          
          <p className="text-xs text-gray-400 mt-4">
            Need help? Contact our support team
          </p>
        </div>
      </div>
    </div>
  )
}
