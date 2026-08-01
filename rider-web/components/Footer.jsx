"use client";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");
  const [copyrightYear, setCopyrightYear] = useState('2025-26');
  const [lastUpdated, setLastUpdated] = useState('13-02-2026 • Fri');

  useEffect(() => {
    setIsMounted(true);
    const d = new Date();
    setCopyrightYear(`2025-${String(d.getFullYear()).slice(-2)}`);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    setLastUpdated(`${day}-${month}-${year} • ${days[d.getDay()]}`);
  }, []);

  const handleQuickLinkClick = (href, id) => {
    if (href.startsWith('/')) {
      router.push(href);
    } else {
      if (pathname !== '/') {
        router.push('/#' + id);
      } else {
        if (typeof window !== 'undefined') {
          window.location.hash = id;
          const el = document.getElementById(id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    }
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    setError("");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    
    // Clear previous success message if any
    setSubscribed(false);
    
    // Simulate API call
    setSubscribed(true);
    
    // Clear input field
    setEmail("");
    
    // Hide success message after 2 seconds
    setTimeout(() => {
      setSubscribed(false);
    }, 2000);
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.2 } },
  };

  const fadeUpVariant = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
  };

  const businessSolutions = [
    { name: "Food Delivery", icon: "fa-utensils", desc: "Hot meals delivered fast", comingSoon: false, url: "https://gatimitra.com/order" },
    { name: "Parcel Delivery", icon: "fa-box", desc: "Secure package delivery", comingSoon: false, url: "https://gatimitra.com/courier" },
    { name: "Cab Economy", icon: "fa-car", desc: "Affordable rides for everyone", comingSoon: false, url: "https://gatimitra.com/ride" },
    { name: "Cab Premium", icon: "fa-car-side", desc: "Luxury rides with comfort", comingSoon: false, url: "https://gatimitra.com/ride" },
    { name: "Bike Taxi", icon: "fa-motorcycle", desc: "Quick rides through traffic", comingSoon: false, url: "https://gatimitra.com/ride" },
    { name: "Auto Rides", icon: "fa-rickshaw", desc: "Traditional auto rides", comingSoon: false, url: "https://gatimitra.com/ride" },
    { name: "Share Auto", icon: "fa-van-shuttle", desc: "Shared rides, lower cost", comingSoon: false, url: "https://gatimitra.com/ride" },
    { name: "Grocery Delivery", icon: "fa-shopping-basket", desc: "Daily essentials at doorstep", comingSoon: true, url: null },
  ];

  const quickLinks = [
    { name: "Home", href: "/", id: "home", icon: "fa-home" },
    { name: "Benefits", href: "#features", id: "features", icon: "fa-star" },
    { name: "Services", href: "#services", id: "services", icon: "fa-shipping-fast" },
    { name: "Contact", href: "#contact", id: "contact", icon: "fa-phone" },
    { name: "About", href: "/about", id: "about", icon: "fa-info-circle" },
    { name: "Careers", href: "/careers", id: "careers", icon: "fa-briefcase" }
  ];

  const socialLinks = [
    { 
      platform: "Facebook", 
      icon: "fab fa-facebook-f", 
      href: "https://www.facebook.com/pratapsons10",
      color: "bg-gradient-to-br from-blue-500 to-blue-700 hover:shadow-blue-500/50"
    },
    { 
      platform: "LinkedIn", 
      icon: "fab fa-linkedin-in", 
      href: "https://www.linkedin.com/in/pratapandsons/",
      color: "bg-gradient-to-br from-cyan-500 to-blue-600 hover:shadow-cyan-400/50"
    },
    { 
      platform: "Instagram", 
      icon: "fab fa-instagram", 
      href: "https://www.instagram.com/gatimitra_on_demand/",
      color: "bg-gradient-to-br from-pink-500 to-red-500 hover:shadow-pink-400/50"
    },
    { 
      platform: "YouTube", 
      icon: "fab fa-youtube", 
      href: "https://youtube.com/@gatimitrano1?si=RpBFq5tmSjVnOHH3",
      color: "bg-gradient-to-br from-red-500 to-red-700 hover:shadow-red-500/50"
    },
    { 
      platform: "Twitter", 
      icon: "fab fa-twitter", 
      href: "#",
      color: "bg-gradient-to-br from-sky-500 to-blue-500 hover:shadow-sky-400/50"
    }
  ];

  return (
    <footer className="relative bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-950 text-white">
      <div className="h-1 w-full bg-gradient-to-r from-red-600 via-yellow-500 to-teal-500"></div>
      
      <div className="mx-8 lg:mx-16 px-6 sm:px-8 lg:px-10 py-8">
        <div className="w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-4 mb-8">
            
            {/* Column 1: Company Info */}
            <div className="space-y-3 lg:col-span-1">
              <div className="flex items-center space-x-3">
                <img src="/onlylogo.png" alt="GatiMitra Logo" className="h-26 w-16" />
                <div>
                  <h2 className="text-2xl font-extrabold flex items-center">
                    <span style={{color:'#F9B233'}}>Gati</span>
                    <span style={{color:'#5FE6B9', marginLeft:'4px'}}>Mitra</span>
                  </h2>
                  <p className="text-xs text-gray-300">GatiMitra On-Demand Services Pvt. Ltd.</p>
                </div>
              </div>
              
              <p className="text-sm text-gray-300">
                India's most partner-friendly delivery platform offering the lowest commissions and maximum earnings.
              </p>
              
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <i className="fas fa-map-marker-alt text-red-400 text-sm flex-shrink-0"></i>
                  <span className="text-sm">Nawada, Bihar</span>
                </div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <i className="fas fa-map-marker-alt text-gray-500 text-sm flex-shrink-0"></i>
                  <span className="text-sm text-gray-400">Kolkata, West Bengal, India</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    Coming Soon
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-phone text-yellow-400 text-sm"></i>
                  <span className="text-sm">+91 00009 11319</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-envelope text-teal-400 text-sm"></i>
                  <span className="text-sm">partnerhelp@gatimitra.com</span>
                </div>
              </div>
            </div>

            {/* Column 2: Quick Links */}
            <div className="ml-20">
              <h3 className="text-lg font-bold mb-3 pb-1 border-b border-gray-700">
                Quick Links
              </h3>
              <ul className="space-y-1.5">
                {quickLinks.map((link, index) => {
                  if (isMounted && link.id === 'careers' && pathname === '/careers') {
                    return null;
                  }
                  return (
                    <li key={index}>
                      <button 
                        onClick={() => handleQuickLinkClick(link.href, link.id)}
                        className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors text-sm w-full text-left cursor-pointer"
                      >
                        <i className={`fas ${link.icon} text-red-400 w-4`}></i>
                        <span>{link.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Column 3: Our Services */}
            <div className="lg:col-span-2 ml-6.5">
              <h3 className="text-lg font-bold mb-3 pb-1 border-b border-gray-700">
                Our Services
              </h3>
              <div className="grid grid-cols-2 gap-1.5 max-w-md">
                {businessSolutions.map((service, index) => (
                  service.url ? (
                    <a
                      key={index}
                      href={service.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded p-1.5 transition-colors bg-gray-800/50 hover:bg-gray-700/50 cursor-pointer"
                    >
                      <div className="flex items-start space-x-1">
                        <i className={`fas ${service.icon} text-xs mt-0.5 text-yellow-400`}></i>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-xs leading-tight">{service.name}</h4>
                          <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{service.desc}</p>
                        </div>
                      </div>
                    </a>
                  ) : (
                    <div
                      key={index}
                      className="rounded p-1.5 transition-colors bg-gray-800/30 cursor-not-allowed opacity-80"
                    >
                      <div className="flex items-start space-x-1">
                        <i className={`fas ${service.icon} text-xs mt-0.5 text-gray-500`}></i>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <h4 className="font-semibold text-xs leading-tight text-gray-500">{service.name}</h4>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                              Coming Soon
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{service.desc}</p>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Column 4: Social Media & Newsletter - UPDATED */}
            <div className="lg:col-span-1 ml-4">
              <h3 className="text-lg font-bold mb-3 pb-1 border-b border-gray-700">
                Connect With Us
              </h3>
              
              {/* Social Media Icons */}
              <div className="mb-3">
                <h4 className="font-semibold mb-2 text-sm">Follow Us</h4>
                <div className="flex space-x-1.5">
                  {socialLinks.map((social, index) => (
                    <a
                      key={index}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-7 h-7 rounded-full ${social.color} flex items-center justify-center hover:scale-110 transition-transform`}
                      title={social.platform}
                    >
                      <i className={`${social.icon} text-white text-xs`}></i>
                    </a>
                  ))}
                </div>
              </div>

              {/* Newsletter - UPDATED */}
              <div>
                <h4 className="font-semibold mb-2 text-sm">Newsletter</h4>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-300">
                    Subscribe for updates and offers
                  </p>
                  
                  {/* Subscription Form - ALWAYS VISIBLE */}
                  <form className="flex" onSubmit={handleSubscribe}>
                    <input
                      type="email"
                      placeholder="Your email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="flex-1 bg-gray-800 text-white px-2.5 py-1.5 rounded-l-lg focus:outline-none text-sm min-w-0"
                    />
                    <button
                      type="submit"
                      className="bg-gradient-to-r from-red-600 to-yellow-500 px-2.5 py-1.5 rounded-r-lg hover:opacity-90 transition-opacity text-sm cursor-pointer"
                    >
                      <i className="fas fa-paper-plane text-xs"></i>
                    </button>
                  </form>
                  
                  {/* Success Message - Shows for 2 seconds then hides */}
                  {subscribed && (
                    <div className="text-green-400 text-xs animate-pulse transition-opacity duration-300">
                      <i className="fas fa-check-circle mr-1"></i>
                      Thank you for subscribing!
                    </div>
                  )}
                  
                  {/* Error Message */}
                  {error && <div className="text-red-400 text-xs mt-1">{error}</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-700 pt-5">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
              <div className="text-center md:text-left">
                <p className="text-sm text-gray-300">
                  Copyright © {copyrightYear}{' '}
                  <span className="font-bold" style={{color:'#F9B233'}}>Gati</span>
                  <span className="font-bold" style={{color:'#5FE6B9', marginLeft:'2px'}}>Mitra</span>
                  <span className="text-white"> On-Demand Services Pvt. Ltd.</span> | All Rights Reserved
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Lowest Commission • 24/7 Support • Flexible Delivery • Secure Platform
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Last-Updated • {lastUpdated}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-x-3 gap-y-1 ml-16">
                <a href="/terms" className="text-gray-400 hover:text-white text-sm" target="_blank" rel="noopener noreferrer">Terms</a>
                <a href="/privacy" className="text-gray-400 hover:text-white text-sm">Privacy</a>
                <a href="/refund-policy" className="text-gray-400 hover:text-white text-sm">Refunds</a>
                <a href="/account-deletion" className="text-gray-400 hover:text-white text-sm">Delete Account</a>
                <a href="/cookies" className="text-gray-400 hover:text-white text-sm">Cookies</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}