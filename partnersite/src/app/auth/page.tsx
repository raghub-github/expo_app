'use client';

import Link from 'next/link';
import { Store, ArrowRight, ChevronDown } from 'lucide-react';
import { WhyChooseUsSection } from '@/components/onboarding/WhyChooseUsSection';
import { NeededDocumentsSection } from '@/components/onboarding/NeededDocumentsSection';
import { FAQSection } from '@/components/onboarding/FAQSection';

const HERO_BG_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80';

export default function AuthHome() {
  const scrollToContent = () => {
    document.getElementById('below-fold')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header – blends with hero: semi-transparent dark + blur */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 border-b border-white/10 bg-slate-900/70 backdrop-blur-md shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="GatiMitra" className="h-9 w-auto object-contain sm:h-10" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-white/90">
          Partner Portal
        </span>
      </header>

      {/* Hero – full-width background image + overlay + glass content */}
      <section
        className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16 overflow-hidden"
        style={{
          backgroundImage: `url(${HERO_BG_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Overlay: gradient + slight darkening for readability */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/60 to-slate-900/80"
          aria-hidden
        />
        <div className="absolute inset-0 backdrop-blur-[2px]" aria-hidden />

        {/* Centered container – glassmorphism card */}
        <div className="relative z-10 w-full max-w-lg mx-auto">
          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 sm:p-6 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
            <div className="flex justify-center mb-4">
              <div className="inline-flex h-14 w-20 sm:h-16 sm:w-24 items-center justify-center rounded-lg bg-white shadow-lg ring-2 ring-white/50 px-3 py-2">
                <img src="/logo.png" alt="GatiMitra" className="h-9 w-auto object-contain sm:h-10" />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-center tracking-tight mb-2 drop-shadow-sm">
              Welcome to GatiMitra
            </h1>
            <p className="text-sm sm:text-base text-white/95 text-center mb-1 max-w-md mx-auto leading-snug">
              Manage your store and grow your business
            </p>
            <p className="text-xs sm:text-sm text-white/80 text-center mb-5 max-w-md mx-auto">
              Join thousands of partners – restaurants, pharmacies, grocery, and more
            </p>

            <div className="w-full space-y-3 mb-4">
              <Link
                href="/auth/register"
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-300 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent active:translate-y-0"
              >
                <span className="flex items-center gap-2">
                  <Store className="h-4 w-4 shrink-0" />
                  Join GatiMitra as a merchant
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-90" />
              </Link>
              <Link
                href="/auth/login?redirect=/partners/all-stores"
                className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-white/40 bg-white/15 px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-white/25 hover:border-white/60 hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent active:translate-y-0"
              >
                <span className="flex items-center gap-2">
                  <Store className="h-4 w-4 shrink-0 text-amber-200" />
                  Sign in to your partner account
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/80" />
              </Link>
            </div>

            <p className="text-center text-xs sm:text-sm font-semibold text-white/95">
              For Partners – Start selling & delivering through GatiMitra
            </p>
          </div>
        </div>

        {/* Scroll hint */}
        <button
          type="button"
          onClick={scrollToContent}
          className="relative z-10 flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors mt-6 sm:mt-8 pb-4 sm:pb-6 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent rounded-lg"
          aria-label="Scroll to see more"
        >
          <span className="text-xs font-semibold uppercase tracking-widest">Scroll to explore</span>
          <ChevronDown className="h-8 w-8 animate-bounce" aria-hidden />
        </button>
      </section>

      {/* Below the fold */}
      <main id="below-fold" className="px-4 sm:px-6 lg:px-8 py-14 sm:py-16 pb-20">
        <div className="w-full max-w-6xl mx-auto space-y-16 sm:space-y-20 text-left">
          <WhyChooseUsSection />
          <NeededDocumentsSection />
          <FAQSection />
        </div>
      </main>
    </div>
  );
}
