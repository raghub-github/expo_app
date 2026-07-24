'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function Hero({ onBookClick }) {
  const adsImages = ['/food.jpg', '/parcel.jpg', '/person.jpg'];
  const [currentAd, setCurrentAd] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAd((p) => (p + 1) % adsImages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleBecomeRider = () => {
    const el = document.getElementById('contact');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section 
      id="home" 
      className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-black min-h-screen flex items-center pt-20 lg:pt-24"
    >
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">

          {/* LEFT CONTENT */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6 max-w-xl"
          >
            {/* Badge with proper spacing */}
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 text-orange-400 text-sm font-medium">
              ⚡ Fast & Reliable Delivery
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mt-2">
              <span className="bg-gradient-to-r from-[#5FE6B9] to-[#F9B233] bg-clip-text text-transparent">
                GatiMitra —
              </span>{' '}
              <span className="bg-gradient-to-r from-[#F9B233] to-[#5FE6B9] bg-clip-text text-transparent">
                Fast, Safe & Reliable Deliveries
              </span>
            </h1>

            <p className="text-lg text-slate-300">
              Food • Parcel • Person — One platform for all your local delivery needs
            </p>

            <p className="text-base text-slate-400">
              From food to parcels and personal rides — GatiMitra connects you
              with trusted riders for quick, affordable deliveries near you .
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              {['24/7 Support', 'Live Tracking', 'Comparatively less charging'].map(
                (t, i) => (
                  <span
                    key={i}
                    className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-orange-300 font-medium"
                  >
                    ✓ {t}
                  </span>
                )
              )}
            </div>

            {/* Single Button Container - Only Become a Rider */}
            <div className="pt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBecomeRider}
                className="px-8 py-3.5 bg-gradient-to-r from-red-600 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                Become a Rider
                <ArrowRight size={18} />
              </motion.button>
            </div>
          </motion.div>

          {/* RIGHT POSTER */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative max-w-[360px] w-full">

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentAd}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="relative overflow-hidden rounded-3xl shadow-[0_30px_80px_-20px_rgba(255,120,60,0.35)]">
                    <Image
                      src={adsImages[currentAd]}
                      alt="GatiMitra Poster"
                      width={360}
                      height={500}
                      priority
                      className="rounded-3xl object-cover w-full h-auto transform hover:scale-105 transition-transform duration-700"
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* SECURE BADGE */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 md:-top-4 md:-right-4"
              >
                <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 rounded-full shadow-xl backdrop-blur-sm border border-white/20 min-w-[80px] sm:min-w-[90px] md:min-w-[100px]">
                  <div className="text-xs sm:text-sm md:text-base font-bold text-center leading-tight">Secure</div>
                  <div className="text-[10px] sm:text-xs opacity-90 text-center leading-tight mt-0.5">Reliable Delivery</div>
                </div>
              </motion.div>

              {/* RATING BADGE */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="absolute -bottom-2 -left-2 sm:-bottom-3 sm:-left-3 md:-bottom-4 md:-left-4"
              >
                <div className="bg-slate-900/95 backdrop-blur-sm border border-white/20 text-white px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 rounded-full shadow-xl min-w-[80px] sm:min-w-[90px] md:min-w-[100px]">
                  <div className="text-xs sm:text-sm md:text-base font-bold text-orange-400 text-center leading-tight">4.8 ★</div>
                  <div className="text-[10px] sm:text-xs opacity-80 text-center leading-tight mt-0.5">1.5k+ Reviews</div>
                </div>
              </motion.div>

            </div>
          </motion.div>

        </div>
      </div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-full blur-3xl" />
      </div>
    </section>
  );
}