'use client'

import { Crown, Clock, Power, ChefHat, Package, Users, Smartphone, Bell, Activity } from 'lucide-react'

interface MobileTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function MobileTabs({ activeTab, onTabChange }: MobileTabsProps) {
  const tabs = [
    { id: 'plans', label: 'Plans', icon: Crown },
    { id: 'timings', label: 'Timings', icon: Clock },
    { id: 'operations', label: 'Operations', icon: Power },
    { id: 'menu-capacity', label: 'Menu', icon: ChefHat },
    { id: 'delivery', label: 'Delivery', icon: Package },
    { id: 'riders', label: 'Riders', icon: Users },
    { id: 'pos', label: 'POS', icon: Smartphone },
    { id: 'notifications', label: 'Alerts', icon: Bell },
    { id: 'audit', label: 'Audit', icon: Activity },
  ]

  return (
    <div className="lg:hidden mb-6">
      <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide gap-2 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-orange-600 text-orange-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
