'use client'

import React from 'react'
import { Bell, User, LogOut, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import LogoutConfirmModal from './LogoutConfirmModal'

interface MXHeaderProps {
  restaurantName?: string
  restaurantId?: string
  unreadCount?: number
}

export const MXHeader: React.FC<MXHeaderProps> = ({
  restaurantName = 'Your Restaurant',
  restaurantId = 'GMM0001',
  unreadCount = 0,
}) => {
  const router = useRouter()
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [showLogoutModal, setShowLogoutModal] = React.useState(false)
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/auth/login')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
      setShowLogoutModal(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-2xl border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left Section - Logo & Title */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GatiMitra" className="h-10 w-auto sm:h-12 object-contain" />
            <p className="text-xs text-slate-400 font-medium">Merchant Portal</p>
          </div>

          {/* Center Section - Restaurant Info */}
          <div className="hidden md:flex items-center gap-4 px-6 py-3 bg-slate-700/30 rounded-xl border border-slate-600/50">
            <div>
              <p className="text-sm font-semibold text-white">{restaurantName}</p>
              <p className="text-xs text-slate-400">{restaurantId}</p>
            </div>
            <div className="hidden lg:block text-2xl">🍽️</div>
          </div>

          {/* Right Section - Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative group">
              <button className="relative p-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 transition-all duration-200 border border-slate-600/50 group-hover:border-slate-500">
                <Bell size={20} className="text-slate-300" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 h-5 w-5 bg-red-500 rounded-full text-xs text-white font-bold flex items-center justify-center shadow-lg">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="p-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 transition-all duration-200 border border-slate-600/50 hover:border-slate-500"
              >
                <User size={20} className="text-slate-300" />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">
                  <button className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2">
                    <User size={16} />
                    Profile Settings
                  </button>
                  <button 
                    onClick={() => {
                      setIsDropdownOpen(false)
                      setShowLogoutModal(true)
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2 border-t border-slate-700"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-slate-800/50 border-t border-slate-700 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-green-500 rounded-full"></span>
            <span>System Online</span>
          </div>
          <div>Last sync: Just now</div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
      />
    </header>
  )
}

export default MXHeader
