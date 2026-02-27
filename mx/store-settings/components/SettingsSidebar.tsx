'use client'

import { Crown, Clock, Power, ChefHat, Package, Smartphone, Bell, Activity, Users } from 'lucide-react'

interface SettingsSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  const tabs = [
    { id: 'plans', label: 'Plans & Subscription', icon: Crown },
    { id: 'timings', label: 'Outlet Timings', icon: Clock },
    { id: 'operations', label: 'Store Operations', icon: Power },
    { id: 'menu-capacity', label: 'Menu & Capacity', icon: ChefHat },
    { id: 'delivery', label: 'Delivery Settings', icon: Package },
    { id: 'riders', label: 'Self-Delivery Riders', icon: Users },
    { id: 'pos', label: 'POS Integration', icon: Smartphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'audit', label: 'Audit & Activity', icon: Activity },
    { id: 'gatimitra', label: 'Store on Gatimitra', icon: null },
  ]

  return (
    <div className="hidden lg:block w-64 bg-white border-r border-gray-200 p-4 sticky top-0 h-screen overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-gray-900 mb-4 px-3">Settings</h2>
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {Icon ? <Icon size={18} /> : <img src="/gstore.png" alt="Store" className="w-5 h-5" />}
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
