export type WebGeolocationPermission = 'undetermined' | 'granted' | 'denied'

/** Browser geolocation permission — mirrors customer app `getDeviceLocationReadiness`. */
export async function getWebGeolocationPermission(): Promise<WebGeolocationPermission> {
  if (typeof navigator === 'undefined') return 'undetermined'
  if (!navigator.permissions?.query) return 'undetermined'
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (result.state === 'granted') return 'granted'
    if (result.state === 'denied') return 'denied'
    return 'undetermined'
  } catch {
    return 'undetermined'
  }
}

export function watchWebGeolocationPermission(
  onChange: (status: WebGeolocationPermission) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return () => {}
  }
  let cancelled = false
  let permissionStatus: PermissionStatus | null = null

  void navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
    if (cancelled) return
    permissionStatus = result
    onChange(
      result.state === 'granted'
        ? 'granted'
        : result.state === 'denied'
          ? 'denied'
          : 'undetermined'
    )
    result.addEventListener('change', () => {
      onChange(
        result.state === 'granted'
          ? 'granted'
          : result.state === 'denied'
            ? 'denied'
            : 'undetermined'
      )
    })
  })

  return () => {
    cancelled = true
    permissionStatus = null
  }
}

export function resolveHeaderLocationLabel(args: {
  displayName: string
  locationSource: 'selected' | 'current' | null
  permissionStatus: WebGeolocationPermission
  loading?: boolean
}): string {
  const { displayName, locationSource, permissionStatus, loading } = args
  if (locationSource === 'selected' && displayName.trim() && displayName !== 'India') {
    return displayName
  }
  if (
    locationSource === 'current' &&
    permissionStatus === 'granted' &&
    displayName.trim() &&
    displayName !== 'India'
  ) {
    return displayName
  }
  if (loading) return 'Detecting location…'
  return 'Select location'
}
