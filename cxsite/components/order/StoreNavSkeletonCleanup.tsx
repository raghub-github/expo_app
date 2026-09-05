'use client'

import { useEffect, useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { hideStoreNavSkeleton, hideStoreNavSkeletonIfNotInnerPage } from '@/lib/storeNavSkeleton'

/** Never leave the store-click overlay sitting on /order after back. */
export default function StoreNavSkeletonCleanup() {
  const pathname = usePathname()

  useLayoutEffect(() => {
    if (!pathname.startsWith('/restaurant/')) hideStoreNavSkeleton()
  }, [pathname])

  useEffect(() => {
    const hide = () => hideStoreNavSkeletonIfNotInnerPage()
    window.addEventListener('popstate', hide)
    window.addEventListener('pageshow', hide)
    return () => {
      window.removeEventListener('popstate', hide)
      window.removeEventListener('pageshow', hide)
    }
  }, [])

  return null
}
