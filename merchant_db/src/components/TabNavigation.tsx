'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useOrderStore } from '@/lib/store'

interface TabNavigationProps {
  newOrderCount?: number
}

export function TabNavigation({ newOrderCount = 0 }: TabNavigationProps) {
  const pathname = usePathname()
  const activeTab = pathname.split('/').pop() || 'dashboard'
  const newOrders = useOrderStore((state) => state.newOrderCount)

  const tabs = [
    { name: 'Dashboard', href: '/mx/dashboard', id: 'dashboard' },
    { name: 'Active Orders', href: '/mx/orders', id: 'orders', badge: newOrders > 0 ? newOrders : undefined },
    { name: 'Completed', href: '/mx/completed', id: 'completed' },
    { name: 'Cancelled', href: '/mx/cancelled', id: 'cancelled' },
    { name: 'Profile', href: '/mx/profile', id: 'profile' },
  ]

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex space-x-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id || (activeTab === '' && tab.id === 'dashboard')
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative px-6 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300'
                }`}
              >
                {tab.name}
                {tab.badge && (
                  <span className="absolute top-2 right-1 flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-red-500 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
