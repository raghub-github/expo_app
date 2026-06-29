/** Routes that show the split landing hero (home + city/area brand pages). */
export function isLandingHeroRoute(pathname: string | null): boolean {
  if (!pathname) return false

  const isLandingHome = pathname === '/'
  const isAroundYouPage =
    pathname === '/india/All/Stores' ||
    pathname === '/around-you' ||
    /^\/india\/[^/]+\/[^/]+\/All\/Stores$/.test(pathname)
  const isCityAreaRoute = pathname.split('/').filter(Boolean).length >= 2

  return isLandingHome || (isCityAreaRoute && !isAroundYouPage)
}
