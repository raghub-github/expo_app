'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Services from '@/components/Services';
import ReviewsSection from '@/components/ReviewsSection'; 
import ContactForm from '@/components/ContactForm';
import Footer from '@/components/Footer';
import TrackingModal from '@/components/TrackingModal';
import FloatingActions from '@/components/FloatingActions';

export default function Home() {
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Show loader animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      {/* Page Loader */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 bg-gradient-to-br from-slate-950 to-black flex items-center justify-center z-50"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-red-600 p-1"
          >
            <div className="w-full h-full rounded-full bg-slate-950" />
          </motion.div>
        </motion.div>
      )}

      {/* Navbar */}
      <Navbar 
        onRiderClick={() => document.getElementById('become-rider')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* Hero Section */}
      <Hero 
        onRiderClick={() => document.getElementById('become-rider')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* Features Section */}
      <Features />

      {/* Services Section */}
      <Services />

      {/* Testimonials Section */}
      <ReviewsSection /> {/* ✅ Changed here too */}

      {/* Contact Form with Rider Registration */}
      <ContactForm />

      {/* Footer */}
      <Footer />

      {/* Floating Action Buttons */}
      <FloatingActions 
        onTrackClick={() => setIsTrackingOpen(true)}
      />


      {/* Tracking Modal */}
      <TrackingModal 
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
      />
    </main>
  );
}