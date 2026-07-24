'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap, Shield, Wallet, Gift, Clock, TrendingUp, Star, Heart, Sparkles } from 'lucide-react';

const benefits = [
  {
    icon: Shield,
    title: 'Safety First',
    highlight: 'Insurance Coverage',
    subItems: ['Emergency SOS', '24/7 Support', 'Real-time Tracking', 'Verified Customers'],
    color: 'from-blue-500 to-cyan-500',
    gradient: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20'
  },
  {
    icon: Wallet,
    title: 'Higher Earnings',
    highlight: '₹99 Welcome Bonus',
    subItems: ['NO Hidden charges', 'Instant Payouts', 'Surge Pricing', 'Daily Incentives'],
    color: 'from-green-500 to-emerald-500',
    gradient: 'bg-gradient-to-br from-green-500/20 to-emerald-500/20'
  },
  {
    icon: Gift,
    title: 'Exclusive Perks',
    highlight: 'Free Rides & Rewards',
    subItems: ['Fuel Cashback', 'Free Maintenance', 'Health Checkups', 'Festival Bonuses'],
    color: 'from-purple-500 to-pink-500',
    gradient: 'bg-gradient-to-br from-purple-500/20 to-pink-500/20'
  },
  {
    icon: Clock,
    title: 'Flexible Hours',
    highlight: 'Earn on Your Terms',
    subItems: ['24/7 Availability', 'Peak Time Bonus', 'Schedule Freedom', 'Quick Onboarding'],
    color: 'from-orange-500 to-amber-500',
    gradient: 'bg-gradient-to-br from-orange-500/20 to-amber-500/20'
  },
  {
    icon: TrendingUp,
    title: 'Career Growth',
    highlight: 'Skill Development',
    subItems: ['Training Programs', 'Performance Bonus', 'Leadership Roles', 'Mentorship'],
    color: 'from-red-500 to-rose-500',
    gradient: 'bg-gradient-to-br from-red-500/20 to-rose-500/20'
  },
  {
    icon: Heart,
    title: 'Rider Community',
    highlight: 'Support Network',
    subItems: ['Meetups & Events', 'Family Support', 'Social Benefits', 'Recognition'],
    color: 'from-violet-500 to-indigo-500',
    gradient: 'bg-gradient-to-br from-violet-500/20 to-indigo-500/20'
  }
];

const stats = [
  { value: '₹99', label: 'Instant Signup Bonus', icon: Star },
  { value: 'Zero', label: 'Hidden Charges', icon: TrendingUp },
  { value: '24/7', label: 'Support Available', icon: Shield },
  { value: '4.8★', label: 'Rider Rating', icon: Star }
];

export default function Features() { // Changed from RiderBenefits to Features
  const router = useRouter();

  const handleBecomeRider = () => {
    const el = document.getElementById('contact');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleLearnMore = () => {
    router.push('/about');
  };

  return (
    <section id="features" className="min-h-screen bg-gradient-to-b from-gray-950 to-black py-12 px-4 md:px-8 overflow-hidden"> {/* Changed id to "features" */}
      <div className="max-w-7xl mx-auto h-full">
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 mb-4">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-orange-300">Why Choose Us</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Why Ride With
            </span>{' '}
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              GatiMitra?
            </span>
          </h1>
          
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            India's most rewarding delivery platform, built for riders by riders
          </p>
        </motion.div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-4xl mx-auto"
        >
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="bg-gradient-to-b from-gray-900/50 to-gray-900/30 backdrop-blur-sm rounded-xl p-4 border border-gray-800"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-orange-400" />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                </div>
                <div className="text-xs text-gray-400">{stat.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Benefits Grid - Compact Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {benefits.map((benefit, idx) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ y: -4 }}
                className="group relative h-full"
              >
                {/* Card */}
                <div className="h-full bg-gradient-to-b from-gray-900/40 to-gray-900/20 backdrop-blur-sm rounded-2xl p-6 border border-gray-800 group-hover:border-gray-700 transition-all duration-300 overflow-hidden">
                  
                  {/* Animated Background */}
                  <div className={`absolute inset-0 ${benefit.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  
                  {/* Icon & Title */}
                  <div className="flex items-start gap-4 mb-4 relative z-10">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${benefit.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white truncate">{benefit.title}</h3>
                      <p className="text-sm font-medium text-gray-300 mt-1">{benefit.highlight}</p>
                    </div>
                  </div>

                  {/* Sub-items - Compact */}
                  <div className="relative z-10 space-y-2">
                    {benefit.subItems.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${benefit.color}`} />
                        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors truncate">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Accent */}
                  <div className={`h-0.5 w-12 bg-gradient-to-r ${benefit.color} rounded-full mt-6 opacity-50 group-hover:opacity-100 transition-opacity`} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="max-w-2xl mx-auto"
        >
          <div className="relative bg-gradient-to-br from-gray-900 to-black rounded-2xl p-8 border border-gray-800 overflow-hidden">
            
            {/* Animated Border */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/5 to-transparent animate-shimmer" />
            
            <div className="relative z-10 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 mb-6">
                <Sparkles className="w-4 h-4 text-white" />
                <span className="text-sm font-semibold text-white">Limited Time Offer</span>
              </div>
              
              <h2 className="text-3xl font-bold mb-4">
                <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Start Earning in Minutes
                </span>
              </h2>
              
              <p className="text-gray-400 mb-6">
                Complete your first 5 deliveries and earn ₹99 bonus instantly
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBecomeRider}
                  className="px-8 py-3 rounded-full bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold shadow-lg shadow-orange-500/25"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4" />
                    Join Now & Get ₹99
                  </span>
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLearnMore}
                  className="px-8 py-3 rounded-full bg-gray-900 border border-gray-700 text-gray-300 font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  Learn More
                  <span className="text-xs opacity-80">→ About Us</span>
                </motion.button>
              </div>
              
              <p className="text-xs text-gray-500 mt-6">
                No hidden charges • Instant verification • Start same day
              </p>
            </div>
          </div>
        </motion.div>

        {/* Background Elements */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
        </div>
      </div>

      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite linear;
        }
      `}</style>
    </section>
  );
}