'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Sparkles,
  Mail,
  MessageSquare,
  HelpCircle,
  Zap,
  Clock,
  DollarSign,
  Shield,
  CreditCard,
  Headphones,
  Star,
  Car,
  TrendingUp,
  MapPin,
  BookOpen
} from 'lucide-react';

const faqs = [
  {
    question: 'How are delivery charges calculated for riders?',
    answer: 'Charges are based on distance, traffic conditions, and service type. The fare is calculated upfront and shown before accepting the delivery.',
    icon: <DollarSign className="w-4 h-4" />
  },
  {
    question: 'What happens if a delivery is damaged or disputed?',
    answer: 'Contact support immediately. We provide insurance coverage and handle customer disputes. Document the delivery condition with photos for protection.',
    icon: <Shield className="w-4 h-4" />
  },
  {
    question: 'How do I handle customer payments and tips?',
    answer: 'All payments are processed digitally through the app. Tips are added directly to your earnings and paid out weekly.',
    icon: <CreditCard className="w-4 h-4" />
  },
  {
    question: 'What support is available for riders during deliveries?',
    answer: '24/7 rider support through chat and call. Emergency assistance and route optimization help are always available.',
    icon: <Headphones className="w-4 h-4" />
  },
  {
    question: 'How often are rider payments processed?',
    answer: 'Earnings are processed weekly. Instant cash-out options are available for verified riders with a small processing fee.',
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    question: 'Can I choose my delivery areas and timings?',
    answer: 'Yes, riders can set preferred zones and working hours. You can also toggle availability on/off as per your schedule.',
    icon: <MapPin className="w-4 h-4" />
  },
];

export default function ContactFAQSection() {
  const [expanded, setExpanded] = useState(0);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setSuccessMsg('Message sent successfully 🚀');
        setForm({ name: '', email: '', phone: '', city: '', message: '' });

        // ✅ Auto-hide success message after 3 seconds
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg(result.error || 'Failed to submit form.');
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
    }

    setLoading(false);
  };

  return (
    <section
      id="contact"
      className="relative min-h-screen flex items-center bg-gradient-to-b from-slate-950 via-black to-slate-950 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 relative z-10 w-full">
        {/* HEADER */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            Support & Help Center
          </div>

          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-white">Contact Us & </span>
            <span className="text-orange-400">FAQs</span>
          </h2>

          <p className="text-slate-400 max-w-xl mx-auto">
            Get instant answers or send us a message anytime.
          </p>
        </div>

        {/* CONTENT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* CONTACT FORM */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Mail className="w-5 h-5 text-orange-400" />
              Send us a message
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  name="name"
                  placeholder="Your Name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  suppressHydrationWarning
                  className="input"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email Address"
                  value={form.email}
                  onChange={handleChange}
                  required
                  suppressHydrationWarning
                  className="input"
                />
              </div>

              <input
                name="phone"
                placeholder="Phone Number"
                value={form.phone}
                onChange={handleChange}
                required
                suppressHydrationWarning
                className="input"
              />

              <div className="form-group">
                <label htmlFor="city" className="text-white">
                  
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  placeholder="Enter your city"
                  value={form.city}
                  onChange={handleChange}
                  required
                  suppressHydrationWarning
                  className="input"
                />
              </div>

              <textarea
                name="message"
                rows={3}
                placeholder="Your Message"
                value={form.message}
                onChange={handleChange}
                required
                suppressHydrationWarning
                className="input resize-none"
              />

              <AnimatePresence>
                {successMsg && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-green-400 text-sm"
                  >
                    {successMsg}
                  </motion.p>
                )}
                {errorMsg && (
                  <p className="text-red-400 text-sm">{errorMsg}</p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition"
              >
                {loading ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          </div>

          {/* FAQ SECTION - compact to avoid overlap */}
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white mb-2">FAQs</h3>

            {faqs.map((faq, i) => (
              <div
                key={i}
                onClick={() => setExpanded(expanded === i ? -1 : i)}
                className="cursor-pointer bg-slate-900/70 border border-slate-800 rounded-lg p-2.5"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="text-orange-400 mt-0.5 flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">
                      {faq.icon}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white font-semibold text-sm leading-snug">{faq.question}</h4>
                      {expanded === i && (
                        <p className="text-slate-400 mt-1 text-xs leading-snug">{faq.answer}</p>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-orange-400 flex-shrink-0 transition ${
                      expanded === i ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* shared input styles */}
      <style jsx>{`
        .input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(100, 116, 139, 0.3);
          border-radius: 12px;
          color: white;
        }
        .input:focus {
          outline: none;
          border-color: #fb923c;
        }
      `}</style>
    </section>
  );
}