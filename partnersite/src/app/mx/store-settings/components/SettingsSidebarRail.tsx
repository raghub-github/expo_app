'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SettingsSidebar } from './SettingsSidebar'

interface SettingsSidebarRailProps {
  activeTab: string
  onTabChange: (tab: string) => void
  collapsed: boolean
  onCollapsedChange: (next: boolean) => void
}

/** Desktop settings nav — fixed to viewport right, same pattern as {@link MXSidebarWhite}. */
export function SettingsSidebarRail({
  activeTab,
  onTabChange,
  collapsed,
  onCollapsedChange,
}: SettingsSidebarRailProps) {
  return (
    <aside
      aria-label="Store settings navigation"
      className={`mx-settings-sidebar-rail hidden lg:flex lg:flex-col fixed right-0 z-30 shrink-0 overflow-hidden bg-[#f5f5f5] border-l border-[#e8e8e8] transition-[width] duration-200 ease-out top-[var(--mx-partner-topbar-h)] h-[calc(100dvh-var(--mx-partner-topbar-h))] ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <SettingsSidebar activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
      <div className="flex justify-center py-2 border-t border-[#e8e8e8] shrink-0">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-200/80 text-gray-600 hover:text-gray-900"
          title={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
        >
          {collapsed ? <ChevronLeft size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        </button>
      </div>
    </aside>
  )
}

export function settingsRailMainPaddingClass(collapsed: boolean): string {
  return collapsed ? 'lg:pr-14' : 'lg:pr-56'
}
