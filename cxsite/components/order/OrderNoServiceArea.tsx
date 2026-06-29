'use client'

import AppAssetImage from '@/components/common/AppAssetImage'
import { CX } from '@/lib/appAssetKeys'

/**
 * Shown when the user has set a location but no restaurants are within the service radius.
 * Illustration from CMS (same pipeline as customer app home assets).
 */
type Props = {
  onTryDifferentLocation?: () => void
}

export default function OrderNoServiceArea({ onTryDifferentLocation }: Props) {
  return (
    <section className="animate-in fade-in duration-500" aria-labelledby="no-service-heading">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex w-full max-w-[min(96vw,880px)] flex-col items-center gap-4 sm:gap-5">
          <div className="w-full max-w-xl px-1 text-center">
            <h2
              id="no-service-heading"
              className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-[1.65rem]"
            >
              Coming Soon to Your Area!
            </h2>
            <p className="mt-2.5 text-sm font-medium leading-relaxed text-amber-900 sm:mt-3 sm:text-base md:text-lg">
              GatiMitra isn&apos;t available here yet, but we&apos;re working hard to serve you soon.
            </p>
          </div>
          <div className="flex w-full max-h-[min(52vh,calc(100svh-20rem))] items-center justify-center overflow-hidden sm:max-h-[min(56vh,calc(100svh-16rem))] md:max-h-[min(58vh,calc(100svh-14rem))]">
            <AppAssetImage
              assetKey={CX.home.brandBanner}
              alt=""
              className="mx-auto h-auto max-h-full w-full max-w-[min(100%,680px)] object-contain object-center drop-shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          {onTryDifferentLocation ? (
            <button
              type="button"
              onClick={onTryDifferentLocation}
              className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 inline-flex w-fit max-w-full shrink-0 items-center justify-center self-center rounded-full border-2 border-[#16c2a5] bg-[#f5f5f5] px-6 py-3 text-sm font-semibold text-[#16c2a5] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] transition hover:bg-[#16c2a5]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16c2a5]/40 sm:static sm:bg-white sm:shadow-sm"
            >
              Try a different location
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
