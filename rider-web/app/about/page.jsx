"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Script from 'next/script';
import Head from 'next/head';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Award,
  Users,
  Target,
  Heart,
  Zap,
  Globe,
  TrendingUp,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const About = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    
    // Handle scroll for navbar shadow
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const stats = [
    { value: '50+', label: 'Team Members' },
    { value: '10K+', label: 'Deliveries Daily' },
    { value: '15+', label: 'Cities Served' },
    { value: '95%', label: 'Customer Satisfaction' },
  ];

  const values = [
    {
      icon: <Zap className="w-8 h-8" />,
      title: 'Speed & Efficiency',
      description: 'We deliver fast without compromising on safety. Technology drives every decision.'
    },
    {
      icon: <Heart className="w-8 h-8" />,
      title: 'Customer First',
      description: 'Every interaction is designed around customer needs. We listen, learn, and improve.'
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: 'Community Impact',
      description: 'We create opportunities for riders and deliver value to communities across India.'
    },
    {
      icon: <Award className="w-8 h-8" />,
      title: 'Excellence',
      description: 'We set high standards and continuously push ourselves to be better every day.'
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: 'Innovation',
      description: 'We embrace technology to solve real-world delivery challenges creatively.'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Team Spirit',
      description: 'Success is built together. We celebrate wins and learn from challenges as one team.'
    },
  ];

  const teamMembers = [
    {
      name: 'Bhim Pratap',
      title: 'CEO & Founder',
      bio: 'Visionary leader with 5+ years of overall experience. Passionate about revolutionizing local delivery and logistics in India.',
      image: '/bhim.png',
      social: {
        linkedin: '#',
        twitter: '#',
        email: 'bhim@gatimitra.com'
      }
    },
    {
      name: 'Bhishm Pratap',
      title: 'Co-Founder',
      bio: 'Strategic leader focused on business growth and market expansion. Drives partnerships and operational excellence across platforms.',
      image: '/bhishm.jpeg',
      social: {
        linkedin: '#',
        twitter: '#',
        email: 'bhishm@gatimitra.com'
      }
    },
    {
      name: 'Raghu Bhunia',
      title: 'Tech Lead / Lead Engineer',
      bio: 'Technology innovator building scalable systems for food delivery, ride booking, and parcel services. Ensures platform reliability and performance.',
      image: '/raghu.png',
      social: {
        linkedin: '#',
        twitter: '#',
        email: 'raghu@gatimitra.com'
      }
    },
  ];

  const milestones = [
    { year: '2025', event: 'GatiMitra Founded', description: 'Started with a vision to revolutionize local services — food delivery, ride booking, and parcel courier delivery. Operations began from Nawada, Bihar.' },
    { year: '2026', event: 'Platform Launch & Expansion', description: 'Multi-service unified platform goes live. Food delivery (order), ride booking (ride), and parcel/courier services (courier) now live. Expanding to more cities including Kolkata (coming soon).' },
  ];

  return (
    <>
      <div className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 ${
        isScrolled ? 'shadow-md' : ''
      }`}>
        <Navbar />
      </div>
      
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
      
      <div className="min-h-screen bg-white pt-[70px]"> {/* Adjust based on navbar height */}
        <Head>
          <title>About GatiMitra | CEO & Founder Bhim Pratap</title>
          <meta name="description" content="GatiMitra is a multi-service delivery platform founded in 2025. CEO & Founder: Bhim Pratap." />
        </Head>

        {/* About GatiMitra Badge - Moved here with 10px gap from navbar */}
        <div className="flex justify-center items-center w-full mt-[10px] mb-3">
          <div className="inline-flex items-center px-5 py-2 bg-blue-100 text-blue-700 rounded-full text-base font-semibold shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.25l6.16 3.73-1.64-7.03 5.48-4.73-7.19-.62L12 2.25l-2.81 6.35-7.19.62 5.48 4.73-1.64 7.03L12 17.25z" />
            </svg>
            <span className="font-semibold">About GatiMitra</span>
          </div>
        </div>

        {/* Hero Section - Image and Paragraph on same line */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-white pt-0 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="flex flex-col lg:flex-row gap-8 items-stretch">
              {/* Left: Image */}
              <div className="lg:w-1/2 flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <img 
                    src="/about.png" 
                    alt="About GatiMitra" 
                    className="w-full h-auto max-h-[500px] object-contain rounded-2xl" 
                  />
                </motion.div>
              </div>
              
              {/* Right: Text Content with same height as image */}
              <div className="lg:w-1/2 flex flex-col justify-center">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="h-full flex flex-col justify-center"
                >
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 leading-snug">
                    Delivering Excellence,<br />
                    <span className="text-blue-600">Across All Services</span>
                  </h1>
                  <p className="text-base md:text-lg lg:text-xl text-gray-700 mb-6 leading-relaxed">
                    GatiMitra is revolutionizing local services in India through technology, innovation, and a commitment to excellence. We provide fast, reliable services for Food Delivery, Ride Booking, and Parcel/Courier Delivery — all in one unified platform.
                  </p>
                </motion.div>
              </div>
            </div>
            
            {/* Stats Section - Below image and paragraph */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="text-center"
                  >
                    <div className="text-2xl md:text-3xl font-bold text-blue-600 mb-1">{stat.value}</div>
                    <div className="text-gray-600 text-sm md:text-base">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-12 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Our Mission</h2>
                  <p className="text-gray-600 leading-relaxed">
                    To provide fast, reliable, and affordable services for food delivery, ride booking, and parcel courier delivery that connect businesses, riders, and consumers across India. We empower delivery partners with technology and opportunities while ensuring customer satisfaction at every step.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Our Vision</h2>
                  <p className="text-gray-600 leading-relaxed">
                    To become India's most trusted multi-service platform for food delivery, ride booking, and parcel courier services. We envision a future where every user gets fast, reliable service across all their local delivery and mobility needs.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Company Values */}
        <section className="py-12 md:py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="text-2xl md:text-3xl font-bold text-gray-900 mb-4"
              >
                Our Core Values
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-gray-600 max-w-2xl mx-auto"
              >
                These values guide every decision we make and shape our company culture
              </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {values.map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="bg-white rounded-xl p-6 border border-gray-200 hover:border-blue-600 hover:shadow-lg transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                    {value.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{value.title}</h3>
                  <p className="text-gray-600">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CEO Section */}
        <section className="py-12 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
              {/* Images on Left */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="flex justify-center items-center"
              >
                <div className="grid grid-cols-3 gap-4 md:gap-6 w-full max-w-md">
                  {teamMembers.map((member, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative w-20 h-20 md:w-32 md:h-32 mb-2 md:mb-4 ring-4 ring-blue-600 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600">
                        <img
                          src={member.image}
                          alt={member.name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <h3 className="text-xs md:text-base font-bold text-gray-900 text-center mb-1">{member.name}</h3>
                      <p className="text-blue-600 font-semibold text-xs md:text-xs text-center">{member.title}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Text on Right */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                    The Faces Behind Our Growth
                  </h2>
                  <div className="w-16 h-1 bg-gradient-to-r from-blue-600 to-orange-500 mb-6"></div>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    GatiMitra's success story is built on the vision and dedication of our founding team. With a combined experience and unwavering commitment to excellence, our leaders drive innovation and set new standards in the multi-service delivery industry.
                  </p>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    Each founder brings unique expertise and perspective, creating a balanced team focused on revolutionizing how India accesses food delivery, ride booking, and parcel services. Their constant endeavor to redefine themselves and push boundaries has made GatiMitra a beacon of excellence.
                  </p>
                  <div className="space-y-4">
                    {[
                      'Innovative thinking and customer-centric approach',
                      'Years of combined industry experience',
                      'Commitment to building India\'s best service platform',
                      'Dedicated to empowering riders and users'
                    ].map((point, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />
                        <span className="text-gray-700">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Milestones */}
        <section className="py-12 md:py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="text-2xl md:text-3xl font-bold text-gray-900 mb-4"
              >
                Our Journey
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-gray-600 max-w-2xl mx-auto"
              >
                From a small startup to a leading delivery platform across India
              </motion.p>
            </div>

            <div className="max-w-3xl mx-auto">
              {milestones.map((milestone, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="mb-8 flex gap-6 items-center"
                >
                  <div className="flex-shrink-0 w-24 font-bold text-2xl text-blue-600">
                    {milestone.year}
                  </div>
                  <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{milestone.event}</h3>
                    <p className="text-gray-600">{milestone.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="py-12 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="text-2xl md:text-3xl font-bold text-gray-900 mb-4"
              >
                Why Choose GatiMitra?
              </motion.h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                'State-of-the-art technology and tracking',
                'Fast and reliable delivery network',
                'Competitive pricing with transparent costs',
                'Professional and courteous delivery partners',
                '24/7 customer support and assistance',
                'Secure payment options and guarantees',
              ].map((point, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <span className="text-gray-700">{point}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 md:py-16 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center text-white"
            >
              <h2 className="text-2xl md:text-3xl font-bold mb-6">Join Our Growing Community</h2>
              <p className="mb-8 text-blue-100">
                Become part of India's fastest-growing delivery network
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="/careers"
                  className="inline-flex items-center justify-center bg-white text-blue-600 px-8 py-3.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                  View Careers
                  <ArrowRight className="w-5 h-5 ml-2" />
                </a>
                <a
                  href="/"
                  className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-3.5 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  Get Started
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <Script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "GatiMitra",
              "url": "https://gatimitra.com",
              "logo": "https://gatimitra.com/logo.png",
              "founder": {
                "@type": "Person",
                "name": "Bhim Pratap",
                "jobTitle": "CEO & Founder",
                "image": "https://gatimitra.com/bhim.png"
              },
              "employee": [
                {
                  "@type": "Person",
                  "name": "Bhishm Pratap",
                  "jobTitle": "Co-Founder"
                },
                {
                  "@type": "Person",
                  "name": "Raghu Bhunia",
                  "jobTitle": "Tech Lead / Lead Engineer"
                }
              ]
            })
          }}
        />

        <Footer />
      </div>
    </>
  );
};

export default About;