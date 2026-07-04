'use client';

import { Store } from 'lucide-react';

type RegisterFormHeaderProps = {
  step: 1 | 2 | 3;
  subtitle: string;
};

export function RegisterFormHeader({ step, subtitle }: RegisterFormHeaderProps) {
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center mb-6">
        <span className="absolute -top-1 -left-4 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute top-1 -right-5 h-1.5 w-1.5 rounded-full bg-orange-300/80" aria-hidden />
        <span className="absolute -bottom-0.5 right-1 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute bottom-3 -left-5 h-1 w-1 rounded-full bg-orange-100" aria-hidden />
        <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-orange-600 shadow-lg shadow-orange-600/20 ring-4 ring-orange-50">
          <Store className="h-8 w-8 text-white" strokeWidth={1.75} />
        </div>
      </div>

      <h1 className="text-[1.2rem] sm:text-[1.5rem] font-bold text-slate-900 leading-snug tracking-tight whitespace-nowrap">
        Create your{' '}
        <span className="text-emerald-600">Gati</span>
        <span className="text-orange-500">Mitra</span>{' '}
        Partner Account
      </h1>
      <p className="mt-2.5 text-sm text-slate-500">{subtitle}</p>

      <div
        className="flex gap-2 mt-6 max-w-[220px] mx-auto"
        aria-label={`Registration step ${step} of 3`}
      >
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              step >= s ? 'bg-orange-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function RegisterSecurityTrust() {
  return (
    <p className="mt-8 flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-500">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 14.59l-3.3-3.29 1.41-1.42L11 12.17l4.89-4.88 1.41 1.42L11 15.59z" />
        </svg>
      </span>
      Your information is secure with us
    </p>
  );
}
