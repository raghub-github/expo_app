'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import AppAssetImage from '@/components/common/AppAssetImage'
import { CX } from '@/lib/appAssetKeys'
import {
  Bike,
  CalendarClock,
  Compass,
  Package,
  Salad,
  Star,
  Tag,
  UtensilsCrossed,
} from 'lucide-react'

const ORBIT_FEATURES = [
  { icon: Salad, label: 'Veg mode', angle: -90, tone: 'healthy' },
  { icon: Tag, label: 'Offers', angle: -39, tone: 'offers' },
  { icon: Package, label: 'Parcel', angle: 13, tone: 'gift' },
  { icon: UtensilsCrossed, label: 'Food', angle: 64, tone: 'food' },
  { icon: Bike, label: 'Ride', angle: 116, tone: 'ride' },
  { icon: Star, label: 'Top Picks', angle: 167, tone: 'picks' },
  { icon: Compass, label: 'Discover more', angle: -141, tone: 'party' },
] as const

const SHOWCASE_SLIDES = [
  'Our app is packed with features that enable you to experience food delivery like never before.',
  'Switch to Veg mode and explore curated vegetarian picks from restaurants you love.',
  'Book quick rides, send parcels, and track everything live — all in one place.',
  'Grab exclusive offers, schedule orders ahead, and discover more every single day.',
] as const

const TYPING_MS = 34
const DELETING_MS = 22
const PAUSE_MS = 2400

export default function LandingAppShowcase() {
  const [slideIndex, setSlideIndex] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const goToSlide = useCallback((index: number) => {
    setSlideIndex(index % SHOWCASE_SLIDES.length)
    setDisplayText('')
    setIsDeleting(false)
  }, [])

  useEffect(() => {
    const fullText = SHOWCASE_SLIDES[slideIndex]
    let timeoutId: ReturnType<typeof setTimeout>

    if (!isDeleting && displayText === fullText) {
      timeoutId = setTimeout(() => setIsDeleting(true), PAUSE_MS)
    } else if (isDeleting && displayText === '') {
      timeoutId = setTimeout(() => {
        setSlideIndex((prev) => (prev + 1) % SHOWCASE_SLIDES.length)
        setIsDeleting(false)
      }, 280)
    } else {
      timeoutId = setTimeout(() => {
        const nextLength = isDeleting ? displayText.length - 1 : displayText.length + 1
        setDisplayText(fullText.slice(0, nextLength))
      }, isDeleting ? DELETING_MS : TYPING_MS)
    }

    return () => clearTimeout(timeoutId)
  }, [displayText, isDeleting, slideIndex])

  return (
    <section className="landing-app-showcase" aria-labelledby="landing-app-showcase-heading">
      <div className="landing-app-showcase__blobs" aria-hidden>
        <div className="landing-app-showcase__blob landing-app-showcase__blob--tl" />
        <div className="landing-app-showcase__blob landing-app-showcase__blob--tr" />
        <div className="landing-app-showcase__blob landing-app-showcase__blob--bl" />
      </div>

      <div className="landing-app-showcase__inner">
        <div className="landing-app-showcase__copy">
          <h2
            id="landing-app-showcase-heading"
            className="landing-app-showcase__title font-[family-name:var(--font-montserrat)]"
          >
            <span className="landing-app-showcase__title-line">One App,</span>
            <span className="landing-app-showcase__title-line landing-app-showcase__title-accent">
              Endless Convenience.
            </span>
          </h2>
          <span className="landing-app-showcase__rule" aria-hidden />
          <p className="landing-app-showcase__lead" aria-live="polite">
            <span className="landing-app-showcase__lead-text">{displayText}</span>
            <span className="landing-app-showcase__lead-cursor" aria-hidden />
          </p>
          <div className="landing-app-showcase__dots" role="tablist" aria-label="App showcase slides">
            {SHOWCASE_SLIDES.map((_, index) => (
              <button
                key={SHOWCASE_SLIDES[index]}
                type="button"
                role="tab"
                aria-selected={slideIndex === index}
                aria-label={`Slide ${index + 1}`}
                className={`landing-app-showcase__dot${slideIndex === index ? ' landing-app-showcase__dot--active' : ''}`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        </div>

        <div className="landing-app-showcase__stage">
          <svg className="landing-app-showcase__orbit-ring" viewBox="0 0 420 420" aria-hidden>
            <circle cx="210" cy="210" r="198" className="landing-app-showcase__orbit-path" />
          </svg>

          <ul className="landing-app-showcase__orbit-list" aria-label="App features">
            {ORBIT_FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <li
                  key={item.label}
                  className="landing-app-showcase__orbit-item"
                  style={{ '--orbit-angle': `${item.angle}deg` } as CSSProperties}
                >
                  <div className="landing-app-showcase__orbit-card">
                    <span className={`landing-app-showcase__orbit-icon landing-app-showcase__orbit-icon--${item.tone}`}>
                      <Icon size={20} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="landing-app-showcase__orbit-label">{item.label}</span>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="landing-app-showcase__phone-wrap">
            <div className="landing-app-showcase__phone">
              <div className="landing-app-showcase__phone-side landing-app-showcase__phone-side--left" aria-hidden />
              <div className="landing-app-showcase__phone-side landing-app-showcase__phone-side--right" aria-hidden />
              <div className="landing-app-showcase__phone-body">
                <div className="landing-app-showcase__phone-screen">
                  <div className="landing-app-showcase__phone-island" aria-hidden />
                  <div className="landing-app-showcase__phone-status" aria-hidden>
                    <span className="landing-app-showcase__phone-time">9:41</span>
                    <span className="landing-app-showcase__phone-status-icons">
                      <span className="landing-app-showcase__phone-signal">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className="landing-app-showcase__phone-battery" />
                    </span>
                  </div>

                  <div className="landing-app-showcase__phone-appbar">
                    <span className="landing-app-showcase__phone-appname">GatiMitra</span>
                  </div>

                  <div className="landing-app-showcase__phone-content">
                    <div className="landing-app-showcase__phone-content-bg" aria-hidden>
                      <span className="landing-app-showcase__phone-glow landing-app-showcase__phone-glow--tl" />
                      <span className="landing-app-showcase__phone-glow landing-app-showcase__phone-glow--br" />
                    </div>
                    <AppAssetImage
                      assetKey={CX.home.brandBanner}
                      alt="GatiMitra delivery bike"
                      className="landing-app-showcase__phone-bike"
                      decoding="async"
                      fetchPriority="high"
                    />
                  </div>

                  <div className="landing-app-showcase__phone-schedule">
                    <span className="landing-app-showcase__phone-schedule-icon">
                      <CalendarClock size={13} strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="landing-app-showcase__phone-schedule-label">Schedule your order</span>
                  </div>

                  <div className="landing-app-showcase__phone-home" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
