'use client';

import Image from 'next/image';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

export default function OrderDetailsHeader() {
  const { user } = useSelector((state: RootState) => state.auth);
  const email = user?.email || 'agent@gatimitra.in';
  const initial = email.charAt(0).toUpperCase() || 'G';

  return (
    <header className="sticky top-0 z-[1000] bg-white/95 backdrop-blur border-b border-[#e5e7eb] shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        {/* Logo left */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative h-7 w-[118px] sm:h-8 sm:w-[136px]">
            <Image
              src="/img/logo.png"
              alt="GatiMitra"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>

        {/* User pill right */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gati-primary to-gati-primary-light text-xs font-semibold text-white shadow-[0_1px_4px_rgba(15,23,42,0.25)] sm:h-9 sm:w-9 sm:text-sm">
            {initial}
          </div>
          <p className="max-w-[140px] truncate text-xs font-medium text-gati-text-secondary sm:max-w-[200px] sm:text-sm">
            {email}
          </p>
        </div>
      </div>
    </header>
  );
}
