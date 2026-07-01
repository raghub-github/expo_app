'use client'

import React, { useState, useSyncExternalStore, Suspense, useEffect } from 'react'
import { PartnerShellHeaderProvider } from '@/context/PartnerShellHeaderContext'
import { MXSidebarWhite } from './MXSidebarWhite'
import { MXPartnerTopBar } from './MXPartnerTopBar'
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
}) => {
  const isRight = sidebarPosition === 'right';
  const isSmallScreen = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia('(max-width: 767px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false),
    () => false
  );
  const [effectiveCollapsed, setEffectiveCollapsed] = useState(leftSidebarCollapsed);
  // Keep desktop sidebar expanded after reload — never start icon-only on refresh.
  useEffect(() => {
    if (!isSmallScreen) setEffectiveCollapsed(false);
  }, [isSmallScreen]);
  const collapsed = isSmallScreen ? true : effectiveCollapsed;
  return (
    <PartnerShellHeaderProvider>
      <div className="flex flex-col bg-white h-screen overflow-hidden">
        <Suspense fallback={null}>
        {!isRight && (
          <MXPartnerTopBar
            restaurantName={restaurantName}
            restaurantId={restaurantId}
            sidebarCollapsed={collapsed}
            headerTitle={headerTitle}
            hideHelpBadge={hideHelpBadge}
          />
        )}
        <div
          className={`flex flex-1 min-h-0 overflow-hidden relative ${
            !isRight ? "pt-14" : ""
          }`}
        >
          <MXSidebarWhite
            restaurantName={restaurantName}
            restaurantId={restaurantId}
            position={sidebarPosition}
            collapsed={collapsed}
            onCollapsedChange={(v) => { if (!isSmallScreen) setEffectiveCollapsed(v); }}
            mobileMenuExtra={mobileMenuExtra}
            sidebarFilters={sidebarFilters}
            partnerShell={!isRight}
          />
          <main className={`flex-1 flex flex-col overflow-hidden h-full relative z-0 transition-[margin] duration-200 ${collapsed ? (isRight ? 'mr-0 md:mr-14' : 'ml-0 md:ml-14') : (isRight ? 'mr-0 md:mr-52' : 'ml-0 md:ml-52')}`}>
            <ParentBlockedBanner />
            <div className="bg-white flex-1 flex flex-col min-h-0 scroll-smooth mx-main-scroll">
              {children}
            </div>
          </main>
        </div>
        </Suspense>
      </div>
    </PartnerShellHeaderProvider>
  )
}
