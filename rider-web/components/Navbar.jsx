'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  Home,
  Star,
  Truck,
  MessageCircle,
  Phone,
  Briefcase,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import React from 'react';

export default function Navbar({ onBookClick }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    // Set active section based on current pathname
    if (pathname === '/careers') {
      setActiveSection('careers');
    } else if (pathname === '/about') {
      setActiveSection('about');
    } else if (pathname === '/reviews') {
      setActiveSection('reviews');
    } else if (pathname === '/') {
      setActiveSection('home');
    }

    // Force dark mode
    document.documentElement.classList.add('dark');

    const handleScroll = () => {
      setHasScrolled(window.scrollY > 20);

      // Only update active section on home page based on scroll
      if (pathname === '/') {
        const sections = ['home', 'features', 'services', 'reviews', 'contact'];
        const current = sections.find((section) => {
          const el = document.getElementById(section);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.top <= 120 && rect.bottom >= 120;
        });

        if (current) setActiveSection(current);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  const handleBecomeRider = () => {
    setIsOpen(false);
    if (pathname === '/') {
      const el = document.getElementById('contact');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      sessionStorage.setItem('scrollToSection', 'contact');
      setTimeout(() => router?.push('/'), 150);
    }
  };

  const navItems = [
    { name: 'Home', icon: <Home size={18} />, id: 'home', href: '/' },
    { name: 'Why Us?', icon: <Star size={18} />, id: 'features', href: null },
    { name: 'Services', icon: <Truck size={18} />, id: 'services', href: null },
    { name: "User's Feedback", icon: <MessageCircle size={18} />, id: 'reviews', href: null },
    { name: 'About', icon: <Briefcase size={18} />, id: 'about', href: '/about', description: 'Learn about GatiMitra and its CEO & Founder Bhim Pratap' },
    { name: 'Contact', icon: <Phone size={18} />, id: 'contact', href: null },
    { name: 'Careers', icon: <Briefcase size={18} />, id: 'careers', href: '/careers' }
  ];

  const scrollToSection = (id, href) => {
    setIsOpen(false);
    
    // If there's a href (like for Home or Careers), navigate to it
    if (href) {
      // Small delay so mobile menu closes before navigation
      setTimeout(() => {
        router?.push(href);
      }, 150);
      return;
    }
    
    // If not on homepage, navigate to home and scroll after navigation
    if (pathname !== '/') {
      sessionStorage.setItem('scrollToSection', id);
      setTimeout(() => {
        router?.push('/');
      }, 150);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSection(id);
      }
    }
  };

  // On homepage, check if scrollToSection is set in sessionStorage
  useEffect(() => {
    if (pathname === '/') {
      const section = sessionStorage.getItem('scrollToSection');
      if (section) {
        setTimeout(() => {
          const el = document.getElementById(section);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(section);
          }
          sessionStorage.removeItem('scrollToSection');
        }, 300); // Wait for page transition
      }
    }
  }, [pathname]);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        hasScrolled
          ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg shadow-lg'
          : 'bg-white dark:bg-gray-900'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* LOGO - Bigger Size */}
          <div
            onClick={() => scrollToSection('home', '/')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <img 
              src="/logo.png" 
              alt="GatiMitra Logo" 
              className="h-24 w-auto object-contain" // Maximum logo height
              style={{ minWidth: '96px', minHeight: '96px' }} 
            />
          </div>

          {/* DESKTOP NAV */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              // Only hide Careers button on home page if mounted
              if (isMounted && item.id === 'careers' && pathname !== '/careers') {
                return null;
              }
              return (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id, item.href)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeSection === item.id
                      ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-md'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </button>
              );
            })}
          </div>

          {/* DESKTOP ACTION BUTTONS */}
          <div className="hidden md:flex items-center gap-3">
            {/* Become a Rider Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBecomeRider}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg hover:from-red-700 hover:to-orange-600 transition-all flex items-center gap-2 text-sm shadow-md"
            >
              Become a Rider
              <ArrowRight size={16} />
            </motion.button>
          </div>

          {/* MOBILE TOGGLE */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* MOBILE MENU */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden absolute left-0 right-0 top-full mt-1 mx-4 bg-white dark:bg-gray-900 shadow-xl rounded-xl overflow-hidden z-[60]"
            >
              <div className="p-3 space-y-1">
                {navItems.map((item) => {
                  // Only hide Careers button on home page if mounted
                  if (isMounted && item.id === 'careers' && pathname !== '/careers') {
                    return null;
                  }
                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id, item.href)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800">
                          {React.cloneElement(item.icon, {
                            className:
                              activeSection === item.id
                                ? 'text-red-600 dark:text-orange-400'
                                : 'text-gray-600 dark:text-gray-400'
                          })}
                        </div>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  );
                })}
                
                {/* Mobile Become a Rider Button */}
                <button
                  onClick={handleBecomeRider}
                  className="w-full mt-2 px-4 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  Become a Rider
                  <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}