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
        {/* Soft 3D atmosphere — keep left/ambient depth; no orb behind the arc */}
        <div className="landing-hero-3d-bg" aria-hidden>
          <div className="landing-hero-3d-bg__watermarks">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="landing-hero-3d-bg__watermark">
                GatiMitra
              </span>
            ))}
          </div>
          <span className="landing-hero-3d-bg__orb landing-hero-3d-bg__orb--b" />
          <span className="landing-hero-3d-bg__orb landing-hero-3d-bg__orb--c" />
          <span className="landing-hero-3d-bg__orb landing-hero-3d-bg__orb--e" />
          <span className="landing-hero-3d-bg__ring landing-hero-3d-bg__ring--b" />
          <span className="landing-hero-3d-bg__grid" />
          <span className="landing-hero-3d-bg__glow" />
        </div>

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
