'use client';

import { Lock } from 'lucide-react';
import { GM, GatiMitraWord, GM_POPPINS } from './gatimitra-brand';

type LoginFormHeaderProps = {
  subtitle?: string;
  compact?: boolean;
};

export function LoginFormHeader({
  subtitle = 'Sign in with Google or your registered mobile number',
  compact = false,
}: LoginFormHeaderProps) {
  return (
    <div className="text-center px-1 sm:px-2">
      <div className={`relative mx-auto inline-flex items-center justify-center ${compact ? 'mb-3.5' : 'mb-5'}`}>
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
          className={`flex items-center justify-center rounded-full ring-4 ${
            compact ? 'h-14 w-14' : 'h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem]'
          }`}
          style={{ backgroundColor: GM.gati, boxShadow: `0 0 0 4px ${GM.gati}18` }}
        >
          <Lock
            className={`text-white ${compact ? 'h-6 w-6' : 'h-7 w-7 sm:h-8 sm:w-8'}`}
            strokeWidth={1.75}
          />
        </div>
      </div>

      <h1
        className={`${GM_POPPINS} mx-auto max-w-[18rem] font-bold leading-snug tracking-tight text-slate-900 sm:max-w-none ${
          compact ? 'text-[1.1rem] sm:text-[1.45rem]' : 'text-[1.15rem] sm:text-[1.625rem]'
        }`}
      >
        Sign in to <GatiMitraWord /> Partner
      </h1>
      {!compact ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}
