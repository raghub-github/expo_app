'use client'

/**
 * Shown when the user has set a location but no restaurants are within the service radius.
 */
type Props = {
  onTryDifferentLocation?: () => void
}

export default function OrderNoServiceArea({ onTryDifferentLocation }: Props) {
  return (
    <section
      className="flex min-h-[calc(100svh-7.5rem)] animate-in fade-in duration-500 flex-col"
      aria-labelledby="no-service-heading"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
        <div className="flex w-full max-w-[min(96vw,880px)] flex-1 flex-col items-center">
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 sm:gap-6">
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

            <div className="flex w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- synced public/img asset */}
              <img
                src="/img/bikeride-phone.png"
                alt=""
                className="mx-auto h-auto w-full max-w-[min(92vw,420px)] object-contain object-center sm:max-w-[min(80vw,480px)]"
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </div>

          {onTryDifferentLocation ? (
            <div className="mt-auto w-full pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-10 sm:pb-4">
              <button
                type="button"
                onClick={onTryDifferentLocation}
                className="mx-auto flex w-fit max-w-full items-center justify-center rounded-full border-2 border-[#16c2a5] bg-white px-6 py-3 text-sm font-semibold text-[#16c2a5] shadow-sm transition hover:bg-[#16c2a5]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16c2a5]/40"
              >
                Try a different location
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
