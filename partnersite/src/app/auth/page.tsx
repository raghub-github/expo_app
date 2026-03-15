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
        <div className="relative z-10 w-full max-w-xl mx-auto">
          <div className="rounded-3xl border border-white/20 bg-white/10 p-6 sm:p-8 md:p-10 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
            {/* Logo – larger size, solid background for clear visibility */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex h-20 w-28 sm:h-24 sm:w-32 items-center justify-center rounded-xl bg-white shadow-xl ring-2 ring-white/50 px-4 py-3">
                <img src="/logo.png" alt="GatiMitra" className="h-12 w-auto object-contain sm:h-14" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center tracking-tight mb-3 drop-shadow-sm">
              Welcome to GatiMitra
            </h1>
            <p className="text-base sm:text-lg text-white/95 text-center mb-1 max-w-md mx-auto leading-relaxed">
              Manage your store and grow your business
            </p>
            <p className="text-sm sm:text-base text-white/80 text-center mb-8 max-w-md mx-auto">
              Join thousands of partners – restaurants, pharmacies, grocery, and more
            </p>

            {/* CTAs – elevated, full-width on mobile */}
            <div className="w-full space-y-4 mb-8">
              <Link
                href="/auth/register"
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-300 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent active:translate-y-0"
              >
                <span className="flex items-center gap-2.5">
                  <Store className="h-5 w-5" />
                  Join GatiMitra as a merchant
                </span>
                <ArrowRight className="h-5 w-5 opacity-90" />
              </Link>
              <Link
                href="/auth/login?redirect=/auth/post-login"
                className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-white/40 bg-white/15 px-6 py-4 text-base font-semibold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-white/25 hover:border-white/60 hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent active:translate-y-0"
              >
                <span className="flex items-center gap-2.5">
                  <Store className="h-5 w-5 text-amber-200" />
                  Sign in to your partner account
                </span>
                <ArrowRight className="h-5 w-5 text-white/80" />
              </Link>
            </div>

            <p className="text-center text-sm sm:text-base font-semibold text-white/95">
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
