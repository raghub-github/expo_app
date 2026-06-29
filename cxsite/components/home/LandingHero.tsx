'use client'

import {
  LandingHeroArcProvider,
  LandingHeroDynamicCopy,
  LandingHeroGreenContent,
  LandingHeroExploreButton,
} from '@/components/home/LandingHeroArc'

export default function LandingHero() {
  return (
    <LandingHeroArcProvider>
      <section className="landing-hero" aria-label="GatiMitra services">
        <div className="landing-hero__inner">
          <div className="landing-hero__copy">
            <LandingHeroDynamicCopy />
            <LandingHeroExploreButton />
          </div>
          <div className="landing-hero__visual">
            <LandingHeroGreenContent />
          </div>
        </div>
      </section>
    </LandingHeroArcProvider>
  )
}
