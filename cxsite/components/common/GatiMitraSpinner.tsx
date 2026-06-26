'use client'

type GatiMitraSpinnerProps = {
  /** Short line under the logo (optional) */
  message?: string
  className?: string
}

/**
 * Branded loader: dual-ring animation + center logo (matches restaurant list loading style).
 */
export default function GatiMitraSpinner({ message = 'Checking restaurants near you…', className = '' }: GatiMitraSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative mx-auto h-24 w-24 shrink-0 sm:h-28 sm:w-28">
        <div className="absolute inset-0 rounded-full border-[3px] border-[#16c2a5]/35 border-t-[#16c2a5] animate-spin" />
        <div
          className="absolute inset-[9px] rounded-full border-[3px] border-[#ff6b35]/25 border-r-[#ff6b35] animate-spin sm:inset-[10px]"
          style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/img/logo.png" alt="" className="h-11 w-auto max-w-[56px] object-contain sm:h-12 sm:max-w-[64px]" aria-hidden />
        </div>
      </div>
      {message ? (
        <p className="mt-5 max-w-xs text-center text-sm font-medium text-slate-500">{message}</p>
      ) : null}
    </div>
  )
}
