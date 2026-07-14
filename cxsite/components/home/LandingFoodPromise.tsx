'use client'

import Image from 'next/image'
import {
  Bike,
  MapPin,
  Package,
  Percent,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import AppAssetImage from '@/components/common/AppAssetImage'
import { CX } from '@/lib/appAssetKeys'

const SERVICE_CARDS = [
  { icon: UtensilsCrossed, label: 'Delicious Food' },
  { icon: Bike, label: 'Quick Rides' },
  { icon: Package, label: 'Parcel Delivery' },
  { icon: Percent, label: 'Exclusive Offers' },
] as const

const FLOAT_BADGES = [
  { icon: Bike, text: 'Fast Delivery At Your Doorstep', className: 'landing-food-promise__badge--fast' },
  { icon: Users, text: 'Loved by Millions', className: 'landing-food-promise__badge--loved' },
  { icon: ShieldCheck, text: 'Safe & Reliable Every Step', className: 'landing-food-promise__badge--safe' },
  { icon: Percent, text: 'Great Offers Everyday', className: 'landing-food-promise__badge--offers' },
] as const

/**
 * Full-viewport brand story — split layout matching marketing reference.
 */
export default function LandingFoodPromise() {
  return (
    <section className="landing-food-promise" aria-labelledby="landing-food-promise-heading">
      <div className="landing-food-promise__inner">
        {/* Left — copy & CTAs */}
        <div className="landing-food-promise__content">
          <span className="landing-food-promise__eyebrow">
            <Sparkles className="landing-food-promise__eyebrow-icon" size={15} strokeWidth={2.25} aria-hidden />
            One app. Every journey.
          </span>

          <h2
            id="landing-food-promise-heading"
            className="landing-food-promise__title font-[family-name:var(--font-montserrat)]"
          >
            Life Moves Better With{' '}
            <span className="landing-food-promise__title-accent">GatiMitra</span>
          </h2>

          <p className="landing-food-promise__lead">
            Food on your table, rides when you need them, parcels at your door — everything you need for everyday life,
            delivered with speed, care, and trust.
          </p>

          <ul className="landing-food-promise__service-grid" aria-label="GatiMitra services">
            {SERVICE_CARDS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label} className="landing-food-promise__service-card">
                  <span className="landing-food-promise__service-icon" aria-hidden>
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="landing-food-promise__service-label">{item.label}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Right — visual composition */}
        <div className="landing-food-promise__visual" aria-hidden={false}>
          <div className="landing-food-promise__visual-bg" aria-hidden>
            <div className="landing-food-promise__blob landing-food-promise__blob--tl" />
            <div className="landing-food-promise__blob landing-food-promise__blob--br" />
            <div className="landing-food-promise__dots-pattern landing-food-promise__dots-pattern--tr" />
            <div className="landing-food-promise__dots-pattern landing-food-promise__dots-pattern--bl" />
          </div>

          {/* Road curves from bottom-right, passes behind the phone, emerges at the car */}
          <svg
            className="landing-food-promise__road"
            viewBox="0 0 500 400"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="landingRoadSurface" x1="92%" y1="96%" x2="8%" y2="42%">
                <stop offset="0%" stopColor="#109D4C" stopOpacity="0.4" />
                <stop offset="38%" stopColor="#109D4C" stopOpacity="0.28" />
                <stop offset="58%" stopColor="#109D4C" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#109D4C" stopOpacity="0.34" />
              </linearGradient>
              <linearGradient id="landingRoadEdge" x1="92%" y1="96%" x2="8%" y2="42%">
                <stop offset="0%" stopColor="#0b7a3f" stopOpacity="0.22" />
                <stop offset="58%" stopColor="#0b7a3f" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0b7a3f" stopOpacity="0.18" />
              </linearGradient>
            </defs>
            <path
              d="M 468 398
                 C 418 332, 352 258, 286 218
                 C 238 190, 196 202, 154 252
                 C 112 300, 72 348, 34 396
                 L 78 400
                 C 114 352, 154 302, 198 264
                 C 236 232, 276 228, 318 252
                 C 368 282, 412 336, 452 384
                 Z"
              fill="url(#landingRoadSurface)"
            />
            <path
              d="M 468 398
                 C 418 332, 352 258, 286 218
                 C 238 190, 196 202, 154 252
                 C 112 300, 72 348, 34 396
                 L 78 400
                 C 114 352, 154 302, 198 264
                 C 236 232, 276 228, 318 252
                 C 368 282, 412 336, 452 384
                 Z"
              fill="none"
              stroke="url(#landingRoadEdge)"
              strokeWidth="2"
            />
            <path
              d="M 448 388
                 C 392 318, 328 252, 272 218
                 C 228 192, 188 228, 142 286
                 C 108 328, 78 362, 52 388"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="7 13"
              opacity="0.55"
            />
          </svg>

          <div className="landing-food-promise__float landing-food-promise__float--noodles">
            <Image
              src="https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80"
              alt=""
              width={150}
              height={150}
              className="h-full w-full rounded-full object-cover shadow-lg ring-4 ring-white"
              unoptimized
            />
          </div>

          <div className="landing-food-promise__float landing-food-promise__float--car">
            <AppAssetImage
              assetKey={CX.ride.cab}
              alt=""
              className="h-full w-full object-contain drop-shadow-xl"
              width={200}
              height={120}
            />
          </div>

          <div className="landing-food-promise__float landing-food-promise__float--parcel">
            <div className="landing-food-promise__parcel-box">
              <Package size={36} strokeWidth={1.75} className="text-[#109D4C]" />
            </div>
          </div>

          <div className="landing-food-promise__float landing-food-promise__float--pin">
            <MapPin size={44} fill="#109D4C" stroke="#0b7a3f" strokeWidth={1.5} className="drop-shadow-md" />
          </div>

          <div className="landing-food-promise__hero-image">
            {/* eslint-disable-next-line @next/next/no-img-element -- synced public/img asset */}
            <img
              src="/img/dnscreen.png"
              alt="GatiMitra app"
              className="landing-food-promise__hero-shot"
              width={320}
              height={640}
              decoding="async"
              fetchPriority="high"
            />
          </div>

          {FLOAT_BADGES.map((badge) => {
            const Icon = badge.icon
            return (
              <div key={badge.text} className={`landing-food-promise__badge ${badge.className}`}>
                <span className="landing-food-promise__badge-icon" aria-hidden>
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                <span className="landing-food-promise__badge-text">{badge.text}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
