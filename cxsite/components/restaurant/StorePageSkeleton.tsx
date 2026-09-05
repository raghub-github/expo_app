'use client'

import { useLayoutEffect } from 'react'
import { hideStoreNavSkeleton } from '@/lib/storeNavSkeleton'

function InnerStoreSkeleton() {
  return (
    <div className="gm-inner-skel" aria-busy="true" aria-live="polite">
      <div className="gm-inner-skel__header">
        <div className="gm-inner-skel__wrap">
          <div className="gm-skel-bar gm-inner-skel__crumb" />
          <div className="gm-inner-skel__title-row">
            <div className="gm-skel-bar gm-inner-skel__title" />
            <div className="gm-skel-bar gm-inner-skel__rating" />
          </div>
          <div className="gm-skel-bar gm-inner-skel__meta" />
          <div className="gm-skel-bar gm-inner-skel__meta gm-inner-skel__meta--short" />
          <div className="gm-inner-skel__chips">
            <div className="gm-skel-bar gm-inner-skel__chip" />
            <div className="gm-skel-bar gm-inner-skel__chip" />
            <div className="gm-skel-bar gm-inner-skel__chip" />
          </div>
          <div className="gm-inner-skel__tabs">
            <div className="gm-skel-bar gm-inner-skel__tab gm-inner-skel__tab--on" />
            <div className="gm-skel-bar gm-inner-skel__tab" />
            <div className="gm-skel-bar gm-inner-skel__tab" />
            <div className="gm-skel-bar gm-inner-skel__tab" />
          </div>
        </div>
      </div>
      <div className="gm-inner-skel__wrap gm-inner-skel__body">
        <div className="gm-inner-skel__mosaic">
          <div className="gm-skel-bar gm-inner-skel__hero" />
          <div className="gm-skel-bar gm-inner-skel__tile" />
          <div className="gm-skel-bar gm-inner-skel__tile gm-inner-skel__tile--mid" />
          <div className="gm-skel-bar gm-inner-skel__side" />
        </div>
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} className="gm-inner-skel__item">
            <div className="gm-skel-bar gm-inner-skel__thumb" />
            <div className="gm-inner-skel__lines">
              <div className="gm-skel-bar gm-inner-skel__line" />
              <div className="gm-skel-bar gm-inner-skel__line gm-inner-skel__line--short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StorePageSkeleton() {
  useLayoutEffect(() => {
    hideStoreNavSkeleton()
  }, [])

  return <InnerStoreSkeleton />
}
