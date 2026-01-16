'use client'

import React from 'react'
import { MXSidebar } from '@/components/MXSidebar'
import NeedHelpBadge from '@/components/NeedHelpBadge'

interface MXLayoutProps {
  children: React.ReactNode
  restaurantName?: string
  restaurantId?: string
}

export const MXLayout: React.FC<MXLayoutProps> = ({ 
  children, 
  restaurantName = 'Store',
  restaurantId 
}) => {
  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <MXSidebar 
        restaurantName={restaurantName} 
        restaurantId={restaurantId}
      />

      {/* Main Content */}
      <main className="flex-1 md:ml-64 overflow-auto">
        <div className="pt-4 md:pt-0">
          {children}
        </div>
      </main>
      {/* Need Help Badge (fixed, always visible) */}
      <NeedHelpBadge />
    </div>
  )
}
