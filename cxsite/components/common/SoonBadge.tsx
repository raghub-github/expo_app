'use client'

/**
 * Shared “Soon” pill — matches home hero unavailable services.
 */
export function SoonBadge({
  className = '',
  placement = 'corner',
}: {
  className?: string
  /** `corner` = absolute top-right overlay; `inline` = next to label */
  placement?: 'corner' | 'inline'
}) {
  const base =
    'pointer-events-none rounded bg-[#e8a317] px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-white shadow-sm sm:text-[9px]'
  if (placement === 'corner') {
    return (
      <span
        className={`absolute -right-1 -top-1 z-10 ${base} ${className}`.trim()}
        aria-hidden
      >
        Soon
      </span>
    )
  }
  return (
    <span className={`ml-1.5 inline-flex align-middle ${base} ${className}`.trim()} aria-hidden>
      Soon
    </span>
  )
}
