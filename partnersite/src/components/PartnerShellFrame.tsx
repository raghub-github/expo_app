'use client'

import React, {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { PartnerShellHeaderProvider } from '@/context/PartnerShellHeaderContext'
import {
  EMPTY_PARTNER_SHELL_REGISTRATION,
  PartnerShellFrameProvider,
  isSamePartnerShellRegistration,
  type PartnerShellRegistration,
} from '@/context/PartnerShellFrameContext'
import { MXSidebarWhite } from './MXSidebarWhite'
import { MXPartnerTopBar } from './MXPartnerTopBar'
import { ParentBlockedBanner } from './ParentBlockedBanner'
import { ServiceRestrictedNotice } from './ServiceRestrictedNotice'

/**
 * Persistent partner chrome: mounted once by /partners/layout.tsx and kept alive across
 * every route change, so the top bar and left sidebar never unmount or flash. Pages render
 * <MXLayoutWhite> as before — inside this frame it becomes a pass-through that publishes its
 * props here and drops its children into the main content slot.
 */
export function PartnerShellFrame({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<PartnerShellRegistration>(
    EMPTY_PARTNER_SHELL_REGISTRATION
  )
  const activeTokenRef = useRef<symbol | null>(null)

  const registerPartnerShell = useCallback((token: symbol, next: PartnerShellRegistration) => {
    activeTokenRef.current = token
    setRegistration((prev) => (isSamePartnerShellRegistration(prev, next) ? prev : next))
  }, [])

  const unregisterPartnerShell = useCallback((token: symbol) => {
    if (activeTokenRef.current !== token) return
    activeTokenRef.current = null
    setRegistration(EMPTY_PARTNER_SHELL_REGISTRATION)
  }, [])

  const frame = useMemo(
    () => ({ registerPartnerShell, unregisterPartnerShell }),
    [registerPartnerShell, unregisterPartnerShell]
  )

  const {
    restaurantName,
    restaurantId,
    sidebarPosition = 'left',
    mobileMenuExtra,
    sidebarFilters,
    hideHelpBadge = false,
    headerTitle,
  } = registration

  const isRight = sidebarPosition === 'right'
  const isSmallScreen = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia('(max-width: 767px)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false),
    () => false
  )
  // Starts expanded so a refresh never paints an icon-only sidebar; only the user's collapse
  // toggle changes it, and it survives navigation because this frame stays mounted.
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const collapsed = isSmallScreen ? true : desktopCollapsed

  // Memoised so a page re-render that only changes sidebar slots does not re-render the top bar.
  const topBar = useMemo(
    () =>
      isRight ? null : (
        <MXPartnerTopBar
          restaurantName={restaurantName}
          restaurantId={restaurantId}
          sidebarCollapsed={collapsed}
          headerTitle={headerTitle}
          hideHelpBadge={hideHelpBadge}
        />
      ),
    [isRight, restaurantName, restaurantId, collapsed, headerTitle, hideHelpBadge]
  )

  return (
    <PartnerShellHeaderProvider>
      <PartnerShellFrameProvider value={frame}>
        <div className="flex flex-col bg-white h-dvh min-h-0 overflow-hidden">
          <Suspense fallback={null}>{topBar}</Suspense>
          <div
            className={`flex flex-1 min-h-0 overflow-hidden relative ${!isRight ? 'pt-[var(--mx-partner-topbar-h,3.5rem)]' : ''}`}
          >
            <Suspense fallback={null}>
              <MXSidebarWhite
                restaurantName={restaurantName}
                restaurantId={restaurantId}
                position={sidebarPosition}
                collapsed={collapsed}
                onCollapsedChange={(v) => {
                  if (!isSmallScreen) setDesktopCollapsed(v)
                }}
                mobileMenuExtra={mobileMenuExtra}
                sidebarFilters={sidebarFilters}
                partnerShell={!isRight}
              />
            </Suspense>
            <main
              className={`flex-1 flex flex-col overflow-hidden h-full relative z-0 transition-[margin] duration-200 ${
                collapsed
                  ? isRight
                    ? 'mr-0 md:mr-14'
                    : 'ml-0 md:ml-14'
                  : isRight
                    ? 'mr-0 md:mr-52'
                    : 'ml-0 md:ml-52'
              }`}
            >
              <ParentBlockedBanner />
              <ServiceRestrictedNotice storeId={restaurantId} />
              <div className="bg-white flex-1 flex flex-col min-h-0 scroll-smooth mx-main-scroll">
                {children}
              </div>
            </main>
          </div>
        </div>
      </PartnerShellFrameProvider>
    </PartnerShellHeaderProvider>
  )
}
