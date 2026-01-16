'use client'

import React, { useState } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  CreditCard,
  Settings,
  User,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Store
} from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: number | string
  submenu?: SidebarItem[]
}

interface MXSidebarWhiteProps {
  restaurantName?: string
  restaurantId?: string
}

export const MXSidebarWhite: React.FC<MXSidebarWhiteProps> = ({
  restaurantName = 'Store',
  restaurantId
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['dashboard'])
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  // Get logged-in user info from next-auth
  const { data: session } = useSession();
  const userName = session?.user?.name || 'User';
  const userEmail = session?.user?.email || 'user@example.com';
  const userImage = session?.user?.image;

  const navigationItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />, 
      href: '/mx/dashboard'
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: <ShoppingCart size={20} />, 
      href: '/mx/orders'
    },
    {
      id: 'menu',
      label: 'Menu',
      icon: <UtensilsCrossed size={20} />, 
      href: '/mx/menu'
    },
    {
      id: 'offers',
      label: 'Offers',
      icon: <Zap size={20} />, 
      href: '/mx/offers'
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCard size={20} />, 
      href: '/mx/payments'
    },
    {
      id: 'user-insights',
      label: 'User Insights',
      icon: <User size={20} />, 
      href: '/mx/user-insights'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />, 
      href: '/mx/store-settings'
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={20} />, 
      href: '/mx/profile'
    }
  ]

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId]
    )
  }

  const isActive = (href: string) => (pathname || '') === href || (pathname || '').startsWith(href + '?')

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      // Clear localStorage if using client-side auth
      localStorage.removeItem('auth_token')
      localStorage.removeItem('restaurantId')
      localStorage.removeItem('restaurantName')
      
      // Redirect to search page
      router.push('/auth/search')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Error logging out:', errorMessage)
    } finally {
      setIsLoggingOut(false)
      setShowLogoutModal(false)
    }
  }

  const SidebarContent = () => (
    <>
      {/* Header: Store icon, store id and name */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
            <Store size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-orange-600">{restaurantId || 'ID'}</p>
            <h1 className="text-sm font-bold text-gray-900 break-words line-clamp-2">{restaurantName || 'Store'}</h1>
          </div>
        </div>
        {/* Mobile Close Button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden text-gray-500 hover:text-gray-900"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navigationItems.map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0
          const isItemActive = isActive(item.href)

          return (
            <div key={item.id}>
              <Link
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 font-medium text-sm ${
                  isItemActive
                    ? 'bg-orange-50 text-orange-600 border-l-4 border-orange-600'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex-shrink-0 ${isItemActive ? 'text-orange-600' : 'text-gray-500'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Footer: User Profile Card (User info, not store) */}
      <div className="p-4 border-t border-gray-200">
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-gray-100 text-sm font-medium focus:outline-none"
          >
            {userImage ? (
              <Image
                src={userImage}
                alt={userName}
                width={36}
                height={36}
                className="rounded-full border border-blue-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col items-start flex-1 min-w-0 text-left">
              <span className="font-semibold text-gray-900 truncate">{userName}</span>
              <span className="text-xs text-gray-500 truncate">{userEmail}</span>
            </div>
            <ChevronDown size={18} className="text-gray-400" />
          </button>
          {showProfileMenu && (
            <div className="absolute left-0 bottom-14 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-fade-in">
              <button
                onClick={() => { setShowProfileMenu(false); setShowLogoutModal(true); }}
                disabled={isLoggingOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:text-red-600 rounded-lg transition-colors hover:bg-red-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6">
              <h2 className="text-xl font-bold text-white">Sign Out</h2>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-gray-700 text-sm leading-relaxed">
                You are being securely logged out from this page. After logging out, you won't be able to access this page.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 border-t border-gray-200">
              <button
                onClick={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
                className="flex-1 px-4 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging out...
                  </>
                ) : (
                  'Sign Out'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 rounded-lg bg-white text-gray-900 hover:bg-gray-100 border border-gray-200"
        style={{ left: 'auto' }}
      >
        <Menu size={24} />
      </button>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen bg-white border-r border-gray-200 fixed left-0 top-0 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 w-64 h-screen bg-white border-r border-gray-200 z-40 md:hidden overflow-y-auto">
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
}
