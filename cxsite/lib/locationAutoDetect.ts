import type { DetectCurrentLocationResult } from '@/lib/detectCurrentLocation'

export function locationAutoDetectErrorMessage(
  result: Extract<DetectCurrentLocationResult, { ok: false }>
): string {
  if (result.reason === 'denied') {
    return 'Location access is blocked. Click the lock icon in your browser address bar, allow Location, refresh this page, then try again.'
  }
  if (result.reason === 'unsupported') {
    return 'This browser does not support location detection. Please enter your address manually.'
  }
  return 'Could not detect your location. Try again or enter your address manually.'
}
