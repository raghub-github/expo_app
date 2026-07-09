'use client'

import Link from 'next/link'
import { useGeoServiceAvailability } from '@/lib/hooks/useGeoServiceAvailability'
import { SoonBadge } from '@/components/common/SoonBadge'

export const PARCEL_SERVICE_HREF = '/courier'

type ParcelServiceControlProps = {
  /** Visible label when using default children */
  label?: string
  className?: string
  disabledClassName?: string
  children?: React.ReactNode
  /** Prefer this over default Link when parcel is enabled (e.g. service-switch nav). */
  onEnabledClick?: () => void
  /** Show Soon as inline pill next to text (nav/footer) vs absolute corner overlay. */
  badgePlacement?: 'corner' | 'inline'
  titleWhenDisabled?: string
}

/**
 * Parcel entry point: navigates only when geo parcels is on.
 * When off (same as home hero), shows Soon and blocks clicks.
 */
export default function ParcelServiceControl({
  label = 'Parcel',
  className = '',
  disabledClassName = 'cursor-not-allowed opacity-45',
  children,
  onEnabledClick,
  badgePlacement = 'inline',
  titleWhenDisabled = 'Parcel — Coming soon in your area',
}: ParcelServiceControlProps) {
  const { enabledServices } = useGeoServiceAvailability()
  const enabled = enabledServices.parcels
  const content = children ?? label

  if (enabled) {
    if (onEnabledClick) {
      return (
        <button type="button" onClick={onEnabledClick} className={className}>
          {content}
        </button>
      )
    }
    return (
      <Link href={PARCEL_SERVICE_HREF} className={className}>
        {content}
      </Link>
    )
  }

  return (
    <span
      role="link"
      aria-disabled="true"
      tabIndex={-1}
      aria-label={titleWhenDisabled}
      title={titleWhenDisabled}
      className={`relative inline-flex items-center ${disabledClassName} ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {content}
      <SoonBadge placement={badgePlacement} />
    </span>
  )
}

/** True when parcel booking is geo-enabled for the current location. */
export function useParcelServiceEnabled() {
  const { enabledServices, loading, resolved, panIndiaMode, canQuery } =
    useGeoServiceAvailability()
  return {
    enabled: enabledServices.parcels,
    loading,
    resolved,
    panIndiaMode,
    canQuery,
  }
}
