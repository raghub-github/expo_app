'use client';

import { Lock } from 'lucide-react';

type LoginFormHeaderProps = {
  subtitle?: string;
};

export function LoginFormHeader({
  subtitle = 'Sign in with Google or your registered mobile number',
}: LoginFormHeaderProps) {
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center mb-6">
        <span className="absolute -top-1 -left-4 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute top-1 -right-5 h-1.5 w-1.5 rounded-full bg-orange-300/80" aria-hidden />
        <span className="absolute -bottom-0.5 right-1 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute bottom-3 -left-5 h-1 w-1 rounded-full bg-orange-100" aria-hidden />
        <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-orange-600 shadow-lg shadow-orange-600/20 ring-4 ring-orange-50">
          <Lock className="h-8 w-8 text-white" strokeWidth={1.75} />
        </div>
      </div>

      <h1 className="text-[1.2rem] sm:text-[1.5rem] font-bold text-slate-900 leading-snug tracking-tight whitespace-nowrap">
        Sign in to your{' '}
        <span className="text-emerald-600">Gati</span>
        <span className="text-orange-500">Mitra</span>{' '}
        Partner Account
      </h1>
      <p className="mt-2.5 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
