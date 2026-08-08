'use client';

import { Store } from 'lucide-react';
import { GM, GatiMitraWord, GM_POPPINS } from '@/app/auth/login/components/gatimitra-brand';

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
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: GM.gati }}
        >
          <Store className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h1 className={`${GM_POPPINS} text-sm font-bold leading-tight tracking-tight text-slate-900 sm:text-base`}>
            Create your <GatiMitraWord /> Partner Account
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
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{ backgroundColor: step >= s ? GM.gati : '#e2e8f0' }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="text-center px-1 sm:px-2">
      <div className="relative mx-auto mb-5 inline-flex items-center justify-center">
        <span
          className="absolute -top-0.5 -left-2 h-1.5 w-1.5 rounded-full opacity-90 sm:-left-3 sm:h-2 sm:w-2"
          style={{ backgroundColor: `${GM.gati}33` }}
          aria-hidden
        />
        <span
          className="absolute top-0.5 -right-3 h-1 w-1 rounded-full opacity-80 sm:-right-4 sm:h-1.5 sm:w-1.5"
          style={{ backgroundColor: `${GM.mitra}66` }}
          aria-hidden
        />
        <span
          className="absolute -bottom-0.5 right-0 h-1.5 w-1.5 rounded-full opacity-90 sm:right-1 sm:h-2 sm:w-2"
          style={{ backgroundColor: `${GM.gati}33` }}
          aria-hidden
        />
        <div
          className="flex h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] items-center justify-center rounded-full ring-4"
          style={{ backgroundColor: GM.gati, boxShadow: `0 0 0 4px ${GM.gati}18` }}
        >
          <Store className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={1.75} />
        </div>
      </div>

      <h1
        className={`${GM_POPPINS} mx-auto max-w-[20rem] text-[1.15rem] font-bold leading-snug tracking-tight text-slate-900 sm:max-w-none sm:text-[1.45rem]`}
      >
        Create your <GatiMitraWord /> Partner Account
      </h1>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>

      <div
        className="mx-auto mt-5 flex max-w-xs gap-2 sm:mt-6 sm:max-w-[240px]"
        aria-label={`Registration step ${step} of 3`}
      >
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: step >= s ? GM.gati : '#e2e8f0' }}
          />
        ))}
      </div>
    </div>
  );
}
