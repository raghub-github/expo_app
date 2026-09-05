const SKEL_ID = 'gm-store-nav-skel'

export function storePageSkeletonMarkup(): string {
  return `
    <div class="gm-inner-skel" aria-busy="true">
      <div class="gm-inner-skel__header">
        <div class="gm-inner-skel__wrap">
          <div class="gm-skel-bar gm-inner-skel__crumb"></div>
          <div class="gm-inner-skel__title-row">
            <div class="gm-skel-bar gm-inner-skel__title"></div>
            <div class="gm-skel-bar gm-inner-skel__rating"></div>
          </div>
          <div class="gm-skel-bar gm-inner-skel__meta"></div>
          <div class="gm-skel-bar gm-inner-skel__meta gm-inner-skel__meta--short"></div>
          <div class="gm-inner-skel__chips">
            <div class="gm-skel-bar gm-inner-skel__chip"></div>
            <div class="gm-skel-bar gm-inner-skel__chip"></div>
            <div class="gm-skel-bar gm-inner-skel__chip"></div>
          </div>
          <div class="gm-inner-skel__tabs">
            <div class="gm-skel-bar gm-inner-skel__tab gm-inner-skel__tab--on"></div>
            <div class="gm-skel-bar gm-inner-skel__tab"></div>
            <div class="gm-skel-bar gm-inner-skel__tab"></div>
            <div class="gm-skel-bar gm-inner-skel__tab"></div>
          </div>
        </div>
      </div>
      <div class="gm-inner-skel__wrap gm-inner-skel__body">
        <div class="gm-inner-skel__mosaic">
          <div class="gm-skel-bar gm-inner-skel__hero"></div>
          <div class="gm-skel-bar gm-inner-skel__tile"></div>
          <div class="gm-skel-bar gm-inner-skel__tile gm-inner-skel__tile--mid"></div>
          <div class="gm-skel-bar gm-inner-skel__side"></div>
        </div>
        <div class="gm-inner-skel__item"><div class="gm-skel-bar gm-inner-skel__thumb"></div><div class="gm-inner-skel__lines"><div class="gm-skel-bar gm-inner-skel__line"></div><div class="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short"></div></div></div>
        <div class="gm-inner-skel__item"><div class="gm-skel-bar gm-inner-skel__thumb"></div><div class="gm-inner-skel__lines"><div class="gm-skel-bar gm-inner-skel__line"></div><div class="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short"></div></div></div>
        <div class="gm-inner-skel__item"><div class="gm-skel-bar gm-inner-skel__thumb"></div><div class="gm-inner-skel__lines"><div class="gm-skel-bar gm-inner-skel__line"></div><div class="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short"></div></div></div>
        <div class="gm-inner-skel__item"><div class="gm-skel-bar gm-inner-skel__thumb"></div><div class="gm-inner-skel__lines"><div class="gm-skel-bar gm-inner-skel__line"></div><div class="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short"></div></div></div>
        <div class="gm-inner-skel__item"><div class="gm-skel-bar gm-inner-skel__thumb"></div><div class="gm-inner-skel__lines"><div class="gm-skel-bar gm-inner-skel__line"></div><div class="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short"></div></div></div>
      </div>
    </div>
  `
}

export function showStoreNavSkeleton(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(SKEL_ID)) return
  const wrap = document.createElement('div')
  wrap.id = SKEL_ID
  wrap.setAttribute('aria-busy', 'true')
  wrap.setAttribute('aria-live', 'polite')
  wrap.innerHTML = storePageSkeletonMarkup()
  document.body.appendChild(wrap)
}

export function hideStoreNavSkeleton(): void {
  if (typeof document === 'undefined') return
  document.getElementById(SKEL_ID)?.remove()
}

/** Instant hide when the URL is no longer a store inner page (back / cancel). */
export function hideStoreNavSkeletonIfNotInnerPage(): void {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/restaurant/')) {
    hideStoreNavSkeleton()
  }
}
