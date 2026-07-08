'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { formatTrustedBannerCount } from '@/lib/formatTrustedCount'

type TrustedCountResponse = {
  count?: number
  total?: number
}

const LOADING_COPY = 'Delivering Happiness Across India'

/**
 * Jupiter-style trust strip at the bottom of the hero.
 * Loading: “Delivering Happiness Across India”
 * Loaded: “Trusted by over {count} Indians” (live total + 2000).
 */
export function LandingHeroTrustedBanner() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    fetch('/api/platform/trusted-count', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TrustedCountResponse | null) => {
        if (cancelled || !data) return
        const raw = data.total ?? data.count
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          setCount(Math.max(0, Math.floor(raw)))
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  const ready = count != null
  const amount = ready ? formatTrustedBannerCount(count) : null

  return (
    <div className="landing-hero-trusted" role="status" aria-live="polite">
      <div className="landing-hero-trusted__inner">
        <ShieldCheck className="landing-hero-trusted__icon" size={18} strokeWidth={2.25} aria-hidden />
        <span className="landing-hero-trusted__text">
          {ready ? (
            <>
              Trusted by over <strong>{amount}</strong> Indians
            </>
          ) : (
            LOADING_COPY
          )}
        </span>
      </div>
    </div>
  )
}
