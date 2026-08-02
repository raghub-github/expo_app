'use client'

import Link from 'next/link'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'

/** Minimal header — GatiMitra logo only (sitemap coverage page). */
export default function SitemapLogoHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:h-16 sm:px-6">
        <Link href="/" className="inline-flex items-center" aria-label="GatiMitra home">
          <GatiMitraLogo
            variant="withName"
            className="h-8 w-auto sm:h-9"
            height={36}
            fetchPriority="high"
          />
        </Link>
      </div>
    </header>
  )
}
