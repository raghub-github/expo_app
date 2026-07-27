'use client';

import { Store } from 'lucide-react';

type RegisterFormHeaderProps = {
  step: 1 | 2 | 3;
  subtitle: string;
  /** Tighter header for the wide profile step */
  compact?: boolean;
};

export function RegisterFormHeader({ step, subtitle, compact = false }: RegisterFormHeaderProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600 shadow-md shadow-orange-600/20">
          <Store className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h1 className="text-sm font-bold leading-tight tracking-tight text-slate-900 sm:text-base">
            Create your{' '}
            <span className="text-emerald-600">Gati</span>
            <span className="text-orange-500">Mitra</span>{' '}
            Partner Account
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div
          className="flex w-full max-w-[140px] gap-1.5 sm:w-28 sm:shrink-0"
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

  return (
    <div className="text-center">
      <div className="relative mb-6 inline-flex items-center justify-center">
        <span className="absolute -top-1 -left-4 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute top-1 -right-5 h-1.5 w-1.5 rounded-full bg-orange-300/80" aria-hidden />
        <span className="absolute -bottom-0.5 right-1 h-2 w-2 rounded-full bg-orange-200/90" aria-hidden />
        <span className="absolute bottom-3 -left-5 h-1 w-1 rounded-full bg-orange-100" aria-hidden />
        <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-orange-600 shadow-lg shadow-orange-600/20 ring-4 ring-orange-50">
          <Store className="h-8 w-8 text-white" strokeWidth={1.75} />
        </div>
      </div>

      <h1 className="whitespace-nowrap text-[1.2rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-[1.5rem]">
        Create your{' '}
        <span className="text-emerald-600">Gati</span>
        <span className="text-orange-500">Mitra</span>{' '}
        Partner Account
      </h1>
      <p className="mt-2.5 text-sm text-slate-500">{subtitle}</p>

      <div
        className="mx-auto mt-6 flex max-w-[220px] gap-2"
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
