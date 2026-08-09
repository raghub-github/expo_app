'use client'

import React, {
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { usePathname } from 'next/navigation'
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
  const pathname = usePathname() ?? ''
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const [registration, setRegistration] = useState<PartnerShellRegistration>(
    EMPTY_PARTNER_SHELL_REGISTRATION
  )
  const activeTokenRef = useRef<symbol | null>(null)
  const dualSidebarCallbacksRef = useRef<{
    onExpanded?: () => void
    onCollapsed?: () => void
  }>({})

  const registerPartnerShell = useCallback((token: symbol, next: PartnerShellRegistration) => {
    activeTokenRef.current = token
    dualSidebarCallbacksRef.current = {
      onExpanded: next.onDualSidebarLeftExpanded,
      onCollapsed: next.onDualSidebarLeftCollapsed,
    }
    setRegistration((prev) => (isSamePartnerShellRegistration(prev, next) ? prev : next))
  }, [])

  const unregisterPartnerShell = useCallback((token: symbol) => {
    if (activeTokenRef.current !== token) return
    activeTokenRef.current = null
    dualSidebarCallbacksRef.current = {}
    setRegistration(EMPTY_PARTNER_SHELL_REGISTRATION)
  }, [])

  const {
    restaurantName,
    restaurantId,
    sidebarPosition = 'left',
    mobileMenuExtra,
    sidebarFilters,
    hideHelpBadge = false,
    headerTitle,
    dualSidebarRail = false,
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
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const collapsed = isSmallScreen ? true : desktopCollapsed
  const dualRailEnteredRef = useRef(false)

  const setPartnerLeftSidebarCollapsed = useCallback((next: boolean) => {
    if (isSmallScreen) return
    setDesktopCollapsed(next)
  }, [isSmallScreen])

  const frame = useMemo(
    () => ({
      registerPartnerShell,
      unregisterPartnerShell,
      partnerLeftSidebarCollapsed: collapsed,
      setPartnerLeftSidebarCollapsed,
    }),
    [registerPartnerShell, unregisterPartnerShell, collapsed, setPartnerLeftSidebarCollapsed]
  )

  // Dual-rail pages: on entry left icon-only + right expanded (control dashboard settings).
  useLayoutEffect(() => {
    if (isSmallScreen) return
    if (dualSidebarRail) {
      if (!dualRailEnteredRef.current) {
        dualRailEnteredRef.current = true
        setDesktopCollapsed(true)
      }
      return
    }
    dualRailEnteredRef.current = false
    setDesktopCollapsed(false)
  }, [dualSidebarRail, isSmallScreen])

  // Reset persistent main scroll on route change so inner pages never inherit dashboard scroll offset.
  useLayoutEffect(() => {
    const el = mainScrollRef.current
    if (el) el.scrollTop = 0
  }, [pathname])

  // Keep header offset aligned with left rail width (matches control dashboard ml-* pattern).
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty(
      '--mx-partner-sidebar-w',
      collapsed ? '4rem' : '14rem',
    )
  }, [collapsed])

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
            className={`flex min-h-0 w-full overflow-hidden mt-[var(--mx-partner-topbar-h,3.5rem)] h-[calc(100dvh-var(--mx-partner-topbar-h,3.5rem))] ${!isRight ? '' : ''}`}
          >
            <Suspense fallback={null}>
              <MXSidebarWhite
                restaurantName={restaurantName}
                restaurantId={restaurantId}
                position={sidebarPosition}
                collapsed={collapsed}
                onCollapsedChange={(v) => {
                  if (isSmallScreen) return
                  setDesktopCollapsed(v)
                  if (!dualSidebarRail) return
                  if (!v) {
                    dualSidebarCallbacksRef.current.onExpanded?.()
                  } else {
                    dualSidebarCallbacksRef.current.onCollapsed?.()
                  }
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
                    ? 'mr-0 md:mr-16'
                    : 'ml-0 md:ml-16'
                  : isRight
                    ? 'mr-0 md:mr-56'
                    : 'ml-0 md:ml-56'
              }`}
            >
              <ParentBlockedBanner />
              <ServiceRestrictedNotice storeId={restaurantId} />
              <div
                ref={mainScrollRef}
                className="bg-white flex-1 flex flex-col min-h-0 scroll-smooth mx-main-scroll"
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </PartnerShellFrameProvider>
    </PartnerShellHeaderProvider>
  )
}
