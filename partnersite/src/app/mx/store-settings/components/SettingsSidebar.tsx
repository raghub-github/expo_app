'use client'

import React from 'react'
import { Crown, Clock, Power, ChefHat, Package, Smartphone, Bell, Activity, Store } from 'lucide-react'
import { MerchantAppAssetImage, MX_ASSET } from '@/components/MerchantAppAssetImage'

interface SettingsSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  /** When true, show icon-only tab buttons (parent controls width, e.g. w-14). */
  collapsed?: boolean
}

const SETTINGS_NAV_ITEM =
  'group relative flex h-11 w-full items-center rounded-[10px] outline-none transition-[background-color,color] duration-[220ms] ease-in-out focus-visible:ring-2 focus-visible:ring-gray-400/40'

/** Matches {@link MXSidebarWhite} partnerShell nav spacing. */
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
      className={`flex flex-col ${
        collapsed ? 'space-y-1.5 px-3 py-2' : 'space-y-0.5 px-3 py-3'
      }`}
    >
      <div className={`${collapsed ? 'space-y-1.5' : 'space-y-0.5'}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const btn = (
            <button
              type="button"
              title={tab.label}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`${SETTINGS_NAV_ITEM} group ${
                collapsed ? '' : 'gap-2.5 px-3 py-2.5'
              } ${
                isActive
                  ? collapsed
                    ? 'bg-gray-200/90 text-gray-900'
                    : 'border-l-4 border-gray-800 bg-gray-200/90 font-semibold text-gray-900'
                  : collapsed
                    ? 'text-gray-600 hover:bg-gray-200/60 hover:text-gray-900'
                    : 'border-l-4 border-transparent text-gray-700 hover:bg-gray-200/60 hover:text-gray-900'
              }`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center">
                <span className={`flex shrink-0 items-center justify-center ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>
                  {Icon ? (
                    <Icon size={20} strokeWidth={1.75} />
                  ) : (
                    <MerchantAppAssetImage
                      assetKey={MX_ASSET.partnerManageStores}
                      alt=""
                      className="size-5 opacity-90 object-contain"
                    />
                  )}
                </span>
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug">
                  {tab.label}
                </span>
              )}
            </button>
          )
          if (collapsed) {
            return (
              <div key={tab.id} className="relative flex w-full justify-center">
                {btn}
                <div className="pointer-events-none absolute right-full top-1/2 z-[100] mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-gray-200/80 bg-gray-100/95 px-2.5 py-1.5 text-xs font-medium text-gray-800 opacity-0 shadow-xl transition-opacity duration-[220ms] group-hover:opacity-100 [@media(hover:none)]:hidden">
                  {tab.label}
                </div>
              </div>
            )
          }
          return <React.Fragment key={tab.id}>{btn}</React.Fragment>
        })}
      </div>
    </nav>
  )
}
