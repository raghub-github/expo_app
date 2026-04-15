'use client'

import React, { useState, useEffect } from 'react'
import { PartnerShellHeaderProvider } from '@/context/PartnerShellHeaderContext'
import { MXSidebarWhite } from './MXSidebarWhite'
import { MXPartnerTopBar } from './MXPartnerTopBar'
import NeedHelpBadge from './NeedHelpBadge'
import { ParentBlockedBanner } from './ParentBlockedBanner'

interface MXLayoutWhiteProps {
  children: React.ReactNode
  restaurantName?: string
  restaurantId?: string
  /** Sidebar position: 'left' (default) or 'right' */
  sidebarPosition?: 'left' | 'right'
  /** When true, left sidebar collapses to icons only (e.g. when right filter panel is open) */
  leftSidebarCollapsed?: boolean
  /** Optional content shown inside the mobile hamburger menu (e.g. stats for food-orders) */
  mobileMenuExtra?: React.ReactNode
  /** Optional filters/stats content shown in sidebar (desktop and mobile) */
  sidebarFilters?: React.ReactNode
  /** When true, hides the Need Help Badge */
  hideHelpBadge?: boolean
  /** Shown in partner top bar center (e.g. Dashboard) */
  headerTitle?: string
  headerSubtitle?: string
}

export const MXLayoutWhite: React.FC<MXLayoutWhiteProps> = ({
  children,
  restaurantName,
  restaurantId,
  sidebarPosition = 'left',
  leftSidebarCollapsed = false,
  mobileMenuExtra,
  sidebarFilters,
  hideHelpBadge = false,
  headerTitle,
  headerSubtitle,
}) => {
  const isRight = sidebarPosition === 'right';
  // Small/mobile (≤767px): sidebar stays collapsed; never allow expand. Desktop: unchanged.
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [effectiveCollapsed, setEffectiveCollapsed] = useState(leftSidebarCollapsed);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsSmallScreen(mq.matches);
    const h = () => setIsSmallScreen(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  useEffect(() => {
    if (isSmallScreen) setEffectiveCollapsed(true); // always collapsed on small/mobile
    else if (leftSidebarCollapsed) setEffectiveCollapsed(true);
    else setEffectiveCollapsed(false);
  }, [leftSidebarCollapsed, isSmallScreen]);
  return (
    <PartnerShellHeaderProvider>
      <div className="flex flex-col bg-white h-screen overflow-hidden">
        {!isRight && (
          <MXPartnerTopBar
            restaurantName={restaurantName}
            restaurantId={restaurantId}
            sidebarCollapsed={effectiveCollapsed}
            headerTitle={headerTitle}
            headerSubtitle={headerSubtitle}
          />
        )}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          <MXSidebarWhite
            restaurantName={restaurantName}
            restaurantId={restaurantId}
            position={sidebarPosition}
            collapsed={effectiveCollapsed}
            onCollapsedChange={(v) => { if (!isSmallScreen) setEffectiveCollapsed(v); }}
            mobileMenuExtra={mobileMenuExtra}
            sidebarFilters={sidebarFilters}
            partnerShell={!isRight}
          />
          <main className={`flex-1 flex flex-col overflow-hidden h-full relative z-0 transition-[margin] duration-200 ${effectiveCollapsed ? (isRight ? 'mr-0 md:mr-14' : 'ml-0 md:ml-14') : (isRight ? 'mr-0 md:mr-52' : 'ml-0 md:ml-52')}`}>
            <ParentBlockedBanner />
            <div className="bg-white flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 scroll-smooth">
              {children}
            </div>
          </main>
        </div>
        {!hideHelpBadge && <NeedHelpBadge />}
      </div>
    </PartnerShellHeaderProvider>
  )
}
