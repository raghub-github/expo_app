'use client'

import React, { useState, useSyncExternalStore, Suspense, useMemo } from 'react'
import { PartnerShellHeaderProvider } from '@/context/PartnerShellHeaderContext'
import {
  useIsomorphicLayoutEffect,
  usePartnerShellFrame,
  type PartnerShellRegistration,
} from '@/context/PartnerShellFrameContext'
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
  /** Page has a right settings rail — shell coordinates expand/collapse with left nav. */
  dualSidebarRail?: boolean
  onDualSidebarLeftExpanded?: () => void
  onDualSidebarLeftCollapsed?: () => void
  /** Optional content shown inside the mobile hamburger menu (e.g. stats for food-orders) */
  mobileMenuExtra?: React.ReactNode
  /** Optional filters/stats content shown in sidebar (desktop and mobile) */
  sidebarFilters?: React.ReactNode
  /** When true, hides the Need Help Badge */
  hideHelpBadge?: boolean
  /** Shown in partner top bar center (e.g. Dashboard) */
  headerTitle?: string
}

/**
 * Under /partners/* the chrome is owned by the persistent <PartnerShellFrame>, so this only
 * forwards the page's shell props upward and renders the page into the existing main slot —
 * the sidebar and top bar stay mounted across navigation. Elsewhere it renders the chrome itself.
 */
export const MXLayoutWhite: React.FC<MXLayoutWhiteProps> = (props) => {
  const frame = usePartnerShellFrame()
  if (frame) return <MXLayoutWhiteInFrame {...props} />
  return <MXLayoutWhiteStandalone {...props} />
}

const MXLayoutWhiteInFrame: React.FC<MXLayoutWhiteProps> = ({
  children,
  restaurantName,
  restaurantId,
  sidebarPosition,
  leftSidebarCollapsed,
  dualSidebarRail,
  onDualSidebarLeftExpanded,
  onDualSidebarLeftCollapsed,
  mobileMenuExtra,
  sidebarFilters,
  hideHelpBadge,
  headerTitle,
}) => {
  const frame = usePartnerShellFrame()
  const token = useMemo(() => Symbol('mx-layout-white'), [])
  const register = frame?.registerPartnerShell
  const unregister = frame?.unregisterPartnerShell

  const registration: PartnerShellRegistration = {
    restaurantName,
    restaurantId,
    sidebarPosition,
    leftSidebarCollapsed,
    dualSidebarRail,
    onDualSidebarLeftExpanded,
    onDualSidebarLeftCollapsed,
    mobileMenuExtra,
    sidebarFilters,
    hideHelpBadge,
    headerTitle,
  }

  // Runs after every render (the frame ignores unchanged registrations) so the shell picks up
  // new titles and filters before paint.
  useIsomorphicLayoutEffect(() => {
    register?.(token, registration)
  })

  useIsomorphicLayoutEffect(() => {
    return () => unregister?.(token)
  }, [token, unregister])

  return <>{children}</>
}

const MXLayoutWhiteStandalone: React.FC<MXLayoutWhiteProps> = ({
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
  // Starts expanded; user's collapse toggle is the only thing that changes it.
  const [effectiveCollapsed, setEffectiveCollapsed] = useState(leftSidebarCollapsed);
  const collapsed = isSmallScreen ? true : effectiveCollapsed;
  return (
    <PartnerShellHeaderProvider>
      <div className="flex flex-col bg-white h-dvh min-h-0 overflow-hidden">
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
          className={`flex min-h-0 w-full overflow-hidden ${
            !isRight
              ? 'mt-[var(--mx-partner-topbar-h,3.5rem)] h-[calc(100dvh-var(--mx-partner-topbar-h,3.5rem))]'
              : 'flex-1'
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
