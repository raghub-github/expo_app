'use client'

import React from 'react'
import { ChevronLeft } from 'lucide-react'
import { SettingsSidebar } from './SettingsSidebar'

interface SettingsSidebarRailProps {
  activeTab: string
  onTabChange: (tab: string) => void
  collapsed: boolean
  onCollapsedChange: (next: boolean) => void
}

/** Desktop settings nav — fixed right rail; expand/collapse control pinned at bottom (matches left sidebar). */
export function SettingsSidebarRail({
  activeTab,
  onTabChange,
  collapsed,
  onCollapsedChange,
}: SettingsSidebarRailProps) {
  const toggle = () => onCollapsedChange(!collapsed)

  return (
    <aside
      aria-label="Store settings navigation"
      className={`mx-settings-sidebar-rail fixed bottom-0 right-0 top-[var(--mx-partner-topbar-h)] z-40 hidden min-h-0 flex-col overflow-hidden border-l border-[#e8e8e8] bg-[#f5f5f5] transition-[width] duration-[220ms] ease-out lg:flex ${
        collapsed ? 'lg:w-16' : 'lg:w-56'
      }`}
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto hide-scrollbar">
        <SettingsSidebar activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
      </div>

      <div className="relative z-20 shrink-0 border-t border-[#e8e8e8] bg-[#f5f5f5]">
        <div className="mx-3 h-px bg-gray-200/90" aria-hidden />
        <div className="p-3">
          <button
            type="button"
            onClick={toggle}
            className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border border-gray-300/80 bg-white text-gray-700 shadow-sm transition-colors duration-[220ms] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 ${
              collapsed ? '' : 'gap-2'
            }`}
            title={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
          >
            <ChevronLeft
              className={`h-4 w-4 shrink-0 transition-transform duration-[220ms] ${
                collapsed ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
            {!collapsed ? (
              <span className="text-[13px] font-medium tracking-wide whitespace-nowrap">Collapse</span>
            ) : null}
          </button>
        </div>
      </div>
    </aside>
  )
}

export function settingsRailMainPaddingClass(collapsed: boolean): string {
  return collapsed ? 'lg:pr-16' : 'lg:pr-56'
}
