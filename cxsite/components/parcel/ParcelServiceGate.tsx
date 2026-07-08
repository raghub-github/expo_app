'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGeoServiceAvailability } from '@/lib/hooks/useGeoServiceAvailability'

/**
 * Blocks /courier and /parcel when parcel is not geo-enabled
 * (same rule as the home hero Soon chip).
 */
export default function ParcelServiceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { enabledServices, loading, resolved, panIndiaMode, canQuery } =
    useGeoServiceAvailability()

  const shouldRedirect =
    panIndiaMode ||
    !canQuery ||
    (resolved && !enabledServices.parcels)

  useEffect(() => {
    if (shouldRedirect) {
      router.replace('/')
    }
  }, [shouldRedirect, router])

  if (shouldRedirect) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#F8FAF9] text-sm text-gray-600">
        Parcel is not available in your area yet.
      </div>
    )
  }

  if (loading && !resolved) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#F8FAF9] text-sm text-gray-600">
        Checking parcel availability…
      </div>
    )
  }

  if (!enabledServices.parcels) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#F8FAF9] text-sm text-gray-600">
        Parcel is not available in your area yet.
      </div>
    )
  }

  return <>{children}</>
}
