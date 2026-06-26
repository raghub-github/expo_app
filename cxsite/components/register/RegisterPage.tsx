'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAppDispatch } from '@/lib/hooks'
import { signUpWithPhone } from '@/lib/slices/authSlice'
import AuthModal from '@/components/auth/AuthModal'

export default function RegisterPage() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [storeName, setStoreName] = useState('')
  const [email, setEmail] = useState('')

  return (
    <>
      <header className="bg-[#0a1929] sticky top-0 z-[1000] py-4 px-6 shadow-lg backdrop-blur-[10px] bg-[rgba(10,25,41,0.95)]">
        <div className="max-w-[1180px] mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <img src="/img/logo.png" alt="GatiMitra Logo" className="w-10 h-10 object-contain" />
            <div className="flex items-center gap-0.5">
              <span className="text-3xl font-bold text-[#16c2a5]">Gati</span>
              <span className="text-3xl font-bold text-[#ff6b35]">Mitra</span>
            </div>
          </Link>
          <nav className="flex gap-6 items-center">
            <Link href="#" className="text-[#8a94a6] no-underline font-medium transition-colors hover:text-white">Home</Link>
            <Link href="#" className="text-[#8a94a6] no-underline font-medium transition-colors hover:text-white">Onboarding</Link>
            <Link href="#" className="text-[#8a94a6] no-underline font-medium transition-colors hover:text-white">Features</Link>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="bg-gradient-to-br from-[#6c63ff] to-[#5752d4] text-white px-6 py-2.5 rounded-[50px] font-semibold no-underline transition-all shadow-lg hover:-translate-y-0.5 hover:shadow-xl"
            >
              Merchant Login
            </button>
          </nav>
        </div>
      </header>

      <section className="relative py-12 px-6 min-h-[78vh] flex items-center bg-gradient-to-br from-[rgba(10,25,41,0.85)] to-[rgba(26,44,66,0.9)] overflow-hidden">
        <div className="absolute inset-0 z-[-1]">
          <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1552566626-52f8b828add9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80')] bg-cover bg-center brightness-[0.4]"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(108,99,255,0.1)] to-[rgba(255,101,132,0.1)]"></div>
        </div>

        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
          <div className="text-white">
            <div className="inline-block bg-white/10 backdrop-blur-[10px] px-5 py-2 rounded-[50px] text-sm mb-6 border border-white/20">
              Premium Merchant Platform
            </div>
            <h1 className="text-5xl mb-5 bg-gradient-to-br from-white to-[#a29bfe] bg-clip-text text-transparent">
              Go Live on GatiMitra in <span className="text-[#ff6584]">5 Minutes!</span>
            </h1>
            <p className="text-lg text-white/82 max-w-[540px] mb-10 leading-relaxed">
              Join India&apos;s fastest-growing merchant network. Get discovered by thousands of customers,
              boost your sales, and grow your business with our premium platform.
            </p>
            <div className="flex flex-col gap-5 mt-6">
              {[
                'Free Registration & No Hidden Charges',
                'Access to 2M+ Active Shoppers',
                '30% Average Sales Growth for Merchants',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-4 text-white/90">
                  <div className="w-9 h-9 bg-white/10 rounded-[10px] flex items-center justify-center text-[#a29bfe] text-base">
                    <i className="fas fa-check"></i>
                  </div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-[20px] rounded-2xl p-9 shadow-2xl border border-white/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-br from-[#6c63ff] to-[#5752d4]"></div>
            <div className="text-center mb-6">
              <div className="inline-block bg-gradient-to-br from-[#ff6584] to-[#ff8e9e] text-white px-4 py-1 rounded-[18px] text-xs font-semibold mb-4">
                FREE REGISTRATION
              </div>
              <h2 className="text-3xl text-white mb-1">Register Your Store</h2>
              <p className="text-white/72 text-sm">Start growing your business in minutes</p>
            </div>

            <form className="flex flex-col gap-5">
              <div className="relative">
                <label className="block text-white/90 mb-1 font-medium">Store Phone Number</label>
                <div className="relative">
                  <i className="fas fa-phone absolute left-5 top-1/2 -translate-y-1/2 text-[#6c63ff] text-lg z-[2]"></i>
                  <span className="absolute left-[3.2rem] top-1/2 -translate-y-1/2 text-[#1A1A2E] font-medium z-[2]">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter 10-digit phone number"
                    className="w-full pl-[4.7rem] pr-5 py-4 bg-white/90 border-2 border-transparent rounded-xl text-base transition-all shadow-sm focus:outline-none focus:border-[#6c63ff] focus:bg-white focus:shadow-[0_0_0_3px_rgba(108,99,255,0.2)]"
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <div className="relative">
                <label className="block text-white/90 mb-1 font-medium">Store/Business Name</label>
                <div className="relative">
                  <i className="fas fa-store-alt absolute left-5 top-1/2 -translate-y-1/2 text-[#6c63ff] text-lg z-[2]"></i>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Enter your store name"
                    className="w-full pl-[3.1rem] pr-5 py-4 bg-white/90 border-2 border-transparent rounded-xl text-base transition-all shadow-sm focus:outline-none focus:border-[#6c63ff] focus:bg-white focus:shadow-[0_0_0_3px_rgba(108,99,255,0.2)]"
                    required
                  />
                </div>
              </div>

              <div className="relative">
                <label className="block text-white/90 mb-1 font-medium">Email Address (Optional)</label>
                <div className="relative">
                  <i className="fas fa-envelope absolute left-5 top-1/2 -translate-y-1/2 text-[#6c63ff] text-lg z-[2]"></i>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email for updates"
                    className="w-full pl-[3.1rem] pr-5 py-4 bg-white/90 border-2 border-transparent rounded-xl text-base transition-all shadow-sm focus:outline-none focus:border-[#6c63ff] focus:bg-white focus:shadow-[0_0_0_3px_rgba(108,99,255,0.2)]"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="bg-gradient-to-br from-[#6c63ff] to-[#5752d4] text-white py-4 border-none rounded-xl text-base font-semibold cursor-pointer transition-all flex items-center justify-center gap-2.5 shadow-lg mt-1 hover:-translate-y-0.5 hover:shadow-xl"
              >
                <i className="fas fa-paper-plane"></i>
                Send OTP to Register
              </button>

              <div className="text-center mt-5 text-white/70 text-sm">
                By continuing, you agree to our{' '}
                <a href="#" className="text-[#a29bfe] no-underline font-medium hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[#a29bfe] no-underline font-medium hover:underline">Privacy Policy</a>
              </div>
            </form>
          </div>
        </div>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  )
}

