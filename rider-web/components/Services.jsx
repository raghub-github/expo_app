'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Utensils, 
  Package, 
  Users, 
  X,
  Bike,
  Car,
  Users2,
  User,
  UserCircle,
  CheckCircle,
  ExternalLink
} from 'lucide-react';

/* -------------------- CITY LIST (Panipat First + All State Capitals) -------------------- */

const CITY_LIST = [
  'Panipat', // 🔥 always top - Special Exception with highest rates
  // All 28 State & UT Capitals
  'Delhi', 'Jaipur', 'Lucknow', 'Chandigarh', 'Shimla', 'Srinagar', 'Jammu',
  'Gandhinagar', 'Mumbai', 'Ranchi', 'Bhubaneswar', 'Patna', 'Raipur',
  'Panaji', 'Bangalore', 'Thiruvananthapuram', 'Chennai', 'Hyderabad',
  'Bhopal', 'Indore', 'Kolkata', 'Imphal', 'Shillong', 'Aizawl', 'Agartala',
  'Itanagar', 'Dispur', 'Kohima', 'Gangtok', 'Puducherry',
  // Additional major cities
  'Ahmedabad', 'Surat', 'Pune', 'Nagpur', 'Vadodara', 'Ludhiana',
  'Kochi', 'Coimbatore', 'Visakhapatnam', 'Guwahati', 'Jamshedpur'
];

/* -------------------- CITY-SPECIFIC BASE PRICING -------------------- */

const CITY_BASE_RATES = {
  'Panipat': { base: 22, multiplier: 1.8 }, // Highest rates
  'Delhi': { base: 20, multiplier: 1.6 },
  'Mumbai': { base: 21, multiplier: 1.7 },
  'Bangalore': { base: 19, multiplier: 1.5 },
  'Chennai': { base: 18, multiplier: 1.4 },
  'Hyderabad': { base: 17, multiplier: 1.4 },
  'Kolkata': { base: 16, multiplier: 1.3 },
  'Jaipur': { base: 15, multiplier: 1.3 },
  'Lucknow': { base: 14, multiplier: 1.2 },
  'Chandigarh': { base: 16, multiplier: 1.3 },
  // Default for other cities
  'default': { base: 15, multiplier: 1.2 }
};

/* -------------------- RATE GENERATOR WITH CITY DIFFERENTIATION -------------------- */

const generatePricing = (city) => {
  const cityData = CITY_BASE_RATES[city] || CITY_BASE_RATES['default'];
  const { base, multiplier } = cityData;
  const isPanipat = city === 'Panipat';

  // Generate city-specific variations
  const foodMin = Math.round(base * 0.9);
  const foodMax = Math.round(base * multiplier * 0.9);
  const parcelMin = Math.round(base * 1.1);
  const parcelMax = Math.round(base * multiplier * 1.1);
  const rideMin = Math.round(base * 1.2);
  const rideMax = Math.round(base * multiplier * 1.2);

  return {
    Food: {
      min: foodMin,
      max: foodMax,
      base: `₹${foodMin}-${foodMin + Math.round(foodMin * 0.3)}`,
      perKm: `₹${Math.round(base * 0.25)}-${Math.round(base * 0.35)}`,
      avgTime: `${15 + Math.round(base/3)}-${25 + Math.round(base/2)}`,
    },
    Parcel: {
      min: parcelMin,
      max: parcelMax,
      base: `₹${parcelMin}-${parcelMin + Math.round(parcelMin * 0.4)}`,
      additional: `₹${Math.round(base * 0.4)}-${Math.round(base * 0.6)}`,
      avgTime: `${25 + Math.round(base/2)}-${40 + Math.round(base/2)}`,
    },
    Ride: {
      min: rideMin,
      max: rideMax,
      base: `₹${rideMin}-${rideMin + Math.round(rideMin * 0.5)}`,
      perKm: `₹${Math.round(base * 0.3)}-${Math.round(base * 0.45)}`,
      avgTime: `${5 + Math.round(base/4)}-${10 + Math.round(base/3)}`,
    },
    cityMultiplier: multiplier,
    isPremiumCity: isPanipat
  };
};

const cityPricingRanges = Object.fromEntries(
  CITY_LIST.map((city) => [city, generatePricing(city)])
);

/* -------------------- IMAGE PATHS -------------------- */

const IMAGE_PATHS = {
  'food': '/foodbg.jpg',
  'parcel': '/parcel.jpg', 
  'cab-economy': '/cab.jpg',
  'cab-premium': '/cab.jpg',
  'bike': '/bike.jpg',
  'auto': '/auto.jpg',
  'auto-share': '/auto.jpg'
};

// Preload images
const preloadImages = () => {
  Object.values(IMAGE_PATHS).forEach(src => {
    const img = new Image();
    img.src = src;
  });
};

/* -------------------- SERVICES DATA WITH DETAILS -------------------- */

const services = [
  {
    id: 'food',
    name: 'Food',
    icon: <Utensils size={24} />,
    gradient: 'from-orange-400 to-red-500',
    emoji: '🍔',
    description: 'Hot meals delivered fast',
    details: [
      '30-45 minutes average delivery time',
      'Real-time order tracking',
      'Wide range of restaurant partners',
      'Temperature-controlled delivery',
      'Contactless delivery option',
      'Live delivery partner tracking'
    ],
    features: ['Fast Delivery', 'Live Tracking', 'Multiple Cuisines'],
    bookNowUrl: 'https://gatimitra.com/order'
  },
  {
    id: 'parcel',
    name: 'Parcel',
    icon: <Package size={24} />,
    gradient: 'from-yellow-400 to-orange-500',
    emoji: '📦',
    description: 'Secure package delivery',
    details: [
      'Same-day delivery available',
      'Package insurance up to ₹10,000',
      'Real-time package tracking',
      'Multiple size options available',
      'Secure handling of fragile items',
      'Pickup from your doorstep'
    ],
    features: ['Same Day', 'Insured', 'Door Pickup'],
    bookNowUrl: 'https://gatimitra.com/courier'
  },
  {
    id: 'cab-economy',
    name: 'Cab Economy',
    icon: <User size={24} />,
    gradient: 'from-green-400 to-emerald-500',
    emoji: '🚗',
    description: 'Affordable rides for everyone',
    details: [
      'Budget-friendly pricing',
      'Verified and trained drivers',
      '24/7 service availability',
      'Fixed fare option available',
      'Multiple payment methods',
      'Ride sharing options'
    ],
    features: ['Affordable', '24/7', 'Verified Drivers'],
    bookNowUrl: 'https://gatimitra.com/ride'
  },
  {
    id: 'cab-premium',
    name: 'Cab Premium',
    icon: <UserCircle size={24} />,
    gradient: 'from-purple-400 to-pink-500',
    emoji: '🚘',
    description: 'Luxury rides with comfort',
    details: [
      'Premium luxury vehicles',
      'Professional chauffeurs',
      'Complimentary water & Wi-Fi',
      'Extra spacious interiors',
      'Priority booking advantage',
      'Executive class service'
    ],
    features: ['Luxury Cars', 'Wi-Fi', 'Priority Service'],
    bookNowUrl: 'https://gatimitra.com/ride'
  },
  {
    id: 'bike',
    name: 'Bike',
    icon: <Bike size={24} />,
    gradient: 'from-blue-400 to-cyan-500',
    emoji: '🏍️',
    description: 'Quick rides through traffic',
    details: [
      'Fastest mode in city traffic',
      'Helmet provided for safety',
      'Economical pricing',
      'Ideal for short distances',
      'Quick pickup time',
      'Traffic-optimized routes'
    ],
    features: ['Fastest', 'Economical', 'Helmet Provided'],
    bookNowUrl: 'https://gatimitra.com/ride'
  },
  {
    id: 'auto',
    name: 'Auto',
    icon: <Car size={24} />,
    gradient: 'from-amber-400 to-yellow-500',
    emoji: '🛺',
    description: 'Traditional auto rickshaws',
    details: [
      'Traditional 3-wheeler autos',
      'Metered fare or fixed price',
      'Local driver knowledge',
      'Perfect for narrow lanes',
      'Shared ride options',
      'Local language support'
    ],
    features: ['Traditional', 'Metered', 'Local Routes'],
    bookNowUrl: 'https://gatimitra.com/ride'
  },
  {
    id: 'auto-share',
    name: 'Share Auto',
    icon: <Users2 size={24} />,
    gradient: 'from-teal-400 to-green-500',
    emoji: '🚐',
    description: 'Shared rides, lower cost',
    details: [
      'Cost-effective shared rides',
      'Fixed routes with multiple stops',
      'Frequent service intervals',
      'Social and eco-friendly',
      'Pre-booked seats option',
      'Regular commuter discounts'
    ],
    features: ['Cost Saving', 'Fixed Routes', 'Eco Friendly'],
    bookNowUrl: 'https://gatimitra.com/ride'
  }
];

/* -------------------- IMAGE CARD COMPONENT WITH INFINITE LOOP -------------------- */

function ServiceCard({ service, onClick }) {
  const [showImage, setShowImage] = useState(true); // Start with image
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const imagePath = IMAGE_PATHS[service.id];
  const hasImage = imagePath && !imageError;

  // Infinite loop: 4 seconds image, 4 seconds icon
  useEffect(() => {
    if (!hasImage) return;

    // Load image first
    const img = new Image();
    img.src = imagePath;
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);

    // Start the infinite loop timer
    const intervalId = setInterval(() => {
      setShowImage(prev => !prev);
    }, 4000); // 4 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [imagePath, hasImage]);

  // If no image, always show icon
  const shouldShowImage = hasImage && imageLoaded && showImage;
  const shouldShowIconBackground = !shouldShowImage;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg sm:rounded-xl cursor-pointer h-32 sm:h-36 min-h-[128px]"
    >
      {/* Image Background */}
      {shouldShowImage && (
        <motion.div
          key="image"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <div 
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${imagePath})` }}
          />
          {/* Dark overlay for better text visibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
          {/* Gradient overlay */}
          <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-30`}></div>
        </motion.div>
      )}
      
      {/* Icon Background (shows when image is hidden) */}
      {shouldShowIconBackground && (
        <motion.div
          key="icon"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-90`}>
            {/* Large Icon in Background */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="text-white scale-150">
                {React.cloneElement(service.icon, { size: 48 })}
              </div>
            </div>
          </div>
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent"></div>
        </motion.div>
      )}
      
      {/* Loading State */}
      {hasImage && !imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 animate-pulse">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white opacity-50">
              {React.cloneElement(service.icon, { size: 48 })}
            </div>
          </div>
        </div>
      )}
      
      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      {/* Card Content */}
      <div className="relative z-10 p-2 sm:p-3 h-full flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1 sm:mb-2">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex-shrink-0 ${
              shouldShowImage ? 'bg-white/20 backdrop-blur-sm' : 'bg-white/30'
            } flex items-center justify-center text-white shadow-lg`}>
              {service.icon}
            </div>
            <span className="text-lg sm:text-2xl flex-shrink-0" aria-hidden>{service.emoji}</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
            {service.name}
          </h4>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-200 mb-1 sm:mb-2 line-clamp-2">
            {service.description}
          </p>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs text-orange-300 font-medium group-hover:text-orange-400 transition-colors truncate">
              Learn More →
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${shouldShowImage ? 'bg-green-400' : 'bg-orange-400'}`} />
              <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${!shouldShowImage ? 'bg-green-400' : 'bg-orange-400'}`} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------- MODAL COMPONENT -------------------- */

function ServiceModal({ service, isOpen, onClose }) {
  const imagePath = service ? IMAGE_PATHS[service.id] : null;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !service) return null;

  const handleBookNow = () => {
    if (service.bookNowUrl) {
      window.open(service.bookNowUrl, '_blank');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - responsive padding */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          >
            {/* Modal - no scroll, compact content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[95vw] sm:max-w-md rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col my-auto"
            >
              {/* Modal Header - compact height */}
              <div className={`relative h-28 sm:h-36 flex-shrink-0 overflow-hidden bg-gradient-to-br ${service.gradient}`}>
                {imagePath && (
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat" 
                    style={{ backgroundImage: `url(${imagePath})` }} 
                  />
                )}
                <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} ${imagePath ? 'opacity-75' : 'opacity-90'}`} />
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <div className="text-white text-5xl sm:text-6xl">
                    {service.icon}
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      {service.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-bold text-white truncate leading-tight">{service.name}</h3>
                      <span className="text-xl sm:text-2xl leading-none" aria-hidden>{service.emoji}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-2 right-2 sm:top-3 sm:right-3 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10 flex-shrink-0"
                  aria-label="Close"
                >
                  <X size={18} className="sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Modal Content - compact, no scroll */}
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-3 sm:p-4 overflow-hidden">
                <p className="text-slate-300 text-sm sm:text-base mb-2 leading-snug">
                  {service.description}
                </p>

                {/* Tags - compact */}
                <div className="flex flex-wrap gap-x-1.5 gap-y-1 mb-2">
                  {service.features.map((feature, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-300 text-xs font-medium border border-orange-500/30 whitespace-nowrap"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                <div className="space-y-1">
                  <h4 className="text-white font-semibold text-sm flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                    Service Features
                  </h4>
                  <ul className="space-y-0.5">
                    {service.details.map((detail, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="flex items-start gap-2 text-slate-300 text-xs sm:text-sm leading-tight"
                      >
                        <div className="w-1 h-1 rounded-full bg-gradient-to-r from-orange-400 to-red-500 mt-1.5 flex-shrink-0" />
                        <span>{detail}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Action Buttons - compact */}
                <div className="flex flex-col-reverse sm:flex-row gap-1.5 sm:gap-2 mt-4">
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border border-slate-600 text-slate-300 font-semibold hover:bg-slate-800/50 transition-colors text-xs sm:text-sm"
                  >
                    Close
                  </button>
                  <button 
                    onClick={handleBookNow}
                    className={`w-full sm:flex-1 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-1.5 text-xs sm:text-sm ${
                      service.bookNowUrl
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:opacity-90'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'
                    }`}
                  >
                    {service.bookNowUrl ? (
                      <>
                        Book Now
                        <ExternalLink size={14} className="sm:w-4 sm:h-4" />
                      </>
                    ) : (
                      'Book Now'
                    )}
                  </button>
                </div>

                {service.bookNowUrl && (
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1 text-center">
                    This will redirect you to our partner site
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* -------------------- MAIN COMPONENT -------------------- */

export default function Services() { // Changed component name to Services
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Preload images on component mount
  useEffect(() => {
    preloadImages();
  }, []);

  const suggestions = useMemo(() => {
    if (!query) return [];
    return CITY_LIST.filter((city) =>
      city.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const cityData = selectedCity ? cityPricingRanges[selectedCity] : null;

  const handleServiceClick = (service) => {
    setSelectedService(service);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedService(null), 300);
  };

  // Get city tier for display
  const getCityTier = (city) => {
    if (city === 'Panipat') return 'Premium ⭐';
    if (['Delhi', 'Mumbai', 'Bangalore'].includes(city)) return 'Tier 1';
    if (['Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Pune'].includes(city)) return 'Tier 2';
    return 'Standard';
  };

  return (
    <section
      id="services" // Changed from "pricing" to "services"
      className="py-12 md:py-24 bg-gradient-to-b from-slate-900 via-slate-950 to-black overflow-hidden relative"
    >
      <div className="max-w-7xl mx-auto px-4 relative z-10">

        {/* -------------------- HEADER -------------------- */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-gradient">Our Services & Pricing</span>
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto text-base">
              Explore all our delivery services and check city-specific pricing. Search your city for accurate rates.
            </p>
          </motion.div>
        </div>

        {/* -------------------- OUR SERVICES SECTION -------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-16"
        >
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Our <span className="text-gradient">Services</span>
            </h3>
            <p className="text-slate-300 max-w-xl mx-auto text-sm">
              Explore all the services offered by <span className="text-orange-400 font-semibold">GatiMitra</span>. Click any card to learn more.
            </p>
          </div>

          {/* Services Grid - responsive columns and gap */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
            {services.map((service, index) => (
              <ServiceCard
                key={service.id}
                service={service}
                onClick={() => handleServiceClick(service)}
              />
            ))}
          </div>
          
          {/* Loop Information */}
          <div className="text-center mt-6">
            <p className="text-xs text-slate-400">
            </p>
          </div>
        </motion.div>

        {/* -------------------- SEARCH INPUT -------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative max-w-2xl mx-auto mb-12"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl blur-xl"></div>
            <div className="relative">
              {/* <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedCity(null);
                }}
                placeholder="🔍 Search your city..."
                className="w-full px-5 py-3 pr-12 rounded-xl bg-slate-900/80 backdrop-blur-md border-2 border-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:border-orange-400 focus:bg-slate-900 transition-all duration-300 text-base font-medium shadow-xl hover:border-slate-600"
              /> */}

              {query && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  onClick={() => {
                    setQuery('');
                    setSelectedCity(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800/50 rounded-lg"
                  title="Clear search"
                >
                  <X size={20} />
                </motion.button>
              )}
            </div>
          </div>

          {/* -------------------- SUGGESTIONS -------------------- */}
          <AnimatePresence>
            {suggestions.length > 0 && !selectedCity && (
              <motion.ul
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute z-50 mt-2 w-full bg-slate-900/95 backdrop-blur-md border-2 border-slate-700/50 rounded-xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto"
              >
                {suggestions.map((city, index) => (
                  <motion.li
                    key={city}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => {
                      setSelectedCity(city);
                      setQuery(city);
                    }}
                    className={`px-4 py-3 cursor-pointer transition-all duration-200 ${
                      city === 'Panipat'
                        ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-b border-orange-500/30 hover:from-orange-500/30 hover:to-red-500/30'
                        : 'hover:bg-slate-800/60 border-b border-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={city === 'Panipat' ? 'text-white font-semibold' : 'text-slate-200'}>
                          {city}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          city === 'Panipat' ? 'bg-gradient-to-r from-orange-400 to-red-500 text-white' :
                          ['Delhi', 'Mumbai', 'Bangalore'].includes(city) ? 'bg-blue-500/20 text-blue-300' :
                          ['Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Pune'].includes(city) ? 'bg-green-500/20 text-green-300' :
                          'bg-slate-700/50 text-slate-300'
                        }`}>
                          {getCityTier(city)}
                        </span>
                      </div>
                      {city === 'Panipat' && (
                        <motion.span
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="text-xs px-2 py-1 bg-gradient-to-r from-orange-400 to-red-500 text-white font-bold rounded-full"
                        >
                          🔥 HIGHEST RATES
                        </motion.span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>

        {/* -------------------- RATE CARDS (CITY-SPECIFIC) -------------------- */}
        <AnimatePresence>
          {cityData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              {/* City Header with Tier Info */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="text-xl md:text-2xl font-bold text-white">
                      Pricing for <span className="text-gradient">{selectedCity}</span>
                    </h3>
                    <div className={`px-4 py-1 rounded-full text-sm font-semibold ${
                      selectedCity === 'Panipat' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' :
                      ['Delhi', 'Mumbai', 'Bangalore'].includes(selectedCity) ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' :
                      ['Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Pune'].includes(selectedCity) ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' :
                      'bg-gradient-to-r from-slate-600 to-slate-700 text-white'
                    }`}>
                      {getCityTier(selectedCity)} City • {cityData.cityMultiplier}x Multiplier
                    </div>
                    {selectedCity === 'Panipat' && (
                      <motion.p
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-sm md:text-base text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 font-semibold"
                      >
                        ⭐ Premium Service Area - Highest Rates in India
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Cards Grid - City-Specific Pricing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {/* Food */}
                <CompactPricingCard
                  title="Food Delivery"
                  icon={<Utensils size={20} />}
                  emoji="🍔"
                  data={cityData.Food}
                  gradient="from-orange-400 to-red-500"
                  city={selectedCity}
                  cityData={cityData}
                  bookNowPath="/order"
                />

                {/* Parcel */}
                <CompactPricingCard
                  title="Parcel Delivery"
                  icon={<Package size={20} />}
                  emoji="📦"
                  data={cityData.Parcel}
                  gradient="from-yellow-400 to-orange-500"
                  city={selectedCity}
                  cityData={cityData}
                  bookNowPath="/courier"
                />

                {/* Ride */}
                <CompactPricingCard
                  title="Person / Ride"
                  icon={<Users size={20} />}
                  emoji="🛵"
                  data={cityData.Ride}
                  gradient="from-red-400 to-pink-500"
                  city={selectedCity}
                  cityData={cityData}
                  bookNowPath="/ride"
                />
              </div>

              {/* Pricing Note */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8 text-center"
              >
                <p className="text-slate-400 text-sm max-w-2xl mx-auto">
                  <span className="text-orange-300 font-medium">Note:</span> Prices vary based on city tier, 
                  demand, distance, and time of day. {selectedCity === 'Panipat' ? 
                  'Panipat has premium rates due to high demand and specialized services.' : 
                  `Rates in ${selectedCity} are ${selectedCity === 'Delhi' || selectedCity === 'Mumbai' || selectedCity === 'Bangalore' ? 
                  'higher than average' : 'competitive'} for this tier.`}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Service Modal */}
      <ServiceModal 
        service={selectedService} 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
      />
    </section>
  );
}

/* -------------------- COMPACT PRICING CARD WITH CITY INFO -------------------- */

function CompactPricingCard({ title, icon, emoji, data, gradient, city, cityData, bookNowPath = '' }) {
  const isPanipat = city === 'Panipat';
  const isTier1 = ['Delhi', 'Mumbai', 'Bangalore'].includes(city);
  const isTier2 = ['Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Pune'].includes(city);

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group relative overflow-hidden rounded-xl p-5 transition-all duration-300 ${
        isPanipat
          ? 'bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-orange-400/40'
          : isTier1
          ? 'bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-blue-500/30'
          : isTier2
          ? 'bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-green-500/30'
          : 'bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-700/50 hover:border-slate-600'
      }`}
    >
      {/* City Tier Indicator */}
      <div className={`absolute top-3 right-3 text-xs px-2 py-1 rounded-full font-medium ${
        isPanipat ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-300' :
        isTier1 ? 'bg-blue-500/20 text-blue-300' :
        isTier2 ? 'bg-green-500/20 text-green-300' :
        'bg-slate-700/50 text-slate-300'
      }`}>
        {isPanipat ? 'Premium' : isTier1 ? 'Tier 1' : isTier2 ? 'Tier 2' : 'Standard'}
      </div>

      {/* Background Gradient Blur */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-xl`}
      ></div>

      {/* Glow Effect based on city tier */}
      {isPanipat ? (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent opacity-50 group-hover:opacity-70 transition-opacity"></div>
      ) : isTier1 ? (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-30 group-hover:opacity-50 transition-opacity"></div>
      ) : isTier2 ? (
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-30 group-hover:opacity-50 transition-opacity"></div>
      ) : null}

      <div className="relative z-10">
        {/* Header - Compact */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-shadow`}
            >
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <span className="text-2xl">{emoji}</span>
            </div>
          </div>
        </div>

        {/* Main Price - City Specific */}
        <div className={`text-2xl font-bold mb-2 ${isPanipat ? 'text-gradient' : 'text-orange-400'}`}>
          ₹{data.min} – ₹{data.max}
        </div>
        
        {/* City Multiplier Info */}
        <div className="text-xs text-slate-400 mb-4">
          {cityData.cityMultiplier}x {city === 'Panipat' ? 'premium multiplier' : 'city multiplier'}
        </div>

        {/* Details - Compact */}
        <div className="space-y-2 border-t border-slate-700/50 pt-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400 font-medium">Base Fare</span>
            <span className="text-sm text-orange-300 font-semibold">{data.base}</span>
          </div>

          {data.perKm && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-medium">Per KM</span>
              <span className="text-sm text-orange-300 font-semibold">{data.perKm}</span>
            </div>
          )}

          {data.additional && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-medium">Extra Charge</span>
              <span className="text-sm text-orange-300 font-semibold">{data.additional}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-700/30">
            <span className="text-xs text-slate-400 font-medium">⏱ Avg Time</span>
            <span className="text-sm text-blue-300 font-semibold">{data.avgTime} min</span>
          </div>
        </div>

        {/* CTA Button - City Specific - links to order/ride/courier */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => window.open(`https://gatimitra.com${bookNowPath || ''}`, '_blank')}
          className={`w-full mt-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
            isPanipat
              ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md hover:shadow-lg'
              : isTier1
              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md hover:shadow-lg'
              : isTier2
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md hover:shadow-lg'
              : 'bg-slate-800/50 border border-orange-400/30 text-orange-300 hover:bg-slate-800 hover:border-orange-400/60'
          }`}
        >
          {isPanipat ? '⭐ Book Premium' : `Book in ${city}`}
        </motion.button>
      </div>
    </motion.div>
  );
}