'use client'

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { useAppSelector } from '@/lib/hooks'
import ServiceSwitchModal from '@/components/auth/ServiceSwitchModal'
import type { ServiceCategory } from '@/lib/slices/authSlice'

export type LandingArcItem = {
  title: string
  /** Same asset for arc chip and large center circle */
  image: string
  href: string
  service?: ServiceCategory
}

export const LANDING_HERO_ARC_ITEMS: LandingArcItem[] = [
  {
    title: 'Food',
    image: '/img/food.png',
    href: '/order',
    service: 'food',
  },
  {
    title: 'Ride',
    image: '/img/ridecard.png',
    href: '/ride',
    service: 'person',
  },
  {
    title: 'Parcel',
    image: '/img/parcelcard.png',
    href: '/courier#parcel-form',
    service: 'parcel',
  },
  {
    title: 'Shop',
    image: '/img/ecomer.png',
    href: '/ecommerce',
  },
  {
    title: 'Deals',
    image: '/img/voucher.png',
    href: '#',
  },
  {
    title: 'Near me',
    image: '/img/loc.png',
    href: '/india/All/Stores?view=near',
  },
]

/** Copy aligned by index with `LANDING_HERO_ARC_ITEMS` */
export type LandingHeroArcCopy = {
  /** Black part of the title (one line with `line2`) */
  line1: string
  /** Green accent; shown inline after `line1` with a space */
  line2: string
  paragraphs: [string, string, string]
}

export const LANDING_HERO_ARC_COPY: LandingHeroArcCopy[] = [
  {
    line1: 'Food',
    line2: 'Delivery',
    paragraphs: [
      'At GatiMitra, we redefine everyday convenience with a seamless blend of quality, care, and reliability. From farm-fresh groceries to restaurant-quality meals, everything is curated to enhance your daily living experience.',
      'Designed for those who value time, trust, and excellence — GatiMitra delivers more than food, it delivers peace of mind.',
      'Step into a smarter, healthier, and more refined way of living.',
    ],
  },
  {
    line1: 'Book a',
    line2: 'Ride',
    paragraphs: [
      'At GatiMitra, we transform the way you travel with a perfect balance of comfort, safety, and efficiency. From daily commutes to important journeys, every ride is designed to offer a smooth and reliable experience.',
      'Built for those who value punctuality, trust, and convenience — GatiMitra delivers more than rides, it delivers confidence on every journey.',
      'Step into a smarter, faster, and more connected way of moving.',
    ],
  },
  {
    line1: 'Courier',
    line2: 'Service',
    paragraphs: [
      'At GatiMitra, we simplify logistics with speed, security, and precision. From important documents to valuable parcels, every delivery is handled with utmost care and reliability.',
      'Crafted for those who value trust, timing, and assurance — GatiMitra delivers more than parcels, it delivers reliability you can count on.',
      'Step into a smarter, safer, and more dependable way of sending.',
    ],
  },
  {
    line1: 'E-',
    line2: 'Commerce',
    paragraphs: [
      'At GatiMitra, we bring you a curated shopping experience that blends quality, affordability, and convenience. From daily essentials to lifestyle products, everything is selected to elevate your everyday living.',
      'Designed for those who value choice, trust, and seamless shopping — GatiMitra delivers more than products, it delivers satisfaction at every step.',
      'Step into a smarter, easier, and more rewarding way of shopping.',
    ],
  },
  {
    line1: 'Exclusive',
    line2: 'Deals',
    paragraphs: [
      'At GatiMitra, we bring you curated offers that pair real value with quality you can trust — from dining and rides to everyday essentials.',
      'Made for those who love smart savings without compromise — GatiMitra delivers more than discounts, it delivers rewards that fit your lifestyle.',
      'Step into a simpler way to save every time you order, ride, or shop with us.',
    ],
  },
  {
    line1: 'Explore',
    line2: 'Nearby',
    paragraphs: [
      'At GatiMitra, we connect you to everything around you with ease and precision. From local services to nearby experiences, discover what you need — exactly when you need it.',
      'Made for those who value accessibility, discovery, and convenience — GatiMitra delivers more than information, it delivers possibilities around you.',
      'Step into a smarter, closer, and more connected way of living.',
    ],
  },
]

const LANDING_HERO_ARC_INDEX_KEY = 'gatimitra:landingHeroArcIndex'

type Ctx = {
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  explore: () => void
}

const LandingHeroArcContext = createContext<Ctx | null>(null)

function useLandingHeroArc() {
  const c = useContext(LandingHeroArcContext)
  if (!c) throw new Error('LandingHeroArcProvider missing')
  return c
}

function persistLandingHeroArcIndex(index: number) {
  try {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(LANDING_HERO_ARC_INDEX_KEY, String(index))
  } catch {
    /* private mode / quota */
  }
}

export function LandingHeroArcProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isAuthenticated, currentService } = useAppSelector((s) => s.auth)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showVoucherPopup, setShowVoucherPopup] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [targetService, setTargetService] = useState<ServiceCategory>('food')
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  const pathToService: Record<string, ServiceCategory> = {
    '/order': 'food',
    '/ride': 'person',
    '/courier': 'parcel',
  }

  const pathKey = (path: string) => path.split('#')[0] || path

  const setSelectedIndexPersist = useCallback((index: number) => {
    const max = LANDING_HERO_ARC_ITEMS.length - 1
    const i = Math.min(Math.max(0, Math.floor(index)), max)
    setSelectedIndex(i)
    persistLandingHeroArcIndex(i)
  }, [])

  useLayoutEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = sessionStorage.getItem(LANDING_HERO_ARC_INDEX_KEY)
      if (raw == null) return
      const n = parseInt(raw, 10)
      if (Number.isNaN(n)) return
      const max = LANDING_HERO_ARC_ITEMS.length - 1
      const i = Math.min(Math.max(0, n), max)
      setSelectedIndex(i)
    } catch {
      /* noop */
    }
  }, [])

  const handleServiceNavigation = useCallback(
    (path: string, targetServiceOverride?: ServiceCategory) => {
      const service = targetServiceOverride || pathToService[pathKey(path)]
      if (!service) {
        router.push(path)
        return
      }
      if (!isAuthenticated || !user) {
        router.push(path)
        return
      }
      if (service === currentService) {
        router.push(path)
      } else {
        setTargetService(service)
        setPendingNavigation(path)
        setShowSwitchModal(true)
      }
    },
    [currentService, isAuthenticated, router, user]
  )

  const handleSwitchComplete = useCallback(() => {
    setShowSwitchModal(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
      setPendingNavigation(null)
    }
  }, [pendingNavigation, router])

  const explore = useCallback(() => {
    const item = LANDING_HERO_ARC_ITEMS[selectedIndex]
    if (!item) return
    persistLandingHeroArcIndex(selectedIndex)
    if (item.title === 'Deals') {
      setShowVoucherPopup(true)
      return
    }
    if (item.href === '#') return
    if (item.service) {
      handleServiceNavigation(item.href, item.service)
      return
    }
    router.push(item.href)
  }, [handleServiceNavigation, router, selectedIndex])

  const value = useMemo(
    () => ({ selectedIndex, setSelectedIndex: setSelectedIndexPersist, explore }),
    [explore, selectedIndex, setSelectedIndexPersist]
  )

  return (
    <LandingHeroArcContext.Provider value={value}>
      {children}
      {showVoucherPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="animate-popupScale relative max-w-[420px] rounded-[22px] bg-white p-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              onClick={() => setShowVoucherPopup(false)}
              className="absolute right-[22px] top-[18px] cursor-pointer text-2xl text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
            <h2 className="mb-3 text-2xl text-purple">Coming Soon 🚀</h2>
            <p className="text-[15px] leading-relaxed text-gray-600">
              We&apos;re working on exciting deals & vouchers.
              <br />
              This feature will be live very soon on GatiMitra.
            </p>
            <button
              type="button"
              onClick={() => setShowVoucherPopup(false)}
              className="mt-5 cursor-pointer rounded-[30px] border-none bg-gradient-to-br from-pink to-purple px-7 py-3 font-semibold text-white hover:shadow-lg"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <ServiceSwitchModal
        isOpen={showSwitchModal}
        onClose={() => {
          setShowSwitchModal(false)
          setPendingNavigation(null)
        }}
        targetService={targetService}
        onContinue={handleSwitchComplete}
      />
    </LandingHeroArcContext.Provider>
  )
}

function arcPositions(count: number, radiusPx: number, startDeg: number, endDeg: number) {
  const start = (startDeg * Math.PI) / 180
  const end = (endDeg * Math.PI) / 180
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const a = start + (end - start) * t
    return {
      x: Math.cos(a) * radiusPx,
      y: Math.sin(a) * radiusPx,
    }
  })
}

/** Light hero column: centered plate, arc + quick chips, leaves (no full green panel / no social row) */
/** Original viewport curve — matches the tighter, attractive arc in the reference design */
function radiusFromViewportWidth(vw: number): number {
  if (vw >= 1024) {
    return Math.min(248, Math.max(168, Math.round(vw * 0.11)))
  }
  return Math.min(200, Math.max(140, Math.round(vw * 0.36)))
}

/**
 * SSR + first client frame must match to avoid a visible jump before hydration.
 * 1024px is the lg breakpoint where the desktop radius formula applies (minimum 168).
 */
function initialArcRadiusForSSR(): number {
  return radiusFromViewportWidth(1024)
}

export function LandingHeroGreenContent() {
  const { selectedIndex, setSelectedIndex } = useLandingHeroArc()
  const containerRef = useRef<HTMLDivElement>(null)
  const [radius, setRadius] = useState(initialArcRadiusForSSR)
  const item = LANDING_HERO_ARC_ITEMS[selectedIndex] ?? LANDING_HERO_ARC_ITEMS[0]

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const vw = document.documentElement.clientWidth
      const next = radiusFromViewportWidth(vw)
      setRadius((prev) => (Math.abs(prev - next) <= 1 ? prev : next))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  /** Arc on the left of center (half-moon toward grey column) — same side as white guide line */
  const startDeg = 108
  const endDeg = 252

  const positions = useMemo(
    () => arcPositions(LANDING_HERO_ARC_ITEMS.length, radius, startDeg, endDeg),
    [radius]
  )

  const svgArc = useMemo(() => {
    const r = radius
    const a1 = (startDeg * Math.PI) / 180
    const a2 = (endDeg * Math.PI) / 180
    const x1 = r * Math.cos(a1)
    const y1 = r * Math.sin(a1)
    const x2 = r * Math.cos(a2)
    const y2 = r * Math.sin(a2)
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }, [radius])

  return (
    <div className="relative z-[2] flex min-h-[min(380px,64vh)] w-full max-w-full items-center justify-center overflow-visible px-0 py-6 sm:py-8 lg:min-h-[min(520px,76vh)] lg:py-10">
      <div
        ref={containerRef}
        className="relative flex aspect-square w-[min(88vw,420px)] max-w-full items-center justify-center sm:w-[min(82vw,460px)] lg:w-[min(36vw,400px)]"
      >
        {/* Arc + quick cards — circle center = plate center */}
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center overflow-visible">
          <div
            className="pointer-events-auto relative h-0 w-0"
            role="navigation"
            aria-label="Quick services"
          >
            <svg
              width={radius * 2 + 80}
              height={radius * 2 + 80}
              viewBox={`${-radius - 40} ${-radius - 40} ${radius * 2 + 80} ${radius * 2 + 80}`}
              className="pointer-events-none absolute overflow-visible opacity-[0.98] drop-shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
              style={{
                left: -(radius + 40),
                top: -(radius + 40),
              }}
              aria-hidden
            >
              <path
                d={svgArc}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            {LANDING_HERO_ARC_ITEMS.map((arcItem, i) => {
              const { x, y } = positions[i]
              const active = i === selectedIndex
              return (
                <button
                  key={arcItem.title}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  title={arcItem.title}
                  className={`absolute flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#109D4C] sm:h-[52px] sm:w-[52px] md:h-[56px] md:w-[56px] ${
                    active
                      ? 'ring-[3px] ring-[#c4a574] ring-offset-[3px] ring-offset-[#f2f2f2] scale-105 shadow-[0_8px_24px_rgba(0,0,0,0.16)]'
                      : 'ring-1 ring-[#dcdce2] hover:scale-105 hover:shadow-lg'
                  }`}
                  style={{ left: x, top: y }}
                >
                  <img
                    src={arcItem.image}
                    alt=""
                    width={40}
                    height={40}
                    decoding="async"
                    className="h-[28px] w-[28px] object-contain sm:h-[32px] sm:w-[32px] md:h-[34px] md:w-[34px]"
                  />
                  <span className="sr-only">{arcItem.title}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main circle — animate on service switch */}
        <div key={`hero-image-wrap-${selectedIndex}`} className="hero-image-swap-in relative z-[3] flex items-center justify-center">
          <img
            key={`hero-image-${selectedIndex}`}
            src={item.image}
            alt={item.title}
            width={512}
            height={512}
            decoding="async"
            fetchPriority="high"
            className="aspect-square w-[min(62vw,260px)] rounded-full border-[6px] border-white bg-white object-contain p-3 shadow-[0_24px_50px_rgba(0,0,0,0.14)] sm:w-[min(58vw,300px)] lg:w-[min(28vw,320px)]"
          />
        </div>

        {/* Decorative leaves */}
        <svg
          className="pointer-events-none absolute -right-1 top-[10%] z-[2] hidden h-16 w-12 text-[#0d7a3d] opacity-90 drop-shadow-md sm:block"
          viewBox="0 0 60 80"
          fill="currentColor"
          aria-hidden
        >
          <path d="M45 5 C20 25 5 55 15 78 C35 50 50 30 45 5Z" />
        </svg>
        <svg
          className="pointer-events-none absolute bottom-[6%] -left-3 z-[2] h-24 w-16 text-[#0c6e36] opacity-88 drop-shadow-lg lg:-left-6"
          viewBox="0 0 80 100"
          fill="currentColor"
          aria-hidden
        >
          <path d="M60 0 C15 40 0 85 25 100 C55 70 70 35 60 0Z" />
        </svg>
        <svg
          className="pointer-events-none absolute top-[20%] -right-2 z-[2] hidden h-12 w-9 text-[#0c6e36] opacity-75 drop-shadow-md md:block"
          viewBox="0 0 50 70"
          fill="currentColor"
          aria-hidden
        >
          <path d="M38 2 C12 22 2 52 12 70 C32 48 44 28 38 2Z" />
        </svg>
      </div>
    </div>
  )
}

export function LandingHeroDynamicCopy() {
  const { selectedIndex } = useLandingHeroArc()
  const copy =
    LANDING_HERO_ARC_COPY[selectedIndex] ?? LANDING_HERO_ARC_COPY[0]

  return (
    <div key={`hero-copy-${selectedIndex}`} className="hero-swap-in min-w-0 antialiased text-left">
      <h1 className="hero-stagger-heading m-0 max-w-none text-balance text-[clamp(1.875rem,3.25vw+0.75rem,2.875rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-neutral-950">
        {copy.line2 ? (
          <>
            <span className="text-neutral-950">{copy.line1}</span>
            {!copy.line1.endsWith('-') ? ' ' : null}
            <span className="text-[#109D4C]">{copy.line2}</span>
          </>
        ) : (
          copy.line1
        )}
      </h1>
      <div className="hero-stagger-paragraphs mt-7 max-w-[min(100%,34rem)] space-y-5 text-[0.9375rem] font-normal leading-[1.72] text-neutral-600 sm:mt-8 sm:space-y-6 sm:text-base sm:leading-[1.75] lg:mt-9 lg:leading-[1.78]">
        {copy.paragraphs.map((p, i) => (
          <p key={i} className="m-0 text-pretty">
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}

export function LandingHeroExploreButton({
  className = '',
}: {
  className?: string
}) {
  const { explore, selectedIndex } = useLandingHeroArc()
  return (
    <button
      key={`hero-explore-${selectedIndex}`}
      type="button"
      onClick={explore}
      className={`hero-stagger-button cta-clickable-pulse mt-6 bg-[#109D4C] text-white font-bold text-[14px] sm:mt-7 sm:text-[15px] tracking-[0.08em] px-9 sm:px-11 py-3.5 rounded-[10px] shadow-[0_10px_28px_rgba(16,157,76,0.4)] hover:brightness-[1.05] transition-all uppercase ${className}`}
    >
      Explore More
    </button>
  )
}
