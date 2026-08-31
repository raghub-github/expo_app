'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const HIDE_SCROLLBAR =
  'overflow-x-auto scroll-smooth overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

type Props = {
  children: ReactNode
  className?: string
  innerClassName?: string
  title?: ReactNode
  /** Arrows above the track, right-aligned (category bar). */
  navCompact?: boolean
}

export default function GroceryScrollArrows({
  children,
  className = '',
  innerClassName = '',
  title,
  navCompact = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const ignoreScrollSyncUntil = useRef(0)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const width = el.clientWidth
    if (width <= 0) return
    const pages = Math.max(1, Math.ceil(el.scrollWidth / width))
    setTotalPages(pages)
    if (Date.now() >= ignoreScrollSyncUntil.current) {
      const next = Math.round(el.scrollLeft / width)
      const clamped = Math.max(0, Math.min(pages - 1, next))
      pageRef.current = clamped
      setPage(clamped)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [update, children])

  const scrollToPage = (nextPage: number) => {
    const el = ref.current
    if (!el) return
    const width = el.clientWidth
    if (width <= 0) return
    const clamped = Math.max(0, Math.min(totalPages - 1, nextPage))
    ignoreScrollSyncUntil.current = Date.now() + 480
    pageRef.current = clamped
    setPage(clamped)
    el.scrollTo({ left: clamped * width, behavior: 'smooth' })
  }

  const showNav = totalPages > 1

  const navButtons = showNav ? (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={() => scrollToPage(page - 1)}
        disabled={page === 0}
        aria-label="Scroll left"
        className={`top-picks-nav-btn ${
          page === 0 ? 'top-picks-nav-btn--disabled' : 'top-picks-nav-btn--enabled'
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollToPage(page + 1)}
        disabled={page >= totalPages - 1}
        aria-label="Scroll right"
        className={`top-picks-nav-btn ${
          page >= totalPages - 1
            ? 'top-picks-nav-btn--disabled'
            : 'top-picks-nav-btn--enabled'
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : null

  const showHeader = Boolean(title) || (navCompact && showNav)

  return (
    <div className={className}>
      {showHeader ? (
        <div
          className={`flex items-center gap-4 ${
            navCompact
              ? 'justify-end px-2 pb-1 pt-1.5 sm:px-3'
              : 'mb-4 justify-between'
          }`}
        >
          {title ? <div className="min-w-0 flex-1">{title}</div> : null}
          {navButtons}
        </div>
      ) : title ? (
        <div className="mb-4">{title}</div>
      ) : null}
      <div ref={ref} className={`${HIDE_SCROLLBAR} ${innerClassName}`}>
        {children}
      </div>
    </div>
  )
}
