'use client'

import React from 'react'
import UserHeader from './UserHeader'
import { MXSidebarWhite } from './MXSidebarWhite'
import NeedHelpBadge from './NeedHelpBadge'

interface MXLayoutWhiteProps {
  children: React.ReactNode
  restaurantName?: string
  restaurantId?: string
}

export const MXLayoutWhite: React.FC<MXLayoutWhiteProps> = ({
  children,
  restaurantName,
  restaurantId
}) => {
  return (
    <div className="flex bg-white min-h-0 h-auto">
      <MXSidebarWhite restaurantName={restaurantName} restaurantId={restaurantId} />
      <main className="flex-1 md:ml-64 overflow-auto hide-scrollbar" style={{ height: '100vh', minHeight: 0 }}>
        {/* <UserHeader /> removed as per request */}
        <div className="bg-white min-h-0 h-auto">
          {children}
        </div>
      </main>
      {/* Need Help Badge (fixed, always visible) */}
      <NeedHelpBadge />
    </div>
  )
}
