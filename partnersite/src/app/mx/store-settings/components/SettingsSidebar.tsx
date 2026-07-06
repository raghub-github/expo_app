'use client'

import React from 'react'
import { Crown, Clock, Power, ChefHat, Package, Smartphone, Bell, Activity, Store } from 'lucide-react'

interface SettingsSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  /** When true, show icon-only tab buttons (parent controls width, e.g. w-14). */
  collapsed?: boolean
}

/** Matches {@link MXSidebarWhite} `partnerShell` nav links: gray active bar; width set by parent (e.g. w-56). */
export function SettingsSidebar({ activeTab, onTabChange, collapsed = false }: SettingsSidebarProps) {
  const tabs = [
    { id: 'plans', label: 'Plans & Subscription', icon: Crown },
    { id: 'timings', label: 'Outlet Timings', icon: Clock },
    { id: 'operations', label: 'Store Operations', icon: Power },
    { id: 'menu-capacity', label: 'Menu & Capacity', icon: ChefHat },
    { id: 'delivery', label: 'Delivery & Riders', icon: Package },
    { id: 'pos', label: 'POS Integration', icon: Smartphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'audit', label: 'Audit & Activity', icon: Activity },
    { id: 'gatimitra', label: 'Store on Gatimitra', icon: Store },
  ]

  return (
    <nav
      className={`flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar space-y-0.5 ${
        collapsed ? 'px-2 py-3 items-center gap-1' : 'p-4 pt-3'
      }`}
    >
      {!collapsed && (
        <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Settings
        </div>
      )}
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        const btn = (
          <button
            type="button"
            title={tab.label}
            aria-label={tab.label}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center rounded-lg transition-all duration-200 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-0 ${
              collapsed ? 'justify-center w-9 h-9 shrink-0' : 'w-full gap-2.5 px-3 py-2.5'
            } ${
              isActive
                ? collapsed
                  ? 'bg-gray-200/90 text-gray-900 ring-2 ring-gray-800'
                  : 'bg-gray-200/90 text-gray-900 border-l-4 border-gray-800 font-semibold'
                : collapsed
                  ? 'text-gray-700 hover:bg-gray-200/60 hover:text-gray-900'
                  : 'text-gray-700 hover:bg-gray-200/60 hover:text-gray-900 border-l-4 border-transparent'
            }`}
          >
            <span className={`flex-shrink-0 ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>
              {Icon ? (
                <Icon size={collapsed ? 18 : 20} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/gstore.png" alt="" className={collapsed ? 'w-[18px] h-[18px] opacity-90' : 'w-5 h-5 opacity-90'} />
              )}
            </span>
            {!collapsed && <span className="flex-1 min-w-0 text-left leading-snug truncate">{tab.label}</span>}
          </button>
        )
        if (collapsed) {
          return (
            <div key={tab.id} className="relative group flex w-full justify-center">
              {btn}
              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 z-[100] pointer-events-none [@media(hover:none)]:hidden">
                <span className="inline-block px-3 py-2 bg-gray-100/95 backdrop-blur-sm border border-gray-200/80 text-gray-800 text-xs font-medium rounded-xl shadow-md whitespace-nowrap max-w-[220px]">
                  {tab.label}
                </span>
              </div>
            </div>
          )
        }
        return <React.Fragment key={tab.id}>{btn}</React.Fragment>
      })}
    </nav>
  )
}
