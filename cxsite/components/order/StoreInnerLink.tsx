'use client'

import { type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { showStoreNavSkeleton } from '@/lib/storeNavSkeleton'

type StoreInnerLinkProps = {
  href: string
  className?: string
  children: ReactNode
  prefetch?: boolean
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
}

const prefetched = new Set<string>()

function prefetchStoreInner(href: string, router: ReturnType<typeof useRouter>) {
  if (!href || href === '#' || typeof window === 'undefined') return
  if (prefetched.has(href)) return
  prefetched.add(href)
  try {
    void router.prefetch(href)
  } catch {
    prefetched.delete(href)
  }
  const abs = href.startsWith('http') ? href : `${window.location.origin}${href}`
  void fetch(abs, { credentials: 'same-origin' }).catch(() => {
    /* keep router prefetch */
  })
}

/**
 * Store-card navigation that paints a visible skeleton immediately,
 * then client-routes so /order stays in memory (category photos stay loaded).
 */
export default function StoreInnerLink({
  href,
  className,
  children,
  prefetch = true,
  onClick,
}: StoreInnerLinkProps) {
  const router = useRouter()

  const warm = () => {
    if (prefetch) prefetchStoreInner(href, router)
  }

  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (!href || href === '#') return
    e.preventDefault()
    showStoreNavSkeleton()
    router.push(href)
  }

  return (
    <a
      href={href}
      className={className}
      onClick={go}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
    >
      {children}
    </a>
  )
}
