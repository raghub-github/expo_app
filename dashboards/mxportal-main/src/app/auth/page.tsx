'use client'


import { useState } from 'react';
import Link from 'next/link';
import { ChefHat, Store, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LoginModal } from '@/components';

export default function AuthHome() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const router = useRouter();

  // Handler for Phone+OTP login (after OTP verification)
  const handlePhoneLogin = async (phone: string) => {
    // Call backend to resolve parent and stores
    const res = await fetch('/api/auth/resolve-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!data.parentExists) {
      // Continue registration flow
      router.push('/auth/register-phone?phone=' + encodeURIComponent(phone));
      setLoginModalOpen(false);
      return;
    }
    if (data.stores.length === 1) {
      // Redirect to merchant portal for the single store
      router.push(`/merchant-portal/${data.stores[0].store_id}`);
      setLoginModalOpen(false);
      return;
    }
    // If multiple stores, show store selection (handled in next step)
    // For now, just alert (replace with store selection modal in next step)
    alert('Multiple stores found. Please select a store in the next step.');
    // TODO: Show StoreSelectionList modal here
  };

  // Handler for Google login (Agent flow)
  const handleGoogleLogin = () => {
    // TODO: Integrate Google OAuth logic here (e.g., using next-auth or custom Google login)
    // On success, redirect to search page (agent flow)
    router.push('/auth/search');
    setLoginModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <ChefHat className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">GatiMitra</h1>
        </div>
        <p className="text-sm text-slate-600">Partner Portal</p>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-70px)] px-4">
        <div className="w-full max-w-2xl">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <div className="inline-block mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-30"></div>
                <div className="relative bg-white p-6 rounded-full">
                  <Store className="w-12 h-12 text-blue-600" />
                </div>
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Welcome to GatiMitra
            </h2>
            <p className="text-lg text-slate-600 mb-2">
              Manage your store and grow your business
            </p>
            <p className="text-sm text-slate-500">
              Join thousands of restaurant partners on GatiMitra
            </p>
          </div>

          {/* Register Button moved up, Login stays below with gap */}
          <div className="flex flex-col items-center w-full mb-8">
            <div className="w-full max-w-xl mb-10">
              <Link href="/auth/register-phone">
                <button
                  onClick={() => setIsLoading(true)}
                  className="w-full group relative overflow-hidden rounded-2xl py-6 px-8 font-semibold text-white text-lg transition-all duration-300 hover:shadow-2xl cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 group-hover:from-blue-700 group-hover:to-blue-800 transition-all"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-all"></div>
                  <div className="relative flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Store className="w-5 h-5" />
                      Register a New Store
                    </span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </Link>
            </div>
            <div className="w-full max-w-xl">
              <Link href="/auth/login-store">
                <button
                  className="w-full group relative overflow-hidden rounded-2xl py-6 px-8 font-semibold text-lg transition-all duration-300 border-2 border-blue-600 hover:bg-blue-50 hover:border-blue-700 hover:shadow-lg cursor-pointer"
                >
                  <div className="relative flex items-center justify-between text-blue-600 group-hover:text-blue-700">
                    <span className="flex items-center gap-2">
                      <ChefHat className="w-5 h-5" />
                      Login to Existing Store
                    </span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
