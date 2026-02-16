'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  CreditCard,
  Settings,
  User,
  ChevronRight,
  ChevronDown,
  LogOut,
  Store,
  Menu,
  X
} from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: number | string
  submenu?: SidebarItem[]
}

interface MXSidebarProps {
  restaurantName?: string
  restaurantId?: string
}

export const MXSidebar: React.FC<MXSidebarProps> = ({ 
  restaurantName = 'Store',
  restaurantId 
}) => {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['dashboard'])

  const navigationItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />,
      href: '/mx/dashboard',
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: <ShoppingCart size={20} />,
      href: '/mx/orders',
      submenu: [
        {
          id: 'active-orders',
          label: 'Active Orders',
          icon: <ShoppingCart size={16} />,
          href: '/mx/orders?status=active',
        },
        {
          id: 'completed-orders',
          label: 'Completed',
          icon: <ShoppingCart size={16} />,
          href: '/mx/completed',
        },
        {
          id: 'cancelled-orders',
          label: 'Cancelled',
          icon: <ShoppingCart size={16} />,
          href: '/mx/cancelled',
        },
      ],
    },
    {
      id: 'menu',
      label: 'Menu',
      icon: <UtensilsCrossed size={20} />,
      href: '/mx/menu',
    },
    {
      id: 'offers',
      label: 'Offers',
      icon: <Zap size={20} />,
      href: '/mx/offers',
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCard size={20} />,
      href: '/mx/payments',
    },
    {
      id: 'user-insights',
      label: 'User Insights',
      icon: <User size={20} />,
      href: '/mx/user-insights',
    },
    {
      id: 'store-settings',
      label: 'Store Settings',
      icon: <Settings size={20} />,
      href: '/mx/store-settings',
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={20} />,
      href: '/mx/profile',
    },
  ]

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId]
    )
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '?')

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Store size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">{restaurantName}</h1>
            <p className="text-xs text-gray-300 truncate">{restaurantId || 'Merchant Portal'}</p>
          </div>
        </div>
        {/* Mobile Close Button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navigationItems.map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0
          const isItemActive = isActive(item.href)
          const isExpanded = expandedMenus.includes(item.id)

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (hasSubmenu) {
                    toggleMenu(item.id)
                  } else {
                    setIsMobileOpen(false)
                  }
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                  isItemActive
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Link
                  href={item.href}
                  className="flex items-center gap-3 flex-1 text-left"
                  onClick={(e) => {
                    if (hasSubmenu) e.preventDefault()
                  }}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="font-semibold text-base text-white">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow">
                      {item.badge}
                    </span>
                  )}
                </Link>
                {hasSubmenu && (
                  <ChevronDown
                    size={16}
                    className={`ml-2 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {/* Submenu */}
              {hasSubmenu && isExpanded && (
                <div className="ml-4 mt-1 space-y-1 pl-2 border-l-2 border-slate-700">
                  {item.submenu?.map((subitem) => (
                    <Link
                      key={subitem.id}
                      href={subitem.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 text-sm ${
                          isActive(subitem.href)
                            ? 'bg-orange-500/20 text-orange-300 font-semibold'
                            : 'text-gray-300 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                      {subitem.icon}
                      <span>{subitem.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={() => setIsMobileOpen(false)}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-red-400 rounded-lg transition-colors hover:bg-slate-800/50 text-base font-semibold"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
      >
        <Menu size={24} />
      </button>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-700 fixed left-0 top-0 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 w-64 h-screen bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-700 z-40 md:hidden">
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
}
