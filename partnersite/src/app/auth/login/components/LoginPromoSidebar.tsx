'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export type AuthSidebarVariant = 'login' | 'signup';

const LOGIN_SLIDES = [
  {
    title: 'Welcome back, partner',
    body: 'Sign in to manage live orders, update your menu, and keep your store running smoothly from one dashboard.',
    cta: 'Open partner dashboard',
    href: '/auth/login',
  },
  {
    title: 'Track every order in real time',
    body: 'Accept orders, monitor prep time, and coordinate deliveries — all from your GatiMitra merchant portal.',
    cta: 'See how it works',
    href: '/auth',
  },
  {
    title: 'Clear earnings & fast settlements',
    body: 'View wallet balance, payout cycles, and settlement breakdowns so you always know what you earned.',
    cta: 'Explore payouts',
    href: '/auth',
  },
] as const;

/** Signup sidebar — static “Why choose us” highlights (Cashfree-style). */
const SIGNUP_HIGHLIGHTS = [
  {
    stat: '1000+',
    title: 'Growing merchant network',
    body: 'Restaurants, pharmacies, grocery & more trust GatiMitra for online orders and delivery.',
  },
  {
    stat: '24/7',
    title: 'Live order management',
    body: 'Get instant alerts, accept orders from app or web, and run your store without missing a beat.',
  },
  {
    stat: 'Fast',
    title: 'Transparent payouts',
    body: 'Track earnings, settlements, and wallet credits in real time with a clear payout breakdown.',
  },
] as const;

const SLIDE_INTERVAL_MS = 5500;

function SidebarWave() {
  return (
    <div className="absolute inset-x-0 top-0 h-48 overflow-hidden pointer-events-none" aria-hidden>
      <svg
        className="absolute -top-2 left-0 w-full h-full opacity-30"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M-20 80 C 80 20, 180 140, 280 70 S 420 30, 480 90"
          stroke="white"
          strokeWidth="1.5"
        />
        <path
          d="M-40 110 C 60 50, 160 170, 260 100 S 400 60, 500 120"
          stroke="white"
          strokeWidth="1"
          opacity="0.7"
        />
        <path
          d="M0 140 C 100 80, 200 200, 300 130 S 440 90, 520 150"
          stroke="white"
          strokeWidth="0.75"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

function SignupSidebarContent() {
  return (
    <div className="relative z-10 flex flex-1 flex-col justify-center px-8 xl:px-9 py-14">
      <h2 className="text-2xl xl:text-[1.75rem] font-bold leading-snug tracking-tight">
        Why choose GatiMitra?
      </h2>
      <ul className="mt-8 space-y-7">
        {SIGNUP_HIGHLIGHTS.map((item) => (
          <li key={item.stat} className="flex gap-4">
            <span className="shrink-0 text-xl xl:text-2xl font-bold text-white tabular-nums min-w-[4.5rem]">
              {item.stat}
            </span>
            <div>
              <p className="text-sm xl:text-[15px] font-semibold text-white leading-snug">
                {item.title}
              </p>
              <p className="mt-1 text-xs xl:text-sm text-orange-50/85 leading-relaxed">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Link
        href="/auth"
        className="inline-flex items-center gap-2 mt-10 text-sm font-semibold text-white/95 hover:text-white transition-colors group"
      >
        Learn about partner benefits
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function LoginSidebarCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % LOGIN_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const slide = LOGIN_SLIDES[activeIndex];

  return (
    <>
      <div className="relative z-10 flex flex-1 flex-col justify-center px-8 xl:px-9 py-14">
        <div key={activeIndex} className="animate-in fade-in duration-500">
          <h2 className="text-2xl xl:text-[1.75rem] font-bold leading-snug tracking-tight">
            {slide.title}
          </h2>
          <p className="mt-4 text-sm xl:text-[15px] text-orange-50/90 leading-relaxed">
            {slide.body}
          </p>
          <Link
            href={slide.href}
            className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-white/95 hover:text-white transition-colors group"
          >
            {slide.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 px-8 xl:px-9 pb-8">
        {LOGIN_SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Show slide ${index + 1}`}
            onClick={() => setActiveIndex(index)}
            className={`h-1 rounded-full transition-all duration-300 ${
              index === activeIndex ? 'w-8 bg-white' : 'w-5 bg-white/35 hover:bg-white/55'
            }`}
          />
        ))}
      </div>
    </>
  );
}

interface LoginPromoSidebarProps {
  variant?: AuthSidebarVariant;
}

export function LoginPromoSidebar({ variant = 'login' }: LoginPromoSidebarProps) {
  const isSignup = variant === 'signup';

  return (
    <aside
      className="relative hidden lg:flex lg:w-80 xl:w-[340px] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 text-white"
      aria-label={isSignup ? 'Why choose GatiMitra' : 'Partner login benefits'}
    >
      <SidebarWave />
      {isSignup ? <SignupSidebarContent /> : <LoginSidebarCarousel />}
    </aside>
  );
}
