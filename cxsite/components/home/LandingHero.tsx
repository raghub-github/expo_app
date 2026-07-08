'use client'

import {
  LandingHeroArcProvider,
  LandingHeroDynamicCopy,
  LandingHeroGreenContent,
  LandingHeroExploreButton,
} from '@/components/home/LandingHeroArc'
import { LandingHeroTrustedBanner } from './LandingHeroTrustedBanner'

/**
 * Full-viewport hero shell: arc content + Jupiter-style trusted strip
 * (in document flow — scrolls with the page).
 */
export default function LandingHero() {
  return (
    <LandingHeroArcProvider>
      <section className="landing-hero landing-hero--viewport" aria-label="GatiMitra services">
        <div className="landing-hero__inner">
          <div className="landing-hero__copy">
            <LandingHeroDynamicCopy />
            <LandingHeroExploreButton />
          </div>
          <div className="landing-hero__visual">
            <LandingHeroGreenContent />
          </div>
        </div>
        <LandingHeroTrustedBanner />
      </section>
    </LandingHeroArcProvider>
  )
}
