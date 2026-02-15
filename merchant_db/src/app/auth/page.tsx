'use client';

import Link from 'next/link';
import { ChefHat, Store, ArrowRight } from 'lucide-react';

export default function AuthHome() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="GatiMitra" className="h-8 w-auto object-contain" />
          <span className="text-lg font-semibold text-slate-800">GatiMitra</span>
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Partner Portal</span>
      </header>

      {/* Main */}
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 py-8 sm:py-12">
        <div className="w-full max-w-sm">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-auto items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60 mb-5 px-3 py-2">
              <img src="/logo.png" alt="GatiMitra" className="h-10 w-auto object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
              Welcome to GatiMitra
            </h1>
            <p className="text-sm text-slate-600 mb-1">
              Manage your store and grow your business
            </p>
            <p className="text-xs text-slate-500">
              Join thousands of restaurant partners
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/auth/register"
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span className="flex items-center gap-2.5">
                <Store className="h-4 w-4" />
                Join GatiMitra as a merchant
              </span>
              <ArrowRight className="h-4 w-4 opacity-80" />
            </Link>
            <Link
              href="/auth/login"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-400 hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span className="flex items-center gap-2.5">
                <ChefHat className="h-4 w-4 text-blue-600" />
                Sign in to your partner account
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
